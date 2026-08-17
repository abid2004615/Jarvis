/**
 * JARVIS Personal Tasks — Storage
 *
 * Persistence lives on the server in a fixed application-controlled path at
 * `~/.jarvis/tasks.json` (override-able for tests). The path is never derived
 * from user or model input. Writes are atomic (temp file + rename), the store
 * is bounded, and a corrupt file is quarantined rather than destroyed.
 *
 * Task storage is SEPARATE from automations, reminders, routines, memory, and
 * conversation context — this module only ever touches its own file.
 */

import fs from "fs";
import os from "os";
import path from "path";

import { TASK_LIMITS, TASK_STORAGE_DIR, TASK_STORAGE_FILE, type Task, type TaskStoreData } from "./types";
import { isTaskLike } from "./model";

export interface TaskStore {
  load(): Task[];
  save(tasks: Task[]): void;
}

/** Canonical on-disk location of the task store. */
export function getDefaultTaskFilePath(): string {
  // Application-controlled path under the user's home directory. Never derived
  // from user/model input.
  return path.join(
    /* turbopackIgnore: true */ os.homedir(),
    TASK_STORAGE_DIR,
    TASK_STORAGE_FILE,
  );
}

/** File-backed store with atomic writes and corrupt-file recovery. */
export class TaskFileStore implements TaskStore {
  private readonly filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath ?? getDefaultTaskFilePath();
  }

  getFilePath(): string {
    return this.filePath;
  }

  load(): Task[] {
    if (!fs.existsSync(/* turbopackIgnore: true */ this.filePath)) {
      return [];
    }
    try {
      const raw = fs.readFileSync(/* turbopackIgnore: true */ this.filePath, "utf8");
      const parsed = JSON.parse(raw) as TaskStoreData;
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.tasks)) {
        return this.recoverCorrupt();
      }
      return parsed.tasks
        .filter(isTaskLike)
        .slice(0, TASK_LIMITS.MAX_TASKS)
        .sort((a, b) => a.createdAt - b.createdAt);
    } catch {
      return this.recoverCorrupt();
    }
  }

  save(tasks: Task[]): void {
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(/* turbopackIgnore: true */ dir, { recursive: true });

    const bounded = tasks.slice(0, TASK_LIMITS.MAX_TASKS);
    const payload: TaskStoreData = {
      version: 1,
      updatedAt: Date.now(),
      tasks: bounded,
    };

    const tempPath = `${this.filePath}.tmp`;
    fs.writeFileSync(/* turbopackIgnore: true */ tempPath, JSON.stringify(payload, null, 2), "utf8");
    fs.renameSync(/* turbopackIgnore: true */ tempPath, this.filePath);
  }

  /** Quarantine a corrupt/unreadable store and start fresh. */
  private recoverCorrupt(): Task[] {
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
export class InMemoryTaskStore implements TaskStore {
  private tasks: Task[] = [];

  load(): Task[] {
    return this.tasks.map((t) => ({ ...t }));
  }

  save(tasks: Task[]): void {
    this.tasks = tasks.map((t) => ({ ...t }));
  }

  /** Test helper: prime the store directly. */
  seed(tasks: Task[]): void {
    this.tasks = tasks.map((t) => ({ ...t }));
  }

  get raw(): Task[] {
    return this.tasks;
  }
}
