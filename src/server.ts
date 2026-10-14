import 'dotenv/config';
import { serve } from '@hono/node-server';
import app from './app';

declare const Bun: any;

const port = Number(process.env.PORT) || 5000;

if (typeof Bun !== 'undefined') {
  Bun.serve({
    port,
    fetch: app.fetch,
    idleTimeout: 30,
  });
} else {
  serve({
    fetch: app.fetch,
    port,
  });
}

console.log(`Server running on http://localhost:${port}`);

