import app from './app';

declare const Bun: any;

Bun.serve({
  port: Number(process.env.PORT) || 3000,
  fetch: app.fetch,
  idleTimeout: 30,
});

console.log('Server running on http://localhost:' + (Number(process.env.PORT) || 3000));
