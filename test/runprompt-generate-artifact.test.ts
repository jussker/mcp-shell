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
  assert.ok(spec.execution.env);
  assert.ok(Object.prototype.hasOwnProperty.call(spec.execution.env, "static"));
  assert.deepEqual(spec.execution.env.static, {});
  assert.deepEqual(spec.execution.env.fromRuntime, {
    RUNPROMPT_MODEL: ["RUNPROMPT_MODEL", "MODEL"],
    RUNPROMPT_BASE_URL: ["RUNPROMPT_BASE_URL", "OPENAI_BASE_URL", "OPENAI_API_BASE", "BASE_URL"],
    RUNPROMPT_OPENROUTER_API_KEY: ["RUNPROMPT_OPENROUTER_API_KEY", "OPENROUTER_API_KEY", "API_KEY"],
  });
  assert.ok(!("model" in spec.tool.input.properties));
  assert.ok(!("base_url" in spec.tool.input.properties));
  assert.ok(!("openrouter_api_key" in spec.tool.input.properties));
  assert.ok(!("output_path" in spec.tool.input.properties));
  return spec;
}

function extractGeneratedPath(stdout: unknown): string {
  const text = String(stdout ?? "");
  const match = text.match(/^generated:(.+)$/m);
  assert.ok(match, "stdout should include generated:<path>");
  return match[1].trim();
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
  const originalSpecDir = process.env.MCP_SHELL_SPEC_DIR;
  process.env.PATH = `${mockBinDir}:${originalPath}`;
  process.env.MCP_SHELL_SPEC_DIR = tempDir;

  try {
    const result = await executeFromSpec(spec, {
      artifact_type: "script",
      requirements: "generate a safe cleanup script",
    });

    assert.equal(result.status, "success");

    const outputPath = extractGeneratedPath(result.stdout);
    const outputContent = await readFile(outputPath, "utf8");
    const payload = JSON.parse(outputContent);

    assert.equal(payload.artifact_type, "script");
    assert.equal(payload.requirements, "generate a safe cleanup script");
    assert.match(payload.type_spec, /Artifact Spec: script/);
    assert.match(payload.type_spec, /set -euo pipefail/);
  } finally {
    process.env.PATH = originalPath;
    if (originalSpecDir === undefined) {
      delete process.env.MCP_SHELL_SPEC_DIR;
    } else {
      process.env.MCP_SHELL_SPEC_DIR = originalSpecDir;
    }
  }
});

test("runprompt wrapper supports env-based model/base_url/api_key configuration", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mcp-shell-runprompt-"));
  const mockBinDir = path.join(tempDir, "bin");

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
  const originalSpecDir = process.env.MCP_SHELL_SPEC_DIR;
  const originalModel = process.env.MODEL;
  const originalBaseUrl = process.env.BASE_URL;
  const originalApiKey = process.env.API_KEY;
  process.env.PATH = `${mockBinDir}:${originalPath}`;
  process.env.MCP_SHELL_SPEC_DIR = tempDir;
  process.env.MODEL = "openrouter/deepseek/deepseek-v3.2";
  process.env.BASE_URL = "https://openrouter.ai/api/v1";
  process.env.API_KEY = "test-api-key";

  try {
    const result = await executeFromSpec(spec, {
      artifact_type: "script",
      requirements: "generate a shell script",
    });

    assert.equal(result.status, "success");
    const outputPath = extractGeneratedPath(result.stdout);
    const outputContent = await readFile(outputPath, "utf8");
    const payload = JSON.parse(outputContent);
    assert.equal(payload.model, "openrouter/deepseek/deepseek-v3.2");
    assert.equal(payload.base_url, "https://openrouter.ai/api/v1");
    assert.equal(payload.api_key, "test-api-key");
  } finally {
    process.env.PATH = originalPath;
    if (originalSpecDir === undefined) {
      delete process.env.MCP_SHELL_SPEC_DIR;
    } else {
      process.env.MCP_SHELL_SPEC_DIR = originalSpecDir;
    }

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

test("runprompt wrapper passes MCP runtime env vars through to script and runprompt", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mcp-shell-runprompt-"));
  const mockBinDir = path.join(tempDir, "bin");

  await mkdir(mockBinDir, { recursive: true });
  const mockRunpromptPath = path.join(mockBinDir, "runprompt");
  await writeFile(
    mockRunpromptPath,
    "#!/usr/bin/env bash\nset -euo pipefail\nprintf '{\"mcp_shell_spec_dir\":\"%s\",\"base_url\":\"%s\",\"openrouter_api_key\":\"%s\",\"runprompt_model\":\"%s\",\"runprompt_base_url\":\"%s\",\"runprompt_openrouter_api_key\":\"%s\"}\\n' \"${MCP_SHELL_SPEC_DIR:-}\" \"${BASE_URL:-}\" \"${OPENROUTER_API_KEY:-}\" \"${RUNPROMPT_MODEL:-}\" \"${RUNPROMPT_BASE_URL:-}\" \"${RUNPROMPT_OPENROUTER_API_KEY:-}\"\n",
    "utf8",
  );
  await chmod(mockRunpromptPath, 0o755);

  const spec = await loadRunpromptSpec();
  const originalPath = process.env.PATH ?? "";
  const originalSpecDir = process.env.MCP_SHELL_SPEC_DIR;
  const originalRunpromptModel = process.env.RUNPROMPT_MODEL;
  const originalBaseUrl = process.env.BASE_URL;
  const originalOpenRouterApiKey = process.env.OPENROUTER_API_KEY;
  const originalRunpromptBaseUrl = process.env.RUNPROMPT_BASE_URL;
  const originalRunpromptOpenRouterApiKey = process.env.RUNPROMPT_OPENROUTER_API_KEY;
  process.env.PATH = `${mockBinDir}:${originalPath}`;
  process.env.MCP_SHELL_SPEC_DIR = tempDir;
  process.env.RUNPROMPT_MODEL = "openrouter/deepseek/deepseek-v3.2";
  process.env.BASE_URL = "https://openrouter.ai/api/v1";
  process.env.OPENROUTER_API_KEY = "openrouter-key";
  delete process.env.RUNPROMPT_BASE_URL;
  delete process.env.RUNPROMPT_OPENROUTER_API_KEY;

  try {
    const result = await executeFromSpec(spec, {
      artifact_type: "script",
      requirements: "generate a shell script",
    });

    assert.equal(result.status, "success");
    const outputPath = extractGeneratedPath(result.stdout);
    const outputContent = await readFile(outputPath, "utf8");
    const payload = JSON.parse(outputContent);
    assert.equal(payload.mcp_shell_spec_dir, tempDir);
    assert.equal(payload.base_url, "https://openrouter.ai/api/v1");
    assert.equal(payload.openrouter_api_key, "openrouter-key");
    assert.equal(payload.runprompt_model, "openrouter/deepseek/deepseek-v3.2");
    assert.equal(payload.runprompt_base_url, "https://openrouter.ai/api/v1");
    assert.equal(payload.runprompt_openrouter_api_key, "openrouter-key");
  } finally {
    process.env.PATH = originalPath;
    if (originalSpecDir === undefined) {
      delete process.env.MCP_SHELL_SPEC_DIR;
    } else {
      process.env.MCP_SHELL_SPEC_DIR = originalSpecDir;
    }
    if (originalRunpromptModel === undefined) {
      delete process.env.RUNPROMPT_MODEL;
    } else {
      process.env.RUNPROMPT_MODEL = originalRunpromptModel;
    }
    if (originalBaseUrl === undefined) {
      delete process.env.BASE_URL;
    } else {
      process.env.BASE_URL = originalBaseUrl;
    }
    if (originalOpenRouterApiKey === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = originalOpenRouterApiKey;
    }
    if (originalRunpromptBaseUrl === undefined) {
      delete process.env.RUNPROMPT_BASE_URL;
    } else {
      process.env.RUNPROMPT_BASE_URL = originalRunpromptBaseUrl;
    }
    if (originalRunpromptOpenRouterApiKey === undefined) {
      delete process.env.RUNPROMPT_OPENROUTER_API_KEY;
    } else {
      process.env.RUNPROMPT_OPENROUTER_API_KEY = originalRunpromptOpenRouterApiKey;
    }
  }
});

test("runprompt wrapper respects YAML runtime-env precedence for base_url and api_key mapping", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mcp-shell-runprompt-"));
  const mockBinDir = path.join(tempDir, "bin");

  await mkdir(mockBinDir, { recursive: true });
  const mockRunpromptPath = path.join(mockBinDir, "runprompt");
  await writeFile(
    mockRunpromptPath,
    "#!/usr/bin/env bash\nset -euo pipefail\nprintf '{\"runprompt_base_url\":\"%s\",\"runprompt_openrouter_api_key\":\"%s\",\"openai_base_url\":\"%s\"}\\n' \"${RUNPROMPT_BASE_URL:-}\" \"${RUNPROMPT_OPENROUTER_API_KEY:-}\" \"${OPENAI_BASE_URL:-}\"\n",
    "utf8",
  );
  await chmod(mockRunpromptPath, 0o755);

  const spec = await loadRunpromptSpec();
  const originalPath = process.env.PATH ?? "";
  const originalSpecDir = process.env.MCP_SHELL_SPEC_DIR;
  const originalOpenAiBaseUrl = process.env.OPENAI_BASE_URL;
  const originalOpenAiApiBase = process.env.OPENAI_API_BASE;
  const originalBaseUrl = process.env.BASE_URL;
  const originalApiKey = process.env.API_KEY;
  const originalOpenRouterApiKey = process.env.OPENROUTER_API_KEY;
  process.env.PATH = `${mockBinDir}:${originalPath}`;
  process.env.MCP_SHELL_SPEC_DIR = tempDir;
  process.env.OPENAI_BASE_URL = "https://openai.example/v1";
  process.env.BASE_URL = "https://legacy-base.example/v1";
  process.env.API_KEY = "legacy-api-key";
  process.env.OPENROUTER_API_KEY = "preferred-openrouter-key";
  delete process.env.OPENAI_API_BASE;

  try {
    const result = await executeFromSpec(spec, {
      artifact_type: "script",
      requirements: "generate a shell script",
    });

    assert.equal(result.status, "success");
    const outputPath = extractGeneratedPath(result.stdout);
    const outputContent = await readFile(outputPath, "utf8");
    const payload = JSON.parse(outputContent);
    assert.equal(payload.runprompt_base_url, "https://openai.example/v1");
    assert.equal(payload.runprompt_openrouter_api_key, "preferred-openrouter-key");
    assert.equal(payload.openai_base_url, "https://openai.example/v1");
  } finally {
    process.env.PATH = originalPath;
    if (originalSpecDir === undefined) {
      delete process.env.MCP_SHELL_SPEC_DIR;
    } else {
      process.env.MCP_SHELL_SPEC_DIR = originalSpecDir;
    }

    if (originalOpenAiBaseUrl === undefined) {
      delete process.env.OPENAI_BASE_URL;
    } else {
      process.env.OPENAI_BASE_URL = originalOpenAiBaseUrl;
    }
    if (originalOpenAiApiBase === undefined) {
      delete process.env.OPENAI_API_BASE;
    } else {
      process.env.OPENAI_API_BASE = originalOpenAiApiBase;
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
    if (originalOpenRouterApiKey === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = originalOpenRouterApiKey;
    }
  }
});

test("runprompt wrapper rejects invalid dotprompt output for runprompt-prompt artifact", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mcp-shell-runprompt-"));
  const mockBinDir = path.join(tempDir, "bin");

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
  const originalSpecDir = process.env.MCP_SHELL_SPEC_DIR;
  process.env.PATH = `${mockBinDir}:${originalPath}`;
  process.env.MCP_SHELL_SPEC_DIR = tempDir;

  try {
    const result = await executeFromSpec(spec, {
      artifact_type: "runprompt-prompt",
      requirements: "create a dotprompt",
    });

    assert.equal(result.status, "error");
    assert.match(result.stderr, /must start with YAML frontmatter/i);
  } finally {
    process.env.PATH = originalPath;
    if (originalSpecDir === undefined) {
      delete process.env.MCP_SHELL_SPEC_DIR;
    } else {
      process.env.MCP_SHELL_SPEC_DIR = originalSpecDir;
    }
  }
});

test("runprompt wrapper accepts valid dotprompt output and writes file", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mcp-shell-runprompt-"));
  const mockBinDir = path.join(tempDir, "bin");

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
  const originalSpecDir = process.env.MCP_SHELL_SPEC_DIR;
  process.env.PATH = `${mockBinDir}:${originalPath}`;
  process.env.MCP_SHELL_SPEC_DIR = tempDir;

  try {
    const result = await executeFromSpec(spec, {
      artifact_type: "runprompt-prompt",
      requirements: "create a dotprompt",
    });

    assert.equal(result.status, "success");
    const outputPath = extractGeneratedPath(result.stdout);
    const outputContent = await readFile(outputPath, "utf8");
    assert.match(outputContent, /^---[\s\S]*?\nmodel:\s+/);
    assert.match(outputContent, /\n---\nSummarize: \{\{text\}\}/);
  } finally {
    process.env.PATH = originalPath;
    if (originalSpecDir === undefined) {
      delete process.env.MCP_SHELL_SPEC_DIR;
    } else {
      process.env.MCP_SHELL_SPEC_DIR = originalSpecDir;
    }
  }
});

test("runprompt wrapper requires MCP_SHELL_SPEC_DIR to be configured", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mcp-shell-runprompt-"));
  const mockBinDir = path.join(tempDir, "bin");

  await mkdir(mockBinDir, { recursive: true });
  const mockRunpromptPath = path.join(mockBinDir, "runprompt");
  await writeFile(mockRunpromptPath, "#!/usr/bin/env bash\nset -euo pipefail\nprintf 'ok\\n'\n", "utf8");
  await chmod(mockRunpromptPath, 0o755);

  const spec = await loadRunpromptSpec();
  const originalPath = process.env.PATH ?? "";
  const originalSpecDir = process.env.MCP_SHELL_SPEC_DIR;
  process.env.PATH = `${mockBinDir}:${originalPath}`;
  delete process.env.MCP_SHELL_SPEC_DIR;

  try {
    const result = await executeFromSpec(spec, {
      artifact_type: "script",
      requirements: "generate a shell script",
    });

    assert.equal(result.status, "error");
    assert.match(result.stderr, /MCP_SHELL_SPEC_DIR is not configured/i);
  } finally {
    process.env.PATH = originalPath;
    if (originalSpecDir === undefined) {
      delete process.env.MCP_SHELL_SPEC_DIR;
    } else {
      process.env.MCP_SHELL_SPEC_DIR = originalSpecDir;
    }
  }
});

test("runprompt wrapper writes generated files under MCP_SHELL_SPEC_DIR by artifact type", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mcp-shell-runprompt-"));
  const mockBinDir = path.join(tempDir, "bin");

  await mkdir(mockBinDir, { recursive: true });
  const mockRunpromptPath = path.join(mockBinDir, "runprompt");
  await writeFile(mockRunpromptPath, "#!/usr/bin/env bash\nset -euo pipefail\nprintf 'ok\\n'\n", "utf8");
  await chmod(mockRunpromptPath, 0o755);

  const spec = await loadRunpromptSpec();
  const originalPath = process.env.PATH ?? "";
  const originalSpecDir = process.env.MCP_SHELL_SPEC_DIR;
  process.env.PATH = `${mockBinDir}:${originalPath}`;
  process.env.MCP_SHELL_SPEC_DIR = tempDir;

  try {
    const result = await executeFromSpec(spec, {
      artifact_type: "mcp-shell-yaml",
      requirements: "generate a shell script",
    });

    assert.equal(result.status, "success");
    const generatedPath = extractGeneratedPath(result.stdout);
    assert.ok(generatedPath.startsWith(path.join(tempDir, "generated-artifacts", "mcp-shell-yaml")));
    assert.match(generatedPath, /\.ya?ml$/i);
  } finally {
    process.env.PATH = originalPath;
    if (originalSpecDir === undefined) {
      delete process.env.MCP_SHELL_SPEC_DIR;
    } else {
      process.env.MCP_SHELL_SPEC_DIR = originalSpecDir;
    }
  }
});
