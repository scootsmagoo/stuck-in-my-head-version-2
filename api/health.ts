import type { IncomingMessage, ServerResponse } from 'node:http';
import { health } from '../server/src/recognize.js';
import { sendJson } from './_http.js';

export default function handler(_req: IncomingMessage, res: ServerResponse): void {
  sendJson(res, 200, health());
}
