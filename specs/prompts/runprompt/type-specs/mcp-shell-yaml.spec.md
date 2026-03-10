# Artifact Spec: mcp-shell-yaml

Generate one valid mcp-shell tool YAML document.

Required format:
1. Root keys MUST include: `apiVersion`, `tool`, `execution`.
2. `apiVersion` MUST be `v1`.
3. `tool.name` MUST be a snake-like MCP tool name and globally unique in intent.
4. `tool.description` MUST be a valid TSDoc block comment (`/** ... */`).
5. `tool.input.properties` MUST define each input parameter type.
6. `tool.output` MUST be an object with standard execution fields (`status`, `exit_code`, `stdout`, `stderr`, `command`, `execution_time_ms`).
7. `execution` MUST define exactly one of `command` or `script`.
8. Template parameters MUST use `{{param_name}}` form.
9. Output MUST be raw YAML only (no markdown fences, no explanation).
