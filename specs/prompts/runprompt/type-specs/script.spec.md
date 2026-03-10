# Artifact Spec: script

Generate a single executable Bash script file.

Required format:
1. First line MUST be exactly: `#!/usr/bin/env bash`
2. Second non-empty line MUST include: `set -euo pipefail`
3. Output MUST be plain script text only (no markdown fences, no explanation).
4. Use POSIX-compatible shell style where practical; if Bash-specific syntax is needed, keep it explicit.
5. Validate all external input parameters before use.
6. Quote variable expansions safely unless intentionally unquoted.
7. Exit with non-zero code on unrecoverable errors and print errors to stderr.
8. Avoid destructive operations unless the requirement explicitly demands them.
