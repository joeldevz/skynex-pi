import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const docPath = new URL('../docs/vllm-pi-smoke-test.md', import.meta.url);

test('vLLM Pi smoke-test doc covers repeatable tool-calling checks', async () => {
  const doc = await readFile(docPath, 'utf8');

  assert.match(doc, /llm-stop && llm-serve/);
  assert.match(doc, /qwen3\.6-27b-nvfp4/);
  assert.match(doc, /no\s+400\s+error/i);
  assert.match(doc, /tool_choice/i);
  assert.match(doc, /LLM_SERVE_TRUST_REMOTE_CODE=1/);
  assert.match(doc, /LLM_SERVE_MODEL_REVISION=<reviewed sha>/);

  assert.match(doc, /curl http:\/\/127\.0\.0\.1:8000\/v1\/chat\/completions/);
  assert.match(doc, /"tools"\s*:\s*\[/);
  assert.match(doc, /"tool_choice"\s*:\s*"auto"/);
});
