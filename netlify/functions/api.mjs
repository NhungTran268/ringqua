import { handle } from './lib/app.mjs';

export default async (req) => handle(req);

export const config = { path: '/api/*' };
