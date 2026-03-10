import path from "node:path";
import { readFile } from "node:fs/promises";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { VERSION as MCP_USE_VERSION } from "mcp-use";
import { executeFromSpec } from "./executor.js";
import { buildInputSchema } from "./schema.js";
import { loadSpecs } from "./spec-loader.js";

async function resolveServerVersion(): Promise<string> {
  if (process.env.MCP_SHELL_SERVER_VERSION) {
    return process.env.MCP_SHELL_SERVER_VERSION;
  }

  try {
    const packageJsonPath = path.join(process.cwd(), "package.json");
    const content = await readFile(packageJsonPath, "utf8");
    const parsed = JSON.parse(content) as { version?: string };
    return parsed.version ?? "1.0.0";
  } catch {
    return "1.0.0";
  }
}

async function main(): Promise<void> {
  const specDir = process.env.MCP_SHELL_SPEC_DIR ?? path.join(process.cwd(), "specs");
  const specs = await loadSpecs(specDir);
  const version = await resolveServerVersion();

  const server = new McpServer({
    name: process.env.MCP_SHELL_SERVER_NAME ?? "mcp-shell",
    version,
  });

  for (const spec of specs) {
    const description = spec.tool.docstring
      ? `${spec.tool.description}\n\n${spec.tool.docstring}`
      : spec.tool.description;

    server.registerTool(
      spec.tool.name,
      {
        description,
        inputSchema: buildInputSchema(spec.tool.input),
      },
      async (args) => {
        const result = await executeFromSpec(spec, args as Record<string, unknown>);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result),
            },
          ],
          structuredContent: result,
        };
      },
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.stderr.write(
    `mcp-shell started with ${specs.length} tools from ${specDir} (mcp-use ${MCP_USE_VERSION})\n`,
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`Fatal error: ${message}\n`);
  process.exit(1);
});
