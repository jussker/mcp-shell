import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { executeFromSpec, sanitizeOutputText } from "../src/executor.js";
import type { ShellToolSpec } from "../src/types.js";

test("sanitizeOutputText escapes non-printable control chars", () => {
  assert.equal(sanitizeOutputText("a\u0000b\u0007c"), "a\\x00b\\x07c");
});

test("sanitizeOutputText preserves tabs and newlines", () => {
  assert.equal(sanitizeOutputText("a\tb\nc\r\n"), "a\tb\nc\r\n");
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

test("executeFromSpec supports script execution with interpreter", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mcp-shell-script-"));
  const scriptPath = path.join(dir, "echo.js");
  await writeFile(
    scriptPath,
    "const value = process.argv[2] ?? ''; process.stdout.write(`script:${value}`);",
    "utf8",
  );

  const spec: ShellToolSpec = {
    apiVersion: "v1",
    tool: {
      name: "script_echo",
      description: "/** script echo */",
      input: {
        properties: {
          value: { type: "string" },
        },
        required: ["value"],
      },
      output: {
        type: "object",
        properties: {},
      },
    },
    execution: {
      script: {
        path: "./echo.js",
        interpreter: "node",
        args: ["{{value}}"],
      },
      timeoutMs: 5_000,
    },
    __meta: {
      specDir: dir,
    },
  };

  const result = await executeFromSpec(spec, { value: "ok" });
  assert.equal(result.status, "success");
  assert.equal(result.stdout, "script:ok");
});
