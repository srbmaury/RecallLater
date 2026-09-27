#!/usr/bin/env node
// Development proxy for RecallLater's optional AI understanding. Holds the OpenAI key
// so it never ships inside the app. The app sends redacted text only.
//
//   node server/ai-proxy.mjs            (reads OPENAI_API_KEY / OPENAI_MODEL from .env.local)
//   adb reverse tcp:8787 tcp:8787      (so the emulator can reach it)
//
// Deliberately never logs request bodies.
import { createServer } from 'node:http';

import { extract, loadEnv } from './extract.mjs';

await loadEnv();
const { OPENAI_API_KEY: apiKey, OPENAI_MODEL: model = 'gpt-4o-mini', AI_PROXY_PORT: port = '8787' } = process.env;
if (!apiKey) {
  console.error('OPENAI_API_KEY is not set (put it in .env.local).');
  process.exit(1);
}

const MAX_BODY = 32 * 1024;

const server = createServer(async (req, res) => {
  const reply = (status, body) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  if (req.method === 'GET' && req.url === '/health') return reply(200, { ok: true, model });
  if (req.method !== 'POST' || req.url !== '/extract') return reply(404, { error: 'not found' });

  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > MAX_BODY) return reply(413, { error: 'too large' });
  }
  const started = Date.now();
  try {
    const { text, today } = JSON.parse(raw);
    if (typeof text !== 'string' || !text.trim() || typeof today !== 'string') return reply(400, { error: 'text and today required' });
    const result = await extract({ text, today, apiKey, model, signal: AbortSignal.timeout(20_000) });
    console.log(`extract ok in ${Date.now() - started} ms (${text.length} chars) → ${result.type}`);
    reply(200, result);
  } catch (error) {
    console.log(`extract failed in ${Date.now() - started} ms: ${error.message.split(':')[0]}`);
    reply(502, { error: 'extraction failed' });
  }
});

server.listen(Number(port), '127.0.0.1', () => console.log(`RecallLater AI proxy on http://127.0.0.1:${port} (model ${model})`));
