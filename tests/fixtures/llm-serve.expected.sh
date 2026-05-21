#!/usr/bin/env bash
# llm-serve - Launch vLLM with Qwen3.6-27B-NVFP4 optimized for RTX 5090 (sm_120 Blackwell)
#
# Default model: unsloth/Qwen3.6-27B-NVFP4 (~24GB, ~59 t/s single-stream)
#
# Usage:
#   llm-serve                              # serve default model
#   llm-serve <model_id>                   # serve other HF model
#   llm-serve <model_id> --max-model-len 4096   # extra args
set -euo pipefail

DEFAULT_MODEL="unsloth/Qwen3.6-27B-NVFP4"
MODEL="${1:-$DEFAULT_MODEL}"
HOST="${LLM_SERVE_HOST:-127.0.0.1}"

TRUST_REMOTE_CODE_ARGS=()
if [[ "${LLM_SERVE_TRUST_REMOTE_CODE:-}" == "1" || "${LLM_SERVE_TRUST_REMOTE_CODE:-}" == "true" ]]; then
    if [[ -z "${LLM_SERVE_MODEL_REVISION:-}" ]]; then
        echo "error: LLM_SERVE_MODEL_REVISION must be set when LLM_SERVE_TRUST_REMOTE_CODE is enabled" >&2
        exit 1
    fi
    TRUST_REMOTE_CODE_ARGS=(--trust-remote-code --revision "$LLM_SERVE_MODEL_REVISION")
fi

API_KEY_ARGS=()
if [[ "$HOST" != "127.0.0.1" && "$HOST" != "localhost" ]]; then
    if [[ -z "${LLM_SERVE_API_KEY:-}" ]]; then
        echo "error: LLM_SERVE_API_KEY must be set when LLM_SERVE_HOST is non-loopback" >&2
        exit 1
    fi
    API_KEY_ARGS=(--api-key "$LLM_SERVE_API_KEY")
fi

# Activate venv
source /mnt/games/ai-models/venvs/vllm/bin/activate

# Critical envs for RTX 5090 (sm_120 Blackwell)
export HF_HOME=/mnt/games/ai-models/huggingface
export HF_XET_HIGH_PERFORMANCE=1
export TORCH_CUDA_ARCH_LIST="12.0"
export CUDA_DEVICE_ORDER=PCI_BUS_ID
export PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True

echo "==> Launching vLLM serving $MODEL on RTX 5090 (sm_120)"
echo "    OpenAI-compatible API → http://$HOST:8000/v1"
echo "    Stop with: llm-stop"
echo ""

exec vllm serve "$MODEL" \
    --host "$HOST" \
    --port 8000 \
    --gpu-memory-utilization 0.93 \
    --max-model-len 32768 \
    --max-num-seqs 4 \
    --kv-cache-dtype fp8 \
    --enable-prefix-caching \
    --served-model-name qwen3.6-27b-nvfp4 \
    "${TRUST_REMOTE_CODE_ARGS[@]}" \
    "${API_KEY_ARGS[@]}" \
    --enable-auto-tool-choice \
    --tool-call-parser qwen3_xml \
    --limit-mm-per-prompt '{"image":0,"video":0}' \
    --compilation-config '{"cudagraph_capture_sizes":[1,2,4],"max_cudagraph_capture_size":4}' \
    "${@:2}"
