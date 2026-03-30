import { Hono } from 'hono';
import { subscribe } from './newsletter.controller';

const router = new Hono();

router.post('/subscribe', subscribe);

export default router;
