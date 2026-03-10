import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildExecutionPlan } from "../src/executor.js";
import { loadSpecs } from "../src/spec-loader.js";
import type { ShellToolSpec } from "../src/types.js";

const specDir = path.resolve(process.cwd(), "specs");

test("loads ffmpeg tool specs", async () => {
  const specs = await loadSpecs(specDir);
  const names = new Set(specs.map((spec) => spec.tool.name));
  assert.ok(names.has("ffmpeg__extract_audio"));
  assert.ok(names.has("ffmpeg__probe_streams"));
  assert.ok(names.has("ffmpeg__transcode_mp4"));
});

test("maps params into command args and env vars", () => {
  const spec: ShellToolSpec = {
    apiVersion: "v1",
    tool: {
      name: "demo__echo",
      description: "demo",
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

test("rejects yaml specs that still use docstring", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mcp-shell-spec-"));
  await writeFile(
    path.join(dir, "invalid.yaml"),
    `apiVersion: v1
tool:
  name: invalid_tool
  description: ok
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
