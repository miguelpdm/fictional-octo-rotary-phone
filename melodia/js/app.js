import { unlockAudio, playPitches, audioState, debugAudio } from "./synth.js";
import { parseMidi, eventsFromNotes } from "./midi.js";

const STORAGE_KEY = "tap-melody-last-song";

const BUILTIN = [
  { id: "himno-alegria", file: "../songs/himno-alegria.json" },
  { id: "para-elisa", file: "../songs/para-elisa.json" },
  { id: "serenata-nocturna", file: "../songs/serenata-nocturna.json" },
  { id: "marcha-turca", file: "../songs/marcha-turca.json" },
  { id: "can-can", file: "../songs/can-can.json" },
  { id: "gruta-rey", file: "../songs/gruta-rey.json" },
  { id: "primavera", file: "../songs/primavera.json" },
  { id: "canon-re", file: "../songs/canon-re.json" },
  { id: "marcha-nupcial", file: "../songs/marcha-nupcial.json" },
  { id: "danubio-azul", file: "../songs/danubio-azul.json" },
  { id: "habanera", file: "../songs/habanera.json" },
  { id: "cancion-cuna", file: "../songs/cancion-cuna.json" },
];

const CATALOG = [
  { id: "himno-alegria", name: "Himno de la alegría", composer: "Ludwig van Beethoven" },
  { id: "para-elisa", name: "Para Elisa", composer: "Ludwig van Beethoven" },
  { id: "serenata-nocturna", name: "Pequeña serenata nocturna", composer: "Wolfgang Amadeus Mozart" },
  { id: "marcha-turca", name: "Marcha turca", composer: "Wolfgang Amadeus Mozart" },
  { id: "can-can", name: "Can-can", composer: "Jacques Offenbach" },
  { id: "gruta-rey", name: "En la gruta del rey de la montaña", composer: "Edvard Grieg" },
  { id: "primavera", name: "La primavera", composer: "Antonio Vivaldi" },
  { id: "canon-re", name: "Canon en Re", composer: "Johann Pachelbel" },
  { id: "marcha-nupcial", name: "Marcha nupcial", composer: "Felix Mendelssohn" },
  { id: "danubio-azul", name: "Danubio azul", composer: "Johann Strauss II" },
  { id: "habanera", name: "Habanera (Carmen)", composer: "Georges Bizet" },
  { id: "cancion-cuna", name: "Canción de cuna", composer: "Johannes Brahms" },
];

const $ = (id) => document.getElementById(id);

const trackSelect = $("track-select");
const trackField = $("track-field");
const midiFile = $("midi-file");
const songNameEl = $("song-name");
const composerEl = $("composer");
const progressEl = $("progress");
const statusEl = $("status");
const audioHint = $("audio-hint");
const pad = $("pad");
const padLabel = $("pad-label");
const restartBtn = $("restart");
const picker = $("picker");
const songList = $("song-list");
const openPicker = $("open-picker");
const closePicker = $("close-picker");

const state = {
  id: "",
  name: "",
  events: [],
  index: 0,
  lastTap: 0,
  midi: null,
};

function showStatus(msg) {
  statusEl.hidden = !msg;
  statusEl.textContent = msg || "";
}

function renderProgress() {
  const total = state.events.length;
  const shown = state.index === 0 ? 0 : Math.min(state.index, total);
  progressEl.textContent = `Nota ${shown} / ${total}`;
  padLabel.textContent = total === 0 ? "—" : state.index === 0 ? "Toca" : "Sigue";
  if (state.index > 0 && state.index >= total) {
    padLabel.textContent = "Otra vez";
  }
}

function setSong(name, events, composer = "") {
  state.name = name;
  state.events = events;
  state.index = 0;
  songNameEl.textContent = name;
  composerEl.textContent = composer;
  renderProgress();
  highlightCurrent();
}

function highlightCurrent() {
  for (const btn of songList.querySelectorAll("button")) {
    btn.classList.toggle("is-current", btn.dataset.id === state.id);
  }
}

async function loadBuiltin(id) {
  const meta = BUILTIN.find((s) => s.id === id);
  const info = CATALOG.find((s) => s.id === id);
  if (!meta || !info) return;
  showStatus("");
  trackField.classList.add("is-hidden");
  state.midi = null;
  state.id = id;
  const res = await fetch(new URL(meta.file, import.meta.url));
  if (!res.ok) throw new Error("No se pudo cargar la canción.");
  const data = await res.json();
  setSong(data.name, data.events, data.composer || info.composer);
  localStorage.setItem(STORAGE_KEY, id);
}

function applyMidiTrack(trackIndex) {
  const track = state.midi.tracks[trackIndex];
  const events = eventsFromNotes(track.notes);
  const label = `${state.midi.fileName} · ${track.name}`;
  state.id = "midi";
  setSong(label, events, "Archivo MIDI");
  if (!events.length) {
    showStatus("Esta pista no tiene notas.");
  } else {
    showStatus("");
  }
}

function fillTrackSelect(tracks) {
  trackSelect.innerHTML = "";
  tracks.forEach((t, i) => {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = `${t.name} (${t.notes.length} notas)`;
    trackSelect.appendChild(opt);
  });
  const firstWithNotes = tracks.findIndex((t) => t.notes.length);
  const idx = firstWithNotes >= 0 ? firstWithNotes : 0;
  trackSelect.value = String(idx);
  trackField.classList.toggle("is-hidden", tracks.length < 2);
  applyMidiTrack(idx);
}

async function handleMidiFile(file) {
  try {
    const buffer = await file.arrayBuffer();
    const parsed = parseMidi(buffer);
    parsed.fileName = file.name.replace(/\.(mid|midi)$/i, "");
    state.midi = parsed;
    if (!parsed.tracks.length) {
      state.id = "midi";
      setSong(file.name, [], "Archivo MIDI");
      showStatus("El MIDI no tiene pistas.");
      return;
    }
    fillTrackSelect(parsed.tracks);
  } catch (err) {
    showStatus(err.message || "No se pudo leer el MIDI.");
  }
}

function updateAudioHint() {
  if (!audioHint) return;
  const suspended = audioState() !== "running";
  audioHint.hidden = !suspended;
}

function nextNote() {
  if (!state.events.length) return;
  if (state.index >= state.events.length) {
    state.index = 0;
  }
  const now = performance.now();
  const gap = state.lastTap ? now - state.lastTap : 220;
  state.lastTap = now;
  playPitches(state.events[state.index].pitches, gap);
  state.index += 1;
  renderProgress();
  pad.classList.add("is-hit");
  setTimeout(() => pad.classList.remove("is-hit"), 90);
  updateAudioHint();
  setTimeout(updateAudioHint, 120);
}

function onPadGesture() {
  unlockAudio();
  nextNote();
}

function fillSongList() {
  songList.innerHTML = "";
  for (const song of CATALOG) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.id = song.id;
    btn.innerHTML = `<span class="song-title">${song.name}</span><span class="song-composer">${song.composer}</span>`;
    btn.addEventListener("click", async () => {
      try {
        await loadBuiltin(song.id);
        picker.hidden = true;
      } catch (err) {
        showStatus(err.message);
      }
    });
    li.appendChild(btn);
    songList.appendChild(li);
  }
}

let playedFromPointer = false;
pad.addEventListener("pointerdown", () => {
  playedFromPointer = true;
  onPadGesture();
});
pad.addEventListener(
  "touchend",
  () => {
    if (playedFromPointer) {
      playedFromPointer = false;
      unlockAudio();
      updateAudioHint();
      return;
    }
    onPadGesture();
  },
  { passive: true }
);

restartBtn.addEventListener("click", () => {
  unlockAudio();
  state.index = 0;
  state.lastTap = 0;
  renderProgress();
});

window.__melodiaAudio = debugAudio;

openPicker.addEventListener("click", () => {
  picker.hidden = false;
  highlightCurrent();
});

closePicker.addEventListener("click", () => {
  picker.hidden = true;
});

picker.addEventListener("click", (e) => {
  if (e.target === picker) picker.hidden = true;
});

trackSelect.addEventListener("change", () => {
  applyMidiTrack(Number(trackSelect.value));
});

midiFile.addEventListener("change", async () => {
  const file = midiFile.files?.[0];
  if (file) await handleMidiFile(file);
  midiFile.value = "";
});

fillSongList();
const last = localStorage.getItem(STORAGE_KEY);
const startId = BUILTIN.some((s) => s.id === last) ? last : "himno-alegria";
loadBuiltin(startId).catch((err) => showStatus(err.message));
