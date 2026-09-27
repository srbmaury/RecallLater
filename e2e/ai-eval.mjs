#!/usr/bin/env node
// Runs the captured dataset OCR texts through the AI extractor (redacted exactly as
// the app would) and caches the answers in src/lib/parse/__tests__/fixtures/dataset-ai.json,
// so dataset.test.ts can score rules vs AI vs both offline, without API calls.
//
//   node e2e/ai-eval.mjs            (only calls the API for samples not cached yet)
//   node e2e/ai-eval.mjs --fresh    (re-asks everything, e.g. after a prompt change)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { extract, loadEnv } from '../server/extract.mjs';
import { textForAi } from '../src/lib/ai/redact.ts';

await loadEnv();
const { OPENAI_API_KEY: apiKey, OPENAI_MODEL: model = 'gpt-4o-mini' } = process.env;
if (!apiKey) throw new Error('OPENAI_API_KEY is not set (.env.local)');

const FIXTURES = 'src/lib/parse/__tests__/fixtures';
const target = `${FIXTURES}/dataset-ai.json`;
const samples = ['dataset.json', 'dataset100.json'].flatMap((file) => JSON.parse(readFileSync(`${FIXTURES}/${file}`, 'utf8')));
const cache = existsSync(target) && !process.argv.includes('--fresh') ? JSON.parse(readFileSync(target, 'utf8')) : {};

// The datasets were made on 23 Sep 2026; relative dates resolve against that.
const TODAY = '2026-09-23 (Wednesday)';
const todo = samples.filter((s) => !cache[s.id] && s.text.trim());
console.log(`${todo.length} to ask (${samples.length - todo.length} cached), model ${model}`);

let done = 0;
let failed = 0;
const started = Date.now();
async function worker() {
  while (todo.length) {
    const sample = todo.shift();
    try {
      cache[sample.id] = await extract({ text: textForAi(sample.text), today: TODAY, apiKey, model, signal: AbortSignal.timeout(30_000) });
    } catch (error) {
      failed += 1;
      console.error(`${sample.id}: ${error.message.slice(0, 120)}`);
    }
    done += 1;
    if (done % 20 === 0) console.log(`${done} done`);
  }
}
await Promise.all(Array.from({ length: 6 }, worker));
writeFileSync(target, `${JSON.stringify(cache, null, 2)}\n`);
console.log(`Saved ${Object.keys(cache).length} answers to ${target} (${failed} failed) in ${Math.round((Date.now() - started) / 1000)} s`);
