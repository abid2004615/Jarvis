/**
 * JARVIS Personal Routines — Storage
 *
 * Persistence lives on the server in a fixed application-controlled path at
 * `~/.jarvis/routines.json` (override-able for tests). Writes are atomic
 * (temp file + rename), the store is bounded, and a corrupt file is
 * quarantined rather than destroyed.
 *
 * Routine storage is SEPARATE from automations, tasks, reminders, memory, and
 * conversation context — this module only ever touches its own file.
 */

import fs from "fs";
import os from "os";
import path from "path";

import {
  ROUTINE_LIMITS,
  ROUTINE_STORAGE_DIR,
  ROUTINE_STORAGE_FILE,
  type Routine,
  type RoutineStoreData,
} from "./types";
import { isRoutineLike } from "./model";

export interface RoutineStore {
  load(): Routine[];
  save(routines: Routine[]): void;
}

/** Canonical on-disk location of the routine store. */
export function getDefaultRoutineFilePath(): string {
  // Application-controlled path under the user's home directory. Never derived
  // from user/model input.
  return path.join(
    /* turbopackIgnore: true */ os.homedir(),
    ROUTINE_STORAGE_DIR,
    ROUTINE_STORAGE_FILE,
  );
}

/** File-backed store with atomic writes and corrupt-file recovery. */
export class RoutineFileStore implements RoutineStore {
  private readonly filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath ?? getDefaultRoutineFilePath();
  }

  getFilePath(): string {
    return this.filePath;
  }

  load(): Routine[] {
    if (!fs.existsSync(/* turbopackIgnore: true */ this.filePath)) {
      return [];
    }
    try {
      const raw = fs.readFileSync(/* turbopackIgnore: true */ this.filePath, "utf8");
      const parsed = JSON.parse(raw) as RoutineStoreData;
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.routines)) {
        return this.recoverCorrupt();
      }
      return parsed.routines
        .filter(isRoutineLike)
        .slice(0, ROUTINE_LIMITS.MAX_ROUTINES)
        .sort((a, b) => a.createdAt - b.createdAt);
    } catch {
      return this.recoverCorrupt();
    }
  }

  save(routines: Routine[]): void {
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(/* turbopackIgnore: true */ dir, { recursive: true });

    const bounded = routines.slice(0, ROUTINE_LIMITS.MAX_ROUTINES);
    const payload: RoutineStoreData = {
      version: 1,
      updatedAt: Date.now(),
      routines: bounded,
    };

    const tempPath = `${this.filePath}.tmp`;
    fs.writeFileSync(/* turbopackIgnore: true */ tempPath, JSON.stringify(payload, null, 2), "utf8");
    fs.renameSync(/* turbopackIgnore: true */ tempPath, this.filePath);
  }

  /** Quarantine a corrupt/unreadable store and start fresh. */
  private recoverCorrupt(): Routine[] {
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

/** In-memory store for tests. Never touches the filesystem. */
export class InMemoryRoutineStore implements RoutineStore {
  private routines: Routine[] = [];

  load(): Routine[] {
    return this.routines.map((r) => ({ ...r }));
  }

  save(routines: Routine[]): void {
    this.routines = routines.map((r) => ({ ...r }));
  }

  /** Test helper: prime the store directly. */
  seed(routines: Routine[]): void {
    this.routines = routines.map((r) => ({ ...r }));
  }

  get raw(): Routine[] {
    return this.routines;
  }
}
