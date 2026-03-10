import { copyFile, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const META_DIR_NAME = ".mcp-shell";
const META_FILE_NAME = "spec-version.json";

interface SpecVersionMeta {
  version: string;
}

export interface EnsureSpecDirectoryReadyOptions {
  targetSpecDir: string;
  bundledSpecDir: string;
  currentVersion: string;
}

export async function ensureSpecDirectoryReady(options: EnsureSpecDirectoryReadyOptions): Promise<void> {
  const targetSpecDir = path.resolve(options.targetSpecDir);
  const bundledSpecDir = path.resolve(options.bundledSpecDir);

  await mkdir(targetSpecDir, { recursive: true });

  if (targetSpecDir === bundledSpecDir) {
    await writeVersionMeta(targetSpecDir, options.currentVersion);
    return;
  }

  const hasEntries = await directoryHasEntries(targetSpecDir);
  const installedVersion = await readInstalledVersion(targetSpecDir);
  const shouldInstall = !hasEntries || !installedVersion || compareVersions(installedVersion, options.currentVersion) < 0;
  if (!shouldInstall) {
    return;
  }

  await syncBundledSpecs(bundledSpecDir, targetSpecDir);
  await writeVersionMeta(targetSpecDir, options.currentVersion);
}

export async function resolveBundledSpecDir(moduleFileUrl: string): Promise<string> {
  const moduleDir = path.dirname(fileURLToPath(moduleFileUrl));
  const candidates = [
    path.resolve(moduleDir, "../specs"),
    path.resolve(moduleDir, "../../specs"),
  ];

  for (const candidate of candidates) {
    if (await existsDirectory(candidate)) {
      return candidate;
    }
  }

  throw new Error("Unable to locate bundled specs directory. Ensure package includes ./specs.");
}

async function syncBundledSpecs(sourceDir: string, targetDir: string): Promise<void> {
  const entries = await readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === META_DIR_NAME) {
      continue;
    }

    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      await mkdir(targetPath, { recursive: true });
      await syncBundledSpecs(sourcePath, targetPath);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    await mkdir(path.dirname(targetPath), { recursive: true });
    await copyFile(sourcePath, targetPath);
  }
}

async function directoryHasEntries(dirPath: string): Promise<boolean> {
  const entries = await readdir(dirPath);
  return entries.length > 0;
}

async function readInstalledVersion(specDir: string): Promise<string | undefined> {
  try {
    const metaPath = getVersionMetaPath(specDir);
    const raw = await readFile(metaPath, "utf8");
    const parsed = JSON.parse(raw) as SpecVersionMeta;
    if (typeof parsed.version !== "string" || parsed.version.length === 0) {
      return undefined;
    }
    return parsed.version;
  } catch {
    return undefined;
  }
}

async function writeVersionMeta(specDir: string, version: string): Promise<void> {
  const metaDir = path.join(specDir, META_DIR_NAME);
  await mkdir(metaDir, { recursive: true });
  await writeFile(getVersionMetaPath(specDir), `${JSON.stringify({ version }, null, 2)}\n`, "utf8");
}

function getVersionMetaPath(specDir: string): string {
  return path.join(specDir, META_DIR_NAME, META_FILE_NAME);
}

function parseVersion(input: string): number[] {
  const core = input.split("-")[0];
  return core.split(".").map((segment) => {
    const value = Number(segment);
    return Number.isFinite(value) && value >= 0 ? value : 0;
  });
}

function compareVersions(left: string, right: string): number {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = leftParts[index] ?? 0;
    const rightValue = rightParts[index] ?? 0;
    if (leftValue > rightValue) {
      return 1;
    }
    if (leftValue < rightValue) {
      return -1;
    }
  }

  return 0;
}

async function existsDirectory(filePath: string): Promise<boolean> {
  try {
    const stats = await stat(filePath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}
