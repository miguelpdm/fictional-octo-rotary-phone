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
const TV_COLUMNS = ["close", "change", "change_abs", "currency"];
const TZ = "Europe/Madrid";
const REFRESH_MINUTES = 15;
const CACHE_NAME = "cartera-widget-cache-v3.json";
const WIDGET_TV_TIMEOUT = 6;
const APP_TV_TIMEOUT = 8;
const APP_CONFIG_TIMEOUT = 6;
const APP_YAHOO_TIMEOUT = 6;
const COLORS = {
  bg: "#1c1c1e",
  bgAlpha: 0.82,
  text: "#ffffff",
  muted: "#8e8e93",
  green: "#30d158",
  red: "#ff453a",
  flat: "#8e8e93",
  sep: "#ffffff",
  sepAlpha: 0.14
};

const EMBEDDED_POSITIONS = [
  { symbol: "QTRX", tv: "NASDAQ:QTRX", yahoo: "QTRX", name: "Quanterix", group: "P0" },
  { symbol: "HUMA", tv: "NASDAQ:HUMA", yahoo: "HUMA", name: "Humacyte", group: "P0" },
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
  { symbol: "XSLR.DE", tv: "XETR:XSLR", yahoo: "XSLR.DE", name: "Xtrackers IE Physical Silver ETC", group: "P2" },
  { symbol: "SLVR.DE", tv: "XETR:SLVR", yahoo: "SLVR.DE", name: "Global X Silver Miners UCITS ETF", group: "P2" },
  { symbol: "XC4X.F", tv: "", yahoo: "XC4X.F", name: "Fidelity China Focus", group: "P2" },
  { symbol: "BTC-USD", tv: "BITSTAMP:BTCUSD", yahoo: "BTC-USD", name: "Bitcoin (BTC)", group: "P2" }
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
  return sign + nf(pct, 2) + " %";
}

function nfFlex(value, minD, maxD) {
  var n = Number(value);
  if (!isFinite(n)) return "n/d";
  try {
    return n.toLocaleString("es-ES", {
      minimumFractionDigits: minD,
      maximumFractionDigits: maxD
    });
  } catch (err) {
    var s = n.toFixed(maxD);
    var dot = s.indexOf(".");
    if (dot !== -1) {
      while (s.length - dot - 1 > minD && s.slice(-1) === "0") {
        s = s.slice(0, -1);
      }
    }
    return s.replace(".", ",");
  }
}

function absChangeDigits(price) {
  var a = Math.abs(Number(price));
  if (!isFinite(a) || a < 1) return 4;
  if (a < 10) return 3;
  return 2;
}

function signedAbs(value, price) {
  if (value == null || isNaN(value)) return "n/d";
  var sign = value > 0 ? "+" : "";
  return sign + nfFlex(value, 2, absChangeDigits(price));
}

function absFromPct(price, pct) {
  if (price == null || pct == null || !isFinite(price) || !isFinite(pct)) return null;
  var prev = price / (1 + pct / 100);
  if (!isFinite(prev)) return null;
  return price - prev;
}

function dirClass(pct) {
  if (pct > 0.005) return "up";
  if (pct < -0.005) return "down";
  return "flat";
}

function dirTriangle(pct) {
  var d = dirClass(pct);
  if (d === "up") return "▲";
  if (d === "down") return "▼";
  return "–";
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
      changeAbs: d[2],
      currency: d[3]
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
    changeAbs: change,
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
      var changeAbs = q.changeAbs;
      if (changeAbs == null && q.change != null) changeAbs = q.change;
      if (changeAbs == null) changeAbs = absFromPct(q.price, q.changePct);
      out.push({
        symbol: p.symbol,
        name: p.name || q.name,
        group: p.group,
        price: q.price,
        changePct: q.changePct,
        changeAbs: changeAbs,
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

function allowedSymbols() {
  var allow = {};
  for (var i = 0; i < EMBEDDED_POSITIONS.length; i++) {
    allow[EMBEDDED_POSITIONS[i].symbol] = true;
  }
  return allow;
}

function cachedPayload(raw) {
  if (!raw || !Array.isArray(raw.rows) || !raw.rows.length) return null;
  var allow = allowedSymbols();
  var rows = [];
  for (var i = 0; i < raw.rows.length; i++) {
    var row = raw.rows[i];
    if (row && allow[row.symbol]) rows.push(row);
  }
  if (!rows.length) return null;
  return {
    positions: EMBEDDED_POSITIONS.slice(),
    rows: rows,
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
  var positions = EMBEDDED_POSITIONS.slice();
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

function sortByPct(rows) {
  var list = [];
  for (var i = 0; i < rows.length; i++) {
    if (!rows[i].missing && rows[i].changePct != null) list.push(rows[i]);
  }
  list.sort(function (a, b) {
    return b.changePct - a.changePct;
  });
  return list;
}

function footerText(data) {
  var when = new Date((data && data.at) || Date.now());
  var hm = formatHM(when);
  if (data && data.stale) return "datos de " + hm;
  return hm;
}

function color(hex, alpha) {
  if (alpha == null) return new Color(hex);
  return new Color(hex, alpha);
}

function dirColor(pct) {
  var d = dirClass(pct);
  if (d === "up") return color(COLORS.green);
  if (d === "down") return color(COLORS.red);
  return color(COLORS.flat);
}

function rowChangeAbs(row) {
  if (row.changeAbs != null && isFinite(row.changeAbs)) return row.changeAbs;
  return absFromPct(row.price, row.changePct);
}

function screenWidth() {
  try {
    if (typeof Device !== "undefined" && Device.screenSize) {
      return Device.screenSize().width;
    }
  } catch (err) {}
  return 390;
}

function familySize(family) {
  var w = screenWidth();
  var small = 158;
  var medW = 338;
  var medH = 158;
  var largeH = 354;
  if (w <= 360) {
    small = 141;
    medW = 292;
    medH = 141;
    largeH = 311;
  } else if (w <= 375) {
    small = 148;
    medW = 321;
    medH = 148;
    largeH = 324;
  } else if (w <= 393) {
    small = 158;
    medW = 338;
    medH = 158;
    largeH = 354;
  } else if (w <= 428) {
    small = 170;
    medW = 364;
    medH = 170;
    largeH = 382;
  } else {
    small = 170;
    medW = 364;
    medH = 170;
    largeH = 382;
  }
  if (family === "small") return { w: small, h: small };
  if (family === "medium") return { w: medW, h: medH };
  return { w: medW, h: largeH };
}

function pickExtremes(rows, eachSide) {
  var ranked = sortByPct(rows);
  var n = ranked.length;
  var leftN = 0;
  var rightN = 0;
  if (n <= 0) return { left: [], right: [] };
  if (n === 1) return { left: ranked.slice(), right: [] };
  if (n <= eachSide * 2) {
    leftN = Math.ceil(n / 2);
    rightN = Math.floor(n / 2);
  } else {
    leftN = eachSide;
    rightN = eachSide;
  }
  var left = ranked.slice(0, leftN);
  var right = ranked.slice(n - rightN, n).slice();
  right.sort(function (a, b) {
    return a.changePct - b.changePct;
  });
  return { left: left, right: right };
}

function layoutForFamily(family, nHoldings) {
  var n = nHoldings > 0 ? nHoldings : 0;
  if (family === "small") {
    return {
      cols: 2,
      eachSide: 2,
      padY: 12,
      padX: 12,
      gutter: 12,
      tickerSize: 13,
      metaSize: 12,
      absSize: 12,
      triSize: 10,
      cellGap: 1,
      sepPad: 3
    };
  }
  if (family === "medium") {
    return {
      cols: 2,
      eachSide: 3,
      padY: 14,
      padX: 14,
      gutter: 16,
      tickerSize: 14,
      metaSize: 13,
      absSize: 13,
      triSize: 11,
      cellGap: 2,
      sepPad: 4
    };
  }
  return {
    cols: 2,
    eachSide: 6,
    padY: 15,
    padX: 16,
    gutter: 18,
    tickerSize: 15,
    metaSize: 14,
    absSize: 13,
    triSize: 11,
    cellGap: 2,
    sepPad: 5
  };
}

function addRowSeparator(parent, width, sepPad) {
  parent.addSpacer(sepPad);
  var line = parent.addStack();
  line.backgroundColor = color(COLORS.sep, COLORS.sepAlpha);
  try {
    line.size = new Size(width, 1);
  } catch (err) {}
  parent.addSpacer(sepPad);
}

function addHoldingCell(parent, row, spec, colW) {
  var cell = parent.addStack();
  cell.layoutVertically();
  if (colW) {
    try {
      cell.size = new Size(colW, spec.rowH);
    } catch (err) {}
  }

  var l1 = cell.addStack();
  l1.layoutHorizontally();
  l1.centerAlignContent();
  var tri = l1.addText(dirTriangle(row.changePct));
  tri.font = Font.systemFont(spec.triSize);
  tri.textColor = dirColor(row.changePct);
  l1.addSpacer(3);
  var ticker = l1.addText(row.symbol);
  ticker.font = Font.boldSystemFont(spec.tickerSize);
  ticker.textColor = color(COLORS.text);
  ticker.lineLimit = 1;
  ticker.minimumScaleFactor = 0.7;
  l1.addSpacer();
  var pct = l1.addText(signedPct(row.changePct));
  pct.font = Font.systemFont(spec.metaSize);
  pct.textColor = dirColor(row.changePct);
  pct.lineLimit = 1;

  if (spec.cellGap) cell.addSpacer(spec.cellGap);

  var l2 = cell.addStack();
  l2.layoutHorizontally();
  l2.centerAlignContent();
  var price = l2.addText(nf(row.price, priceDigits(row.price)));
  price.font = Font.systemFont(spec.metaSize);
  price.textColor = color(COLORS.text);
  price.lineLimit = 1;
  l2.addSpacer();
  var absVal = rowChangeAbs(row);
  var abs = l2.addText(signedAbs(absVal, row.price));
  abs.font = Font.systemFont(spec.absSize);
  abs.textColor = dirColor(row.changePct);
  abs.lineLimit = 1;
}

function createWidget(family, data) {
  var ranked = sortByPct(data.rows || []);
  var spec = layoutForFamily(family, ranked.length);
  var sides = pickExtremes(ranked, spec.eachSide);
  var canvas = familySize(family);
  var stamp = footerText(data);
  var footerH = 12;
  var innerW = canvas.w - spec.padX * 2;
  var innerH = canvas.h - spec.padY * 2 - footerH;
  if (innerH < 80) innerH = 80;

  var widget = new ListWidget();
  widget.backgroundColor = color(COLORS.bg, COLORS.bgAlpha);
  widget.setPadding(spec.padY, spec.padX, spec.padY, spec.padX);
  try {
    widget.spacing = 0;
  } catch (err) {}
  widget.url = PAGE_URL;
  var next = new Date();
  next.setMinutes(next.getMinutes() + REFRESH_MINUTES);
  widget.refreshAfterDate = next;

  var rows = Math.max(sides.left.length, sides.right.length);
  var colW = Math.floor((innerW - spec.gutter) / 2);
  var sepBlock = spec.sepPad * 2 + 1;
  var sepTotal = rows > 1 ? (rows - 1) * sepBlock : 0;
  var rowH = rows ? Math.floor((innerH - sepTotal) / rows) : innerH;
  if (rowH < 26) rowH = 26;
  spec.rowH = rowH;

  var grid = widget.addStack();
  grid.layoutVertically();
  try {
    grid.size = new Size(innerW, innerH);
  } catch (err) {}

  var r;
  for (r = 0; r < rows; r++) {
    if (r > 0) addRowSeparator(grid, innerW, spec.sepPad);
    var line = grid.addStack();
    line.layoutHorizontally();
    line.centerAlignContent();
    try {
      line.size = new Size(innerW, rowH);
    } catch (errLine) {}
    if (r < sides.left.length) {
      addHoldingCell(line, sides.left[r], spec, colW);
    } else {
      var phL = line.addStack();
      try {
        phL.size = new Size(colW, rowH);
      } catch (errL) {}
    }
    line.addSpacer(spec.gutter);
    if (r < sides.right.length) {
      addHoldingCell(line, sides.right[r], spec, colW);
    } else {
      var phR = line.addStack();
      try {
        phR.size = new Size(colW, rowH);
      } catch (errR) {}
    }
  }

  if (stamp) {
    var foot = widget.addText(stamp);
    foot.font = Font.systemFont(8);
    foot.textColor = color(COLORS.muted);
    foot.lineLimit = 1;
    try {
      foot.rightAlignText();
    } catch (errFoot) {}
  }
  return widget;
}

function errorWidget(message) {
  var widget = new ListWidget();
  widget.backgroundColor = color(COLORS.bg, COLORS.bgAlpha);
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
  sortByPct: sortByPct,
  signedPct: signedPct,
  signedAbs: signedAbs,
  nfFlex: nfFlex,
  absChangeDigits: absChangeDigits,
  familySize: familySize,
  absFromPct: absFromPct,
  dirTriangle: dirTriangle,
  pickExtremes: pickExtremes,
  layoutForFamily: layoutForFamily,
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
