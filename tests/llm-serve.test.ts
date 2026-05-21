import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const fixturePath = new URL('./fixtures/llm-serve.expected.sh', import.meta.url);
const installedScriptPath = '/home/clasing/.local/bin/llm-serve';
const defaultModel = 'unsloth/Qwen3.6-27B-NVFP4';

async function readable(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function scriptCases(): Promise<Array<{ name: string; script: string }>> {
  const cases = [
    {
      name: 'committed fixture template',
      script: await readFile(fixturePath, 'utf8'),
    },
  ];

  if (await readable(installedScriptPath)) {
    cases.push({
      name: 'local installed llm-serve script',
      script: await readFile(installedScriptPath, 'utf8'),
    });
  }

  return cases;
}

test('llm-serve script shape is secure while preserving Pi/vLLM defaults', async (t) => {
  for (const { name, script } of await scriptCases()) {
    await t.test(name, () => {
      assert.match(script, /--enable-auto-tool-choice\s*\\/);
      assert.match(script, /--tool-call-parser\s+qwen3_xml\s*\\/);

      assert.match(script, /RTX 5090/);
      assert.match(script, /--kv-cache-dtype\s+fp8\s*\\/);
      assert.match(script, /--served-model-name\s+qwen3\.6-27b-nvfp4\s*\\/);

      assert.match(script, new RegExp(`DEFAULT_MODEL="${defaultModel.replaceAll('.', '\\.')}`));
      assert.match(script, /HOST="\$\{LLM_SERVE_HOST:-127\.0\.0\.1\}"/);
      assert.match(script, /--host\s+"\$HOST"\s*\\/);
      assert.doesNotMatch(script, /--host\s+0\.0\.0\.0/);

      assert.match(script, /TRUST_REMOTE_CODE_ARGS=\(\)/);
      assert.match(script, /LLM_SERVE_TRUST_REMOTE_CODE/);
      assert.doesNotMatch(script, /"\$MODEL"\s+==\s+"\$DEFAULT_MODEL"/);
      assert.match(script, /LLM_SERVE_MODEL_REVISION/);
      assert.match(script, /LLM_SERVE_MODEL_REVISION must be set/);
      assert.match(script, /--trust-remote-code\s+--revision\s+"\$LLM_SERVE_MODEL_REVISION"/);
      assert.match(script, /"\$\{TRUST_REMOTE_CODE_ARGS\[@\]\}"\s*\\/);
      assert.doesNotMatch(script, /\n\s*--trust-remote-code\s*\\/);

      assert.match(script, /API_KEY_ARGS=\(\)/);
      assert.match(script, /LLM_SERVE_API_KEY/);
      assert.match(script, /LLM_SERVE_API_KEY must be set/);
      assert.match(script, /--api-key\s+"\$LLM_SERVE_API_KEY"/);
      assert.match(script, /"\$\{API_KEY_ARGS\[@\]\}"\s*\\/);
      assert.match(script, /\[\[ "\$HOST" != "127\.0\.0\.1" && "\$HOST" != "localhost" \]\]/);
    });
  }
});
