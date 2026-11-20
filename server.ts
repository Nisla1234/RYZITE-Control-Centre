import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { createApiApp } from './server/app.ts';
import { ensureDatabaseReady } from './server/db.ts';

async function startServer() {
  await ensureDatabaseReady();

  const app = createApiApp();
  const PORT = Number(process.env.PORT || 3000);

  // Admin-only application: always redirect root URL to /admin/
  app.get('/', (_req, res) => {
    res.redirect(302, '/admin/');
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`RYZITE Control Centre running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
