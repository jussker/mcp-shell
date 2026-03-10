#!/usr/bin/env bash
set -euo pipefail

artifact_type="${1:-}"
requirements="${2:-}"

if [[ -z "${artifact_type}" || -z "${requirements}" ]]; then
  echo "usage: runprompt_generate_artifact.sh <artifact_type> <requirements>" >&2
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

if [[ -z "${MCP_SHELL_SPEC_DIR:-}" ]]; then
  echo "MCP_SHELL_SPEC_DIR is not configured. Please set MCP_SHELL_SPEC_DIR to an existing spec directory." >&2
  exit 2
fi

resolve_output_path() {
  python3 - "${MCP_SHELL_SPEC_DIR}" "${artifact_type}" <<'PY'
import datetime
import sys
from pathlib import Path

spec_dir = Path(sys.argv[1]).resolve(strict=False)
artifact_type = sys.argv[2]

mapping = {
    "script": ("generated-artifacts/scripts", "sh"),
    "mcp-shell-yaml": ("generated-artifacts/mcp-shell-yaml", "yaml"),
    "runprompt-prompt": ("generated-artifacts/runprompt-prompts", "prompt"),
}
subdir, ext = mapping[artifact_type]

ts = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
output_path = spec_dir / subdir / f"artifact-{ts}.{ext}"
output_path.parent.mkdir(parents=True, exist_ok=True)
print(output_path)
PY
}

output_path="$(resolve_output_path)"

if ! command -v runprompt >/dev/null 2>&1; then
  echo "runprompt command not found in PATH" >&2
  exit 127
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
prompt_file="${script_dir}/../prompts/runprompt/generate_artifact.prompt"
type_specs_dir="${script_dir}/../prompts/runprompt/type-specs"

validate_runprompt_prompt_output() {
  local content="$1"
  if [[ -z "${content}" ]]; then
    echo "runprompt output is empty for runprompt-prompt" >&2
    return 2
  fi

  if printf '%s\n' "${content}" | grep -q '```'; then
    echo "runprompt-prompt output must not contain markdown fences" >&2
    return 2
  fi

  if [[ "${content}" != '---'* ]]; then
    echo "runprompt-prompt output must start with YAML frontmatter (---)" >&2
    return 2
  fi

  local second_delim_line
  second_delim_line="$(printf '%s\n' "${content}" | awk 'NR>1 && $0=="---"{print NR; exit}')"
  if [[ -z "${second_delim_line}" ]]; then
    echo "runprompt-prompt output must contain closing YAML frontmatter delimiter (---)" >&2
    return 2
  fi
  if (( second_delim_line < 2 )); then
    echo "runprompt-prompt frontmatter delimiter positions are invalid" >&2
    return 2
  fi

  if ! printf '%s\n' "${content}" | sed -n "2,$((second_delim_line - 1))p" | grep -Eq '^model:[[:space:]]*[^[:space:]]'; then
    echo "runprompt-prompt frontmatter must include a non-empty model key" >&2
    return 2
  fi

  if [[ -z "$(printf '%s\n' "${content}" | sed -n "$((second_delim_line + 1)),\$p" | grep -E '[^[:space:]]' | head -n1)" ]]; then
    echo "runprompt-prompt output must include non-empty template body after frontmatter" >&2
    return 2
  fi
}

if [[ ! -f "${prompt_file}" ]]; then
  echo "prompt file not found: ${prompt_file}" >&2
  exit 2
fi

case "${artifact_type}" in
  script)
    type_spec_file="${type_specs_dir}/script.spec.md"
    ;;
  mcp-shell-yaml)
    type_spec_file="${type_specs_dir}/mcp-shell-yaml.spec.md"
    ;;
  runprompt-prompt)
    type_spec_file="${type_specs_dir}/runprompt-prompt.spec.md"
    ;;
  *)
    echo "unsupported artifact_type for type spec lookup: ${artifact_type}" >&2
    exit 2
    ;;
esac

if [[ ! -f "${type_spec_file}" ]]; then
  echo "artifact type spec file not found: ${type_spec_file}" >&2
  exit 2
fi

if [[ -n "${MODEL:-}" && -z "${RUNPROMPT_MODEL:-}" ]]; then
  export RUNPROMPT_MODEL="${MODEL}"
fi

if [[ -n "${BASE_URL:-}" && -z "${RUNPROMPT_BASE_URL:-}" && -z "${OPENAI_BASE_URL:-}" && -z "${OPENAI_API_BASE:-}" ]]; then
  export RUNPROMPT_BASE_URL="${BASE_URL}"
fi

if [[ -n "${OPENROUTER_API_KEY:-}" && -z "${RUNPROMPT_OPENROUTER_API_KEY:-}" ]]; then
  export RUNPROMPT_OPENROUTER_API_KEY="${OPENROUTER_API_KEY}"
fi

if [[ -n "${API_KEY:-}" && -z "${RUNPROMPT_OPENROUTER_API_KEY:-}" && -z "${OPENROUTER_API_KEY:-}" ]]; then
  export RUNPROMPT_OPENROUTER_API_KEY="${API_KEY}"
fi

mkdir -p "$(dirname "${output_path}")"
type_spec="$(cat "${type_spec_file}")"

input_json="$(python3 - "${artifact_type}" "${requirements}" "${type_spec}" <<'PY'
import json
import sys

artifact_type = sys.argv[1]
requirements = sys.argv[2]
type_spec = sys.argv[3]
print(
    json.dumps(
        {
            "artifact_type": artifact_type,
            "requirements": requirements,
            "type_spec": type_spec,
        },
        ensure_ascii=False,
    )
)
PY
)"

generated_content="$(runprompt "${prompt_file}" "${input_json}")"

if [[ "${artifact_type}" == "runprompt-prompt" ]]; then
  validate_runprompt_prompt_output "${generated_content}"
fi

printf '%s\n' "${generated_content}" > "${output_path}"
printf 'generated:%s\n' "${output_path}"
