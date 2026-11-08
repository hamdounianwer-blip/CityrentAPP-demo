// ════════════════════════════════════════════════════════════════════
// module-suppliers.js — Fournisseurs comme entités (#6 de la roadmap
// comptabilité)
// ════════════════════════════════════════════════════════════════════
// Branché sur DB.suppliers (table SQLite 'suppliers', même pattern que
// depence/moves/gps_links — voir server.js). Onglet "Suppliers" ajouté
// dans le module Dépenses (voir data-dep-tab="suppliers" dans app.html
// et switchDepMainTab() dans module-depence.js).
//
// Lien avec les chèques : PAS de clé étrangère stricte — un fournisseur
// est rapproché des chèques émis (DB.depence[].cheque.name) par NOM
// NORMALISÉ (_supNormName), pour rester compatible avec tout
// l'historique de chèques déjà saisi avant l'existence de cette table.
// "Import from cheques" permet de créer en masse les fournisseurs
// correspondant aux noms déjà utilisés.
//
// Aging fournisseurs : uniquement les chèques ÉMIS (sortants, DB.depence,
// même limite documentée dans module-cheque-alerts.js) — les chèques
// clients (entrants) n'ont pas de date d'échéance structurée dans
// DB.payments aujourd'hui.
// ════════════════════════════════════════════════════════════════════

if (!DB.suppliers) DB.suppliers = [];
if (!DB.nextSupId) DB.nextSupId = 1;

let supSearchTerm = '';

// ── Normalisation du nom — même principe que normalizePlateGlobal() :
// espaces multiples réduits, casse ignorée, trim. Sert à rapprocher
// "Al Amana Trading" et "AL AMANA TRADING " sans faire de gestion de
// synonymes/fautes de frappe (hors scope ici). ──
function _supNormName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ').toUpperCase();
}

// ── Toutes les dépenses payées par chèque, quel que soit leur statut ──
function _supAllCheques() {
  return (DB.depence || []).filter(e => e.payment === 'Cheque' && e.cheque && e.cheque.name);
}

// ── Chèques d'un fournisseur donné (rapprochement par nom normalisé) ──
function _supChequesFor(supplier) {
  const key = _supNormName(supplier.name);
  if (!key) return [];
  return _supAllCheques().filter(e => _supNormName(e.cheque.name) === key);
}

// ── Aging d'un fournisseur — uniquement les chèques encore "pending".
// Buckets classiques AP : pas encore dû / 1-30 / 31-60 / 61-90 / 90+ jours
// de retard (même seuils que depChequeDueBadge dans module-cheque-alerts.js). ──
function computeSupplierAging(supplier) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const buckets = { notDue: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0, total: 0, count: 0 };
  _supChequesFor(supplier).forEach(e => {
    const chq = e.cheque || {};
    const status = (typeof CHEQUE_STATUSES !== 'undefined' && CHEQUE_STATUSES.indexOf(chq.status) !== -1) ? chq.status : 'pending';
    if (status !== 'pending' || !chq.date) return;
    const d = new Date(chq.date); d.setHours(0, 0, 0, 0);
    if (isNaN(d.getTime())) return;
    const amount = parseFloat(e.amount) || 0;
    const diffDays = Math.round((today - d) / 86400000); // >0 = en retard
    buckets.total += amount;
    buckets.count++;
    if (diffDays <= 0) buckets.notDue += amount;
    else if (diffDays <= 30) buckets.d1_30 += amount;
    else if (diffDays <= 60) buckets.d31_60 += amount;
    else if (diffDays <= 90) buckets.d61_90 += amount;
    else buckets.d90plus += amount;
  });
  return buckets;
}

// ── Datalist d'autocomplétion — fournisseurs déjà créés + tous les noms
// de chèques déjà saisis (même non rattachés à un fournisseur). Utilisée
// par #depChequeName (modal chèque dépense) et #supName (modal fournisseur). ──
function refreshSupplierNameDatalist() {
  const names = new Set();
  (DB.suppliers || []).forEach(s => { if (s.name) names.add(s.name.trim()); });
  _supAllCheques().forEach(e => { if (e.cheque.name) names.add(e.cheque.name.trim()); });
  const sorted = Array.from(names).sort((a, b) => a.localeCompare(b));
  ['dep-supplier-namelist'].forEach(id => {
    const dl = document.getElementById(id);
    if (dl) dl.innerHTML = sorted.map(n => `<option value="${escapeHtml(n)}"></option>`).join('');
  });
  const catDl = document.getElementById('dep-category-namelist');
  if (catDl) {
    const cats = (DB.depenceCategories || []).map(c => c.name);
    catDl.innerHTML = cats.map(n => `<option value="${escapeHtml(n)}"></option>`).join('');
  }
}
window.refreshSupplierNameDatalist = refreshSupplierNameDatalist;

// ── Event delegation for data-sup-action buttons ──
(function () {
  document.addEventListener('click', function (e) {
    const btn = e.target.closest('[data-sup-action]');
    if (!btn) return;
    const action = btn.dataset.supAction;
    if (action === 'new') { e.preventDefault(); openNewSupplierModal(); }
    else if (action === 'edit') { e.preventDefault(); openEditSupplierModal(Number(btn.dataset.id)); }
    else if (action === 'delete') { e.preventDefault(); deleteSupplierWithConfirm(Number(btn.dataset.id)); }
    else if (action === 'save-modal') { e.preventDefault(); saveSupplierModal(); }
    else if (action === 'import-from-cheques') { e.preventDefault(); importSuppliersFromCheques(); }
  });
  document.addEventListener('input', function (e) {
    if (e.target && e.target.id === 'supSearch') {
      supSearchTerm = e.target.value.trim().toLowerCase();
      renderSupplierList();
    }
  });
})();

// ═══════════════════════ CRUD ═══════════════════════
function openNewSupplierModal() {
  document.getElementById('supEditId').value = '';
  document.getElementById('supName').value = '';
  document.getElementById('supPhone').value = '';
  document.getElementById('supCategory').value = '';
  document.getElementById('supNotes').value = '';
  const title = document.getElementById('supModalTitle');
  if (title) title.textContent = translate ? translate('sup.newSupplier') : 'New Supplier';
  refreshSupplierNameDatalist();
  openModal('modal-supplier');
}

function openEditSupplierModal(id) {
  const sup = (DB.suppliers || []).find(s => s.id === id);
  if (!sup) return;
  document.getElementById('supEditId').value = sup.id;
  document.getElementById('supName').value = sup.name || '';
  document.getElementById('supPhone').value = sup.phone || '';
  document.getElementById('supCategory').value = sup.category || '';
  document.getElementById('supNotes').value = sup.notes || '';
  const title = document.getElementById('supModalTitle');
  if (title) title.textContent = translate ? translate('sup.editSupplier') : 'Edit Supplier';
  refreshSupplierNameDatalist();
  openModal('modal-supplier');
}

function saveSupplierModal() {
  const idRaw = document.getElementById('supEditId').value;
  const name = document.getElementById('supName').value.trim();
  const phone = document.getElementById('supPhone').value.trim();
  const category = document.getElementById('supCategory').value.trim();
  const notes = document.getElementById('supNotes').value.trim();
  if (!name) {
    alert(translate ? translate('sup.nameRequired') : 'Please enter a supplier name.');
    return;
  }
  // Anti-doublon — même nom normalisé déjà utilisé par un AUTRE fournisseur.
  const normKey = _supNormName(name);
  const editingId = idRaw ? Number(idRaw) : null;
  const dupe = (DB.suppliers || []).find(s => s.id !== editingId && _supNormName(s.name) === normKey);
  if (dupe) {
    alert(translate ? translate('sup.duplicateName') : 'A supplier with this name already exists.');
    return;
  }

  if (editingId) {
    const sup = (DB.suppliers || []).find(s => s.id === editingId);
    if (!sup) return;
    sup.name = name; sup.phone = phone; sup.category = category; sup.notes = notes;
    saveSupplier(editingId);
  } else {
    const newId = (typeof _genId === 'function') ? _genId() : (DB.nextSupId++);
    const sup = { id: newId, name, phone, category, notes, createdAt: Date.now(), updatedAt: Date.now() };
    DB.suppliers = DB.suppliers || [];
    DB.suppliers.push(sup);
    saveSupplier(newId);
  }
  closeModal('modal-supplier');
  renderSuppliersPanel();
}

function deleteSupplierWithConfirm(id) {
  const sup = (DB.suppliers || []).find(s => s.id === id);
  if (!sup) return;
  const aging = computeSupplierAging(sup);
  if (aging.count > 0) {
    if (!confirm((translate ? translate('sup.confirmDeleteWithCheques') : 'This supplier still has {n} pending cheque(s) totalling {amt} OMR — delete anyway?')
      .replace('{n}', aging.count).replace('{amt}', fmtNum(aging.total)))) return;
  } else {
    if (!confirm((translate ? translate('sup.confirmDelete') : 'Delete supplier "{name}"?').replace('{name}', sup.name))) return;
  }
  deleteSupplier(id);
  renderSuppliersPanel();
}

// ── Import en masse depuis les chèques déjà saisis — crée un fournisseur
// pour chaque nom de chèque distinct pas encore présent (par nom normalisé). ──
function importSuppliersFromCheques() {
  const existingKeys = new Set((DB.suppliers || []).map(s => _supNormName(s.name)));
  const seen = new Set();
  const toCreate = [];
  _supAllCheques().forEach(e => {
    const raw = (e.cheque.name || '').trim();
    if (!raw) return;
    const key = _supNormName(raw);
    if (existingKeys.has(key) || seen.has(key)) return;
    seen.add(key);
    toCreate.push(raw);
  });
  if (!toCreate.length) {
    showToast(translate ? translate('sup.nothingToImport') : 'ℹ️ Nothing new to import — every cheque name already has a matching supplier.');
    return;
  }
  if (!confirm((translate ? translate('sup.confirmImport') : 'Create {n} new supplier(s) from existing cheque names?').replace('{n}', toCreate.length))) return;
  DB.suppliers = DB.suppliers || [];
  toCreate.forEach(name => {
    const newId = (typeof _genId === 'function') ? _genId() : (DB.nextSupId++);
    const sup = { id: newId, name, phone: '', category: '', notes: '', createdAt: Date.now(), updatedAt: Date.now() };
    DB.suppliers.push(sup);
    saveSupplier(newId);
  });
  showToast('✅ ' + toCreate.length + ' ' + (translate ? translate('sup.imported') : 'supplier(s) imported'));
  renderSuppliersPanel();
}

// ═══════════════════════ RENDER ═══════════════════════
function renderSuppliersPanel() {
  refreshSupplierNameDatalist();
  renderSupplierAgingSummary();
  renderSupplierList();
}
window.renderSuppliersPanel = renderSuppliersPanel;

function renderSupplierAgingSummary() {
  const el = document.getElementById('supAgingSummary');
  if (!el) return;
  const t = (k, d) => translate ? translate(k) : d;
  const totals = { notDue: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 };
  (DB.suppliers || []).forEach(s => {
    const a = computeSupplierAging(s);
    totals.notDue += a.notDue; totals.d1_30 += a.d1_30; totals.d31_60 += a.d31_60;
    totals.d61_90 += a.d61_90; totals.d90plus += a.d90plus;
  });
  function card(color, label, value) {
    return `<div class="stat-card" style="border-left:3px solid ${color}">
      <div class="stat-label">${label}</div>
      <div class="stat-val" style="font-size:1.1rem">${fmtNum(value)} <span style="font-size:.8rem">OMR</span></div>
    </div>`;
  }
  el.innerHTML =
    card('#0891b2', '🟦 ' + t('sup.agingNotDue', 'Not due yet'), totals.notDue) +
    card('#d97706', '🟡 ' + t('sup.aging1_30', '1–30d overdue'), totals.d1_30) +
    card('#ea580c', '🟠 ' + t('sup.aging31_60', '31–60d overdue'), totals.d31_60) +
    card('#dc2626', '🔴 ' + t('sup.aging61_90', '61–90d overdue'), totals.d61_90) +
    card('#7f1d1d', '⛔ ' + t('sup.aging90plus', '90d+ overdue'), totals.d90plus);
}

function renderSupplierList() {
  const container = document.getElementById('supListContainer');
  const countEl = document.getElementById('supCount');
  if (!container) return;

  let list = (DB.suppliers || []).slice();
  if (supSearchTerm) {
    list = list.filter(s =>
      (s.name || '').toLowerCase().includes(supSearchTerm) ||
      (s.phone || '').toLowerCase().includes(supSearchTerm) ||
      (s.category || '').toLowerCase().includes(supSearchTerm)
    );
  }
  list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  if (countEl) countEl.textContent = (DB.suppliers || []).length;

  if (!list.length) {
    container.innerHTML = `<div style="text-align:center;padding:30px;opacity:.5">
      ${(translate ? translate('sup.noSuppliers') : 'No suppliers yet — click "New Supplier" or "Import from cheques" to get started.')}
    </div>`;
    return;
  }

  const t = (k, d) => translate ? translate(k) : d;
  container.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px">` +
    list.map(s => {
      const aging = computeSupplierAging(s);
      const overdue = aging.d1_30 + aging.d31_60 + aging.d61_90 + aging.d90plus;
      const rows = [
        aging.notDue ? `<div class="sup-aging-row"><span>${t('sup.agingNotDue', 'Not due yet')}</span><b>${fmtNum(aging.notDue)}</b></div>` : '',
        aging.d1_30 ? `<div class="sup-aging-row" style="color:#d97706"><span>${t('sup.aging1_30', '1–30d overdue')}</span><b>${fmtNum(aging.d1_30)}</b></div>` : '',
        aging.d31_60 ? `<div class="sup-aging-row" style="color:#ea580c"><span>${t('sup.aging31_60', '31–60d overdue')}</span><b>${fmtNum(aging.d31_60)}</b></div>` : '',
        aging.d61_90 ? `<div class="sup-aging-row" style="color:#dc2626"><span>${t('sup.aging61_90', '61–90d overdue')}</span><b>${fmtNum(aging.d61_90)}</b></div>` : '',
        aging.d90plus ? `<div class="sup-aging-row" style="color:#7f1d1d;font-weight:800"><span>${t('sup.aging90plus', '90d+ overdue')}</span><b>${fmtNum(aging.d90plus)}</b></div>` : ''
      ].join('');
      return `<div class="sup-card">
        <div class="sup-card-top">
          <div>
            <div class="sup-card-name">${escapeHtml(s.name || '')}</div>
            <div class="sup-card-meta">${escapeHtml(s.category || '—')}${s.phone ? ' · ' + escapeHtml(s.phone) : ''}</div>
          </div>
          <div class="sup-card-actions">
            <button type="button" data-sup-action="edit" data-id="${s.id}" title="${t('sup.edit', 'Edit')}">✏️</button>
            <button type="button" data-sup-action="delete" data-id="${s.id}" title="${t('sup.delete', 'Delete')}" style="color:#dc2626">🗑️</button>
          </div>
        </div>
        ${s.notes ? `<div style="font-size:.72rem;opacity:.6;font-style:italic">${escapeHtml(s.notes)}</div>` : ''}
        <div style="border-top:1px dashed var(--border);margin-top:4px;padding-top:6px">
          ${aging.count ? rows : `<div style="font-size:.72rem;opacity:.45">${t('sup.noPendingCheques', 'No pending cheques')}</div>`}
          ${aging.count ? `<div class="sup-aging-row" style="border-top:1px solid var(--border);margin-top:4px;padding-top:4px;font-weight:800"><span>${t('sup.total', 'Total pending')}</span><b>${fmtNum(aging.total)} OMR</b></div>` : ''}
          ${overdue > 0 ? `<div style="font-size:.68rem;color:#dc2626;font-weight:700;margin-top:2px">⚠️ ${fmtNum(overdue)} OMR ${t('sup.overdueLabel', 'overdue')}</div>` : ''}
        </div>
      </div>`;
    }).join('') + `</div>`;
}
