let ctx = null;
let silentEl = null;
let lastStartCount = 0;

/** Tiny looping silent WAV (not muted) so iOS uses the playback audio session. */
const SILENT_WAV =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";

/** Short silent MP3 fallback for WebKit. */
const SILENT_MP3 =
  "data:audio/mpeg;base64,//uQxAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAACcQCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//sQxAADwAABpAAAACAAADSAAAAETEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVQ==";

function preferPlaybackSession() {
  try {
    if (navigator.audioSession) {
      navigator.audioSession.type = "playback";
    }
  } catch {
    /* Safari-only; ignore elsewhere */
  }
}

function ensureSilentMedia() {
  if (silentEl) return silentEl;
  silentEl = document.createElement("audio");
  silentEl.setAttribute("playsinline", "");
  silentEl.setAttribute("webkit-playsinline", "true");
  silentEl.playsInline = true;
  silentEl.loop = true;
  silentEl.preload = "auto";
  silentEl.controls = false;
  silentEl.volume = 0.05;
  silentEl.setAttribute("aria-hidden", "true");
  silentEl.style.cssText =
    "position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;left:0;bottom:0";
  const mp3 = document.createElement("source");
  mp3.src = SILENT_MP3;
  mp3.type = "audio/mpeg";
  const wav = document.createElement("source");
  wav.src = SILENT_WAV;
  wav.type = "audio/wav";
  silentEl.appendChild(mp3);
  silentEl.appendChild(wav);
  silentEl.src = SILENT_MP3;
  document.body.appendChild(silentEl);
  return silentEl;
}

function playSilentBuffer(audioCtx) {
  const frames = Math.max(1, Math.floor(audioCtx.sampleRate * 0.05));
  const buffer = audioCtx.createBuffer(1, frames, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = 0;
  const src = audioCtx.createBufferSource();
  src.buffer = buffer;
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
  src.connect(gain).connect(audioCtx.destination);
  src.start(audioCtx.currentTime);
}

function ensureContext() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    ctx.addEventListener?.("statechange", () => {
      if (ctx && ctx.state !== "running") {
        try {
          ctx.resume();
        } catch {
          /* gesture may be required */
        }
      }
    });
  }
  return ctx;
}

function resumeIfNeeded() {
  if (!ctx) return;
  if (ctx.state !== "running") {
    try {
      ctx.resume();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Must run synchronously inside a user-gesture handler (pointerdown/touchend).
 * Do not await this before scheduling notes.
 */
export function unlockAudio() {
  preferPlaybackSession();
  const audioCtx = ensureContext();
  resumeIfNeeded();

  const media = ensureSilentMedia();
  const playMedia = media.play();
  if (playMedia && typeof playMedia.catch === "function") {
    playMedia.catch(() => {});
  }

  try {
    playSilentBuffer(audioCtx);
  } catch {
    /* first tick may fail if context is still creating */
  }

  resumeIfNeeded();
  return ctx;
}

export function audioState() {
  return ctx ? ctx.state : "missing";
}

export function debugAudio() {
  return {
    state: ctx ? ctx.state : "missing",
    currentTime: ctx ? ctx.currentTime : 0,
    sampleRate: ctx ? ctx.sampleRate : 0,
    starts: lastStartCount,
  };
}

function midiToHz(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function playPitches(pitches, tapMs = 180) {
  unlockAudio();
  if (!ctx || !pitches?.length) return;
  resumeIfNeeded();

  const now = ctx.currentTime;
  const hold = Math.min(0.55, Math.max(0.12, tapMs / 1000));
  const release = 0.28;
  const peak = 0.28;

  for (const midi of pitches) {
    const freq = midiToHz(midi);
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.001, now);
    master.gain.linearRampToValueAtTime(peak, now + 0.012);
    master.gain.exponentialRampToValueAtTime(0.12, now + 0.09);
    master.gain.setValueAtTime(0.12, now + hold);
    master.gain.exponentialRampToValueAtTime(0.001, now + hold + release);
    master.connect(ctx.destination);

    const sine = ctx.createOscillator();
    sine.type = "sine";
    sine.frequency.setValueAtTime(freq, now);

    const soft = ctx.createOscillator();
    soft.type = "triangle";
    soft.frequency.setValueAtTime(freq * 2.003, now);

    const softGain = ctx.createGain();
    softGain.gain.setValueAtTime(0.16, now);

    sine.connect(master);
    soft.connect(softGain).connect(master);
    sine.start(now);
    soft.start(now);
    lastStartCount += 2;
    sine.stop(now + hold + release + 0.02);
    soft.stop(now + hold + release + 0.02);
  }
}
