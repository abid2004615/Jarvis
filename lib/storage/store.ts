/**
 * P15 — Shared Store Base
 *
 * Provides common patterns for all server-side JSON stores:
 * atomic writes, corruption quarantine, schema versioning,
 * backup-before-overwrite, and migration support.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export const CURRENT_SCHEMA_VERSION = 1;

export interface StoreOptions {
  storageDir: "cwd" | "home";
  fileName: string;
  schemaVersion?: number;
  maxFileSize?: number;
}

export interface StoreData<T> {
  version: number;
  updatedAt: number;
  data: T;
}

export type MigrationFn<T> = (oldData: unknown, fromVersion: number) => T;

/**
 * Resolve the storage directory based on the option.
 */
function resolveStorageDir(storageDir: "cwd" | "home"): string {
  if (storageDir === "home") {
    return path.join(os.homedir(), ".jarvis");
  }
  return path.join(process.cwd(), ".jarvis");
}

/**
 * Ensure the storage directory exists.
 */
function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Create a generic file-backed store with migration and backup support.
 */
export function createFileStore<T>(
  options: StoreOptions,
  defaultValue: T,
  migrations?: Record<number, MigrationFn<T>>,
): {
  load: () => T;
  save: (data: T) => void;
  getFilePath: () => string;
  backup: () => string | null;
  reset: () => void;
} {
  const dir = resolveStorageDir(options.storageDir);
  const filePath = path.join(dir, options.fileName);
  const schemaVersion = options.schemaVersion || CURRENT_SCHEMA_VERSION;

  function getFilePath(): string {
    return filePath;
  }

  function load(): T {
    try {
      if (!fs.existsSync(filePath)) {
        return defaultValue;
      }

      const raw = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(raw);

      // Validate schema version
      if (parsed.version === undefined) {
        // No version — treat as v1 legacy data
        return applyMigrations(parsed.data || parsed, 1);
      }

      if (parsed.version === schemaVersion) {
        return parsed.data as T;
      }

      // Migration needed
      if (parsed.version < schemaVersion) {
        return applyMigrations(parsed.data, parsed.version);
      }

      // Future version — quarantine
      quarantineFile(filePath, "future_version");
      return defaultValue;
    } catch (error) {
      quarantineFile(filePath, "corrupt");
      return defaultValue;
    }
  }

  function applyMigrations(data: unknown, fromVersion: number): T {
    let current = data;

    if (migrations) {
      for (let v = fromVersion; v < schemaVersion; v++) {
        const migrationFn = migrations[v + 1];
        if (migrationFn) {
          try {
            current = migrationFn(current, v);
          } catch {
            quarantineFile(filePath, `migration_v${v}_failed`);
            return defaultValue;
          }
        }
      }
    }

    return current as T;
  }

  function save(data: T): void {
    try {
      ensureDir(path.dirname(filePath));

      const wrapped: StoreData<T> = {
        version: schemaVersion,
        updatedAt: Date.now(),
        data,
      };

      const json = JSON.stringify(wrapped, null, 2);

      // Backup existing file before overwrite (if it exists)
      if (fs.existsSync(filePath)) {
        backupFile(filePath);
      }

      // Atomic write: temp file + rename
      const tmpPath = `${filePath}.tmp`;
      fs.writeFileSync(tmpPath, json, "utf-8");
      fs.renameSync(tmpPath, filePath);
    } catch {
      // Best effort — do not crash the application
    }
  }

  function backup(): string | null {
    return backupFile(filePath);
  }

  function reset(): void {
    try {
      if (fs.existsSync(filePath)) {
        quarantineFile(filePath, "manual_reset");
      }
    } catch {
      // Best effort
    }
  }

  return { load, save, getFilePath, backup, reset };
}

/**
 * Backup a file by copying it with a timestamp suffix.
 */
function backupFile(filePath: string): string | null {
  try {
    if (!fs.existsSync(filePath)) return null;

    const timestamp = Date.now();
    const backupPath = `${filePath}.backup-${timestamp}`;
    fs.copyFileSync(filePath, backupPath);
    return backupPath;
  } catch {
    return null;
  }
}

/**
 * Quarantine a corrupt file by renaming it.
 */
function quarantineFile(filePath: string, reason: string): void {
  try {
    if (!fs.existsSync(filePath)) return;

    const timestamp = Date.now();
    const quarantinePath = `${filePath}.corrupt-${reason}-${timestamp}`;
    fs.renameSync(filePath, quarantinePath);
  } catch {
    // Best effort
  }
}

/**
 * Get storage info for diagnostics.
 */
export function getStorageInfo(): {
  memory: { exists: boolean; size?: number };
  personalization: { exists: boolean; size?: number };
  goals: { exists: boolean; size?: number };
  automations: { exists: boolean; size?: number };
  tasks: { exists: boolean; size?: number };
  reminders: { exists: boolean; size?: number };
  routines: { exists: boolean; size?: number };
} {
  function getInfo(dir: "cwd" | "home", fileName: string) {
    try {
      const storageDir = resolveStorageDir(dir);
      const filePath = path.join(storageDir, fileName);
      if (fs.existsSync(filePath)) {
        const stat = fs.statSync(filePath);
        return { exists: true, size: stat.size };
      }
    } catch {
      // Best effort
    }
    return { exists: false };
  }

  return {
    memory: getInfo("cwd", "memory.json"),
    personalization: getInfo("cwd", "personalization.json"),
    goals: getInfo("home", "goals.json"),
    automations: getInfo("home", "automations.json"),
    tasks: getInfo("home", "tasks.json"),
    reminders: getInfo("home", "reminders.json"),
    routines: getInfo("home", "routines.json"),
  };
}
