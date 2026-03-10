#!/usr/bin/env bash
set -euo pipefail

artifact_type="${1:-}"
requirements="${2:-}"
output_path="${3:-}"

if [[ -z "${artifact_type}" || -z "${requirements}" || -z "${output_path}" ]]; then
  echo "usage: runprompt_generate_artifact.sh <artifact_type> <requirements> <output_path>" >&2
  exit 2
fi

case "${artifact_type}" in
  script|mcp-shell-yaml|runprompt-prompt)
    ;;
  *)
    echo "artifact_type must be one of: script, mcp-shell-yaml, runprompt-prompt" >&2
    exit 2
    ;;
esac

if ! command -v runprompt >/dev/null 2>&1; then
  echo "runprompt command not found in PATH" >&2
  exit 127
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
prompt_file="${script_dir}/../prompts/runprompt/generate_artifact.prompt"

if [[ ! -f "${prompt_file}" ]]; then
  echo "prompt file not found: ${prompt_file}" >&2
  exit 2
fi

mkdir -p "$(dirname "${output_path}")"

input_json="$(python3 -c 'import json,sys; print(json.dumps({"artifact_type": sys.argv[1], "requirements": sys.argv[2]}, ensure_ascii=False))' "${artifact_type}" "${requirements}")"

generated_content="$(runprompt "${prompt_file}" "${input_json}")"
printf '%s\n' "${generated_content}" > "${output_path}"
printf 'generated:%s\n' "${output_path}"
