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

is_truthy() {
  local value="${1:-}"
  local normalized
  normalized="$(printf '%s' "${value}" | tr '[:upper:]' '[:lower:]')"
  case "${normalized}" in
    1|true|yes|on)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

normalize_runprompt_env() {
  if [[ -n "${RUNPROMPT_MODEL:-}" && -z "${MODEL:-}" ]]; then
    export MODEL="${RUNPROMPT_MODEL}"
  fi

  if [[ -n "${RUNPROMPT_BASE_URL:-}" ]]; then
    if [[ -z "${BASE_URL:-}" ]]; then
      export BASE_URL="${RUNPROMPT_BASE_URL}"
    fi
    if [[ -z "${OPENAI_BASE_URL:-}" ]]; then
      export OPENAI_BASE_URL="${RUNPROMPT_BASE_URL}"
    fi
    if [[ -z "${OPENAI_API_BASE:-}" ]]; then
      export OPENAI_API_BASE="${RUNPROMPT_BASE_URL}"
    fi
  fi

  if [[ -n "${RUNPROMPT_OPENROUTER_API_KEY:-}" ]]; then
    if [[ -z "${OPENROUTER_API_KEY:-}" ]]; then
      export OPENROUTER_API_KEY="${RUNPROMPT_OPENROUTER_API_KEY}"
    fi
    if [[ -z "${API_KEY:-}" ]]; then
      export API_KEY="${RUNPROMPT_OPENROUTER_API_KEY}"
    fi
    if [[ -z "${OPENAI_API_KEY:-}" ]]; then
      export OPENAI_API_KEY="${RUNPROMPT_OPENROUTER_API_KEY}"
    fi
  fi
}

if ! command -v runprompt >/dev/null 2>&1; then
  echo "runprompt command not found in PATH" >&2
  exit 127
fi

normalize_runprompt_env

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

normalize_runprompt_prompt_output() {
  local content="$1"
  printf '%s' "${content}" | python3 -c '
import sys
import re

text = sys.stdin.read()
text_without_fences = re.sub(r"(?m)^```[^\n]*\n?", "", text)
lines = text_without_fences.splitlines()

start_index = None
second_delim_index = None
for index, line in enumerate(lines):
  if line.strip() != "---":
    continue
  if start_index is None:
    start_index = index
    continue
  second_delim_index = index
  break

if start_index is not None and second_delim_index is not None:
  normalized = "\n".join(lines[start_index:]).strip("\n")
  print(normalized, end="")
else:
  print(text_without_fences.strip("\n"), end="")
'
}

debug_print_rendered_prompt() {
  local prompt_file_path="$1"
  local current_artifact_type="$2"
  local current_requirements="$3"
  local current_type_spec="$4"

  python3 - "${prompt_file_path}" "${current_artifact_type}" "${current_requirements}" "${current_type_spec}" <<'PY' >&2
import sys
from pathlib import Path

prompt_path = Path(sys.argv[1])
artifact_type = sys.argv[2]
requirements = sys.argv[3]
type_spec = sys.argv[4]

template = prompt_path.read_text(encoding="utf-8")
rendered = (
    template.replace("{{artifact_type}}", artifact_type)
    .replace("{{requirements}}", requirements)
    .replace("{{type_spec}}", type_spec)
)

print("=== runprompt debug: rendered prompt begin ===")
print(rendered)
print("=== runprompt debug: rendered prompt end ===")
PY
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

mkdir -p "$(dirname "${output_path}")"
type_spec="$(cat "${type_spec_file}")"

debug_mode_enabled=0
if is_truthy "${RUNPROMPT_DEBUG_PROMPT:-}"; then
  debug_mode_enabled=1
  debug_print_rendered_prompt "${prompt_file}" "${artifact_type}" "${requirements}" "${type_spec}"
fi

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

if (( debug_mode_enabled == 1 )); then
  generated_content="$(runprompt -v "${prompt_file}" "${input_json}")"
else
  generated_content="$(runprompt "${prompt_file}" "${input_json}")"
fi

if [[ "${artifact_type}" == "runprompt-prompt" ]]; then
  generated_content="$(normalize_runprompt_prompt_output "${generated_content}")"
  validate_runprompt_prompt_output "${generated_content}"
fi

printf '%s\n' "${generated_content}" > "${output_path}"
printf 'generated:%s\n' "${output_path}"
