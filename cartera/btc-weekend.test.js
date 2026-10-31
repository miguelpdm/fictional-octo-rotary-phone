const test = require("node:test");
const assert = require("node:assert/strict");
const btc = require("./btc-weekend.js");

function madrid(isoLocal) {
  const [date, time] = isoLocal.split("T");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date(utcGuess));
  const got = Object.fromEntries(parts.filter((p) => p.type !== "literal").map((p) => [p.type, Number(p.value)]));
  const asUtc = Date.UTC(got.year, got.month - 1, got.day, got.hour, got.minute, 0);
  return new Date(utcGuess - (asUtc - utcGuess));
}

test("sábado usa el viernes 22:00 Madrid más reciente", () => {
  const now = madrid("2026-10-31T15:30");
  const sec = btc.lastFriday2200MadridSec(now);
  assert.equal(new Date(sec * 1000).toISOString(), "2026-10-30T21:00:00.000Z");
  assert.equal(btc.inWeekendWindow(now), true);
  assert.equal(btc.btcOpenBaselineSec(now), sec);
});

test("domingo sigue anclado al viernes 22:00 Madrid", () => {
  const now = madrid("2026-11-01T12:00");
  const sec = btc.lastFriday2200MadridSec(now);
  assert.equal(new Date(sec * 1000).toISOString(), "2026-10-30T21:00:00.000Z");
  assert.equal(btc.inWeekendWindow(now), true);
  assert.equal(btc.btcOpenBaselineSec(now), sec);
});

test("lunes antes de las 09:00 Madrid sigue en la ventana del viernes", () => {
  const before = madrid("2026-11-02T08:59");
  const after = madrid("2026-11-02T09:00");
  const friday = btc.lastFriday2200MadridSec(before);
  assert.equal(new Date(friday * 1000).toISOString(), "2026-10-30T21:00:00.000Z");
  assert.equal(btc.inWeekendWindow(before), true);
  assert.equal(btc.btcOpenBaselineSec(before), friday);
  assert.equal(btc.inWeekendWindow(after), false);
  assert.notEqual(btc.btcOpenBaselineSec(after), friday);
});

test("cambio de hora de octubre: el ancla es 22:00 CEST del viernes, no un offset fijo", () => {
  const saturday = madrid("2026-10-24T16:00");
  const sunday = madrid("2026-10-25T16:00");
  const mondayMorning = madrid("2026-10-26T08:00");
  const fridayCest = "2026-10-23T20:00:00.000Z";
  for (const now of [saturday, sunday, mondayMorning]) {
    const sec = btc.lastFriday2200MadridSec(now);
    assert.equal(new Date(sec * 1000).toISOString(), fridayCest);
    assert.equal(btc.inWeekendWindow(now), true);
    assert.equal(btc.btcOpenBaselineSec(now), sec);
  }
});
