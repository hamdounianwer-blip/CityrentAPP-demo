// ════════════════════════════════════════════════════════════════════
// module-depreciation.js — Amortissement des immobilisations (#4 de la
// roadmap comptabilité)
// ════════════════════════════════════════════════════════════════════
// Ajoute à chaque véhicule (DB.vehicles) trois champs optionnels :
//   usefulLifeYears  (durée de vie utile, défaut 5 ans)
//   residualValue    (valeur résiduelle, défaut 0)
//   (la méthode est fixe : linéaire — pas de champ dédié pour l'instant,
//    cf. note plus bas si une méthode dégressive est un jour nécessaire)
//
// Persistance : ces champs vivent directement sur l'objet véhicule, donc
// sauvegardés automatiquement par saveVehicle() (core.js, déjà utilisé
// pour purchasePrice/purchaseDate) — AUCUNE route serveur à ajouter,
// même logique que module-chart-of-accounts.js pour accountCode.
//
// Calcul : calculateVehicleDepreciation(v) est exportée sur window et
// volontairement autonome (ne dépend d'aucun autre module) — elle sera
// réutilisée telle quelle pour le Bilan (#9 de la roadmap, qui a besoin
// de la valeur nette comptable des véhicules côté Actif).
//
// UI : nouvelle sous-section "🏭 Amortissement" ajoutée sous le tableau
// ROI existant (Revenue Stats → ROI) — ne modifie ni calculateRoiStats()
// ni renderRoiStats(), pour ne prendre aucun risque sur le ROI cash déjà
// en production. Chargé APRÈS module-chart-of-accounts.js (voir tableau
// `modules` dans app.html) : redéfinit switchRevenueTab() une 3e fois
// pour brancher le rendu sur l'onglet ROI, même technique de chaînage.
// ════════════════════════════════════════════════════════════════════

var DEFAULT_USEFUL_LIFE_YEARS = 5;
var DEFAULT_RESIDUAL_VALUE = 0;

// ── Amortissement linéaire d'un véhicule, à une date de référence donnée
// (aujourd'hui par défaut). Ne modifie jamais l'objet véhicule — pure
// fonction de calcul, appelable en boucle sans effet de bord. ──
function calculateVehicleDepreciation(v, asOfDate) {
  var purchasePrice = Number(v.purchasePrice || 0);
  var purchaseDate = v.purchaseDate || '';

  var usefulLifeYears = Number(v.usefulLifeYears);
  if (!usefulLifeYears || usefulLifeYears <= 0) usefulLifeYears = DEFAULT_USEFUL_LIFE_YEARS;

  var residualValue = Number(v.residualValue);
  if (isNaN(residualValue) || residualValue < 0) residualValue = DEFAULT_RESIDUAL_VALUE;
  if (residualValue > purchasePrice) residualValue = purchasePrice; // garde-fou : jamais > prix d'achat

  var depreciableBase = Math.max(0, purchasePrice - residualValue);
  var annualDepreciation = depreciableBase / usefulLifeYears;
  var monthlyDepreciation = annualDepreciation / 12;

  var monthsOwned = 0;
  if (purchasePrice > 0 && purchaseDate) {
    var pd = new Date(purchaseDate);
    var ref = asOfDate ? new Date(asOfDate) : new Date();
    if (!isNaN(pd.getTime()) && ref > pd) {
      monthsOwned = (ref.getFullYear() - pd.getFullYear()) * 12 + (ref.getMonth() - pd.getMonth());
      if (ref.getDate() < pd.getDate()) monthsOwned -= 1; // mois en cours pas encore complet
      if (monthsOwned < 0) monthsOwned = 0;
    }
  }

  var maxMonths = usefulLifeYears * 12;
  var billableMonths = Math.min(monthsOwned, maxMonths);
  var accumulatedDepreciation = monthlyDepreciation * billableMonths;
  if (accumulatedDepreciation > depreciableBase) accumulatedDepreciation = depreciableBase;
  var netBookValue = purchasePrice - accumulatedDepreciation;

  return {
    usefulLifeYears: usefulLifeYears,
    residualValue: residualValue,
    annualDepreciation: annualDepreciation,
    monthlyDepreciation: monthlyDepreciation,
    monthsOwned: monthsOwned,
    accumulatedDepreciation: accumulatedDepreciation,
    netBookValue: netBookValue,
    fullyDepreciated: maxMonths > 0 && billableMonths >= maxMonths
  };
}
window.calculateVehicleDepreciation = calculateVehicleDepreciation;

// ── Modifie usefulLifeYears / residualValue sur un véhicule et persiste
// (réutilise saveVehicle() déjà défini dans core.js — même mécanisme que
// le reste des champs véhicule). ──
function setVehicleDepreciationParam(vehicleId, field, rawValue) {
  if (field !== 'usefulLifeYears' && field !== 'residualValue') return;
  var v = (DB.vehicles || []).find(function (x) { return x.id === vehicleId; });
  if (!v) return;
  var value = parseFloat(rawValue);
  if (isNaN(value) || value < 0) value = 0;
  if (field === 'usefulLifeYears' && value <= 0) value = DEFAULT_USEFUL_LIFE_YEARS;
  v[field] = value;
  if (typeof saveVehicle === 'function') saveVehicle(vehicleId);
  if (typeof showToast === 'function') {
    var fieldLabel = (typeof translate === 'function' && translate('dep.' + field) !== 'dep.' + field)
      ? translate('dep.' + field)
      : (field === 'usefulLifeYears' ? 'Useful life' : 'Residual value');
    showToast('✅ ' + (v.name || v.plate || '') + ' — ' + fieldLabel + ' = ' + value);
  }
  renderDepreciationStats();
}
window.setVehicleDepreciationParam = setVehicleDepreciationParam;

// ── calculateDepreciationStats — même source revenu/dépenses que
// calculateRoiStats() (module-revenue-stats.js), pour rester cohérent
// avec les chiffres déjà affichés dans l'onglet ROI. ──
function calculateDepreciationStats() {
  var data = (typeof DB !== 'undefined' && DB) ? DB : (window._data || window.data || {});
  var payments = data.payments || [];
  var rentals = data.rentals || [];
  var vehicles = data.vehicles || [];
  var depence = data.depence || [];

  var revenueStats = (typeof calculateVehicleStats === 'function') ? calculateVehicleStats(payments, rentals, vehicles, 'all') : { vehicles: [] };
  var expenseData = (typeof calculateExpensesByPlate === 'function') ? calculateExpensesByPlate(depence, vehicles) : { byPlate: {} };
  var revByPlate = {};
  (revenueStats.vehicles || []).forEach(function (v) { revByPlate[v.plate] = v; });

  var rows = (vehicles || []).map(function (v) {
    var plate = (typeof normalizePlateGlobal === 'function') ? normalizePlateGlobal(v.plate || '') : (v.plate || '');
    var purchasePrice = Number(v.purchasePrice || 0);
    var revenue = (revByPlate[plate] && revByPlate[plate].revenue) || 0;
    var expenses = (expenseData.byPlate[plate] && expenseData.byPlate[plate].expenses) || 0;
    var dep = calculateVehicleDepreciation(v);

    // Profit comptable : contrairement au ROI cash (qui décaisse tout le
    // prix d'achat dès le jour 1), seule la dotation cumulée à date est
    // comptée en charge — le reste du prix d'achat reste un actif (VNC).
    var accountingProfit = revenue - expenses - dep.accumulatedDepreciation;
    var accountingCost = expenses + dep.accumulatedDepreciation;
    var accountingRoiPct = accountingCost > 0 ? (accountingProfit / accountingCost) * 100 : (revenue > 0 ? 100 : 0);

    return {
      id: v.id, plate: plate, name: v.name || plate, purchasePrice: purchasePrice,
      usefulLifeYears: dep.usefulLifeYears, residualValue: dep.residualValue,
      annualDepreciation: dep.annualDepreciation, accumulatedDepreciation: dep.accumulatedDepreciation,
      netBookValue: dep.netBookValue, fullyDepreciated: dep.fullyDepreciated,
      revenue: revenue, expenses: expenses,
      accountingProfit: accountingProfit, accountingRoiPct: accountingRoiPct
    };
  }).sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });

  var totals = rows.reduce(function (s, r) {
    s.purchasePrice += r.purchasePrice; s.accumulatedDepreciation += r.accumulatedDepreciation;
    s.netBookValue += r.netBookValue; s.accountingProfit += r.accountingProfit;
    s.expenses += r.expenses; s.revenue += r.revenue;
    return s;
  }, { purchasePrice: 0, accumulatedDepreciation: 0, netBookValue: 0, accountingProfit: 0, expenses: 0, revenue: 0 });
  var totalAccountingCost = totals.expenses + totals.accumulatedDepreciation;
  totals.accountingRoiPct = totalAccountingCost > 0 ? (totals.accountingProfit / totalAccountingCost) * 100 : 0;

  return { vehicles: rows, totals: totals };
}
window.calculateDepreciationStats = calculateDepreciationStats;

var g_lastDepreciationStats = null;

function renderDepreciationStats() {
  var stats = calculateDepreciationStats();
  g_lastDepreciationStats = stats;
  var t = function (k, d) { return (typeof translate === 'function' && translate(k) !== k) ? translate(k) : d; };

  var summaryEl = document.getElementById('depreciation-summary');
  if (summaryEl) {
    summaryEl.innerHTML =
      '<div class="stat-card blue"><div class="stat-label">' + t('rev.totalPurchaseCost', 'Total Purchase Cost') + '</div><div class="stat-val">' + fmtNum(stats.totals.purchasePrice) + ' <span style="font-size:.9rem">OMR</span></div></div>' +
      '<div class="stat-card red"><div class="stat-label">' + t('dep.accumulatedDepreciation', 'Accumulated Depreciation') + '</div><div class="stat-val">' + fmtNum(stats.totals.accumulatedDepreciation) + ' <span style="font-size:.9rem">OMR</span></div></div>' +
      '<div class="stat-card blue"><div class="stat-label">' + t('dep.netBookValue', 'Net Book Value') + '</div><div class="stat-val">' + fmtNum(stats.totals.netBookValue) + ' <span style="font-size:.9rem">OMR</span></div></div>' +
      '<div class="stat-card ' + (stats.totals.accountingProfit >= 0 ? 'green' : 'red') + '"><div class="stat-label">' + t('dep.accountingProfit', 'Accounting Profit') + '</div><div class="stat-val" style="color:' + (stats.totals.accountingProfit >= 0 ? 'var(--green)' : 'var(--red)') + '">' + fmtNum(stats.totals.accountingProfit) + ' <span style="font-size:.9rem">OMR</span></div></div>' +
      '<div class="stat-card purple"><div class="stat-label">' + t('dep.accountingRoi', 'Accounting ROI') + '</div><div class="stat-val">' + stats.totals.accountingRoiPct.toFixed(1) + ' <span style="font-size:.9rem">%</span></div></div>';
  }

  var tbody = document.getElementById('depreciation-tbody');
  var html = '';
  stats.vehicles.forEach(function (v) {
    var noPurchase = v.purchasePrice <= 0;
    var profitColor = v.accountingProfit >= 0 ? 'var(--green)' : 'var(--red)';
    html += '<tr>' +
      '<td><span class="badge badge-blue">' + escapeHtml(v.name) + '</span></td>' +
      '<td style="font-family:var(--mono);font-weight:700">' + escapeHtml(v.plate) + '</td>' +
      '<td>' + (noPurchase ? '<span style="color:var(--muted);font-style:italic">' + t('rev.noPurchasePrice', 'not set') + '</span>' : fmtNum(v.purchasePrice) + ' OMR') + '</td>' +
      '<td>' + (noPurchase ? '—' : '<input type="number" min="1" step="1" value="' + v.usefulLifeYears + '" onchange="setVehicleDepreciationParam(' + v.id + ',\'usefulLifeYears\',this.value)" style="width:60px;padding:3px 6px;border-radius:6px;border:1px solid var(--border);background:var(--s1);color:var(--text)">') + '</td>' +
      '<td>' + (noPurchase ? '—' : '<input type="number" min="0" step="0.001" value="' + v.residualValue + '" onchange="setVehicleDepreciationParam(' + v.id + ',\'residualValue\',this.value)" style="width:80px;padding:3px 6px;border-radius:6px;border:1px solid var(--border);background:var(--s1);color:var(--text)">') + '</td>' +
      '<td>' + fmtNum(v.annualDepreciation) + ' OMR</td>' +
      '<td style="color:var(--red)">' + fmtNum(v.accumulatedDepreciation) + ' OMR' + (v.fullyDepreciated ? ' <span title="' + t('dep.fullyDepreciated', 'Fully depreciated') + '">🏁</span>' : '') + '</td>' +
      '<td style="font-weight:700">' + fmtNum(v.netBookValue) + ' OMR</td>' +
      '<td style="font-weight:700;color:' + profitColor + '">' + fmtNum(v.accountingProfit) + ' OMR</td>' +
      '<td style="font-weight:800;color:' + profitColor + '">' + (noPurchase ? '—' : v.accountingRoiPct.toFixed(1) + ' %') + '</td>' +
    '</tr>';
  });
  if (tbody) tbody.innerHTML = html || '<tr><td colspan="10" class="rev-empty">' + t('rev.noDataMatchingFilter', 'No data') + '</td></tr>';
}
window.renderDepreciationStats = renderDepreciationStats;

function exportDepreciationCSV() {
  if (!g_lastDepreciationStats) return;
  var rows = [['Vehicle', 'Plate', 'Purchase Price (OMR)', 'Useful Life (yrs)', 'Residual Value (OMR)', 'Annual Depreciation (OMR)', 'Accumulated Depreciation (OMR)', 'Net Book Value (OMR)', 'Accounting Profit (OMR)', 'Accounting ROI (%)']];
  g_lastDepreciationStats.vehicles.forEach(function (v) {
    rows.push([
      v.name, v.plate, v.purchasePrice.toFixed(2), v.usefulLifeYears, v.residualValue.toFixed(2),
      v.annualDepreciation.toFixed(2), v.accumulatedDepreciation.toFixed(2), v.netBookValue.toFixed(2),
      v.accountingProfit.toFixed(2), v.accountingRoiPct.toFixed(1)
    ]);
  });
  rows.push([]);
  rows.push(['TOTAL', '', g_lastDepreciationStats.totals.purchasePrice.toFixed(2), '', '',
    '', g_lastDepreciationStats.totals.accumulatedDepreciation.toFixed(2), g_lastDepreciationStats.totals.netBookValue.toFixed(2),
    g_lastDepreciationStats.totals.accountingProfit.toFixed(2), g_lastDepreciationStats.totals.accountingRoiPct.toFixed(1)]);

  var csv = rows.map(function (r) {
    return r.map(function (cell) {
      var s = String(cell === undefined || cell === null ? '' : cell);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(',');
  }).join('\r\n');

  var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'depreciation_' + new Date().toISOString().split('T')[0] + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
window.exportDepreciationCSV = exportDepreciationCSV;

// ═══════════════════════ INTÉGRATION ONGLET ROI ═══════════════════════
// Redéfinition COMPLÈTE de switchRevenueTab() — 3e couche après
// module-revenue-stats.js (original) et module-chart-of-accounts.js
// (ajout branche "accounting"). Identique à cette dernière + un appel à
// renderDepreciationStats() dans la branche "roi", pour que le tableau
// d'amortissement se peuple en même temps que le tableau ROI existant.
function switchRevenueTab(tab) {
  g_revenueTab = tab;
  document.querySelectorAll('#page-revenue-stats .mod-pill').forEach(function (c) { c.classList.remove('on', 'active'); });
  var tabBtn = document.getElementById('tab-' + tab);
  if (tabBtn) tabBtn.classList.add('on');

  var summaryBar = document.getElementById('revenue-summary');
  if (summaryBar) summaryBar.style.display = (tab === 'daily' || tab === 'monthly' || tab === 'yearly') ? 'flex' : 'none';

  document.getElementById('revenue-daily-section').style.display = tab === 'daily' ? 'block' : 'none';
  document.getElementById('revenue-monthly-section').style.display = tab === 'monthly' ? 'block' : 'none';
  document.getElementById('revenue-yearly-section').style.display = tab === 'yearly' ? 'block' : 'none';
  document.getElementById('revenue-vehicle-section').style.display = tab === 'vehicle' ? 'block' : 'none';
  document.getElementById('revenue-profit-section').style.display = tab === 'profit' ? 'block' : 'none';
  var catSection = document.getElementById('revenue-category-section');
  if (catSection) catSection.style.display = tab === 'category' ? 'block' : 'none';
  var ovSection = document.getElementById('revenue-overview-section');
  if (ovSection) ovSection.style.display = tab === 'overview' ? 'block' : 'none';
  var roiSection = document.getElementById('revenue-roi-section');
  if (roiSection) roiSection.style.display = tab === 'roi' ? 'block' : 'none';
  var accSection = document.getElementById('revenue-accounting-section');
  if (accSection) accSection.style.display = tab === 'accounting' ? 'block' : 'none';

  if (tab === 'overview') {
    renderOverviewStats();
  } else if (tab === 'roi') {
    renderRoiStats();
    renderDepreciationStats();
  } else if (tab === 'category') {
    renderCategoryStats();
  } else if (tab === 'accounting') {
    renderAccountingStats();
  } else if (tab === 'yearly') {
    populateYearSelects();
    renderYearlyStats();
  } else if (tab === 'vehicle') {
    populateVehicleSelect();
    var monthInput = document.getElementById('vehicle-month-from');
    if (monthInput && !monthInput.value) {
      var now1 = new Date();
      monthInput.value = now1.getFullYear() + '-' + String(now1.getMonth() + 1).padStart(2, '0');
    }
    renderVehicleStats();
  } else if (tab === 'profit') {
    var pMonthInput = document.getElementById('profit-month-from');
    var pMonthInputTo = document.getElementById('profit-month-to');
    if (pMonthInput && !pMonthInput.value) {
      var now2 = new Date();
      var cur = now2.getFullYear() + '-' + String(now2.getMonth() + 1).padStart(2, '0');
      pMonthInput.value = cur;
      if (pMonthInputTo) pMonthInputTo.value = cur;
    }
    renderProfitStats();
  } else {
    renderRevenueStats();
  }
}
window.switchRevenueTab = switchRevenueTab;
