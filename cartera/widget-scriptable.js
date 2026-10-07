// Cartera — widget para Scriptable (iOS)
// Pégalo entero en un script nuevo. Guía: widget-ios.md
// Abre: https://miguelpdm.github.io/fictional-octo-rotary-phone/cartera/

const PAGE_URL = "https://miguelpdm.github.io/fictional-octo-rotary-phone/cartera/";
const CONFIG_URL = "https://miguelpdm.github.io/fictional-octo-rotary-phone/data/cartera.json";
const TV_SCAN = "https://scanner.tradingview.com/global/scan";
const TV_COLUMNS = ["name", "description", "close", "change", "change_abs", "currency"];
const TZ = "Europe/Madrid";
const REFRESH_MINUTES = 15;
const COLORS = {
  bg: "#0b0d10",
  panel: "#14181f",
  text: "#f4f6f8",
  muted: "#8b95a5",
  green: "#30d158",
  greenInk: "#04210c",
  red: "#ff453a",
  flat: "#3a4150"
};

function isScriptable() {
  return typeof ListWidget !== "undefined";
}

function httpRequest(url, opts) {
  if (isScriptable()) {
    const req = new Request(url);
    req.method = (opts && opts.method) || "GET";
    if (opts && opts.headers) req.headers = opts.headers;
    if (opts && opts.body != null) req.body = opts.body;
    return req.loadJSON();
  }
  const fetchFn = opts && opts.fetchImpl ? opts.fetchImpl : fetch;
  return fetchFn(url, {
    method: (opts && opts.method) || "GET",
    headers: (opts && opts.headers) || {},
    body: opts && opts.body
  }).then((res) => {
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  });
}

function nf(value, digits) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "n/d";
  return n.toLocaleString("es-ES", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function signedPct(pct) {
  if (pct == null || Number.isNaN(pct)) return "n/d";
  const sign = pct > 0 ? "+" : "";
  return sign + nf(pct, 2) + "%";
}

function formatMadrid(date) {
  return date.toLocaleString("es-ES", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });
}

function priceDigits(value) {
  const abs = Math.abs(value);
  if (abs < 1) return 4;
  if (abs < 10) return 3;
  return 2;
}

async function loadPortfolio(fetchImpl) {
  const data = await httpRequest(CONFIG_URL, { fetchImpl });
  const positions = Array.isArray(data.positions) ? data.positions : [];
  if (!positions.length) throw new Error("cartera.json sin posiciones");
  return positions;
}

async function fetchTradingView(positions, fetchImpl) {
  const tickers = positions.map((p) => p.tv).filter(Boolean);
  const payload = await httpRequest(TV_SCAN, {
    fetchImpl,
    method: "POST",
    headers: { "content-type": "text/plain;charset=UTF-8" },
    body: JSON.stringify({ symbols: { tickers }, columns: TV_COLUMNS })
  });
  const map = {};
  for (const item of payload.data || []) {
    const d = item.d || [];
    const row = {};
    TV_COLUMNS.forEach((col, i) => {
      row[col] = d[i];
    });
    if (row.close == null) continue;
    map[item.s] = {
      price: row.close,
      changePct: row.change,
      change: row.change_abs,
      currency: row.currency,
      name: row.description || row.name
    };
  }
  if (!Object.keys(map).length) throw new Error("TradingView vacío");
  return map;
}

function quoteFromYahooChart(result) {
  const meta = result && result.meta;
  if (!meta || meta.regularMarketPrice == null) return null;
  const previousClose = meta.chartPreviousClose || meta.previousClose;
  const price = meta.regularMarketPrice;
  const change = previousClose ? price - previousClose : 0;
  const changePct = previousClose ? (change / previousClose) * 100 : 0;
  return {
    price,
    changePct,
    change,
    currency: meta.currency,
    name: meta.shortName || meta.symbol
  };
}

async function fetchYahooSpark(symbols, fetchImpl) {
  const map = {};
  const chunkSize = 10;
  const headers = { "User-Agent": "Mozilla/5.0 (compatible; CarteraWidget/1.0)" };
  for (let i = 0; i < symbols.length; i += chunkSize) {
    const chunk = symbols.slice(i, i + chunkSize);
    const url =
      "https://query1.finance.yahoo.com/v7/finance/spark?symbols=" +
      encodeURIComponent(chunk.join(",")) +
      "&range=1d&interval=1d";
    const payload = await httpRequest(url, { fetchImpl, headers });
    for (const item of (payload.spark && payload.spark.result) || []) {
      const quoted = quoteFromYahooChart(item.response && item.response[0]);
      if (quoted) map[item.symbol] = quoted;
    }
  }
  return map;
}

async function fetchYahooChart(symbols, fetchImpl) {
  const map = {};
  const headers = { "User-Agent": "Mozilla/5.0 (compatible; CarteraWidget/1.0)" };
  for (const symbol of symbols) {
    const url =
      "https://query1.finance.yahoo.com/v8/finance/chart/" +
      encodeURIComponent(symbol) +
      "?interval=1d&range=5d";
    try {
      const payload = await httpRequest(url, { fetchImpl, headers });
      const result = payload.chart && payload.chart.result && payload.chart.result[0];
      const quoted = quoteFromYahooChart(result);
      if (quoted) map[symbol] = quoted;
    } catch (err) {
      /* skip one ticker; others may still work */
    }
  }
  return map;
}

async function fetchYahoo(positions, fetchImpl) {
  const symbols = [...new Set(positions.map((p) => p.yahoo || p.symbol))];
  let map = {};
  try {
    map = await fetchYahooSpark(symbols, fetchImpl);
  } catch (err) {
    map = {};
  }
  if (!Object.keys(map).length) {
    map = await fetchYahooChart(symbols, fetchImpl);
  }
  if (!Object.keys(map).length) throw new Error("Yahoo vacío");
  return map;
}

function mergeRows(positions, quoteMap, key) {
  return positions.map((p) => {
    const q = quoteMap[p[key] || p.symbol] || quoteMap[p.yahoo] || quoteMap[p.tv];
    if (!q || q.price == null) {
      return { symbol: p.symbol, name: p.name, group: p.group, missing: true };
    }
    return {
      symbol: p.symbol,
      name: p.name || q.name,
      group: p.group,
      price: q.price,
      changePct: q.changePct,
      currency: q.currency,
      missing: false
    };
  });
}

async function loadQuotes(fetchImpl) {
  const positions = await loadPortfolio(fetchImpl);
  let source = "tradingview";
  let map = null;
  try {
    map = await fetchTradingView(positions, fetchImpl);
    return { rows: mergeRows(positions, map, "tv"), source, positions };
  } catch (err) {
    source = "yahoo";
    map = await fetchYahoo(positions, fetchImpl);
    return { rows: mergeRows(positions, map, "yahoo"), source, positions };
  }
}

function summarize(rows) {
  const priced = rows.filter((r) => !r.missing && r.changePct != null);
  const up = priced.filter((r) => r.changePct > 0.005).length;
  const down = priced.filter((r) => r.changePct < -0.005).length;
  const best = priced.reduce((a, b) => (!a || b.changePct > a.changePct ? b : a), null);
  const worst = priced.reduce((a, b) => (!a || b.changePct < a.changePct ? b : a), null);
  return { up, down, best, worst, priced };
}

function topMovers(rows, n) {
  return rows
    .filter((r) => !r.missing && r.changePct != null)
    .slice()
    .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
    .slice(0, n);
}

function byGroupThenPct(rows) {
  const order = { P0: 0, P1: 1, P2: 2 };
  return rows
    .filter((r) => !r.missing && r.changePct != null)
    .slice()
    .sort((a, b) => {
      const ga = order[a.group] ?? 9;
      const gb = order[b.group] ?? 9;
      if (ga !== gb) return ga - gb;
      return b.changePct - a.changePct;
    });
}

function color(hex) {
  return new Color(hex);
}

function addTitleRow(widget, title, subtitle) {
  const row = widget.addStack();
  row.layoutHorizontally();
  const left = row.addText(title);
  left.font = Font.boldSystemFont(15);
  left.textColor = color(COLORS.text);
  row.addSpacer();
  const right = row.addText(subtitle);
  right.font = Font.systemFont(10);
  right.textColor = color(COLORS.muted);
}

function addBadge(stack, pct) {
  const badge = stack.addStack();
  badge.cornerRadius = 6;
  badge.setPadding(2, 5, 2, 5);
  const up = pct > 0.005;
  const down = pct < -0.005;
  badge.backgroundColor = color(up ? COLORS.green : down ? COLORS.red : COLORS.flat);
  const t = badge.addText(signedPct(pct));
  t.font = Font.boldSystemFont(11);
  t.textColor = color(up ? COLORS.greenInk : "#ffffff");
}

function addQuoteRow(widget, row, compact) {
  const line = widget.addStack();
  line.layoutHorizontally();
  line.centerAlignContent();
  const sym = line.addText(row.symbol);
  sym.font = Font.semiboldSystemFont(compact ? 11 : 12);
  sym.textColor = color(COLORS.text);
  line.addSpacer(6);
  const name = line.addText(row.name);
  name.font = Font.systemFont(compact ? 10 : 11);
  name.textColor = color(COLORS.muted);
  name.lineLimit = 1;
  line.addSpacer();
  const price = line.addText(nf(row.price, priceDigits(row.price)));
  price.font = Font.semiboldSystemFont(compact ? 11 : 12);
  price.textColor = color(COLORS.text);
  line.addSpacer(6);
  addBadge(line, row.changePct);
}

async function createWidget(family, data) {
  const widget = new ListWidget();
  widget.backgroundColor = color(COLORS.bg);
  widget.setPadding(12, 14, 12, 14);
  widget.url = PAGE_URL;
  const next = new Date();
  next.setMinutes(next.getMinutes() + REFRESH_MINUTES);
  widget.refreshAfterDate = next;

  const { rows, source } = data;
  const stats = summarize(rows);
  const when = formatMadrid(new Date());
  const srcLabel = source === "yahoo" ? "Yahoo" : "TradingView";

  if (family === "small") {
    const title = widget.addText("Cartera");
    title.font = Font.boldSystemFont(16);
    title.textColor = color(COLORS.text);
    widget.addSpacer(8);
    const counts = widget.addText(stats.up + " suben  ·  " + stats.down + " bajan");
    counts.font = Font.semiboldSystemFont(13);
    counts.textColor = color(COLORS.text);
    widget.addSpacer(8);
    if (stats.best) {
      const best = widget.addText("Mejor  " + stats.best.symbol + "  " + signedPct(stats.best.changePct));
      best.font = Font.mediumSystemFont(12);
      best.textColor = color(COLORS.green);
    }
    if (stats.worst) {
      const worst = widget.addText("Peor   " + stats.worst.symbol + "  " + signedPct(stats.worst.changePct));
      worst.font = Font.mediumSystemFont(12);
      worst.textColor = color(COLORS.red);
    }
    widget.addSpacer();
    const foot = widget.addText(when + "  ·  " + srcLabel);
    foot.font = Font.systemFont(9);
    foot.textColor = color(COLORS.muted);
    return widget;
  }

  addTitleRow(widget, "Cartera", when + " · " + srcLabel);
  widget.addSpacer(8);

  if (family === "medium") {
    const movers = topMovers(rows, 6);
    movers.forEach((row, i) => {
      addQuoteRow(widget, row, true);
      if (i < movers.length - 1) widget.addSpacer(5);
    });
    return widget;
  }

  const grouped = byGroupThenPct(rows).slice(0, 14);
  let lastGroup = null;
  grouped.forEach((row) => {
    if (row.group && row.group !== lastGroup) {
      lastGroup = row.group;
      widget.addSpacer(6);
      const h = widget.addText(row.group);
      h.font = Font.boldSystemFont(10);
      h.textColor = color(COLORS.muted);
      widget.addSpacer(3);
    }
    addQuoteRow(widget, row, true);
    widget.addSpacer(4);
  });
  return widget;
}

async function runWidget() {
  let data;
  try {
    data = await loadQuotes();
  } catch (error) {
    const widget = new ListWidget();
    widget.backgroundColor = color(COLORS.bg);
    widget.url = PAGE_URL;
    const t = widget.addText("Cartera");
    t.font = Font.boldSystemFont(16);
    t.textColor = color(COLORS.text);
    widget.addSpacer(8);
    const e = widget.addText("No se pudieron cargar las cotizaciones. " + error.message);
    e.font = Font.systemFont(12);
    e.textColor = color(COLORS.red);
    Script.setWidget(widget);
    Script.complete();
    return;
  }
  const family = config.widgetFamily || "medium";
  const widget = await createWidget(family, data);
  Script.setWidget(widget);
  if (!config.runsInWidget) {
    if (family === "small") await widget.presentSmall();
    else if (family === "large") await widget.presentLarge();
    else await widget.presentMedium();
  }
  Script.complete();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    loadPortfolio,
    fetchTradingView,
    fetchYahoo,
    fetchYahooChart,
    loadQuotes,
    summarize,
    topMovers,
    byGroupThenPct,
    signedPct,
    nf,
    formatMadrid,
    mergeRows
  };
} else {
  void runWidget();
}
