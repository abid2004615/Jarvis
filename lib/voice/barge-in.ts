/**
 * JARVIS Voice — Barge-in detection for the native audio path
 *
 * The browser path gets interruption for free: it owns the MediaStream, so
 * lib/voice/vad.ts can run a real VAD and fire onSpeechStart. The packaged app
 * has no MediaStream — audio lives in the Python companion, which only reports
 * a periodic RMS level over IPC. This turns that level stream into an
 * "interrupt playback now" decision.
 *
 * The hard part is echo. While JARVIS speaks, the microphone hears JARVIS, so a
 * naive `level > threshold` check makes it interrupt itself on its own first
 * word. Without acoustic echo cancellation the mitigations are behavioural:
 *
 *   1. A grace period after playback starts, covering the initial output burst.
 *   2. A threshold above conversational speaker bleed — a user talking into the
 *      mic is markedly louder than playback leaking back in.
 *   3. Sustained speech across consecutive frames, so a transient (a key press,
 *      a cough, one loud syllable of JARVIS's own output) is not enough.
 *
 * These are deliberately conservative: a missed barge-in is a minor annoyance,
 * whereas self-interruption makes the assistant unusable.
 */

export interface BargeInConfig {
  /** RMS level (0..1) a frame must exceed to count as speech. */
  threshold?: number;
  /** Consecutive qualifying frames required before interrupting. */
  framesRequired?: number;
  /** Ignore input for this long after playback starts, in milliseconds. */
  graceMs?: number;
  /** Injectable clock, for tests. */
  now?: () => number;
}

export interface BargeInDetector {
  /** Mark playback as started; begins the grace period. */
  playbackStarted: () => void;
  /** Feed one level sample. Returns true when playback should be interrupted. */
  feed: (level: number) => boolean;
  /** Clear all state, e.g. once playback has stopped. */
  reset: () => void;
  /** Consecutive qualifying frames seen so far. Exposed for diagnostics. */
  getStreak: () => number;
}

/**
 * Defaults are tuned above lib/voice/vad.ts's 0.15 speech threshold, because
 * this detector runs *while audio is playing* and so must clear echo, not just
 * room noise. The companion emits a level roughly twice a second, so two
 * frames is about half a second of sustained speech.
 */
const DEFAULTS: Required<Omit<BargeInConfig, "now">> = {
  threshold: 0.28,
  framesRequired: 2,
  graceMs: 600,
};

export function createBargeInDetector(config: BargeInConfig = {}): BargeInDetector {
  const cfg = { ...DEFAULTS, ...config };
  const now = config.now ?? (() => Date.now());

  let playbackStartedAt = 0;
  let streak = 0;
  /** Latched so one burst of speech interrupts once, not on every later frame. */
  let fired = false;

  return {
    playbackStarted() {
      playbackStartedAt = now();
      streak = 0;
      fired = false;
    },

    feed(level: number) {
      // Never interrupt when playback was not announced.
      if (playbackStartedAt === 0 || fired) return false;

      if (now() - playbackStartedAt < cfg.graceMs) {
        // Still in the grace window: also drop the streak so a loud opening
        // syllable cannot carry over into the live window.
        streak = 0;
        return false;
      }

      if (!Number.isFinite(level) || level < cfg.threshold) {
        streak = 0;
        return false;
      }

      streak++;
      if (streak < cfg.framesRequired) return false;

      fired = true;
      return true;
    },

    reset() {
      playbackStartedAt = 0;
      streak = 0;
      fired = false;
    },

    getStreak() {
      return streak;
    },
  };
}
