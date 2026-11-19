import 'dotenv/config';
import readline from 'readline';
import crypto from 'crypto';
import { db, hashPassword, initDatabase, logAudit } from '../server/db.ts';

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
  initDatabase();

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
  const existingAdmin = db
    .prepare("SELECT id, username, name, email FROM admin_users WHERE role = 'super_admin' ORDER BY created_at ASC LIMIT 1")
    .get() as { id: string; username: string; name: string; email: string } | undefined;

  let targetId: string;
  let targetName: string;

  const tx = db.transaction(() => {
    if (existingAdmin) {
      targetId = existingAdmin.id;
      targetName = newName || existingAdmin.name;
      const targetEmail = newEmail || existingAdmin.email;

      db.prepare(`
        UPDATE admin_users
        SET username = ?, password_hash = ?, name = ?, email = ?
        WHERE id = ?
      `).run(newUsername, passwordHash, targetName, targetEmail, targetId);
    } else {
      targetId = crypto.randomUUID();
      targetName = newName || 'RYZITE Administrator';
      const targetEmail = newEmail || 'admin@ryzite.com';
      db.prepare(`
        INSERT INTO admin_users (id, username, password_hash, name, email, role, created_at)
        VALUES (?, ?, ?, ?, ?, 'super_admin', ?)
      `).run(targetId, newUsername, passwordHash, targetName, targetEmail, new Date().toISOString());
    }

    // Revoke all active sessions so old sessions cannot remain logged in
    db.prepare('DELETE FROM admin_sessions').run();
    // Clear any brute-force rate-limit locks
    db.prepare('DELETE FROM login_attempts').run();

    logAudit({
      adminUsername: newUsername,
      adminName: targetName,
      action: 'reset_credentials',
      contentType: 'auth',
      recordId: targetId,
      recordTitle: newUsername,
      result: 'success',
      details: 'Administrator credentials securely reset via server CLI. All prior sessions revoked.',
      ipAddress: 'server-cli',
    });
  });

  tx();

  console.log('\nRYZITE Control Centre admin credentials updated successfully.');
  console.log(`- New username: ${newUsername}`);
  console.log('- Password hash: updated using scrypt with a new cryptographic salt (not displayed)');
  console.log('- Active sessions revoked and login rate limits cleared.');
  console.log('- All CMS documents, media assets, audit logs, and Sanity content preserved.');
}

main().catch((err) => {
  console.error('Credential reset failed:', err?.message || err);
  process.exit(1);
});
