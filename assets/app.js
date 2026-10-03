/* ============================================================
   Planning and Building data - Victoria
   ============================================================ */
(() => {
  "use strict";

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const fmt   = (n) => (n === null || n === undefined || Number.isNaN(n)) ? "—" : new Intl.NumberFormat("en-AU").format(Math.round(n));
  const fmt1  = (n) => (n === null || n === undefined || Number.isNaN(n)) ? "—" : new Intl.NumberFormat("en-AU", { maximumFractionDigits: 1 }).format(n);
  const pct   = (v, d = 1) => (v === null || v === undefined || Number.isNaN(v)) ? "—" : (v * 100).toFixed(d) + "%";
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const TIER = {
    FULL:          { label: "Planning and building", color: "#34d399" },
    RATES_ONLY:    { label: "Planning only",         color: "#5b8def" },
    BUILDING_ONLY: { label: "Building only",         color: "#a78bfa" },
    C1_ONLY:       { label: "Planning (no outcomes)", color: "#f7b955" },
    NO_SOURCE:     { label: "No data yet",           color: "#566078" }
  };
  const tierColor = (t) => (TIER[t] || TIER.NO_SOURCE).color;
  const tierLabel = (t) => (TIER[t] || { label: t }).label;

  // --- colour ramps ---------------------------------------------------------
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  function ramp(colors, t) {
    t = clamp(t, 0, 1);
    const seg = (colors.length - 1) * t;
    const i = Math.min(colors.length - 2, Math.floor(seg));
    const f = seg - i;
    const a = hex(colors[i]), b = hex(colors[i + 1]);
    const c = a.map((x, k) => Math.round(x + (b[k] - x) * f));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }
  const RATE_RAMP  = ["#f9707f", "#f7b955", "#34d399"];
  const PLAN_RAMP  = ["#24407a", "#5b8def", "#2dd4bf"];
  const BUILD_RAMP = ["#4a2a8f", "#a78bfa", "#e9d5ff"];

  const METRICS = [
    { key: "tier",        label: "Data level",     kind: "cat"  },
    { key: "approval_rate", label: "Approval rate", kind: "rate" },
    { key: "stage1_applications", label: "Planning applications", kind: "num" },
    { key: "building_events",     label: "Building events",       kind: "num" }
  ];

  const state = { data: null, geo: null, metric: METRICS[0], layers: new Map(), sparks: null, charts: {} };

  // The data is embedded by data/coverage.js and data/vic_lga.js so the page
  // also works when opened directly from disk (file://), where fetch() is blocked.
  function loadData() {
    if (window.COVERAGE_DATA && window.VIC_LGA) {
      return Promise.resolve([window.COVERAGE_DATA, window.VIC_LGA]);
    }
    return Promise.all([
      fetch("data/coverage.json").then((r) => r.json()),
      fetch("data/vic_lga.geojson").then((r) => r.json())
    ]);
  }

  // ========================================================================
  //  Boot
  // ========================================================================
  function showError(title, detail) {
    let box = document.getElementById("severe-error");
    if (!box) {
      box = document.createElement("div");
      box.id = "severe-error";
      box.className = "severe-error";
      document.body.insertBefore(box, document.body.firstChild);
    }
    box.innerHTML = `<strong>${title}</strong>` +
      (detail ? `<pre>${String(detail).replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[m]))}</pre>` : "") +
      `<p>Please take a screenshot of this message and send it on.</p>`;
  }

  // Report any script error or failed resource load onto the page itself.
  window.addEventListener("error", (e) => {
    if (e.target && (e.target.tagName === "SCRIPT" || e.target.tagName === "LINK") && e.target.src) {
      showError("A file could not be loaded", e.target.src);
    } else if (e.error || e.message) {
      showError("The page hit an error", (e.error && e.error.stack) || e.message);
    }
  }, true);

  const diag = (data, geo) => {
    if (!window.L || !window.L.map) throw new Error("The map library (Leaflet) did not load — check that assets/vendor/leaflet/leaflet.js exists and is complete.");
    if (!window.Chart) throw new Error("The chart library (Chart.js) did not load — check that assets/vendor/chartjs/chart.umd.min.js exists and is complete.");
    if (!data || !data.councils) throw new Error("The data did not load — check that data/coverage.js exists and is complete.");
    if (!geo || !geo.features) throw new Error("The map boundaries did not load — check that data/vic_lga.js exists and is complete.");
  };

  loadData().then(([data, geo]) => {
    diag(data, geo);
    if (data.notes && data.notes.units) state.notes = data.notes;
    state.data = data;
    state.geo = geo;
    data.councils.forEach((c) => { c._byId = c.id; });
    renderGenerated(data.generated_at);
    renderHero(data);
    buildMetricToggle();
    buildMap(data, geo);
    buildRank();
    buildFunnel(data);
    buildTable(data);
    buildCharts(data);
    wireDrawer();
    wireReveal();
    wireTopbar();
  }).catch((err) => {
    console.error(err);
    showError("The page could not start", err && err.message ? err.message : err);
  });

  function renderGenerated(ts) {
    const d = ts ? new Date(ts) : null;
    const txt = d && !Number.isNaN(d.valueOf())
      ? d.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })
      : "—";
    $("#generated").textContent = "Data generated " + txt;
    $("#footerGen").textContent = txt;
  }

  // ========================================================================
  //  Hero
  // ========================================================================
  function renderHero(data) {
    const t = data.totals;
    const stats = [
      { n: t.councils_total,        l: "councils in Victoria", c: "var(--blue)",   fmt: "int" },
      { n: t.councils_with_sources, l: "councils with data collected", c: "var(--green)", fmt: "int" },
      { n: t.planning_applications, l: "planning applications collected", c: "var(--amber)", fmt: "int" },
      { n: t.building_events,       l: "building events collected", c: "var(--violet)", fmt: "int" },
      { n: t.matched_built,         l: "planning applications matched to building work", c: "var(--teal)", fmt: "int" },
      { n: t.councils_full,         l: "councils with matching set up", c: "var(--green)", fmt: "int" }
    ];
    const wrap = $("#heroStats");
    wrap.innerHTML = stats.map((s) =>
      `<div class="stat" style="--accent:${s.c}"><span class="num" data-target="${s.n}">0</span><span class="lbl">${s.l}</span></div>`
    ).join("");
    $$(".num", wrap).forEach((el) => countUp(el, Number(el.dataset.target)));

    // Guard against the wrong mental model: these are different record types.
    const note = document.getElementById("heroNote");
    if (note) note.innerHTML =
      `${fmt(t.planning_applications)} planning applications and ${fmt(t.building_events)} building events ` +
      `have been collected — these are different record types, so they are not a ratio of one another. ` +
      `Matching is set up for ${t.councils_full} of the ${t.councils_total} councils, ` +
      `where ${fmt(t.matched_built)} of ${fmt(t.applications_building_links)} applications were matched to building work.`;
  }

  // Set the final value immediately, then animate up to it. The final value
  // must never depend on requestAnimationFrame: it does not run while the tab
  // is not painting, which previously left the counters frozen at a partial
  // number (or "—") when the page was restored from a background tab.
  function countUp(el, target, dur = 1400) {
    if (!isFinite(target)) { el.textContent = "—"; return; }
    const finish = () => { el.textContent = fmt(target); };
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return finish();
    const start = performance.now();
    let done = false;
    const settle = () => { if (!done) { done = true; finish(); } };
    const step = (now) => {
      if (done) return;
      const p = clamp((now - start) / dur, 0, 1);
      if (p >= 1) return settle();
      el.textContent = fmt(target * (1 - Math.pow(1 - p, 3)));
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    setTimeout(settle, dur + 250);   // guarantee the final value even if rAF is throttled
  }

  // ========================================================================
  //  Metric toggle
  // ========================================================================
  function buildMetricToggle() {
    const box = $("#mapMetric");
    box.innerHTML = METRICS.map((m, i) =>
      `<button role="tab" aria-selected="${i === 0}" class="${i === 0 ? "is-active" : ""}" data-key="${m.key}">${m.label}</button>`
    ).join("");
    box.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      state.metric = METRICS.find((m) => m.key === btn.dataset.key);
      $$("button", box).forEach((b) => {
        const on = b === btn;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-selected", String(on));
      });
      recolor();
      buildRank();
    });
  }

  // ========================================================================
  //  Map
  // ========================================================================
  // Leaflet is only touched inside buildMap(), never at script load, so a
  // missing/failed library surfaces as a readable on-page message.
  const vicBounds = () => L.latLngBounds([[-39.45, 140.75], [-33.85, 150.25]]);

  function buildMap(data, geo) {
    const map = L.map("map", {
      zoomControl: true, attributionControl: false, zoomSnap: 0.25,
      maxBounds: vicBounds().pad(0.25), maxBoundsViscosity: 0.7, minZoom: 5, maxZoom: 11
    });
    state.map = map;

    const byId = new Map(data.councils.map((c) => [c.id, c]));
    state.byId = byId;

    state.geoLayer = L.geoJSON(geo, {
      style: (f) => styleFor(f.properties.council_id ? byId.get(f.properties.council_id) : null),
      onEachFeature: (f, layer) => {
        const cid = f.properties.council_id;
        const c = cid ? byId.get(cid) : null;
        layer.on("mouseover", () => layer.setStyle({ weight: 2.2, color: "#ffffff" }));
        layer.on("mouseout",  () => layer.setStyle({ weight: 0.8, color: "rgba(8,11,20,0.85)" }));
        layer.on("click", () => c && openDrawer(c));
        if (c) {
          layer.bindTooltip(
            `<div class="map-tip-name">${c.name || c.id}</div><div class="map-tip-val">${tipValue(c)}</div>`,
            { sticky: true, direction: "top" }
          );
          state.layers.set(cid, layer);
        }
      }
    }).addTo(map);

    map.fitBounds(state.geoLayer.getBounds().pad(0.02));
    buildLegend();
  }

  function styleFor(c) {
    if (!c) return { fillColor: "#1a2036", color: "rgba(8,11,20,0.7)", weight: 0.6, fillOpacity: 0.5 };
    const m = state.metric;
    const base = { color: "rgba(8,11,20,0.85)", weight: 0.8, fillOpacity: 0.82 };
    if (m.kind === "cat") return { ...base, fillColor: tierColor(c.tier) };
    if (m.kind === "rate") {
      const v = c.approval_rate;
      if (v === null || v === undefined) return { ...base, fillColor: "#2a3149", fillOpacity: 0.45 };
      const [lo, hi] = state.rateRange;
      return { ...base, fillColor: ramp(RATE_RAMP, (v - lo) / (hi - lo || 1)) };
    }
    if (m.kind === "num") {
      const v = m.key === "building_events" ? c.building_events : c.stage1_applications;
      if (!v) return { ...base, fillColor: "#2a3149", fillOpacity: 0.4 };
      const max = state.numMax[m.key] || 1;
      const colors = m.key === "building_events" ? BUILD_RAMP : PLAN_RAMP;
      return { ...base, fillColor: ramp(colors, Math.sqrt(v / max)) };
    }
    return base;
  }

  function recolor() {
    computeRanges();
    state.geoLayer.setStyle((f) => styleFor(f.properties.council_id ? state.byId.get(f.properties.council_id) : null));
    state.layers.forEach((layer, cid) => {
      const c = state.byId.get(cid);
      layer.setTooltipContent && layer.setTooltipContent(`<div class="map-tip-name">${c.name || c.id}</div><div class="map-tip-val">${tipValue(c)}</div>`);
    });
    buildLegend();
  }

  function computeRanges() {
    const rates = state.data.councils.map((c) => c.approval_rate).filter((v) => typeof v === "number");
    state.rateRange = rates.length ? [Math.min(...rates), Math.max(...rates)] : [0.9, 1];
    state.numMax = {
      stage1_applications: Math.max(1, ...state.data.councils.map((c) => c.stage1_applications || 0)),
      building_events: Math.max(1, ...state.data.councils.map((c) => c.building_events || 0))
    };
  }

  function tipValue(c) {
    const m = state.metric;
    if (m.kind === "cat") return tierLabel(c.tier);
    if (m.kind === "rate") return "Approval rate " + pct(c.approval_rate);
    if (m.key === "building_events") return fmt(c.building_events) + " building events";
    return fmt(c.stage1_applications) + " planning applications";
  }

  function buildLegend() {
    const box = $("#legend");
    const m = state.metric;
    let html = "";
    if (m.kind === "cat") {
      html = Object.entries(TIER).map(([k, v]) =>
        `<span class="legend-item"><span class="legend-swatch" style="background:${v.color}"></span>${v.label}</span>`
      ).join("");
    } else if (m.kind === "rate") {
      const [lo, hi] = state.rateRange;
      html = rampLegend(RATE_RAMP, pct(lo, 0), pct(hi, 0));
    } else {
      const colors = m.key === "building_events" ? BUILD_RAMP : PLAN_RAMP;
      html = rampLegend(colors, "0", fmt(state.numMax[m.key]));
    }
    box.innerHTML = html;
  }

  function rampLegend(colors, lo, hi) {
    const stops = colors.map((c) => `<span style="background:${c}"></span>`).join("");
    return `<span class="legend-item" style="gap:2px">
      <span style="font-size:0.78rem">${lo}</span>
      <span style="display:flex;width:130px;height:11px;border-radius:6px;overflow:hidden;box-shadow:0 0 0 1px rgba(255,255,255,0.14)">${stops}</span>
      <span style="font-size:0.78rem">${hi}</span>
    </span>`;
  }

  // ========================================================================
  //  Rank list
  // ========================================================================
  function buildRank() {
    const box = $("#rankList");
    const m = state.metric;
    if (m.kind === "cat") {
      const counts = {};
      state.data.councils.forEach((c) => { counts[c.tier] = (counts[c.tier] || 0) + 1; });
      const rows = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
      box.innerHTML = `<h3>Data level</h3>` + rows.map((t) =>
        `<div class="rank-row" data-tier="${t}"><span class="rank-dot" style="background:${tierColor(t)}"></span>
          <span class="rank-name">${tierLabel(t)}</span><span class="rank-val">${counts[t]}</span></div>`
      ).join("");
      box.querySelectorAll(".rank-row").forEach((r) =>
        r.addEventListener("click", () => {
          const first = state.data.councils.find((c) => c.tier === r.dataset.tier);
          if (first) { focusCouncil(first.id); openDrawer(first); }
        }));
      return;
    }
    const valOf = (c) => m.kind === "rate" ? c.approval_rate
      : (m.key === "building_events" ? c.building_events : c.stage1_applications);
    const rows = state.data.councils
      .map((c) => ({ c, v: valOf(c) }))
      .filter((r) => typeof r.v === "number")
      .sort((a, b) => b.v - a.v)
      .slice(0, 26);
    box.innerHTML = `<h3>Top ${rows.length} · ${m.label}</h3>` + rows.map((r, i) =>
      `<div class="rank-row" data-id="${r.c.id}">
        <span class="rank-idx">${i + 1}</span>
        <span class="rank-dot" style="background:${tierColor(r.c.tier)}"></span>
        <span class="rank-name">${r.c.name || r.c.id}</span>
        <span class="rank-val">${m.kind === "rate" ? pct(r.v) : fmt(r.v)}</span>
      </div>`
    ).join("");
    box.querySelectorAll(".rank-row").forEach((el) =>
      el.addEventListener("click", () => {
        const c = state.byId.get(el.dataset.id);
        if (c) { focusCouncil(c.id); openDrawer(c); }
      }));
  }

  function focusCouncil(id) {
    const layer = state.layers.get(id);
    if (layer && state.map) state.map.fitBounds(layer.getBounds().pad(0.4), { maxZoom: 9 });
  }

  // ========================================================================
  //  Funnel
  // ========================================================================
  function buildFunnel(data) {
    const max = Math.max(...data.stages.map((s) => s.rows));
    $("#funnel").innerHTML = data.stages.map((s) => {
      const w = Math.max(2, Math.sqrt(s.rows / max) * 100);
      return `<div class="stage">
        <div class="stage-badge">${s.n}</div>
        <div class="stage-body">
          <div class="stage-top">
            <span class="stage-label">${s.label}</span>
            <span class="stage-rows">${fmt(s.rows)}</span>
          </div>
          <div class="stage-bar"><span style="width:${w}%"></span></div>
          <div class="stage-meta">
            <span>table <b>${s.table}</b></span>
            <span><b>${s.councils}</b> councils onboarded</span>
            <span>${s.note}</span>
          </div>
        </div>
      </div>`;
    }).join("");
    const t = data.totals;
    $("#funnelNote").innerHTML =
      `Each stage counts a different type of record, so the numbers are not a ratio of one another. ` +
      `In particular, the <strong>${fmt(t.building_events)} building events</strong> and the ` +
      `<strong>${fmt(t.applications_building_links)} matched planning applications</strong> are different record types: ` +
      `one approval can produce several permits. Matching is set up for ${t.councils_full} of the 79 councils. ` +
      `Within those, ${pct(t.match_rate)} of the ${fmt(t.applications_building_links)} applications on the matching side were ` +
      `resolved to building work (${fmt(t.matched_built)}). ` +
      `Stage 4 counts candidate pairs before matching, which is why that number is large.`;
  }

  // ========================================================================
  //  Table
  // ========================================================================
  const COLS = [
    { key: "name", label: "Council", type: "text" },
    { key: "tier", label: "Data level", type: "tier" },
    { key: "approval_rate", label: "Approval", type: "pct" },
    { key: "stage1_applications", label: "Planning", type: "int" },
    { key: "stage2_evidence", label: "Properties", type: "int" },
    { key: "building_events", label: "Building", type: "int" },
    { key: "_matched_rate", label: "Match", type: "pct" }
  ];
  const sort = { key: "tier", dir: 1 };   // start with Planning and building first

  function buildTable(data) {
    data.councils.forEach((c) => { c._matched_rate = c.links ? c.links.matched_rate : null; });
    const thead = $("#councilTable thead");
    thead.innerHTML = `<tr>${COLS.map((c) => `<th data-key="${c.key}" class="${c.key === sort.key ? "sorted asc" : ""}">${c.label}</th>`).join("")}</tr>`;
    thead.addEventListener("click", (e) => {
      const th = e.target.closest("th");
      if (!th) return;
      const key = th.dataset.key;
      if (!key) return;
      sort.dir = (sort.key === key) ? -sort.dir : (key === "name" ? 1 : -1);
      sort.key = key;
      drawRows();
    });
    $("#councilSearch").addEventListener("input", drawRows);
    drawRows();
  }

  function drawRows() {
    const q = $("#councilSearch").value.trim().toLowerCase();
    const list = state.data.councils.filter((c) => !q || (c.name || c.id).toLowerCase().includes(q) || c.id.includes(q));
    const col = COLS.find((c) => c.key === sort.key) || COLS[0];
    list.sort((a, b) => {
      let x = a[sort.key], y = b[sort.key];
      if (sort.key === "tier") {
        // Most complete first, then by size.
        const rank = { FULL: 0, RATES_ONLY: 1, BUILDING_ONLY: 2, C1_ONLY: 3, NO_SOURCE: 4 };
        const rx = rank[a.tier] ?? 9, ry = rank[b.tier] ?? 9;
        if (rx !== ry) return sort.dir * (rx - ry);
        return (b.stage1_applications || b.building_events || 0) - (a.stage1_applications || a.building_events || 0);
      }
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      if (typeof x === "string") return sort.dir * x.localeCompare(y);
      return sort.dir * (x - y);
    });
    $("#councilTable tbody").innerHTML = list.map((c) => `<tr data-id="${c.id}">
      <td><span class="cell-name">${c.name || c.id}</span></td>
      <td><span class="tier-badge" style="color:${tierColor(c.tier)}"><span class="tier-dot" style="background:${tierColor(c.tier)}"></span>${tierLabel(c.tier)}</span></td>
      <td class="rate-val ${c.rate_reliability === "mostly_undecided" ? "warn" : ""}">${pct(c.approval_rate)}${c.rate_reliability === "mostly_undecided" ? " *" : ""}</td>
      <td>${fmt(c.stage1_applications)}${c.stage_note ? ' <span class="warn" title="' + escapeHtml(c.stage_note) + '">*</span>' : ""}</td>
      <td>${fmt(c.stage2_evidence)}</td>
      <td>${fmt(c.building_events)}</td>
      <td>${c._matched_rate === null ? '<span class="muted" title="No matching set up for this council">n/a</span>' : pct(c._matched_rate)}</td>
    </tr>`).join("");
    $$("#councilTable tbody tr").forEach((tr) =>
      tr.addEventListener("click", () => {
        const c = state.byId.get(tr.dataset.id);
        if (c) { focusCouncil(c.id); openDrawer(c); }
      }));
    $$("#councilTable thead th").forEach((th) => {
      th.classList.toggle("sorted", th.dataset.key === sort.key);
      th.classList.toggle("asc", th.dataset.key === sort.key && sort.dir === 1);
    });
  }

  // ========================================================================
  //  Charts
  // ========================================================================
  function buildCharts(data) {
    if (!window.Chart) return;
    Chart.defaults.color = "#939fbe";
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    Chart.defaults.font.size = 11;
    Chart.defaults.borderColor = "rgba(255,255,255,0.07)";

    // 1. approval-rate histogram
    const rates = data.councils.map((c) => c.approval_rate).filter((v) => typeof v === "number");
    const lo = Math.floor(Math.min(...rates) * 100) / 100;
    const bins = 12, width = (1 - lo) / bins;
    const counts = new Array(bins).fill(0);
    rates.forEach((v) => { counts[clamp(Math.floor((v - lo) / width), 0, bins - 1)]++; });
    const labels = counts.map((_, i) => `${((lo + i * width) * 100).toFixed(0)}–${((lo + (i + 1) * width) * 100).toFixed(0)}%`);
    state.charts.rateHist = new Chart($("#rateHist"), {
      type: "bar",
      data: { labels, datasets: [{ data: counts, backgroundColor: counts.map((_, i) => ramp(RATE_RAMP, i / (bins - 1))), borderRadius: 5, borderSkipped: false }] },
      options: baseOpts({ legend: false, yTitle: "Councils", xTitle: "Approval rate", maintainAspect: false })
    });

    // 2. linkage stacked bars
    const linked = data.councils.filter((c) => c.links).sort((a, b) => b.links.applications - a.links.applications);
    const series = [
      { tier: "d_decided", label: "Matched (decided)", color: "#34d399" },
      { tier: "rule_matched", label: "Matched (rule)", color: "#5b8def" },
      { tier: "none", label: "Not matched", color: "#3a4360" }
    ];
    state.charts.linkChart = new Chart($("#linkChart"), {
      type: "bar",
      data: {
        labels: linked.map((c) => c.name || c.id),
        datasets: series.map((s) => ({
          label: s.label,
          data: linked.map((c) => (c.links.tiers.find((t) => t.tier === s.tier) || {}).applications || 0),
          backgroundColor: s.color, borderRadius: 3, borderSkipped: false
        }))
      },
      options: baseOpts({ legend: true, stacked: true, indexAxis: "y", maintainAspect: false })
    });

    // 3. year timeline
    const years = data.year_totals;
    const t = data.totals;
    const real = years.filter((y) => y.applications >= 50);  // drop thin pre-register years
    state.charts.yearChart = new Chart($("#yearChart"), {
      type: "line",
      data: {
        labels: real.map((y) => y.year),
        datasets: [
          { label: "Planning applications", data: real.map((y) => y.applications), borderColor: "#f7b955", backgroundColor: "rgba(247,185,85,0.14)", fill: true, tension: 0.35, pointRadius: 0, yAxisID: "y" },
          { label: "Building events", data: real.map((y) => y.building), borderColor: "#a78bfa", backgroundColor: "rgba(167,139,250,0.10)", fill: true, tension: 0.35, pointRadius: 0, yAxisID: "y" }
        ]
      },
      options: baseOpts({ legend: true, maintainAspect: false })
    });
  }

  function baseOpts({ legend = false, stacked = false, indexAxis = "x", maintainAspect = true } = {}) {
    return {
      responsive: true, maintainAspectRatio: maintainAspect,
      indexAxis,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: legend, position: "bottom", labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, padding: 14 } },
        tooltip: {
          backgroundColor: "rgba(10,14,26,0.95)", borderColor: "rgba(255,255,255,0.16)", borderWidth: 1,
          padding: 11, cornerRadius: 9, titleColor: "#eaeefb", bodyColor: "#c9d2ea",
          callbacks: { label: (c) => ` ${c.dataset.label ? c.dataset.label + ": " : ""}${fmt(c.parsed[indexAxis === "y" ? "x" : "y"])}` }
        }
      },
      scales: {
        x: { stacked, grid: { color: "rgba(255,255,255,0.05)", drawTicks: false }, ticks: { maxRotation: 0, autoSkipPadding: 12 } },
        y: { stacked, beginAtZero: true, grid: { color: "rgba(255,255,255,0.05)", drawTicks: false }, ticks: { callback: (v) => fmt(v) } }
      }
    };
  }

  // ========================================================================
  //  Drawer
  // ========================================================================
  function wireDrawer() {
    $("#drawerScrim").addEventListener("click", closeDrawer);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });
  }

  function closeDrawer() {
    $("#drawer").classList.remove("is-open");
    $("#drawerScrim").classList.remove("is-open");
    setTimeout(() => { $("#drawer").hidden = true; $("#drawerScrim").hidden = true; }, 320);
    if (state.sparks) { state.sparks.destroy(); state.sparks = null; }
  }

  function openDrawer(c) {
    const d = $("#drawer");
    const L2 = c.links;
    const tier = TIER[c.tier] || TIER.NO_SOURCE;
    const caution = c.rate_reliability === "mostly_undecided";
    d.innerHTML = `<div class="drawer-inner">
      <button class="drawer-close" aria-label="Close">×</button>
      <span class="d-tier" style="color:${tier.color};background:${tier.color}22">${tier.label}</span>
      <h3>${c.name || c.id}</h3>
      <p class="d-sub">ABS area code ${c.abs_code || "—"} · <code>${c.id}</code></p>

      <div class="d-hero">
        <div class="big">${pct(c.approval_rate)}<small>approval rate</small></div>
        <div class="big">${L2 ? pct(L2.matched_rate) : '<span class="muted">—</span>'}<small>matched to building</small></div>
      </div>

      <div class="d-section">
        <h4>Records collected</h4>
        <div class="d-grid">
          ${cell(c.stage1_applications, "Planning applications")}
          ${cell(c.stage2_evidence, "Properties resolved")}
          ${cell(c.building_events, "Building events")}
          ${cell(c.stage5_links, "Matched records")}
        </div>
        ${c.stage_note ? `<p class="d-caveat">Planning: ${escapeHtml(c.stage_note)}</p>` : ""}
      </div>

      ${L2 ? linkBlock(L2) : `<div class="d-section"><h4>Matching</h4><p class="d-sub" style="margin:0">This council does not have matched records.</p></div>`}

      <div class="d-section">
        <h4>Planning applications by year</h4>
        <div class="d-spark"><canvas id="spark"></canvas></div>
      </div>

      ${caution ? `<div class="d-note"><strong>Note:</strong> most applications in this council's register are not decided yet, so the approval rate is provisional.</div>` : ""}
      <div class="d-note"><strong>Source:</strong> ${escapeHtml(c.provenance || "published summary data")}</div>
    </div>`;
    d.querySelector(".drawer-close").addEventListener("click", closeDrawer);
    d.hidden = false;
    $("#drawerScrim").hidden = false;
    requestAnimationFrame(() => { d.classList.add("is-open"); $("#drawerScrim").classList.add("is-open"); });
    drawSpark(c);
    d.querySelector(".drawer-close").focus();
  }

  function cell(v, label) {
    return `<div class="d-cell"><span class="n ${v ? "" : "na"}">${fmt(v)}</span><span class="l">${label}</span></div>`;
  }

  function linkBlock(L2) {
    const total = L2.applications || 1;
    const seg = (t, color) => {
      const v = (L2.tiers.find((x) => x.tier === t) || {}).applications || 0;
      return `<span style="width:${(v / total) * 100}%;background:${color}" title="${t}: ${fmt(v)}"></span>`;
    };
    return `<div class="d-section">
      <h4>Matching</h4>
      <div class="d-bar">${seg("d_decided", "#34d399")}${seg("rule_matched", "#5b8def")}${seg("none", "#3a4360")}</div>
      <div class="d-legend">
        <span><i style="background:#34d399"></i>Matched (decided) ${fmt((L2.tiers.find((x) => x.tier === "d_decided") || {}).applications || 0)}</span>
        <span><i style="background:#5b8def"></i>Matched (rule) ${fmt((L2.tiers.find((x) => x.tier === "rule_matched") || {}).applications || 0)}</span>
        <span><i style="background:#3a4360"></i>Not matched ${fmt((L2.tiers.find((x) => x.tier === "none") || {}).applications || 0)}</span>
      </div>
    </div>`;
  }

  function drawSpark(c) {
    if (state.sparks) { state.sparks.destroy(); state.sparks = null; }
    const yrs = c.years.filter((y) => y.applications > 0);
    if (!yrs.length || !window.Chart) return;
    state.sparks = new Chart($("#spark"), {
      type: "line",
      data: {
        labels: yrs.map((y) => y.year),
        datasets: [{ data: yrs.map((y) => y.applications), borderColor: "#2dd4bf", backgroundColor: "rgba(45,212,191,0.14)", fill: true, tension: 0.35, pointRadius: 0, borderWidth: 2 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        plugins: { legend: { display: false }, tooltip: baseOpts().plugins.tooltip },
        scales: {
          x: { grid: { display: false }, ticks: { maxTicksLimit: 6, maxRotation: 0 } },
          y: { beginAtZero: true, grid: { color: "rgba(255,255,255,0.05)" }, ticks: { maxTicksLimit: 4, callback: (v) => fmt(v) } }
        }
      }
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));
  }

  // ========================================================================
  //  Polish
  // ========================================================================
  function wireReveal() {
    const targets = $$(".section, .hero .stat, .method-card, .chart-card");
    targets.forEach((el) => el.classList.add("reveal"));
    if (!("IntersectionObserver" in window)) { targets.forEach((el) => el.classList.add("is-in")); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); } });
    }, { threshold: 0.08 });
    targets.forEach((el) => io.observe(el));
  }

  function wireTopbar() {
    const bar = $(".topbar");
    const onScroll = () => bar.classList.toggle("is-stuck", window.scrollY > 12);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }
})();
