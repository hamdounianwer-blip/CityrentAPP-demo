// ════════════════════════════════════════════════════════════════════
// module-depence.js — Module Dépenses (véhicules + générales)
// ════════════════════════════════════════════════════════════════════
// Branché sur DB.depence (table SQLite 'depence', même pattern que
// moves/gps_links — voir server.js). Les véhicules viennent DIRECTEMENT
// de DB.vehicles (la vraie flotte CityRent — module-fleet-database.js),
// aucune liste de véhicules séparée comme dans l'ancienne app DEPENCE.
//
// Sauvegarde : saveExpense()/deleteExpense() (core.js) → /save-one et
// /delete-one, avec garde anti-régression updatedAt côté serveur.
// Jamais de perte de données silencieuse via l'autosave (voir dbSave()).
// ════════════════════════════════════════════════════════════════════

let editingExpenseId = null;
let pendingChequeInfo = null;
let depFilterMonth = new Date().toISOString().substring(0, 7);
let depFilterVehicle = 'all';
let depFilterCategory = 'all';
let depFilterPayment = 'all';
let depStatsSubTab = 'daily';
let depMainTab = 'entry';
let depFmSearchTerm = '';
let depFmSortBy = 'name';
let depAchatSearchTerm = '';
let depChequeListFrom = '';
let depChequeListTo = '';
let depCharts = {};
const DEP_TYPE_COLORS = [
  "#4f46e5", "#d97706", "#dc2626", "#7c3aed", "#0891b2",
  "#059669", "#db2777", "#4338ca", "#ea580c", "#0284c7",
  "#65a30d", "#9333ea"
];

// ── Event delegation for data-dep-action buttons ──
(function() {
  document.addEventListener('click', function(e) {
    // Calendar trigger buttons (day/month/year pickers)
    const calTrigger = e.target.closest('[data-cal-trigger]');
    if (calTrigger) { e.preventDefault(); openMonthCalendar(calTrigger.dataset.input, calTrigger); return; }
    
    const mainTabBtn = e.target.closest('[data-dep-tab]');
    if (mainTabBtn) { e.preventDefault(); switchDepMainTab(mainTabBtn.dataset.depTab); return; }
    const substatBtn = e.target.closest('[data-dep-substat]');
    if (substatBtn) { e.preventDefault(); switchDepStatsSubTab(substatBtn.dataset.depSubstat); return; }
    const btn = e.target.closest('[data-dep-action]');
    if (!btn) return;
    const action = btn.dataset.depAction;
    if (action === 'edit') { e.preventDefault(); startEditExpense(Number(btn.dataset.id)); }
    else if (action === 'delete') { e.preventDefault(); deleteExpenseWithConfirm(Number(btn.dataset.id)); }
    else if (action === 'cancel-edit') { e.preventDefault(); cancelEditExpense(); }
    else if (action === 'remove-category') { e.preventDefault(); removeDepCategory(btn.dataset.name); }
    else if (action === 'cycle-scope') { e.preventDefault(); editDepCategoryScope(btn.dataset.name); }
    else if (action === 'open-cheque-modal') { e.preventDefault(); openDepChequeModal(); }
    else if (action === 'save-cheque-modal') { e.preventDefault(); saveDepChequeModal(); }
    else if (action === 'cancel-cheque-modal') { e.preventDefault(); cancelDepChequeModal(); }
    else if (action === 'export-pdf') { e.preventDefault(); exportDepPdf(); }
    else if (action === 'clear-daily-filters') { e.preventDefault(); clearDepDailyFilters(); }
    else if (action === 'clear-monthly-filters') { e.preventDefault(); clearDepMonthlyFilters(); }
    else if (action === 'clear-yearly-filters') { e.preventDefault(); clearDepYearlyFilters(); }
    else if (action === 'clear-vehicle-filters') { e.preventDefault(); clearDepVehicleStatsFilters(); }
    else if (action === 'clear-category-filters') { e.preventDefault(); clearDepCategoryFilters(); }
    else if (action === 'clear-cheque-filters') { e.preventDefault(); clearDepChequeFilters(); }
    else if (action === 'clear-cheque-list-filters') { e.preventDefault(); clearDepChequeListFilters(); }
    else if (action === 'set-cheque-status') { e.preventDefault(); setChequeStatus(Number(btn.dataset.id), btn.dataset.status); }
    else if (action === 'open-import-excel') { e.preventDefault(); openDepExcelImportModal(); }
    else if (action === 'open-import-cheques') { e.preventDefault(); openDepChequeImportModal(); }
    else if (action === 'view-vehicle-expenses') {
      e.preventDefault();
      const vId = btn.dataset.vehicleId;
      switchDepMainTab('entry');
      depFilterVehicle = vId;
      const sel = document.getElementById('depFilterVehicle');
      if (sel) sel.value = vId;
      renderDepence();
    }
  });
  document.addEventListener('submit', function(e) {
    if (e.target && e.target.id === 'depExpenseForm') { e.preventDefault(); handleAddExpense(e); }
    if (e.target && e.target.id === 'depAddCategoryForm') { e.preventDefault(); handleAddDepCategory(e); }
  });
  document.addEventListener('input', function(e) {
    if (e.target && e.target.id === 'depFmSearch') {
      depFmSearchTerm = e.target.value.trim().toLowerCase();
      renderDepFleetManagement();
    }
    if (e.target && e.target.id === 'depAchatSearch') {
      depAchatSearchTerm = e.target.value.trim().toLowerCase();
      renderDepAchat();
    }
  });
  document.addEventListener('change', function(e) {
    if (e.target && e.target.id === 'depExpenseKind') updateDepExpenseCategoryOptions();
    if (e.target && e.target.id === 'depPaymentMode') handleDepPaymentModeChange();
    if (e.target && (e.target.id === 'depGlobalMonthPicker' || e.target.id === 'depFilterVehicle'
        || e.target.id === 'depFilterCategory' || e.target.id === 'depFilterPayment')) {
      depFilterMonth    = document.getElementById('depGlobalMonthPicker').value || depFilterMonth;
      depFilterVehicle  = document.getElementById('depFilterVehicle').value;
      depFilterCategory = document.getElementById('depFilterCategory').value;
      depFilterPayment  = document.getElementById('depFilterPayment').value;
      renderDepence();
    }
    const statsInputIds = [
      'dep-stats-daily-date-from', 'dep-stats-daily-date-to',
      'dep-stats-monthly-date-from', 'dep-stats-monthly-date-to',
      'dep-stats-yearly-year-from', 'dep-stats-yearly-year-to',
      'dep-stats-vehicle-select', 'dep-stats-vehicle-month-from', 'dep-stats-vehicle-month-to',
      'dep-stats-category-date-from', 'dep-stats-category-date-to',
      'dep-stats-cheque-month-from', 'dep-stats-cheque-month-to'
    ];
    if (e.target && statsInputIds.includes(e.target.id)) {
      if (e.target.id.startsWith('dep-stats-daily')) renderDepDailyStats();
      else if (e.target.id.startsWith('dep-stats-monthly')) renderDepMonthlyStats();
      else if (e.target.id.startsWith('dep-stats-yearly')) renderDepYearlyStats();
      else if (e.target.id.startsWith('dep-stats-vehicle')) renderDepVehicleStats();
      else if (e.target.id.startsWith('dep-stats-category')) renderDepCategoryStats();
      else if (e.target.id.startsWith('dep-stats-cheque')) renderDepChequeStats();
    }
    if (e.target && (e.target.id === 'depChequeListFrom' || e.target.id === 'depChequeListTo')) {
      depChequeListFrom = document.getElementById('depChequeListFrom').value;
      depChequeListTo = document.getElementById('depChequeListTo').value;
      renderDepChequeList();
    }
    if (e.target && e.target.id === 'depFmSort') {
      depFmSortBy = e.target.value;
      renderDepFleetManagement();
    }
  });
})();

// ═══════════════════════ CATÉGORIES ═══════════════════════
function depCategoryNamesForScope(scope) {
  return (DB.depenceCategories || []).filter(c => c.scope === scope || c.scope === 'both').map(c => c.name);
}
function depAllCategoryNames() {
  return (DB.depenceCategories || []).map(c => c.name);
}
function depScopeBadgeClass(scope) {
  if (scope === 'vehicle') return 'background:#e0e7ff;color:#3730a3';
  if (scope === 'general') return 'background:#fef3c7;color:#92400e';
  return 'background:#f3e8ff;color:#6b21a8';
}
function depScopeLabel(scope) {
  if (scope === 'vehicle') return translate ? translate('dep.scopeVehicle') : 'Vehicle';
  if (scope === 'general') return translate ? translate('dep.scopeGeneral') : 'General';
  return translate ? translate('dep.scopeBoth') : 'Both';
}

function renderDepCategoryList() {
  const container = document.getElementById('depCategoryListContainer');
  if (!container) return;
  const cats = DB.depenceCategories || [];
  container.innerHTML = cats.map(c => {
    const safe = escapeHtml(c.name);
    const scopeClass = c.scope === 'vehicle' ? 'dpc-badge-vehicle' 
                     : c.scope === 'general' ? 'dpc-badge-general' 
                     : 'dpc-badge-both';
    return `<div style="display:flex;align-items:center;gap:8px;padding:6px 12px;border-radius:999px;border:1px solid var(--dpc-line);background:rgba(0,0,0,.02);font-size:.82rem">
      <span>${safe}</span>
      <span class="dpc-badge ${scopeClass}" data-dep-action="cycle-scope" data-name="${safe}" style="cursor:pointer">${depScopeLabel(c.scope)}</span>
      <button type="button" data-dep-action="cycle-scope" data-name="${safe}" title="${translate ? translate('dep.changeScope') : 'Change scope'}" style="opacity:.5;cursor:pointer;background:none;border:none">✏️</button>
      ${cats.length > 1 ? `<button type="button" data-dep-action="remove-category" data-name="${safe}" style="opacity:.5;cursor:pointer;background:none;border:none;color:#dc2626">✕</button>` : ''}
    </div>`;
  }).join('') || `<div class="dpc-empty-state"><i class="fa-solid fa-layer-group"></i><p>${translate ? translate('dep.noCategories') : 'No categories yet'}</p></div>`;
}

function editDepCategoryScope(name) {
  const cat = (DB.depenceCategories || []).find(c => c.name === name);
  if (!cat) return;
  const scopes = ['vehicle', 'general', 'both'];
  const next = (scopes.indexOf(cat.scope) + 1) % scopes.length;
  cat.scope = scopes[next];
  saveDepenceCategories();
  refreshDepCategoryUI();
  showToast('✅ "' + name + '" → ' + depScopeLabel(cat.scope));
}

function handleAddDepCategory(e) {
  const input = document.getElementById('depNewCategoryName');
  const scopeSelect = document.getElementById('depNewCategoryScope');
  const name = input.value.trim();
  if (!name) return;
  if ((DB.depenceCategories || []).some(c => c.name.toLowerCase() === name.toLowerCase())) {
    alert(translate ? translate('dep.categoryExists') : 'This category already exists.');
    return;
  }
  DB.depenceCategories = DB.depenceCategories || [];
  DB.depenceCategories.push({ name, scope: scopeSelect.value });
  saveDepenceCategories();
  refreshDepCategoryUI();
  input.value = '';
}

function removeDepCategory(name) {
  const usedCount = (DB.depence || []).filter(e => e.category === name).length;
  if (usedCount > 0) {
    if (!confirm((translate ? translate('dep.categoryInUse') : 'This category is used in {0} expense(s). Delete it anyway?').replace('{0}', usedCount))) return;
  }
  DB.depenceCategories = (DB.depenceCategories || []).filter(c => c.name !== name);
  saveDepenceCategories();
  refreshDepCategoryUI();
  renderDepence();
}

function refreshDepCategoryUI() {
  const filterSel = document.getElementById('depFilterCategory');
  if (filterSel) {
    const prevVal = filterSel.value;
    filterSel.innerHTML = `<option value="all">${translate ? translate('dep.allCategories') : 'All Categories'}</option>`;
    depAllCategoryNames().forEach(name => filterSel.add(new Option(name, name)));
    if (prevVal && [...filterSel.options].some(o => o.value === prevVal)) filterSel.value = prevVal;
  }
  updateDepExpenseCategoryOptions();
  renderDepCategoryList();
}

// ═══════════════════════ FORMULAIRE / KIND / CHEQUE ═══════════════════════
function updateDepExpenseCategoryOptions() {
  const kindEl = document.getElementById('depExpenseKind');
  const catEl = document.getElementById('depExpenseCategory');
  const vehGroup = document.getElementById('depVehicleFieldGroup');
  if (!kindEl || !catEl) return;
  const kind = kindEl.value;
  if (vehGroup) vehGroup.style.display = (kind === 'vehicle') ? '' : 'none';
  const prevVal = catEl.value;
  const names = depCategoryNamesForScope(kind);
  catEl.innerHTML = '';
  names.forEach(name => catEl.add(new Option(name, name)));
  if (prevVal && names.includes(prevVal)) catEl.value = prevVal;
}

function handleDepPaymentModeChange() {
  const val = document.getElementById('depPaymentMode').value;
  if (val === 'Cheque') openDepChequeModal();
  else { pendingChequeInfo = null; updateDepChequeInfoStatus(); }
}

function openDepChequeModal() {
  const amountField = document.getElementById('depExpenseAmount').value;
  const dateField = document.getElementById('depExpenseDate').value;
  document.getElementById('depChequeAmount').value = pendingChequeInfo ? pendingChequeInfo.amount : (amountField || '');
  document.getElementById('depChequeName').value = pendingChequeInfo ? pendingChequeInfo.name : '';
  document.getElementById('depChequeDate').value = pendingChequeInfo ? pendingChequeInfo.date : (dateField || '');
  document.getElementById('depChequeNumber').value = pendingChequeInfo ? pendingChequeInfo.number : '';
  // Roadmap #6 — datalist d'autocomplétion (fournisseurs + noms de chèques déjà
  // saisis), tenue à jour par module-suppliers.js. Optionnel : le formulaire
  // fonctionne à l'identique si ce module n'est pas encore chargé.
  if (typeof refreshSupplierNameDatalist === 'function') refreshSupplierNameDatalist();
  openModal('modal-dep-cheque');
}
function saveDepChequeModal() {
  const amount = parseFloat(document.getElementById('depChequeAmount').value);
  const name = document.getElementById('depChequeName').value.trim();
  const date = document.getElementById('depChequeDate').value;
  const number = document.getElementById('depChequeNumber').value.trim();
  if (!amount || amount <= 0 || !name || !date || !number) {
    alert(translate ? translate('dep.chequeFillAll') : 'Please fill in all the cheque fields.');
    return;
  }
  pendingChequeInfo = { amount, name, date, number };
  closeModal('modal-dep-cheque');
  updateDepChequeInfoStatus();
}
function cancelDepChequeModal() {
  closeModal('modal-dep-cheque');
  if (!pendingChequeInfo) document.getElementById('depPaymentMode').value = 'Cash';
  updateDepChequeInfoStatus();
}
function updateDepChequeInfoStatus() {
  const status = document.getElementById('depChequeInfoStatus');
  if (!status) return;
  const payment = document.getElementById('depPaymentMode').value;
  if (payment !== 'Cheque') { status.style.display = 'none'; return; }
  status.style.display = '';
  if (pendingChequeInfo) {
    status.className = 'dpc-status-success';
    status.innerHTML = `✅ ${translate ? translate('dep.chequeSaved') : 'Cheque details saved'} — <button type="button" data-dep-action="open-cheque-modal" style="text-decoration:underline;background:none;border:none;cursor:pointer">${translate ? translate('dep.edit') : 'Edit'}</button>`;
  } else {
    status.className = 'dpc-status-error';
    status.innerHTML = `⚠️ ${translate ? translate('dep.chequeRequired') : 'Cheque details required'} — <button type="button" data-dep-action="open-cheque-modal" style="text-decoration:underline;background:none;border:none;cursor:pointer">${translate ? translate('dep.fillNow') : 'Fill in now'}</button>`;
  }
}

// ═══════════════════════ CRUD DÉPENSE ═══════════════════════
function handleAddExpense(e) {
  const kind = document.getElementById('depExpenseKind').value;
  const vehicleId = document.getElementById('depVehicleSelect').value;

  if (kind === 'vehicle' && !vehicleId) {
    alert(translate ? translate('dep.selectVehicle') : 'Please select a vehicle for this expense.');
    return;
  }
  const payment = document.getElementById('depPaymentMode').value;
  if (payment === 'Cheque' && !pendingChequeInfo) {
    alert(translate ? translate('dep.fillChequeFirst') : 'Please fill in the cheque details first.');
    openDepChequeModal();
    return;
  }
  const dateVal = document.getElementById('depExpenseDate').value;
  const amount = parseFloat(document.getElementById('depExpenseAmount').value);
  if (!amount || amount <= 0) { alert(translate ? translate('dep.invalidAmount') : 'Please enter a valid amount.'); return; }

  const data = {
    kind,
    vehicleId: kind === 'vehicle' ? Number(vehicleId) : null,
    category: document.getElementById('depExpenseCategory').value,
    amount,
    payment,
    date: dateVal,
    details: document.getElementById('depExpenseDetails').value.trim(),
    cheque: payment === 'Cheque' ? { ...pendingChequeInfo } : null
  };

  if (editingExpenseId) {
    const idx = DB.depence.findIndex(x => x.id === editingExpenseId);
    if (idx !== -1) {
      DB.depence[idx] = { ...DB.depence[idx], ...data };
      saveExpense(editingExpenseId);
    }
    editingExpenseId = null;
    if (typeof logAction === 'function') logAction('edit', '✏️ Expense Updated', data.category + ' — ' + fmtNum(amount) + ' OMR', String(data.vehicleId || 'GENERAL'));
  } else {
    data.id = _genId();
    DB.depence.push(data);
    saveExpense(data.id);
    if (typeof logAction === 'function') logAction('new_expense', '💸 New Expense — ' + data.category, fmtNum(amount) + ' OMR | ' + (data.details || '—'), String(data.vehicleId || 'GENERAL'));
  }
  if (typeof updateLogBadge === 'function') updateLogBadge();

  depFilterMonth = dateVal.substring(0, 7);
  const monthPicker = document.getElementById('depGlobalMonthPicker');
  if (monthPicker) monthPicker.value = depFilterMonth;

  resetExpenseForm();
  renderDepence();
}

function resetExpenseForm() {
  const form = document.getElementById('depExpenseForm');
  if (!form) return;
  form.reset();
  editingExpenseId = null;
  pendingChequeInfo = null;
  document.getElementById('depExpenseKind').value = 'vehicle';
  updateDepExpenseCategoryOptions();
  document.getElementById('depExpenseDate').value = new Date().toISOString().substring(0, 10);
  document.getElementById('depPaymentMode').value = 'Cash';
  updateDepChequeInfoStatus();
  const bar = document.getElementById('depEditModeBar');
  if (bar) bar.style.display = 'none';
  const title = document.getElementById('depFormTitle');
  if (title) title.textContent = translate ? translate('dep.recordExpense') : 'Record Expense';
  const btn = document.getElementById('depExpenseSubmitBtn');
  if (btn) btn.innerHTML = '✔️ ' + (translate ? translate('dep.addExpense') : 'Add Expense');
}

function startEditExpense(id) {
  const exp = DB.depence.find(e => e.id === id);
  if (!exp) return;
  editingExpenseId = id;
  if (typeof goTo === 'function') { const navBtn = document.querySelector('[data-nav-page="depence"]'); goTo('depence', navBtn); }

  document.getElementById('depExpenseKind').value = exp.kind;
  updateDepExpenseCategoryOptions();
  if (exp.kind === 'vehicle') document.getElementById('depVehicleSelect').value = exp.vehicleId;
  document.getElementById('depExpenseCategory').value = exp.category;
  document.getElementById('depExpenseAmount').value = exp.amount;
  document.getElementById('depPaymentMode').value = exp.payment;
  document.getElementById('depExpenseDate').value = exp.date;
  document.getElementById('depExpenseDetails').value = exp.details || '';

  pendingChequeInfo = exp.cheque ? { ...exp.cheque } : null;
  updateDepChequeInfoStatus();

  const bar = document.getElementById('depEditModeBar');
  if (bar) bar.style.display = '';
  const title = document.getElementById('depFormTitle');
  if (title) title.textContent = translate ? translate('dep.editExpense') : 'Edit Expense';
  const btn = document.getElementById('depExpenseSubmitBtn');
  if (btn) btn.innerHTML = '✔️ ' + (translate ? translate('dep.updateExpense') : 'Update Expense');
  const formEl = document.getElementById('depExpenseForm');
  if (formEl) formEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function cancelEditExpense() { resetExpenseForm(); }

function deleteExpenseWithConfirm(id) {
  if (!confirm(translate ? translate('dep.confirmDelete') : 'Delete this expense?')) return;
  const exp = DB.depence.find(e => e.id === id);
  deleteExpense(id);
  if (editingExpenseId === id) resetExpenseForm();
  if (exp && typeof logAction === 'function') logAction('delete', '🗑️ Expense Deleted', exp.category + ' — ' + fmtNum(exp.amount) + ' OMR', String(exp.vehicleId || 'GENERAL'));
  if (typeof updateLogBadge === 'function') updateLogBadge();
  renderDepence();
}

// ═══════════════════════ RENDER ═══════════════════════
function populateDepVehicleSelects() {
  const formSel = document.getElementById('depVehicleSelect');
  const filterSel = document.getElementById('depFilterVehicle');
  const vehicles = (DB.vehicles || []).slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  if (formSel) {
    const prevVal = formSel.value;
    formSel.innerHTML = `<option value="">${translate ? translate('dep.selectVehiclePlaceholder') : 'Select a vehicle...'}</option>`;
    vehicles.forEach(v => formSel.add(new Option((v.name || '') + ' — ' + (v.plate || ''), v.id)));
    if (prevVal) formSel.value = prevVal;
  }
  if (filterSel) {
    const prevVal = filterSel.value;
    filterSel.innerHTML = `<option value="all">${translate ? translate('dep.entireFleet') : 'Entire Fleet'}</option>
      <option value="GENERAL">${translate ? translate('dep.generalExpenses') : 'General Expenses'}</option>`;
    vehicles.forEach(v => filterSel.add(new Option((v.name || '') + ' — ' + (v.plate || ''), v.id)));
    if (prevVal && [...filterSel.options].some(o => o.value === prevVal)) filterSel.value = prevVal;
  }
}

function getDepFilteredExpenses() {
  let filtered = (DB.depence || []).filter(e => (e.date || '').substring(0, 7) === depFilterMonth);
  if (depFilterVehicle === 'GENERAL') filtered = filtered.filter(e => e.kind === 'general');
  else if (depFilterVehicle !== 'all') filtered = filtered.filter(e => String(e.vehicleId) === String(depFilterVehicle));
  if (depFilterCategory !== 'all') filtered = filtered.filter(e => e.category === depFilterCategory);
  if (depFilterPayment !== 'all') filtered = filtered.filter(e => e.payment === depFilterPayment);
  return filtered.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.id - a.id));
}

function renderDepence() {
  const container = document.getElementById('page-depence');
  if (!container || !container.querySelector('#depExpenseForm')) return; // pas encore hydraté

  populateDepVehicleSelects();
  refreshDepCategoryUI();

  const monthPicker = document.getElementById('depGlobalMonthPicker');
  if (monthPicker && !monthPicker.value) monthPicker.value = depFilterMonth;
  document.getElementById('depFilterVehicle').value = depFilterVehicle;
  document.getElementById('depFilterCategory').value = depFilterCategory;
  document.getElementById('depFilterPayment').value = depFilterPayment;

  const filtered = getDepFilteredExpenses();
  depUpdateKpiBand();
  renderDepTable(filtered);
  
  // Apply i18n to tab labels
  if (typeof applyDepI18n === 'function') applyDepI18n();
}

function renderDepTable(data) {
  const tbody = document.getElementById('depExpenseTableBody');
  if (!tbody) return;
  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:20px;opacity:.6">${translate ? translate('dep.noExpenses') : 'No expenses for this period.'}</td></tr>`;
    return;
  }
  tbody.innerHTML = data.map(e => {
    let vehLabel = '—';
    if (e.kind === 'vehicle' && e.vehicleId) {
      const v = DB.vehicles.find(x => x.id === e.vehicleId);
      vehLabel = v ? escapeHtml((v.name || '') + ' — ' + (v.plate || '')) : '⚠️ ' + (translate ? translate('dep.vehicleDeleted') : 'Deleted vehicle');
    } else if (e.kind === 'general') {
      vehLabel = `<span style="opacity:.6">${translate ? translate('dep.generalExpenses') : 'General'}</span>`;
    }
    const payBadge = e.payment === 'Cash'
      ? `<span class="dpc-badge dpc-badge-cash">${translate ? translate('dep.cash') : 'Cash'}</span>`
      : `<span class="dpc-badge dpc-badge-cheque">${translate ? translate('dep.cheque') : 'Cheque'}</span>`;
    return `<tr style="border-top:1px solid var(--border)">
      <td style="padding:8px 10px">${fmtDate(e.date)}</td>
      <td style="padding:8px 10px">${vehLabel}</td>
      <td style="padding:8px 10px">${escapeHtml(e.category || '')}</td>
      <td style="padding:8px 10px;opacity:.8">${escapeHtml(e.details || '—')}</td>
      <td style="padding:8px 10px">${payBadge}</td>
      <td style="padding:8px 10px;text-align:right;font-weight:700;font-family:var(--mono,monospace)">${fmtNum(e.amount)} OMR</td>
      <td style="padding:8px 10px;text-align:center;white-space:nowrap">
        <button type="button" data-dep-action="edit" data-id="${e.id}" title="${translate ? translate('dep.edit') : 'Edit'}" style="background:none;border:none;cursor:pointer;opacity:.7;padding:4px">✏️</button>
        <button type="button" data-dep-action="delete" data-id="${e.id}" title="${translate ? translate('dep.delete') : 'Delete'}" style="background:none;border:none;cursor:pointer;opacity:.7;padding:4px;color:#dc2626">🗑️</button>
      </td>
    </tr>`;
  }).join('');
}

function switchDepMainTab(tab) {
  depMainTab = tab;
  document.querySelectorAll('.dep-main-tab').forEach(b => {
    const active = b.dataset.depTab === tab;
    b.classList.toggle('active', active);
  });
  ['entry', 'statistics', 'fleettypes', 'cheque', 'fleetmanagement', 'achat', 'suppliers'].forEach(t => {
    const el = document.getElementById('dep-tab-' + t);
    if (el) el.style.display = (t === tab) ? '' : 'none';
  });
  // CRITICAL FIX: Close Cheque modal when leaving cheque tab
  if (tab !== 'cheque' && typeof closeModal === 'function') {
    closeModal('modal-dep-cheque');
  }
  if (tab === 'statistics') {
    // Chart.js n'est plus chargé au boot (voir _loadChartJs() dans core.js) —
    // on le charge ici, à la première visite de cet onglet seulement.
    if (typeof _loadChartJs === 'function') {
      _loadChartJs()
        .then(renderDepStatsActiveTab)
        .catch(function(e){
          console.warn('[Dépense] Chart.js indisponible — graphes désactivés :', e.message);
          renderDepStatsActiveTab(); // le reste (tableaux, KPIs) s'affiche quand même
        });
    } else {
      renderDepStatsActiveTab();
    }
  }
  else if (tab === 'fleettypes') refreshDepCategoryUI();
  else if (tab === 'cheque') renderDepChequeList();
  else if (tab === 'fleetmanagement') renderDepFleetManagement();
  else if (tab === 'achat') renderDepAchat();
  else if (tab === 'suppliers' && typeof renderSuppliersPanel === 'function') renderSuppliersPanel();
}

function depUpdateKpiBand() {
  const today = new Date().toISOString().substring(0, 10);
  const thisMonth = today.substring(0, 7);
  const monthList = (DB.depence || []).filter(e => (e.date || '').substring(0, 7) === thisMonth);
  const monthTotal = monthList.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);

  const vehicleMonthList = monthList.filter(e => e.kind === 'vehicle' && e.vehicleId);
  // Compte de véhicules actifs PAR PLAQUE NORMALISÉE — même identification que
  // partout ailleurs (évite qu'une fiche véhicule dupliquée gonfle artificiellement
  // le nombre de "véhicules actifs" et fausse la moyenne).
  const activePlateKeys = new Set(vehicleMonthList.map(e => depResolveNormalizedPlate(e.vehicleId)));
  const vehicleMonthTotal = vehicleMonthList.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
  const avgActiveVehicle = activePlateKeys.size > 0 ? vehicleMonthTotal / activePlateKeys.size : 0;

  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setText('depKpiMonthly', fmtNum(monthTotal) + ' OMR');
  setText('depKpiAvgVehicle', fmtNum(avgActiveVehicle) + ' OMR');
  const fleetCountEl = document.getElementById('depKpiFleetCount');
  if (fleetCountEl) fleetCountEl.innerHTML = (DB.vehicles || []).length + ' <span data-i18n="dep.vehiclesLower">' + (translate ? translate('dep.vehiclesLower') : 'vehicles') + '</span>';
  setText('depKpiTransactions', String(monthList.length));
}

window.renderDepence = renderDepence;

// ═══════════════════════ I18N SUPPORT FOR EXPENSE TABS ═══════════════════════
// Apply translations to Expense submenu tab labels (EN/AR automatically)
function applyDepI18n() {
  const tabLabels = {
    'entry': 'dep.tabEntry',
    'statistics': 'dep.tabStatistics',
    'cheque': 'dep.tabCheque',
    'fleettypes': 'dep.tabFleetTypes',
    'fleetmanagement': 'dep.tabFleetManagement',
    'achat': 'dep.tabAchat',
    'suppliers': 'dep.tabSuppliers'
  };
  Object.entries(tabLabels).forEach(([tabKey, i18nKey]) => {
    const btn = document.querySelector('[data-dep-tab="' + tabKey + '"]');
    if (btn && typeof translate === 'function') {
      btn.textContent = translate(i18nKey);
    }
  });
}
window.applyDepI18n = applyDepI18n;

// ═══════════════════════ STATISTIQUES ═══════════════════════
// Port fidèle de la logique de l'ancienne app DEPENCE (calculateExpenseStats,
// KPI band, sous-onglets daily/monthly/yearly/vehicle/category/cheque),
// adapté à DB.depence + DB.vehicles (flotte CityRent).

function depFmtDate(dateStr) {
  if (typeof fmtDate === 'function') return fmtDate(dateStr);
  return dateStr || '';
}

// depFormatStatsMonth() supprimée (2026-08) — remplacée par formatStatsMonth()
// (core.js), partagée avec module-revenue-stats.js et localisée AR/FR/EN.
const depFormatStatsMonth = formatStatsMonth;

function depTypeColor(category) {
  const idx = depAllCategoryNames().indexOf(category);
  return DEP_TYPE_COLORS[(idx >= 0 ? idx : 0) % DEP_TYPE_COLORS.length];
}

function depVehicleLabel(vehicleId) {
  const v = (DB.vehicles || []).find(x => x.id === Number(vehicleId));
  return v ? ((v.name || '') + ' — ' + (v.plate || '')) : ('⚠️ ' + (translate ? translate('dep.vehicleDeleted') : 'Deleted vehicle'));
}

// depCalculateStats() supprimée (2026-08) — remplacée par calculateDepenceStats()
// (core.js), partagée avec module-revenue-stats.js. Même buckets daily/monthly/
// yearly + cash/cheque qu'avant (comportement identique pour ce module).
const depCalculateStats = calculateDepenceStats;

// Construit le HTML des 4 grandes cartes KPI, à partir d'une liste filtrée
// (chaque sous-onglet passe sa propre liste filtrée pour que les KPI réagissent au filtre actif).
function depBuildKpiHtml(filteredList) {
  const list = filteredList || DB.depence || [];
  const stats = depCalculateStats(list);
  const today = new Date().toISOString().split('T')[0];
  const thisMonth = today.substring(0, 7);
  const thisYear = today.substring(0, 4);
  const monthAmount = stats.monthly[thisMonth] ? stats.monthly[thisMonth].amount : 0;
  const yearAmount = stats.yearly[thisYear] ? stats.yearly[thisYear].amount : 0;
  const t = (k, d) => translate ? translate(k) : d;

  const kpi = (color, bg, icon, label, value, sub) => `
    <div class="card" style="position:relative;padding:18px 18px 16px;border-radius:14px;overflow:hidden;border:1px solid rgba(0,0,0,.06);box-shadow:0 1px 2px rgba(0,0,0,.04)">
      <div style="position:absolute;top:0;left:0;right:0;height:3px;background:${color}"></div>
      <div style="width:42px;height:42px;border-radius:11px;background:${bg};color:${color};display:flex;align-items:center;justify-content:center;font-size:1.25rem;margin-bottom:14px">${icon}</div>
      <p style="font-size:.7rem;text-transform:uppercase;font-weight:700;opacity:.5;letter-spacing:.06em;margin-bottom:6px">${label}</p>
      <h3 style="font-size:1.6rem;font-weight:800;color:${color};line-height:1.15;margin:0;white-space:nowrap">${value} <span style="font-size:.85rem;font-weight:700;opacity:.7">OMR</span></h3>
      <p style="font-size:.72rem;opacity:.45;margin-top:8px">${sub}</p>
    </div>`;

  return kpi('#dc2626', '#fee2e2', '💰', t('dep.totalExpenses','Total Expenses'), stats.total.toFixed(3), `${stats.count} ${t('dep.entries','entries')}`)
    + kpi('#2563eb', '#dbeafe', '📈', t('dep.avgPerEntry','Average / Entry'), stats.avg.toFixed(3), `${t('dep.max','Max')}: ${stats.max.toFixed(3)} OMR`)
    + kpi('#7c3aed', '#f3e8ff', '🗓️', t('dep.thisMonth','This Month'), monthAmount.toFixed(3), depFormatStatsMonth(thisMonth))
    + kpi('#d97706', '#fef3c7', '📊', t('dep.thisYear','This Year'), yearAmount.toFixed(3), thisYear);
}

function depRenderKpisForTab(tab, filteredList) {
  const el = document.getElementById('dep-stats-summary-' + tab);
  if (el) el.innerHTML = depBuildKpiHtml(filteredList);
}

function switchDepStatsSubTab(tab) {
  depStatsSubTab = tab;
  document.querySelectorAll('.dep-substat-tab').forEach(b => {
    const active = b.dataset.depSubstat === tab;
    b.classList.toggle('active', active);
  });
  ['daily', 'monthly', 'yearly', 'vehicle', 'category', 'cheque'].forEach(t => {
    const sec = document.getElementById('dep-stats-' + t + '-section');
    if (sec) sec.style.display = (t === tab) ? '' : 'none';
  });
  if (tab === 'daily') renderDepDailyStats();
  else if (tab === 'monthly') renderDepMonthlyStats();
  else if (tab === 'yearly') { renderDepYearlyStats(); }
  else if (tab === 'vehicle') { depPopulateVehicleStatsSelect(); renderDepVehicleStats(); }
  else if (tab === 'category') renderDepCategoryStats();
  else if (tab === 'cheque') renderDepChequeStats();
}

function renderDepStatsActiveTab() {
  if (!document.getElementById('dep-stats-daily-section')) return; // pas hydraté
  switchDepStatsSubTab(depStatsSubTab);
}

// ── DAILY ──
function renderDepDailyStats() {
  const stats = depCalculateStats(DB.depence);
  const fromVal = document.getElementById('dep-stats-daily-date-from').value;
  const toVal = document.getElementById('dep-stats-daily-date-to').value;
  const t = (k, d) => translate ? translate(k) : d;

  let kpiFiltered = (DB.depence || []).filter(e => e.date && (parseFloat(e.amount) || 0) > 0);
  if (fromVal) kpiFiltered = kpiFiltered.filter(e => e.date >= fromVal);
  if (toVal) kpiFiltered = kpiFiltered.filter(e => e.date <= toVal);
  depRenderKpisForTab('daily', kpiFiltered);

  let days = Object.keys(stats.daily).sort();
  if (fromVal) days = days.filter(d => d >= fromVal);
  if (toVal) days = days.filter(d => d <= toVal);
  if (!fromVal && !toVal) days = days.slice(-30);

  let totalAmount = 0;
  days.forEach(d => totalAmount += stats.daily[d].amount);

  document.getElementById('dep-stats-daily-table-count').textContent = `${days.length} ${t('dep.days','days')} • ${t('dep.thTotal','Total')}: ${totalAmount.toFixed(3)} OMR`;
  document.getElementById('dep-stats-daily-filter-info').textContent = (fromVal || toVal)
    ? `✓ ${t('dep.filtered','Filtered')}: ${fromVal || t('dep.start','start')} ${t('dep.to','to')} ${toVal || t('dep.today','today')}`
    : '📊 ' + t('dep.showingLast30Days', 'Showing last 30 days');

  const chartData = days.map(d => ({ label: d.substring(8) + '/' + d.substring(5, 7), value: stats.daily[d].amount }));
  const ctx = document.getElementById('depChartDaily');
  if (depCharts.daily) depCharts.daily.destroy();
  if (ctx && window.Chart) {
    depCharts.daily = new Chart(ctx, {
      type: 'bar',
      data: { labels: chartData.map(d => d.label), datasets: [{ label: 'Expenses (OMR)', data: chartData.map(d => d.value), backgroundColor: '#4f46e5', borderRadius: 4, maxBarThickness: 46 }] },
      options: { responsive: true, maintainAspectRatio: false, layout: { padding: { top: 20 } }, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true }, x: { grid: { display: false } } } }
    });
  }

  let rows = '';
  [...days].reverse().forEach(day => {
    const d = stats.daily[day];
    rows += `<tr style="border-top:1px solid var(--border)">
      <td style="padding:6px 8px;font-weight:700">${depFmtDate(day)}</td>
      <td style="padding:6px 8px">${d.count}</td>
      <td style="padding:6px 8px;text-align:right;font-weight:700;color:#dc2626">${d.amount.toFixed(3)} OMR</td>
      <td style="padding:6px 8px;text-align:right">${(d.amount / d.count).toFixed(3)} OMR</td>
      <td style="padding:6px 8px;font-size:.72rem;opacity:.6">Cash: ${d.cash.toFixed(1)} / Cheque: ${d.cheque.toFixed(1)}</td>
    </tr>`;
  });
  document.getElementById('dep-stats-daily-tbody').innerHTML = rows || `<tr><td colspan="5" style="text-align:center;padding:20px;opacity:.5">${t('dep.noData','No data available')}</td></tr>`;
  if(typeof refreshMonthCalendarLabels === 'function') refreshMonthCalendarLabels();
}

function clearDepDailyFilters() {
  document.getElementById('dep-stats-daily-date-from').value = '';
  document.getElementById('dep-stats-daily-date-to').value = '';
  renderDepDailyStats();
  if(typeof refreshMonthCalendarLabels === 'function') refreshMonthCalendarLabels();
}

// ── MONTHLY ──
function renderDepMonthlyStats() {
  const stats = depCalculateStats(DB.depence);
  const fromVal = document.getElementById('dep-stats-monthly-date-from').value;
  const toVal = document.getElementById('dep-stats-monthly-date-to').value;
  const t = (k, d) => translate ? translate(k) : d;

  let kpiFiltered = (DB.depence || []).filter(e => e.date && (parseFloat(e.amount) || 0) > 0);
  if (fromVal) kpiFiltered = kpiFiltered.filter(e => e.date.substring(0, 7) >= fromVal);
  if (toVal) kpiFiltered = kpiFiltered.filter(e => e.date.substring(0, 7) <= toVal);
  depRenderKpisForTab('monthly', kpiFiltered);

  let months = Object.keys(stats.monthly).sort();
  if (fromVal) months = months.filter(m => m >= fromVal);
  if (toVal) months = months.filter(m => m <= toVal);
  if (!fromVal && !toVal) months = months.slice(-12);

  let totalAmount = 0;
  months.forEach(m => totalAmount += stats.monthly[m].amount);

  document.getElementById('dep-stats-monthly-table-count').textContent = `${months.length} ${t('dep.months','months')} • ${t('dep.thTotal','Total')}: ${totalAmount.toFixed(3)} OMR`;
  document.getElementById('dep-stats-monthly-filter-info').textContent = (fromVal || toVal)
    ? `✓ ${t('dep.filtered','Filtered')}: ${fromVal || t('dep.start','start')} ${t('dep.to','to')} ${toVal || t('dep.today','today')}`
    : '📊 ' + t('dep.showingLast12Months', 'Showing last 12 months');

  const chartData = months.map(m => ({ label: depFormatStatsMonth(m), value: stats.monthly[m].amount }));
  const ctx = document.getElementById('depChartMonthly');
  if (depCharts.monthly) depCharts.monthly.destroy();
  if (ctx && window.Chart) {
    depCharts.monthly = new Chart(ctx, {
      type: 'bar',
      data: { labels: chartData.map(d => d.label), datasets: [{ label: 'Monthly Expenses', data: chartData.map(d => d.value), backgroundColor: '#4f46e5', borderRadius: 6, maxBarThickness: 46 }] },
      options: { responsive: true, maintainAspectRatio: false, layout: { padding: { top: 20 } }, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true }, x: { grid: { display: false } } } }
    });
  }

  let rows = '';
  let prevAmount = 0;
  [...months].reverse().forEach((month, idx) => {
    const d = stats.monthly[month];
    const growth = idx > 0 && prevAmount > 0 ? ((d.amount - prevAmount) / prevAmount * 100) : 0;
    const growthColor = growth > 0 ? '#dc2626' : growth < 0 ? '#16a34a' : '#6b7280';
    const growthIcon = growth > 0 ? '▲' : growth < 0 ? '▼' : '—';
    rows += `<tr style="border-top:1px solid var(--border)">
      <td style="padding:6px 8px;font-weight:700">${depFormatStatsMonth(month)}</td>
      <td style="padding:6px 8px">${d.count}</td>
      <td style="padding:6px 8px;text-align:right;font-weight:700;color:#dc2626">${d.amount.toFixed(3)} OMR</td>
      <td style="padding:6px 8px;text-align:right">${(d.amount / d.count).toFixed(3)} OMR</td>
      <td style="padding:6px 8px;font-weight:700;color:${growthColor}">${growthIcon} ${Math.abs(growth).toFixed(1)}%</td>
    </tr>`;
    prevAmount = d.amount;
  });
  document.getElementById('dep-stats-monthly-tbody').innerHTML = rows || `<tr><td colspan="5" style="text-align:center;padding:20px;opacity:.5">${t('dep.noData','No data available')}</td></tr>`;
  if(typeof refreshMonthCalendarLabels === 'function') refreshMonthCalendarLabels();
}

function clearDepMonthlyFilters() {
  document.getElementById('dep-stats-monthly-date-from').value = '';
  document.getElementById('dep-stats-monthly-date-to').value = '';
  renderDepMonthlyStats();
  if(typeof refreshMonthCalendarLabels === 'function') refreshMonthCalendarLabels();
}

// ── YEARLY ──
function depPopulateYearlySelects() {
  // Supprimée: calendrier gère automatiquement les années
}

function renderDepYearlyStats() {
  const stats = depCalculateStats(DB.depence);
  const fromVal = document.getElementById('dep-stats-yearly-year-from').value;
  const toVal = document.getElementById('dep-stats-yearly-year-to').value;
  const t = (k, d) => translate ? translate(k) : d;

  let kpiFiltered = (DB.depence || []).filter(e => e.date && (parseFloat(e.amount) || 0) > 0);
  if (fromVal) kpiFiltered = kpiFiltered.filter(e => e.date.substring(0, 4) >= fromVal);
  if (toVal) kpiFiltered = kpiFiltered.filter(e => e.date.substring(0, 4) <= toVal);
  depRenderKpisForTab('yearly', kpiFiltered);

  let years = Object.keys(stats.yearly).sort();
  if (fromVal) years = years.filter(y => y >= fromVal);
  if (toVal) years = years.filter(y => y <= toVal);
  if (!fromVal && !toVal) years = years.slice(-5);

  let totalAmount = 0;
  years.forEach(y => totalAmount += stats.yearly[y].amount);

  document.getElementById('dep-stats-yearly-table-count').textContent = `${years.length} ${t('dep.years','years')} • ${t('dep.thTotal','Total')}: ${totalAmount.toFixed(3)} OMR`;
  document.getElementById('dep-stats-yearly-filter-info').textContent = (fromVal || toVal)
    ? `✓ ${t('dep.filtered','Filtered')}: ${fromVal || t('dep.all','All')} ${t('dep.to','to')} ${toVal || t('dep.now','Now')}`
    : '📊 ' + t('dep.showingLast5Years', 'Showing last 5 years');

  const chartData = years.map(y => ({ label: y, value: stats.yearly[y].amount }));
  const ctx = document.getElementById('depChartYearly');
  if (depCharts.yearly) depCharts.yearly.destroy();
  if (ctx && window.Chart) {
    depCharts.yearly = new Chart(ctx, {
      type: 'bar',
      data: { labels: chartData.map(d => d.label), datasets: [{ label: 'Yearly', data: chartData.map(d => d.value), backgroundColor: '#10b981', borderRadius: 6, maxBarThickness: 60 }] },
      options: { responsive: true, maintainAspectRatio: false, layout: { padding: { top: 20 } }, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true }, x: { grid: { display: false } } } }
    });
  }

  let rows = '';
  [...years].reverse().forEach(year => {
    const d = stats.yearly[year];
    const monthKeys = Object.keys(d.months);
    let highestMonth = monthKeys[0] || null;
    let highestAmount = highestMonth ? d.months[highestMonth] : 0;
    monthKeys.forEach(m => { if (d.months[m] > highestAmount) { highestAmount = d.months[m]; highestMonth = m; } });
    rows += `<tr style="border-top:1px solid var(--border)">
      <td style="padding:6px 8px;font-weight:700">${year}</td>
      <td style="padding:6px 8px">${d.count}</td>
      <td style="padding:6px 8px;text-align:right;font-weight:700;color:#dc2626">${d.amount.toFixed(3)} OMR</td>
      <td style="padding:6px 8px;text-align:right">${(d.amount / d.count).toFixed(3)} OMR</td>
      <td style="padding:6px 8px;font-size:.72rem;opacity:.6">${highestMonth ? depFormatStatsMonth(highestMonth) + ' (' + highestAmount.toFixed(1) + ')' : 'N/A'}</td>
    </tr>`;
  });
  document.getElementById('dep-stats-yearly-tbody').innerHTML = rows || `<tr><td colspan="5" style="text-align:center;padding:20px;opacity:.5">${t('dep.noData','No data available')}</td></tr>`;
  if(typeof refreshMonthCalendarLabels === 'function') refreshMonthCalendarLabels();
}

function clearDepYearlyFilters() {
  document.getElementById('dep-stats-yearly-year-from').value = '';
  document.getElementById('dep-stats-yearly-year-to').value = '';
  renderDepYearlyStats();
  if(typeof refreshMonthCalendarLabels === 'function') refreshMonthCalendarLabels();
}

// ── BY VEHICLE ──
function depPopulateVehicleStatsSelect() {
  const sel = document.getElementById('dep-stats-vehicle-select');
  if (!sel) return;
  const prevVal = sel.value;
  sel.innerHTML = `<option value="all">${translate ? translate('dep.entireFleet') : 'Entire Fleet'}</option>`;
  (DB.vehicles || []).slice().sort((a, b) => (a.name || '').localeCompare(b.name || '')).forEach(v => {
    sel.add(new Option((v.name || '') + ' — ' + (v.plate || ''), v.id));
  });
  if (prevVal && [...sel.options].some(o => o.value === prevVal)) sel.value = prevVal;
}

function renderDepVehicleStats() {
  const selectedVehicle = document.getElementById('dep-stats-vehicle-select').value;
  const monthFrom = document.getElementById('dep-stats-vehicle-month-from').value;
  const monthTo = document.getElementById('dep-stats-vehicle-month-to').value;
  const t = (k, d) => translate ? translate(k) : d;

  let list = (DB.depence || []).filter(e => e.kind === 'vehicle' && e.vehicleId);
  if (selectedVehicle !== 'all') list = list.filter(e => String(e.vehicleId) === String(selectedVehicle));
  if (monthFrom) list = list.filter(e => e.date && e.date.substring(0, 7) >= monthFrom);
  if (monthTo) list = list.filter(e => e.date && e.date.substring(0, 7) <= monthTo);

  depRenderKpisForTab('vehicle', list);

  document.getElementById('dep-stats-vehicle-filter-info').textContent =
    `📅 ${(monthFrom || monthTo) ? (monthFrom || t('dep.start','start')) + ' ' + t('dep.to','to') + ' ' + (monthTo || t('dep.now','now')) : t('dep.allPeriods','All periods')} | ${t('dep.vehicle','Vehicle')}: ${selectedVehicle === 'all' ? t('dep.all','All') : depVehicleLabel(selectedVehicle)}`;

  // NOTE (2026-08) : ce regroupement par plaque normalisée ressemble à
  // groupDepenceByPlate() (core.js, utilisée par Revenue Stats ROI/Profit)
  // mais NE PEUT PAS être fusionné avec elle : ici, une dépense liée à un
  // véhicule supprimé (vehicleId orphelin) doit rester VISIBLE dans le
  // tableau (ligne "⚠️ Deleted vehicle", via depVehicleLabel) pour l'audit
  // comptable. Dans Revenue Stats, la même dépense orpheline est
  // volontairement exclue du calcul par véhicule (elle va dans
  // generalTotal) car l'attribuer au ROI/profit d'une voiture qui n'existe
  // plus n'aurait pas de sens. Deux comportements différents et corrects
  // pour deux besoins différents — donc deux implémentations, mais le
  // reste (normalisation de plaque, cash/cheque) reste partagé via
  // depResolveNormalizedPlate() → normalizePlateGlobal().
  const vehicleMap = {};
  let totalAmount = 0, totalCount = 0;
  list.forEach(e => {
    const amount = parseFloat(e.amount) || 0;
    const key = depResolveNormalizedPlate(e.vehicleId);
    if (!vehicleMap[key]) vehicleMap[key] = { name: depVehicleLabel(e.vehicleId), total: 0, count: 0, categories: {}, cash: 0, cheque: 0 };
    vehicleMap[key].total += amount;
    vehicleMap[key].count++;
    vehicleMap[key].categories[e.category] = (vehicleMap[key].categories[e.category] || 0) + amount;
    if (e.payment === 'Cash') vehicleMap[key].cash += amount; else vehicleMap[key].cheque += amount;
    totalAmount += amount;
    totalCount++;
  });

  const vehicleRows = Object.values(vehicleMap).sort((a, b) => b.total - a.total);

  document.getElementById('dep-stats-vehicle-summary').innerHTML = `
    <div style="padding:10px;border-radius:8px;border:1px solid var(--border)"><div style="opacity:.6;font-size:.68rem;text-transform:uppercase">${t('dep.totalSpent','Total Spent')}</div><div style="font-weight:800;font-size:1rem;color:#dc2626">${totalAmount.toFixed(3)} OMR</div></div>
    <div style="padding:10px;border-radius:8px;border:1px solid var(--border)"><div style="opacity:.6;font-size:.68rem;text-transform:uppercase">${t('dep.thEntries','Entries')}</div><div style="font-weight:800;font-size:1rem">${totalCount}</div></div>
    <div style="padding:10px;border-radius:8px;border:1px solid var(--border)"><div style="opacity:.6;font-size:.68rem;text-transform:uppercase">${t('dep.vehicles','Vehicles')}</div><div style="font-weight:800;font-size:1rem">${vehicleRows.length}</div></div>
    <div style="padding:10px;border-radius:8px;border:1px solid var(--border)"><div style="opacity:.6;font-size:.68rem;text-transform:uppercase">${t('dep.thAvg','Avg')} / ${t('dep.entries','entry')}</div><div style="font-weight:800;font-size:1rem">${(totalCount > 0 ? totalAmount / totalCount : 0).toFixed(3)} OMR</div></div>
  `;

  const chartData = vehicleRows.slice(0, 15).map(v => ({ label: v.name, value: v.total }));
  const ctx = document.getElementById('depChartVehicle');
  if (depCharts.vehicle) depCharts.vehicle.destroy();
  if (ctx && window.Chart) {
    depCharts.vehicle = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: chartData.map(d => d.label.length > 15 ? d.label.substring(0, 12) + '…' : d.label),
        datasets: [{ label: 'Total (OMR)', data: chartData.map(d => d.value), backgroundColor: '#4f46e5', borderRadius: 6, maxBarThickness: 28 }]
      },
      options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true } } }
    });
  }

  document.getElementById('dep-stats-vehicle-table-count').textContent = `${vehicleRows.length} ${t('dep.vehicles','vehicles')} • ${t('dep.thTotal','Total')}: ${totalAmount.toFixed(3)} OMR`;

  let rows = '';
  vehicleRows.forEach(v => {
    const topCategory = Object.entries(v.categories).sort((a, b) => b[1] - a[1])[0];
    rows += `<tr style="border-top:1px solid var(--border)">
      <td style="padding:6px 8px;font-weight:700">${escapeHtml(v.name)}</td>
      <td style="padding:6px 8px">${v.count}</td>
      <td style="padding:6px 8px;text-align:right;font-weight:700;color:#dc2626">${v.total.toFixed(3)} OMR</td>
      <td style="padding:6px 8px;text-align:right">${(v.total / v.count).toFixed(3)} OMR</td>
      <td style="padding:6px 8px;font-size:.75rem">${topCategory ? escapeHtml(topCategory[0]) + ' (' + topCategory[1].toFixed(1) + ')' : 'N/A'}</td>
      <td style="padding:6px 8px;font-size:.72rem;opacity:.6">Cash: ${v.cash.toFixed(1)} / Cheque: ${v.cheque.toFixed(1)}</td>
    </tr>`;
  });
  document.getElementById('dep-stats-vehicle-tbody').innerHTML = rows || `<tr><td colspan="6" style="text-align:center;padding:20px;opacity:.5">${t('dep.noDataFilter','No data matching filter.')}</td></tr>`;

  const aggWrap = document.getElementById('dep-stats-vehicle-aggregate-wrap');
  const detailWrap = document.getElementById('dep-stats-vehicle-detail-wrap');
  if (selectedVehicle === 'all') {
    aggWrap.style.display = '';
    detailWrap.style.display = 'none';
  } else {
    aggWrap.style.display = 'none';
    detailWrap.style.display = '';

    const detailList = list.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
    const detailTbody = document.getElementById('dep-stats-vehicle-detail-tbody');
    let detailTotal = 0;
    if (detailList.length === 0) {
      detailTbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:20px;opacity:.5">${t('dep.noChargesVehicle','No charges recorded for this vehicle in this period.')}</td></tr>`;
    } else {
      detailTbody.innerHTML = detailList.map(e => {
        const amount = parseFloat(e.amount) || 0;
        detailTotal += amount;
        const paymentBadge = e.payment === 'Cheque'
          ? `<span class="badge" style="background:#fee2e2;color:#991b1b;padding:2px 8px;border-radius:999px;font-size:.7rem;font-weight:700">Cheque</span>`
          : `<span class="badge" style="background:#dcfce7;color:#166534;padding:2px 8px;border-radius:999px;font-size:.7rem;font-weight:700">Cash</span>`;
        return `<tr style="border-top:1px solid var(--border)">
          <td style="padding:6px 8px;font-weight:700">${depFmtDate(e.date)}</td>
          <td style="padding:6px 8px"><span class="badge" style="background:${depTypeColor(e.category)}22;color:${depTypeColor(e.category)};padding:2px 8px;border-radius:999px;font-size:.7rem;font-weight:700">${escapeHtml(e.category)}</span></td>
          <td style="padding:6px 8px;text-align:right;font-weight:700">${amount.toFixed(3)} OMR</td>
          <td style="padding:6px 8px">${paymentBadge}</td>
          <td style="padding:6px 8px;font-size:.75rem;opacity:.7">${escapeHtml(e.details || '')}</td>
        </tr>`;
      }).join('');
    }
    document.getElementById('dep-stats-vehicle-detail-total').textContent = detailTotal.toFixed(3) + ' OMR';
    document.getElementById('dep-stats-vehicle-detail-count').textContent = `${detailList.length} ${detailList.length === 1 ? t('dep.charge','charge') : t('dep.charges','charges')} • ${t('dep.thTotal','Total')}: ${detailTotal.toFixed(3)} OMR`;
  }
}

function clearDepVehicleStatsFilters() {
  document.getElementById('dep-stats-vehicle-select').value = 'all';
  document.getElementById('dep-stats-vehicle-month-from').value = '';
  document.getElementById('dep-stats-vehicle-month-to').value = '';
  renderDepVehicleStats();
  if(typeof refreshMonthCalendarLabels === 'function') refreshMonthCalendarLabels();
}

// ── BY CATEGORY ──
function renderDepCategoryStats() {
  const fromVal = document.getElementById('dep-stats-category-date-from').value;
  const toVal = document.getElementById('dep-stats-category-date-to').value;
  const t = (k, d) => translate ? translate(k) : d;

  let list = (DB.depence || []).filter(e => e.date && (parseFloat(e.amount) || 0) > 0);
  if (fromVal) list = list.filter(e => e.date.substring(0, 7) >= fromVal);
  if (toVal) list = list.filter(e => e.date.substring(0, 7) <= toVal);

  depRenderKpisForTab('category', list);

  const map = {};
  list.forEach(e => { map[e.category] = (map[e.category] || 0) + (parseFloat(e.amount) || 0); });

  const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((s, [, v]) => s + v, 0);

  const ctx = document.getElementById('depChartCategory');
  if (depCharts.category) depCharts.category.destroy();
  if (ctx && window.Chart) {
    depCharts.category = new Chart(ctx, {
      type: 'doughnut',
      data: { labels: sorted.map(([c]) => c), datasets: [{ data: sorted.map(([, v]) => v), backgroundColor: sorted.map(([c]) => depTypeColor(c)), borderWidth: 2, borderColor: '#fff' }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: { size: 11 } } } } }
    });
  }

  document.getElementById('depCategoryBreakdown').innerHTML = sorted.length ? `
    <div style="display:flex;flex-direction:column;gap:8px;max-height:260px;overflow-y:auto">
      ${sorted.map(([c, v]) => {
        const pct = total > 0 ? (v / total * 100) : 0;
        return `<div style="display:flex;align-items:center;gap:10px">
          <div style="width:10px;height:10px;border-radius:999px;flex-shrink:0;background:${depTypeColor(c)}"></div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;justify-content:space-between;font-size:.78rem">
              <span style="font-weight:700">${escapeHtml(c)}</span>
              <span style="font-weight:800">${v.toFixed(1)} OMR</span>
            </div>
            <div style="height:5px;border-radius:999px;background:var(--border);margin-top:4px;overflow:hidden"><div style="height:100%;background:${depTypeColor(c)};width:${pct}%"></div></div>
          </div>
          <span style="font-size:.72rem;opacity:.6;width:36px;text-align:right">${pct.toFixed(0)}%</span>
        </div>`;
      }).join('')}
    </div>
  ` : `<div style="text-align:center;padding:30px;opacity:.5">${t('dep.noData','No data available')}</div>`;
  if(typeof refreshMonthCalendarLabels === 'function') refreshMonthCalendarLabels();
}

function clearDepCategoryFilters() {
  document.getElementById('dep-stats-category-date-from').value = '';
  document.getElementById('dep-stats-category-date-to').value = '';
  renderDepCategoryStats();
  if(typeof refreshMonthCalendarLabels === 'function') refreshMonthCalendarLabels();
}

// ── CHEQUE EVOLUTION ──
function renderDepChequeStats() {
  const fromVal = document.getElementById('dep-stats-cheque-month-from').value;
  const toVal = document.getElementById('dep-stats-cheque-month-to').value;
  const t = (k, d) => translate ? translate(k) : d;

  let allCheques = (DB.depence || []).filter(e => e.payment === 'Cheque');
  if (fromVal) allCheques = allCheques.filter(e => {
    const mKey = (e.cheque && e.cheque.date) ? e.cheque.date.substring(0, 7) : (e.date ? e.date.substring(0, 7) : null);
    return mKey && mKey >= fromVal;
  });
  if (toVal) allCheques = allCheques.filter(e => {
    const mKey = (e.cheque && e.cheque.date) ? e.cheque.date.substring(0, 7) : (e.date ? e.date.substring(0, 7) : null);
    return mKey && mKey <= toVal;
  });

  depRenderKpisForTab('cheque', allCheques);

  document.getElementById('dep-stats-cheque-filter-info').textContent = (fromVal || toVal)
    ? `✓ ${t('dep.filtered','Filtered')}: ${fromVal || t('dep.start','start')} ${t('dep.to','to')} ${toVal || t('dep.now','now')}`
    : '📅 ' + t('dep.showingAllMonths', 'Showing all months');

  const chequeMonthMap = {};
  allCheques.forEach(e => {
    const mKey = (e.cheque && e.cheque.date) ? e.cheque.date.substring(0, 7) : (e.date ? e.date.substring(0, 7) : null);
    if (!mKey) return;
    chequeMonthMap[mKey] = (chequeMonthMap[mKey] || 0) + (parseFloat(e.amount) || 0);
  });
  const chequeMonths = Object.keys(chequeMonthMap).sort();
  const chequeChartLabels = chequeMonths.map(m => depFormatStatsMonth(m));
  const chequeChartData = chequeMonths.map(m => chequeMonthMap[m]);

  const chequeTotalFiltered = chequeChartData.reduce((s, v) => s + v, 0);
  document.getElementById('dep-cheque-chart-info').textContent = `${chequeMonths.length} ${t('dep.months','months')} — ${t('dep.thTotal','Total')}: ${chequeTotalFiltered.toFixed(3)} OMR`;

  const ctx = document.getElementById('depChartCheque');
  if (depCharts.cheque) depCharts.cheque.destroy();
  if (ctx && window.Chart) {
    depCharts.cheque = new Chart(ctx, {
      type: 'bar',
      data: { labels: chequeChartLabels, datasets: [{ label: 'Cheque Total (OMR)', data: chequeChartData, backgroundColor: '#fee2e2', borderColor: '#dc2626', borderWidth: 2, borderRadius: 6, hoverBackgroundColor: '#dc2626', maxBarThickness: 46 }] },
      options: { responsive: true, maintainAspectRatio: false, layout: { padding: { top: 22 } }, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { callback: v => v.toFixed(0) + ' OMR' } }, x: { grid: { display: false } } } }
    });
  }
  if(typeof refreshMonthCalendarLabels === 'function') refreshMonthCalendarLabels();
}

function clearDepChequeFilters() {
  document.getElementById('dep-stats-cheque-month-from').value = '';
  document.getElementById('dep-stats-cheque-month-to').value = '';
  renderDepChequeStats();
  if(typeof refreshMonthCalendarLabels === 'function') refreshMonthCalendarLabels();
}

// ── EXPORT PDF ── (impression navigateur → "Enregistrer au format PDF")
function exportDepPdf() {
  const prevTab = depMainTab;
  if (prevTab !== 'entry') switchDepMainTab('entry');
  document.body.classList.add('dep-printing');
  window.print();
  setTimeout(() => {
    document.body.classList.remove('dep-printing');
    if (prevTab !== 'entry') switchDepMainTab(prevTab);
  }, 500);
}

// ── ONGLET CHEQUE (liste, distincte du graphique dans Statistics → Cheque) ──
// Cheque status: Pending (default) / Cleared / Returned / Cancelled — stored
// in e.cheque.status (no server schema change needed: the depence table
// already stores each record as free-form JSON, see server.js).
const CHEQUE_STATUSES = ['pending', 'cleared', 'returned', 'cancelled'];
function chequeStatusMeta(status) {
  const t = (k, d) => translate ? translate(k) : d;
  switch (status) {
    case 'cleared': return { label: t('dep.chequeCleared', 'Cleared'), color: '#16a34a', dot: '🟢' };
    case 'returned': return { label: t('dep.chequeReturned', 'Returned'), color: '#dc2626', dot: '🔴' };
    case 'cancelled': return { label: t('dep.chequeCancelled', 'Cancelled'), color: '#6b7280', dot: '⚫' };
    default: return { label: t('dep.chequePending', 'Pending'), color: '#d97706', dot: '🟡' };
  }
}

function setChequeStatus(depId, status) {
  if (CHEQUE_STATUSES.indexOf(status) === -1) return;
  const dep = DB.depence.find(x => x.id === depId);
  if (!dep || !dep.cheque) return;
  dep.cheque.status = status;
  dep.updatedAt = Date.now();
  saveOne('depence', dep, '🧾 Cheque status updated');
  renderDepChequeList();
}

// ── Status summary — ALWAYS over the full set of cheques, independent of
// the list's from/to filter (otherwise "due this week/month" would lose its meaning) ──
function renderDepChequeStatusSummary() {
  const el = document.getElementById('depChequeStatusSummary');
  if (!el) return;
  const t = (k, d) => translate ? translate(k) : d;
  const allCheques = (DB.depence || []).filter(e => e.payment === 'Cheque');

  const totals = { pending: 0, cleared: 0, returned: 0, cancelled: 0 };
  const counts = { pending: 0, cleared: 0, returned: 0, cancelled: 0 };
  let dueThisWeek = 0, dueThisMonth = 0;
  const today = new Date();
  const in7 = new Date(today.getTime() + 7 * 86400000);
  const monthKey = today.toISOString().substring(0, 7);

  allCheques.forEach(e => {
    const chq = e.cheque || {};
    const status = CHEQUE_STATUSES.indexOf(chq.status) !== -1 ? chq.status : 'pending';
    const amount = parseFloat(e.amount) || 0;
    totals[status] += amount;
    counts[status]++;
    if (status === 'pending' && chq.date) {
      const d = new Date(chq.date);
      if (!isNaN(d.getTime())) {
        if (d >= today && d <= in7) dueThisWeek += amount;
        if (chq.date.substring(0, 7) === monthKey) dueThisMonth += amount;
      }
    }
  });

  function card(color, label, value, sub) {
    return `<div class="stat-card" style="border-left:3px solid ${color}">
      <div class="stat-label">${label}</div>
      <div class="stat-val" style="font-size:1.1rem">${fmtNum(value)} <span style="font-size:.8rem">OMR</span></div>
      ${sub ? `<div style="font-size:.72rem;color:var(--muted);margin-top:6px">${sub}</div>` : ''}
    </div>`;
  }

  el.innerHTML =
    card('#d97706', '🟡 ' + t('dep.chequePending', 'Pending'), totals.pending, counts.pending + ' ' + t('dep.charges', 'charges')) +
    card('#16a34a', '🟢 ' + t('dep.chequeCleared', 'Cleared'), totals.cleared, counts.cleared + ' ' + t('dep.charges', 'charges')) +
    card('#dc2626', '🔴 ' + t('dep.chequeReturned', 'Returned'), totals.returned, counts.returned + ' ' + t('dep.charges', 'charges')) +
    card('#6b7280', '⚫ ' + t('dep.chequeCancelled', 'Cancelled'), totals.cancelled, counts.cancelled + ' ' + t('dep.charges', 'charges')) +
    card('#0891b2', '📅 ' + t('dep.chequeDueWeek', 'Due this week'), dueThisWeek) +
    card('#4338ca', '📆 ' + t('dep.chequeDueMonth', 'Due this month'), dueThisMonth);
}

function renderDepChequeList() {
  const tbody = document.getElementById('depChequeListTbody');
  if (!tbody) return;
  const t = (k, d) => translate ? translate(k) : d;

  renderDepChequeStatusSummary();

  let list = (DB.depence || []).filter(e => e.payment === 'Cheque');
  if (depChequeListFrom) list = list.filter(e => {
    const mKey = (e.cheque && e.cheque.date) ? e.cheque.date.substring(0, 7) : (e.date ? e.date.substring(0, 7) : null);
    return mKey && mKey >= depChequeListFrom;
  });
  if (depChequeListTo) list = list.filter(e => {
    const mKey = (e.cheque && e.cheque.date) ? e.cheque.date.substring(0, 7) : (e.date ? e.date.substring(0, 7) : null);
    return mKey && mKey <= depChequeListTo;
  });
  list = list.slice().sort((a, b) => {
    const da = (a.cheque && a.cheque.date) || a.date || '';
    const db = (b.cheque && b.cheque.date) || b.date || '';
    return db.localeCompare(da);
  });

  document.getElementById('depChequeListFrom').value = depChequeListFrom;
  document.getElementById('depChequeListTo').value = depChequeListTo;

  const total = list.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
  document.getElementById('depChequeListInfo').textContent = (depChequeListFrom || depChequeListTo)
    ? `✓ ${t('dep.filtered','Filtered')}: ${depChequeListFrom || t('dep.start','start')} ${t('dep.to','to')} ${depChequeListTo || t('dep.now','now')} — ${list.length} ${t('dep.charges','charges')}`
    : `📅 ${t('dep.showingAllMonths','Showing all months')} — ${list.length} ${t('dep.charges','charges')}`;
  document.getElementById('depChequeListTotal').textContent = fmtNum(total);

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:20px;opacity:.5">${t('dep.noChequesPeriod','No cheque payments recorded for this period.')}</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(e => {
    let vehLabel = '—';
    if (e.kind === 'vehicle' && e.vehicleId) vehLabel = escapeHtml(depVehicleLabel(e.vehicleId));
    else if (e.kind === 'general') vehLabel = `<span style="opacity:.6">${t('dep.generalExpenses','General')}</span>`;
    const chq = e.cheque || {};
    const status = CHEQUE_STATUSES.indexOf(chq.status) !== -1 ? chq.status : 'pending';
    const meta = chequeStatusMeta(status);
    const statusSelect = `<select onchange="setChequeStatus(${e.id}, this.value)" style="font-size:.72rem;font-weight:700;padding:3px 6px;border-radius:6px;border:1px solid ${meta.color};color:${meta.color};background:${meta.color}14">
      ${CHEQUE_STATUSES.map(s => { const m = chequeStatusMeta(s); return `<option value="${s}" ${s === status ? 'selected' : ''}>${m.dot} ${m.label}</option>`; }).join('')}
    </select>`;
    return `<tr style="border-top:1px solid var(--border)">
      <td style="padding:8px 10px">${depFmtDate(chq.date || e.date)}</td>
      <td style="padding:8px 10px">${vehLabel}</td>
      <td style="padding:8px 10px"><span class="badge" style="background:${depTypeColor(e.category)}22;color:${depTypeColor(e.category)};padding:2px 8px;border-radius:999px;font-size:.7rem;font-weight:700">${escapeHtml(e.category || '')}</span></td>
      <td style="padding:8px 10px;text-align:right;font-weight:700;font-family:var(--mono,monospace)">${fmtNum(e.amount)}</td>
      <td style="padding:8px 10px">${escapeHtml(chq.name || '—')}</td>
      <td style="padding:8px 10px;font-family:var(--mono,monospace)">${escapeHtml(chq.number || '—')}</td>
      <td style="padding:8px 10px">${statusSelect}</td>
    </tr>`;
  }).join('');
}

function clearDepChequeListFilters() {
  depChequeListFrom = '';
  depChequeListTo = '';
  renderDepChequeList();
}

// ── ONGLET FLEET MANAGEMENT (aperçu des dépenses groupées par modèle) ──
// Lecture seule : les véhicules eux-mêmes sont gérés dans le module Fleet
// (module-fleet-database.js) — ici on affiche juste leurs dépenses agrégées.
function depGroupVehiclesByModel() {
  const groups = {};
  (DB.vehicles || []).forEach(v => {
    const model = (v.name || 'N/A').toUpperCase();
    if (!groups[model]) groups[model] = [];
    groups[model].push(v);
  });
  return groups;
}

// ── depResolveNormalizedPlate — clé d'identification UNIQUE pour croiser dépenses
// et revenus sur la même voiture. Même fonction que "By Vehicle" / Profit
// (normalizePlateGlobal), pour éviter tout chevauchement/discordance entre modules :
// une dépense saisie via vehicleId et un paiement résolu via plaque brute doivent
// TOUJOURS tomber sur la même clé. Fallback 'VID:<id>' uniquement si le véhicule a
// été supprimé entre-temps (pour ne jamais perdre une dépense déjà enregistrée). ──
function depResolveNormalizedPlate(vehicleId) {
  const v = (DB.vehicles || []).find(x => x.id === Number(vehicleId));
  if (v && v.plate) {
    return (typeof normalizePlateGlobal === 'function') ? normalizePlateGlobal(v.plate) : String(v.plate).trim().toUpperCase();
  }
  return 'VID:' + vehicleId;
}

function renderDepFleetManagement() {
  const container = document.getElementById('depFmGroupsContainer');
  if (!container) return;
  const t = (k, d) => translate ? translate(k) : d;

  const countEl = document.getElementById('depFmVehicleCount');
  if (countEl) countEl.textContent = String((DB.vehicles || []).length);

  // Agrégats de dépenses PAR PLAQUE NORMALISÉE (toutes périodes confondues) —
  // même identification que Revenue Stats "By Vehicle" / l'onglet Profit.
  const expenseByPlate = {};
  (DB.depence || []).forEach(e => {
    if (e.kind !== 'vehicle' || !e.vehicleId) return;
    const key = depResolveNormalizedPlate(e.vehicleId);
    if (!expenseByPlate[key]) expenseByPlate[key] = { total: 0, count: 0 };
    expenseByPlate[key].total += (parseFloat(e.amount) || 0);
    expenseByPlate[key].count++;
  });

  let groups = depGroupVehiclesByModel();
  let modelNames = Object.keys(groups);

  // Filtre recherche (modèle ou plaque)
  if (depFmSearchTerm) {
    modelNames = modelNames.filter(model => {
      if (model.toLowerCase().includes(depFmSearchTerm)) return true;
      return groups[model].some(v => (v.plate || '').toLowerCase().includes(depFmSearchTerm));
    });
  }

  // Liste plate de tous les véhicules (tous modèles confondus), avec leur modèle attaché
  let allVehicles = [];
  modelNames.forEach(model => {
    groups[model].forEach(v => allVehicles.push({ v, model, plateKey: (typeof normalizePlateGlobal === 'function') ? normalizePlateGlobal(v.plate) : String(v.plate || '').trim().toUpperCase() }));
  });

  if (depFmSortBy === 'expenses') {
    allVehicles.sort((a, b) => ((expenseByPlate[b.plateKey] || {}).total || 0) - ((expenseByPlate[a.plateKey] || {}).total || 0));
  } else if (depFmSortBy === 'count') {
    allVehicles.sort((a, b) => ((expenseByPlate[b.plateKey] || {}).count || 0) - ((expenseByPlate[a.plateKey] || {}).count || 0));
  } else {
    allVehicles.sort((a, b) => (a.v.plate || '').localeCompare(b.v.plate || ''));
  }

  if (!allVehicles.length) {
    container.innerHTML = `<div style="text-align:center;padding:30px;opacity:.5">${t('dep.noVehiclesFound','No vehicles found.')}</div>`;
    return;
  }

  const cardsHtml = allVehicles.map(({ v, model, plateKey }) => {
    const agg = expenseByPlate[plateKey] || { total: 0, count: 0 };
    const hasExp = !!agg.count;
    const dotColor = depTypeColor(model);
    const vBadgeStyle = (typeof getVehicleBadgeStyle === 'function') ? getVehicleBadgeStyle(v.name || model) : `background:${dotColor}22;color:${dotColor}`;
    const cardBorderTop = hasExp ? `3px solid ${dotColor}` : '3px solid var(--border)';
    return `<div style="background:var(--s1);border:1px solid var(--border);border-radius:12px;overflow:hidden;border-top:${cardBorderTop};box-shadow:0 1px 4px rgba(0,0,0,.06);transition:box-shadow .2s,transform .15s"
      onmouseover="this.style.boxShadow='0 4px 16px rgba(0,0,0,.12)';this.style.transform='translateY(-1px)'"
      onmouseout="this.style.boxShadow='0 1px 4px rgba(0,0,0,.06)';this.style.transform='translateY(0)'">

      <!-- Card header -->
      <div style="padding:10px 14px;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--border)">
        <span class="badge" style="${vBadgeStyle};font-size:.78rem;font-weight:700;flex-shrink:0">${escapeHtml(model)}</span>
        <span style="font-family:var(--mono);font-weight:700;font-size:.88rem;color:var(--text)">${escapeHtml(v.plate || '')}</span>
        <span style="width:9px;height:9px;border-radius:999px;background:${dotColor};flex-shrink:0;margin-left:auto"></span>
      </div>

      <!-- Card body -->
      <div style="padding:12px 14px">
        <div style="background:var(--s2);border-radius:7px;padding:8px 10px">
          <div style="font-size:.68rem;text-transform:uppercase;letter-spacing:.4px;color:var(--muted);font-weight:600;margin-bottom:3px">${agg.count} ${agg.count === 1 ? t('dep.expenseSingular','expense') : t('dep.expensePlural','expenses')}</div>
          <span style="font-family:var(--mono);font-weight:700;font-size:.9rem${hasExp ? `;color:${dotColor}` : ';color:var(--muted);font-style:italic;font-weight:500'}">${hasExp ? fmtNum(agg.total) + ' OMR' : t('dep.noExpensesYet','No expenses yet')}</span>
        </div>
      </div>

      <!-- Card footer -->
      <div style="padding:8px 14px 10px;display:flex;justify-content:flex-end;border-top:1px solid var(--border)">
        <button type="button" class="btn btn-ghost" style="padding:5px 14px;font-size:.82rem;color:${dotColor};border-color:${dotColor}55" data-dep-action="view-vehicle-expenses" data-vehicle-id="${v.id}">${t('dep.viewExpenses','View expenses')} →</button>
      </div>
    </div>`;
  }).join('');

  container.innerHTML = `<div style="padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px">${cardsHtml}</div>`;
}

// ═══════════════════════ ACHAT — Prix d'achat par véhicule (saisie manuelle) ═══════════════════════
// Utilisé pour le calcul du ROI dans Revenue Stats. Sauvegardé directement sur
// le record du véhicule (DB.vehicles / table 'vehicles') via saveOne(), champs
// purchasePrice et purchaseDate (pour le ROI annualisé). Le champ resalePrice
// (valeur de revente) a été retiré (2026-08) — voir saveDepVehicleResalePrice
// plus bas dans ce fichier.
function renderDepAchat() {
  const container = document.getElementById('depAchatCardsContainer');
  if (!container) return;
  const t = (k, d) => translate ? translate(k) : d;

  let vehicles = (DB.vehicles || []).slice().sort((a, b) => (a.plate || '').localeCompare(b.plate || ''));

  const countEl = document.getElementById('depAchatVehicleCount');
  if (countEl) countEl.textContent = String(vehicles.length);

  if (depAchatSearchTerm) {
    vehicles = vehicles.filter(v =>
      (v.name || '').toLowerCase().includes(depAchatSearchTerm) ||
      (v.plate || '').toLowerCase().includes(depAchatSearchTerm)
    );
  }

  if (!vehicles.length) {
    container.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:30px;opacity:.5">${t('dep.noVehiclesFound', 'No vehicles found.')}</div>`;
    return;
  }

  container.innerHTML = vehicles.map(v => {
    const model = v.name || '';
    const dotColor = depTypeColor(model);
    const vBadgeStyle = (typeof getVehicleBadgeStyle === 'function') ? getVehicleBadgeStyle(model) : `background:${dotColor}22;color:${dotColor}`;
    const price = (v.purchasePrice !== undefined && v.purchasePrice !== null && v.purchasePrice !== 0) ? v.purchasePrice : '';
    const hasPrice = price !== '';
    const purchaseDate = v.purchaseDate || '';
    const cardBorderTop = hasPrice ? `3px solid ${dotColor}` : '3px solid var(--border)';
    return `<div style="background:var(--s1);border:1px solid var(--border);border-radius:12px;overflow:hidden;border-top:${cardBorderTop};box-shadow:0 1px 4px rgba(0,0,0,.06);transition:box-shadow .2s,transform .15s"
      onmouseover="this.style.boxShadow='0 4px 16px rgba(0,0,0,.12)';this.style.transform='translateY(-1px)'"
      onmouseout="this.style.boxShadow='0 1px 4px rgba(0,0,0,.06)';this.style.transform='translateY(0)'">

      <!-- Card header -->
      <div style="padding:10px 14px;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--border)">
        <span class="badge" style="${vBadgeStyle};font-size:.78rem;font-weight:700;flex-shrink:0">${escapeHtml(model)}</span>
        <span style="font-family:var(--mono);font-weight:700;font-size:.88rem;color:var(--text)">${escapeHtml(v.plate || '')}</span>
        <span style="width:9px;height:9px;border-radius:999px;background:${dotColor};flex-shrink:0;margin-left:auto"></span>
      </div>

      <!-- Card body — editable purchase price / date. Resale Value retiré (2026-08) :
           n'entrait plus dans aucun calcul (voir calculateRoiStats, module-revenue-stats.js),
           le champ de saisie est supprimé pour ne pas laisser une donnée morte dans l'UI. -->
      <div style="padding:12px 14px;display:flex;flex-direction:column;gap:10px">
        <div>
          <label style="font-size:.68rem;text-transform:uppercase;letter-spacing:.4px;color:var(--muted);font-weight:600;display:block;margin-bottom:5px">${t('dep.purchasePriceCol', 'Purchase Price (OMR)')}</label>
          <input type="number" min="0" step="0.01" value="${price}"
                 data-achat-vehicle-id="${v.id}"
                 placeholder="0.00"
                 style="width:100%;box-sizing:border-box;padding:8px 10px;border-radius:7px;border:1px solid var(--border);background:var(--s2);font-size:.92rem;font-weight:700;font-family:var(--mono);color:${hasPrice ? dotColor : 'var(--text)'}"
                 onchange="saveDepVehiclePurchasePrice(${v.id}, this.value)">
        </div>
        <div>
          <label style="font-size:.68rem;text-transform:uppercase;letter-spacing:.4px;color:var(--muted);font-weight:600;display:block;margin-bottom:5px">${t('dep.purchaseDateCol', 'Purchase Date')}</label>
          <input type="date" value="${purchaseDate}"
                 data-achat-date-vehicle-id="${v.id}"
                 style="width:100%;box-sizing:border-box;padding:8px 10px;border-radius:7px;border:1px solid var(--border);background:var(--s2);font-size:.86rem;font-weight:600;font-family:var(--mono);color:${purchaseDate ? dotColor : 'var(--text)'}"
                 onchange="saveDepVehiclePurchaseDate(${v.id}, this.value)">
        </div>
      </div>
    </div>`;
  }).join('');
}
window.renderDepAchat = renderDepAchat;

function saveDepVehiclePurchasePrice(vehicleId, value) {
  const v = (DB.vehicles || []).find(x => x.id === Number(vehicleId));
  if (!v) return;
  v.purchasePrice = Math.max(0, parseFloat(value) || 0);
  if (typeof saveOne === 'function') {
    saveOne('vehicles', v, translate ? translate('dep.purchasePriceSaved') : 'Purchase price saved');
  }
}
window.saveDepVehiclePurchasePrice = saveDepVehiclePurchasePrice;

function saveDepVehiclePurchaseDate(vehicleId, value) {
  const v = (DB.vehicles || []).find(x => x.id === Number(vehicleId));
  if (!v) return;
  v.purchaseDate = value || '';
  if (typeof saveOne === 'function') {
    saveOne('vehicles', v, translate ? translate('dep.purchaseDateSaved') : 'Purchase date saved');
  }
}
window.saveDepVehiclePurchaseDate = saveDepVehiclePurchaseDate;

// saveDepVehicleResalePrice() supprimée (2026-08) — le champ Resale Value est
// retiré de l'onglet Achat. Si des véhicules ont encore un v.resalePrice
// enregistré en base d'une saisie précédente, la donnée reste dans DB.vehicles
// (pas de migration destructive) mais n'est plus éditable ni utilisée nulle part.

// ═══════════════════════ IMPORT EXCEL (nouveau) ═══════════════════════
// Bouton injecté dynamiquement à côté des onglets principaux (.dep-main-tab)
// car ce fichier ne contrôle pas le HTML du menu (vit dans app.html). Ouvre
// une modale autonome (construite en JS, pas dépendante d'openModal/closeModal)
// qui charge SheetJS à la demande, parse le fichier, propose un mapping de
// colonnes auto-détecté + éditable, prévisualise, puis insère chaque ligne
// valide via le même chemin que l'ajout manuel (saveExpense() par enregistrement,
// donc même garde anti-régression updatedAt côté serveur — voir en-tête de fichier).

let depExcelParsedData = null; // { headers, rows, mapping, sheetName }
let _sheetJsLoadPromise = null;

const DEP_EXCEL_FIELDS = [
  { key: 'ignore',   label: 'Ignore' },
  { key: 'date',     label: 'Date' },
  { key: 'vehicle',  label: 'Vehicle' },
  { key: 'category', label: 'Category' },
  { key: 'amount',   label: 'Amount' },
  { key: 'payment',  label: 'Payment mode' },
  { key: 'details',  label: 'Details' }
];

function _loadSheetJs() {
  if (window.XLSX) return Promise.resolve();
  if (_sheetJsLoadPromise) return _sheetJsLoadPromise;
  _sheetJsLoadPromise = new Promise(function(resolve, reject) {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('SheetJS load failed'));
    document.head.appendChild(script);
  });
  return _sheetJsLoadPromise;
}

// Injecte le bouton "📥 Import Excel" à côté des onglets .dep-main-tab.
// Appelé au chargement du script ET à chaque renderDepence() (le hook plus
// bas), pour survivre à un éventuel re-rendu complet du conteneur d'onglets.
function injectDepExcelImportButton() {
  if (document.getElementById('depExcelImportBtn')) return;
  const anyTab = document.querySelector('.dep-main-tab');
  if (!anyTab || !anyTab.parentElement) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'depExcelImportBtn';
  btn.className = 'dep-main-tab';
  btn.setAttribute('data-dep-action', 'open-import-excel');
  btn.style.cssText = 'margin-left:auto;background:#4f46e5;color:#fff;border:none;border-radius:8px;font-weight:600';
  btn.textContent = '📥 Import Excel';
  anyTab.parentElement.appendChild(btn);
}
window.injectDepExcelImportButton = injectDepExcelImportButton;

function ensureDepExcelModalDom() {
  if (document.getElementById('depExcelImportOverlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'depExcelImportOverlay';
  overlay.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;align-items:flex-start;justify-content:center;padding:30px 16px;overflow:auto';
  overlay.innerHTML = `
    <div style="background:var(--s1);border-radius:14px;max-width:920px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,.3);overflow:hidden">
      <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
        <h3 style="margin:0;font-size:1.05rem">📥 Import Expenses from Excel</h3>
        <button type="button" onclick="closeDepExcelImportModal()" style="background:none;border:none;font-size:1.3rem;cursor:pointer;opacity:.6;line-height:1">✕</button>
      </div>
      <div style="padding:18px 20px;max-height:72vh;overflow:auto">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:6px">
          <input type="file" id="depExcelFileInput" accept=".xlsx,.xls,.csv" onchange="handleDepExcelFileSelect(event)"
                 style="border:1px solid var(--border);border-radius:8px;padding:8px;background:var(--s2);flex:1;min-width:220px;color:var(--text)">
          <span id="depExcelLoadStatus" style="font-size:.85rem;opacity:.7"></span>
        </div>
        <div style="font-size:.78rem;opacity:.6;margin-bottom:14px">Accepted: .xlsx, .xls, .csv — expected columns: Date, Vehicle (plate), Category, Amount, Payment mode, Details. Order doesn't matter — adjust the mapping below after upload. Rows already matching an existing expense (same date + amount + category + vehicle) are skipped as duplicates.</div>
        <div id="depExcelPreviewArea"></div>
      </div>
      <div style="padding:14px 20px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:10px">
        <button type="button" class="btn btn-ghost" onclick="closeDepExcelImportModal()">Cancel</button>
        <button type="button" class="btn" id="depExcelImportConfirmBtn" disabled onclick="confirmDepExcelImport()" style="background:#4f46e5;color:#fff;opacity:.5">✔️ Import</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', function(e) { if (e.target === overlay) closeDepExcelImportModal(); });
}

function openDepExcelImportModal() {
  ensureDepExcelModalDom();
  document.getElementById('depExcelImportOverlay').style.display = 'flex';
  document.getElementById('depExcelFileInput').value = '';
  document.getElementById('depExcelPreviewArea').innerHTML = '';
  const confirmBtn = document.getElementById('depExcelImportConfirmBtn');
  confirmBtn.disabled = true;
  confirmBtn.style.opacity = '.5';
  confirmBtn.innerHTML = '✔️ Import';
  document.getElementById('depExcelLoadStatus').textContent = '';
  depExcelParsedData = null;
}
window.openDepExcelImportModal = openDepExcelImportModal;

function closeDepExcelImportModal() {
  const overlay = document.getElementById('depExcelImportOverlay');
  if (overlay) overlay.style.display = 'none';
}
window.closeDepExcelImportModal = closeDepExcelImportModal;

function depNormalizePlate(str) {
  return String(str || '').toUpperCase().replace(/[\s\-–—_.]/g, '');
}

function depMatchVehicleFromText(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const low = raw.toLowerCase();
  if (['general', 'générale', 'generale', 'general expenses', 'none', '-'].includes(low)) return null;
  const normInput = depNormalizePlate(raw);
  const vehicles = DB.vehicles || [];
  let found = vehicles.find(v => v.plate && depNormalizePlate(v.plate) === normInput);
  if (found) return found;
  found = vehicles.find(v => v.plate && depNormalizePlate(v.plate).length >= 3 && normInput.includes(depNormalizePlate(v.plate)));
  if (found) return found;
  found = vehicles.find(v => v.name && low.includes(String(v.name).toLowerCase()));
  return found || null;
}

function depParseExcelDate(val) {
  if (val === null || val === undefined || val === '') return '';
  if (val instanceof Date && !isNaN(val)) {
    // SheetJS (cellDates) renvoie minuit HEURE LOCALE : toISOString() (UTC) décalait d'un jour
    // en GMT+4. +12h puis getters locaux = robuste quel que soit le fuseau / les secondes parasites.
    const d0 = new Date(val.getTime() + 12 * 3600 * 1000);
    return d0.getFullYear() + '-' + String(d0.getMonth() + 1).padStart(2, '0') + '-' + String(d0.getDate()).padStart(2, '0');
  }
  if (typeof val === 'number') {
    const d = new Date(Math.round((val - 25569) * 86400 * 1000)); // Excel serial date
    if (!isNaN(d)) return d.toISOString().substring(0, 10);
  }
  const s = String(val).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[3]).padStart(2, '0');
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) return m[3] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0'); // DD/MM/YYYY
  const d2 = new Date(s);
  if (!isNaN(d2)) return d2.toISOString().substring(0, 10);
  return '';
}

function depGuessColumnMapping(headers) {
  const rules = [
    { key: 'date',     words: ['date', 'jour', 'day'] },
    { key: 'vehicle',  words: ['véhicule', 'vehicule', 'vehicle', 'voiture', 'plaque', 'plate', 'car', 'immatricul'] },
    { key: 'category', words: ['catégorie', 'categorie', 'category', 'type'] },
    { key: 'amount',   words: ['montant', 'amount', 'prix', 'total', 'omr', 'cost', 'valeur'] },
    { key: 'payment',  words: ['paiement', 'payment', 'mode', 'règlement', 'reglement'] },
    { key: 'details',  words: ['détail', 'detail', 'description', 'note', 'remarque', 'commentaire', 'observation'] }
  ];
  const used = new Set();
  return headers.map(h => {
    const low = String(h || '').toLowerCase();
    for (const rule of rules) {
      if (used.has(rule.key)) continue;
      if (rule.words.some(w => low.includes(w))) { used.add(rule.key); return rule.key; }
    }
    return 'ignore';
  });
}

// ── Fichiers SANS ligne de titres (ex. relevés mensuels bruts) ──────────────────
// Avant : la 1re ligne était toujours prise pour l'en-tête → 1 dépense perdue + tout en "Ignore".
// Maintenant : si la 1re ligne contient une date / un nombre / une plaque, c'est une ligne de
// données ; le mapping est ensuite deviné d'après le CONTENU des colonnes (date, plaque, montant,
// texte le plus long = détails). Le mapping reste modifiable dans la modale.
const DEP_PLATE_RE = /^\d{1,5}\s*[-–]?\s*[A-Za-z]{1,2}$/;

function depCellIsDate(c) {
  if (c instanceof Date) return !isNaN(c);
  const s = String(c).trim();
  return /^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}$/.test(s) || /^\d{4}-\d{1,2}-\d{1,2}/.test(s);
}

function depCellIsAmount(c) {
  if (typeof c === 'number') return isFinite(c);
  return /^\d+([.,]\d+)?\s*-?$/.test(String(c).trim());
}

function depRowLooksLikeData(row) {
  return (row || []).some(c => {
    if (c === null || c === undefined || String(c).trim() === '') return false;
    return depCellIsDate(c) || typeof c === 'number' || DEP_PLATE_RE.test(String(c).trim());
  });
}

function depFillMappingFromContent(mapping, rows) {
  const sample = rows.slice(0, 60);
  const nCols = Math.max(mapping.length, ...sample.map(r => r.length));
  const st = [];
  for (let c = 0; c < nCols; c++) {
    const s = { date: 0, vehicle: 0, amount: 0, text: 0, textLen: 0 };
    sample.forEach(r => {
      const v = r[c];
      if (v === undefined || v === null || String(v).trim() === '') return;
      if (depCellIsDate(v)) s.date++;
      else if (DEP_PLATE_RE.test(String(v).trim())) s.vehicle++;
      else if (depCellIsAmount(v)) s.amount++;
      else { s.text++; s.textLen += String(v).trim().length; }
    });
    st.push(s);
  }
  const taken = new Set(mapping.filter(m => m !== 'ignore'));
  const pick = (key, score) => {
    if (taken.has(key)) return;
    let best = -1, bestScore = 0;
    for (let c = 0; c < nCols; c++) {
      if (mapping[c] && mapping[c] !== 'ignore') continue;
      const sc = score(st[c]);
      if (sc > bestScore) { bestScore = sc; best = c; }
    }
    if (best >= 0) { mapping[best] = key; taken.add(key); }
  };
  pick('date',    s => s.date >= 3 ? s.date : 0);
  pick('vehicle', s => s.vehicle >= 3 ? s.vehicle : 0);
  pick('amount',  s => s.amount >= 3 ? s.amount : 0);
  pick('details', s => s.text >= 3 ? s.textLen / s.text : 0);
  return mapping;
}

function depBuildExcelTable(rowsRaw) {
  const first = rowsRaw[0];
  const hasHeader = !depRowLooksLikeData(first);
  const headers = hasHeader ? first.map(h => String(h || '').trim()) : first.map((_, i) => 'Col ' + (i + 1));
  const rows = hasHeader ? rowsRaw.slice(1) : rowsRaw;
  const mapping = depGuessColumnMapping(hasHeader ? headers : headers.map(() => ''));
  while (mapping.length < headers.length) mapping.push('ignore');
  return { headers, rows, mapping: depFillMappingFromContent(mapping, rows), hasHeader };
}

// Plaque du fichier introuvable dans la flotte : propose la plaque de la flotte qui a le même
// numéro (ex. "1292-T" → "1234-T") si elle est unique. Affichage seulement, jamais appliqué seul.
function depSuggestPlate(text) {
  const num = s => (depNormalizePlate(s).match(/^\d+/) || [''])[0];
  const n = num(text);
  if (!n) return '';
  const c = (DB.vehicles || []).filter(v => v.plate && num(v.plate) === n);
  return c.length === 1 ? c[0].plate : '';
}

function depExcelColumnSelectHtml(colIdx, currentVal) {
  const opts = DEP_EXCEL_FIELDS.map(f => `<option value="${f.key}" ${f.key === currentVal ? 'selected' : ''}>${f.label}</option>`).join('');
  return `<select onchange="depExcelUpdateMapping(${colIdx}, this.value)" style="width:100%;padding:5px 6px;border-radius:6px;border:1px solid var(--border);background:var(--s2);font-size:.8rem;color:var(--text)">${opts}</select>`;
}

function depExcelUpdateMapping(colIdx, value) {
  if (!depExcelParsedData) return;
  depExcelParsedData.mapping[colIdx] = value;
  renderDepExcelPreview();
}
window.depExcelUpdateMapping = depExcelUpdateMapping;

function depExcelBuildRow(mapping, row) {
  const out = {};
  mapping.forEach((field, idx) => {
    if (field === 'ignore') return;
    out[field] = row[idx] !== undefined ? row[idx] : '';
  });
  return out;
}

function depExcelValidateRow(raw) {
  const amount = parseFloat(String(raw.amount !== undefined ? raw.amount : '').replace(',', '.'));
  const date = depParseExcelDate(raw.date);
  const vehicleText = String(raw.vehicle || '').trim();
  const vehicle = depMatchVehicleFromText(vehicleText);
  const kind = vehicleText && !['general', 'générale', 'generale'].includes(vehicleText.toLowerCase()) ? 'vehicle' : 'general';
  const category = String(raw.category || '').trim() || 'Uncategorized';
  const paymentRaw = String(raw.payment || '').trim().toLowerCase();
  const payment = /ch[eè]que|check/.test(paymentRaw) ? 'Cheque' : 'Cash';
  const details = String(raw.details || '').trim();
  const errors = [];
  if (!amount || amount <= 0) errors.push('amount');
  if (!date) errors.push('date');
  if (kind === 'vehicle' && !vehicle) errors.push('vehicle');
  const categoryExists = (DB.depenceCategories || []).some(c => c.name.toLowerCase() === category.toLowerCase());
  return { amount, date, vehicle, vehicleText, kind, category, categoryExists, payment, details, errors };
}

function handleDepExcelFileSelect(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const status = document.getElementById('depExcelLoadStatus');
  if (status) status.textContent = '⏳ Reading file...';
  _loadSheetJs().then(function() {
    const reader = new FileReader();
    reader.onload = function(evt) {
      try {
        const data = new Uint8Array(evt.target.result);
        const wb = XLSX.read(data, { type: 'array', cellDates: true });
        const sheetName = wb.SheetNames[0];
        const sheet = wb.Sheets[sheetName];
        const rowsRaw = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' })
          .filter(r => r.some(c => String(c).trim() !== ''));
        if (!rowsRaw.length) throw new Error('empty');
        const tbl = depBuildExcelTable(rowsRaw);
        const rows = tbl.rows;
        depExcelParsedData = { headers: tbl.headers, rows, mapping: tbl.mapping, sheetName };
        if (status) status.textContent = '✅ ' + rows.length + ' row(s) found in "' + sheetName + '"' + (tbl.hasHeader ? '' : ' — no header row detected, columns guessed from content');
        renderDepExcelPreview();
      } catch (err) {
        console.error('[Dépense] Excel read error:', err);
        if (status) status.textContent = '❌ Could not read this file.';
        depExcelParsedData = null;
        const btn = document.getElementById('depExcelImportConfirmBtn');
        if (btn) { btn.disabled = true; btn.style.opacity = '.5'; }
      }
    };
    reader.readAsArrayBuffer(file);
  }).catch(function(err) {
    console.warn('[Dépense] SheetJS unavailable:', err.message);
    if (status) status.textContent = '❌ Import library unavailable (check internet connection).';
  });
}
window.handleDepExcelFileSelect = handleDepExcelFileSelect;

function renderDepExcelPreview() {
  const area = document.getElementById('depExcelPreviewArea');
  const confirmBtn = document.getElementById('depExcelImportConfirmBtn');
  if (!area || !depExcelParsedData) return;
  const { headers, rows, mapping } = depExcelParsedData;

  const validated = rows.map(r => depExcelValidateRow(depExcelBuildRow(mapping, r)));
  const validCount = validated.filter(v => v.errors.length === 0).length;
  const errorCount = validated.length - validCount;
  const newCategories = [...new Set(validated.filter(v => v.errors.length === 0 && !v.categoryExists).map(v => v.category))];
  const unmatchedVehicleCount = validated.filter(v => v.errors.includes('vehicle')).length;
  const unmatchedList = [...new Set(validated.filter(v => v.errors.includes('vehicle')).map(v => v.vehicleText))]
    .slice(0, 20).map(t => { const sg = depSuggestPlate(t); return escapeHtml(t) + (sg ? ' <span style="opacity:.6">(→ ' + escapeHtml(sg) + '?)</span>' : ''); });

  const mappingRow = headers.map((h, i) => `
    <th style="padding:6px 8px;text-align:left;min-width:130px">
      <div style="font-size:.72rem;opacity:.6;margin-bottom:3px;font-weight:600">${escapeHtml(h || ('Col ' + (i + 1)))}</div>
      ${depExcelColumnSelectHtml(i, mapping[i])}
    </th>`).join('');

  const previewRows = rows.slice(0, 8).map((r, ri) => {
    const v = validated[ri];
    const rowBg = v.errors.length ? 'background:#fee2e2' : '';
    return `<tr style="${rowBg};border-top:1px solid var(--border)">
      ${r.map(c => `<td style="padding:5px 8px;font-size:.78rem;opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:140px">${escapeHtml(String(c))}</td>`).join('')}
    </tr>`;
  }).join('');

  area.innerHTML = `
    <div style="overflow-x:auto;border:1px solid var(--border);border-radius:8px;margin-bottom:12px">
      <table style="border-collapse:collapse;width:100%">
        <thead><tr style="background:var(--s2)">${mappingRow}</tr></thead>
        <tbody>${previewRows}</tbody>
      </table>
    </div>
    ${rows.length > 8 ? `<div style="font-size:.75rem;opacity:.55;margin-bottom:10px">… and ${rows.length - 8} more row(s)</div>` : ''}
    <div style="display:flex;flex-wrap:wrap;gap:10px;font-size:.85rem">
      <span style="padding:5px 10px;border-radius:999px;background:#dcfce7;color:#166534;font-weight:600">✅ ${validCount} valid row(s)</span>
      ${errorCount ? `<span style="padding:5px 10px;border-radius:999px;background:#fee2e2;color:#991b1b;font-weight:600">⚠️ ${errorCount} row(s) skipped (missing/invalid date, amount or vehicle)</span>` : ''}
      ${unmatchedVehicleCount ? `<span style="padding:5px 10px;border-radius:999px;background:#fef3c7;color:#92400e;font-weight:600">🚗 ${unmatchedVehicleCount} unmatched vehicle(s)</span>` : ''}
      ${newCategories.length ? `<span style="padding:5px 10px;border-radius:999px;background:#e0e7ff;color:#3730a3;font-weight:600">🏷️ +${newCategories.length} new categor${newCategories.length > 1 ? 'ies' : 'y'}: ${escapeHtml(newCategories.join(', '))}</span>` : ''}
    </div>
    ${unmatchedList.length ? `<div style="font-size:.78rem;margin-top:10px;line-height:1.7"><b>Plates not found in the fleet:</b> ${unmatchedList.join(' · ')}${unmatchedVehicleCount > unmatchedList.length ? ' …' : ''}</div>` : ''}`;

  if (confirmBtn) {
    confirmBtn.disabled = validCount === 0;
    confirmBtn.style.opacity = validCount === 0 ? '.5' : '1';
    confirmBtn.innerHTML = '✔️ Import (' + validCount + ')';
  }
}
window.renderDepExcelPreview = renderDepExcelPreview;

function confirmDepExcelImport() {
  if (!depExcelParsedData) return;
  const { rows, mapping } = depExcelParsedData;
  const validated = rows.map(r => depExcelValidateRow(depExcelBuildRow(mapping, r)));

  let imported = 0, skipped = 0, duplicates = 0;
  const createdCategories = [];

  validated.forEach(v => {
    if (v.errors.length) { skipped++; return; }

    const isDup = (DB.depence || []).some(e =>
      e.date === v.date && Number(e.amount) === Number(v.amount) &&
      e.category === v.category && String(e.vehicleId || '') === String(v.vehicle ? v.vehicle.id : '')
    );
    if (isDup) { duplicates++; return; }

    if (!v.categoryExists) {
      DB.depenceCategories = DB.depenceCategories || [];
      if (!DB.depenceCategories.some(c => c.name.toLowerCase() === v.category.toLowerCase())) {
        DB.depenceCategories.push({ name: v.category, scope: 'both' });
        createdCategories.push(v.category);
      }
    }

    // Bulk import : pas de détails de chèque individuels dans l'Excel standard →
    // on force Cash pour ne jamais créer une dépense payment='Cheque' avec
    // cheque=null (romprait l'onglet Cheque). L'info reste tracée dans "details"
    // pour édition manuelle si besoin.
    const wasCheque = v.payment === 'Cheque';
    const data = {
      id: _genId(),
      kind: v.vehicle ? 'vehicle' : 'general',
      vehicleId: v.vehicle ? v.vehicle.id : null,
      category: v.category,
      amount: v.amount,
      payment: 'Cash',
      date: v.date,
      details: v.details || ('Imported from Excel' + (wasCheque ? ' (originally Cheque — set to Cash, edit to attach cheque details)' : '')),
      cheque: null
    };
    DB.depence.push(data);
    saveExpense(data.id);
    imported++;
  });

  if (createdCategories.length) saveDepenceCategories();

  if (typeof logAction === 'function') {
    logAction('import_excel', '📥 Excel Import — Expenses', imported + ' imported, ' + skipped + ' skipped, ' + duplicates + ' duplicate(s)', 'GENERAL');
  }
  if (typeof updateLogBadge === 'function') updateLogBadge();

  closeDepExcelImportModal();
  depFilterMonth = new Date().toISOString().substring(0, 7); // laisse voir les lignes fraîchement importées si récentes
  renderDepence();

  const msg = '✅ ' + imported + ' expense(s) imported'
    + (skipped ? ' — ' + skipped + ' skipped' : '')
    + (duplicates ? ' — ' + duplicates + ' duplicate(s) avoided' : '')
    + (createdCategories.length ? ' — ' + createdCategories.length + ' new categor' + (createdCategories.length > 1 ? 'ies' : 'y') : '');
  if (typeof showToast === 'function') showToast(msg); else alert(msg);
}
window.confirmDepExcelImport = confirmDepExcelImport;

// ═══════════════════════ IMPORT CHEQUES (CHEQUE.xlsx : blocs 2026 / 2027 / 2028) ═══════════════════════
// L'import Excel générique ci-dessus force tout en Cash (pas de détails de chèque). Celui-ci
// est dédié au classeur de chèques : plusieurs blocs côte à côte (N° chèque | Date | PAID |
// Année | Mois | Bénéficiaire | Montant), un sous-bloc par mois, lignes TOTAL au milieu.
//
// Règle d'or : AUCUNE ligne ne disparaît. Toute ligne avec un bénéficiaire ou un montant est
// importée ; les anomalies (année erronée, date texte, montant "10.000-", N° manquant, date
// absente) sont corrigées automatiquement, signalées en ⚠️ dans l'aperçu et éditables avant
// de valider. Chaque chèque crée une dépense payment='Cheque' avec cheque={amount,name,date,
// number,status} (même structure que la modale manuelle → onglet Cheque, stats, fournisseurs,
// alertes d'échéance). Ré-import sans risque : un N° de chèque déjà présent n'est jamais dupliqué.

let depChequeImport = null; // { rows, notes, groups, statusMode, fileName }

// <<DEP-CH-PURE-START>> (fonctions pures — aucune dépendance DOM/DB, testables hors navigateur)
const DEP_CH_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Catégories : liste de noms candidats (EN/FR/AR). Si l'un existe déjà dans DB.depenceCategories
// il est réutilisé tel quel ; sinon le 1er est créé (scope 'both', comme l'import générique).
const DEP_CH_CATS = {
  rent:      ['Rent', 'Loyer', 'Rental', 'ايجار', 'إيجار'],
  insurance: ['Insurance', 'Assurance', 'تأمين', 'تامين'],
  gps:       ['GPS & Tracking', 'GPS', 'Tracking', 'Abonnement GPS'],
  maint:     ['Maintenance', 'Entretien', 'Repairs', 'Réparation', 'Garage', 'صيانة'],
  purchase:  ['Vehicle Purchase', 'Achat véhicules', 'Achat vehicules', 'Purchase', 'Achat'],
  transport: ['Transport', 'Staff Transport', 'Bus'],
  social:    ['Social Security', 'Sécurité sociale', 'Securite sociale'],
  school:    ['School Fees', 'Education', 'Scolarité', 'School'],
  other:     ['Other', 'Autres', 'Divers', 'Uncategorized']
};

// Correspondance bénéficiaire → nom canonique + catégorie. Le texte complet de l'Excel reste
// dans "details". Un même bénéficiaire écrit de plusieurs façons (fautes de frappe) est ramené
// à UN nom canonique → le module Fournisseurs les regroupe correctement.
const DEP_CH_RULES = [
  { keys: ['station demo'],  name: 'Station Démo Fuel',   cat: 'purchase' },
  { keys: ['garage demo'],   name: 'Garage Démo Central', cat: 'purchase' },
  { keys: ['assurance demo'],name: 'Assurance Démo',      cat: 'other' },
  { keys: ['pneus demo'],    name: 'Pneus Démo Express',  cat: 'purchase' },
  { keys: ['lavage demo'],   name: 'Lavage Démo Auto',    cat: 'other' }
];

function depChNorm(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ').trim().toLowerCase();
}

function depChIsHeaderCell(v) {
  const n = depChNorm(v);
  return !!n && (n.indexOf(depChNorm('رقم الشيك')) !== -1 || /^(cheque|check)\s*(no|number|#|n°)/.test(n));
}

function depChMonthIndex(v) {
  const m = String(v === null || v === undefined ? '' : v).trim().toLowerCase().match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/);
  return m ? ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(m[1]) + 1 : 0;
}

function depChIsDateObj(v) { return Object.prototype.toString.call(v) === '[object Date]'; }

function depChIso(y, m, d) {
  return String(y).padStart(4, '0') + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}

function depChValidYmd(y, m, d) {
  if (!(y >= 1900 && y <= 2200 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return false;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

// Date d'une ligne. ctxYear/ctxMonth = année/mois de l'en-tête du bloc (source de vérité).
// Jamais de perte : date illisible → 1er du mois du bloc + avertissement.
function depChParseDate(raw, ctxYear, ctxMonth) {
  const flags = [];
  let y = null, m = null, d = null;
  if (depChIsDateObj(raw) && !isNaN(raw.getTime())) {
    const x = new Date(raw.getTime() + 12 * 3600 * 1000); // minuit local → robuste au fuseau
    y = x.getFullYear(); m = x.getMonth() + 1; d = x.getDate();
  } else {
    const s = String(raw === null || raw === undefined ? '' : raw).trim();
    let mm = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (mm) { y = +mm[1]; m = +mm[2]; d = +mm[3]; }
    else if ((mm = s.match(/^(\d{1,2})[\/\-.\\](\d{1,2})[\/\-.\\](\d{4,5})$/))) { d = +mm[1]; m = +mm[2]; y = +mm[3]; }
  }
  if (y !== null && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
    if (ctxYear && y !== ctxYear) {
      flags.push({ level: 'fix', text: 'year ' + y + ' → ' + ctxYear + ' (block year)' });
      y = ctxYear;
    }
    if (depChValidYmd(y, m, d)) {
      if (ctxMonth && m !== ctxMonth) flags.push({ level: 'info', text: 'date month differs from its Excel block (' + DEP_CH_MONTHS[ctxMonth - 1] + ')' });
      return { iso: depChIso(y, m, d), flags };
    }
  }
  const shown = depChIsDateObj(raw) ? 'invalid' : String(raw === null || raw === undefined ? '' : raw).trim();
  if (ctxYear && ctxMonth) {
    flags.push({ level: 'warn', text: 'no valid date in file ("' + shown + '") → set to 1st of ' + DEP_CH_MONTHS[ctxMonth - 1] + ' ' + ctxYear });
    return { iso: depChIso(ctxYear, ctxMonth, 1), flags };
  }
  flags.push({ level: 'error', text: 'no valid date and no block month to fall back on' });
  return { iso: '', flags };
}

function depChParseAmount(raw) {
  const flags = [];
  if (typeof raw === 'number') return { value: isFinite(raw) ? Math.round(raw * 1000) / 1000 : 0, flags };
  let s = String(raw === null || raw === undefined ? '' : raw).trim();
  if (!s) return { value: 0, flags: [{ level: 'error', text: 'amount missing' }] };
  s = s.replace(/[٠-٩]/g, ch => String(ch.charCodeAt(0) - 0x0660)).replace(/\s+/g, '');
  const dash = /[-\/=]+$/.test(s);
  s = s.replace(/[-\/=]+$/, '');
  let v;
  if (dash && /^\d{1,3}(\.\d{3})+$/.test(s)) {           // "10.000-" = 10 000 (point = séparateur de milliers)
    v = parseFloat(s.replace(/\./g, ''));
    flags.push({ level: 'fix', text: 'amount "' + String(raw).trim() + '" read as ' + v });
  } else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) {
    v = parseFloat(s.replace(/,/g, ''));
  } else {
    v = parseFloat(s.replace(',', '.'));
    if (dash) flags.push({ level: 'fix', text: 'amount "' + String(raw).trim() + '" read as ' + v });
  }
  if (!isFinite(v) || v <= 0) return { value: 0, flags: [{ level: 'error', text: 'invalid amount "' + String(raw).trim() + '"' }] };
  return { value: Math.round(v * 1000) / 1000, flags };
}

function depChParseNumber(raw) {
  if (typeof raw === 'number' && isFinite(raw)) return { value: String(Math.round(raw)), flags: [] };
  const s = String(raw === null || raw === undefined ? '' : raw).trim();
  if (/^\d{3,}$/.test(s)) return { value: s, flags: [] };
  return { value: '', flags: [{ level: 'warn', text: 'cheque number missing/invalid in file' + (s && !depChIsDateObj(raw) ? ' ("' + s + '")' : '') }] };
}

function depChMatchRule(text) {
  const n = depChNorm(text);
  return DEP_CH_RULES.find(r => r.keys.some(k => n.indexOf(depChNorm(k)) !== -1)) || null;
}

function depChCleanText(s) {
  return String(s === null || s === undefined ? '' : s).replace(/\\+/g, '/').replace(/\s+/g, ' ').trim();
}

// N° manquant → déduit si le même bénéficiaire a une série consécutive (ex. 651,652,…,655 → 656).
// Toujours signalé "à vérifier".
function depChInferMissingNumbers(rows) {
  const series = {};
  rows.forEach(r => { (series[r.name] = series[r.name] || []).push(r); });
  Object.keys(series).forEach(k => {
    const list = series[k].slice().sort((a, b) => a.date.localeCompare(b.date) || a.srcRow - b.srcRow);
    list.forEach((r, i) => {
      if (r.number) return;
      const prev = list.slice(0, i).filter(x => /^\d+$/.test(x.number));
      if (prev.length < 2) return;
      const p = Number(prev[prev.length - 1].number), pp = Number(prev[prev.length - 2].number);
      const step = p - pp;
      if (Math.abs(step) !== 1) return;
      const guess = String(p + step);
      if (rows.some(x => x.number === guess)) return;
      r.number = guess;
      r.flags = r.flags.filter(f => f.level !== 'warn' || f.text.indexOf('cheque number') === -1);
      r.flags.push({ level: 'warn', text: 'cheque number missing in file → inferred ' + guess + ' from the series, please verify' });
    });
  });
}

// rowsRaw = tableau 2D (SheetJS sheet_to_json header:1). Retourne { rows, notes, blocks } ou { error }.
function depChParseRows(rowsRaw, rowOffset) {
  const off = rowOffset || 0;
  const starts = [];
  rowsRaw.forEach(r => (r || []).forEach((c, ci) => { if (depChIsHeaderCell(c) && starts.indexOf(ci) === -1) starts.push(ci); }));
  starts.sort((a, b) => a - b);
  if (!starts.length) return { error: 'no-blocks' };

  const rows = [], notes = [];
  starts.forEach(c0 => {
    let ctxYear = null, ctxMonth = null, sum = 0, cnt = 0;
    rowsRaw.forEach((r, ri) => {
      r = r || [];
      const g = k => (r[c0 + k] === undefined || r[c0 + k] === null) ? '' : r[c0 + k];
      const numRaw = g(0), dateRaw = g(1), paidRaw = g(2), yearRaw = g(3), monRaw = g(4), payeeRaw = g(5), amtRaw = g(6);

      if (depChIsHeaderCell(numRaw)) {                         // en-tête de sous-bloc mensuel
        const y = Number(yearRaw);
        if (y >= 2000 && y <= 2100) ctxYear = y;               // "20256" (faute de frappe) ignoré
        const mi = depChMonthIndex(monRaw);
        if (mi) ctxMonth = mi;
        sum = 0; cnt = 0;
        return;
      }
      const payee = depChCleanText(payeeRaw);
      if (/^total$/i.test(payee)) {                            // ligne TOTAL : contrôle seulement
        const expected = parseFloat(amtRaw);
        if (cnt > 0 && isFinite(expected) && Math.abs(expected - sum) > 0.05) {
          notes.push('Excel TOTAL ' + DEP_CH_MONTHS[(ctxMonth || 1) - 1] + ' ' + (ctxYear || '') + ' = ' + expected.toFixed(3) + ' but its rows add up to ' + sum.toFixed(3) +
            ' (Δ ' + (sum - expected).toFixed(3) + ') — every row is imported anyway');
        }
        sum = 0; cnt = 0;
        return;
      }
      const numEmpty = String(numRaw).trim() === '' && !depChIsDateObj(numRaw);
      if (!payee && numEmpty && String(amtRaw).trim() === '') return; // ligne vide

      const dt = depChParseDate(dateRaw, ctxYear, ctxMonth);
      const am = depChParseAmount(amtRaw);
      const nm = depChParseNumber(numRaw);
      const rule = depChMatchRule(payee);
      const flags = [].concat(dt.flags, am.flags, nm.flags);
      const extra = (typeof monRaw === 'string' && monRaw.trim() && !depChMonthIndex(monRaw)) ? depChCleanText(monRaw) : '';
      const yearNote = (yearRaw !== '' && Number(yearRaw) !== ctxYear && String(yearRaw).trim()) ? depChCleanText(yearRaw) : '';
      const name = rule ? rule.name : (payee || '(no beneficiary)');
      if (!payee) flags.push({ level: 'warn', text: 'no beneficiary in file' });

      rows.push({
        srcCol: c0, srcRow: ri + 1 + off, year: ctxYear, month: ctxMonth,
        number: nm.value, date: dt.iso, amount: am.value,
        name, catKey: rule ? rule.cat : 'other', matched: !!rule,
        details: (payee || '') + (extra ? ' — ' + extra : '') + (yearNote ? ' (' + yearNote + ')' : ''),
        paid: /^(paid|yes|✓|✔|نعم|مدفوع|تم)$/i.test(String(paidRaw).trim()),
        flags
      });
      sum += am.value; cnt++;
    });
  });

  depChInferMissingNumbers(rows);
  rows.sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || a.srcCol - b.srcCol || a.srcRow - b.srcRow);
  rows.forEach(r => {
    r.blocked = !(r.amount > 0) || !r.date;
    r.flags.sort((a, b) => ({ error: 0, warn: 1, fix: 2, info: 3 }[a.level] - { error: 0, warn: 1, fix: 2, info: 3 }[b.level]));
  });
  return { rows, notes, blocks: starts.length };
}

function depChStatusFor(r, mode, todayIso) {
  if (r.paid) return 'cleared';
  if (mode === 'auto' && r.date && r.date < todayIso) return 'cleared';
  return 'pending';
}
// <<DEP-CH-PURE-END>>

function depChTodayIso() {
  const t = new Date();
  return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
}

function depChResolveCategory(catKey) {
  const cands = DEP_CH_CATS[catKey] || DEP_CH_CATS.other;
  const existing = (DB.depenceCategories || []).map(c => c.name);
  for (const cand of cands) {
    const hit = existing.find(n => depChNorm(n) === depChNorm(cand));
    if (hit) return { name: hit, isNew: false };
  }
  return { name: cands[0], isNew: true };
}

function depChExistingNumbers() {
  const set = new Set();
  (DB.depence || []).forEach(e => {
    if (e.payment === 'Cheque' && e.cheque && e.cheque.number) set.add(String(e.cheque.number).trim());
  });
  return set;
}

function depChBuildGroups(rows) {
  const map = {}, groups = [];
  rows.forEach(r => {
    if (!map[r.name]) {
      const res = depChResolveCategory(r.catKey);
      map[r.name] = { name: r.name, catKey: r.catKey, matched: r.matched, choice: res.name, isNew: res.isNew };
      groups.push(map[r.name]);
    }
  });
  return groups;
}

function injectDepChequeImportButton() {
  if (document.getElementById('depChequeImportBtn')) return;
  const anyTab = document.querySelector('.dep-main-tab');
  if (!anyTab || !anyTab.parentElement) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'depChequeImportBtn';
  btn.className = 'dep-main-tab';
  btn.setAttribute('data-dep-action', 'open-import-cheques');
  btn.style.cssText = 'margin-left:8px;background:#0f766e;color:#fff;border:none;border-radius:8px;font-weight:600';
  btn.textContent = '🧾 Import Cheques';
  anyTab.parentElement.appendChild(btn);
}
window.injectDepChequeImportButton = injectDepChequeImportButton;

function ensureDepChequeModalDom() {
  if (document.getElementById('depChequeImportOverlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'depChequeImportOverlay';
  overlay.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;align-items:flex-start;justify-content:center;padding:24px 12px;overflow:auto';
  overlay.innerHTML = `
    <div style="background:var(--s1);border-radius:14px;max-width:1180px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,.3);overflow:hidden">
      <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
        <h3 style="margin:0;font-size:1.05rem">🧾 Import Cheques from Excel</h3>
        <button type="button" onclick="closeDepChequeImportModal()" style="background:none;border:none;font-size:1.3rem;cursor:pointer;opacity:.6;line-height:1">✕</button>
      </div>
      <div style="padding:18px 20px;max-height:76vh;overflow:auto">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:6px">
          <input type="file" id="depChequeFileInput" accept=".xlsx,.xls" onchange="handleDepChequeFileSelect(event)"
                 style="border:1px solid var(--border);border-radius:8px;padding:8px;background:var(--s2);flex:1;min-width:220px;color:var(--text)">
          <span id="depChequeLoadStatus" style="font-size:.85rem;opacity:.7"></span>
        </div>
        <div style="font-size:.78rem;opacity:.6;margin-bottom:14px">Cheque workbook with side-by-side year blocks (Cheque no. | Date | PAID | Year | Month | Beneficiary | Amount). Every row is imported as a Cheque payment; corrections are flagged and editable below. Cheque numbers already in the app are skipped (no duplicates).</div>
        <div id="depChequePreviewArea"></div>
      </div>
      <div style="padding:14px 20px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:10px">
        <button type="button" class="btn btn-ghost" onclick="closeDepChequeImportModal()">Cancel</button>
        <button type="button" class="btn" id="depChequeImportConfirmBtn" disabled onclick="confirmDepChequeImport()" style="background:#0f766e;color:#fff;opacity:.5">✔️ Import</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', function(e) { if (e.target === overlay) closeDepChequeImportModal(); });
}

function openDepChequeImportModal() {
  ensureDepChequeModalDom();
  document.getElementById('depChequeImportOverlay').style.display = 'flex';
  document.getElementById('depChequeFileInput').value = '';
  document.getElementById('depChequePreviewArea').innerHTML = '';
  document.getElementById('depChequeLoadStatus').textContent = '';
  const btn = document.getElementById('depChequeImportConfirmBtn');
  btn.disabled = true; btn.style.opacity = '.5'; btn.innerHTML = '✔️ Import';
  depChequeImport = null;
}
window.openDepChequeImportModal = openDepChequeImportModal;

function closeDepChequeImportModal() {
  const overlay = document.getElementById('depChequeImportOverlay');
  if (overlay) overlay.style.display = 'none';
}
window.closeDepChequeImportModal = closeDepChequeImportModal;

function handleDepChequeFileSelect(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const status = document.getElementById('depChequeLoadStatus');
  if (status) status.textContent = '⏳ Reading file...';
  _loadSheetJs().then(function() {
    const reader = new FileReader();
    reader.onload = function(evt) {
      try {
        const wb = XLSX.read(new Uint8Array(evt.target.result), { type: 'array', cellDates: true });
        let rows = [], notes = [], blocks = 0;
        wb.SheetNames.forEach(function(sn) {
          const sheet = wb.Sheets[sn];
          if (!sheet || !sheet['!ref']) return;
          const range = XLSX.utils.decode_range(sheet['!ref']);
          const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '', blankrows: true });
          const res = depChParseRows(raw, range.s.r);
          if (res.error) return;
          res.rows.forEach(r => { r.sheet = sn; });
          rows = rows.concat(res.rows); notes = notes.concat(res.notes); blocks += res.blocks;
        });
        if (!rows.length) throw new Error('no cheque rows');
        depChequeImport = { rows, notes, groups: depChBuildGroups(rows), statusMode: 'auto', fileName: file.name };
        if (status) status.textContent = '✅ ' + rows.length + ' cheque row(s) found in ' + blocks + ' block(s)';
        renderDepChequePreview();
      } catch (err) {
        console.error('[Dépense] Cheque import read error:', err);
        if (status) status.textContent = '❌ No cheque table recognised in this file.';
        depChequeImport = null;
        const btn = document.getElementById('depChequeImportConfirmBtn');
        if (btn) { btn.disabled = true; btn.style.opacity = '.5'; }
      }
    };
    reader.readAsArrayBuffer(file);
  }).catch(function(err) {
    console.warn('[Dépense] SheetJS unavailable:', err.message);
    if (status) status.textContent = '❌ Import library unavailable (check internet connection).';
  });
}
window.handleDepChequeFileSelect = handleDepChequeFileSelect;

function depChSetCategory(groupIdx, value) {
  if (!depChequeImport || !depChequeImport.groups[groupIdx]) return;
  const g = depChequeImport.groups[groupIdx];
  g.choice = value;
  g.isNew = !(DB.depenceCategories || []).some(c => depChNorm(c.name) === depChNorm(value));
  renderDepChequePreview();
}
window.depChSetCategory = depChSetCategory;

function depChSetStatusMode(value) {
  if (!depChequeImport) return;
  depChequeImport.statusMode = value === 'pending' ? 'pending' : 'auto';
  renderDepChequePreview();
}
window.depChSetStatusMode = depChSetStatusMode;

function depChEditRow(idx, field, value) {
  if (!depChequeImport || !depChequeImport.rows[idx]) return;
  const r = depChequeImport.rows[idx];
  if (field === 'amount') { r.amount = Math.round((parseFloat(String(value).replace(',', '.')) || 0) * 1000) / 1000; }
  else if (field === 'number') { r.number = String(value).trim(); }
  else if (field === 'date') { r.date = String(value || '').substring(0, 10); }
  r.blocked = !(r.amount > 0) || !r.date;
  renderDepChequePreview();
}
window.depChEditRow = depChEditRow;

function renderDepChequePreview() {
  const st = depChequeImport;
  const area = document.getElementById('depChequePreviewArea');
  const confirmBtn = document.getElementById('depChequeImportConfirmBtn');
  if (!st || !area) return;
  const today = depChTodayIso();
  const existing = depChExistingNumbers();
  st.rows.forEach(r => { r.dup = !!r.number && existing.has(r.number); });

  const importable = st.rows.filter(r => !r.blocked && !r.dup);
  const dupCount = st.rows.filter(r => r.dup).length;
  const blockedCount = st.rows.filter(r => r.blocked && !r.dup).length;
  const flagged = st.rows.filter(r => r.flags.some(f => f.level !== 'info')).length;
  const totalAll = st.rows.reduce((s, r) => s + r.amount, 0);
  const byYear = {};
  st.rows.forEach(r => { const y = (r.date || '????').substring(0, 4); byYear[y] = byYear[y] || { n: 0, t: 0 }; byYear[y].n++; byYear[y].t += r.amount; });
  const newCats = st.groups.filter(g => g.isNew).map(g => g.choice);
  const newCatsUnique = newCats.filter((c, i) => newCats.indexOf(c) === i);

  // Totaux par groupe (mis à jour si des montants sont édités)
  st.groups.forEach(g => { g.count = 0; g.total = 0; });
  st.rows.forEach(r => { const g = st.groups.find(x => x.name === r.name); if (g) { g.count++; g.total += r.amount; } });

  const catOptions = g => {
    const names = (DB.depenceCategories || []).map(c => c.name);
    const list = names.slice();
    if (g.isNew && list.every(n => depChNorm(n) !== depChNorm(g.choice))) list.unshift(g.choice);
    return list.map(n => `<option value="${escapeHtml(n)}" ${depChNorm(n) === depChNorm(g.choice) ? 'selected' : ''}>${escapeHtml(n)}${(g.isNew && depChNorm(n) === depChNorm(g.choice)) ? '  ➕ new' : ''}</option>`).join('');
  };
  const groupRows = st.groups.map((g, gi) => `<tr style="border-top:1px solid var(--border)${g.matched ? '' : ';background:#fef3c7'}">
      <td style="padding:6px 8px;font-size:.82rem" dir="auto">${escapeHtml(g.name)}${g.matched ? '' : ' <span style="opacity:.6">(no rule — check category)</span>'}</td>
      <td style="padding:6px 8px;text-align:center;font-size:.82rem">${g.count}</td>
      <td style="padding:6px 8px;text-align:right;font-family:var(--mono,monospace);font-size:.82rem">${g.total.toFixed(3)}</td>
      <td style="padding:6px 8px"><select onchange="depChSetCategory(${gi}, this.value)" style="width:100%;padding:5px 6px;border-radius:6px;border:1px solid var(--border);background:var(--s2);font-size:.8rem;color:var(--text)">${catOptions(g)}</select></td>
    </tr>`).join('');

  const flagIcon = { error: '❌', warn: '⚠️', fix: '🔧', info: 'ℹ️' };
  const inputStyle = 'padding:3px 5px;border-radius:5px;border:1px solid var(--border);background:var(--s2);font-size:.76rem;color:var(--text);';
  const rowsHtml = st.rows.map((r, i) => {
    const g = st.groups.find(x => x.name === r.name);
    const statusTxt = r.dup ? '⏭️ already in app' : depChStatusFor(r, st.statusMode, today);
    const editable = r.flags.some(f => f.level !== 'info') || r.blocked;
    const bg = r.dup ? 'background:rgba(107,114,128,.12);opacity:.65' : (r.blocked ? 'background:#fee2e2' : (r.flags.some(f => f.level === 'warn') ? 'background:#fef3c7' : ''));
    const dateCell = editable ? `<input type="date" value="${escapeHtml(r.date)}" onchange="depChEditRow(${i},'date',this.value)" style="${inputStyle}width:128px">` : escapeHtml(r.date);
    const numCell = editable ? `<input type="text" value="${escapeHtml(r.number)}" placeholder="number" onchange="depChEditRow(${i},'number',this.value)" style="${inputStyle}width:100px;font-family:var(--mono,monospace)">` : escapeHtml(r.number);
    const amtCell = editable ? `<input type="number" step="0.001" value="${r.amount}" onchange="depChEditRow(${i},'amount',this.value)" style="${inputStyle}width:86px;text-align:right">` : r.amount.toFixed(3);
    return `<tr style="border-top:1px solid var(--border);${bg}">
      <td style="padding:5px 8px;font-size:.72rem;opacity:.6;white-space:nowrap">${escapeHtml(r.sheet || '')} r${r.srcRow}</td>
      <td style="padding:5px 8px;font-size:.78rem;white-space:nowrap">${dateCell}</td>
      <td style="padding:5px 8px;font-size:.78rem;font-family:var(--mono,monospace)">${numCell}</td>
      <td style="padding:5px 8px;font-size:.78rem" dir="auto">${escapeHtml(r.name)}</td>
      <td style="padding:5px 8px;font-size:.74rem;opacity:.8;max-width:260px" dir="auto">${escapeHtml(r.details)}</td>
      <td style="padding:5px 8px;font-size:.76rem">${escapeHtml(g ? g.choice : '')}</td>
      <td style="padding:5px 8px;text-align:right;font-size:.78rem;font-family:var(--mono,monospace)">${amtCell}</td>
      <td style="padding:5px 8px;font-size:.74rem;white-space:nowrap">${escapeHtml(statusTxt)}</td>
      <td style="padding:5px 8px;font-size:.72rem;line-height:1.5">${r.flags.map(f => flagIcon[f.level] + ' ' + escapeHtml(f.text)).join('<br>')}</td>
    </tr>`;
  }).join('');

  const pill = (bg, fg, txt) => `<span style="padding:5px 10px;border-radius:999px;background:${bg};color:${fg};font-weight:600">${txt}</span>`;
  area.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;gap:10px;font-size:.85rem;margin-bottom:12px">
      ${pill('#dcfce7', '#166534', '✅ ' + importable.length + ' cheque(s) to import — ' + importable.reduce((s, r) => s + r.amount, 0).toFixed(3) + ' OMR')}
      ${Object.keys(byYear).sort().map(y => pill('#e0e7ff', '#3730a3', y + ': ' + byYear[y].n + ' / ' + byYear[y].t.toFixed(3))).join('')}
      ${flagged ? pill('#fef3c7', '#92400e', '⚠️ ' + flagged + ' row(s) auto-corrected / to verify') : ''}
      ${dupCount ? pill('#e5e7eb', '#374151', '⏭️ ' + dupCount + ' already in app (skipped)') : ''}
      ${blockedCount ? pill('#fee2e2', '#991b1b', '❌ ' + blockedCount + ' row(s) need a valid date/amount') : ''}
      ${newCatsUnique.length ? pill('#e0e7ff', '#3730a3', '🏷️ +' + newCatsUnique.length + ' new categor' + (newCatsUnique.length > 1 ? 'ies' : 'y') + ': ' + escapeHtml(newCatsUnique.join(', '))) : ''}
    </div>
    <div style="font-size:.82rem;margin-bottom:12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <b>Status of imported cheques:</b>
      <select onchange="depChSetStatusMode(this.value)" style="padding:5px 8px;border-radius:6px;border:1px solid var(--border);background:var(--s2);font-size:.8rem;color:var(--text)">
        <option value="auto" ${st.statusMode === 'auto' ? 'selected' : ''}>Date already passed → Cleared, future → Pending</option>
        <option value="pending" ${st.statusMode === 'pending' ? 'selected' : ''}>All Pending</option>
      </select>
      <span style="opacity:.6">(a "PAID" mark in the file always gives Cleared)</span>
    </div>
    ${st.notes.length ? `<div style="font-size:.78rem;margin-bottom:12px;padding:8px 10px;border-radius:8px;background:#f3f4f6;color:#374151;line-height:1.6">${st.notes.map(n => 'ℹ️ ' + escapeHtml(n)).join('<br>')}</div>` : ''}
    <div style="font-weight:700;font-size:.85rem;margin:6px 0">Beneficiary → category mapping (${st.groups.length})</div>
    <div style="overflow-x:auto;border:1px solid var(--border);border-radius:8px;margin-bottom:14px">
      <table style="border-collapse:collapse;width:100%">
        <thead><tr style="background:var(--s2);font-size:.72rem;text-align:left"><th style="padding:6px 8px">Beneficiary (cheque name)</th><th style="padding:6px 8px;text-align:center">Cheques</th><th style="padding:6px 8px;text-align:right">Total OMR</th><th style="padding:6px 8px;min-width:200px">Category</th></tr></thead>
        <tbody>${groupRows}</tbody>
      </table>
    </div>
    <div style="font-weight:700;font-size:.85rem;margin:6px 0">All cheques (${st.rows.length}) — total ${totalAll.toFixed(3)} OMR</div>
    <div style="overflow:auto;max-height:340px;border:1px solid var(--border);border-radius:8px">
      <table style="border-collapse:collapse;width:100%">
        <thead><tr style="background:var(--s2);font-size:.72rem;text-align:left;position:sticky;top:0"><th style="padding:6px 8px">Source</th><th style="padding:6px 8px">Date</th><th style="padding:6px 8px">Cheque no.</th><th style="padding:6px 8px">Beneficiary</th><th style="padding:6px 8px">Details</th><th style="padding:6px 8px">Category</th><th style="padding:6px 8px;text-align:right">Amount</th><th style="padding:6px 8px">Status</th><th style="padding:6px 8px">Notes</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>`;

  if (confirmBtn) {
    confirmBtn.disabled = importable.length === 0;
    confirmBtn.style.opacity = importable.length === 0 ? '.5' : '1';
    confirmBtn.innerHTML = '✔️ Import (' + importable.length + ')';
  }
}
window.renderDepChequePreview = renderDepChequePreview;

function confirmDepChequeImport() {
  const st = depChequeImport;
  if (!st) return;
  DB.depence = DB.depence || [];
  const today = depChTodayIso();
  const existing = depChExistingNumbers();

  // 1) catégories manquantes (une seule sauvegarde)
  DB.depenceCategories = DB.depenceCategories || [];
  const createdCategories = [];
  st.groups.forEach(g => {
    if (!DB.depenceCategories.some(c => depChNorm(c.name) === depChNorm(g.choice))) {
      DB.depenceCategories.push({ name: g.choice, scope: 'both' });
      createdCategories.push(g.choice);
    }
  });
  if (createdCategories.length) saveDepenceCategories();

  // 2) une dépense Cheque par ligne — id strictement croissant (pas de collision en boucle serrée)
  let imported = 0, dups = 0, blocked = 0, lastId = 0;
  st.rows.forEach(r => {
    if (r.blocked) { blocked++; return; }
    if (r.number && existing.has(r.number)) { dups++; return; }

    const g = st.groups.find(x => x.name === r.name);
    const catName = (DB.depenceCategories.find(c => depChNorm(c.name) === depChNorm(g ? g.choice : '')) || {}).name || (g ? g.choice : 'Other');
    const status = depChStatusFor(r, st.statusMode, today);
    const warn = r.flags.filter(f => f.level === 'warn').map(f => f.text);

    let id = _genId();
    if (typeof id === 'number' && id <= lastId) id = lastId + 1;
    if (typeof id === 'number') lastId = id;

    const data = {
      id,
      kind: 'general',
      vehicleId: null,
      category: catName,
      amount: r.amount,
      payment: 'Cheque',
      date: r.date,
      details: r.details + (warn.length ? ' [verify: ' + warn.join('; ') + ']' : ''),
      cheque: { amount: r.amount, name: r.name, date: r.date, number: r.number, status },
      updatedAt: Date.now()
    };
    DB.depence.push(data);
    saveExpense(data.id);
    if (r.number) existing.add(r.number);
    imported++;
  });

  if (typeof logAction === 'function') {
    logAction('import_excel', '🧾 Cheque Import', imported + ' imported, ' + dups + ' already present, ' + blocked + ' blocked (' + st.fileName + ')', 'GENERAL');
  }
  if (typeof updateLogBadge === 'function') updateLogBadge();

  depChequeListFrom = '';
  depChequeListTo = '';
  renderDepence();

  const msg = '✅ ' + imported + ' cheque(s) imported'
    + (dups ? ' — ' + dups + ' already present' : '')
    + (blocked ? ' — ⚠️ ' + blocked + ' NOT imported yet (fix date/amount, then Import again)' : '')
    + (createdCategories.length ? ' — ' + createdCategories.length + ' new categor' + (createdCategories.length > 1 ? 'ies' : 'y') : '');
  if (typeof showToast === 'function') showToast(msg); else alert(msg);

  if (blocked) {                       // on garde la modale ouverte : aucune ligne ne doit se perdre
    renderDepChequePreview();
    return;
  }
  closeDepChequeImportModal();
  depChequeImport = null;
  if (typeof switchDepMainTab === 'function') switchDepMainTab('cheque');
  if (typeof renderDepChequeList === 'function') renderDepChequeList();
}
window.confirmDepChequeImport = confirmDepChequeImport;

if (document.readyState !== 'loading') { injectDepExcelImportButton(); injectDepChequeImportButton(); }
else document.addEventListener('DOMContentLoaded', function() { injectDepExcelImportButton(); injectDepChequeImportButton(); });

// Hook : quand renderDepence() est appelé, on rafraîchit aussi les stats actives
// et on s'assure que le bouton Import Excel est toujours présent dans le menu.
const _origRenderDepence = renderDepence;
renderDepence = function() {
  _origRenderDepence();
  renderDepStatsActiveTab();
  injectDepExcelImportButton();
  injectDepChequeImportButton();
};
window.renderDepence = renderDepence;
