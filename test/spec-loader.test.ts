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
  assert.ok(names.has("ffmpeg__process_video_for_llm"));
  assert.ok(names.has("ffmpeg__process_audio_for_stt"));
  assert.ok(names.has("ffmpeg__extract_frames_for_vision"));
  assert.ok(names.has("ffmpeg__create_video_summary"));
  assert.ok(names.has("runprompt__generate_artifact"));
});

test("maps params into command args and env vars", () => {
  const originalLegacy = process.env.TEST_LEGACY_ENV;
  const originalPreferred = process.env.TEST_PREFERRED_ENV;
  process.env.TEST_LEGACY_ENV = "legacy-value";
  process.env.TEST_PREFERRED_ENV = "preferred-value";

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
        fromRuntime: {
          MAPPED_ENV: ["TEST_PREFERRED_ENV", "TEST_LEGACY_ENV"],
        },
      },
      command: {
        executable: "echo",
        args: ["{{value}}"],
      },
    },
  };

  try {
    const plan = buildExecutionPlan(spec, { value: "hello" });
    assert.equal(plan.executable, "echo");
    assert.deepEqual(plan.launchArgs, ["hello"]);
    assert.equal(plan.env.STATIC_ENV, "ok");
    assert.equal(plan.env.DYNAMIC_ENV, "hello");
    assert.equal(plan.env.MAPPED_ENV, "preferred-value");
    assert.equal(plan.commandDisplay, "echo hello");
  } finally {
    if (originalLegacy === undefined) {
      delete process.env.TEST_LEGACY_ENV;
    } else {
      process.env.TEST_LEGACY_ENV = originalLegacy;
    }
    if (originalPreferred === undefined) {
      delete process.env.TEST_PREFERRED_ENV;
    } else {
      process.env.TEST_PREFERRED_ENV = originalPreferred;
    }
  }
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

test("rejects yaml specs when execution.env.fromRuntime values are invalid", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mcp-shell-spec-"));
  await writeFile(
    path.join(dir, "invalid-env-from-runtime.yaml"),
    `apiVersion: v1
tool:
  name: invalid_env_from_runtime
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
  env:
    fromRuntime:
      BAD_MAP:
        invalid: object
  command:
    executable: echo
`,
    "utf8",
  );

  await assert.rejects(loadSpecs(dir), /execution\.env\.fromRuntime\.BAD_MAP must be a non-empty string or array of non-empty strings/);
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
