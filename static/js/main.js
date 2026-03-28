/**
 * main.js — Painel de Controlo da Nação
 * Dynamic data loading, Chart.js rendering, UI helpers.
 */

'use strict';

// ---------------------------------------------------------------------------
// Clock
// ---------------------------------------------------------------------------
function updateClock() {
  const el = document.getElementById('clock');
  if (!el) return;
  const now = new Date();
  el.textContent = now.toLocaleTimeString('pt-PT', { hour12: false });
}
setInterval(updateClock, 1000);
updateClock();

// ---------------------------------------------------------------------------
// Toast notifications
// ---------------------------------------------------------------------------
let toastTimer = null;
function showToast(msg, duration = 3000) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmt(value, decimals = 0, fallback = '—') {
  if (value === null || value === undefined) return fallback;
  return Number(value).toLocaleString('pt-PT', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text ?? '—';
}

// ---------------------------------------------------------------------------
// Chart.js defaults (cyberpunk theme)
// ---------------------------------------------------------------------------
Chart.defaults.color = '#607080';
Chart.defaults.borderColor = 'rgba(26,42,74,.6)';
Chart.defaults.font.family = "'Share Tech Mono', monospace";
Chart.defaults.font.size = 11;

const CYAN   = '#00d4ff';
const ORANGE = '#ff6b35';
const GREEN  = '#00ff88';
const PURPLE = '#9d4edd';
const RED    = '#ff2d55';

function lineDataset(label, data, color) {
  return {
    label,
    data,
    borderColor: color,
    backgroundColor: color + '22',
    borderWidth: 2,
    pointRadius: 3,
    pointHoverRadius: 5,
    tension: 0.3,
    fill: true,
  };
}

function barDataset(label, data, color) {
  return {
    label,
    data,
    backgroundColor: color + '55',
    borderColor: color,
    borderWidth: 1,
    hoverBackgroundColor: color + '88',
  };
}

const chartOptions = (yLabel = '') => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { labels: { color: '#99bbd4', font: { size: 10 } } },
    tooltip: {
      backgroundColor: '#0a0f1e',
      borderColor: '#1a2a4a',
      borderWidth: 1,
      titleColor: '#00d4ff',
      bodyColor: '#e0f0ff',
    },
  },
  scales: {
    x: { ticks: { color: '#607080' }, grid: { color: 'rgba(26,42,74,.4)' } },
    y: {
      ticks: { color: '#607080' },
      grid: { color: 'rgba(26,42,74,.4)' },
      title: { display: !!yLabel, text: yLabel, color: '#607080', font: { size: 10 } },
    },
  },
});

// ---------------------------------------------------------------------------
// Demographics
// ---------------------------------------------------------------------------
let popChart, ageRateChart;

async function loadDemographics() {
  try {
    const res = await fetch('/api/demographics');
    if (!res.ok) throw new Error(res.statusText);
    const { latest, history } = await res.json();

    // KPIs
    const pop = latest.total_population;
    setText('dem-population', pop ? (pop / 1e6).toFixed(2) + ' M' : '—');
    setText('dem-density', latest.population_density ? fmt(latest.population_density, 1) + ' /km²' : '—');
    setText('dem-life', latest.life_expectancy ? fmt(latest.life_expectancy, 1) + ' anos' : '—');
    // Show male/female life expectancy as subtitle
    if (latest.life_expectancy_male && latest.life_expectancy_female) {
      setText('dem-life-gender',
        `♂ ${fmt(latest.life_expectancy_male, 1)} a · ♀ ${fmt(latest.life_expectancy_female, 1)} a`);
    }
    setText('dem-median-age', latest.median_age ? fmt(latest.median_age, 1) + ' anos' : '—');
    setText('dem-fertility', latest.fertility_rate ? fmt(latest.fertility_rate, 2) : '—');
    setText('dem-infant-mortality', latest.infant_mortality_rate ? fmt(latest.infant_mortality_rate, 1) + ' ‰' : '—');
    setText('dem-net-migration', latest.net_migration
      ? (latest.net_migration > 0 ? '+' : '') + fmt(latest.net_migration, 0)
      : '—');
    setText('dem-urbanization', latest.urbanization_rate ? fmt(latest.urbanization_rate, 1) + ' %' : '—');
    setText('dem-year', latest.year ? `Dados ${latest.year}` : '');

    // Gender breakdown
    if (latest.male_population && latest.female_population) {
      setText('dem-male-pop', (latest.male_population / 1e6).toFixed(2) + ' M');
      setText('dem-female-pop', (latest.female_population / 1e6).toFixed(2) + ' M');
      setText('dem-male-pct', latest.male_pct ? fmt(latest.male_pct, 1) + ' %' : '—');
      setText('dem-female-pct', latest.female_pct ? fmt(latest.female_pct, 1) + ' %' : '—');
      const mBar = document.getElementById('dem-male-bar');
      const fBar = document.getElementById('dem-female-bar');
      if (mBar) { mBar.style.width = (latest.male_pct || 0) + '%'; }
      if (fBar) { fBar.style.width = (latest.female_pct || 0) + '%'; }
    }

    // Age bars
    setAgeBars(latest.age_0_14_pct, latest.age_15_64_pct, latest.age_65_plus_pct);

    // Population line chart
    const years = history.map(r => r.year);
    const pops  = history.map(r => r.total_population ? +(r.total_population / 1e6).toFixed(3) : null);

    const popCtx = document.getElementById('chart-population');
    if (popCtx) {
      if (popChart) popChart.destroy();
      popChart = new Chart(popCtx, {
        type: 'line',
        data: { labels: years, datasets: [lineDataset('População (M)', pops, CYAN)] },
        options: { ...chartOptions('Milhões'), plugins: { ...chartOptions().plugins } },
      });
    }

    // Birth/death rate chart
    const births = history.map(r => r.birth_rate);
    const deaths = history.map(r => r.death_rate);

    const rateCtx = document.getElementById('chart-rates');
    if (rateCtx) {
      if (ageRateChart) ageRateChart.destroy();
      ageRateChart = new Chart(rateCtx, {
        type: 'bar',
        data: {
          labels: years,
          datasets: [
            barDataset('Natalidade (‰)', births, GREEN),
            barDataset('Mortalidade (‰)', deaths, RED),
          ],
        },
        options: chartOptions('‰'),
      });
    }

  } catch (err) {
    console.error('Demographics error:', err);
    showToast('⚠ Erro ao carregar dados demográficos');
  }
}

function setAgeBars(a, b, c) {
  const bars = [
    { id: 'age-bar-0-14',   pct: a, color: CYAN },
    { id: 'age-bar-15-64',  pct: b, color: GREEN },
    { id: 'age-bar-65plus', pct: c, color: ORANGE },
  ];
  bars.forEach(({ id, pct, color }) => {
    const fill = document.getElementById(id);
    const label = document.getElementById(id + '-pct');
    if (fill && pct !== null && pct !== undefined) {
      fill.style.width = pct + '%';
      fill.style.background = color;
      fill.style.boxShadow = `0 0 6px ${color}`;
    }
    if (label) label.textContent = pct ? fmt(pct, 1) + ' %' : '—';
  });
}

// ---------------------------------------------------------------------------
// Interactive Map (Leaflet + OpenStreetMap)
// ---------------------------------------------------------------------------
let _map = null;
let _mapLayer = 'population';
let _mapData = [];

/** Colour ramp from low (cold) to high (hot) in cyberpunk palette */
function mapColour(ratio) {
  // 0 → cyan  0.5 → orange  1 → red
  const stops = [
    [0,   0x00, 0xd4, 0xff],  // cyan
    [0.5, 0xff, 0x6b, 0x35],  // orange
    [1.0, 0xff, 0x2d, 0x55],  // red
  ];
  let lo = stops[0], hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (ratio >= stops[i][0] && ratio <= stops[i + 1][0]) {
      lo = stops[i];
      hi = stops[i + 1];
      break;
    }
  }
  const t = hi[0] === lo[0] ? 0 : (ratio - lo[0]) / (hi[0] - lo[0]);
  const r = Math.round(lo[1] + t * (hi[1] - lo[1]));
  const g = Math.round(lo[2] + t * (hi[2] - lo[2]));
  const b = Math.round(lo[3] + t * (hi[3] - lo[3]));
  return `rgb(${r},${g},${b})`;
}

/** Build popup HTML for a region */
function buildPopup(r) {
  const fmtNum = (v, d = 0) => v !== null && v !== undefined ? fmt(v, d) : '—';
  return `
    <div class="map-popup-title">${r.region_name} <span style="font-size:.6rem;opacity:.6">${r.region_code}</span></div>
    <div class="map-popup-row"><span class="map-popup-key">Ano</span><span class="map-popup-val">${r.year}</span></div>
    <div class="map-popup-row"><span class="map-popup-key">População</span><span class="map-popup-val">${r.population ? fmtNum(r.population) : '—'}</span></div>
    <div class="map-popup-row"><span class="map-popup-key">Área</span><span class="map-popup-val">${r.area_km2 ? fmtNum(r.area_km2, 1) + ' km²' : '—'}</span></div>
    <div class="map-popup-row"><span class="map-popup-key">Densidade</span><span class="map-popup-val">${r.population_density ? fmtNum(r.population_density, 1) + ' /km²' : '—'}</span></div>
    <div class="map-popup-row"><span class="map-popup-key">Natalidade</span><span class="map-popup-val">${r.birth_rate ? fmtNum(r.birth_rate, 1) + ' ‰' : '—'}</span></div>
    <div class="map-popup-row"><span class="map-popup-key">Mortalidade</span><span class="map-popup-val">${r.death_rate ? fmtNum(r.death_rate, 1) + ' ‰' : '—'}</span></div>
    <div class="map-popup-row"><span class="map-popup-key">Desemprego</span><span class="map-popup-val">${r.unemployment_rate ? fmtNum(r.unemployment_rate, 1) + ' %' : '—'}</span></div>
    <div class="map-popup-row"><span class="map-popup-key">PIB per capita</span><span class="map-popup-val">${r.gdp_per_capita_eur ? fmtNum(r.gdp_per_capita_eur, 0) + ' €' : '—'}</span></div>
  `;
}

/** Render / refresh circle markers on the map */
function renderMapMarkers() {
  if (!_map || !_mapData.length) return;

  // Remove existing SVG overlay layers (CircleMarkers)
  _map.eachLayer(layer => {
    if (layer instanceof L.CircleMarker) _map.removeLayer(layer);
  });

  const layer = _mapLayer;
  const values = _mapData.map(r => {
    if (layer === 'population')   return r.population || 0;
    if (layer === 'density')      return r.population_density || 0;
    if (layer === 'unemployment') return r.unemployment_rate || 0;
    if (layer === 'gdp')          return r.gdp_per_capita_eur || 0;
    return 0;
  }).filter(v => v > 0);

  if (!values.length) return;

  const minV = Math.min(...values);
  const maxV = Math.max(...values);

  _mapData.forEach(r => {
    if (r.lat == null || r.lng == null) return;

    const rawVal = layer === 'population'   ? r.population
                 : layer === 'density'      ? r.population_density
                 : layer === 'unemployment' ? r.unemployment_rate
                 : layer === 'gdp'          ? r.gdp_per_capita_eur
                 : null;

    if (rawVal == null) return;

    const ratio = maxV > minV ? (rawVal - minV) / (maxV - minV) : 0.5;
    // For GDP, invert ratio (higher GDP = better → cyan)
    const colourRatio = layer === 'gdp' ? 1 - ratio : ratio;
    const colour = mapColour(colourRatio);

    // Radius: 10–40px scaled to value
    const radius = 10 + ratio * 30;

    const marker = L.circleMarker([r.lat, r.lng], {
      radius,
      fillColor:   colour,
      fillOpacity: 0.45,
      color:       colour,
      weight:      2,
      opacity:     0.9,
    });

    marker.bindPopup(buildPopup(r), { maxWidth: 260, minWidth: 220 });
    marker.bindTooltip(
      `<span style="font-family:'Share Tech Mono',monospace;font-size:.65rem;color:#00d4ff">${r.region_name}</span>`,
      { direction: 'top', offset: [0, -radius], className: 'map-tooltip' }
    );
    marker.addTo(_map);
  });

  updateMapLegend(layer, minV, maxV);
}

/** Update the legend strip below the map */
function updateMapLegend(layer, minV, maxV) {
  const el = document.getElementById('map-legend');
  if (!el) return;

  const LABELS = {
    population:   { title: 'População', unit: '',  fmt: v => fmt(v, 0) },
    density:      { title: 'Densidade', unit: ' /km²', fmt: v => fmt(v, 1) },
    unemployment: { title: 'Desemprego', unit: ' %', fmt: v => fmt(v, 1) },
    gdp:          { title: 'PIB pc', unit: ' €', fmt: v => fmt(v, 0) },
  };
  const lbl = LABELS[layer] || { title: layer, unit: '', fmt: v => v };

  // Build gradient CSS matching the colour ramp (inverted for GDP)
  const isGdp = layer === 'gdp';
  const gradStart = isGdp ? mapColour(1) : mapColour(0);
  const gradMid   = isGdp ? mapColour(0.5) : mapColour(0.5);
  const gradEnd   = isGdp ? mapColour(0) : mapColour(1);

  el.innerHTML = `
    <span class="map-legend-title">${lbl.title}</span>
    <div class="map-legend-scale">
      <span class="map-legend-min">${lbl.fmt(minV)}${lbl.unit}</span>
      <div class="map-legend-gradient" style="background:linear-gradient(90deg,${gradStart},${gradMid},${gradEnd})"></div>
      <span class="map-legend-max">${lbl.fmt(maxV)}${lbl.unit}</span>
    </div>
    <div class="map-legend-size-row">
      <span style="opacity:.6">Tamanho ∝ valor</span>
      <span class="map-legend-bubble" style="width:10px;height:10px;color:var(--cyan-dim)"></span>
      <span class="map-legend-bubble" style="width:18px;height:18px;color:var(--cyan)"></span>
      <span class="map-legend-bubble" style="width:28px;height:28px;color:var(--cyan)"></span>
    </div>
  `;
}

async function loadMap() {
  const mapEl = document.getElementById('portugal-map');
  if (!mapEl || typeof L === 'undefined') return;

  try {
    const res = await fetch('/api/map-data');
    if (!res.ok) throw new Error(res.statusText);
    _mapData = await res.json();

    if (!_mapData.length) return;

    // Initialise Leaflet map only once
    if (!_map) {
      _map = L.map('portugal-map', {
        center: [39.5, -8.0],
        zoom: 6,
        zoomControl: true,
        attributionControl: true,
      });

      // OpenStreetMap tile layer (dark cyberpunk look via CSS filter on the tile pane)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 18,
      }).addTo(_map);
    }

    renderMapMarkers();

    // Layer toggle buttons
    document.querySelectorAll('.map-layer-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.map-layer-btn').forEach(b => {
          b.classList.remove('active');
          b.setAttribute('aria-pressed', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
        _mapLayer = btn.dataset.layer;
        renderMapMarkers();
      });
    });

  } catch (err) {
    console.error('Map error:', err);
    showToast('⚠ Erro ao carregar mapa interativo');
  }
}

// ---------------------------------------------------------------------------
// Regional
// ---------------------------------------------------------------------------
let regPopChart, regGdpChart;

async function loadRegional() {
  try {
    const res = await fetch('/api/regional');
    if (!res.ok) throw new Error(res.statusText);
    const regions = await res.json();

    if (!regions.length) return;

    setText('reg-year', `Dados ${regions[0].year}`);

    // Table
    const tbody = document.getElementById('reg-tbody');
    if (tbody) {
      tbody.innerHTML = regions.map(r => `<tr>
        <td style="color:var(--text-primary);font-weight:600">${r.region_name}</td>
        <td style="color:var(--text-dim)">${r.region_code}</td>
        <td>${r.population ? fmt(r.population) : '—'}</td>
        <td>${r.area_km2 ? fmt(r.area_km2, 1) : '—'}</td>
        <td>${r.population_density ? fmt(r.population_density, 1) : '—'}</td>
        <td style="color:var(--green)">${r.birth_rate ? fmt(r.birth_rate, 1) : '—'}</td>
        <td style="color:var(--red)">${r.death_rate ? fmt(r.death_rate, 1) : '—'}</td>
        <td style="color:var(--orange)">${r.unemployment_rate ? fmt(r.unemployment_rate, 1) + ' %' : '—'}</td>
        <td style="color:var(--cyan)">${r.gdp_per_capita_eur ? fmt(r.gdp_per_capita_eur, 0) + ' €' : '—'}</td>
      </tr>`).join('');
    }

    // Chart labels: abbreviate long region names for readability
    const REGION_ABBREVIATIONS = {
      'Área Metropolitana de Lisboa': 'AM Lisboa',
      'Região Autónoma dos Açores':   'RA Açores',
      'Região Autónoma da Madeira':   'RA Madeira',
    };
    const labels = regions.map(r => REGION_ABBREVIATIONS[r.region_name] ?? r.region_name);
    const pops   = regions.map(r => r.population ? +(r.population / 1e6).toFixed(3) : 0);
    const gdps   = regions.map(r => r.gdp_per_capita_eur || 0);

    const CHART_COLORS = [CYAN, GREEN, ORANGE, PURPLE, RED, '#ffcc00', '#00ffcc'];
    // Cycle colors if more regions are added in the future
    const colors = regions.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]);

    const regPopCtx = document.getElementById('chart-reg-population');
    if (regPopCtx) {
      if (regPopChart) regPopChart.destroy();
      regPopChart = new Chart(regPopCtx, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'População (M)',
            data: pops,
            backgroundColor: colors.map(c => c + '88'),
            borderColor: colors,
            borderWidth: 1,
          }],
        },
        options: { ...chartOptions('Milhões'), plugins: { legend: { display: false } } },
      });
    }

    const regGdpCtx = document.getElementById('chart-reg-gdp');
    if (regGdpCtx) {
      if (regGdpChart) regGdpChart.destroy();
      regGdpChart = new Chart(regGdpCtx, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'PIB per capita (€)',
            data: gdps,
            backgroundColor: colors.map(c => c + '88'),
            borderColor: colors,
            borderWidth: 1,
          }],
        },
        options: { ...chartOptions('€'), plugins: { legend: { display: false } } },
      });
    }

  } catch (err) {
    console.error('Regional error:', err);
    showToast('⚠ Erro ao carregar dados regionais');
  }
}

// ---------------------------------------------------------------------------
// Financial
// ---------------------------------------------------------------------------
let gdpChart, unemployChart;

async function loadFinancial() {
  try {
    const res = await fetch('/api/financial');
    if (!res.ok) throw new Error(res.statusText);
    const { latest, history } = await res.json();

    setText('fin-gdp',   latest.gdp_nominal_eur  ? fmt(latest.gdp_nominal_eur, 1)  + ' B€' : '—');
    setText('fin-gdppc', latest.gdp_per_capita_eur ? fmt(latest.gdp_per_capita_eur, 0) + ' €' : '—');
    setText('fin-unemp', latest.unemployment_rate  ? fmt(latest.unemployment_rate, 1)  + ' %' : '—');
    setText('fin-infl',  latest.inflation_rate     ? fmt(latest.inflation_rate, 1)     + ' %' : '—');
    setText('fin-debt',  latest.public_debt_pct_gdp ? fmt(latest.public_debt_pct_gdp, 1) + ' %' : '—');
    setText('fin-year',  latest.year ? `Dados ${latest.year}` : '');

    const years = history.map(r => r.year);

    // GDP chart
    const gdps   = history.map(r => r.gdp_nominal_eur);
    const gdpCtx = document.getElementById('chart-gdp');
    if (gdpCtx) {
      if (gdpChart) gdpChart.destroy();
      gdpChart = new Chart(gdpCtx, {
        type: 'line',
        data: { labels: years, datasets: [lineDataset('PIB (B€)', gdps, ORANGE)] },
        options: chartOptions('B€'),
      });
    }

    // Unemployment + inflation
    const unemp = history.map(r => r.unemployment_rate);
    const infl  = history.map(r => r.inflation_rate);
    const uiCtx = document.getElementById('chart-unemployment');
    if (uiCtx) {
      if (unemployChart) unemployChart.destroy();
      unemployChart = new Chart(uiCtx, {
        type: 'line',
        data: {
          labels: years,
          datasets: [
            lineDataset('Desemprego (%)', unemp, RED),
            lineDataset('Inflação (%)', infl, PURPLE),
          ],
        },
        options: chartOptions('%'),
      });
    }

  } catch (err) {
    console.error('Financial error:', err);
    showToast('⚠ Erro ao carregar dados financeiros');
  }
}

// ---------------------------------------------------------------------------
// Political
// ---------------------------------------------------------------------------
async function loadPolitical() {
  try {
    const res = await fetch('/api/political');
    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();

    setText('pol-name',       data.official_name);
    setText('pol-capital',    data.capital);
    setText('pol-govt',       data.government_type);
    setText('pol-president',  data.president);
    setText('pol-pm',         data.prime_minister);
    setText('pol-party',      data.ruling_party);
    setText('pol-seats',      data.parliament_seats);
    setText('pol-eu',         data.eu_member_since ? `Desde ${data.eu_member_since}` : '—');
    setText('pol-nato',       data.nato_member ? 'Membro' : 'Não membro');

  } catch (err) {
    console.error('Political error:', err);
    showToast('⚠ Erro ao carregar dados políticos');
  }
}

// ---------------------------------------------------------------------------
// Import log
// ---------------------------------------------------------------------------
async function loadImportLog() {
  try {
    const res = await fetch('/api/import-logs?limit=10');
    if (!res.ok) throw new Error(res.statusText);
    const logs = await res.json();
    const tbody = document.getElementById('log-tbody');
    if (!tbody) return;

    if (!logs.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="color:var(--text-dim);text-align:center">Sem registos.</td></tr>';
      return;
    }

    tbody.innerHTML = logs.map(l => {
      const badge = `<span class="badge badge-${l.status}">${l.status}</span>`;
      const date  = new Date(l.ran_at).toLocaleString('pt-PT');
      return `<tr>
        <td>${l.source_name}</td>
        <td>${badge}</td>
        <td>${l.records_imported}</td>
        <td style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${l.message || '—'}</td>
        <td>${date}</td>
      </tr>`;
    }).join('');

  } catch (err) {
    console.error('Log error:', err);
  }
}

// ---------------------------------------------------------------------------
// Debt purchases
// ---------------------------------------------------------------------------
let debtPurchasesChart, debtYieldChart;

async function loadDebtPurchases() {
  try {
    const res = await fetch('/api/debt-purchases');
    if (!res.ok) throw new Error(res.statusText);
    const records = await res.json();

    // ── Table ────────────────────────────────────────────────────────────
    const tbody = document.getElementById('debt-tbody');
    if (tbody) {
      if (!records.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="color:var(--text-dim);text-align:center">Sem registos.</td></tr>';
      } else {
        tbody.innerHTML = records.map(r => `<tr>
          <td>${r.year}</td>
          <td><span class="badge badge-success">${r.instrument}</span></td>
          <td>${r.amount_eur_bn !== null ? fmt(r.amount_eur_bn, 1) + ' B€' : '—'}</td>
          <td>${r.maturity_years !== null ? fmt(r.maturity_years, 1) : '—'}</td>
          <td>${r.avg_yield_pct !== null ? fmt(r.avg_yield_pct, 2) + ' %' : '—'}</td>
          <td>${r.purchaser_type || '—'}</td>
        </tr>`).join('');
      }
    }

    // ── Charts ───────────────────────────────────────────────────────────
    // Collect unique years and instruments
    const years = [...new Set(records.map(r => r.year))].sort((a, b) => a - b);
    const instruments = [...new Set(records.map(r => r.instrument))].sort();

    const INSTR_COLORS = { OT: ORANGE, BT: CYAN };

    // Bar chart: amount by year per instrument
    const purchasesCtx = document.getElementById('chart-debt-purchases');
    if (purchasesCtx) {
      if (debtPurchasesChart) debtPurchasesChart.destroy();
      const datasets = instruments.map(inst => {
        const color = INSTR_COLORS[inst] || RED;
        const data = years.map(yr => {
          const row = records.find(r => r.year === yr && r.instrument === inst);
          return row ? row.amount_eur_bn : null;
        });
        return barDataset(inst, data, color);
      });
      debtPurchasesChart = new Chart(purchasesCtx, {
        type: 'bar',
        data: { labels: years, datasets },
        options: chartOptions('B€'),
      });
    }

    // Line chart: avg yield by year per instrument
    const yieldCtx = document.getElementById('chart-debt-yield');
    if (yieldCtx) {
      if (debtYieldChart) debtYieldChart.destroy();
      const datasets = instruments.map(inst => {
        const color = INSTR_COLORS[inst] || RED;
        const data = years.map(yr => {
          const row = records.find(r => r.year === yr && r.instrument === inst);
          return row ? row.avg_yield_pct : null;
        });
        return lineDataset(inst, data, color);
      });
      debtYieldChart = new Chart(yieldCtx, {
        type: 'line',
        data: { labels: years, datasets },
        options: chartOptions('%'),
      });
    }

  } catch (err) {
    console.error('Debt purchases error:', err);
    showToast('⚠ Erro ao carregar dados de compras de dívida');
  }
}

// ---------------------------------------------------------------------------
// Sync button
// ---------------------------------------------------------------------------
document.getElementById('btn-sync')?.addEventListener('click', async () => {
  const btn = document.getElementById('btn-sync');
  btn.disabled = true;
  btn.textContent = '⟳ A sincronizar…';
  showToast('⟳ Sincronização iniciada…', 10000);
  try {
    const res = await fetch('/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const results = await res.json();
    const ok = results.every(r => r.status === 'success');
    showToast(ok ? '✅ Dados sincronizados com sucesso' : '⚠ Sincronização parcial — ver log');
    await Promise.all([loadMap(), loadDemographics(), loadRegional(), loadFinancial(), loadPolitical(), loadImportLog()]);
  } catch (err) {
    showToast('❌ Erro na sincronização: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '⟳ SINCRONIZAR';
  }
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
(async () => {
  await Promise.all([
    loadMap(),
    loadDemographics(),
    loadRegional(),
    loadFinancial(),
    loadPolitical(),
    loadImportLog(),
    loadDebtPurchases(),
  ]);
})();
