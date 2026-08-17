/**
 * JARVIS Personal Reminders — Storage
 *
 * Persistence lives on the server in a fixed application-controlled path at
 * `~/.jarvis/reminders.json` (override-able for tests). Writes are atomic
 * (temp file + rename), the store is bounded, and a corrupt file is
 * quarantined rather than destroyed.
 *
 * Reminder storage is SEPARATE from automations, tasks, routines, memory, and
 * conversation context — this module only ever touches its own file.
 */

import fs from "fs";
import os from "os";
import path from "path";

import {
  REMINDER_LIMITS,
  REMINDER_STORAGE_DIR,
  REMINDER_STORAGE_FILE,
  type Reminder,
  type ReminderStoreData,
} from "./types";
import { isReminderLike } from "./model";

export interface ReminderStore {
  load(): Reminder[];
  save(reminders: Reminder[]): void;
}

/** Canonical on-disk location of the reminder store. */
export function getDefaultReminderFilePath(): string {
  // Application-controlled path under the user's home directory. Never derived
  // from user/model input.
  return path.join(
    /* turbopackIgnore: true */ os.homedir(),
    REMINDER_STORAGE_DIR,
    REMINDER_STORAGE_FILE,
  );
}

/** File-backed store with atomic writes and corrupt-file recovery. */
export class ReminderFileStore implements ReminderStore {
  private readonly filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath ?? getDefaultReminderFilePath();
  }

  getFilePath(): string {
    return this.filePath;
  }

  load(): Reminder[] {
    if (!fs.existsSync(/* turbopackIgnore: true */ this.filePath)) {
      return [];
    }
    try {
      const raw = fs.readFileSync(/* turbopackIgnore: true */ this.filePath, "utf8");
      const parsed = JSON.parse(raw) as ReminderStoreData;
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.reminders)) {
        return this.recoverCorrupt();
      }
      return parsed.reminders
        .filter(isReminderLike)
        .slice(0, REMINDER_LIMITS.MAX_REMINDERS)
        .sort((a, b) => a.createdAt - b.createdAt);
    } catch {
      return this.recoverCorrupt();
    }
  }

  save(reminders: Reminder[]): void {
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(/* turbopackIgnore: true */ dir, { recursive: true });

    const bounded = reminders.slice(0, REMINDER_LIMITS.MAX_REMINDERS);
    const payload: ReminderStoreData = {
      version: 1,
      updatedAt: Date.now(),
      reminders: bounded,
    };

    const tempPath = `${this.filePath}.tmp`;
    fs.writeFileSync(/* turbopackIgnore: true */ tempPath, JSON.stringify(payload, null, 2), "utf8");
    fs.renameSync(/* turbopackIgnore: true */ tempPath, this.filePath);
  }

  /** Quarantine a corrupt/unreadable store and start fresh. */
  private recoverCorrupt(): Reminder[] {
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
export class InMemoryReminderStore implements ReminderStore {
  private reminders: Reminder[] = [];

  load(): Reminder[] {
    return this.reminders.map((r) => ({ ...r }));
  }

  save(reminders: Reminder[]): void {
    this.reminders = reminders.map((r) => ({ ...r }));
  }

  /** Test helper: prime the store directly. */
  seed(reminders: Reminder[]): void {
    this.reminders = reminders.map((r) => ({ ...r }));
  }

  get raw(): Reminder[] {
    return this.reminders;
  }
}
