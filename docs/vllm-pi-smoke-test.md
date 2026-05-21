# Pi/vLLM tool-calling smoke test

Use this manual smoke test after changing local vLLM startup flags, Pi model/provider configuration, or tool-calling behavior.

## 1. Restart vLLM

```bash
llm-stop && llm-serve
```

Wait until vLLM reports that the OpenAI-compatible server is listening on `127.0.0.1:8000`.

`llm-serve` does not enable remote Hugging Face model code by default. If the selected model requires remote code, review and pin a specific model revision before starting vLLM:

```bash
LLM_SERVE_TRUST_REMOTE_CODE=1 LLM_SERVE_MODEL_REVISION=<reviewed sha> llm-serve
```

When serving on a non-local host with `LLM_SERVE_HOST`, also set `LLM_SERVE_API_KEY`; localhost/`127.0.0.1` does not require an API key.

## 2. Select the Pi model/provider

In Pi, select the local vLLM provider and the model:

- provider: `vllm`
- model: `qwen3.6-27b-nvfp4`

## 3. Run a tool-using Pi prompt

Ask Pi a prompt that gives it a reason to inspect or call tools, for example:

```text
What tools can you call? If useful, call one.
```

Expected result: there is no 400 error for `tool_choice`, and the model may call tools.

## 4. Direct API sanity check

You can also verify the same request shape directly against vLLM:

```bash
curl http://127.0.0.1:8000/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "qwen3.6-27b-nvfp4",
    "messages": [{"role":"user","content":"What tools can you call?"}],
    "tools": [{
      "type": "function",
      "function": {
        "name": "echo",
        "description": "Echo text",
        "parameters": {
          "type": "object",
          "properties": {"text": {"type": "string"}},
          "required": ["text"]
        }
      }
    }],
    "tool_choice": "auto"
  }'
```

Expected result: no 400 error mentioning `tool_choice`; the response succeeds and the model may either answer normally or emit a tool call.
