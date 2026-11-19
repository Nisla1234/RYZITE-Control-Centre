import { createApiApp } from '../server/app.ts';

const app = createApiApp();

export const config = {
  api: {
    bodyParser: false,
  },
};

export default app;
