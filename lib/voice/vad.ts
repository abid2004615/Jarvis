/**
 * JARVIS Voice — Voice Activity Detection
 *
 * Energy-based VAD via AudioContext + AnalyserNode.
 * Distinguishes silence / speech started / speech ended.
 * Conservative thresholds to avoid triggering on background noise.
 */

export interface VADConfig {
  speechThreshold?: number;
  silenceTimeout?: number;
  maxDuration?: number;
  cooldown?: number;
  fftSize?: number;
}

export interface VADCallbacks {
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  onLevel?: (level: number) => void;
}

export interface VoiceActivityDetector {
  attach: (stream: MediaStream) => void;
  detach: () => void;
  getLevel: () => number;
  isSpeechActive: () => boolean;
  setCallbacks: (callbacks: VADCallbacks) => void;
  destroy: () => void;
}

const DEFAULTS: Required<VADConfig> = {
  speechThreshold: 0.15,
  silenceTimeout: 1200,
  maxDuration: 30_000,
  cooldown: 300,
  fftSize: 256,
};

export function createVoiceActivityDetector(config: VADConfig = {}): VoiceActivityDetector {
  const cfg = { ...DEFAULTS, ...config };

  let audioContext: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
    let dataArray: Uint8Array<ArrayBuffer> | null = null;
  let rafId: number | null = null;

  let speechActive = false;
  let currentLevel = 0;
  let silenceTimer: ReturnType<typeof setTimeout> | null = null;
  let maxTimer: ReturnType<typeof setTimeout> | null = null;
  let cooldownTimer: ReturnType<typeof setTimeout> | null = null;
  let onCooldown = false;
  let callbacks: VADCallbacks = {};
  let destroyed = false;

  const computeRMS = (): number => {
    if (!analyser || !dataArray) return 0;
    analyser.getByteTimeDomainData(dataArray);
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const normalized = (dataArray[i] - 128) / 128;
      sum += normalized * normalized;
    }
    return Math.sqrt(sum / dataArray.length);
  };

  const tick = () => {
    if (destroyed) return;
    const level = computeRMS();
    currentLevel = level;
    callbacks.onLevel?.(level);

    if (onCooldown) return;

    if (!speechActive && level > cfg.speechThreshold) {
      speechActive = true;
      onCooldown = true;
      callbacks.onSpeechStart?.();

      maxTimer = setTimeout(() => {
        if (speechActive) {
          speechActive = false;
          callbacks.onSpeechEnd?.();
          startCooldown();
        }
      }, cfg.maxDuration);
    } else if (speechActive && level <= cfg.speechThreshold) {
      if (!silenceTimer) {
        silenceTimer = setTimeout(() => {
          silenceTimer = null;
          if (speechActive) {
            speechActive = false;
            callbacks.onSpeechEnd?.();
            startCooldown();
          }
        }, cfg.silenceTimeout);
      }
    } else if (speechActive && level > cfg.speechThreshold) {
      if (silenceTimer) {
        clearTimeout(silenceTimer);
        silenceTimer = null;
      }
    }

    rafId = requestAnimationFrame(tick);
  };

  const startCooldown = () => {
    onCooldown = true;
    cooldownTimer = setTimeout(() => {
      onCooldown = false;
      cooldownTimer = null;
    }, cfg.cooldown);
  };

  return {
    attach(stream: MediaStream) {
      if (destroyed) return;
      this.detach();

      try {
        audioContext = new AudioContext();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = cfg.fftSize;
        source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);
        dataArray = new Uint8Array(analyser.fftSize);
        rafId = requestAnimationFrame(tick);
      } catch {
        this.detach();
      }
    },

    detach() {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      if (silenceTimer) {
        clearTimeout(silenceTimer);
        silenceTimer = null;
      }
      if (maxTimer) {
        clearTimeout(maxTimer);
        maxTimer = null;
      }
      if (cooldownTimer) {
        clearTimeout(cooldownTimer);
        cooldownTimer = null;
      }
      source?.disconnect();
      source = null;
      analyser = null;
      if (audioContext && audioContext.state !== "closed") {
        audioContext.close().catch(() => {});
      }
      audioContext = null;
      dataArray = null;
      speechActive = false;
      currentLevel = 0;
      onCooldown = false;
    },

    getLevel() {
      return currentLevel;
    },

    isSpeechActive() {
      return speechActive;
    },

    setCallbacks(cbs: VADCallbacks) {
      callbacks = cbs;
    },

    destroy() {
      destroyed = true;
      this.detach();
    },
  };
}
