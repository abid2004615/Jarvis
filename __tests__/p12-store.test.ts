/**
 * P12 Tests — Goal Store
 */

import fs from "fs";
import os from "os";
import path from "path";
import { GoalFileStore, InMemoryGoalStore } from "@/lib/goals/store";
import type { Goal } from "@/lib/goals/types";

function makeGoal(overrides?: Partial<Goal>): Goal {
  const now = Date.now();
  return {
    id: `goal-${now}-${Math.random().toString(36).slice(2)}`,
    title: "Test Goal",
    description: "A test goal",
    type: "multi_step",
    status: "draft",
    priority: "normal",
    createdAt: now,
    updatedAt: now,
    plan: [],
    currentStepIndex: 0,
    progress: 0,
    requiresUserInput: false,
    replanCount: 0,
    maxReplans: 2,
    history: [{ type: "created", timestamp: now }],
    ...overrides,
  };
}

describe("P12 Goal Store", () => {
  describe("GoalFileStore", () => {
    let tmpDir: string;
    let store: GoalFileStore;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "goal-store-test-"));
      store = new GoalFileStore(path.join(tmpDir, "goals.json"));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("should load empty array when no file exists", () => {
      expect(store.load()).toEqual([]);
    });

    it("should save and load goals", () => {
      const goals = [makeGoal(), makeGoal()];
      store.save(goals);
      const loaded = store.load();
      expect(loaded).toHaveLength(2);
      expect(loaded[0].id).toBe(goals[0].id);
      expect(loaded[1].id).toBe(goals[1].id);
    });

    it("should sort by createdAt", () => {
      const g1 = makeGoal({ createdAt: 200 });
      const g2 = makeGoal({ createdAt: 100 });
      store.save([g1, g2]);
      const loaded = store.load();
      expect(loaded[0].id).toBe(g2.id);
      expect(loaded[1].id).toBe(g1.id);
    });

    it("should quarantine corrupt file", () => {
      const filePath = path.join(tmpDir, "goals.json");
      fs.writeFileSync(filePath, "not json!!!", "utf8");
      const loaded = store.load();
      expect(loaded).toEqual([]);
      // Original file should be gone, corrupt file should exist
      expect(fs.existsSync(filePath)).toBe(false);
    });

    it("should use atomic writes (temp + rename)", () => {
      const filePath = path.join(tmpDir, "goals.json");
      store.save([makeGoal()]);
      expect(fs.existsSync(filePath)).toBe(true);
      // No temp file should be left behind
      expect(fs.existsSync(`${filePath}.tmp`)).toBe(false);
    });

    it("should bound loaded goals to MAX_GOALS", () => {
      // Save more than MAX_GOALS - the store bounds on save
      const goals = Array.from({ length: 25 }, () => makeGoal());
      store.save(goals);
      const loaded = store.load();
      expect(loaded.length).toBeLessThanOrEqual(20);
    });

    it("should write versioned store data", () => {
      store.save([makeGoal()]);
      const raw = fs.readFileSync(path.join(tmpDir, "goals.json"), "utf8");
      const parsed = JSON.parse(raw);
      expect(parsed.version).toBe(1);
      expect(parsed.updatedAt).toBeGreaterThan(0);
      expect(Array.isArray(parsed.goals)).toBe(true);
    });
  });

  describe("InMemoryGoalStore", () => {
    it("should load empty array initially", () => {
      const store = new InMemoryGoalStore();
      expect(store.load()).toEqual([]);
    });

    it("should save and load goals", () => {
      const store = new InMemoryGoalStore();
      const goals = [makeGoal(), makeGoal()];
      store.save(goals);
      const loaded = store.load();
      expect(loaded).toHaveLength(2);
    });

    it("should return copies (not references)", () => {
      const store = new InMemoryGoalStore();
      const goal = makeGoal();
      store.save([goal]);
      const loaded = store.load();
      loaded[0].title = "Modified";
      expect(store.load()[0].title).toBe("Test Goal");
    });

    it("should support seed", () => {
      const store = new InMemoryGoalStore();
      const goals = [makeGoal()];
      store.seed(goals);
      expect(store.raw).toHaveLength(1);
    });
  });
});
