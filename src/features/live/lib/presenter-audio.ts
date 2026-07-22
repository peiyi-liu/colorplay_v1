// First-party Web Audio synthesis for the presenter (no licensed assets):
// a soft lobby loop, a countdown tick, a reveal sting and a podium fanfare.
// Everything degrades to a no-op where AudioContext is unavailable (jsdom).

export type PresenterAudio = Readonly<{
  setMuted(muted: boolean): void;
  startLobbyLoop(): void;
  stopLobbyLoop(): void;
  tick(): void;
  playReveal(): void;
  playFanfare(): void;
  dispose(): void;
}>;

type AudioContextFactory = () => AudioContext;

const defaultFactory: AudioContextFactory = () => new AudioContext();

export function createPresenterAudio(
  factory: AudioContextFactory = defaultFactory,
): PresenterAudio {
  let context: AudioContext | null = null;
  let muted = false;
  let lobbyTimer: ReturnType<typeof setInterval> | null = null;

  const ensureContext = (): AudioContext | null => {
    if (context) return context;
    try {
      context = factory();
    } catch {
      context = null;
    }
    return context;
  };

  const note = (
    frequency: number,
    delaySeconds: number,
    durationSeconds: number,
    type: OscillatorType = 'sine',
    peak = 0.08,
  ) => {
    if (muted) return;
    const audio = ensureContext();
    if (!audio) return;
    if (audio.state === 'suspended') void audio.resume();
    const startAt = audio.currentTime + delaySeconds;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, startAt);
    gain.gain.linearRampToValueAtTime(peak, startAt + 0.01);
    gain.gain.linearRampToValueAtTime(0, startAt + durationSeconds);
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + durationSeconds + 0.02);
  };

  const playLobbyBar = () => {
    note(392, 0, 0.35, 'sine', 0.04);
    note(494, 0.4, 0.35, 'sine', 0.04);
    note(587, 0.8, 0.5, 'sine', 0.04);
  };

  return {
    setMuted(nextMuted) {
      muted = nextMuted;
    },
    startLobbyLoop() {
      if (lobbyTimer !== null) return;
      playLobbyBar();
      lobbyTimer = setInterval(playLobbyBar, 2400);
    },
    stopLobbyLoop() {
      if (lobbyTimer === null) return;
      clearInterval(lobbyTimer);
      lobbyTimer = null;
    },
    tick() {
      note(880, 0, 0.05, 'square', 0.04);
    },
    playReveal() {
      note(523, 0, 0.12);
      note(659, 0.13, 0.2);
    },
    playFanfare() {
      note(523, 0, 0.15);
      note(659, 0.16, 0.15);
      note(784, 0.32, 0.3);
    },
    dispose() {
      if (lobbyTimer !== null) clearInterval(lobbyTimer);
      lobbyTimer = null;
      if (context) void context.close();
      context = null;
    },
  };
}
