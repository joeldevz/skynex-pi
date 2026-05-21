import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const modelsPath = '/home/clasing/.pi/agent/models.json';

test('vllm provider advertises local Qwen metadata consistently', async () => {
  const modelsJson = JSON.parse(await readFile(modelsPath, 'utf8'));
  const provider = modelsJson.providers?.vllm;

  assert.equal(provider?.api, 'openai-completions');
  assert.equal(provider?.compat?.supportsDeveloperRole, false);
  assert.equal(provider?.compat?.supportsReasoningEffort, false);

  const model = provider?.models?.find((entry: { id?: string }) => entry.id === 'qwen3.6-27b-nvfp4');
  assert.ok(model, 'expected qwen3.6-27b-nvfp4 model to be configured');
  assert.deepEqual(model.input, ['text']);
});
