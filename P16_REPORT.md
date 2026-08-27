# P16 Report — Global Wake Word + UI Rebranding + Restructuring

**Date:** 2026-08-17  
**Status:** COMPLETE  
**Tests:** 1740/1740 PASS (111 suites)  
**TypeScript:** PASS  
**Lint:** PASS  
**Build:** PASS  
**Vulnerabilities:** 0

---

## What Changed

### A. Global Wake Word Companion (`companion/`)

**New:** `companion/jarvis-wake.py` — Native macOS wake word listener using vosk (offline speech recognition). Runs continuously, detects "Hey JARVIS" (configurable), signals the Next.js server via HTTP POST.

**New:** `companion/requirements.txt` — Python dependencies (vosk, sounddevice).

**Usage:**
```bash
cd companion
pip install -r requirements.txt
python jarvis-wake.py                    # default: "hey jarvis" on localhost:3000
python jarvis-wake.py --phrase "ok computer" --port 3001
```

**How it works:**
1. Opens system microphone via sounddevice
2. Runs continuous offline speech recognition via vosk
3. When wake phrase detected, sends `POST /api/wake` to Next.js server
4. Browser receives wake event via SSE and activates voice session

### B. Wake Signal API (`/api/wake`)

**New:** `app/api/wake/route.ts` — Dual-purpose endpoint:
- `POST /api/wake` — Receives wake signals from native companion, broadcasts to all connected browser clients via SSE
- `GET /api/wake` — SSE stream for browser clients to subscribe to wake events

**Architecture:**
```
Python Companion → POST /api/wake → Broadcast → Browser SSE → VoiceSession.start()
```

### C. Global Wake Indicator Component

**New:** `components/GlobalWakeIndicator.tsx` — Real-time display of wake companion connection status. Shows:
- Green dot when companion is connected
- "WAKE CONNECTING..." when reconnecting
- Last wake detection timestamp

### D. Voice Settings Expansion

**Updated:** `lib/voice/settings.ts` — Added two new fields:
- `globalWakeEnabled: boolean` — Toggle for global wake word detection
- `globalWakePhrase: string` — Configurable wake phrase (default: "hey jarvis")

### E. UI Rebranding

**Updated:** `app/layout.tsx`:
- Title: `"ULTRON Orb UI"` → `"JARVIS"`
- Description: `"An Iron Man-inspired holographic orb..."` → `"JARVIS — Intelligent Personal Assistant"`

**Updated:** `package.json`:
- Name: `"ultron-orb-ui"` → `"jarvis-assistant"`

### F. New UI Components

**New:** `components/JarvisHeader.tsx` — Clean top bar with:
- JARVIS logo + name (top-left)
- System status dot (green/red)
- Wake companion status
- Current time

**New:** `components/CommandBar.tsx` — Text command input (bottom-center):
- Monospace `>` prompt
- Text input field
- SEND button
- Keyboard shortcut: type and press Enter

### G. UI Restructuring (`components/JarvisOrb.tsx`)

**Removed:**
- Raw telemetry monitor (CPU/MEM/NET/BAT/TIME as raw numbers in top-left)
- Old "J.A.R.V.I.S." title
- Camera status bar text (simplified)
- Zoom control buttons (kept keyboard shortcuts)

**Added:**
- `<JarvisHeader>` — new top bar with branding + status
- `<CommandBar>` — text command input at bottom
- `<GlobalWakeIndicator>` — wake companion status in settings panel
- `.quick-stats` — clean sidebar (left side) with CPU/MEM/NET/BAT
- `.system-overview` — right panel with system status summary
- Settings panel now includes: Global Wake toggle, wake phrase display, companion instructions

**Restructured layout:**
```
┌─────────────────────────────────────────────┐
│ [J] JARVIS          ● ONLINE  WAKE  14:30   │ ← JarvisHeader
├──────┬──────────────────────┬───────────────┤
│ CPU  │                      │ SYSTEM        │
│ MEM  │      3D ORB          │ OVERVIEW      │
│ NET  │                      │               │
│ BAT  │                      ├───────────────┤
│      │                      │ CONTROLS      │
│      │    [response text]   │               │
│      │                      │ Settings      │
│      │                      │ Panels        │
├──────┴──────────────────────┴───────────────┤
│            > command input... [SEND]         │ ← CommandBar
└─────────────────────────────────────────────┘
```

### H. Keyboard Shortcuts (preserved)

| Key | Action |
|-----|--------|
| G | Toggle gestures/camera |
| M | Toggle microphone |
| H | Toggle HUD visibility |
| + / = | Zoom in |
| - | Zoom out |
| R | Reset view |
| Enter (in CommandBar) | Send text command |

### I. CSS Additions (`app/globals.css`)

Added ~250 lines of new styles:
- `.jarvis-header*` — Header component styles
- `.command-bar*` — Command bar styles
- `.global-wake-indicator*` — Wake indicator styles
- `.quick-stats*` — Left sidebar stats
- `.system-overview*` — Right panel system overview
- `.upcoming-events*` — Right panel events (ready for future use)
- Responsive breakpoints for mobile

---

## Files Modified

| File | Change |
|------|--------|
| `app/layout.tsx` | Rebranded title + description |
| `package.json` | Renamed package |
| `app/globals.css` | Added ~250 lines of new component styles |
| `lib/voice/settings.ts` | Added globalWakeEnabled, globalWakePhrase fields |
| `components/JarvisOrb.tsx` | Major restructure — new layout, new components, removed debug UI |
| `components/AutomationPanel.tsx` | No change needed (JARVIS reference is now correct) |

## Files Created

| File | Purpose |
|------|---------|
| `companion/jarvis-wake.py` | Native wake word companion (Python + vosk) |
| `companion/requirements.txt` | Python dependencies |
| `app/api/wake/route.ts` | Wake signal API (POST + SSE) |
| `components/JarvisHeader.tsx` | New header component |
| `components/CommandBar.tsx` | Text command input |
| `components/GlobalWakeIndicator.tsx` | Wake companion status display |

---

## Quality Gates

| Gate | Result |
|------|--------|
| TypeScript | PASS |
| ESLint | PASS |
| Tests | 1740/1740 PASS (111 suites) |
| Build | PASS |
| Vulnerabilities | 0 |

---

## Notes

1. **Wake companion requires Python** — Users must have Python 3.7+ and install vosk + sounddevice
2. **vosk model auto-downloads** — First run downloads ~50MB English model
3. **SSE-based push** — No polling; browser receives wake events instantly via Server-Sent Events
4. **No pipeline duplication** — Global wake triggers the existing `VoiceSession.start()` path
5. **Backward compatible** — All P1-P15 functionality preserved; existing tests unaffected
6. **The `ultron-orb-ui` name in package-lock.json** is a transitive reference that doesn't affect functionality
