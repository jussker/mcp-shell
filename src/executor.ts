import { spawn } from "node:child_process";
import type { ExecutionResult, ShellToolSpec } from "./types.js";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_OUTPUT_BYTES = 1_048_576;

function renderTemplate(template: string, args: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key) => {
    const value = args[key];
    return value === undefined || value === null ? "" : String(value);
  });
}

function shellQuote(value: string): string {
  if (/^[a-zA-Z0-9_./:-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function resolveShell(spec: ShellToolSpec): { executable: string; args: string[] } {
  const shell = spec.execution.shell;
  if (!shell || shell.mode === "direct") {
    const executable = renderTemplate(spec.execution.command.executable, {});
    return { executable, args: [] };
  }

  const shellExecutable = shell.path ?? shell.name ?? "bash";
  const baseArgs = shell.args ?? (shell.name === "cmd" ? ["/c"] : ["-lc"]);
  return { executable: shellExecutable, args: baseArgs };
}

export function buildExecutionPlan(spec: ShellToolSpec, args: Record<string, unknown>) {
  const commandExecutable = renderTemplate(spec.execution.command.executable, args);
  const commandArgs = (spec.execution.command.args ?? []).map((arg) => renderTemplate(arg, args));
  const env: Record<string, string> = {
    ...Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== undefined) as [string, string][]),
  };

  for (const [key, value] of Object.entries(spec.execution.env?.static ?? {})) {
    env[key] = renderTemplate(value, args);
  }

  for (const [envVar, paramName] of Object.entries(spec.execution.env?.fromParams ?? {})) {
    const value = args[paramName];
    if (value !== undefined && value !== null) {
      env[envVar] = String(value);
    }
  }

  const commandDisplay = [commandExecutable, ...commandArgs].map(shellQuote).join(" ");
  const shell = resolveShell(spec);
  const launchArgs =
    spec.execution.shell?.mode === "shell"
      ? [...shell.args, commandDisplay]
      : commandArgs;
  const executable = spec.execution.shell?.mode === "shell" ? shell.executable : commandExecutable;

  return {
    executable,
    launchArgs,
    commandDisplay,
    env,
    timeoutMs: spec.execution.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxOutputBytes: spec.execution.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES,
    cwd: spec.execution.workingDirectory,
  };
}

export async function executeFromSpec(spec: ShellToolSpec, args: Record<string, unknown>): Promise<ExecutionResult> {
  const plan = buildExecutionPlan(spec, args);
  const start = Date.now();

  return new Promise<ExecutionResult>((resolve) => {
    const child = spawn(plan.executable, plan.launchArgs, {
      env: plan.env,
      cwd: plan.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let exceeded = false;

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      stderr = `${stderr}\nProcess timed out after ${plan.timeoutMs}ms`.trim();
    }, plan.timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      if (Buffer.byteLength(stdout, "utf8") > plan.maxOutputBytes) {
        exceeded = true;
        child.kill("SIGKILL");
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
      if (Buffer.byteLength(stderr, "utf8") > plan.maxOutputBytes) {
        exceeded = true;
        child.kill("SIGKILL");
      }
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      const status = code === 0 && !exceeded ? "success" : "error";
      if (exceeded) {
        stderr = `${stderr}\nOutput exceeded maxOutputBytes (${plan.maxOutputBytes}).`.trim();
      }

      resolve({
        status,
        exit_code: code ?? -1,
        stdout: stdout.replace(/\n$/, ""),
        stderr: stderr.replace(/\n$/, ""),
        command: plan.commandDisplay,
        execution_time_ms: Date.now() - start,
        spec_tool: spec.tool.name,
      });
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({
        status: "error",
        exit_code: -1,
        stdout,
        stderr: error.message,
        command: plan.commandDisplay,
        execution_time_ms: Date.now() - start,
        spec_tool: spec.tool.name,
      });
    });
  });
}
