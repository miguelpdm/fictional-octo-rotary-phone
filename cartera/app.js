(() => {
  const TZ = "Europe/Madrid";
  const AUTO_KEY = "cartera-auto-refresh";
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
    pre_market: "Precierre",
    post_market: "Postcierre",
    out_of_session: "Cerrado"
  };

  let config = { positions: [], groups: [] };
  let snapshot = { quotes: {} };
  let rows = [];
  let filter = "all";
  let sort = "priority";
  let expanded = new Set();
  let autoTimer = null;
  let lastLiveAt = null;
  let liveSource = "snapshot";

  const els = {
    refresh: document.getElementById("refreshBtn"),
    auto: document.getElementById("autoRefresh"),
    status: document.getElementById("statusLine"),
    delay: document.getElementById("delayLine"),
    summary: document.getElementById("summary"),
    markets: document.getElementById("markets"),
    filters: document.getElementById("filterChips"),
    sorts: document.getElementById("sortChips"),
    list: document.getElementById("list")
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

  function mergeQuote(position, tvMap) {
    const snap = fromSnapshot(position);
    const live = tvMap ? fromTv(position, tvMap) : null;
    const quote = live || snap;
    if (!quote) {
      return {
        ...position,
        missing: true,
        error: "No se pudo resolver este ticker."
      };
    }

    const spark = [...(snap?.spark || [])];
    if (live?.price != null) {
      const last = spark[spark.length - 1];
      if (!last || Math.abs(last.v - live.price) > 1e-9) {
        spark.push({ t: Math.floor(Date.now() / 1000), v: live.price });
      }
    }

    return {
      ...position,
      ...quote,
      spark,
      name: position.name || live?.tvName || position.symbol,
      missing: false,
      usedSnapshot: !live
    };
  }

  function visibleRows() {
    let list = rows.filter((row) => {
      if (filter === "all") return true;
      if (filter === "up") return (row.changePct || 0) > 0.005;
      if (filter === "down") return (row.changePct || 0) < -0.005;
      return row.group === filter;
    });

    const groupRank = Object.fromEntries((config.groups || []).map((g, i) => [g.id, i]));
    list = [...list].sort((a, b) => {
      if (sort === "change") return (b.changePct ?? -999) - (a.changePct ?? -999);
      if (sort === "name") return a.name.localeCompare(b.name, "es");
      if (sort === "volume") return (b.relVolume ?? -1) - (a.relVolume ?? -1);
      const ga = groupRank[a.group] ?? 99;
      const gb = groupRank[b.group] ?? 99;
      if (ga !== gb) return ga - gb;
      return 0;
    });
    return list;
  }

  function chartHtml(points, previousClose, wide, currency) {
    const samples = (points || []).filter((p) => p && p.v != null && p.t != null);
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
    const step = (w - 2) / (samples.length - 1);
    const y = (v) => h - 3 - ((v - min) / span) * (h - 6);
    const d = values.map((v, i) => `${i === 0 ? "M" : "L"} ${1 + i * step} ${y(v)}`).join(" ");
    const area = `${d} L ${w - 1} ${h} L 1 ${h} Z`;
    const up = (values[values.length - 1] ?? 0) >= (previousClose ?? values[0]);
    const color = up ? "#30d158" : "#ff453a";
    const prev = previousClose == null ? "" : `<line x1="0" x2="${w}" y1="${y(previousClose)}" y2="${y(previousClose)}" stroke="${color}" stroke-dasharray="3 3" stroke-width="1" opacity="0.7"/>`;
    const payload = encodeURIComponent(JSON.stringify(samples));
    return `<div class="${klass}" role="img" aria-label="Gráfico intradía. Mantén pulsado o arrastra para ver precio y hora." data-wide="${wide ? 1 : 0}" data-ccy="${currency || ""}" data-prev="${previousClose ?? ""}" data-spark="${payload}">
      <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
        <path d="${area}" fill="${color}" opacity="0.16"></path>
        <path d="${d}" fill="none" stroke="${color}" stroke-width="${wide ? 2 : 1.5}" stroke-linejoin="round" stroke-linecap="round"></path>
        ${prev}
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
      const label = tz.replace("America/New_York", "EE. UU.").replace("Europe/", "").replace("_", " ");
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

  function renderList() {
    const list = visibleRows();
    if (!list.length) {
      els.list.innerHTML = '<div class="state">No hay valores para este filtro.</div>';
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
            <div class="name">${row.name}</div>
          </div>
          ${chartHtml(row.spark, row.previousClose, false, row.currency)}
          <div class="right">
            <div class="price">${nf(row.price, priceDigits(row.price))}<span class="ccy">${row.currency || ""}</span></div>
            <div class="badge ${klass}">${signedPct(row.changePct)}</div>
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
    els.sorts.innerHTML = SORTS.map((item) =>
      `<button class="chip ${sort === item.id ? "active" : ""}" data-sort="${item.id}" type="button">${item.label}</button>`
    ).join("");
  }

  function renderAll() {
    renderChips();
    renderSummary(rows);
    renderMarkets(rows);
    renderList();
  }

  function setStatus(message) {
    els.status.textContent = message;
  }

  async function refresh({ silent = false } = {}) {
    if (!silent) setStatus("Actualizando cotizaciones…");
    els.refresh.disabled = true;
    try {
      let tvMap = null;
      try {
        const tickers = config.positions.map((p) => p.tv).filter(Boolean);
        tvMap = await fetchTradingView(tickers);
        liveSource = "tradingview";
        lastLiveAt = new Date();
      } catch (error) {
        liveSource = "snapshot";
        console.warn("TradingView falló, usando snapshot", error);
      }

      rows = config.positions.map((position) => mergeQuote(position, tvMap));
      const failed = rows.filter((r) => r.missing).map((r) => r.symbol);
      const when = lastLiveAt
        ? dt(lastLiveAt, { dateStyle: "short", timeStyle: "medium" })
        : (snapshot.updatedAt ? dt(new Date(snapshot.updatedAt), { dateStyle: "short", timeStyle: "short" }) : "n/d");
      const snapWhen = snapshot.updatedAt
        ? dt(new Date(snapshot.updatedAt), { dateStyle: "short", timeStyle: "short" })
        : "n/d";

      if (liveSource === "tradingview") {
        setStatus(`Última actualización (Madrid): ${when}. Fuente en vivo: TradingView.`);
        els.delay.textContent = "Fuente en vivo TradingView (~15 min de retraso). Sparklines: snapshot Yahoo " + snapWhen + ".";
      } else {
        setStatus(`Sin fuente en vivo. Mostrando snapshot de GitHub Actions (${snapWhen}, hora Madrid).`);
        els.delay.textContent = "El snapshot se genera cada ~30 min. Revisa la conexión e inténtalo de nuevo con Actualizar.";
      }
      if (failed.length) {
        els.delay.textContent += ` Sin cotización: ${failed.join(", ")}.`;
      }
      renderAll();
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

  els.sorts.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-sort]");
    if (!btn) return;
    sort = btn.dataset.sort;
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
    const samples = chartSamples(chart);
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
    const rect = chart.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(rect.width, 1)));
    const i = Math.round(ratio * (samples.length - 1));
    const pt = samples[i];
    const x = 1 + i * ((w - 2) / (samples.length - 1));
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
    tip.textContent = `${time} · ${nf(pt.v, priceDigits(pt.v))}${ccy ? ` ${ccy}` : ""}`;
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

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refresh({ silent: true });
  });

  async function init() {
    els.auto.checked = localStorage.getItem(AUTO_KEY) === "on";
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

  init();
})();
