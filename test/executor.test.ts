import assert from "node:assert/strict";
import test from "node:test";
import { executeFromSpec, sanitizeOutputText } from "../src/executor.js";
import type { ShellToolSpec } from "../src/types.js";

test("sanitizeOutputText escapes non-printable control chars", () => {
  assert.equal(sanitizeOutputText("a\u0000b\u0007c"), "a\\x00b\\x07c");
});

test("executeFromSpec returns text-safe stdout for binary-like output", async () => {
  const spec: ShellToolSpec = {
    apiVersion: "v1",
    tool: {
      name: "binary_safe",
      description: "/** binary-safe */",
      input: { properties: {} },
      output: {
        type: "object",
        properties: {},
      },
    },
    execution: {
      command: {
        executable: "node",
        args: ["-e", "process.stdout.write('A\\x00B')"],
      },
      timeoutMs: 5_000,
    },
  };

  const result = await executeFromSpec(spec, {});

  assert.equal(result.status, "success");
  assert.equal(result.stdout, "A\\x00B");
});
