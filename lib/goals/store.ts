/**
 * JARVIS Goal-Oriented Workflows — Storage
 *
 * Persistence lives on the server in a fixed application-controlled path at
 * `~/.jarvis/goals.json` (override-able for tests). The path is never derived
 * from user or model input. Writes are atomic (temp file + rename), the store
 * is bounded, and a corrupt file is quarantined rather than destroyed.
 *
 * Goal storage is SEPARATE from automations, reminders, routines, tasks,
 * memory, and conversation context — this module only ever touches its own file.
 */

import fs from "fs";
import os from "os";
import path from "path";

import { GOAL_LIMITS, GOAL_STORAGE_DIR, GOAL_STORAGE_FILE, type Goal, type GoalStoreData } from "./types";
import { isGoalLike } from "./model";

export interface GoalStore {
  load(): Goal[];
  save(goals: Goal[]): void;
}

/** Canonical on-disk location of the goal store. */
export function getDefaultGoalFilePath(): string {
  return path.join(
    /* turbopackIgnore: true */ os.homedir(),
    GOAL_STORAGE_DIR,
    GOAL_STORAGE_FILE,
  );
}

/** File-backed store with atomic writes and corrupt-file recovery. */
export class GoalFileStore implements GoalStore {
  private readonly filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath ?? getDefaultGoalFilePath();
  }

  getFilePath(): string {
    return this.filePath;
  }

  load(): Goal[] {
    if (!fs.existsSync(/* turbopackIgnore: true */ this.filePath)) {
      return [];
    }
    try {
      const raw = fs.readFileSync(/* turbopackIgnore: true */ this.filePath, "utf8");
      const parsed = JSON.parse(raw) as GoalStoreData;
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.goals)) {
        return this.recoverCorrupt();
      }
      return parsed.goals
        .filter(isGoalLike)
        .slice(0, GOAL_LIMITS.MAX_GOALS)
        .sort((a, b) => a.createdAt - b.createdAt);
    } catch {
      return this.recoverCorrupt();
    }
  }

  save(goals: Goal[]): void {
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(/* turbopackIgnore: true */ dir, { recursive: true });

    const bounded = goals.slice(0, GOAL_LIMITS.MAX_GOALS);
    const payload: GoalStoreData = {
      version: 1,
      updatedAt: Date.now(),
      goals: bounded,
    };

    const tempPath = `${this.filePath}.tmp`;
    fs.writeFileSync(/* turbopackIgnore: true */ tempPath, JSON.stringify(payload, null, 2), "utf8");
    fs.renameSync(/* turbopackIgnore: true */ tempPath, this.filePath);
  }

  /** Quarantine a corrupt/unreadable store and start fresh. */
  private recoverCorrupt(): Goal[] {
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
export class InMemoryGoalStore implements GoalStore {
  private goals: Goal[] = [];

  load(): Goal[] {
    return this.goals.map((g) => ({ ...g }));
  }

  save(goals: Goal[]): void {
    this.goals = goals.map((g) => ({ ...g }));
  }

  /** Test helper: prime the store directly. */
  seed(goals: Goal[]): void {
    this.goals = goals.map((g) => ({ ...g }));
  }

  get raw(): Goal[] {
    return this.goals;
  }
}
