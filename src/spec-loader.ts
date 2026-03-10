import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { normalizeTSDocDescription } from "./tsdoc.js";
import type { ShellToolSpec } from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertSpec(spec: unknown, filePath: string): asserts spec is ShellToolSpec {
  if (!isRecord(spec)) {
    throw new Error(`Invalid spec in ${filePath}: root must be an object`);
  }

  if (spec.apiVersion !== "v1") {
    throw new Error(`Invalid spec in ${filePath}: apiVersion must be 'v1'`);
  }

  if (!isRecord(spec.tool)) {
    throw new Error(`Invalid spec in ${filePath}: missing tool block`);
  }

  if (typeof spec.tool.name !== "string" || spec.tool.name.length === 0) {
    throw new Error(`Invalid spec in ${filePath}: tool.name is required`);
  }

  if (typeof spec.tool.description !== "string" || spec.tool.description.length === 0) {
    throw new Error(`Invalid spec in ${filePath}: tool.description is required`);
  }
  try {
    normalizeTSDocDescription(spec.tool.description);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid spec in ${filePath}: ${message}`);
  }

  if ("docstring" in spec.tool) {
    throw new Error(`Invalid spec in ${filePath}: use only tool.description (docstring is not supported)`);
  }

  if (!isRecord(spec.execution)) {
    throw new Error(`Invalid spec in ${filePath}: execution block is required`);
  }

  const command = isRecord(spec.execution.command) ? spec.execution.command : undefined;
  const script = isRecord(spec.execution.script) ? spec.execution.script : undefined;
  const hasCommand = command !== undefined;
  const hasScript = script !== undefined;
  if (!hasCommand && !hasScript) {
    throw new Error(`Invalid spec in ${filePath}: execution.command or execution.script is required`);
  }
  if (hasCommand && hasScript) {
    throw new Error(`Invalid spec in ${filePath}: execution.command and execution.script cannot both be set`);
  }

  if (hasCommand) {
    if (typeof command.executable !== "string" || command.executable.length === 0) {
      throw new Error(`Invalid spec in ${filePath}: execution.command.executable is required`);
    }
  }

  if (hasScript) {
    if (typeof script.path !== "string" || script.path.length === 0) {
      throw new Error(`Invalid spec in ${filePath}: execution.script.path is required`);
    }
  }
}

export async function loadSpecs(specDir: string): Promise<ShellToolSpec[]> {
  const files = await readdir(specDir);
  const yamlFiles = files.filter((file) => file.endsWith(".yaml") || file.endsWith(".yml"));

  const specs: ShellToolSpec[] = [];
  for (const file of yamlFiles) {
    const filePath = path.join(specDir, file);
    const raw = await readFile(filePath, "utf8");
    const parsed = parse(raw);
    assertSpec(parsed, filePath);
    parsed.__meta = { specDir: path.dirname(filePath) };
    specs.push(parsed);
  }

  return specs;
}
