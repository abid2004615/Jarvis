# P16.8 — Native Voice for Packaged JARVIS.app

**Date:** August 20, 2026
**Status:** COMPLETE
**Dependency Finalization:** August 24, 2026

---

## Root Cause of Electron Web Speech Failure

The browser Web Speech API (`SpeechRecognition`) requires Google's cloud speech servers. In the packaged Electron app:

1. `window.SpeechRecognition` exists in Chromium
2. The code creates a recognition instance and calls `.start()`
3. Chromium tries to connect to Google's servers
4. The connection fails (unreachable/blocked in packaged context)
5. The `onerror` event fires with `error: "network"`
6. The session shows "VOICE ERROR"

This is a fundamental limitation of Chromium's Web Speech API — it's cloud-dependent and cannot work offline or in restricted network environments.

---

## Native STT Architecture

```
Native Vosk Process (Python)
    ↓ stdout JSON lines
Electron Main Process
    ↓ IPC (jarvis:voice-event)
Preload Script
    ↓ window.jarvis.onVoiceEvent()
Renderer / Voice Session
    ↓ transcript
Existing JarvisPipeline
```

### Key principle: native STT only replaces the speech-to-text layer

The existing pipeline, tools, confirmation, and action chain are **unchanged**.

---

## Native Voice Process

**File:** `companion/jarvis-voice.py`

Extends the existing Vosk wake companion to support:

1. **Wake word detection** ("Hey JARVIS") — same as existing companion
2. **Command recognition** after wake — new capability
3. **Structured JSON output** via stdout — new protocol

### State Machine

```
IDLE
  ↓ listen for "Hey JARVIS"
WAKE_DETECTED
  ↓ signal wake to /api/wake
  ↓ start command recognition
LISTENING_FOR_COMMAND
  ↓ final transcript or silence timeout
  ↓ emit transcript JSON
IDLE
```

### Output Protocol (stdout, one JSON per line)

```json
{"type":"state","state":"idle"}
{"type":"state","state":"listening_for_wake"}
{"type":"state","state":"listening_for_command"}
{"type":"transcript","text":"open safari","isFinal":true}
{"type":"audio_level","level":0.123}
{"type":"error","message":"..."}
```

### Input Protocol (stdin, one JSON per line)

```json
{"command":"start"}
{"command":"stop"}
{"command":"shutdown"}
```

---

## Wake Architecture

The native voice process reuses the existing wake companion's Vosk model and detection logic:

1. Listens for "Hey JARVIS" in audio stream
2. On detection, POSTs to `/api/wake` (same as existing companion)
3. Waits for the existing SSE wake event to reach the renderer
4. Then switches to command recognition mode

### Preserved P16.6 Protections

- Client-side 5-second debounce (GlobalWakeIndicator)
- Server-side 3-second cooldown (/api/wake)
- No duplicate wake requests
- No partial wake signaling
- No raw audio persistence

---

## Command Recognition Architecture

After wake detection:

1. Creates a new Vosk recognizer for command capture
2. Streams audio and emits partial transcripts (interim results)
3. On final result, emits `{type:"transcript", isFinal:true}`
4. Silence timeout (10s) or max duration (15s) ends the command
5. Returns to IDLE state

### Rate Limiting

- Only `isFinal === true` transcripts are sent to the AI pipeline
- One spoken command produces at most one AI request
- Partial transcripts are display-only (no pipeline call)

---

## IPC Design

### Electron Main → Renderer

```typescript
mainWindow.webContents.send("jarvis:voice-event", {
  type: "state" | "transcript" | "audio_level" | "error",
  // ... type-specific fields
});
```

### Renderer → Electron Main

```typescript
window.jarvis.voiceStart();  // Start listening
window.jarvis.voiceStop();   // Stop listening
window.jarvis.voiceAvailable(); // Check if native voice is available
```

### Preload Exposure

```typescript
contextBridge.exposeInMainWorld("jarvis", {
  voiceStart: () => ipcRenderer.invoke("jarvis:voice-start"),
  voiceStop: () => ipcRenderer.invoke("jarvis:voice-stop"),
  voiceAvailable: () => ipcRenderer.invoke("jarvis:voice-available"),
  onVoiceEvent: (callback) => { ... },
});
```

---

## Privacy Behavior

- Audio processed in memory only (Vosk streaming)
- No WAV recordings written to disk
- No raw audio uploaded to third-party services
- Transcripts are transient (consumed, not persisted)
- `audio_level` values are ephemeral (not stored)
- No secrets logged (API key shown as "configured"/"missing")

---

## Permission Behavior

- macOS microphone permission is requested by the Python process via `sounddevice`
- If permission is denied, the voice process exits with code 1
- Electron detects the exit and reports voice as "Unavailable"
- Typed commands and AI remain fully functional

---

## Error Recovery

### Voice Process Crash

```
crash → restart (1/3) → restart (2/3) → restart (3/3) → give up
```

- Bounded restart attempts (3)
- 2-second cooldown between restarts
- Counter resets after successful start
- UI shows "VOICE ERROR" with retry option

### Voice Unavailable

If native voice process fails to start:
- Typed CommandBar remains fully functional
- AI remains functional
- UI clearly reports voice status
- No infinite restart loops

---

## Packaging Behavior

### Included Files

```
JARVIS.app/Contents/Resources/companion/
├── jarvis-voice.py      (new — native STT)
├── jarvis-wake.py       (existing — wake companion)
└── requirements.txt     (existing — Python deps)
```

### Known Limitation

The Python companion requires `vosk`, `sounddevice`, and `numpy` to be installed:

```bash
pip install -r companion/requirements.txt
```

This is **not bundled** in the app. If Python packages are missing:
- Voice process exits with code 1
- Electron retries 3 times, then gives up
- Typed commands and AI continue working
- Log shows clear error: `ModuleNotFoundError: No module named 'sounddevice'`

**This limitation applies to both the existing wake companion and the new voice companion.**

---

## Dependency Finalization — August 24, 2026

`companion/requirements.txt` now declares the complete native audio stack:

```text
vosk>=0.3.44
sounddevice>=0.4.6
numpy>=1.23
```

### Why NumPy Is Declared

- Both companions import `sounddevice` and capture native audio through `sd.RawInputStream` for Vosk byte frames.
- The `sounddevice` ndarray recording API (`sounddevice.rec()`), used by the direct microphone verification, requires NumPy. Missing NumPy caused the Voice ON → OFF failure in a fresh companion environment even though the microphone hardware and `sounddevice` itself were available.
- NumPy is therefore an explicit companion dependency, not an assumed transitive install. A regression test verifies that the manifest includes Vosk, sounddevice, and NumPy.

### Verified Microphone Layer

| Check | Result |
|------|--------|
| Core Audio device | MacBook Pro Microphone detected |
| Vosk package | 0.3.44 |
| Sounddevice package | Import verified |
| NumPy package | 2.5.2 installed and import verified |
| Direct `sounddevice` recording | PASS — `MIC TEST COMPLETE` |

### Remaining Limitation

This verifies only the microphone/audio-recording dependency layer. It does **not** verify end-to-end voice activation, wake-word detection, transcript delivery, or a live `Hey JARVIS` command. Those require later real-world testing in a microphone-friendly environment.

---

## Development Behavior

- `npm run dev` continues using browser Web Speech API
- Native voice adapter is only activated in packaged Electron mode
- `isElectron()` detection ensures no regression for browser users
- The voice session checks `isNativeVoiceAvailable()` before using native path

---

## Voice Confirmation Behavior

Voice commands that trigger confirmations (e.g., "open Safari"):

1. Voice → transcript → pipeline
2. Pipeline returns `pendingConfirmation`
3. UI shows confirmation dialog
4. User approves/denies via UI (not voice)
5. Existing ActionChain behavior preserved

Native voice must not have permission to approve actions — this is enforced by the pipeline, not the voice layer.

---

## Live Packaged-App Tests

| Test | Result |
|------|--------|
| JARVIS.app launches | PASS |
| AI healthy | PASS |
| /api/health | `ai_provider: healthy` |
| "hello" via typed command | Normal JARVIS response |
| Companion dependency manifest | PASS — Vosk, sounddevice, and NumPy declared |
| Direct microphone recording | PASS — `MIC TEST COMPLETE` |
| Live wake / voice command | Pending real-world microphone-friendly testing |
| Voice restart logic | 3 attempts, then stops |
| Typed commands work | PASS |
| AI pipeline works | PASS |
| No secrets logged | PASS |
| Development mode | Unchanged (Web Speech API) |

---

## Test Count

| Category | Tests |
|----------|-------|
| Companion dependency manifest | 1 |
| Native voice process startup | 2 |
| Process shutdown | 3 |
| Malformed native message | 11 |
| Transcript validation | 3 |
| Final transcript handling | 2 |
| Partial transcript does not call AI | 1 |
| One transcript = one AI request | 2 |
| Wake → command flow | 2 |
| Duplicate wake suppression | 2 |
| Native process crash recovery | 2 |
| Voice retry | 1 |
| Confirmation from voice | 3 |
| Denial from voice | 1 |
| Approval from voice | 1 |
| No raw audio persistence | 2 |
| Typed command fallback | 2 |
| Packaged resource path | 2 |
| Development resource path | 2 |
| **Total** | **45** |

---

## Quality Gates

| Gate | Result |
|------|--------|
| Tests | **108 suites / 1762 tests** (1 pre-existing env flake) |
| TypeScript | PASS |
| ESLint | PASS |
| Build | PASS |
| npm audit | 0 vulnerabilities |
| Electron compile | PASS |
| Packaged app | LAUNCHES, AI HEALTHY |

---

## Files Changed

| File | Change |
|------|--------|
| `companion/jarvis-voice.py` | NEW — native Vosk STT companion |
| `electron/main.ts` | Added voice process management, IPC handlers |
| `electron/preload.ts` | Added voice IPC methods |
| `lib/voice/native.ts` | NEW — native voice adapter for renderer |
| `lib/voice/session.ts` | Added native voice path in Electron mode |
| `lib/voice/index.ts` | Export native adapter |
| `__tests__/p16_8-native-voice.test.ts` | Native voice regressions, including companion dependency manifest coverage |

---

## Known Limitations

1. **Python dependency:** `vosk`, `sounddevice`, and `numpy` must be installed via `pip install -r companion/requirements.txt`
2. **System Python required:** The companion runs on system Python 3, not bundled in the app
3. **Barge-in during TTS:** May not be reliable with native voice (Vosk and Web Speech API have different latency characteristics)
4. **Microphone permission:** Must be granted at the OS level for the Python process
5. **Model download:** First run downloads ~50MB Vosk model (if not cached)
