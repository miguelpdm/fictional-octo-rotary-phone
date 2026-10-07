// Cartera — widget para Scriptable (iOS)
// Pégalo entero en un script nuevo. Guía: widget-ios.md
// Abre: https://miguelpdm.github.io/fictional-octo-rotary-phone/cartera/
//
// El widget de iOS mata el script a los pocos segundos. Camino crítico:
// lista embebida/caché + UNA llamada a TradingView con timeout corto.
// Yahoo solo al pulsar Play en la app. Si la red falla, se pintan datos en caché.

const PAGE_URL = "https://miguelpdm.github.io/fictional-octo-rotary-phone/cartera/";
const CONFIG_URL = "https://miguelpdm.github.io/fictional-octo-rotary-phone/data/cartera.json";
const TV_SCAN = "https://scanner.tradingview.com/global/scan";
const TV_COLUMNS = ["close", "change", "currency"];
const TZ = "Europe/Madrid";
const REFRESH_MINUTES = 15;
const CACHE_NAME = "cartera-widget-cache.json";
const WIDGET_TV_TIMEOUT = 2;
const WIDGET_BUDGET_MS = 2200;
const APP_TV_TIMEOUT = 8;
const APP_CONFIG_TIMEOUT = 6;
const APP_YAHOO_TIMEOUT = 6;
const COLORS = {
  bg: "#0b0d10",
  text: "#f4f6f8",
  muted: "#8b95a5",
  green: "#30d158",
  greenInk: "#04210c",
  red: "#ff453a",
  flat: "#3a4150"
};

const EMBEDDED_POSITIONS = [
  { symbol: "QTRX", tv: "NASDAQ:QTRX", yahoo: "QTRX", name: "Quanterix", group: "P0" },
  { symbol: "HUMA", tv: "NASDAQ:HUMA", yahoo: "HUMA", name: "Humacyte", group: "P0" },
  { symbol: "LFMD", tv: "NASDAQ:LFMD", yahoo: "LFMD", name: "LifeMD", group: "P0" },
  { symbol: "IFRX", tv: "NASDAQ:IFRX", yahoo: "IFRX", name: "InflaRx", group: "P0" },
  { symbol: "UPXI", tv: "NASDAQ:UPXI", yahoo: "UPXI", name: "Upexi", group: "P0" },
  { symbol: "CHTR", tv: "NASDAQ:CHTR", yahoo: "CHTR", name: "Charter Communications", group: "P0" },
  { symbol: "UMG.AS", tv: "EURONEXT:UMG", yahoo: "UMG.AS", name: "Universal Music Group", group: "P0" },
  { symbol: "HIMS", tv: "NYSE:HIMS", yahoo: "HIMS", name: "Hims & Hers Health", group: "P1" },
  { symbol: "EL.PA", tv: "EURONEXT:EL", yahoo: "EL.PA", name: "EssilorLuxottica", group: "P1" },
  { symbol: "GRF.MC", tv: "BME:GRF", yahoo: "GRF.MC", name: "Grifols", group: "P1" },
  { symbol: "SABR", tv: "NASDAQ:SABR", yahoo: "SABR", name: "Sabre", group: "P1" },
  { symbol: "ADBE", tv: "NASDAQ:ADBE", yahoo: "ADBE", name: "Adobe", group: "P1" },
  { symbol: "RED.MC", tv: "BME:RED", yahoo: "RED.MC", name: "Redeia", group: "P1" },
  { symbol: "ASST", tv: "NASDAQ:ASST", yahoo: "ASST", name: "Strive", group: "P1" },
  { symbol: "BKNG", tv: "NASDAQ:BKNG", yahoo: "BKNG", name: "Booking Holdings", group: "P1" },
  { symbol: "PG", tv: "NYSE:PG", yahoo: "PG", name: "Procter & Gamble", group: "P1" },
  { symbol: "SPGI", tv: "NYSE:SPGI", yahoo: "SPGI", name: "S&P Global", group: "P1" },
  { symbol: "ACN", tv: "NYSE:ACN", yahoo: "ACN", name: "Accenture", group: "P1" },
  { symbol: "BRNT.MI", tv: "EURONEXT:BRNT", yahoo: "BRNT.MI", name: "WisdomTree Brent Crude Oil", group: "P2" },
  { symbol: "SGLD.L", tv: "LSE:SGLD", yahoo: "SGLD.L", name: "Invesco Physical Gold", group: "P2" },
  { symbol: "SSLV.L", tv: "LSE:SSLV", yahoo: "SSLV.L", name: "Invesco Physical Silver", group: "P2" },
  { symbol: "XGLD.L", tv: "LSE:XGLD", yahoo: "XGLD.L", name: "Xtrackers Physical Gold ETC", group: "P2" }
];

function isScriptable() {
  return typeof ListWidget !== "undefined";
}

function runsInWidget(opts) {
  if (opts && opts.inWidget != null) return !!opts.inWidget;
  try {
    return typeof config !== "undefined" && !!config.runsInWidget;
  } catch (err) {
    return false;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withBudget(promise, ms) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("tiempo agotado")), ms);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function httpRequest(url, opts) {
  const timeoutSec = (opts && opts.timeout) != null ? opts.timeout : APP_TV_TIMEOUT;
  if (isScriptable()) {
    const req = new Request(url);
    req.method = (opts && opts.method) || "GET";
    req.timeoutInterval = timeoutSec;
    if (opts && opts.headers) req.headers = opts.headers;
    if (opts && opts.body != null) req.body = opts.body;
    return req.loadJSON();
  }
  const fetchFn = opts && opts.fetchImpl ? opts.fetchImpl : fetch;
  const init = {
    method: (opts && opts.method) || "GET",
    headers: (opts && opts.headers) || {},
    body: opts && opts.body
  };
  if (typeof AbortSignal !== "undefined" && AbortSignal.timeout) {
    init.signal = AbortSignal.timeout(Math.max(1, timeoutSec * 1000));
  }
  return fetchFn(url, init).then((res) => {
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  });
}

function cacheStore(opts) {
  if (opts && opts.cacheStore) return opts.cacheStore;
  return {
    read() {
      if (!isScriptable()) return null;
      try {
        const fm = FileManager.local();
        const path = fm.joinPath(fm.documentsDirectory(), CACHE_NAME);
        if (!fm.fileExists(path)) return null;
        return JSON.parse(fm.readString(path));
      } catch (err) {
        return null;
      }
    },
    write(data) {
      if (!isScriptable()) return;
      try {
        const fm = FileManager.local();
        const path = fm.joinPath(fm.documentsDirectory(), CACHE_NAME);
        fm.writeString(path, JSON.stringify(data));
      } catch (err) {
        /* ignore */
      }
    }
  };
}

function compactPositions(list) {
  if (!Array.isArray(list)) return [];
  return list.map((p) => ({
    symbol: p.symbol,
    tv: p.tv,
    yahoo: p.yahoo,
    name: p.name,
    group: p.group
  })).filter((p) => p.symbol);
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

function formatHM(date) {
  return date.toLocaleString("es-ES", {
    timeZone: TZ,
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

async function loadPortfolio(opts) {
  const data = await httpRequest(CONFIG_URL, opts);
  const positions = compactPositions(data.positions);
  if (!positions.length) throw new Error("cartera.json sin posiciones");
  return positions;
}

async function fetchTradingView(positions, opts) {
  const tickers = positions.map((p) => p.tv).filter(Boolean);
  const payload = await httpRequest(TV_SCAN, {
    fetchImpl: opts && opts.fetchImpl,
    timeout: opts && opts.timeout,
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
      currency: row.currency
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
    currency: meta.currency,
    name: meta.shortName || meta.symbol
  };
}

async function fetchYahooSpark(positions, opts) {
  const symbols = [...new Set(positions.map((p) => p.yahoo || p.symbol))];
  const url =
    "https://query1.finance.yahoo.com/v7/finance/spark?symbols=" +
    encodeURIComponent(symbols.join(",")) +
    "&range=1d&interval=1d";
  const payload = await httpRequest(url, {
    fetchImpl: opts && opts.fetchImpl,
    timeout: opts && opts.timeout,
    headers: { "User-Agent": "Mozilla/5.0 (compatible; CarteraWidget/1.0)" }
  });
  const map = {};
  for (const item of (payload.spark && payload.spark.result) || []) {
    const quoted = quoteFromYahooChart(item.response && item.response[0]);
    if (quoted) map[item.symbol] = quoted;
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

function snapshotFrom(positions, map, key, source) {
  const rows = mergeRows(positions, map, key);
  const priced = rows.filter((r) => !r.missing).length;
  if (!priced) throw new Error("sin cotizaciones");
  return {
    positions,
    rows,
    source,
    at: Date.now(),
    stale: false
  };
}

function cachedPayload(raw) {
  if (!raw || !Array.isArray(raw.rows) || !raw.rows.length) return null;
  return {
    positions: compactPositions(raw.positions) || EMBEDDED_POSITIONS,
    rows: raw.rows,
    source: raw.source || "cache",
    at: raw.at || 0,
    stale: true
  };
}

async function loadQuotes(opts) {
  const options = opts || {};
  const widget = runsInWidget(options);
  const store = cacheStore(options);
  const cached = cachedPayload(store.read());
  const positions = (cached && cached.positions.length)
    ? cached.positions
    : EMBEDDED_POSITIONS.slice();

  const tvTimeout = widget ? WIDGET_TV_TIMEOUT : APP_TV_TIMEOUT;
  const budget = widget ? WIDGET_BUDGET_MS : 14000;
  const tvP = fetchTradingView(positions, { fetchImpl: options.fetchImpl, timeout: tvTimeout });
  const cfgP = widget
    ? Promise.resolve(null)
    : loadPortfolio({ fetchImpl: options.fetchImpl, timeout: APP_CONFIG_TIMEOUT }).catch(() => null);

  try {
    const map = await withBudget(tvP, budget);
    const cfg = await Promise.race([cfgP, delay(widget ? 0 : 1200)]);
    const nextPositions = cfg && cfg.length ? cfg : positions;
    const data = snapshotFrom(nextPositions, map, "tv", "tradingview");
    store.write({ positions: nextPositions, rows: data.rows, source: data.source, at: data.at });
    return data;
  } catch (tvErr) {
    if (widget) {
      if (cached) return cached;
      throw tvErr;
    }
    try {
      const map = await withBudget(
        fetchYahooSpark(positions, { fetchImpl: options.fetchImpl, timeout: APP_YAHOO_TIMEOUT }),
        APP_YAHOO_TIMEOUT * 1000
      );
      const cfg = await Promise.race([cfgP, delay(400)]);
      const nextPositions = cfg && cfg.length ? cfg : positions;
      const data = snapshotFrom(nextPositions, map, "yahoo", "yahoo");
      store.write({ positions: nextPositions, rows: data.rows, source: data.source, at: data.at });
      return data;
    } catch (yahooErr) {
      if (cached) return cached;
      throw yahooErr;
    }
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

function footerText(data) {
  const when = new Date(data.at || Date.now());
  if (data.stale) return "datos de " + formatHM(when);
  const src = data.source === "yahoo" ? "Yahoo" : "TradingView";
  return formatMadrid(when) + " · " + src;
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
  right.lineLimit = 1;
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

function createWidget(family, data) {
  const widget = new ListWidget();
  widget.backgroundColor = color(COLORS.bg);
  widget.setPadding(12, 14, 12, 14);
  widget.url = PAGE_URL;
  const next = new Date();
  next.setMinutes(next.getMinutes() + REFRESH_MINUTES);
  widget.refreshAfterDate = next;

  const { rows } = data;
  const stats = summarize(rows);
  const footLabel = footerText(data);

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
    const foot = widget.addText(footLabel);
    foot.font = Font.systemFont(9);
    foot.textColor = color(COLORS.muted);
    foot.lineLimit = 1;
    return widget;
  }

  addTitleRow(widget, "Cartera", footLabel);
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

function errorWidget(message) {
  const widget = new ListWidget();
  widget.backgroundColor = color(COLORS.bg);
  widget.url = PAGE_URL;
  const t = widget.addText("Cartera");
  t.font = Font.boldSystemFont(16);
  t.textColor = color(COLORS.text);
  widget.addSpacer(8);
  const e = widget.addText(message);
  e.font = Font.systemFont(12);
  e.textColor = color(COLORS.red);
  e.lineLimit = 6;
  return widget;
}

async function runWidget() {
  const inWidget = runsInWidget();
  let data;
  try {
    data = await loadQuotes({ inWidget });
  } catch (error) {
    const widget = errorWidget(
      inWidget
        ? "Sin datos. Abre Scriptable y pulsa Play una vez."
        : "No se pudieron cargar las cotizaciones. " + error.message
    );
    Script.setWidget(widget);
    if (!inWidget) await widget.presentSmall();
    Script.complete();
    return;
  }
  const family = (typeof config !== "undefined" && config.widgetFamily) || "medium";
  const widget = createWidget(family, data);
  Script.setWidget(widget);
  if (!inWidget) {
    if (family === "small") await widget.presentSmall();
    else if (family === "large") await widget.presentLarge();
    else await widget.presentMedium();
  }
  Script.complete();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    EMBEDDED_POSITIONS,
    loadPortfolio,
    fetchTradingView,
    fetchYahooSpark,
    loadQuotes,
    summarize,
    topMovers,
    byGroupThenPct,
    signedPct,
    nf,
    formatMadrid,
    formatHM,
    footerText,
    mergeRows,
    WIDGET_BUDGET_MS,
    WIDGET_TV_TIMEOUT
  };
} else {
  void runWidget();
}
