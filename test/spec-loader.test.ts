import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildExecutionPlan } from "../src/executor.js";
import { loadSpecs } from "../src/spec-loader.js";
import { normalizeTSDocDescription } from "../src/tsdoc.js";
import type { ShellToolSpec } from "../src/types.js";

const specDir = path.resolve(process.cwd(), "specs");

test("loads bundled tool specs", async () => {
  const specs = await loadSpecs(specDir);
  const names = new Set(specs.map((spec) => spec.tool.name));
  assert.ok(names.has("ffmpeg__extract_audio"));
  assert.ok(names.has("ffmpeg__probe_streams"));
  assert.ok(names.has("ffmpeg__transcode_mp4"));
  assert.ok(names.has("runprompt__generate_artifact"));
});

test("maps params into command args and env vars", () => {
  const spec: ShellToolSpec = {
    apiVersion: "v1",
    tool: {
      name: "demo__echo",
      description: "/** demo */",
      input: {
        properties: {
          value: { type: "string" },
        },
        required: ["value"],
      },
      output: { type: "object", properties: {} },
    },
    execution: {
      shell: { mode: "direct" },
      env: {
        static: { STATIC_ENV: "ok" },
        fromParams: { DYNAMIC_ENV: "value" },
      },
      command: {
        executable: "echo",
        args: ["{{value}}"],
      },
    },
  };

  const plan = buildExecutionPlan(spec, { value: "hello" });
  assert.equal(plan.executable, "echo");
  assert.deepEqual(plan.launchArgs, ["hello"]);
  assert.equal(plan.env.STATIC_ENV, "ok");
  assert.equal(plan.env.DYNAMIC_ENV, "hello");
  assert.equal(plan.commandDisplay, "echo hello");
});

test("maps params into script args with relative path and interpreter", () => {
  const spec: ShellToolSpec = {
    apiVersion: "v1",
    tool: {
      name: "demo__script",
      description: "/** demo */",
      input: {
        properties: {
          value: { type: "string" },
        },
        required: ["value"],
      },
      output: { type: "object", properties: {} },
    },
    execution: {
      script: {
        path: "./scripts/demo.sh",
        interpreter: "bash",
        args: ["{{value}}"],
      },
    },
    __meta: {
      specDir: "/tmp/specs",
    },
  };

  const plan = buildExecutionPlan(spec, { value: "hello world" });
  assert.equal(plan.executable, "bash");
  assert.deepEqual(plan.launchArgs, ["/tmp/specs/scripts/demo.sh", "hello world"]);
  assert.equal(plan.commandDisplay, "bash /tmp/specs/scripts/demo.sh 'hello world'");
});

test("rejects yaml specs that still use docstring", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mcp-shell-spec-"));
  await writeFile(
    path.join(dir, "invalid.yaml"),
    `apiVersion: v1
tool:
  name: invalid_tool
  description: |
    /**
     * Valid TSDoc description
     */
  docstring: should_not_exist
  input:
    properties: {}
  output:
    type: object
    properties: {}
execution:
  command:
    executable: echo
`,
    "utf8",
  );

  await assert.rejects(loadSpecs(dir), /docstring is not supported/);
});

test("rejects yaml specs when description is not TSDoc", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mcp-shell-spec-"));
  await writeFile(
    path.join(dir, "invalid-tsdoc.yaml"),
    `apiVersion: v1
tool:
  name: invalid_tsdoc
  description: plain text description
  input:
    properties: {}
  output:
    type: object
    properties: {}
execution:
  command:
    executable: echo
`,
    "utf8",
  );

  await assert.rejects(loadSpecs(dir), /TSDoc block comment/);
});

test("rejects yaml specs without command or script", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mcp-shell-spec-"));
  await writeFile(
    path.join(dir, "invalid-execution.yaml"),
    `apiVersion: v1
tool:
  name: invalid_execution
  description: |
    /**
     * Valid TSDoc description
     */
  input:
    properties: {}
  output:
    type: object
    properties: {}
execution:
  timeoutMs: 1000
`,
    "utf8",
  );

  await assert.rejects(loadSpecs(dir), /execution.command or execution.script is required/);
});

test("rejects yaml specs with both command and script", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mcp-shell-spec-"));
  await writeFile(
    path.join(dir, "invalid-both.yaml"),
    `apiVersion: v1
tool:
  name: invalid_both
  description: |
    /**
     * Valid TSDoc description
     */
  input:
    properties: {}
  output:
    type: object
    properties: {}
execution:
  command:
    executable: echo
  script:
    path: ./demo.sh
`,
    "utf8",
  );

  await assert.rejects(loadSpecs(dir), /execution.command and execution.script cannot both be set/);
});

test("normalizes TSDoc description for MCP registration", () => {
  const description = normalizeTSDocDescription(`/**
 * Summary line.
 * @remarks Additional details.
 */`);

  assert.equal(description, "Summary line.\n@remarks Additional details.");
});

test("normalizes TSDoc with mixed indentation and preserves inner spacing", () => {
  const description = normalizeTSDocDescription(`/**
\t*   Summary with extra indentation.
  * @remarks  Two spaces before this sentence are preserved.
 * **Bold marker should remain in content.
 */`);

  assert.equal(
    description,
    "Summary with extra indentation.\n@remarks  Two spaces before this sentence are preserved.\n**Bold marker should remain in content.",
  );
});

test("rejects malformed TSDoc lines without leading *", () => {
  assert.throws(
    () =>
      normalizeTSDocDescription(`/**
 * valid line
 malformed line
 */`),
    /standard TSDoc line prefixes/,
  );
});

test("keeps intentional blank lines in TSDoc body", () => {
  const description = normalizeTSDocDescription(`/**
 * First line.
 *
 * Second line.
 */`);

  assert.equal(description, "First line.\n\nSecond line.");
});
