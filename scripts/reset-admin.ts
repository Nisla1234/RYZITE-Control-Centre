import 'dotenv/config';
import readline from 'readline';
import crypto from 'crypto';
import { dbGet, dbRun, ensureDatabaseReady, getDbEngine, hashPassword, logAudit } from '../server/db.ts';

function promptText(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    stdout.write(question);

    if (!stdin.isTTY) {
      const rl = readline.createInterface({ input: stdin });
      rl.once('line', (line) => {
        rl.close();
        resolve(line.trim());
      });
      return;
    }

    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    let value = '';
    const onData = (ch: string) => {
      if (ch === '\r' || ch === '\n' || ch === '\u0004') {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', onData);
        stdout.write('\n');
        resolve(value);
      } else if (ch === '\u0003') {
        stdin.setRawMode(false);
        stdout.write('\nCancelled.\n');
        process.exit(1);
      } else if (ch === '\u007f' || ch === '\b') {
        if (value.length > 0) {
          value = value.slice(0, -1);
          stdout.write('\b \b');
        }
      } else {
        value += ch;
        stdout.write('*');
      }
    };

    stdin.on('data', onData);
  });
}

async function main() {
  await ensureDatabaseReady();

  let newUsername = (process.env.RESET_ADMIN_USERNAME || '').trim();
  let newPassword = process.env.RESET_ADMIN_PASSWORD || '';
  const newEmail = (process.env.RESET_ADMIN_EMAIL || '').trim();
  const newName = (process.env.RESET_ADMIN_NAME || '').trim();

  if (!newUsername) {
    newUsername = await promptText('Enter new admin username (3-64 chars): ');
  }
  if (!/^[a-zA-Z0-9._-]{3,64}$/.test(newUsername)) {
    console.error('Error: Username must be 3-64 characters (letters, numbers, ".", "_", "-").');
    process.exit(1);
  }

  if (!newPassword) {
    newPassword = await promptHidden('Enter new admin password (min 10 chars): ');
    const confirm = await promptHidden('Confirm new admin password: ');
    if (newPassword !== confirm) {
      console.error('Error: Passwords do not match.');
      process.exit(1);
    }
  }

  if (newPassword.length < 10) {
    console.error('Error: Password must be at least 10 characters long.');
    process.exit(1);
  }

  const passwordHash = hashPassword(newPassword);
  const existingAdmin = await dbGet<{ id: string; username: string; name: string; email: string }>(
    "SELECT id, username, name, email FROM admin_users WHERE role = 'super_admin' ORDER BY created_at ASC LIMIT 1"
  );

  let targetId: string;
  let targetName: string;

  if (existingAdmin) {
    targetId = existingAdmin.id;
    targetName = newName || existingAdmin.name;
    const targetEmail = newEmail || existingAdmin.email;

    await dbRun(
      'UPDATE admin_users SET username = $1, password_hash = $2, name = $3, email = $4 WHERE id = $5',
      [newUsername, passwordHash, targetName, targetEmail, targetId]
    );
  } else {
    targetId = crypto.randomUUID();
    targetName = newName || 'RYZITE Administrator';
    const targetEmail = newEmail || 'admin@ryzite.com';
    await dbRun(
      `INSERT INTO admin_users (id, username, password_hash, name, email, role, created_at)
       VALUES ($1, $2, $3, $4, $5, 'super_admin', $6)`,
      [targetId, newUsername, passwordHash, targetName, targetEmail, new Date().toISOString()]
    );
  }

  await dbRun('DELETE FROM admin_sessions');
  await dbRun('DELETE FROM login_attempts');

  await logAudit({
    adminUsername: newUsername,
    adminName: targetName,
    action: 'reset_credentials',
    contentType: 'auth',
    recordId: targetId,
    recordTitle: newUsername,
    result: 'success',
    details: `Administrator credentials securely reset via server CLI (${getDbEngine()}). All prior sessions revoked.`,
    ipAddress: 'server-cli',
  });

  console.log(`\nRYZITE Control Centre admin credentials updated successfully (${getDbEngine()}).`);
  console.log(`- New username: ${newUsername}`);
  console.log('- Password hash: updated using scrypt with a new cryptographic salt (not displayed)');
  console.log('- Active sessions revoked and login rate limits cleared.');
  console.log('- All CMS documents, media assets, audit logs, and Sanity content preserved.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Credential reset failed:', err?.message || err);
  process.exit(1);
});
