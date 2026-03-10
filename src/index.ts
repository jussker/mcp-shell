#!/usr/bin/env node
import path from "node:path";
import { createServer, IncomingMessage } from "node:http";
import { readFile } from "node:fs/promises";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { executeFromSpec } from "./executor.js";
import { formatExecutionResultForMcp } from "./mcp-response.js";
import { appendResponseModeParamDoc, buildInputSchema, MCP_RESPONSE_MODE_PARAM } from "./schema.js";
import { ensureSpecDirectoryReady, resolveBundledSpecDir } from "./spec-bootstrap.js";
import { loadSpecs } from "./spec-loader.js";
import { parseStartupOptions } from "./startup-options.js";
import { normalizeTSDocDescription } from "./tsdoc.js";

const MAX_HTTP_BODY_BYTES = 1_048_576;

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
  const startupOptions = parseStartupOptions();
  const specDir = startupOptions.specDir;
  const version = await resolveServerVersion();
  const bundledSpecDir = await resolveBundledSpecDir(import.meta.url);
  await ensureSpecDirectoryReady({
    targetSpecDir: specDir,
    bundledSpecDir,
    currentVersion: version,
  });
  if (!process.env.MCP_SHELL_SPEC_DIR) {
    process.env.MCP_SHELL_SPEC_DIR = specDir;
  }
  const specs = await loadSpecs(specDir);

  const server = new McpServer({
    name: process.env.MCP_SHELL_SERVER_NAME ?? "mcp-shell",
    version,
  });

  for (const spec of specs) {
    server.registerTool(
      spec.tool.name,
        {
          description: appendResponseModeParamDoc(normalizeTSDocDescription(spec.tool.description)),
          inputSchema: buildInputSchema(spec.tool.input),
        },
      async (args) => {
        const parsedArgs = args as Record<string, unknown>;
        const responseMode =
          parsedArgs[MCP_RESPONSE_MODE_PARAM] === "structuredContent"
            ? "structuredContent"
            : "content";
        const { [MCP_RESPONSE_MODE_PARAM]: _ignored, ...toolArgs } = parsedArgs;
        const result = await executeFromSpec(spec, toolArgs);
        return formatExecutionResultForMcp(result, responseMode);
      },
    );
  }

  if (startupOptions.transport === "stdio") {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    process.stderr.write(
      `mcp-shell started with ${specs.length} tools from ${specDir} via stdio (version ${version})\n`,
    );
    return;
  }

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await server.connect(transport);

  const httpServer = createServer(async (req, res) => {
    if (!matchesPath(req, startupOptions.httpPath)) {
      res.statusCode = 404;
      res.end("Not Found");
      return;
    }

    try {
      const parsedBody = await parseRequestBody(req);
      await transport.handleRequest(req, res, parsedBody);
    } catch (error) {
      if (!res.headersSent) {
        res.statusCode = 400;
        const message = error instanceof Error ? error.message : "Invalid request";
        res.end(message);
      }
    }
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(startupOptions.port, startupOptions.host, () => {
      httpServer.off("error", reject);
      resolve();
    });
  });

  process.stderr.write(
    `mcp-shell started with ${specs.length} tools from ${specDir} via streamable-http at http://${startupOptions.host}:${startupOptions.port}${startupOptions.httpPath} (version ${version})\n`,
  );
}

function matchesPath(req: IncomingMessage, expectedPath: string): boolean {
  if (!req.url) {
    return false;
  }
  const requestUrl = new URL(req.url, "http://localhost");
  return requestUrl.pathname === expectedPath;
}

async function parseRequestBody(req: IncomingMessage): Promise<unknown> {
  if (req.method !== "POST") {
    return undefined;
  }

  const chunks: Buffer[] = [];
  let totalLength = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalLength += buffer.byteLength;
    if (totalLength > MAX_HTTP_BODY_BYTES) {
      throw new Error("Request body exceeds 1 MiB limit.");
    }
    chunks.push(buffer);
  }

  if (chunks.length === 0) {
    return undefined;
  }

  const bodyText = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(bodyText);
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`Fatal error: ${message}\n`);
  process.exit(1);
});
