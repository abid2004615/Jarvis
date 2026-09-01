/**
 * Barge-in detection for the native (packaged) voice path.
 *
 * The browser path interrupts TTS through the VAD's onSpeechStart. The packaged
 * app has no MediaStream, so interruption is derived from the Python
 * companion's periodic audio level. The risk being pinned here is
 * self-interruption: while JARVIS speaks, the microphone hears JARVIS, so the
 * detector must clear echo before it fires.
 */

import { createBargeInDetector } from "@/lib/voice/barge-in";

/** Controllable clock so grace periods do not require real waiting. */
function fakeClock(start = 1_000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("Native barge-in detector", () => {
  test("never fires before playback is announced", () => {
    const detector = createBargeInDetector();
    // Loud input while nothing is playing is just normal listening.
    for (let i = 0; i < 10; i++) {
      expect(detector.feed(0.9)).toBe(false);
    }
  });

  test("ignores input during the echo grace period", () => {
    const clock = fakeClock();
    const detector = createBargeInDetector({ now: clock.now, graceMs: 600 });

    detector.playbackStarted();
    // JARVIS's own opening words land here and must not interrupt it.
    clock.advance(100);
    expect(detector.feed(0.9)).toBe(false);
    clock.advance(200);
    expect(detector.feed(0.9)).toBe(false);
    expect(detector.getStreak()).toBe(0);
  });

  test("fires after sustained speech once the grace period passes", () => {
    const clock = fakeClock();
    const detector = createBargeInDetector({
      now: clock.now,
      graceMs: 600,
      threshold: 0.28,
      framesRequired: 2,
    });

    detector.playbackStarted();
    clock.advance(700);

    expect(detector.feed(0.5)).toBe(false); // first qualifying frame
    expect(detector.feed(0.5)).toBe(true); // sustained -> interrupt
  });

  test("does not fire on a single transient spike", () => {
    const clock = fakeClock();
    const detector = createBargeInDetector({ now: clock.now, graceMs: 0, framesRequired: 2 });

    detector.playbackStarted();
    clock.advance(10);

    // A key press or one loud syllable of playback: spike, then quiet.
    expect(detector.feed(0.9)).toBe(false);
    expect(detector.feed(0.01)).toBe(false);
    expect(detector.getStreak()).toBe(0);
    // A later lone spike must still not be enough.
    expect(detector.feed(0.9)).toBe(false);
  });

  test("ignores levels below the threshold", () => {
    const clock = fakeClock();
    const detector = createBargeInDetector({ now: clock.now, graceMs: 0, threshold: 0.28 });

    detector.playbackStarted();
    clock.advance(10);

    for (let i = 0; i < 20; i++) {
      // Speaker bleed sits under the threshold and must never accumulate.
      expect(detector.feed(0.2)).toBe(false);
    }
  });

  test("requires the streak to be consecutive", () => {
    const clock = fakeClock();
    const detector = createBargeInDetector({ now: clock.now, graceMs: 0, framesRequired: 3 });

    detector.playbackStarted();
    clock.advance(10);

    detector.feed(0.5);
    detector.feed(0.5);
    detector.feed(0.01); // breaks the run
    expect(detector.getStreak()).toBe(0);
    detector.feed(0.5);
    expect(detector.feed(0.5)).toBe(false); // only two again
  });

  test("fires once per playback, not on every later frame", () => {
    const clock = fakeClock();
    const detector = createBargeInDetector({ now: clock.now, graceMs: 0, framesRequired: 1 });

    detector.playbackStarted();
    clock.advance(10);

    expect(detector.feed(0.6)).toBe(true);
    // Playback is already being torn down; further frames must stay quiet.
    expect(detector.feed(0.6)).toBe(false);
    expect(detector.feed(0.9)).toBe(false);
  });

  test("reset disarms the detector", () => {
    const clock = fakeClock();
    const detector = createBargeInDetector({ now: clock.now, graceMs: 0, framesRequired: 1 });

    detector.playbackStarted();
    clock.advance(10);
    detector.reset();

    expect(detector.feed(0.9)).toBe(false);
  });

  test("re-arms for the next response", () => {
    const clock = fakeClock();
    const detector = createBargeInDetector({ now: clock.now, graceMs: 0, framesRequired: 1 });

    detector.playbackStarted();
    clock.advance(10);
    expect(detector.feed(0.6)).toBe(true);

    detector.reset();
    detector.playbackStarted();
    clock.advance(10);
    expect(detector.feed(0.6)).toBe(true);
  });

  test("tolerates non-finite levels", () => {
    const clock = fakeClock();
    const detector = createBargeInDetector({ now: clock.now, graceMs: 0, framesRequired: 1 });

    detector.playbackStarted();
    clock.advance(10);

    expect(detector.feed(Number.NaN)).toBe(false);
    expect(detector.feed(Number.POSITIVE_INFINITY)).toBe(false);
  });

  test("default threshold sits above the browser VAD speech threshold", () => {
    // vad.ts uses 0.15 for room noise; barge-in must additionally clear echo,
    // so a level that counts as speech when idle must not interrupt playback.
    const clock = fakeClock();
    const detector = createBargeInDetector({ now: clock.now, graceMs: 0 });

    detector.playbackStarted();
    clock.advance(10);

    expect(detector.feed(0.16)).toBe(false);
    expect(detector.feed(0.16)).toBe(false);
  });
});
