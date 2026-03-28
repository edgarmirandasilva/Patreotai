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
    setText('dem-year', latest.year ? `Dados ${latest.year}` : '');

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

    const INSTR_COLORS = { OT: ORANGE, BT: CYAN, OTRV: GREEN, MTN: PURPLE };

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
    await Promise.all([loadDemographics(), loadFinancial(), loadPolitical(), loadImportLog(), loadDebtPurchases()]);
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
    loadDemographics(),
    loadFinancial(),
    loadPolitical(),
    loadImportLog(),
    loadDebtPurchases(),
  ]);
})();
