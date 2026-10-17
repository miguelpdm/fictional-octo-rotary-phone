let ctx = null;

export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
  }
  if (ctx.state === "suspended") {
    return ctx.resume();
  }
  return Promise.resolve();
}

function midiToHz(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function playPitches(pitches, tapMs = 180) {
  if (!ctx || !pitches?.length) return;
  const now = ctx.currentTime;
  const hold = Math.min(0.55, Math.max(0.12, tapMs / 1000));
  const release = 0.28;

  for (const midi of pitches) {
    const freq = midiToHz(midi);
    const master = ctx.createGain();
    master.gain.setValueAtTime(0, now);
    master.gain.linearRampToValueAtTime(0.22, now + 0.012);
    master.gain.exponentialRampToValueAtTime(0.09, now + 0.09);
    master.gain.setValueAtTime(0.09, now + hold);
    master.gain.exponentialRampToValueAtTime(0.0008, now + hold + release);
    master.connect(ctx.destination);

    const sine = ctx.createOscillator();
    sine.type = "sine";
    sine.frequency.setValueAtTime(freq, now);

    const soft = ctx.createOscillator();
    soft.type = "triangle";
    soft.frequency.setValueAtTime(freq * 2.003, now);

    const softGain = ctx.createGain();
    softGain.gain.value = 0.14;

    sine.connect(master);
    soft.connect(softGain).connect(master);
    sine.start(now);
    soft.start(now);
    sine.stop(now + hold + release + 0.02);
    soft.stop(now + hold + release + 0.02);
  }
}
