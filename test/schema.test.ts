import assert from "node:assert/strict";
import test from "node:test";
import { buildInputSchema, MCP_RESPONSE_MODE_PARAM } from "../src/schema.js";

test("injects MCP response mode param with default content mode", () => {
  const schema = buildInputSchema({
    properties: {
      query: { type: "string" },
    },
    required: ["query"],
  });

  const parsed = schema.parse({ query: "hello" }) as Record<string, unknown>;
  assert.equal(parsed.query, "hello");
  assert.equal(parsed[MCP_RESPONSE_MODE_PARAM], "content");
});

test("accepts structuredContent MCP response mode", () => {
  const schema = buildInputSchema({
    properties: {},
  });

  const parsed = schema.parse({
    [MCP_RESPONSE_MODE_PARAM]: "structuredContent",
  }) as Record<string, unknown>;

  assert.equal(parsed[MCP_RESPONSE_MODE_PARAM], "structuredContent");
});
