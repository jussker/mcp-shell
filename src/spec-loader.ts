import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
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

  if ("docstring" in spec.tool) {
    throw new Error(`Invalid spec in ${filePath}: use only tool.description (docstring is not supported)`);
  }

  if (!isRecord(spec.execution) || !isRecord(spec.execution.command)) {
    throw new Error(`Invalid spec in ${filePath}: execution.command is required`);
  }

  if (typeof spec.execution.command.executable !== "string" || spec.execution.command.executable.length === 0) {
    throw new Error(`Invalid spec in ${filePath}: execution.command.executable is required`);
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
    specs.push(parsed);
  }

  return specs;
}
