import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Vercel's Node runtime may have already buffered the request body onto
 * `req.body`; if it hasn't, the request is still an unread readable stream.
 */
export async function readBody(req: IncomingMessage & { body?: unknown }): Promise<Buffer> {
  if (Buffer.isBuffer(req.body)) return req.body;
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}
