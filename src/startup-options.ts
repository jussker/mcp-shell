import path from "node:path";
import { parseArgs } from "node:util";

export type TransportType = "stdio" | "streamable-http";

export interface StartupOptions {
  specDir: string;
  transport: TransportType;
  host: string;
  port: number;
  httpPath: string;
}

export function parseStartupOptions(
  argv: string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): StartupOptions {
  const { values } = parseArgs({
    args: argv,
    options: {
      transport: { type: "string" },
      "spec-dir": { type: "string" },
      host: { type: "string" },
      port: { type: "string" },
      "http-path": { type: "string" },
    },
    strict: true,
    allowPositionals: false,
  });

  const transportRaw = values.transport ?? env.MCP_SHELL_TRANSPORT ?? "stdio";
  if (transportRaw !== "stdio" && transportRaw !== "streamable-http") {
    throw new Error(
      `Unsupported transport "${transportRaw}". Supported values: stdio, streamable-http.`,
    );
  }

  const host = values.host ?? env.MCP_SHELL_HTTP_HOST ?? "127.0.0.1";
  const portRaw = values.port ?? env.MCP_SHELL_HTTP_PORT ?? "3001";
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port "${portRaw}". Expected integer in range 1-65535.`);
  }

  const httpPathRaw = values["http-path"] ?? env.MCP_SHELL_HTTP_PATH ?? "/mcp";
  const httpPath =
    httpPathRaw.length === 0 ? "/mcp" : httpPathRaw.startsWith("/") ? httpPathRaw : `/${httpPathRaw}`;

  return {
    transport: transportRaw,
    specDir: values["spec-dir"] ?? env.MCP_SHELL_SPEC_DIR ?? path.join(cwd, "specs"),
    host,
    port,
    httpPath,
  };
}
