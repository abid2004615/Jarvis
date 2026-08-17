/**
 * JARVIS Automation — Storage
 *
 * Persistence lives on the server, in a fixed application-controlled path at
 * `~/.jarvis/automations.json` (override-able for tests). The path is never
 * derived from user or model input. Writes are atomic (temp file + rename),
 * the store is bounded, and a corrupt file is quarantined rather than silently
 * destroyed. Automation storage is SEPARATE from conversation context and
 * persistent user memory — this module only ever touches its own file.
 */

import fs from "fs";
import os from "os";
import path from "path";

import {
  AUTOMATION_LIMITS,
  AUTOMATION_STORAGE_DIR,
  AUTOMATION_STORAGE_FILE,
  type Automation,
  type AutomationStoreData,
} from "./types";
import { isAutomationLike } from "./model";

export interface AutomationStore {
  load(): Automation[];
  save(automations: Automation[]): void;
}

/** Canonical on-disk location of the automation store. */
export function getDefaultAutomationFilePath(): string {
  // Application-controlled path under the user's home directory. Never derived
  // from user/model input.
  return path.join(
    /* turbopackIgnore: true */ os.homedir(),
    AUTOMATION_STORAGE_DIR,
    AUTOMATION_STORAGE_FILE,
  );
}

/**
 * File-backed store with atomic writes and corrupt-file recovery.
 */
export class AutomationFileStore implements AutomationStore {
  private readonly filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath ?? getDefaultAutomationFilePath();
  }

  getFilePath(): string {
    return this.filePath;
  }

  load(): Automation[] {
    if (!fs.existsSync(/* turbopackIgnore: true */ this.filePath)) {
      return [];
    }
    try {
      const raw = fs.readFileSync(/* turbopackIgnore: true */ this.filePath, "utf8");
      const parsed = JSON.parse(raw) as AutomationStoreData;
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.automations)) {
        return this.recoverCorrupt();
      }
      return parsed.automations
        .filter(isAutomationLike)
        .slice(0, AUTOMATION_LIMITS.MAX_AUTOMATIONS)
        .sort((a, b) => a.createdAt - b.createdAt);
    } catch {
      return this.recoverCorrupt();
    }
  }

  save(automations: Automation[]): void {
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(/* turbopackIgnore: true */ dir, { recursive: true });

    const bounded = automations.slice(0, AUTOMATION_LIMITS.MAX_AUTOMATIONS);
    const payload: AutomationStoreData = {
      version: 1,
      updatedAt: Date.now(),
      automations: bounded,
    };

    const tempPath = `${this.filePath}.tmp`;
    fs.writeFileSync(/* turbopackIgnore: true */ tempPath, JSON.stringify(payload, null, 2), "utf8");
    fs.renameSync(/* turbopackIgnore: true */ tempPath, this.filePath);
  }

  /** Quarantine a corrupt/unreadable store and start fresh. */
  private recoverCorrupt(): Automation[] {
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
export class InMemoryAutomationStore implements AutomationStore {
  private automations: Automation[] = [];

  load(): Automation[] {
    return this.automations.map((a) => ({ ...a }));
  }

  save(automations: Automation[]): void {
    this.automations = automations.map((a) => ({ ...a }));
  }

  /** Test helper: prime the store directly. */
  seed(automations: Automation[]): void {
    this.automations = automations.map((a) => ({ ...a }));
  }

  get raw(): Automation[] {
    return this.automations;
  }
}
