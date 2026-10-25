(() => {
  const THEME_KEY = "prensa-theme";
  const INDEX_URL = "../data/prensa/index.json";
  const SECTION_ORDER = [
    "España",
    "Internacional",
    "Economía y mercados",
    "Tecnología e IA",
    "IA en X"
  ];

  const els = {
    status: document.getElementById("status"),
    sections: document.getElementById("sections"),
    dayLabel: document.getElementById("dayLabel"),
    prev: document.getElementById("prevBtn"),
    next: document.getElementById("nextBtn"),
    select: document.getElementById("dateSelect"),
    theme: document.getElementById("themeBtn"),
    themeColor: document.querySelector('meta[name="theme-color"]')
  };

  let dates = [];
  let current = null;

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[ch]));
  }

  function queryDate() {
    const raw = new URLSearchParams(location.search).get("d") || "";
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
  }

  function formatDay(iso) {
    const [year, month, day] = iso.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day, 12));
    return new Intl.DateTimeFormat("es-ES", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC"
    }).format(date);
  }

  async function loadJson(path) {
    const res = await fetch(`${path}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`${path} HTTP ${res.status}`);
    return res.json();
  }

  function showStatus(message, isError) {
    els.status.hidden = !message;
    els.status.textContent = message || "";
    els.status.classList.toggle("error", !!isError);
  }

  function orderedSections(secciones) {
    const map = new Map();
    for (const section of secciones || []) {
      const name = String(section?.nombre || "").trim();
      if (!name) continue;
      map.set(name, section);
    }
    const out = [];
    for (const name of SECTION_ORDER) {
      if (map.has(name)) out.push(map.get(name));
    }
    for (const [name, section] of map) {
      if (!SECTION_ORDER.includes(name)) out.push(section);
    }
    return out;
  }

  function renderArchive() {
    if (!dates.length) {
      els.select.innerHTML = '<option value="">Sin ediciones</option>';
      els.select.disabled = true;
      els.prev.disabled = true;
      els.next.disabled = true;
      els.dayLabel.textContent = "Sin ediciones";
      return;
    }
    els.select.disabled = false;
    els.select.innerHTML = dates.map((date) => (
      `<option value="${escapeHtml(date)}" ${date === current ? "selected" : ""}>${escapeHtml(formatDay(date))}</option>`
    )).join("");
    const i = dates.indexOf(current);
    els.next.disabled = i <= 0;
    els.prev.disabled = i < 0 || i >= dates.length - 1;
    els.dayLabel.textContent = current ? formatDay(current) : "Sin ediciones";
  }

  function renderEdition(edition) {
    const sections = orderedSections(edition?.secciones);
    if (!sections.length) {
      els.sections.innerHTML = "";
      showStatus("Esta edición no tiene secciones.", true);
      return;
    }
    els.sections.innerHTML = sections.map((section) => {
      const items = Array.isArray(section.items) ? section.items : [];
      const body = items.length
        ? items.map((item) => {
          const url = String(item?.url || "").trim();
          const titular = String(item?.titular || "").trim();
          const fuente = String(item?.fuente || "").trim();
          const nota = String(item?.nota || "").trim();
          if (!titular || !/^https:\/\//i.test(url)) return "";
          const note = nota ? `<p class="nota">${escapeHtml(nota)}</p>` : "";
          const source = fuente ? `<span class="fuente">${escapeHtml(fuente)}</span>` : "";
          return `<a class="item" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">
            <span class="titular">${escapeHtml(titular)}</span>
            ${source}
            ${note}
          </a>`;
        }).join("")
        : '<p class="empty-sec">Nada en esta sección.</p>';
      return `<details class="block" open>
        <summary>${escapeHtml(section.nombre)} <span class="count">${items.length}</span></summary>
        ${body}
      </details>`;
    }).join("");
  }

  function setDate(date, push) {
    current = date;
    const url = new URL(location.href);
    if (date) url.searchParams.set("d", date);
    else url.searchParams.delete("d");
    if (push) history.pushState({ d: date }, "", url);
    else history.replaceState({ d: date }, "", url);
  }

  async function openDate(date, push) {
    renderArchive();
    if (!date) {
      els.sections.innerHTML = "";
      showStatus("Todavía no hay ediciones de prensa.", false);
      return;
    }
    showStatus("Cargando edición…", false);
    els.sections.innerHTML = "";
    try {
      const edition = await loadJson(`../data/prensa/${date}.json`);
      if (!edition || typeof edition !== "object") throw new Error("Edición vacía");
      setDate(date, push);
      renderArchive();
      showStatus("", false);
      renderEdition(edition);
    } catch (error) {
      console.warn(error);
      els.sections.innerHTML = "";
      showStatus("No se pudo cargar esa edición. Prueba otra fecha o recarga.", true);
    }
  }

  async function start() {
    try {
      const raw = await loadJson(INDEX_URL);
      dates = (Array.isArray(raw) ? raw : [])
        .map((value) => String(value || "").trim())
        .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value));
    } catch (error) {
      console.warn(error);
      dates = [];
      renderArchive();
      els.sections.innerHTML = "";
      showStatus("No se pudo leer el índice de ediciones.", true);
      return;
    }

    if (!dates.length) {
      current = null;
      renderArchive();
      els.sections.innerHTML = "";
      showStatus("Todavía no hay ediciones de prensa.", false);
      return;
    }

    const asked = queryDate();
    const picked = asked && dates.includes(asked) ? asked : dates[0];
    current = picked;
    await openDate(picked, false);
    if (asked && !dates.includes(asked)) {
      showStatus("Esa fecha no está en el archivo. Se muestra la última edición.", true);
    }
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
    if (els.theme) {
      const label = next === "light" ? "Modo oscuro" : "Modo claro";
      els.theme.setAttribute("aria-pressed", next === "light" ? "true" : "false");
      els.theme.setAttribute("aria-label", label);
      els.theme.setAttribute("title", label);
    }
  }

  function toggleTheme() {
    const next = currentTheme() === "light" ? "dark" : "light";
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  }

  applyTheme(currentTheme());
  if (els.theme) els.theme.addEventListener("click", toggleTheme);
  const themeMq = window.matchMedia("(prefers-color-scheme: light)");
  const onSystemTheme = () => {
    if (localStorage.getItem(THEME_KEY) === "light" || localStorage.getItem(THEME_KEY) === "dark") return;
    applyTheme(systemTheme());
  };
  if (themeMq.addEventListener) themeMq.addEventListener("change", onSystemTheme);
  else if (themeMq.addListener) themeMq.addListener(onSystemTheme);

  els.prev.addEventListener("click", () => {
    const i = dates.indexOf(current);
    if (i >= 0 && i < dates.length - 1) openDate(dates[i + 1], true);
  });
  els.next.addEventListener("click", () => {
    const i = dates.indexOf(current);
    if (i > 0) openDate(dates[i - 1], true);
  });
  els.select.addEventListener("change", () => {
    const next = els.select.value;
    if (next && next !== current) openDate(next, true);
  });
  window.addEventListener("popstate", () => {
    const asked = queryDate();
    const picked = asked && dates.includes(asked) ? asked : dates[0];
    if (picked) openDate(picked, false);
  });

  start();
})();
