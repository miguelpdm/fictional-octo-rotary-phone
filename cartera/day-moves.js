(function (root) {
  const DAY_MOVE_EPS = 0.005;

  function regularChangePct(row) {
    if (!row || row.missing) return null;
    const pct = row.changePct;
    if (pct == null || pct === "") return null;
    const n = typeof pct === "number" ? pct : Number(pct);
    return Number.isFinite(n) ? n : null;
  }

  function dayDirection(row) {
    const pct = regularChangePct(row);
    if (pct == null) return null;
    if (pct > DAY_MOVE_EPS) return "up";
    if (pct < -DAY_MOVE_EPS) return "down";
    return "flat";
  }

  function countDayMoves(list) {
    let up = 0;
    let down = 0;
    let flat = 0;
    let priced = 0;
    for (const row of list || []) {
      const dir = dayDirection(row);
      if (!dir) continue;
      priced += 1;
      if (dir === "up") up += 1;
      else if (dir === "down") down += 1;
      else flat += 1;
    }
    return { up, down, flat, priced };
  }

  root.CarteraDayMoves = {
    DAY_MOVE_EPS,
    regularChangePct,
    dayDirection,
    countDayMoves
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = root.CarteraDayMoves;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
