// ════════════════════════════════════════════════════════════════════
// module-chart-of-accounts.js — Plan Comptable & Compte de Résultat
// ════════════════════════════════════════════════════════════════════
// Ajoute un plan comptable simplifié à CityRent App :
//  1) Chaque catégorie de dépense (DB.depenceCategories) peut être
//     rattachée à un compte comptable (accountCode) — assignable
//     depuis Dépenses → Fleet & Types (même endroit que scope/nom).
//  2) Les 5 catégories fixes de revenu (rent/petrol/extraKm/extraTime/
//     carwash, déjà calculées par calculateCategoryStats() dans
//     module-revenue-stats.js) sont mappées vers des comptes Produits.
//  3) Un nouvel onglet "Compte de Résultat" dans Revenue Stats agrège
//     tout ça par compte, avec export CSV.
//
// Chargé APRÈS module-depence.js et module-revenue-stats.js (voir
// tableau `modules` dans app.html) — ce fichier redéfinit certaines
// fonctions globales de ces deux modules (même technique que
// module-revenue-stats.js qui patche déjà window.goTo).
//
// Persistance : accountCode vit directement sur chaque objet de
// DB.depenceCategories, donc il est sauvegardé automatiquement par
// saveDepenceCategories() (core.js) — AUCUNE route serveur à ajouter.
// Le plan comptable lui-même (CHART_OF_ACCOUNTS ci-dessous) est une
// constante JS : pour ajouter/renommer un compte, éditer ce tableau.
// ════════════════════════════════════════════════════════════════════

// ═══════════════════════ PLAN COMPTABLE (éditable) ═══════════════════════
var CHART_OF_ACCOUNTS = [
  // — Produits —
  { code: '704000', name: 'Produits de location de véhicules', family: 'produits' },
  { code: '706000', name: 'Refacturation carburant', family: 'produits' },
  { code: '707000', name: 'Refacturation kilométrage supplémentaire', family: 'produits' },
  { code: '707100', name: 'Refacturation heures supplémentaires', family: 'produits' },
  { code: '708000', name: 'Refacturation lavage / divers', family: 'produits' },
  // — Charges d'exploitation —
  { code: '606100', name: 'Carburant', family: 'charges_exploitation' },
  { code: '615500', name: 'Entretien et réparations véhicules', family: 'charges_exploitation' },
  { code: '613000', name: 'Locations diverses / leasing', family: 'charges_exploitation' },
  { code: '616000', name: 'Assurances véhicules', family: 'charges_exploitation' },
  { code: '618100', name: 'Documents administratifs (Mulkiya, permis...)', family: 'charges_exploitation' },
  { code: '622600', name: 'Lavage / nettoyage véhicules', family: 'charges_exploitation' },
  { code: '625100', name: 'Frais de déplacement / transport', family: 'charges_exploitation' },
  { code: '626000', name: 'Télécommunications / GPS', family: 'charges_exploitation' },
  { code: '635000', name: 'Taxes et impôts divers', family: 'charges_exploitation' },
  // — Charges de personnel —
  { code: '641000', name: 'Salaires et traitements', family: 'charges_personnel' },
  { code: '645000', name: 'Charges sociales', family: 'charges_personnel' },
  // — Charges financières —
  { code: '661000', name: 'Frais bancaires et intérêts', family: 'charges_financieres' },
  { code: '667000', name: 'Frais sur chèques rejetés', family: 'charges_financieres' },
  // — Immobilisations —
  { code: '218200', name: "Véhicules (valeur d'achat)", family: 'immobilisations' },
  { code: '281800', name: 'Amortissements cumulés véhicules', family: 'immobilisations' }
];
window.CHART_OF_ACCOUNTS = CHART_OF_ACCOUNTS;

var UNCLASSIFIED_ACCOUNT = { code: 'UNCLASSIFIED', name: 'Non classé', family: 'non_classe' };

// Mapping FIXE des 5 catégories de revenu déjà calculées par
// calculateCategoryStats() (module-revenue-stats.js) vers des comptes Produits.
var REVENUE_CATEGORY_ACCOUNTS = {
  rent: '704000',
  petrol: '706000',
  extraKm: '707000',
  extraTime: '707100',
  carwash: '708000'
};
window.REVENUE_CATEGORY_ACCOUNTS = REVENUE_CATEGORY_ACCOUNTS;

function accountByCode(code) {
  if (!code) return UNCLASSIFIED_ACCOUNT;
  var found = CHART_OF_ACCOUNTS.find(function (a) { return a.code === code; });
  return found || UNCLASSIFIED_ACCOUNT;
}
window.accountByCode = accountByCode;

// ═══════════════════════ CATÉGORIES DÉPENSE ↔ COMPTE ═══════════════════════
// Assigne/retire le compte comptable d'une catégorie de dépense et persiste
// (réutilise saveDepenceCategories() déjà défini dans core.js).
function setDepCategoryAccount(categoryName, accountCode) {
  var cat = (DB.depenceCategories || []).find(function (c) { return c.name === categoryName; });
  if (!cat) return;
  cat.accountCode = accountCode || '';
  if (typeof saveDepenceCategories === 'function') saveDepenceCategories();
  if (typeof showToast === 'function') {
    showToast('✅ ' + categoryName + ' → ' + (accountCode ? accountByCode(accountCode).name : 'Non classé'));
  }
}
window.setDepCategoryAccount = setDepCategoryAccount;

// Écoute déléguée (indépendante de l'IIFE de module-depence.js) pour le
// <select data-coa-select> injecté sur chaque pastille de catégorie.
document.addEventListener('change', function (e) {
  var sel = e.target.closest('[data-coa-select]');
  if (!sel) return;
  setDepCategoryAccount(sel.dataset.name, sel.value);
});

function _coaAccountOptionsHtml(selectedCode) {
  var opts = '<option value="">— Compte —</option>';
  var byFamily = {};
  CHART_OF_ACCOUNTS.forEach(function (a) {
    (byFamily[a.family] = byFamily[a.family] || []).push(a);
  });
  var familyLabels = {
    produits: 'Produits', charges_exploitation: "Charges d'exploitation",
    charges_personnel: 'Charges de personnel', charges_financieres: 'Charges financières',
    immobilisations: 'Immobilisations'
  };
  Object.keys(familyLabels).forEach(function (fam) {
    if (!byFamily[fam]) return;
    opts += '<optgroup label="' + familyLabels[fam] + '">';
    byFamily[fam].forEach(function (a) {
      opts += '<option value="' + a.code + '"' + (a.code === selectedCode ? ' selected' : '') + '>' + a.code + ' — ' + escapeHtml(a.name) + '</option>';
    });
    opts += '</optgroup>';
  });
  return opts;
}

// Redéfinition COMPLÈTE de renderDepCategoryList() (module-depence.js) :
// même rendu que l'original + un <select> de compte comptable par catégorie.
function renderDepCategoryList() {
  var container = document.getElementById('depCategoryListContainer');
  if (!container) return;
  var cats = DB.depenceCategories || [];
  container.innerHTML = cats.map(function (c) {
    var safe = escapeHtml(c.name);
    var scopeClass = c.scope === 'vehicle' ? 'dpc-badge-vehicle'
      : c.scope === 'general' ? 'dpc-badge-general'
      : 'dpc-badge-both';
    var accBorder = c.accountCode ? 'var(--border)' : '#dc2626';
    return '<div style="display:flex;align-items:center;gap:8px;padding:6px 12px;border-radius:999px;border:1px solid var(--dpc-line, var(--border));background:rgba(0,0,0,.02);font-size:.82rem;flex-wrap:wrap">'
      + '<span>' + safe + '</span>'
      + '<span class="dpc-badge ' + scopeClass + '" data-dep-action="cycle-scope" data-name="' + safe + '" style="cursor:pointer">' + depScopeLabel(c.scope) + '</span>'
      + '<select data-coa-select data-name="' + safe + '" title="Compte comptable" style="font-size:.72rem;padding:2px 6px;border-radius:6px;border:1px solid ' + accBorder + ';background:var(--s1);color:var(--text);max-width:230px">'
        + _coaAccountOptionsHtml(c.accountCode) +
      '</select>'
      + '<button type="button" data-dep-action="cycle-scope" data-name="' + safe + '" title="' + (typeof translate === 'function' && translate('dep.changeScope') || 'Change scope') + '" style="opacity:.5;cursor:pointer;background:none;border:none">✏️</button>'
      + (cats.length > 1 ? '<button type="button" data-dep-action="remove-category" data-name="' + safe + '" style="opacity:.5;cursor:pointer;background:none;border:none;color:#dc2626">✕</button>' : '')
      + '</div>';
  }).join('') || ('<div class="dpc-empty-state"><i class="fa-solid fa-layer-group"></i><p>' + (typeof translate === 'function' && translate('dep.noCategories') || 'No categories yet') + '</p></div>');

  // Alimente aussi le <select> "compte" du formulaire d'ajout de catégorie.
  var addSel = document.getElementById('depNewCategoryAccount');
  if (addSel && !addSel.dataset.coaFilled) {
    addSel.innerHTML = _coaAccountOptionsHtml('');
    addSel.dataset.coaFilled = '1';
  }
}
window.renderDepCategoryList = renderDepCategoryList;

// Redéfinition COMPLÈTE de handleAddDepCategory() (module-depence.js) :
// même comportement que l'original + capture le compte choisi à la création.
function handleAddDepCategory(e) {
  var input = document.getElementById('depNewCategoryName');
  var scopeSelect = document.getElementById('depNewCategoryScope');
  var accSelect = document.getElementById('depNewCategoryAccount');
  var name = input.value.trim();
  if (!name) return;
  if ((DB.depenceCategories || []).some(function (c) { return c.name.toLowerCase() === name.toLowerCase(); })) {
    alert(typeof translate === 'function' && translate('dep.categoryExists') || 'This category already exists.');
    return;
  }
  DB.depenceCategories = DB.depenceCategories || [];
  DB.depenceCategories.push({ name: name, scope: scopeSelect.value, accountCode: accSelect ? accSelect.value : '' });
  saveDepenceCategories();
  refreshDepCategoryUI();
  input.value = '';
  if (accSelect) accSelect.value = '';
}
window.handleAddDepCategory = handleAddDepCategory;

// ═══════════════════════ COMPTE DE RÉSULTAT ═══════════════════════
// monthFrom/monthTo au format "YYYY-MM" (mêmes filtres mensuels que
// l'onglet Overview) — réutilise filterRentalsByMonthRange() /
// filterDepenceByMonthRange() (core.js) pour rester cohérent avec le
// reste de l'app plutôt que de réinventer la comparaison de dates.
function calculateCompteDeResultat(monthFrom, monthTo) {
  var data = (typeof DB !== 'undefined' && DB) ? DB : (window._data || window.data || {});
  var rentals = data.rentals || [];
  var vehicles = data.vehicles || [];
  var depence = data.depence || [];
  var categories = data.depenceCategories || [];

  var filteredRentals = (typeof filterRentalsByMonthRange === 'function') ? filterRentalsByMonthRange(rentals, monthFrom, monthTo) : rentals;
  var filteredDepence = (typeof filterDepenceByMonthRange === 'function') ? filterDepenceByMonthRange(depence, monthFrom, monthTo) : depence;

  // Produits : les 5 catégories fixes de revenu, déjà correctement
  // allouées par calculateCategoryStats() (paiement réel réparti
  // Rent > Petrol > Extra KM > Extra Time > Car Wash).
  var catStats = (typeof calculateCategoryStats === 'function') ? calculateCategoryStats(filteredRentals, vehicles, {}) : { totals: {} };
  var produitsMap = {};
  Object.keys(REVENUE_CATEGORY_ACCOUNTS).forEach(function (key) {
    var amount = (catStats.totals && catStats.totals[key]) || 0;
    if (amount <= 0) return;
    var code = REVENUE_CATEGORY_ACCOUNTS[key];
    var acc = accountByCode(code);
    if (!produitsMap[code]) produitsMap[code] = { code: code, name: acc.name, amount: 0 };
    produitsMap[code].amount += amount;
  });

  // Charges : chaque dépense suit le compte assigné à sa catégorie ;
  // sans compte assigné → "Non classé" (visible en rouge dans le tableau,
  // pour repérer vite ce qui reste à classer).
  var catByName = {};
  categories.forEach(function (c) { catByName[c.name] = c; });
  var chargesMap = {};
  filteredDepence.forEach(function (e) {
    var amount = parseFloat(e.amount) || 0;
    if (amount <= 0) return;
    var cat = catByName[e.category];
    var code = (cat && cat.accountCode) ? cat.accountCode : 'UNCLASSIFIED';
    var acc = accountByCode(code);
    if (!chargesMap[code]) chargesMap[code] = { code: code, name: acc.name, amount: 0 };
    chargesMap[code].amount += amount;
  });

  var produits = Object.keys(produitsMap).map(function (k) { return produitsMap[k]; }).sort(function (a, b) { return b.amount - a.amount; });
  var charges = Object.keys(chargesMap).map(function (k) { return chargesMap[k]; }).sort(function (a, b) { return b.amount - a.amount; });
  var totalProduits = produits.reduce(function (s, a) { return s + a.amount; }, 0);
  var totalCharges = charges.reduce(function (s, a) { return s + a.amount; }, 0);

  return {
    produits: produits,
    charges: charges,
    totalProduits: totalProduits,
    totalCharges: totalCharges,
    resultatNet: totalProduits - totalCharges,
    marge: totalProduits > 0 ? ((totalProduits - totalCharges) / totalProduits * 100) : 0
  };
}
window.calculateCompteDeResultat = calculateCompteDeResultat;

var g_lastAccountingStats = null;

function renderAccountingStats() {
  if (typeof ensurePageLoaded === 'function') ensurePageLoaded('revenue-stats');

  var monthFrom = document.getElementById('accounting-month-from') ? document.getElementById('accounting-month-from').value : '';
  var monthTo = document.getElementById('accounting-month-to') ? document.getElementById('accounting-month-to').value : '';

  var infoEl = document.getElementById('accounting-filter-info');
  if (infoEl) {
    var tr = (typeof translate === 'function') ? translate : function (k) { return k; };
    infoEl.textContent = (monthFrom || monthTo)
      ? (tr('rev.filterLabel') + ': ' + (monthFrom || tr('rev.start')) + ' ' + tr('rev.to') + ' ' + (monthTo || String(tr('rev.now')).toLowerCase()))
      : tr('rev.allPeriods');
  }

  var stats = calculateCompteDeResultat(monthFrom, monthTo);
  g_lastAccountingStats = stats;

  function kpi(color, label, value, suffix) {
    return '<div class="stat-card ' + color + '"><div class="stat-label">' + label + '</div><div class="stat-val">' + fmtNum(value) + (suffix ? ' <span style="font-size:.9rem">' + suffix + '</span>' : '') + '</div></div>';
  }
  var kpiEl = document.getElementById('accounting-kpis');
  if (kpiEl) {
    kpiEl.innerHTML =
      kpi('green', 'Total Produits', stats.totalProduits, 'OMR') +
      kpi('red', 'Total Charges', stats.totalCharges, 'OMR') +
      kpi(stats.resultatNet >= 0 ? 'blue' : 'red', 'Résultat Net', stats.resultatNet, 'OMR') +
      kpi('purple', 'Marge', stats.marge.toFixed(1), '%');
  }

  var pTbody = document.getElementById('accounting-produits-tbody');
  if (pTbody) {
    pTbody.innerHTML = stats.produits.length ? stats.produits.map(function (a) {
      return '<tr><td style="font-family:var(--mono)">' + escapeHtml(a.code) + '</td><td>' + escapeHtml(a.name) + '</td><td style="text-align:right;font-weight:700">' + fmtNum(a.amount) + '</td></tr>';
    }).join('') : '<tr><td colspan="3" class="rev-empty">Aucune donnée</td></tr>';
  }
  var pTotalEl = document.getElementById('accounting-produits-total');
  if (pTotalEl) pTotalEl.textContent = fmtNum(stats.totalProduits) + ' OMR';

  var cTbody = document.getElementById('accounting-charges-tbody');
  if (cTbody) {
    cTbody.innerHTML = stats.charges.length ? stats.charges.map(function (a) {
      var isUnclassified = a.code === 'UNCLASSIFIED';
      return '<tr' + (isUnclassified ? ' style="color:var(--red)"' : '') + '><td style="font-family:var(--mono)">' + (isUnclassified ? '—' : escapeHtml(a.code)) + '</td><td>' + escapeHtml(a.name) + '</td><td style="text-align:right;font-weight:700">' + fmtNum(a.amount) + '</td></tr>';
    }).join('') : '<tr><td colspan="3" class="rev-empty">Aucune donnée</td></tr>';
  }
  var cTotalEl = document.getElementById('accounting-charges-total');
  if (cTotalEl) cTotalEl.textContent = fmtNum(stats.totalCharges) + ' OMR';
}
window.renderAccountingStats = renderAccountingStats;

function clearAccountingFilters() {
  var from = document.getElementById('accounting-month-from');
  var to = document.getElementById('accounting-month-to');
  if (from) from.value = '';
  if (to) to.value = '';
  var fromLbl = document.getElementById('accounting-month-from-label');
  var toLbl = document.getElementById('accounting-month-to-label');
  if (fromLbl && typeof _calLabelFor === 'function') fromLbl.textContent = _calLabelFor('', 'month');
  if (toLbl && typeof _calLabelFor === 'function') toLbl.textContent = _calLabelFor('', 'month');
  renderAccountingStats();
}
window.clearAccountingFilters = clearAccountingFilters;

// Export CSV — même format que exportOverviewCSV()/exportCategoryCSV()
// (module-revenue-stats.js) : BOM UTF-8 + séparateur virgule, prêt pour Excel.
function exportAccountingCSV() {
  if (!g_lastAccountingStats) return;
  var d = g_lastAccountingStats;
  var rows = [
    ['Compte de Résultat'],
    [],
    ['PRODUITS'],
    ['Compte', 'Libellé', 'Montant (OMR)']
  ];
  d.produits.forEach(function (a) { rows.push([a.code, a.name, a.amount.toFixed(2)]); });
  rows.push(['', 'Total Produits', d.totalProduits.toFixed(2)]);
  rows.push([]);
  rows.push(['CHARGES']);
  rows.push(['Compte', 'Libellé', 'Montant (OMR)']);
  d.charges.forEach(function (a) { rows.push([a.code === 'UNCLASSIFIED' ? '' : a.code, a.name, a.amount.toFixed(2)]); });
  rows.push(['', 'Total Charges', d.totalCharges.toFixed(2)]);
  rows.push([]);
  rows.push(['', 'Résultat Net', d.resultatNet.toFixed(2)]);
  rows.push(['', 'Marge (%)', d.marge.toFixed(1)]);

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
  a.download = 'compte-de-resultat_' + new Date().toISOString().split('T')[0] + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
window.exportAccountingCSV = exportAccountingCSV;

// ═══════════════════════ INTÉGRATION ONGLET REVENUE STATS ═══════════════════════
// Redéfinition COMPLÈTE de switchRevenueTab() (module-revenue-stats.js) :
// identique à l'original + branche "accounting" (section + rendu dédié).
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
