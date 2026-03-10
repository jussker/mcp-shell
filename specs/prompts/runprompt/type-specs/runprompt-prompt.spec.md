# Artifact Spec: runprompt-prompt (merged from dotprompt references)

Goal: produce one valid `.prompt` file compatible with runprompt and aligned with Dotprompt concepts.

Required structure:
1. File SHOULD start with YAML frontmatter between two `---` lines.
2. The template body MUST appear after frontmatter.
3. Output MUST be plain prompt file text only (no markdown fences, no explanation).

Frontmatter guidance (Dotprompt-aligned):
- Common optional keys: `name`, `variant`, `model`, `tools`, `config`, `input`, `output`, `metadata`.
- `input.schema` and `output.schema` SHOULD use picoschema-style fields when structured typing is needed.
- `output.format` may be `json` or `text`.

Template guidance (Dotprompt-aligned Handlebars subset):
- Variable interpolation: `{{var}}`, nested path: `{{obj.key}}`
- Conditionals: `{{#if x}}...{{else}}...{{/if}}`, `{{#unless x}}...{{/unless}}`
- Iteration: `{{#each items}}...{{/each}}`
- Keep syntax valid and minimal; avoid unsupported custom helpers unless explicitly required.

Compatibility constraints for runprompt usage:
- Prefer variables that can be supplied by runprompt (`ARGS`, `STDIN`, `INPUT`) or JSON input fields.
- If structured output is requested, include `output.format: json` and a clear `output.schema`.
