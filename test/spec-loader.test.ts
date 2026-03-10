import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { buildExecutionPlan } from "../src/executor.js";
import { loadSpecs } from "../src/spec-loader.js";
import type { ShellToolSpec } from "../src/types.js";

const specDir = path.resolve(process.cwd(), "specs");

test("loads ffmpeg tool specs", async () => {
  const specs = await loadSpecs(specDir);
  assert.equal(specs.length, 3);
  assert.deepEqual(
    specs.map((spec) => spec.tool.name).sort(),
    ["ffmpeg__extract_audio", "ffmpeg__probe_streams", "ffmpeg__transcode_mp4"],
  );
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
