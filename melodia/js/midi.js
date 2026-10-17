function readStr(view, offset, length) {
  let s = "";
  for (let i = 0; i < length; i++) {
    s += String.fromCharCode(view.getUint8(offset + i));
  }
  return s;
}

function readVLQ(view, offset) {
  let value = 0;
  let bytes = 0;
  while (bytes < 4) {
    const b = view.getUint8(offset + bytes);
    bytes += 1;
    value = (value << 7) | (b & 0x7f);
    if ((b & 0x80) === 0) break;
  }
  return { value, bytes };
}

function parseTrack(view, start, length) {
  const end = start + length;
  let offset = start;
  let tick = 0;
  let running = 0;
  const notes = [];
  const open = new Map();
  let name = "";

  while (offset < end) {
    const delta = readVLQ(view, offset);
    offset += delta.bytes;
    tick += delta.value;

    let status = view.getUint8(offset);
    if (status < 0x80) {
      status = running;
    } else {
      offset += 1;
      running = status;
    }

    if (status === 0xff) {
      const type = view.getUint8(offset);
      offset += 1;
      const len = readVLQ(view, offset);
      offset += len.bytes;
      if (type === 0x03) {
        name = readStr(view, offset, len.value);
      }
      offset += len.value;
      continue;
    }

    if (status === 0xf0 || status === 0xf7) {
      const len = readVLQ(view, offset);
      offset += len.bytes + len.value;
      continue;
    }

    const cmd = status & 0xf0;
    const ch = status & 0x0f;

    if (cmd === 0xc0 || cmd === 0xd0) {
      offset += 1;
      continue;
    }

    const a = view.getUint8(offset);
    const b = view.getUint8(offset + 1);
    offset += 2;

    if (cmd === 0x90 && b > 0) {
      const key = `${ch}:${a}`;
      if (!open.has(key)) open.set(key, []);
      open.get(key).push({ tick, midi: a });
    } else if (cmd === 0x80 || (cmd === 0x90 && b === 0)) {
      const key = `${ch}:${a}`;
      const stack = open.get(key);
      if (stack?.length) {
        const on = stack.pop();
        notes.push({
          midi: a,
          start: on.tick,
          durationTicks: Math.max(1, tick - on.tick),
        });
      }
    }
  }

  for (const stack of open.values()) {
    for (const on of stack) {
      notes.push({ midi: on.midi, start: on.tick, durationTicks: 240 });
    }
  }

  notes.sort((x, y) => x.start - y.start || x.midi - y.midi);
  return { name: name.trim(), notes };
}

export function parseMidi(buffer) {
  const view = new DataView(buffer);
  if (readStr(view, 0, 4) !== "MThd") {
    throw new Error("El archivo no es un MIDI válido.");
  }
  const headerLen = view.getUint32(4);
  const format = view.getUint16(8);
  const ntrks = view.getUint16(10);
  const division = view.getUint16(12);
  const ppq = division & 0x8000 ? 480 : division;

  let offset = 8 + headerLen;
  const tracks = [];
  for (let i = 0; i < ntrks && offset + 8 <= view.byteLength; i++) {
    const id = readStr(view, offset, 4);
    const length = view.getUint32(offset + 4);
    offset += 8;
    if (id !== "MTrk") {
      offset += length;
      continue;
    }
    const track = parseTrack(view, offset, length);
    offset += length;
    tracks.push({
      index: i,
      name: track.name || `Pista ${i + 1}`,
      notes: track.notes,
    });
  }

  return { format, ppq, tracks };
}

export function eventsFromNotes(notes, tickWindow = 0) {
  if (!notes.length) return [];
  const events = [];
  let group = null;
  for (const note of notes) {
    if (!group || note.start - group.start > tickWindow) {
      group = { start: note.start, pitches: [note.midi] };
      events.push(group);
    } else if (!group.pitches.includes(note.midi)) {
      group.pitches.push(note.midi);
    }
  }
  return events.map((g) => ({ pitches: g.pitches }));
}
