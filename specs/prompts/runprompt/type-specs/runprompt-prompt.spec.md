# Artifact Spec: runprompt-prompt (dotprompt-compatible)

Goal: produce one valid executable Dotprompt `.prompt` file.

Required structure:
1. File MUST start with YAML frontmatter and opening `---` on line 1.
2. Frontmatter MUST be closed by another `---` line before the template body.
3. Frontmatter MUST include `model` key.
4. The template body MUST exist after frontmatter (non-empty prompt text).
5. Output MUST be plain prompt file text only (no markdown fences, no explanation).

Frontmatter rules (Dotprompt-aligned):
- Allowed top-level keys include: `name`, `variant`, `model`, `tools`, `config`, `input`, `output`, `metadata`.
- When `input` is present, prefer `input.schema` using picoschema-style fields (for example: `text: string`).
- When `output` is present:
  - `output.format` SHOULD be `json` or `text`.
  - If `output.format: json`, include `output.schema`.

Template rules (Dotprompt/Handlebars-aligned):
- Variable interpolation: `{{var}}`, nested path: `{{obj.key}}`.
- Conditionals: `{{#if x}}...{{else}}...{{/if}}`, `{{#unless x}}...{{/unless}}`.
- Iteration: `{{#each items}}...{{/each}}`.
- Use only valid Handlebars syntax; avoid custom helpers unless explicitly required.

Compatibility constraints for mcp-shell runprompt flow:
- Prefer variables that can be passed through JSON input fields.
- If generating structured output, keep schema and body instructions consistent.
