// Cartera — widget para Scriptable (iOS)
// Pégalo entero en un script nuevo. Guía: widget-ios.md
// Abre: https://miguelpdm.github.io/fictional-octo-rotary-phone/cartera/
//
// Camino del widget: lista embebida/caché + UNA llamada TradingView
// (Request.timeoutInterval). Sin temporizadores del DOM ni carreras de promesas.
// Play en la app siempre enseña la vista mediana o un error visible.

const PAGE_URL = "https://miguelpdm.github.io/fictional-octo-rotary-phone/cartera/";
const CONFIG_URL = "https://miguelpdm.github.io/fictional-octo-rotary-phone/data/cartera.json";
const TV_SCAN = "https://scanner.tradingview.com/global/scan";
const TV_COLUMNS = ["close", "change", "currency"];
const TZ = "Europe/Madrid";
const REFRESH_MINUTES = 15;
const CACHE_NAME = "cartera-widget-cache.json";
const WIDGET_TV_TIMEOUT = 2;
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

function logError(err) {
  var text = formatError(err);
  try {
    console.error(text);
  } catch (ignored) {}
}

function formatError(err) {
  var msg = "";
  var stack = "";
  if (err && err.message) msg = String(err.message);
  else msg = String(err);
  if (err && err.stack) stack = String(err.stack);
  if (stack && stack.indexOf(msg) === -1) return msg + "\n" + stack;
  return stack || msg;
}

function httpRequest(url, opts) {
  var timeoutSec = APP_TV_TIMEOUT;
  if (opts && opts.timeout != null) timeoutSec = opts.timeout;
  if (isScriptable()) {
    var req = new Request(url);
    req.method = (opts && opts.method) || "GET";
    req.timeoutInterval = timeoutSec;
    if (opts && opts.headers) req.headers = opts.headers;
    if (opts && opts.body != null) req.body = opts.body;
    return req.loadJSON();
  }
  var fetchFn = opts && opts.fetchImpl ? opts.fetchImpl : fetch;
  var init = {
    method: (opts && opts.method) || "GET",
    headers: (opts && opts.headers) || {},
    body: opts && opts.body
  };
  return fetchFn(url, init).then(function (res) {
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  });
}

function cacheStore(opts) {
  if (opts && opts.cacheStore) return opts.cacheStore;
  return {
    read: function () {
      if (!isScriptable()) return null;
      try {
        var fm = FileManager.local();
        var path = fm.joinPath(fm.documentsDirectory(), CACHE_NAME);
        if (!fm.fileExists(path)) return null;
        return JSON.parse(fm.readString(path));
      } catch (err) {
        return null;
      }
    },
    write: function (data) {
      if (!isScriptable()) return;
      try {
        var fm = FileManager.local();
        var path = fm.joinPath(fm.documentsDirectory(), CACHE_NAME);
        fm.writeString(path, JSON.stringify(data));
      } catch (err) {}
    }
  };
}

function compactPositions(list) {
  if (!Array.isArray(list)) return [];
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var p = list[i];
    if (!p || !p.symbol) continue;
    out.push({
      symbol: p.symbol,
      tv: p.tv,
      yahoo: p.yahoo,
      name: p.name,
      group: p.group
    });
  }
  return out;
}

function uniqueYahooSymbols(positions) {
  var out = [];
  var seen = {};
  for (var i = 0; i < positions.length; i++) {
    var s = positions[i].yahoo || positions[i].symbol;
    if (!s || seen[s]) continue;
    seen[s] = true;
    out.push(s);
  }
  return out;
}

function nf(value, digits) {
  var n = Number(value);
  if (!isFinite(n)) return "n/d";
  try {
    return n.toLocaleString("es-ES", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
  } catch (err) {
    return n.toFixed(digits).replace(".", ",");
  }
}

function signedPct(pct) {
  if (pct == null || isNaN(pct)) return "n/d";
  var sign = pct > 0 ? "+" : "";
  return sign + nf(pct, 2) + "%";
}

function pad2(n) {
  return (n < 10 ? "0" : "") + String(n);
}

function madridDate(date) {
  var d = date instanceof Date ? date : new Date(date);
  try {
    var parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: TZ,
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).formatToParts(d);
    var map = {};
    for (var i = 0; i < parts.length; i++) {
      map[parts[i].type] = parts[i].value;
    }
    return {
      day: map.day || pad2(d.getDate()),
      month: map.month || pad2(d.getMonth() + 1),
      hour: map.hour || pad2(d.getHours()),
      minute: map.minute || pad2(d.getMinutes())
    };
  } catch (err) {
    try {
      var s = d.toLocaleString("es-ES", { timeZone: TZ });
      return { day: "", month: "", hour: s, minute: "" };
    } catch (err2) {
      return {
        day: pad2(d.getDate()),
        month: pad2(d.getMonth() + 1),
        hour: pad2(d.getHours()),
        minute: pad2(d.getMinutes())
      };
    }
  }
}

function formatMadrid(date) {
  var p = madridDate(date);
  if (p.day && p.month) return p.day + "/" + p.month + ", " + p.hour + ":" + p.minute;
  return p.hour;
}

function formatHM(date) {
  var p = madridDate(date);
  if (p.minute !== "") return p.hour + ":" + p.minute;
  return p.hour;
}

function priceDigits(value) {
  var abs = Math.abs(value);
  if (abs < 1) return 4;
  if (abs < 10) return 3;
  return 2;
}

async function loadPortfolio(opts) {
  var data = await httpRequest(CONFIG_URL, opts);
  var positions = compactPositions(data.positions);
  if (!positions.length) throw new Error("cartera.json sin posiciones");
  return positions;
}

async function fetchTradingView(positions, opts) {
  var tickers = [];
  for (var i = 0; i < positions.length; i++) {
    if (positions[i].tv) tickers.push(positions[i].tv);
  }
  var payload = await httpRequest(TV_SCAN, {
    fetchImpl: opts && opts.fetchImpl,
    timeout: opts && opts.timeout,
    method: "POST",
    headers: { "content-type": "text/plain;charset=UTF-8" },
    body: JSON.stringify({ symbols: { tickers: tickers }, columns: TV_COLUMNS })
  });
  var map = {};
  var rows = payload && payload.data ? payload.data : [];
  for (var r = 0; r < rows.length; r++) {
    var item = rows[r];
    var d = item.d || [];
    var close = d[0];
    if (close == null) continue;
    map[item.s] = {
      price: close,
      changePct: d[1],
      currency: d[2]
    };
  }
  if (!Object.keys(map).length) throw new Error("TradingView vacío");
  return map;
}

function quoteFromYahooChart(result) {
  var meta = result && result.meta;
  if (!meta || meta.regularMarketPrice == null) return null;
  var previousClose = meta.chartPreviousClose || meta.previousClose;
  var price = meta.regularMarketPrice;
  var change = previousClose ? price - previousClose : 0;
  var changePct = previousClose ? (change / previousClose) * 100 : 0;
  return {
    price: price,
    changePct: changePct,
    currency: meta.currency,
    name: meta.shortName || meta.symbol
  };
}

async function fetchYahooSpark(positions, opts) {
  var symbols = uniqueYahooSymbols(positions);
  var url =
    "https://query1.finance.yahoo.com/v7/finance/spark?symbols=" +
    encodeURIComponent(symbols.join(",")) +
    "&range=1d&interval=1d";
  var payload = await httpRequest(url, {
    fetchImpl: opts && opts.fetchImpl,
    timeout: opts && opts.timeout,
    headers: { "User-Agent": "Mozilla/5.0 (compatible; CarteraWidget/1.0)" }
  });
  var map = {};
  var result = payload && payload.spark && payload.spark.result ? payload.spark.result : [];
  for (var i = 0; i < result.length; i++) {
    var item = result[i];
    var quoted = quoteFromYahooChart(item.response && item.response[0]);
    if (quoted) map[item.symbol] = quoted;
  }
  if (!Object.keys(map).length) throw new Error("Yahoo vacío");
  return map;
}

function mergeRows(positions, quoteMap, key) {
  var out = [];
  for (var i = 0; i < positions.length; i++) {
    var p = positions[i];
    var q = quoteMap[p[key] || p.symbol] || quoteMap[p.yahoo] || quoteMap[p.tv];
    if (!q || q.price == null) {
      out.push({ symbol: p.symbol, name: p.name, group: p.group, missing: true });
    } else {
      out.push({
        symbol: p.symbol,
        name: p.name || q.name,
        group: p.group,
        price: q.price,
        changePct: q.changePct,
        currency: q.currency,
        missing: false
      });
    }
  }
  return out;
}

function snapshotFrom(positions, map, key, source) {
  var rows = mergeRows(positions, map, key);
  var priced = 0;
  for (var i = 0; i < rows.length; i++) {
    if (!rows[i].missing) priced += 1;
  }
  if (!priced) throw new Error("sin cotizaciones");
  return {
    positions: positions,
    rows: rows,
    source: source,
    at: Date.now(),
    stale: false
  };
}

function cachedPayload(raw) {
  if (!raw || !Array.isArray(raw.rows) || !raw.rows.length) return null;
  var positions = compactPositions(raw.positions);
  if (!positions.length) positions = EMBEDDED_POSITIONS.slice();
  return {
    positions: positions,
    rows: raw.rows,
    source: raw.source || "cache",
    at: raw.at || 0,
    stale: true
  };
}

async function loadQuotes(opts) {
  var options = opts || {};
  var widget = runsInWidget(options);
  var store = cacheStore(options);
  var cached = cachedPayload(store.read());
  var positions = cached && cached.positions.length ? cached.positions : EMBEDDED_POSITIONS.slice();
  var tvTimeout = widget ? WIDGET_TV_TIMEOUT : APP_TV_TIMEOUT;
  var cfgP = null;
  if (!widget) {
    cfgP = loadPortfolio({ fetchImpl: options.fetchImpl, timeout: APP_CONFIG_TIMEOUT }).catch(function () {
      return null;
    });
  }

  try {
    var map = await fetchTradingView(positions, { fetchImpl: options.fetchImpl, timeout: tvTimeout });
    var nextPositions = positions;
    if (cfgP) {
      var cfg = await cfgP;
      if (cfg && cfg.length) nextPositions = cfg;
    }
    var data = snapshotFrom(nextPositions, map, "tv", "tradingview");
    store.write({ positions: nextPositions, rows: data.rows, source: data.source, at: data.at });
    return data;
  } catch (tvErr) {
    if (widget) {
      if (cached) return cached;
      throw tvErr;
    }
    try {
      var ymap = await fetchYahooSpark(positions, {
        fetchImpl: options.fetchImpl,
        timeout: APP_YAHOO_TIMEOUT
      });
      var ycfg = cfgP ? await cfgP : null;
      var ypositions = ycfg && ycfg.length ? ycfg : positions;
      var ydata = snapshotFrom(ypositions, ymap, "yahoo", "yahoo");
      store.write({ positions: ypositions, rows: ydata.rows, source: ydata.source, at: ydata.at });
      return ydata;
    } catch (yahooErr) {
      if (cached) return cached;
      throw yahooErr;
    }
  }
}

function summarize(rows) {
  var priced = [];
  for (var i = 0; i < rows.length; i++) {
    if (!rows[i].missing && rows[i].changePct != null) priced.push(rows[i]);
  }
  var up = 0;
  var down = 0;
  var best = null;
  var worst = null;
  for (var j = 0; j < priced.length; j++) {
    var r = priced[j];
    if (r.changePct > 0.005) up += 1;
    if (r.changePct < -0.005) down += 1;
    if (!best || r.changePct > best.changePct) best = r;
    if (!worst || r.changePct < worst.changePct) worst = r;
  }
  return { up: up, down: down, best: best, worst: worst, priced: priced };
}

function topMovers(rows, n) {
  var list = [];
  for (var i = 0; i < rows.length; i++) {
    if (!rows[i].missing && rows[i].changePct != null) list.push(rows[i]);
  }
  list.sort(function (a, b) {
    return Math.abs(b.changePct) - Math.abs(a.changePct);
  });
  return list.slice(0, n);
}

function byGroupThenPct(rows) {
  var order = { P0: 0, P1: 1, P2: 2 };
  var list = [];
  for (var i = 0; i < rows.length; i++) {
    if (!rows[i].missing && rows[i].changePct != null) list.push(rows[i]);
  }
  list.sort(function (a, b) {
    var ga = order[a.group] != null ? order[a.group] : 9;
    var gb = order[b.group] != null ? order[b.group] : 9;
    if (ga !== gb) return ga - gb;
    return b.changePct - a.changePct;
  });
  return list;
}

function footerText(data) {
  var when = new Date(data.at || Date.now());
  if (data.stale) return "datos de " + formatHM(when);
  var src = data.source === "yahoo" ? "Yahoo" : "TradingView";
  return formatMadrid(when) + " · " + src;
}

function color(hex) {
  return new Color(hex);
}

function addTitleRow(widget, title, subtitle) {
  var row = widget.addStack();
  row.layoutHorizontally();
  var left = row.addText(title);
  left.font = Font.boldSystemFont(15);
  left.textColor = color(COLORS.text);
  row.addSpacer();
  var right = row.addText(subtitle);
  right.font = Font.systemFont(10);
  right.textColor = color(COLORS.muted);
  right.lineLimit = 1;
}

function addBadge(stack, pct) {
  var badge = stack.addStack();
  badge.cornerRadius = 6;
  badge.setPadding(2, 5, 2, 5);
  var up = pct > 0.005;
  var down = pct < -0.005;
  badge.backgroundColor = color(up ? COLORS.green : down ? COLORS.red : COLORS.flat);
  var t = badge.addText(signedPct(pct));
  t.font = Font.boldSystemFont(11);
  t.textColor = color(up ? COLORS.greenInk : "#ffffff");
}

function addQuoteRow(widget, row, compact) {
  var line = widget.addStack();
  line.layoutHorizontally();
  line.centerAlignContent();
  var sym = line.addText(row.symbol);
  sym.font = Font.boldSystemFont(compact ? 11 : 12);
  sym.textColor = color(COLORS.text);
  line.addSpacer(6);
  var name = line.addText(row.name);
  name.font = Font.systemFont(compact ? 10 : 11);
  name.textColor = color(COLORS.muted);
  name.lineLimit = 1;
  line.addSpacer();
  var price = line.addText(nf(row.price, priceDigits(row.price)));
  price.font = Font.boldSystemFont(compact ? 11 : 12);
  price.textColor = color(COLORS.text);
  line.addSpacer(6);
  addBadge(line, row.changePct);
}

function createWidget(family, data) {
  var widget = new ListWidget();
  widget.backgroundColor = color(COLORS.bg);
  widget.setPadding(12, 14, 12, 14);
  widget.url = PAGE_URL;
  var next = new Date();
  next.setMinutes(next.getMinutes() + REFRESH_MINUTES);
  widget.refreshAfterDate = next;

  var rows = data.rows || [];
  var stats = summarize(rows);
  var footLabel = footerText(data);

  if (family === "small") {
    var title = widget.addText("Cartera");
    title.font = Font.boldSystemFont(16);
    title.textColor = color(COLORS.text);
    widget.addSpacer(8);
    var counts = widget.addText(stats.up + " suben  ·  " + stats.down + " bajan");
    counts.font = Font.boldSystemFont(13);
    counts.textColor = color(COLORS.text);
    widget.addSpacer(8);
    if (stats.best) {
      var best = widget.addText("Mejor  " + stats.best.symbol + "  " + signedPct(stats.best.changePct));
      best.font = Font.systemFont(12);
      best.textColor = color(COLORS.green);
    }
    if (stats.worst) {
      var worst = widget.addText("Peor   " + stats.worst.symbol + "  " + signedPct(stats.worst.changePct));
      worst.font = Font.systemFont(12);
      worst.textColor = color(COLORS.red);
    }
    widget.addSpacer();
    var foot = widget.addText(footLabel);
    foot.font = Font.systemFont(9);
    foot.textColor = color(COLORS.muted);
    foot.lineLimit = 1;
    return widget;
  }

  addTitleRow(widget, "Cartera", footLabel);
  widget.addSpacer(8);

  if (family === "medium") {
    var movers = topMovers(rows, 6);
    for (var i = 0; i < movers.length; i++) {
      addQuoteRow(widget, movers[i], true);
      if (i < movers.length - 1) widget.addSpacer(5);
    }
    return widget;
  }

  var grouped = byGroupThenPct(rows).slice(0, 14);
  var lastGroup = null;
  for (var g = 0; g < grouped.length; g++) {
    var row = grouped[g];
    if (row.group && row.group !== lastGroup) {
      lastGroup = row.group;
      widget.addSpacer(6);
      var h = widget.addText(row.group);
      h.font = Font.boldSystemFont(10);
      h.textColor = color(COLORS.muted);
      widget.addSpacer(3);
    }
    addQuoteRow(widget, row, true);
    widget.addSpacer(4);
  }
  return widget;
}

function errorWidget(message) {
  var widget = new ListWidget();
  widget.backgroundColor = color(COLORS.bg);
  widget.url = PAGE_URL;
  var t = widget.addText("Cartera");
  t.font = Font.boldSystemFont(16);
  t.textColor = color(COLORS.text);
  widget.addSpacer(8);
  var e = widget.addText(message || "Error");
  e.font = Font.systemFont(12);
  e.textColor = color(COLORS.red);
  e.lineLimit = 8;
  return widget;
}

async function presentInApp(widget) {
  await widget.presentMedium();
}

async function showAlert(text) {
  var alert = new Alert();
  alert.title = "Cartera";
  alert.message = text;
  await alert.present();
}

async function runWidget() {
  var inWidget = false;
  var widget = null;
  var failed = false;
  var failText = "";
  try {
    inWidget = runsInWidget();
    var data = await loadQuotes({ inWidget: inWidget });
    var family = "medium";
    if (inWidget) {
      try {
        if (typeof config !== "undefined" && config.widgetFamily) family = config.widgetFamily;
      } catch (err) {}
    }
    widget = createWidget(family, data);
  } catch (error) {
    failed = true;
    failText = formatError(error);
    logError(error);
    try {
      widget = errorWidget(failText);
    } catch (err2) {
      logError(err2);
    }
  }

  try {
    if (widget) Script.setWidget(widget);
  } catch (err) {
    logError(err);
  }

  if (!inWidget) {
    try {
      if (widget) await presentInApp(widget);
    } catch (err) {
      logError(err);
      failed = true;
      failText = failText || formatError(err);
    }
    if (failed) {
      try {
        await showAlert(failText || "Error al ejecutar el widget");
      } catch (err) {
        logError(err);
      }
    }
  }

  try {
    Script.complete();
  } catch (err) {
    logError(err);
  }
}

var __exports = {
  EMBEDDED_POSITIONS: EMBEDDED_POSITIONS,
  loadPortfolio: loadPortfolio,
  fetchTradingView: fetchTradingView,
  fetchYahooSpark: fetchYahooSpark,
  loadQuotes: loadQuotes,
  summarize: summarize,
  topMovers: topMovers,
  byGroupThenPct: byGroupThenPct,
  signedPct: signedPct,
  nf: nf,
  formatMadrid: formatMadrid,
  formatHM: formatHM,
  footerText: footerText,
  mergeRows: mergeRows,
  formatError: formatError,
  WIDGET_TV_TIMEOUT: WIDGET_TV_TIMEOUT
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = __exports;
}

if (typeof Script !== "undefined") {
  await runWidget();
}
