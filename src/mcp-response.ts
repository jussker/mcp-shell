import type { ExecutionResult } from "./types.js";

function formatStreamSection(name: "stdout" | "stderr", value: string): string {
  if (!value) {
    return `${name}: (empty)`;
  }

  return `${name}:\n${value}`;
}

export function formatExecutionResultForMcp(result: ExecutionResult) {
  const summary = [
    `status: ${result.status}`,
    `exit_code: ${result.exit_code}`,
    `command: ${result.command}`,
    `execution_time_ms: ${result.execution_time_ms}`,
    `spec_tool: ${result.spec_tool}`,
    formatStreamSection("stdout", result.stdout),
    formatStreamSection("stderr", result.stderr),
  ].join("\n");

  return {
    isError: result.status === "error",
    content: [
      {
        type: "text" as const,
        text: summary,
      },
    ],
    structuredContent: result,
  };
}
