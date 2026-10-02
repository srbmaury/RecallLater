// Deterministic, local-only AI stand-in for review-regressions.sh. No keys or provider calls.
import { createServer } from 'node:http';

createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/extract') {
    res.writeHead(404).end();
    return;
  }
  for await (const _ of req) { /* synthetic fixture body only; never logged */ }
  setTimeout(() => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ type: 'bill', title: 'Electricity Bill', amount: 2840, dueDate: '2030-09-28', confidence: 0.9 }));
  }, 15000);
}).listen(8788, '127.0.0.1');
