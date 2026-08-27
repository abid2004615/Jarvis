/**
 * Native wake-word recognition regression tests.
 *
 * Root cause (verified empirically with the bundled vosk-small-en-us-0.15
 * model): the model transcribes "hey jarvis" as "they jarvis", "hey
 * jeremy", "hey joe", "hey joe is", "hey joe louis", "hey journalists"
 * or "hey is", so the old exact-substring check never matched and the wake
 * event never fired. The tiny model also coerces *rejected* speech into
 * phrase-like text ("hey service"->"they jarvis", "ok jarvis"->"hey
 * jarvis"), so widening a fuzzy edit distance would have caused false wakes.
 *
 * These tests pin the fix: `companion/wake_word.py` runs a dedicated
 * phrase-constrained vosk grammar (configured phrase + observed variants).
 * When the grammar ends an utterance, the exact buffered audio is replayed
 * through a fresh open recognizer padded with silence — the open recognizer's
 * final is therefore aligned to the grammar's boundaries instead of a
 * mid-word flush (a real-mic forced flush once decoded wake audio as
 * "interests"). That final must exactly match a known wake form — never a
 * substring, never a lagging partial. The voice companion uses this listener
 * in `idle` AND `listening_for_wake`, and the offline suite in
 * test_wake_recognition.py drives the REAL bundled model speaker fixtures
 * through the same listener.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const COMPANION_DIR = path.join(process.cwd(), "companion");
const VOICE_SCRIPT = path.join(COMPANION_DIR, "jarvis-voice.py");
const WAKE_SCRIPT = path.join(COMPANION_DIR, "jarvis-wake.py");
const MATCHER = path.join(COMPANION_DIR, "wake_match.py");
const LISTENER = path.join(COMPANION_DIR, "wake_word.py");
const OFFLINE_SUITE = path.join(COMPANION_DIR, "test_wake_recognition.py");
const VENV_PY = path.join(COMPANION_DIR, ".venv", "bin", "python");
const PHRASE = "hey jarvis";

function python3Available(): boolean {
  try {
    execFileSync("python3", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const hasPython = python3Available();
const pyIt = hasPython ? it : it.skip;

// Runs a python expression against the companion python modules.
function runPython(script: string, ...args: string[]): string {
  return execFileSync("python3", ["-c", script, ...args], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
}

describe("Native wake-word recognition — exact accept-set gate", () => {
  // Reported + synthesized transcriptions of the wake phrase must wake;
  // near-miss and arbitrary speech must NOT — and not just via a fuzzy
  // distance either (that is what would make "hey service" wake).
  const cases: Array<[string, boolean]> = [
    ["hey jarvis", true],
    ["they jarvis", true],
    ["hey jeremy", true],
    ["hey joe", true],
    ["hey joe is", true],
    ["hey joe louis", true],
    ["hey journalists", true],
    ["hey is", true],
    ["hey service", false],
    ["ok jarvis", false],
    ["hi jarvis", false],
    ["a jarvis", false],
    ["the jarvis", false],
    ["what is my cpu usage", false],
    ["happy birthday", false],
    ["hey", false],
    ["jarvis", false],
    ["interests", false],
    ["", false],
    ["is louis hey hey joe louis is", false],
  ];

  pyIt("accepts observed transcriptions and rejects near/arbitrary speech", () => {
    const script = `
import json, sys
sys.path.insert(0, ${JSON.stringify(COMPANION_DIR)})
from wake_match import contains_wake
cases = json.loads(sys.argv[1])
out = [[t, contains_wake(t, "hey jarvis")] for t, _ in cases]
print(json.dumps(out))
`;
    const stdout = runPython(script, JSON.stringify(cases));
    const results = JSON.parse(stdout.trim()) as Array<[string, boolean]>;
    expect(results).toHaveLength(cases.length);
    for (const [text, expected] of cases) {
      const actual = results.find(([t]) => t === text)?.[1];
      expect({ text, actual }).toEqual({ text, actual: expected });
    }
  });

  pyIt("normalizes punctuation and whitespace before matching", () => {
    const script = `
import json, sys
sys.path.insert(0, ${JSON.stringify(COMPANION_DIR)})
from wake_match import contains_wake, normalize_text
print(json.dumps([
    normalize_text("Hey,   JARVIS!!"),
    normalize_text("  hey jarvis  "),
    contains_wake("HEY JARVIS.", "hey jarvis"),
    contains_wake("Hey... Jarvis?!", "hey jarvis"),
]))
`;
    const [punctuated, padded, upperPunct, spacedPunct] = JSON.parse(
      runPython(script).trim(),
    ) as [string, string, boolean, boolean];
    expect(punctuated).toBe("hey jarvis");
    expect(padded).toBe("hey jarvis");
    expect(upperPunct).toBe(true);
    expect(spacedPunct).toBe(true);
  });

  pyIt("grammar contains the phrase plus only the observed variants", () => {
    const script = `
import json, sys
sys.path.insert(0, ${JSON.stringify(COMPANION_DIR)})
from wake_match import build_wake_grammar, wake_accept_set, OBSERVED_WAKE_VARIANTS
g = build_wake_grammar("hey jarvis")
acc = wake_accept_set("hey jarvis")
print(json.dumps({
    "count": len(g),
    "has_phrase": "hey jarvis" in g,
    "has_variants": all(v in g for v in OBSERVED_WAKE_VARIANTS),
    "rejects_not_in_set": ("hey service" not in acc) and ("ok jarvis" not in acc),
    "dedupe": len(g) == len(set(g)),
}))
`;
    const result = JSON.parse(runPython(script).trim()) as {
      count: number;
      has_phrase: boolean;
      has_variants: boolean;
      rejects_not_in_set: boolean;
      dedupe: boolean;
    };
    expect(result).toEqual({
      count: 8,
      has_phrase: true,
      has_variants: true,
      rejects_not_in_set: true,
      dedupe: true,
    });
  });

  pyIt("keeps the open-confirmation matcher tight (no wide edit distance)", () => {
    const script = `
import json, sys
sys.path.insert(0, ${JSON.stringify(COMPANION_DIR)})
from wake_match import matches_wake_phrase
out = [
    ["hey jarvis", matches_wake_phrase("hey jarvis", "hey jarvis")],
    ["they jarvis", matches_wake_phrase("they jarvis", "hey jarvis")],
    ["hey jeremy", matches_wake_phrase("hey jeremy", "hey jarvis")],
    ["hey service", matches_wake_phrase("hey service", "hey jarvis")],
    ["jarvis", matches_wake_phrase("jarvis", "hey jarvis")],
]
print(json.dumps(out))
`;
    const results = JSON.parse(runPython(script).trim()) as Array<
      [string, boolean]
    >;
    expect(results).toEqual([
      ["hey jarvis", true],
      ["they jarvis", true],
      ["hey jeremy", false],
      ["hey service", false],
      ["jarvis", false],
    ]);
  });
});

describe("Native wake-word recognition — offline real-model audio", () => {
  // Drives the BUNDLED vosk model with synthesized 16 kHz fixtures through
  // the same WakeWordListener the companions run, mimicking mic latency with
  // trailing silence. Requires the project venv (has vosk).
  const hasVenv = fs.existsSync(VENV_PY);
  const audioIt = hasVenv ? it : it.skip;

  audioIt(
    "wakes on phrase + observed variants, rejects near/arbitrary, fires once per utterance",
    () => {
      const stdout = execFileSync(VENV_PY, ["test_wake_recognition.py"], {
        cwd: COMPANION_DIR,
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024,
      });
      expect(stdout).toContain("ALL PASS");
      // Exactly one fire per utterance (duplicate-wake debounce).
      expect(stdout).toMatch(/PASS hey-jarvis-16k-mono\.wav\s+fires=1 /);
      expect(stdout).toMatch(/PASS hey-jeremy-16k-mono\.wav\s+fires=1 /);
      expect(stdout).toMatch(/PASS hey-joe-16k-mono\.wav\s+fires=1 /);
      expect(stdout).toMatch(/PASS hey-service-16k-mono\.wav\s+fires=0 /);
      expect(stdout).toMatch(/PASS ok-jarvis-16k-mono\.wav\s+fires=0 /);
      expect(stdout).toMatch(/PASS cpu-usage-16k-mono\.wav\s+fires=0 /);
    },
    60_000,
  );

  if (!hasVenv) {
    console.warn("companion/.venv missing — offline audio suite skipped.");
  }
});

describe("Native wake-word recognition — voice companion", () => {
  it("replays the grammar-segmented utterance through a fresh open recognizer (aligned boundaries, no mid-word flush)", () => {
    const source = fs.readFileSync(LISTENER, "utf8");
    expect(source).toContain("_recognize_chunk");
    expect(source).toContain("self._buffer");
    expect(source).toContain("self._silence_pad()");
    // No streaming open recognizer forced to flush at the grammar boundary.
    expect(source).not.toContain("confirm_rec");
  });

  it("runs the wake listener in idle AND listening_for_wake", () => {
    const source = fs.readFileSync(VOICE_SCRIPT, "utf8");
    expect(source).toMatch(
      /if _state in \("idle", "listening_for_wake"\):/,
    );
    expect(source).toContain("wake.feed(data)");
  });

  it("keeps the configured wake phrase 'hey jarvis'", () => {
    const source = fs.readFileSync(VOICE_SCRIPT, "utf8");
    expect(source).toMatch(/WAKE_PHRASE = "hey jarvis"/);
  });

  it("uses WakeWordListener (grammar + open recognizer confirmation)", () => {
    const source = fs.readFileSync(VOICE_SCRIPT, "utf8");
    expect(source).toContain("from wake_word import WakeWordListener");
    expect(source).toMatch(/wake = WakeWordListener\(/);
  });

  it("fires wake then switches to command listening exactly once", () => {
    const source = fs.readFileSync(VOICE_SCRIPT, "utf8");
    expect(source).toContain("signal_wake(server_url)");
    expect(source).toContain("emit_state(\"listening_for_command\")");
  });

  it("recreates the command recognizer and resets wake after a command", () => {
    const source = fs.readFileSync(VOICE_SCRIPT, "utf8");
    expect(source).toContain("wake.reset()");
    expect(source).toContain("command_rec = KaldiRecognizer(model, SAMPLE_RATE)");
  });

  it("passes the JARVIS_VOSK_DEBUG flag to the wake listener", () => {
    const source = fs.readFileSync(VOICE_SCRIPT, "utf8");
    expect(source).toContain("JARVIS_VOSK_DEBUG");
    expect(source).toContain("debug=VOSK_DEBUG");
  });
});

describe("Native wake-word recognition — wake companion", () => {
  it("uses the dedicated WakeWordListener with the debounce", () => {
    const source = fs.readFileSync(WAKE_SCRIPT, "utf8");
    expect(source).toContain("from wake_word import WakeWordListener");
    expect(source).toContain("wake.feed(data)");
    expect(source).toContain("time.sleep(2)");
  });
});

describe("Native wake-word recognition — artifacts", () => {
  it("keeps the shared modules and offline suite", () => {
    expect(fs.existsSync(MATCHER)).toBe(true);
    expect(fs.existsSync(LISTENER)).toBe(true);
    expect(fs.existsSync(VOICE_SCRIPT)).toBe(true);
    expect(fs.existsSync(WAKE_SCRIPT)).toBe(true);
    expect(fs.existsSync(OFFLINE_SUITE)).toBe(true);
  });

  it("gates verbatim vosk diagnostic logging behind JARVIS_VOSK_DEBUG", () => {
    const source = fs.readFileSync(LISTENER, "utf8");
    expect(source).toContain("debug");
    expect(source).toContain("[VOSK]");
  });
});

// Guard note: if python3 is unavailable we still assert the source pinning,
// but the functional matcher/audio tests are skipped.
if (!hasPython) {
  console.warn(
    "python3 not found — functional wake matcher tests were skipped.",
  );
}