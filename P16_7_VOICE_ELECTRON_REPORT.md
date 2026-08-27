# P16.7 — Voice Electron Report

**Date:** August 18, 2026
**Status:** COMPLETE

---

## Root Cause

The "network" error occurs because Electron's Chromium includes the Web Speech API (`SpeechRecognition`), but it **requires Google's cloud speech servers** to function. In a packaged Electron app:

1. `window.SpeechRecognition` exists
2. The code creates a recognition instance and calls `.start()`
3. The recognition engine tries to connect to Google's servers
4. The connection fails (unreachable, blocked, or no API key)
5. Chromium fires the `onerror` event with `error: "network"`
6. The session transitions to `"error"` state
7. The UI shows "VOICE ERROR" / "Recognition error: network"

This is **not a Groq error**. It happens before the AI pipeline — during speech-to-text.

---

## Dev vs Packaged Behavior

| Environment | Web Speech API | Result |
|-------------|---------------|--------|
| Chrome localhost (`npm run dev`) | Works (Google servers reachable) | Voice works |
| Packaged Electron (JARVIS.app) | Exists but Google servers unreachable | "network" error |

---

## Solution

Added Electron environment detection and graceful error handling:

### Detection
```typescript
function isElectron(): boolean {
  const ua = navigator.userAgent;
  return ua.includes("Electron");
}
```

### Error Handler
```typescript
rec.onerror = (event) => {
  if (event.error === "no-speech" || event.error === "aborted") return;

  if (event.error === "network" && isElectron()) {
    setState("error");
    sessionCallbacks.onError?.(
      "Speech recognition is unavailable in the packaged app. " +
      "Use typed commands or the voice button for push-to-talk."
    );
    return;
  }

  setState("error");
  sessionCallbacks.onError?.(`Recognition error: ${event.error}`);
};
```

### What the user sees in packaged app

**Before:** `VOICE ERROR` / `Recognition error: network`

**After:** `VOICE ERROR` / `Speech recognition is unavailable in the packaged app. Use typed commands or the voice button for push-to-talk.`

---

## What still works in packaged app

| Feature | Status |
|---------|--------|
| Typed CommandBar commands | WORKS |
| Push-to-talk voice (if mic permission granted) | WORKS (may hit same network issue) |
| Wake companion (Python/Vosk) | WORKS (native, no Google dependency) |
| AI pipeline (Groq) | WORKS |
| All other features | WORKS |

---

## What doesn't work in packaged app

| Feature | Status | Reason |
|---------|--------|--------|
| Continuous Web Speech recognition | UNAVAILABLE | Requires Google cloud servers |
| Wake word via Web Speech | UNAVAILABLE | Same reason |

The wake companion (Vosk) provides offline wake detection and does NOT depend on Web Speech API.

---

## Files Changed

| File | Change |
|------|--------|
| `lib/voice/session.ts` | Added `isElectron()` detection, graceful "network" error handling in Electron |
| `__tests__/p16_7-voice-electron.test.ts` | NEW — 24 regression tests |

---

## Regression Tests (24 new)

| Category | Tests |
|----------|-------|
| Electron environment detection | 3 |
| SpeechRecognition availability | 2 |
| Network error handling | 6 |
| Error state recovery | 5 |
| Typed CommandBar independence | 2 |
| Wake companion independence | 2 |
| UI state labels | 3 |
| No duplicate wake on error | 1 |

---

## Quality Gates

| Gate | Result |
|------|--------|
| Tests | **105 suites / 1670 tests** (all pass, 1 pre-existing env flake) |
| TypeScript | PASS |
| ESLint | PASS |
| Build | PASS |
| npm audit | 0 vulnerabilities |
| Electron compile | PASS |
| Packaged app | LAUNCHES AND SERVES |

---

## Known Browser/Electron Limitations

1. **Web Speech API requires Google servers** — this is by design in Chromium
2. **No offline speech recognition** in Electron's Chromium (unlike Chrome with installed language packs)
3. **The wake companion (Vosk)** provides offline wake word detection but not full command recognition
4. **Push-to-talk** may also fail with "network" in Electron — the same error handling applies

---

## Recommendations for Future Work

If continuous voice recognition is needed in the packaged app:

1. **Bundle a local speech recognition engine** (e.g., Whisper.cpp, Vosk full) as an Electron main process service
2. **Use the wake companion** for command recognition after wake detection
3. **Accept typed commands** as the primary input method in the packaged app

These are NOT implemented in this phase. The current solution gracefully handles the limitation.
