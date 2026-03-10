import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { executeFromSpec } from "../src/executor.js";
import { loadSpecs } from "../src/spec-loader.js";

const repoRoot = path.resolve(process.cwd());

async function loadRunpromptSpec() {
  const specs = await loadSpecs(path.join(repoRoot, "specs"));
  const spec = specs.find((item) => item.tool.name === "runprompt__generate_artifact");
  assert.ok(spec, "runprompt__generate_artifact spec should exist");
  assert.ok(!("model" in spec.tool.input.properties));
  assert.ok(!("base_url" in spec.tool.input.properties));
  assert.ok(!("openrouter_api_key" in spec.tool.input.properties));
  return spec;
}

test("runprompt template references per-type specification", async () => {
  const promptFile = path.join(repoRoot, "specs", "prompts", "runprompt", "generate_artifact.prompt");
  const scriptSpec = path.join(repoRoot, "specs", "prompts", "runprompt", "type-specs", "script.spec.md");
  const yamlSpec = path.join(repoRoot, "specs", "prompts", "runprompt", "type-specs", "mcp-shell-yaml.spec.md");
  const promptSpec = path.join(repoRoot, "specs", "prompts", "runprompt", "type-specs", "runprompt-prompt.spec.md");

  const promptText = await readFile(promptFile, "utf8");
  assert.match(promptText, /\{\{type_spec\}\}/);

  const [scriptText, yamlText, runpromptText] = await Promise.all([
    readFile(scriptSpec, "utf8"),
    readFile(yamlSpec, "utf8"),
    readFile(promptSpec, "utf8"),
  ]);

  assert.match(scriptText, /Artifact Spec: script/);
  assert.match(yamlText, /Artifact Spec: mcp-shell-yaml/);
  assert.match(runpromptText, /runprompt-prompt/);
  assert.match(runpromptText, /frontmatter/i);
  assert.match(runpromptText, /Handlebars/i);
  assert.match(runpromptText, /include `model` key/i);
});

test("runprompt wrapper injects the selected type spec into runprompt input", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mcp-shell-runprompt-"));
  const mockBinDir = path.join(tempDir, "bin");
  const outputPath = path.join(tempDir, "out", "generated.txt");

  await mkdir(mockBinDir, { recursive: true });
  const mockRunpromptPath = path.join(mockBinDir, "runprompt");
  await writeFile(
    mockRunpromptPath,
    "#!/usr/bin/env bash\nset -euo pipefail\nprintf '%s\\n' \"${2:-}\"\n",
    "utf8",
  );
  await chmod(mockRunpromptPath, 0o755);

  const spec = await loadRunpromptSpec();
  const originalPath = process.env.PATH ?? "";
  process.env.PATH = `${mockBinDir}:${originalPath}`;

  try {
    const result = await executeFromSpec(spec, {
      artifact_type: "script",
      requirements: "generate a safe cleanup script",
      output_path: outputPath,
    });

    assert.equal(result.status, "success");

    const outputContent = await readFile(outputPath, "utf8");
    const payload = JSON.parse(outputContent);

    assert.equal(payload.artifact_type, "script");
    assert.equal(payload.requirements, "generate a safe cleanup script");
    assert.match(payload.type_spec, /Artifact Spec: script/);
    assert.match(payload.type_spec, /set -euo pipefail/);
  } finally {
    process.env.PATH = originalPath;
  }
});

test("runprompt wrapper supports env-based model/base_url/api_key configuration", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mcp-shell-runprompt-"));
  const mockBinDir = path.join(tempDir, "bin");
  const outputPath = path.join(tempDir, "out", "generated.txt");

  await mkdir(mockBinDir, { recursive: true });
  const mockRunpromptPath = path.join(mockBinDir, "runprompt");
  await writeFile(
    mockRunpromptPath,
    "#!/usr/bin/env bash\nset -euo pipefail\nprintf '{\"model\":\"%s\",\"base_url\":\"%s\",\"api_key\":\"%s\"}\\n' \"${RUNPROMPT_MODEL:-}\" \"${RUNPROMPT_BASE_URL:-}\" \"${RUNPROMPT_OPENROUTER_API_KEY:-}\"\n",
    "utf8",
  );
  await chmod(mockRunpromptPath, 0o755);

  const spec = await loadRunpromptSpec();
  const originalPath = process.env.PATH ?? "";
  const originalModel = process.env.MODEL;
  const originalBaseUrl = process.env.BASE_URL;
  const originalApiKey = process.env.API_KEY;
  process.env.PATH = `${mockBinDir}:${originalPath}`;
  process.env.MODEL = "openrouter/deepseek/deepseek-v3.2";
  process.env.BASE_URL = "https://openrouter.ai/api/v1";
  process.env.API_KEY = "test-api-key";

  try {
    const result = await executeFromSpec(spec, {
      artifact_type: "script",
      requirements: "generate a shell script",
      output_path: outputPath,
    });

    assert.equal(result.status, "success");
    const outputContent = await readFile(outputPath, "utf8");
    const payload = JSON.parse(outputContent);
    assert.equal(payload.model, "openrouter/deepseek/deepseek-v3.2");
    assert.equal(payload.base_url, "https://openrouter.ai/api/v1");
    assert.equal(payload.api_key, "test-api-key");
  } finally {
    process.env.PATH = originalPath;

    if (originalModel === undefined) {
      delete process.env.MODEL;
    } else {
      process.env.MODEL = originalModel;
    }
    if (originalBaseUrl === undefined) {
      delete process.env.BASE_URL;
    } else {
      process.env.BASE_URL = originalBaseUrl;
    }
    if (originalApiKey === undefined) {
      delete process.env.API_KEY;
    } else {
      process.env.API_KEY = originalApiKey;
    }
  }
});

test("runprompt wrapper rejects invalid dotprompt output for runprompt-prompt artifact", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mcp-shell-runprompt-"));
  const mockBinDir = path.join(tempDir, "bin");
  const outputPath = path.join(tempDir, "out", "invalid.prompt");

  await mkdir(mockBinDir, { recursive: true });
  const mockRunpromptPath = path.join(mockBinDir, "runprompt");
  await writeFile(
    mockRunpromptPath,
    "#!/usr/bin/env bash\nset -euo pipefail\nprintf 'not-a-dotprompt\\n'\n",
    "utf8",
  );
  await chmod(mockRunpromptPath, 0o755);

  const spec = await loadRunpromptSpec();
  const originalPath = process.env.PATH ?? "";
  process.env.PATH = `${mockBinDir}:${originalPath}`;

  try {
    const result = await executeFromSpec(spec, {
      artifact_type: "runprompt-prompt",
      requirements: "create a dotprompt",
      output_path: outputPath,
    });

    assert.equal(result.status, "error");
    assert.match(result.stderr, /must start with YAML frontmatter/i);
  } finally {
    process.env.PATH = originalPath;
  }
});

test("runprompt wrapper accepts valid dotprompt output and writes file", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mcp-shell-runprompt-"));
  const mockBinDir = path.join(tempDir, "bin");
  const outputPath = path.join(tempDir, "out", "valid.prompt");

  await mkdir(mockBinDir, { recursive: true });
  const mockRunpromptPath = path.join(mockBinDir, "runprompt");
  await writeFile(
    mockRunpromptPath,
    "#!/usr/bin/env bash\nset -euo pipefail\ncat <<'PROMPT'\n---\nmodel: openrouter/deepseek/deepseek-v3.2\ninput:\n  schema:\n    text: string\noutput:\n  format: text\n---\nSummarize: {{text}}\nPROMPT\n",
    "utf8",
  );
  await chmod(mockRunpromptPath, 0o755);

  const spec = await loadRunpromptSpec();
  const originalPath = process.env.PATH ?? "";
  process.env.PATH = `${mockBinDir}:${originalPath}`;

  try {
    const result = await executeFromSpec(spec, {
      artifact_type: "runprompt-prompt",
      requirements: "create a dotprompt",
      output_path: outputPath,
    });

    assert.equal(result.status, "success");
    const outputContent = await readFile(outputPath, "utf8");
    assert.match(outputContent, /^---[\s\S]*?\nmodel:\s+/);
    assert.match(outputContent, /\n---\nSummarize: \{\{text\}\}/);
  } finally {
    process.env.PATH = originalPath;
  }
});
