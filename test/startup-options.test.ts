import assert from "node:assert/strict";
import test from "node:test";
import { parseStartupOptions } from "../src/startup-options.js";

test("parseStartupOptions uses stdio defaults", () => {
  const options = parseStartupOptions([], {}, "/repo");
  assert.equal(options.transport, "stdio");
  assert.equal(options.specDir, "/repo/specs");
  assert.equal(options.host, "127.0.0.1");
  assert.equal(options.port, 3001);
  assert.equal(options.httpPath, "/mcp");
});

test("parseStartupOptions lets args override env values", () => {
  const options = parseStartupOptions(
    [
      "--transport",
      "streamable-http",
      "--spec-dir",
      "/tmp/specs",
      "--host",
      "0.0.0.0",
      "--port",
      "8080",
      "--http-path",
      "rpc",
    ],
    {
      MCP_SHELL_TRANSPORT: "stdio",
      MCP_SHELL_SPEC_DIR: "/env/specs",
      MCP_SHELL_HTTP_HOST: "127.0.0.1",
      MCP_SHELL_HTTP_PORT: "3001",
      MCP_SHELL_HTTP_PATH: "/mcp",
    },
    "/repo",
  );

  assert.equal(options.transport, "streamable-http");
  assert.equal(options.specDir, "/tmp/specs");
  assert.equal(options.host, "0.0.0.0");
  assert.equal(options.port, 8080);
  assert.equal(options.httpPath, "/rpc");
});

test("parseStartupOptions rejects unsupported transport", () => {
  assert.throws(
    () => parseStartupOptions(["--transport", "sse"], {}, "/repo"),
    /Unsupported transport/,
  );
});

test("parseStartupOptions rejects invalid port values", () => {
  assert.throws(
    () => parseStartupOptions(["--port", "abc"], {}, "/repo"),
    /Invalid port/,
  );
});
