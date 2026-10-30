const test = require("node:test");
const assert = require("node:assert/strict");
const moves = require("./day-moves.js");

test("regularChangePct ignores missing, null, NaN and post/pre ext", () => {
  assert.equal(moves.regularChangePct({ missing: true, changePct: 4 }), null);
  assert.equal(moves.regularChangePct({ changePct: null }), null);
  assert.equal(moves.regularChangePct({ changePct: Number.NaN }), null);
  assert.equal(moves.regularChangePct({ changePct: 1.2, ext: { kind: "post", changePct: 9 } }), 1.2);
  assert.equal(moves.regularChangePct({ changePct: 0 }), 0);
});

test("dayDirection uses 0.005 band so printed 0.00% is flat", () => {
  assert.equal(moves.dayDirection({ changePct: 0 }), "flat");
  assert.equal(moves.dayDirection({ changePct: 0.004 }), "flat");
  assert.equal(moves.dayDirection({ changePct: -0.004 }), "flat");
  assert.equal(moves.dayDirection({ changePct: 0.006 }), "up");
  assert.equal(moves.dayDirection({ changePct: -0.006 }), "down");
  assert.equal(moves.dayDirection({ missing: true, changePct: 2 }), null);
  assert.equal(moves.dayDirection({ changePct: null }), null);
});

test("countDayMoves matches Suben/Bajan filters and keeps flats separate", () => {
  const rows = [
    { symbol: "UP1", changePct: 1.2 },
    { symbol: "UP2", changePct: 0.01 },
    { symbol: "DN1", changePct: -2 },
    { symbol: "FLAT", changePct: 0 },
    { symbol: "NEAR", changePct: 0.003 },
    { symbol: "MISS", missing: true, changePct: 8 },
    { symbol: "NOPX", changePct: null },
    { symbol: "POSTONLY", changePct: 0.2, ext: { kind: "post", changePct: -5 } }
  ];
  const counts = moves.countDayMoves(rows);
  assert.deepEqual(counts, { up: 3, down: 1, flat: 2, priced: 6 });
  const up = rows.filter((row) => moves.dayDirection(row) === "up").map((row) => row.symbol);
  const down = rows.filter((row) => moves.dayDirection(row) === "down").map((row) => row.symbol);
  assert.deepEqual(up, ["UP1", "UP2", "POSTONLY"]);
  assert.deepEqual(down, ["DN1"]);
});

test("hidden US names are not counted when omitted from the visible list", () => {
  const visible = [
    { symbol: "EL.PA", changePct: 1 },
    { symbol: "BTC-USD", changePct: -1 }
  ];
  const hiddenUs = { symbol: "AAPL", changePct: 8 };
  assert.deepEqual(moves.countDayMoves(visible), { up: 1, down: 1, flat: 0, priced: 2 });
  assert.deepEqual(moves.countDayMoves([...visible, hiddenUs]), { up: 2, down: 1, flat: 0, priced: 3 });
});
