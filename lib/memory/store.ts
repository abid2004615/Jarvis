/**
 * JARVIS Persistent Memory — Storage
 *
 * Persistence lives on the server, in a fixed application-controlled path
 * under the project's `.jarvis/` directory. The path is never derived from
 * user or model input. Writes are atomic (temp file + rename) so a crash can
 * never leave a half-written file. A corrupt or unreadable file is quarantined
 * (renamed to `.corrupt-<timestamp>`) so the user's data is never silently
 * destroyed.
 */

import fs from "fs";
import path from "path";

import {
  MEMORY_CATEGORIES,
  MEMORY_LIMITS,
  MEMORY_STORAGE_DIR,
  MEMORY_STORAGE_FILE,
  type MemoryEntry,
  type MemoryStoreData,
} from "./types";

export interface MemoryStore {
  load(): MemoryEntry[];
  save(entries: MemoryEntry[]): void;
}

function isValidEntry(value: unknown): value is MemoryEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as MemoryEntry;
  return (
    typeof entry.id === "string" &&
    typeof entry.key === "string" &&
    typeof entry.value === "string" &&
    typeof entry.createdAt === "number" &&
    typeof entry.updatedAt === "number" &&
    typeof entry.source === "string" &&
    typeof entry.confidence === "number" &&
    MEMORY_CATEGORIES.includes(entry.category)
  );
}

/** Canonical on-disk location of the persistent memory store. */
export function getDefaultMemoryFilePath(): string {
  // The storage root is intentionally dynamic (project dir at runtime), not a
  // statically bundled path. Next tracing must not treat this as deployable.
  return path.join(/* turbopackIgnore: true */ process.cwd(), MEMORY_STORAGE_DIR, MEMORY_STORAGE_FILE);
}

/**
 * File-backed store with atomic writes and corrupt-file recovery.
 */
export class MemoryFileStore implements MemoryStore {
  private readonly filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath ?? getDefaultMemoryFilePath();
  }

  getFilePath(): string {
    return this.filePath;
  }

  load(): MemoryEntry[] {
    if (!fs.existsSync(/* turbopackIgnore: true */ this.filePath)) {
      return [];
    }
    try {
      const raw = fs.readFileSync(/* turbopackIgnore: true */ this.filePath, "utf8");
      const parsed = JSON.parse(raw) as MemoryStoreData;
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.entries)) {
        return this.recoverCorrupt();
      }
      return parsed.entries.filter(isValidEntry).slice(0, MEMORY_LIMITS.MAX_ENTRIES);
    } catch {
      return this.recoverCorrupt();
    }
  }

  save(entries: MemoryEntry[]): void {
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(/* turbopackIgnore: true */ dir, { recursive: true });

    const bounded = entries.slice(0, MEMORY_LIMITS.MAX_ENTRIES);
    const payload: MemoryStoreData = {
      version: 1,
      updatedAt: Date.now(),
      entries: bounded,
    };

    const tempPath = `${this.filePath}.tmp`;
    fs.writeFileSync(/* turbopackIgnore: true */ tempPath, JSON.stringify(payload, null, 2), "utf8");
    fs.renameSync(/* turbopackIgnore: true */ tempPath, this.filePath);
  }

  /** Quarantine a corrupt/unreadable store and start fresh. */
  private recoverCorrupt(): MemoryEntry[] {
    try {
      if (fs.existsSync(/* turbopackIgnore: true */ this.filePath)) {
        fs.renameSync(/* turbopackIgnore: true */ this.filePath, `${this.filePath}.corrupt-${Date.now()}`);
      }
    } catch {
      // Nothing safe to do if quarantine also fails; return empty.
    }
    return [];
  }
}

/**
 * In-memory store for tests. Never touches the filesystem.
 */
export class InMemoryMemoryStore implements MemoryStore {
  private entries: MemoryEntry[] = [];

  load(): MemoryEntry[] {
    return this.entries;
  }

  save(entries: MemoryEntry[]): void {
    this.entries = entries.map((entry) => ({ ...entry }));
  }

  /** Test helper: prime the store directly. */
  seed(entries: MemoryEntry[]): void {
    this.entries = entries.map((entry) => ({ ...entry }));
  }

  get raw(): MemoryEntry[] {
    return this.entries;
  }
}
