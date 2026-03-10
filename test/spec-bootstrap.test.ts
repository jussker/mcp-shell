import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ensureSpecDirectoryReady } from "../src/spec-bootstrap.js";

async function createBundledSpecsFixture(baseDir: string): Promise<string> {
  const bundledDir = path.join(baseDir, "bundled-specs");
  await mkdir(path.join(bundledDir, "prompts", "runprompt"), { recursive: true });
  await writeFile(
    path.join(bundledDir, "shell__run_script_echo.yaml"),
    [
      "apiVersion: v1",
      "tool:",
      "  name: shell__run_script_echo",
      "  description: |-",
      "    /**",
      "     * Echo script tool",
      "     */",
      "  input:",
      "    properties: {}",
      "  output:",
      "    type: object",
      "    properties: {}",
      "execution:",
      "  command:",
      "    executable: echo",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(path.join(bundledDir, "prompts", "runprompt", "generate_artifact.prompt"), "---\nmodel: test\n---\n", "utf8");
  return bundledDir;
}

test("ensureSpecDirectoryReady copies bundled specs into empty target directory", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mcp-shell-spec-bootstrap-"));
  const bundledDir = await createBundledSpecsFixture(tempDir);
  const targetSpecDir = path.join(tempDir, "runtime-specs");

  await ensureSpecDirectoryReady({
    targetSpecDir,
    bundledSpecDir: bundledDir,
    currentVersion: "1.2.0",
  });

  const copiedYaml = await readFile(path.join(targetSpecDir, "shell__run_script_echo.yaml"), "utf8");
  const copiedPrompt = await readFile(path.join(targetSpecDir, "prompts", "runprompt", "generate_artifact.prompt"), "utf8");
  const meta = JSON.parse(await readFile(path.join(targetSpecDir, ".mcp-shell", "spec-version.json"), "utf8")) as {
    version: string;
  };

  assert.match(copiedYaml, /shell__run_script_echo/);
  assert.match(copiedPrompt, /model: test/);
  assert.equal(meta.version, "1.2.0");
});

test("ensureSpecDirectoryReady upgrades target specs when version is older", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mcp-shell-spec-bootstrap-"));
  const bundledDir = await createBundledSpecsFixture(tempDir);
  const targetSpecDir = path.join(tempDir, "runtime-specs");

  await mkdir(path.join(targetSpecDir, ".mcp-shell"), { recursive: true });
  await writeFile(path.join(targetSpecDir, "shell__run_script_echo.yaml"), "outdated", "utf8");
  await writeFile(path.join(targetSpecDir, ".mcp-shell", "spec-version.json"), '{"version":"1.0.0"}\n', "utf8");

  await ensureSpecDirectoryReady({
    targetSpecDir,
    bundledSpecDir: bundledDir,
    currentVersion: "1.3.0",
  });

  const upgradedYaml = await readFile(path.join(targetSpecDir, "shell__run_script_echo.yaml"), "utf8");
  const meta = JSON.parse(await readFile(path.join(targetSpecDir, ".mcp-shell", "spec-version.json"), "utf8")) as {
    version: string;
  };
  assert.match(upgradedYaml, /shell__run_script_echo/);
  assert.equal(meta.version, "1.3.0");
});

test("ensureSpecDirectoryReady preserves user generated files while syncing bundled specs", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mcp-shell-spec-bootstrap-"));
  const bundledDir = await createBundledSpecsFixture(tempDir);
  const targetSpecDir = path.join(tempDir, "runtime-specs");

  await mkdir(path.join(targetSpecDir, "generated-artifacts", "scripts"), { recursive: true });
  await writeFile(path.join(targetSpecDir, "generated-artifacts", "scripts", "custom.sh"), "echo custom\n", "utf8");

  await ensureSpecDirectoryReady({
    targetSpecDir,
    bundledSpecDir: bundledDir,
    currentVersion: "1.4.0",
  });

  const userGenerated = await readFile(path.join(targetSpecDir, "generated-artifacts", "scripts", "custom.sh"), "utf8");
  assert.equal(userGenerated, "echo custom\n");
});
