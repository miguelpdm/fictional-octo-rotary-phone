(() => {
  const TZ = "Europe/Madrid";
  const AUTO_KEY = "cartera-auto-refresh";
  const SORT_KEY = "cartera-sort";
  const SOURCE_KEY = "cartera-live-source";
  const UNLOCK_KEY = "cartera-unlock";
  const VIEW_KEY = "cartera-view";
  const SECTOR_KEY = "cartera-sector";
  const THEME_KEY = "cartera-theme";
  const HIDE_US_OVERRIDE_KEY = "cartera-hide-us-override";
  const NY_TZ = "America/New_York";
  const US_GOOD_FRIDAY = {
    2024: "2024-03-29",
    2025: "2025-04-18",
    2026: "2026-04-03",
    2027: "2027-03-26",
    2028: "2028-04-14",
    2029: "2029-03-30"
  };
  const AUTH = {
    saltHex: "1b650c734f8a9d75eded8004053a84da",
    iterations: 310000,
    bits: 256,
    hashHex: "0f00bb2e9d428fdef5ef5649c61add1435046eb2944c78fe573e23ed8315c964"
  };
  const SORT_DEFAULT_DIR = { priority: "asc", change: "desc", name: "asc", volume: "desc" };
  const TV_COLUMNS = [
    "name", "description", "close", "change", "change_abs", "volume",
    "high", "low", "open", "currency", "exchange", "type", "update_mode",
    "timezone", "current_session", "price_52_week_high", "price_52_week_low",
    "average_volume_30d_calc", "relative_volume_10d_calc", "last_bar_update_time"
  ];

  const FILTERS = [
    { id: "all", label: "Todas" },
    { id: "P0", label: "P0" },
    { id: "P1", label: "P1" },
    { id: "P2", label: "P2" },
    { id: "up", label: "Suben" },
    { id: "down", label: "Bajan" }
  ];

  const SORTS = [
    { id: "priority", label: "Prioridad" },
    { id: "change", label: "% día" },
    { id: "name", label: "Nombre" },
    { id: "volume", label: "Vol. rel." }
  ];

  const SESSION_LABEL = {
    market: "Abierto",
    pre_market: "Pre",
    post_market: "Post",
    out_of_session: "Cerrado"
  };

  let config = { positions: [], groups: [] };
  let snapshot = { quotes: {} };
  let rows = [];
  let filter = "all";
  let sort = "priority";
  let sortDir = "asc";
  let preferredSource = "tv";
  let denseView = false;
  let sectorView = false;
  let benchQuotes = {};
  let benchFetch = null;
  let hideUs = false;
  let usSessionMeta = { session: "closed", date: "", open: false };
  let expanded = new Set();
  let autoTimer = null;
  let lastLiveAt = null;
  let liveSource = "snapshot";
  let started = false;
  let chartUid = 0;
  let sparkCache = { at: 0, map: {} };
  const SPARK_TTL_MS = 5 * 60 * 1000;
  const SPARK_TIMEOUT_MS = 12000;

  const els = {
    gate: document.getElementById("gate"),
    gateForm: document.getElementById("gateForm"),
    gatePassword: document.getElementById("gatePassword"),
    gateSubmit: document.getElementById("gateSubmit"),
    gateError: document.getElementById("gateError"),
    app: document.getElementById("app"),
    refresh: document.getElementById("refreshBtn"),
    auto: document.getElementById("autoRefresh"),
    status: document.getElementById("statusLine"),
    delay: document.getElementById("delayLine"),
    summary: document.getElementById("summary"),
    markets: document.getElementById("markets"),
    filters: document.getElementById("filterChips"),
    sorts: document.getElementById("sortChips"),
    list: document.getElementById("list"),
    view: document.getElementById("viewBtn"),
    hideUs: document.getElementById("hideUsBtn"),
    sector: document.getElementById("sectorBtn"),
    theme: document.getElementById("themeBtn"),
    themeGate: document.getElementById("themeBtnGate"),
    themeColor: document.querySelector('meta[name="theme-color"]'),
    logout: document.getElementById("logoutBtn")
  };

  const nf = (value, digits = 2) => new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(value);

  const dt = (date, opts) => new Intl.DateTimeFormat("es-ES", { timeZone: TZ, ...opts }).format(date);

  function priceDigits(value) {
    const abs = Math.abs(value);
    if (abs < 1) return 4;
    if (abs < 10) return 3;
    return 2;
  }

  function sessionClass(session) {
    if (session === "market") return "open";
    if (session === "pre_market") return "pre";
    if (session === "post_market") return "post";
    return "closed";
  }

  function dirClass(pct) {
    if (pct > 0.005) return "up";
    if (pct < -0.005) return "down";
    return "flat";
  }

  function signedPct(pct) {
    if (pct == null || Number.isNaN(pct)) return "n/d";
    const sign = pct > 0 ? "+" : "";
    return `${sign}${nf(pct, 2)}%`;
  }

  function signedPctAtClose(pct) {
    if (pct == null || Number.isNaN(pct)) return "n/d";
    const body = nf(Math.abs(pct), 2);
    if (pct > 0) return `+${body} %`;
    if (pct < 0) return `−${body} %`;
    return `${body} %`;
  }

  async function loadJson(path) {
    const res = await fetch(`${path}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`${path} HTTP ${res.status}`);
    return res.json();
  }

  async function fetchTradingView(tickers) {
    const res = await fetch("https://scanner.tradingview.com/global/scan", {
      method: "POST",
      headers: { "content-type": "text/plain;charset=UTF-8" },
      body: JSON.stringify({ symbols: { tickers }, columns: TV_COLUMNS })
    });
    if (!res.ok) throw new Error(`TradingView HTTP ${res.status}`);
    const payload = await res.json();
    const map = {};
    for (const item of payload.data || []) {
      const d = item.d || [];
      map[item.s] = Object.fromEntries(TV_COLUMNS.map((col, i) => [col, d[i]]));
    }
    return map;
  }

  function fromSnapshot(position) {
    const snap = snapshot.quotes?.[position.symbol];
    if (!snap) return null;
    return {
      price: snap.price,
      previousClose: snap.previousClose,
      change: snap.change,
      changePct: snap.changePct,
      currency: snap.currency,
      exchange: snap.exchange,
      timezone: snap.timezone,
      dayHigh: snap.dayHigh,
      dayLow: snap.dayLow,
      volume: snap.volume,
      weekHigh: snap.fiftyTwoWeekHigh,
      weekLow: snap.fiftyTwoWeekLow,
      spark: snap.spark || [],
      session: null,
      updateMode: "snapshot",
      source: "snapshot",
      lastBar: snap.regularMarketTime
    };
  }

  function fromTv(position, tv) {
    const quote = tv[position.tv];
    if (!quote || quote.close == null) return null;
    const changePct = quote.change;
    const changeAbs = quote.change_abs;
    const previousClose = (quote.close != null && changeAbs != null)
      ? quote.close - changeAbs
      : null;
    return {
      price: quote.close,
      previousClose,
      change: changeAbs,
      changePct,
      currency: quote.currency,
      exchange: quote.exchange,
      timezone: quote.timezone,
      dayHigh: quote.high,
      dayLow: quote.low,
      volume: quote.volume,
      weekHigh: quote.price_52_week_high,
      weekLow: quote.price_52_week_low,
      avgVolume: quote.average_volume_30d_calc,
      relVolume: quote.relative_volume_10d_calc,
      spark: [],
      session: quote.current_session,
      updateMode: quote.update_mode,
      source: "tradingview",
      lastBar: quote.last_bar_update_time,
      tvName: quote.description || quote.name
    };
  }

  function nowMs() {
    const mock = globalThis.__carteraNowMs;
    if (typeof mock === "number" && Number.isFinite(mock)) return mock;
    return Date.now();
  }

  function nowDate() {
    return new Date(nowMs());
  }

  function yahooSession(meta) {
    const now = Math.floor(nowMs() / 1000);
    const pre = meta?.currentTradingPeriod?.pre;
    const regular = meta?.currentTradingPeriod?.regular;
    const post = meta?.currentTradingPeriod?.post;
    if (regular?.start != null && now >= regular.start && now < regular.end) return "market";
    if (pre?.start != null && now >= pre.start && now < (pre.end ?? regular?.start ?? Infinity)) return "pre_market";
    if (post?.start != null && now >= post.start && now < post.end) return "post_market";
    if (regular?.start != null && now < regular.start) return "pre_market";
    if (regular?.end != null && now >= regular.end) {
      if (post?.end != null && now < post.end) return "post_market";
      return "out_of_session";
    }
    return null;
  }

  function sparkKindAt(t, meta) {
    const pre = meta?.currentTradingPeriod?.pre;
    const regular = meta?.currentTradingPeriod?.regular;
    const post = meta?.currentTradingPeriod?.post;
    if (regular?.start != null && t >= regular.start && t < regular.end) return "regular";
    if (pre?.start != null && t >= pre.start && t < (pre.end ?? regular?.start ?? Infinity)) return "pre";
    if (post?.start != null && t >= post.start && t < post.end) return "post";
    if (regular?.start != null && t < regular.start) return "pre";
    if (regular?.end != null && t >= regular.end) return "post";
    return "regular";
  }

  function tzParts(date, tz) {
    const parts = {};
    for (const part of new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).formatToParts(date)) {
      if (part.type !== "literal") parts[part.type] = part.value;
    }
    const weekday = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[parts.weekday];
    return {
      year: Number(parts.year),
      month: Number(parts.month),
      day: Number(parts.day),
      hour: Number(parts.hour),
      minute: Number(parts.minute),
      weekday,
      date: `${parts.year}-${parts.month}-${parts.day}`
    };
  }

  function nyParts(date = nowDate()) {
    return tzParts(date, NY_TZ);
  }

  function ymd(year, month, day) {
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function observeUsHoliday(year, month, day) {
    const utc = Date.UTC(year, month - 1, day);
    const weekday = new Date(utc).getUTCDay();
    if (weekday === 6) {
      const prev = new Date(utc - 86400000);
      return ymd(prev.getUTCFullYear(), prev.getUTCMonth() + 1, prev.getUTCDate());
    }
    if (weekday === 0) {
      const next = new Date(utc + 86400000);
      return ymd(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
    }
    return ymd(year, month, day);
  }

  function nthWeekdayOfMonth(year, month, weekday, n) {
    let count = 0;
    for (let day = 1; day <= 31; day += 1) {
      const utc = Date.UTC(year, month - 1, day);
      if (new Date(utc).getUTCMonth() !== month - 1) break;
      if (new Date(utc).getUTCDay() === weekday) {
        count += 1;
        if (count === n) return ymd(year, month, day);
      }
    }
    return null;
  }

  function lastWeekdayOfMonth(year, month, weekday) {
    for (let day = 31; day >= 1; day -= 1) {
      const utc = Date.UTC(year, month - 1, day);
      if (new Date(utc).getUTCMonth() !== month - 1) continue;
      if (new Date(utc).getUTCDay() === weekday) return ymd(year, month, day);
    }
    return null;
  }

  function usHolidayDates(year) {
    const dates = new Set([
      observeUsHoliday(year, 1, 1),
      nthWeekdayOfMonth(year, 1, 1, 3),
      nthWeekdayOfMonth(year, 2, 1, 3),
      US_GOOD_FRIDAY[year],
      lastWeekdayOfMonth(year, 5, 1),
      observeUsHoliday(year, 6, 19),
      observeUsHoliday(year, 7, 4),
      nthWeekdayOfMonth(year, 9, 1, 1),
      nthWeekdayOfMonth(year, 11, 4, 4),
      observeUsHoliday(year, 12, 25)
    ]);
    const nextNyd = observeUsHoliday(year + 1, 1, 1);
    if (nextNyd && nextNyd.startsWith(`${year}-`)) dates.add(nextNyd);
    dates.delete(undefined);
    dates.delete(null);
    return dates;
  }

  function isUsHoliday(parts) {
    return usHolidayDates(parts.year).has(parts.date);
  }

  function isUsRegularHours(date = nowDate()) {
    return usSessionPhase(date) === "open";
  }

  function usSessionPhase(date = nowDate()) {
    const parts = nyParts(date);
    if (parts.weekday === 0 || parts.weekday === 6) return "closed";
    if (isUsHoliday(parts)) return "closed";
    const mins = parts.hour * 60 + parts.minute;
    if (mins >= 4 * 60 && mins < 9 * 60 + 30) return "pre";
    if (mins >= 9 * 60 + 30 && mins < 16 * 60) return "open";
    if (mins >= 16 * 60 && mins < 20 * 60) return "post";
    return "closed";
  }

  function quotedUsSession() {
    const sessions = rows.filter(isUsListing).map((row) => row.session).filter(Boolean);
    if (!sessions.length) return null;
    if (sessions.some((session) => session === "market")) return "market";
    if (sessions.some((session) => session === "pre_market")) return "pre_market";
    if (sessions.some((session) => session === "post_market")) return "post_market";
    return "out_of_session";
  }

  function isUsMarketOpen(date = nowDate()) {
    const phase = usSessionPhase(date);
    const clockVisible = phase === "open" || phase === "pre" || phase === "post";
    if (typeof globalThis.__carteraNowMs === "number" && Number.isFinite(globalThis.__carteraNowMs)) {
      return clockVisible;
    }
    const quoted = quotedUsSession();
    if (phase === "closed" && (quoted === "market" || quoted === "pre_market" || quoted === "post_market")) {
      return true;
    }
    if (phase === "open" && quoted === "out_of_session") return false;
    return clockVisible;
  }

  function usSessionSnapshot(date = nowDate()) {
    const parts = nyParts(date);
    const phase = usSessionPhase(date);
    const open = isUsMarketOpen(date);
    return { session: open ? "open" : "closed", date: parts.date, open, phase };
  }

  function loadHideUsOverride() {
    try {
      const raw = JSON.parse(localStorage.getItem(HIDE_US_OVERRIDE_KEY) || "null");
      if (
        raw
        && typeof raw.hide === "boolean"
        && (raw.session === "open" || raw.session === "closed")
        && typeof raw.date === "string"
      ) {
        return raw;
      }
    } catch {}
    return null;
  }

  function activeHideUsOverride(snap) {
    const saved = loadHideUsOverride();
    if (!saved) return null;
    if (saved.session === snap.session && saved.date === snap.date) return saved;
    localStorage.removeItem(HIDE_US_OVERRIDE_KEY);
    return null;
  }

  function fromYahooChart(result) {
    const meta = result?.meta;
    if (!meta || meta.regularMarketPrice == null) return null;
    const timestamps = result.timestamp || [];
    const closes = result.indicators?.quote?.[0]?.close || [];
    const spark = [];
    timestamps.forEach((t, i) => {
      if (closes[i] != null) spark.push({ t, v: closes[i], k: sparkKindAt(t, meta) });
    });
    const previousClose = meta.chartPreviousClose || meta.previousClose;
    const price = meta.regularMarketPrice;
    const change = previousClose ? price - previousClose : 0;
    const changePct = previousClose ? (change / previousClose) * 100 : 0;
    return {
      price,
      previousClose,
      change,
      changePct,
      currency: meta.currency,
      exchange: meta.fullExchangeName || meta.exchangeName,
      timezone: meta.exchangeTimezoneName,
      dayHigh: meta.regularMarketDayHigh,
      dayLow: meta.regularMarketDayLow,
      volume: meta.regularMarketVolume,
      weekHigh: meta.fiftyTwoWeekHigh,
      weekLow: meta.fiftyTwoWeekLow,
      spark,
      session: yahooSession(meta),
      updateMode: "yahoo",
      source: "yahoo",
      lastBar: meta.regularMarketTime
    };
  }

  function parseJinaJson(text) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("Jina no devolvió JSON");
    return JSON.parse(text.slice(start, end + 1));
  }

  async function fetchYahooViaJina(yahooUrl, timeoutMs = SPARK_TIMEOUT_MS) {
    const res = await fetch(`https://r.jina.ai/${yahooUrl}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!res.ok) throw new Error(`Jina HTTP ${res.status}`);
    return parseJinaJson(await res.text());
  }

  function yahooSparkUrl(symbols, includePrePost = false) {
    return `https://query1.finance.yahoo.com/v7/finance/spark?symbols=${encodeURIComponent(symbols.join(","))}&range=1d&interval=5m&includePrePost=${includePrePost ? "true" : "false"}`;
  }

  async function fetchYahooSparkChunk(symbols, includePrePost = false) {
    const payload = await fetchYahooViaJina(yahooSparkUrl(symbols, includePrePost));
    const map = {};
    for (const item of payload.spark?.result || []) {
      const quoted = fromYahooChart(item.response?.[0]);
      if (quoted) map[item.symbol] = quoted;
    }
    return map;
  }

  async function fetchYahooQuotes(symbols) {
    const unique = [...new Set((symbols || []).filter(Boolean))];
    if (!unique.length) return {};
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(unique.join(","))}&fields=symbol,regularMarketPrice,regularMarketPreviousClose,preMarketPrice,preMarketChangePercent,postMarketPrice,postMarketChangePercent`;
    const payload = await fetchYahooViaJina(url);
    const map = {};
    for (const item of payload.quoteResponse?.result || []) {
      if (item?.symbol) map[item.symbol] = item;
    }
    return map;
  }

  async function fetchYahooChart5m(symbol, range = "1d", includePrePost = false) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=5m&range=${encodeURIComponent(range)}&includePrePost=${includePrePost ? "true" : "false"}`;
    const payload = await fetchYahooViaJina(url);
    const result = payload.chart?.result?.[0];
    return fromYahooChart(result);
  }

  async function enrichUsCloseSparks(map, positions) {
    const extra = (positions || []).filter((p) => p.utcOpenBaseline);
    if (!extra.length) return map;
    const fetched = await Promise.all(extra.map((p) => {
      const symbol = p.yahoo || p.symbol;
      return fetchYahooChart5m(symbol, "2d").then((q) => [symbol, q]).catch(() => null);
    }));
    for (const pair of fetched) {
      if (pair && pair[1]?.spark?.length >= 2) map[pair[0]] = pair[1];
    }
    return map;
  }

  function chunkSymbols(symbols, size = 20) {
    const chunks = [];
    for (let i = 0; i < symbols.length; i += size) chunks.push(symbols.slice(i, i + size));
    return chunks;
  }

  async function fetchYahooLive(positions) {
    const us = [...new Set(positions.filter(isUsListing).map((p) => p.yahoo || p.symbol))];
    const rest = [...new Set(positions.filter((p) => !isUsListing(p)).map((p) => p.yahoo || p.symbol))];
    const map = {};
    const jobs = [
      ...chunkSymbols(rest).map((chunk) => fetchYahooSparkChunk(chunk, false)),
      ...chunkSymbols(us).map((chunk) => fetchYahooSparkChunk(chunk, true))
    ];
    const parts = await Promise.all(jobs);
    for (const part of parts) Object.assign(map, part);
    if (!Object.keys(map).length) throw new Error("Yahoo no devolvió cotizaciones");
    return enrichUsCloseSparks(map, positions);
  }

  async function fetchSparkLive(positions) {
    const unique = [...new Set(positions.map((p) => p.yahoo || p.symbol))];
    const usSet = new Set(positions.filter(isUsListing).map((p) => p.yahoo || p.symbol));
    const map = await fetchYahooLive(positions);
    const missing = unique.filter((s) => (map[s]?.spark?.length || 0) < 2);
    if (missing.length) {
      const extras = await Promise.all(missing.map((s) =>
        fetchYahooChart5m(s, "1d", usSet.has(s)).then((q) => [s, q]).catch(() => null)
      ));
      for (const pair of extras) {
        if (pair && pair[1]?.spark?.length >= 2) map[pair[0]] = pair[1];
      }
    }
    return map;
  }

  function dayKey(date, tz) {
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: tz || TZ,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).format(date);
    } catch {
      return date.toISOString().slice(0, 10);
    }
  }

  function sparkIsCurrentSession(spark, timezone, row) {
    if (!spark || spark.length < 2) return false;
    const last = spark[spark.length - 1];
    if (!last || last.t == null) return false;
    if (row?.utcOpenBaseline) {
      return Number(last.t) >= lastUsCloseSec() - 36 * 3600;
    }
    return dayKey(new Date(last.t * 1000), timezone) === dayKey(nowDate(), timezone);
  }

  function appendLivePrice(spark, price) {
    const out = Array.isArray(spark) ? spark.slice() : [];
    if (price == null || !Number.isFinite(Number(price))) return out;
    const last = out[out.length - 1];
    const now = Math.floor(Date.now() / 1000);
    if (!last || Math.abs(last.v - price) > 1e-9) {
      out.push({ t: now, v: price, k: last?.k });
    }
    return out;
  }

  function lastSparkOfKind(spark, kind) {
    const matches = (spark || []).filter((p) => p && p.v != null && (p.k || "regular") === kind);
    return matches.length ? matches[matches.length - 1] : null;
  }

  function applyExtQuote(row, quote, phase) {
    if (!isUsListing(row) || (phase !== "pre" && phase !== "post")) {
      return { ...row, ext: null };
    }
    const prev = quote?.regularMarketPreviousClose ?? row.previousClose;
    let price = null;
    let changePct = null;
    const kind = phase === "post" ? "post" : "pre";
    if (phase === "pre") {
      price = quote?.preMarketPrice;
      changePct = quote?.preMarketChangePercent;
    } else {
      price = quote?.postMarketPrice;
      changePct = quote?.postMarketChangePercent;
    }
    if (price == null) {
      const pt = lastSparkOfKind(row.spark, kind);
      if (pt) price = pt.v;
    }
    if (price == null || !Number.isFinite(Number(price))) return { ...row, ext: null };
    price = Number(price);
    if (changePct == null && prev && Number(prev) !== 0) {
      changePct = ((price - Number(prev)) / Number(prev)) * 100;
    }
    if (changePct != null) changePct = Number(changePct);
    return { ...row, ext: { kind, price, changePct } };
  }

  async function enrichUsExtended(list) {
    const phase = usSessionPhase();
    const us = (list || []).filter((row) => !row.missing && isUsListing(row));
    if (!us.length || (phase !== "pre" && phase !== "post")) {
      return (list || []).map((row) => ({ ...row, ext: null }));
    }
    let qmap = {};
    try {
      qmap = await fetchYahooQuotes(us.map((row) => row.yahoo || row.symbol));
    } catch (error) {
      console.warn("Yahoo pre/post no disponible", error);
    }
    return (list || []).map((row) => applyExtQuote(row, qmap[row.yahoo || row.symbol], phase));
  }

  function attachSpark(row, sparkMap) {
    if (row.missing) return row;
    const live = sparkMap ? sparkMap[row.yahoo || row.symbol] : null;
    let spark = [];
    let sparkSource = "none";
    let previousClose = row.previousClose;
    if (live?.spark?.length >= 2) {
      spark = live.spark;
      sparkSource = "yahoo-live";
      if (previousClose == null && live.previousClose != null) previousClose = live.previousClose;
    } else {
      const snap = snapshot.quotes?.[row.symbol];
      const snapSpark = snap?.spark || [];
      const tz = row.timezone || snap?.timezone;
      if (sparkIsCurrentSession(snapSpark, tz, row)) {
        spark = snapSpark;
        sparkSource = "snapshot";
      }
    }
    spark = appendLivePrice(spark, row.price);
    return applyQuoteRules({ ...row, spark, sparkSource, previousClose });
  }

  function mergeQuote(position, tvMap, yahooMap) {
    const snap = fromSnapshot(position);
    const yahoo = yahooMap ? yahooMap[position.yahoo || position.symbol] : null;
    const liveTv = tvMap ? fromTv(position, tvMap) : null;
    const live = yahoo || liveTv;
    const quote = live || snap;
    if (!quote) {
      return {
        ...position,
        missing: true,
        error: "No se pudo resolver este ticker."
      };
    }

    const spark = yahoo?.spark?.length >= 2 ? [...yahoo.spark] : [];

    return applyQuoteRules({
      ...position,
      ...quote,
      spark,
      name: position.name || live?.tvName || position.symbol,
      missing: false,
      usedSnapshot: !live
    });
  }

  function zonedLocalToUnixSec(year, month, day, hour, minute, tz) {
    const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
    const parts = tzParts(new Date(utcGuess), tz);
    const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
    return Math.floor((utcGuess - (asUtc - utcGuess)) / 1000);
  }

  function lastUsCloseSec(date = nowDate()) {
    const parts = tzParts(date, TZ);
    let year = parts.year;
    let month = parts.month;
    let day = parts.day;
    if (parts.hour < 22) {
      const prev = new Date(Date.UTC(year, month - 1, day) - 86400000);
      year = prev.getUTCFullYear();
      month = prev.getUTCMonth() + 1;
      day = prev.getUTCDate();
    }
    return zonedLocalToUnixSec(year, month, day, 22, 0, TZ);
  }

  function usCloseSessionFromSpark(spark, start) {
    const points = (spark || [])
      .filter((p) => p && p.t != null && p.v != null)
      .sort((a, b) => a.t - b.t);
    let before = null;
    for (const point of points) {
      if (Number(point.t) <= start) before = point;
    }
    const session = points.filter((p) => Number(p.t) >= start);
    let baseline = before ? Number(before.v) : (session[0] ? Number(session[0].v) : null);
    let clipped = session;
    if (before && (!clipped.length || Number(clipped[0].t) > start)) {
      clipped = [{ t: start, v: before.v }, ...clipped];
    }
    return { spark: clipped, open: baseline };
  }

  function applyQuoteRules(row) {
    if (!row || row.missing) return row;
    const next = { ...row };
    if (row.alwaysOpen) {
      next.session = "market";
      if (!next.timezone) next.timezone = "Etc/UTC";
    }
    if (row.utcOpenBaseline) {
      const start = lastUsCloseSec();
      const session = usCloseSessionFromSpark(next.spark, start);
      if (session.spark.length) next.spark = session.spark;
      const open = session.open;
      if (open != null && Number.isFinite(open) && open !== 0 && next.price != null) {
        next.previousClose = open;
        next.change = next.price - open;
        next.changePct = (next.change / open) * 100;
      }
    }
    return next;
  }

  function isUsListing(row) {
    if (row?.alwaysOpen || row?.utcOpenBaseline) return false;
    const yahoo = String(row?.yahoo || row?.symbol || "").toUpperCase();
    if (yahoo === "BTC-USD" || yahoo.startsWith("BTC-")) return false;
    const prefix = String(row.tv || "").split(":")[0].toUpperCase();
    if (prefix === "BITSTAMP" || prefix === "COINBASE" || prefix === "BINANCE") return false;
    if (prefix === "NASDAQ" || prefix === "NYSE" || prefix === "AMEX") return true;
    const exchange = String(row.exchange || "").toUpperCase();
    return /\b(NASDAQ|NYSE|AMEX)\b/.test(exchange);
  }

  function benchSpec(row) {
    const raw = row?.benchmark;
    if (!raw) return null;
    if (typeof raw === "string") {
      const meta = (config.benchmarks || {})[raw] || {};
      return {
        id: raw,
        symbol: meta.symbol || raw,
        yahoo: meta.yahoo || raw,
        tv: meta.tv || ""
      };
    }
    const id = raw.symbol || raw.yahoo;
    if (!id) return null;
    return { id, symbol: raw.symbol || id, yahoo: raw.yahoo || id, tv: raw.tv || "" };
  }

  function uniqueBenchSpecs() {
    const seen = new Set();
    const specs = [];
    for (const position of config.positions || []) {
      const spec = benchSpec(position);
      if (!spec || !spec.yahoo || seen.has(spec.yahoo)) continue;
      seen.add(spec.yahoo);
      specs.push(spec);
    }
    return specs;
  }

  function quotePctFromYahoo(quoted) {
    if (!quoted || quoted.changePct == null || Number.isNaN(Number(quoted.changePct))) return null;
    return Number(quoted.changePct);
  }

  function quotePctFromTv(quoted) {
    if (!quoted || quoted.change == null || Number.isNaN(Number(quoted.change))) return null;
    return Number(quoted.change);
  }

  function reuseHoldingPct(spec) {
    const match = rows.find((row) =>
      !row.missing
      && ((row.yahoo || row.symbol) === spec.yahoo || row.symbol === spec.symbol || row.symbol === spec.id)
    );
    if (match && match.changePct != null && Number.isFinite(match.changePct)) return Number(match.changePct);
    return null;
  }

  async function fetchBenchQuotes(existingYahooMap, existingTvMap) {
    const specs = uniqueBenchSpecs();
    const out = {};
    const missing = [];
    for (const spec of specs) {
      const reused = reuseHoldingPct(spec);
      if (reused != null) {
        out[spec.yahoo] = { changePct: reused, symbol: spec.symbol };
        continue;
      }
      const fromYahoo = quotePctFromYahoo(existingYahooMap?.[spec.yahoo]);
      if (fromYahoo != null) {
        out[spec.yahoo] = { changePct: fromYahoo, symbol: spec.symbol };
        continue;
      }
      const fromTv = spec.tv ? quotePctFromTv(existingTvMap?.[spec.tv]) : null;
      if (fromTv != null) {
        out[spec.yahoo] = { changePct: fromTv, symbol: spec.symbol };
        continue;
      }
      missing.push(spec);
    }
    if (missing.length) {
      try {
        const tvs = missing.map((spec) => spec.tv).filter(Boolean);
        if (tvs.length) {
          const tvMap = await fetchTradingView(tvs);
          for (const spec of missing) {
            const pct = spec.tv ? quotePctFromTv(tvMap?.[spec.tv]) : null;
            if (pct != null) out[spec.yahoo] = { changePct: pct, symbol: spec.symbol };
          }
        }
      } catch (error) {
        console.warn("Benchmarks TradingView falló", error);
      }
      const still = missing.filter((spec) => out[spec.yahoo] == null);
      if (still.length) {
        try {
          const ymap = await fetchYahooLive(still.map((spec) => ({ yahoo: spec.yahoo, symbol: spec.yahoo })));
          for (const spec of still) {
            const pct = quotePctFromYahoo(ymap?.[spec.yahoo]);
            if (pct != null) out[spec.yahoo] = { changePct: pct, symbol: spec.symbol };
          }
        } catch (error) {
          console.warn("Benchmarks Yahoo falló", error);
        }
      }
    }
    return out;
  }

  async function refreshBenchmarks(existingYahooMap, existingTvMap) {
    if (!sectorView) return;
    const run = fetchBenchQuotes(existingYahooMap, existingTvMap).then((map) => {
      benchQuotes = map;
      return map;
    }).catch((error) => {
      console.warn("Benchmarks no disponibles", error);
      return benchQuotes;
    });
    benchFetch = run;
    await run;
    renderList();
  }

  function extHtml(row) {
    const ext = row?.ext;
    if (!ext || ext.price == null || !Number.isFinite(Number(ext.price))) return "";
    const label = ext.kind === "post" ? "Post" : "Pre";
    const pct = ext.changePct == null || Number.isNaN(Number(ext.changePct))
      ? ""
      : ` <span class="${dirClass(ext.changePct)}">${signedPct(ext.changePct)}</span>`;
    return `<div class="ext-line">${label} ${nf(ext.price, priceDigits(ext.price))}${pct}</div>`;
  }

  function benchHtml(row) {
    if (!sectorView) return "";
    const spec = benchSpec(row);
    if (!spec) return "";
    const quoted = benchQuotes[spec.yahoo];
    const pct = quoted && quoted.changePct != null && Number.isFinite(quoted.changePct)
      ? `<span class="${dirClass(quoted.changePct)}">${signedPct(quoted.changePct)}</span>`
      : '<span class="flat">—</span>';
    return `<div class="bench">${spec.symbol} ${pct}</div>`;
  }

  function applySector() {
    if (!els.sector) return;
    els.sector.setAttribute("aria-pressed", sectorView ? "true" : "false");
    els.sector.setAttribute("aria-label", sectorView ? "Ocultar sector" : "Mostrar sector");
    els.sector.setAttribute("title", sectorView ? "Ocultar sector" : "Mostrar sector");
    els.app.classList.toggle("show-sector", sectorView);
  }

  function visibleRows() {
    let list = rows.filter((row) => {
      if (hideUs && isUsListing(row)) return false;
      if (filter === "all") return true;
      if (filter === "up") return (row.changePct || 0) > 0.005;
      if (filter === "down") return (row.changePct || 0) < -0.005;
      return row.group === filter;
    });

    const groupRank = Object.fromEntries((config.groups || []).map((g, i) => [g.id, i]));
    const dir = sortDir === "asc" ? 1 : -1;
    list = [...list].sort((a, b) => {
      if (sort === "change") return dir * ((a.changePct ?? -999) - (b.changePct ?? -999));
      if (sort === "name") return dir * a.name.localeCompare(b.name, "es");
      if (sort === "volume") return dir * ((a.relVolume ?? -1) - (b.relVolume ?? -1));
      const ga = groupRank[a.group] ?? 99;
      const gb = groupRank[b.group] ?? 99;
      if (ga !== gb) return dir * (ga - gb);
      return 0;
    });
    return list;
  }

  function sparkSamples(points) {
    const now = Date.now() / 1000 + 90;
    return (points || [])
      .filter((p) => p && p.v != null && p.t != null && Number.isFinite(Number(p.t)) && Number.isFinite(Number(p.v)))
      .map((p) => ({ t: Number(p.t), v: Number(p.v), k: p.k || "regular" }))
      .filter((p) => p.t <= now)
      .sort((a, b) => a.t - b.t);
  }

  function sparkXScale(samples, w) {
    const t0 = samples[0].t;
    const t1 = samples[samples.length - 1].t;
    const spanT = t1 - t0;
    const x = (t) => (spanT <= 0 ? w / 2 : 1 + ((t - t0) / spanT) * (w - 2));
    return { t0, t1, spanT, x };
  }

  function nearestSparkSample(samples, t) {
    let best = samples[0];
    let bestD = Math.abs(samples[0].t - t);
    for (let i = 1; i < samples.length; i += 1) {
      const d = Math.abs(samples[i].t - t);
      if (d < bestD) {
        best = samples[i];
        bestD = d;
      }
    }
    return best;
  }

  function chartHtml(points, previousClose, wide, currency) {
    const samples = sparkSamples(points);
    const w = wide ? 320 : 72;
    const h = wide ? 140 : 36;
    const klass = wide ? "chart chart-wide" : "chart chart-mini";
    if (samples.length < 2) {
      return `<div class="${klass}" aria-hidden="true"><svg viewBox="0 0 ${w} ${h}"></svg></div>`;
    }
    const values = samples.map((p) => p.v);
    const min = Math.min(...values, previousClose ?? values[0]);
    const max = Math.max(...values, previousClose ?? values[0]);
    const span = max - min || 1;
    const { x } = sparkXScale(samples, w);
    const y = (v) => h - 3 - ((v - min) / span) * (h - 6);
    const regular = samples.filter((p) => (p.k || "regular") === "regular");
    const lineSamples = regular.length >= 2 ? regular : samples;
    const d = lineSamples.map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.t)} ${y(p.v)}`).join(" ");
    const yPrev = previousClose == null ? h : y(previousClose);
    const lastX = x(lineSamples[lineSamples.length - 1].t);
    const firstX = x(lineSamples[0].t);
    const area = `${d} L ${lastX} ${yPrev} L ${firstX} ${yPrev} Z`;
    const strokeW = wide ? 2 : 1.5;
    const uid = `c${chartUid += 1}`;
    const yClip = Math.max(0, Math.min(h, yPrev));
    const defs = previousClose == null ? "" : `
        <defs>
          <clipPath id="${uid}-up" clipPathUnits="userSpaceOnUse"><rect x="0" y="0" width="${w}" height="${yClip}"></rect></clipPath>
          <clipPath id="${uid}-dn" clipPathUnits="userSpaceOnUse"><rect x="0" y="${yClip}" width="${w}" height="${Math.max(0, h - yClip)}"></rect></clipPath>
        </defs>`;
    const split = previousClose == null
      ? `<path d="${area}" fill="#8b95a5" opacity="0.16"></path>
        <path d="${d}" fill="none" stroke="#8b95a5" stroke-width="${strokeW}" stroke-linejoin="round" stroke-linecap="round"></path>`
      : `<g clip-path="url(#${uid}-up)">
          <path d="${area}" fill="#30d158" opacity="0.22"></path>
          <path d="${d}" fill="none" stroke="#30d158" stroke-width="${strokeW}" stroke-linejoin="round" stroke-linecap="round"></path>
        </g>
        <g clip-path="url(#${uid}-dn)">
          <path d="${area}" fill="#ff453a" opacity="0.22"></path>
          <path d="${d}" fill="none" stroke="#ff453a" stroke-width="${strokeW}" stroke-linejoin="round" stroke-linecap="round"></path>
        </g>
        <line x1="0" x2="${w}" y1="${yPrev}" y2="${yPrev}" stroke="#c5cad3" stroke-dasharray="3 3" stroke-width="1" opacity="0.85"></line>`;
    const extPath = sparkKindPath(samples, ["pre", "post"], x, y);
    const extLine = extPath
      ? `<path d="${extPath}" fill="none" stroke="#8b95a5" stroke-width="${wide ? 1.6 : 1.2}" stroke-dasharray="3 2" stroke-linejoin="round" stroke-linecap="round" opacity="0.85"></path>`
      : "";
    const payload = encodeURIComponent(JSON.stringify(samples));
    return `<div class="${klass}" role="img" aria-label="Gráfico intradía. Mantén pulsado o arrastra para ver precio y hora." data-wide="${wide ? 1 : 0}" data-ccy="${currency || ""}" data-prev="${previousClose ?? ""}" data-spark="${payload}">
      <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
        ${defs}
        ${split}
        ${extLine}
        <g class="xh" hidden>
          <line class="xh-v" y1="0" y2="${h}"></line>
          <circle class="xh-dot" r="${wide ? 4.2 : 3}"></circle>
        </g>
      </svg>
      <div class="chart-tip" hidden></div>
    </div>`;
  }

  function rangeBar(low, high, price, lowLabel, highLabel, title) {
    if (low == null || high == null || price == null || high === low) return "";
    const pct = Math.max(0, Math.min(100, ((price - low) / (high - low)) * 100));
    return `<div class="bar-wrap">
      <div class="bar-label"><span>${title}</span><span>${lowLabel} → ${highLabel}</span></div>
      <div class="bar"><b style="width:${pct}%"></b><i style="left:${pct}%"></i></div>
    </div>`;
  }

  function renderSummary(list) {
    const priced = list.filter((r) => r.changePct != null && !r.missing);
    const up = priced.filter((r) => r.changePct > 0.005).length;
    const down = priced.filter((r) => r.changePct < -0.005).length;
    const avg = priced.length ? priced.reduce((s, r) => s + r.changePct, 0) / priced.length : null;
    const best = priced.reduce((a, b) => (!a || b.changePct > a.changePct ? b : a), null);
    const worst = priced.reduce((a, b) => (!a || b.changePct < a.changePct ? b : a), null);

    els.summary.innerHTML = `
      <article class="card"><div class="label">Suben / bajan</div><div class="value">${up} / ${down}</div></article>
      <article class="card"><div class="label">Media del día</div><div class="value ${dirClass(avg || 0)}">${signedPct(avg)}</div></article>
      <article class="card"><div class="label">Mejor</div><div class="value up">${best ? `${best.symbol} ${signedPct(best.changePct)}` : "n/d"}</div></article>
      <article class="card"><div class="label">Peor</div><div class="value down">${worst ? `${worst.symbol} ${signedPct(worst.changePct)}` : "n/d"}</div></article>
    `;
  }

  function renderMarkets(list) {
    const byTz = new Map();
    for (const row of list) {
      if (!row.timezone) continue;
      if (!byTz.has(row.timezone)) {
        byTz.set(row.timezone, { session: row.session, exchange: row.exchange, count: 0 });
      }
      byTz.get(row.timezone).count += 1;
      if (row.session) byTz.get(row.timezone).session = row.session;
    }
    if (!byTz.size) {
      els.markets.innerHTML = "";
      return;
    }
    const items = [...byTz.entries()].map(([tz, info]) => {
      const label = tz
        .replace("America/New_York", "EE. UU.")
        .replace("Etc/UTC", "Cripto")
        .replace(/^UTC$/, "Cripto")
        .replace("Europe/", "")
        .replace("_", " ");
      const session = info.session || "out_of_session";
      return `<span class="market">${label} <span class="pill ${sessionClass(session)}">${SESSION_LABEL[session] || session}</span></span>`;
    }).join("");
    els.markets.innerHTML = `<article class="card"><div class="market-row">${items}</div></article>`;
  }

  function pnlHtml(row) {
    const qty = Number(row.quantity);
    const avg = Number(row.avgCost);
    if (!Number.isFinite(qty) || !Number.isFinite(avg) || qty <= 0) return "";
    if (row.price == null) return "";
    const value = qty * row.price;
    const pnl = (row.price - avg) * qty;
    const pnlPct = ((row.price - avg) / avg) * 100;
    return `<p class="pnl ${dirClass(pnlPct)}">Posición: <strong>${nf(value, 2)} ${row.currency || ""}</strong>
      · P&amp;L <strong>${pnl >= 0 ? "+" : ""}${nf(pnl, 2)} (${signedPct(pnlPct)})</strong></p>`;
  }

  function sparkKindPath(samples, kinds, x, y) {
    let d = "";
    let drawing = false;
    for (let i = 0; i < samples.length; i += 1) {
      const ok = kinds.includes(samples[i].k || "regular");
      if (!ok) {
        drawing = false;
        continue;
      }
      if (!drawing && i > 0) {
        d += ` M ${x(samples[i - 1].t)} ${y(samples[i - 1].v)} L ${x(samples[i].t)} ${y(samples[i].v)}`;
      } else {
        d += ` ${drawing ? "L" : "M"} ${x(samples[i].t)} ${y(samples[i].v)}`;
      }
      drawing = true;
    }
    return d.trim();
  }

  function sparkTiny(points, previousClose) {
    const samples = sparkSamples(points);
    const w = 42;
    const h = 16;
    if (samples.length < 2) {
      return `<div class="chart chart-tiny" aria-hidden="true"><svg viewBox="0 0 ${w} ${h}"></svg></div>`;
    }
    const values = samples.map((p) => p.v);
    const min = Math.min(...values, previousClose ?? values[0]);
    const max = Math.max(...values, previousClose ?? values[0]);
    const span = max - min || 1;
    const { x } = sparkXScale(samples, w);
    const y = (v) => h - 1.5 - ((v - min) / span) * (h - 3);
    const regular = samples.filter((p) => (p.k || "regular") === "regular");
    const lineSamples = regular.length >= 2 ? regular : samples;
    const d = lineSamples.map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.t)} ${y(p.v)}`).join(" ");
    const up = (lineSamples[lineSamples.length - 1].v ?? 0) >= (previousClose ?? lineSamples[0].v);
    const color = up ? "#30d158" : "#ff453a";
    const extPath = sparkKindPath(samples, ["pre", "post"], x, y);
    const ext = extPath
      ? `<path d="${extPath}" fill="none" stroke="#8b95a5" stroke-width="1.1" stroke-dasharray="2 2" stroke-linejoin="round" stroke-linecap="round" opacity="0.9"></path>`
      : "";
    return `<div class="chart chart-tiny" aria-hidden="true"><svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${ext}<path d="${d}" fill="none" stroke="${color}" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"></path></svg></div>`;
  }

  function applyHideUs(snap = usSessionMeta, override = null) {
    if (!els.hideUs) return;
    const autoHint = snap.phase === "pre"
      ? "Auto: preapertura EE. UU."
      : snap.phase === "post"
        ? "Auto: postcierre EE. UU."
        : snap.open ? "Auto: mercado EE. UU. abierto" : "Auto: mercado EE. UU. cerrado";
    const action = hideUs ? "Mostrar EE. UU." : "Ocultar EE. UU.";
    const manual = override ? " Manual hasta el próximo cambio de sesión." : "";
    const label = `${action} ${autoHint}.${manual}`;
    els.hideUs.setAttribute("aria-pressed", hideUs ? "true" : "false");
    els.hideUs.setAttribute("aria-label", label);
    els.hideUs.setAttribute("title", label);
    els.hideUs.toggleAttribute("data-manual", !!override);
    els.hideUs.dataset.session = snap.session || "";
    els.app.classList.toggle("hide-us", hideUs);
  }

  function syncHideUs({ render = false } = {}) {
    usSessionMeta = usSessionSnapshot();
    const override = activeHideUsOverride(usSessionMeta);
    const next = override ? override.hide : !usSessionMeta.open;
    const changed = next !== hideUs;
    hideUs = next;
    applyHideUs(usSessionMeta, override);
    if (render && changed) renderAll();
  }

  function systemTheme() {
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }

  function currentTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
    const attr = document.documentElement.getAttribute("data-theme");
    if (attr === "light" || attr === "dark") return attr;
    return systemTheme();
  }

  function applyTheme(theme) {
    const next = theme === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    if (els.themeColor) els.themeColor.setAttribute("content", next === "light" ? "#f3f5f8" : "#0b0d10");
    const nextLabel = next === "light" ? "Modo noche" : "Modo día";
    for (const btn of [els.theme, els.themeGate]) {
      if (!btn) continue;
      btn.setAttribute("aria-pressed", next === "light" ? "true" : "false");
      btn.setAttribute("aria-label", nextLabel);
      btn.setAttribute("title", nextLabel);
    }
  }

  function toggleTheme() {
    const next = currentTheme() === "light" ? "dark" : "light";
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  }

  function applyView() {
    els.app.classList.toggle("dense", denseView);
    els.view.setAttribute("aria-pressed", denseView ? "true" : "false");
    els.view.setAttribute("aria-label", denseView ? "Vista detallada" : "Vista compacta");
    els.view.setAttribute("title", denseView ? "Vista detallada" : "Vista compacta");
    const denseIcon = els.view.querySelector(".icon-dense");
    const listIcon = els.view.querySelector(".icon-list");
    if (denseIcon) denseIcon.toggleAttribute("hidden", denseView);
    if (listIcon) listIcon.toggleAttribute("hidden", !denseView);
  }

  function renderList() {
    const list = visibleRows();
    if (!list.length) {
      els.list.innerHTML = '<div class="state">No hay valores para este filtro.</div>';
      return;
    }

    if (denseView) {
      els.list.innerHTML = list.map((row) => {
        if (row.missing) {
          return `<article class="row" data-symbol="${row.symbol}">
            <div class="row-main">
              <div class="tile-top"><div class="sym">${row.symbol}</div><div class="price">n/d</div></div>
              <div class="tile-bottom"><div></div><div class="badge flat">Sin datos</div></div>
            </div>
          </article>`;
        }
        const klass = dirClass(row.changePct || 0);
        return `<article class="row" data-symbol="${row.symbol}">
          <div class="row-main">
            <div class="tile-top">
              <div class="tile-id">
                <div class="sym">${row.symbol}</div>
                ${benchHtml(row)}
                ${extHtml(row)}
              </div>
              <div class="price">${nf(row.price, priceDigits(row.price))}</div>
            </div>
            <div class="tile-bottom">
              ${sparkTiny(row.spark, row.previousClose)}
              <div class="badge ${klass}">${signedPct(row.changePct)}</div>
            </div>
          </div>
        </article>`;
      }).join("");
      return;
    }

    els.list.innerHTML = list.map((row) => {
      const open = expanded.has(row.symbol);
      if (row.missing) {
        return `<article class="row ${open ? "open" : ""}" data-symbol="${row.symbol}">
          <div class="row-main">
            <div><div class="sym">${row.symbol}<span class="group-tag">${row.group}</span></div>
            <div class="name">${row.name}</div></div>
            <div></div>
            <div class="right"><div class="price">n/d</div><div class="badge flat">Sin datos</div></div>
          </div>
          <div class="details"><p class="error">${row.error || "Ticker no resuelto."} ${row.note || ""}</p></div>
        </article>`;
      }

      const klass = dirClass(row.changePct || 0);
      const delayed = String(row.updateMode || "").includes("delayed");
      const volTxt = row.relVolume != null ? `Vol. ${nf(row.relVolume, 2)}× media 10d` : (row.volume != null ? `Vol. ${nf(row.volume, 0)}` : "");
      const details = `
        ${chartHtml(row.spark, row.previousClose, true, row.currency)}
        <div class="stats">
          ${rangeBar(row.dayLow, row.dayHigh, row.price, nf(row.dayLow ?? 0, priceDigits(row.dayLow || 0)), nf(row.dayHigh ?? 0, priceDigits(row.dayHigh || 0)), "Rango del día")}
          ${rangeBar(row.weekLow, row.weekHigh, row.price, nf(row.weekLow ?? 0, priceDigits(row.weekLow || 0)), nf(row.weekHigh ?? 0, priceDigits(row.weekHigh || 0)), "52 semanas")}
        </div>
        <p class="note">${row.session ? SESSION_LABEL[row.session] || row.session : "Sesión n/d"}
          · ${row.exchange || ""} · ${delayed ? "Retraso ~15 min" : (row.updateMode === "streaming" ? "Streaming" : row.source)}
          ${volTxt ? ` · ${volTxt}` : ""}</p>
        ${pnlHtml(row)}
        ${row.note ? `<p class="note">${row.note}</p>` : ""}
        ${row.usedSnapshot ? '<p class="note">Precio del snapshot de GitHub Actions (la fuente en vivo no respondió para este ticker).</p>' : ""}
      `;

      return `<article class="row ${open ? "open" : ""}" data-symbol="${row.symbol}">
        <div class="row-main">
          <div>
            <div class="sym">${row.symbol}<span class="group-tag">${row.group}</span></div>
            ${benchHtml(row)}
            <div class="name">${row.name}</div>
          </div>
          ${chartHtml(row.spark, row.previousClose, false, row.currency)}
          <div class="right">
            <div class="price">${nf(row.price, priceDigits(row.price))}<span class="ccy">${row.currency || ""}</span></div>
            <div class="badge ${klass}">${signedPct(row.changePct)}</div>
            ${extHtml(row)}
          </div>
        </div>
        <div class="details">${details}</div>
      </article>`;
    }).join("");
  }

  function renderChips() {
    els.filters.innerHTML = FILTERS.map((item) =>
      `<button class="chip ${filter === item.id ? "active" : ""}" data-filter="${item.id}" type="button">${item.label}</button>`
    ).join("");
    els.sorts.innerHTML = SORTS.map((item) => {
      const active = sort === item.id;
      const arrow = active ? (sortDir === "asc" ? "↑" : "↓") : "";
      return `<button class="chip ${active ? "active" : ""}" data-sort="${item.id}" type="button">${item.label}${arrow ? `<span class="dir">${arrow}</span>` : ""}</button>`;
    }).join("");
  }

  function renderAll() {
    renderChips();
    const visible = visibleRows();
    renderSummary(visible);
    renderMarkets(visible);
    renderList();
  }

  function setStatus(message) {
    els.status.textContent = message;
  }

  async function refresh({ silent = false } = {}) {
    syncHideUs();
    if (!silent) setStatus("Actualizando cotizaciones…");
    els.refresh.disabled = true;
    try {
      let tvMap = null;
      let yahooMap = null;
      liveSource = "snapshot";
      if (preferredSource === "yahoo") {
        try {
          yahooMap = await fetchYahooLive(config.positions);
          liveSource = "yahoo";
          lastLiveAt = new Date();
        } catch (error) {
          console.warn("Yahoo falló, usando TradingView", error);
          try {
            const tickers = config.positions.map((p) => p.tv).filter(Boolean);
            tvMap = await fetchTradingView(tickers);
            liveSource = "tv-fallback";
            lastLiveAt = new Date();
          } catch (tvError) {
            console.warn("TradingView también falló", tvError);
          }
        }
      } else {
        try {
          const tickers = config.positions.map((p) => p.tv).filter(Boolean);
          tvMap = await fetchTradingView(tickers);
          liveSource = "tradingview";
          lastLiveAt = new Date();
        } catch (error) {
          console.warn("TradingView falló, usando snapshot", error);
        }
        const tvMiss = config.positions.filter((p) => !p.tv || !tvMap?.[p.tv] || tvMap[p.tv].close == null);
        if (tvMiss.length) {
          try {
            yahooMap = await fetchYahooLive(tvMiss);
          } catch (gapError) {
            console.warn("Yahoo para tickers sin TradingView falló", gapError);
          }
        }
      }

      rows = config.positions.map((position) => mergeQuote(position, tvMap, yahooMap));
      syncHideUs();
      const failed = rows.filter((r) => r.missing).map((r) => r.symbol);
      const when = lastLiveAt
        ? dt(lastLiveAt, { dateStyle: "short", timeStyle: "medium" })
        : (snapshot.updatedAt ? dt(new Date(snapshot.updatedAt), { dateStyle: "short", timeStyle: "short" }) : "n/d");
      const snapWhen = snapshot.updatedAt
        ? dt(new Date(snapshot.updatedAt), { dateStyle: "short", timeStyle: "short" })
        : "n/d";

      const sparkFresh = sparkCache.at && (Date.now() - sparkCache.at < SPARK_TTL_MS);
      if (liveSource === "yahoo" && yahooMap) {
        sparkCache = { at: Date.now(), map: yahooMap };
        rows = rows.map((row) => attachSpark(row, yahooMap));
      } else if (yahooMap && Object.keys(yahooMap).length) {
        rows = rows.map((row) => attachSpark(row, yahooMap));
      } else if (sparkFresh) {
        rows = rows.map((row) => attachSpark(row, sparkCache.map));
      }
      rows = await enrichUsExtended(rows);

      function delayBase() {
        if (liveSource === "yahoo") {
          setStatus(`Última actualización (Madrid): ${when}. Fuente en vivo: Yahoo Finance (vía Jina).`);
          return "Yahoo gratuito suele ir con ~15 min de retraso (también en EE. UU.).";
        }
        if (liveSource === "tv-fallback") {
          setStatus(`Última actualización (Madrid): ${when}. Yahoo no respondió; fuente en vivo: TradingView.`);
          return "Reintento automático a TradingView (~15 min de retraso).";
        }
        if (liveSource === "tradingview") {
          setStatus(`Última actualización (Madrid): ${when}. Fuente en vivo: TradingView.`);
          return "Fuente en vivo TradingView (~15 min de retraso).";
        }
        setStatus(`Sin fuente en vivo. Mostrando snapshot de GitHub Actions (${snapWhen}, hora Madrid).`);
        return "El snapshot se genera periódicamente. Revisa la conexión e inténtalo de nuevo con Actualizar.";
      }

      function applySparkNote(base) {
        const liveN = rows.filter((r) => r.sparkSource === "yahoo-live").length;
        const snapN = rows.filter((r) => r.sparkSource === "snapshot").length;
        let note = base;
        if (liveN) {
          const sparkWhen = sparkCache.at
            ? dt(new Date(sparkCache.at), { timeStyle: "short" })
            : when;
          note += ` Gráficos intradía: Yahoo ${sparkWhen} (Madrid).`;
        } else if (snapN) {
          note += ` Gráficos: snapshot ${snapWhen} (sesión de hoy).`;
        } else {
          note += " Gráficos: esperando serie de hoy (no se usa la curva de ayer).";
        }
        if (failed.length) note += ` Sin cotización: ${failed.join(", ")}.`;
        els.delay.textContent = note;
      }

      applySparkNote(delayBase());
      renderSourceButtons();
      renderAll();
      const benchP = refreshBenchmarks(yahooMap, tvMap);

      const needSpark = liveSource !== "yahoo" && (!silent || !sparkFresh);
      if (needSpark) {
        try {
          const map = await fetchSparkLive(config.positions);
          sparkCache = { at: Date.now(), map };
          rows = rows.map((row) => attachSpark(row, map));
          rows = await enrichUsExtended(rows);
        } catch (sparkError) {
          console.warn("Serie intradía en vivo falló", sparkError);
          rows = rows.map((row) => attachSpark(row, {}));
          rows = await enrichUsExtended(rows);
        }
        applySparkNote(delayBase());
        renderAll();
      }
      await benchP;
    } catch (error) {
      setStatus(`Error al cargar la cartera. ${error.message}`);
      els.list.innerHTML = '<div class="state">No se pudieron cargar los datos. Toca Actualizar.</div>';
    } finally {
      els.refresh.disabled = false;
    }
  }

  function applyAutoRefresh() {
    const on = els.auto.checked;
    localStorage.setItem(AUTO_KEY, on ? "on" : "off");
    if (autoTimer) {
      clearInterval(autoTimer);
      autoTimer = null;
    }
    if (on) {
      autoTimer = setInterval(() => refresh({ silent: true }), 60_000);
    }
  }

  els.filters.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-filter]");
    if (!btn) return;
    filter = btn.dataset.filter;
    renderAll();
  });

  function loadSortPrefs() {
    try {
      const saved = JSON.parse(localStorage.getItem(SORT_KEY) || "null");
      if (saved && SORTS.some((item) => item.id === saved.key) && (saved.dir === "asc" || saved.dir === "desc")) {
        sort = saved.key;
        sortDir = saved.dir;
      }
    } catch {}
  }

  function saveSortPrefs() {
    localStorage.setItem(SORT_KEY, JSON.stringify({ key: sort, dir: sortDir }));
  }

  function renderSourceButtons() {
    document.querySelectorAll(".source-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.source === preferredSource);
    });
  }

  els.sorts.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-sort]");
    if (!btn) return;
    const next = btn.dataset.sort;
    if (sort === next) {
      sortDir = sortDir === "asc" ? "desc" : "asc";
    } else {
      sort = next;
      sortDir = SORT_DEFAULT_DIR[next] || "asc";
    }
    saveSortPrefs();
    renderAll();
  });

  let chartPointer = null;
  let ignoreRowClick = false;

  function chartSamples(chart) {
    try {
      return JSON.parse(decodeURIComponent(chart.dataset.spark || "")) || [];
    } catch {
      return [];
    }
  }

  function hideChartTip(chart) {
    const xh = chart.querySelector(".xh");
    const tip = chart.querySelector(".chart-tip");
    if (xh) xh.setAttribute("hidden", "");
    if (tip) tip.hidden = true;
  }

  function showChartTip(chart, clientX) {
    const samples = sparkSamples(chartSamples(chart));
    if (samples.length < 2) return;
    const prevRaw = chart.dataset.prev;
    const previousClose = prevRaw === "" ? null : Number(prevRaw);
    const wide = chart.dataset.wide === "1";
    const w = wide ? 320 : 72;
    const h = wide ? 140 : 36;
    const values = samples.map((p) => p.v);
    const min = Math.min(...values, previousClose ?? values[0]);
    const max = Math.max(...values, previousClose ?? values[0]);
    const span = max - min || 1;
    const { t0, t1, spanT, x: xAt } = sparkXScale(samples, w);
    const rect = chart.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(rect.width, 1)));
    const t = t0 + ratio * spanT;
    const pt = nearestSparkSample(samples, t);
    const x = xAt(pt.t);
    const y = h - 3 - ((pt.v - min) / span) * (h - 6);
    const xh = chart.querySelector(".xh");
    const vLine = chart.querySelector(".xh-v");
    const dot = chart.querySelector(".xh-dot");
    const tip = chart.querySelector(".chart-tip");
    if (!xh || !vLine || !dot || !tip) return;
    xh.removeAttribute("hidden");
    vLine.setAttribute("x1", x);
    vLine.setAttribute("x2", x);
    dot.setAttribute("cx", x);
    dot.setAttribute("cy", y);
    const time = dt(new Date(pt.t * 1000), { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    const ccy = chart.dataset.ccy || "";
    tip.hidden = false;
    tip.replaceChildren();
    tip.append(`${time} · ${nf(pt.v, priceDigits(pt.v))}${ccy ? ` ${ccy}` : ""}`);
    if (previousClose != null && Number.isFinite(previousClose) && previousClose !== 0) {
      const pct = ((pt.v - previousClose) / previousClose) * 100;
      tip.append(" · ");
      const pctEl = document.createElement("span");
      pctEl.className = `chart-tip-pct ${dirClass(pct)}`;
      pctEl.textContent = signedPctAtClose(pct);
      tip.append(pctEl);
    }
    const leftPct = (x / w) * 100;
    tip.style.left = `${leftPct}%`;
    const shift = leftPct > 72 ? "-100%" : leftPct < 28 ? "0" : "-50%";
    tip.style.transform = `translate(${shift}, -110%)`;
  }

  function onChartPointerDown(event) {
    const chart = event.target.closest(".chart");
    if (!chart || !chart.dataset.spark) return;
    ignoreRowClick = true;
    chartPointer = { id: event.pointerId, chart };
    document.querySelectorAll(".chart").forEach((el) => {
      if (el !== chart) hideChartTip(el);
    });
    try { chart.setPointerCapture(event.pointerId); } catch {}
    event.preventDefault();
    showChartTip(chart, event.clientX);
  }

  function onChartPointerMove(event) {
    if (!chartPointer || event.pointerId !== chartPointer.id) return;
    event.preventDefault();
    showChartTip(chartPointer.chart, event.clientX);
  }

  function onChartPointerUp(event) {
    if (!chartPointer || event.pointerId !== chartPointer.id) return;
    showChartTip(chartPointer.chart, event.clientX);
    chartPointer = null;
  }

  els.list.addEventListener("pointerdown", onChartPointerDown);
  els.list.addEventListener("pointermove", onChartPointerMove);
  els.list.addEventListener("pointerup", onChartPointerUp);
  els.list.addEventListener("pointercancel", onChartPointerUp);

  els.list.addEventListener("click", (event) => {
    if (denseView) return;
    if (event.target.closest(".chart")) {
      ignoreRowClick = false;
      return;
    }
    if (ignoreRowClick) {
      ignoreRowClick = false;
      return;
    }
    const main = event.target.closest(".row-main");
    const row = event.target.closest("[data-symbol]");
    if (!main || !row) return;
    const symbol = row.dataset.symbol;
    if (expanded.has(symbol)) expanded.delete(symbol);
    else expanded.add(symbol);
    renderList();
  });

  els.refresh.addEventListener("click", () => refresh());
  els.auto.addEventListener("change", applyAutoRefresh);

  els.view.addEventListener("click", () => {
    denseView = !denseView;
    localStorage.setItem(VIEW_KEY, denseView ? "dense" : "list");
    applyView();
    renderList();
  });

  for (const btn of [els.theme, els.themeGate]) {
    if (btn) btn.addEventListener("click", toggleTheme);
  }

  const themeMq = window.matchMedia("(prefers-color-scheme: light)");
  const onSystemTheme = () => {
    if (localStorage.getItem(THEME_KEY) === "light" || localStorage.getItem(THEME_KEY) === "dark") return;
    applyTheme(systemTheme());
  };
  if (themeMq.addEventListener) themeMq.addEventListener("change", onSystemTheme);
  else if (themeMq.addListener) themeMq.addListener(onSystemTheme);

  els.sector.addEventListener("click", async () => {
    sectorView = !sectorView;
    localStorage.setItem(SECTOR_KEY, sectorView ? "1" : "0");
    applySector();
    renderList();
    if (sectorView) await refreshBenchmarks();
  });

  els.hideUs.addEventListener("click", () => {
    usSessionMeta = usSessionSnapshot();
    hideUs = !hideUs;
    const override = { hide: hideUs, session: usSessionMeta.session, date: usSessionMeta.date };
    localStorage.setItem(HIDE_US_OVERRIDE_KEY, JSON.stringify(override));
    applyHideUs(usSessionMeta, override);
    renderAll();
  });

  document.addEventListener("visibilitychange", () => {
    if (!started || document.visibilityState !== "visible") return;
    syncHideUs({ render: true });
    refresh({ silent: true });
  });

  document.querySelectorAll(".source-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      preferredSource = btn.dataset.source === "yahoo" ? "yahoo" : "tv";
      localStorage.setItem(SOURCE_KEY, preferredSource);
      renderSourceButtons();
      refresh();
    });
  });

  function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return bytes;
  }

  function bytesToHex(buffer) {
    return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  async function derivePassword(password) {
    const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt: hexToBytes(AUTH.saltHex), iterations: AUTH.iterations },
      material,
      AUTH.bits
    );
    return bytesToHex(bits);
  }

  function isUnlocked() {
    return localStorage.getItem(UNLOCK_KEY) === AUTH.hashHex;
  }

  function showApp() {
    els.gate.hidden = true;
    els.app.hidden = false;
  }

  function showGate() {
    els.app.hidden = true;
    els.gate.hidden = false;
    els.gateError.hidden = true;
    els.gatePassword.value = "";
  }

  async function init() {
    if (started) return;
    started = true;
    preferredSource = localStorage.getItem(SOURCE_KEY) === "yahoo" ? "yahoo" : "tv";
    loadSortPrefs();
    denseView = localStorage.getItem(VIEW_KEY) === "dense";
    sectorView = localStorage.getItem(SECTOR_KEY) === "1";
    applyTheme(currentTheme());
    applyView();
    applySector();
    syncHideUs();
    els.auto.checked = localStorage.getItem(AUTO_KEY) === "on";
    renderSourceButtons();
    renderChips();
    try {
      config = await loadJson("../data/cartera.json");
    } catch (error) {
      setStatus("No se pudo leer data/cartera.json");
      return;
    }
    try {
      snapshot = await loadJson("../data/cartera-snapshot.json");
    } catch {
      snapshot = { quotes: {} };
    }
    applyAutoRefresh();
    await refresh();
  }

  els.gateForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    els.gateError.hidden = true;
    els.gateSubmit.disabled = true;
    els.gateSubmit.textContent = "Comprobando…";
    try {
      const derived = await derivePassword(els.gatePassword.value);
      if (derived !== AUTH.hashHex) {
        els.gateError.hidden = false;
        return;
      }
      localStorage.setItem(UNLOCK_KEY, derived);
      els.gatePassword.value = "";
      showApp();
      await init();
    } catch (error) {
      els.gateError.hidden = false;
      els.gateError.textContent = "No se pudo comprobar la contraseña.";
    } finally {
      els.gateSubmit.disabled = false;
      els.gateSubmit.textContent = "Entrar";
    }
  });

  els.logout.addEventListener("click", () => {
    localStorage.removeItem(UNLOCK_KEY);
    started = false;
    if (autoTimer) {
      clearInterval(autoTimer);
      autoTimer = null;
    }
    showGate();
  });

  globalThis.__carteraSyncUs = () => syncHideUs({ render: true });

  applyTheme(currentTheme());

  if (isUnlocked()) {
    showApp();
    init();
  }
})();
