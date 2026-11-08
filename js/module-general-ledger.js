// ════════════════════════════════════════════════════════════════════
// module-general-ledger.js — Grand Livre Comptable & Journaux
// ════════════════════════════════════════════════════════════════════
// Affiche le grand livre (toutes les transactions, groupées par compte)
// et permet d'exporter les journaux comptables :
//  1) Grand Livre complet (brut) — tri par compte, puis date
//  2) Journal des Ventes (Produits)
//  3) Journal des Achats (Charges d'exploitation + personnel)
//  4) Journal de Banque (Paiements entrée/sortie)
//  5) Journal de Dépenses Générales
//  6) Journal Supplémentaire (Ajustements, Corrections)
//
// Chargé APRÈS module-chart-of-accounts.js et module-period-closing.js.
// Ajoute un onglet "Grand Livre" dans Revenue Stats (menu Comptabilité).
//
// Persistance : RAS — données lues depuis DB.depence, DB.contracts,
// DB.payments. Aucune table spéciale créée.
// ════════════════════════════════════════════════════════════════════

let glFilterDateFrom = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().substring(0, 10);
let glFilterDateTo = new Date().toISOString().substring(0, 10);
let glFilterAccount = 'all';
let glSortBy = 'account'; // 'account' | 'date'

// ════════════════════════════════════════════════════════════════════
// ─── CONSTRUCTION DU GRAND LIVRE (ALL TRANSACTIONS) ────────────────
// ════════════════════════════════════════════════════════════════════
function buildGeneralLedger(filterDateFrom, filterDateTo, filterAccountCode) {
  const entries = [];

  // ── Revenus (contracts) ──
  (DB.contracts || []).forEach(c => {
    const date = c.date_in || c.date_out || '';
    if (filterDateFrom && date < filterDateFrom) return;
    if (filterDateTo && date > filterDateTo) return;

    // Compte produit principal (loyer)
    let accCode = REVENUE_CATEGORY_ACCOUNTS.rent || '704000';
    if (filterAccountCode && filterAccountCode !== 'all' && accCode !== filterAccountCode) return;

    entries.push({
      date: date,
      accountCode: accCode,
      accountName: accountByCode(accCode).name,
      type: 'Revenue',
      description: 'Loyer ' + (c.client_name || '—'),
      debit: 0,
      credit: parseFloat(c.price || 0),
      refNum: c.contract_num || c.id,
      sourceId: c.id,
      sourceType: 'contract'
    });

    // Extras : carburant, km, heures, lavage (si présents)
    if (c.petrol && parseFloat(c.petrol) > 0) {
      entries.push({
        date: date,
        accountCode: '706000',
        accountName: accountByCode('706000').name,
        type: 'Revenue',
        description: 'Refact. carburant ' + (c.client_name || '—'),
        debit: 0,
        credit: parseFloat(c.petrol),
        refNum: c.contract_num + '-petrol',
        sourceId: c.id,
        sourceType: 'contract'
      });
    }
    if (c.extraKm && parseFloat(c.extraKm) > 0) {
      entries.push({
        date: date,
        accountCode: '707000',
        accountName: accountByCode('707000').name,
        type: 'Revenue',
        description: 'Refact. km extra ' + (c.client_name || '—'),
        debit: 0,
        credit: parseFloat(c.extraKm),
        refNum: c.contract_num + '-km',
        sourceId: c.id,
        sourceType: 'contract'
      });
    }
    if (c.extraTime && parseFloat(c.extraTime) > 0) {
      entries.push({
        date: date,
        accountCode: '707100',
        accountName: accountByCode('707100').name,
        type: 'Revenue',
        description: 'Refact. heures extra ' + (c.client_name || '—'),
        debit: 0,
        credit: parseFloat(c.extraTime),
        refNum: c.contract_num + '-time',
        sourceId: c.id,
        sourceType: 'contract'
      });
    }
    if (c.carwash && parseFloat(c.carwash) > 0) {
      entries.push({
        date: date,
        accountCode: '708000',
        accountName: accountByCode('708000').name,
        type: 'Revenue',
        description: 'Refact. lavage ' + (c.client_name || '—'),
        debit: 0,
        credit: parseFloat(c.carwash),
        refNum: c.contract_num + '-wash',
        sourceId: c.id,
        sourceType: 'contract'
      });
    }
  });

  // ── Dépenses (depence) ──
  (DB.depence || []).forEach(e => {
    const date = e.date || '';
    if (filterDateFrom && date < filterDateFrom) return;
    if (filterDateTo && date > filterDateTo) return;

    // Chercher le compte comptable : accountCode sur la catégorie
    const cat = (DB.depenceCategories || []).find(c => c.name === e.category);
    let accCode = cat && cat.accountCode ? cat.accountCode : 'UNCLASSIFIED';
    if (filterAccountCode && filterAccountCode !== 'all' && accCode !== filterAccountCode) return;

    entries.push({
      date: date,
      accountCode: accCode,
      accountName: accountByCode(accCode).name,
      type: 'Expense',
      description: escapeHtml(e.category || '—') + ' — ' + (e.kind === 'vehicle' && e.vehicleId ? depVehicleLabel(e.vehicleId) : 'General'),
      debit: parseFloat(e.amount || 0),
      credit: 0,
      refNum: e.id,
      sourceId: e.id,
      sourceType: 'expense'
    });
  });

  // ── Paiements clients (payments) ──
  // Note: les paiements ne sont pas des écritures comptables directes —
  // ce sont des éléments de trésorerie (Banque/Caisse). À la demande,
  // on peut ajouter un compte "Trésorerie" pour tracer les flux.
  // Pour le moment, on les liste en informatif (grisés).
  (DB.payments || []).forEach(p => {
    const date = p.date || '';
    if (filterDateFrom && date < filterDateFrom) return;
    if (filterDateTo && date > filterDateTo) return;

    const accCode = '512000'; // Compte "Banque/Caisse" (à créer dans CHART_OF_ACCOUNTS si besoin)
    if (filterAccountCode && filterAccountCode !== 'all' && accCode !== filterAccountCode) return;

    entries.push({
      date: date,
      accountCode: accCode,
      accountName: 'Banque / Caisse (Paiement)',
      type: 'Payment',
      description: 'Paiement ' + (p.paymentMethod || 'Unknown') + ' — ' + (p.client_name || '—'),
      debit: parseFloat(p.paid || 0),  // Entrée de trésorerie
      credit: 0,
      refNum: p.id,
      sourceId: p.id,
      sourceType: 'payment',
      isPayment: true
    });
  });

  return entries;
}
window.buildGeneralLedger = buildGeneralLedger;

// ════════════════════════════════════════════════════════════════════
// ─── RENDU GRAND LIVRE (UI) ────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════
function renderGeneralLedgerPanel() {
  const panel = document.getElementById('general-ledger-panel');
  if (!panel) return;
  const t = (k, d) => translate ? translate(k) : d;

  // Récupère les valeurs de filtres depuis les inputs
  const dfInput = document.getElementById('gl-filter-from');
  const dtInput = document.getElementById('gl-filter-to');
  const accInput = document.getElementById('gl-filter-account');

  if (dfInput) glFilterDateFrom = dfInput.value;
  if (dtInput) glFilterDateTo = dtInput.value;
  if (accInput) glFilterAccount = accInput.value;

  const entries = buildGeneralLedger(glFilterDateFrom, glFilterDateTo, glFilterAccount);

  // Trier
  if (glSortBy === 'account') {
    entries.sort((a, b) => a.accountCode.localeCompare(b.accountCode) || (a.date || '').localeCompare(b.date || ''));
  } else {
    entries.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  }

  // Résumé par compte
  let summaryByAccount = {};
  entries.forEach(e => {
    if (!summaryByAccount[e.accountCode]) {
      summaryByAccount[e.accountCode] = { name: e.accountName, debit: 0, credit: 0, count: 0 };
    }
    summaryByAccount[e.accountCode].debit += e.debit;
    summaryByAccount[e.accountCode].credit += e.credit;
    summaryByAccount[e.accountCode].count++;
  });

  const html = `
    <!-- Filters -->
    <div style="display:flex;gap:12px;margin-bottom:16px;align-items:center;flex-wrap:wrap;background:var(--s2);padding:12px;border-radius:var(--radius)">
      <div style="display:flex;gap:8px;align-items:center">
        <label for="gl-filter-from" style="font-size:.8rem;font-weight:600">${t('gl.dateFrom', 'From')}</label>
        <input type="date" id="gl-filter-from" value="${glFilterDateFrom}" style="font-size:.8rem;padding:4px 8px;border:1px solid var(--border);border-radius:4px">
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <label for="gl-filter-to" style="font-size:.8rem;font-weight:600">${t('gl.dateTo', 'To')}</label>
        <input type="date" id="gl-filter-to" value="${glFilterDateTo}" style="font-size:.8rem;padding:4px 8px;border:1px solid var(--border);border-radius:4px">
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <label for="gl-filter-account" style="font-size:.8rem;font-weight:600">${t('gl.account', 'Account')}</label>
        <select id="gl-filter-account" style="font-size:.8rem;padding:4px 8px;border:1px solid var(--border);border-radius:4px;max-width:200px">
          <option value="all">${t('gl.allAccounts', 'All Accounts')}</option>
          ${CHART_OF_ACCOUNTS.map(a => 
            '<option value="' + a.code + '">' + a.code + ' — ' + escapeHtml(a.name) + '</option>'
          ).join('')}
        </select>
      </div>
      <select id="gl-sort-by" style="font-size:.8rem;padding:4px 8px;border:1px solid var(--border);border-radius:4px;margin-left:auto">
        <option value="account" ${glSortBy === 'account' ? 'selected' : ''}>${t('gl.sortByAccount', 'Sort by Account')}</option>
        <option value="date" ${glSortBy === 'date' ? 'selected' : ''}>${t('gl.sortByDate', 'Sort by Date')}</option>
      </select>
      <button onclick="renderGeneralLedgerPanel()" style="padding:4px 12px;border:1px solid var(--border);background:var(--s1);cursor:pointer;border-radius:4px;font-weight:600">🔄 ${t('common.refresh', 'Refresh')}</button>
    </div>

    <!-- Summary by Account -->
    <div style="background:var(--s1);border-radius:var(--radius);padding:16px;border:1px solid var(--border);margin-bottom:24px;overflow-x:auto">
      <h4 style="margin-bottom:12px;font-size:.95rem;font-weight:700">${t('gl.summaryByAccount', 'Summary by Account')}</h4>
      <table style="width:100%;font-size:.8rem;border-collapse:collapse;min-width:600px">
        <thead>
          <tr style="border-bottom:2px solid var(--border);background:var(--s2);font-weight:700">
            <th style="padding:8px;text-align:left;min-width:80px">${t('gl.code', 'Code')}</th>
            <th style="padding:8px;text-align:left;flex:1">${t('gl.accountName', 'Account Name')}</th>
            <th style="padding:8px;text-align:right">${t('gl.debit', 'Debit')}</th>
            <th style="padding:8px;text-align:right">${t('gl.credit', 'Credit')}</th>
            <th style="padding:8px;text-align:right">${t('gl.balance', 'Balance')}</th>
            <th style="padding:8px;text-align:right">#</th>
          </tr>
        </thead>
        <tbody>
          ${Object.entries(summaryByAccount)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([code, data]) => {
              const balance = data.credit - data.debit; // Normal pour compte de Produits (credit)
              return '<tr style="border-top:1px solid var(--border)">' +
                '<td style="padding:8px;font-family:var(--mono);font-weight:700">' + escapeHtml(code) + '</td>' +
                '<td style="padding:8px">' + escapeHtml(data.name) + '</td>' +
                '<td style="padding:8px;text-align:right;font-family:var(--mono);font-weight:700">' + fmtNum(data.debit) + '</td>' +
                '<td style="padding:8px;text-align:right;font-family:var(--mono);font-weight:700">' + fmtNum(data.credit) + '</td>' +
                '<td style="padding:8px;text-align:right;font-family:var(--mono);font-weight:700;color:' + (balance > 0 ? '#16a34a' : balance < 0 ? '#dc2626' : '#6b7280') + '">' + fmtNum(balance) + '</td>' +
                '<td style="padding:8px;text-align:right;font-size:.75rem;color:var(--muted)">' + data.count + '</td>' +
                '</tr>';
            })
            .join('')}
        </tbody>
      </table>
    </div>

    <!-- Details -->
    <div style="background:var(--s1);border-radius:var(--radius);padding:16px;border:1px solid var(--border);margin-bottom:24px;overflow-x:auto">
      <h4 style="margin-bottom:12px;font-size:.95rem;font-weight:700">${t('gl.transactions', 'Transactions')} (${entries.length})</h4>
      <table style="width:100%;font-size:.75rem;border-collapse:collapse;min-width:800px">
        <thead>
          <tr style="border-bottom:2px solid var(--border);background:var(--s2);font-weight:700">
            <th style="padding:6px;text-align:left;min-width:80px">${t('gl.date', 'Date')}</th>
            <th style="padding:6px;text-align:left;min-width:70px">${t('gl.code', 'Code')}</th>
            <th style="padding:6px;text-align:left;flex:1;min-width:150px">${t('gl.description', 'Description')}</th>
            <th style="padding:6px;text-align:right;min-width:80px">${t('gl.debit', 'Débit')}</th>
            <th style="padding:6px;text-align:right;min-width:80px">${t('gl.credit', 'Crédit')}</th>
            <th style="padding:6px;text-align:center;min-width:60px">${t('gl.ref', 'Ref')}</th>
          </tr>
        </thead>
        <tbody id="gl-entries-tbody"></tbody>
      </table>
    </div>

    <!-- Export Buttons -->
    <div style="display:flex;gap:12px;flex-wrap:wrap">
      <button onclick="exportGeneralLedgerCsv()" style="padding:8px 16px;background:#16a34a;color:white;border:none;border-radius:var(--radius);cursor:pointer;font-weight:600">💾 ${t('gl.exportLedgerCsv', 'Export Ledger (CSV)')}</button>
      <button onclick="exportJournalSales()" style="padding:8px 16px;background:#2563eb;color:white;border:none;border-radius:var(--radius);cursor:pointer;font-weight:600">📘 ${t('gl.exportJournalSales', 'Export Sales Journal')}</button>
      <button onclick="exportJournalPurchases()" style="padding:8px 16px;background:#7c3aed;color:white;border:none;border-radius:var(--radius);cursor:pointer;font-weight:600">📙 ${t('gl.exportJournalPurchases', 'Export Purchase Journal')}</button>
      <button onclick="exportJournalBank()" style="padding:8px 16px;background:#0891b2;color:white;border:none;border-radius:var(--radius);cursor:pointer;font-weight:600">🏦 ${t('gl.exportJournalBank', 'Export Bank Journal')}</button>
    </div>
  `;

  panel.innerHTML = html;

  // Remplir le tableau des entrées
  const tbody = document.getElementById('gl-entries-tbody');
  if (tbody) {
    tbody.innerHTML = entries.map(e => `<tr style="border-top:1px solid var(--border);opacity:${e.isPayment ? '0.7' : '1'}">
      <td style="padding:6px">${e.date}</td>
      <td style="padding:6px;font-family:var(--mono);font-weight:700">${escapeHtml(e.accountCode)}</td>
      <td style="padding:6px">${e.description}</td>
      <td style="padding:6px;text-align:right;font-family:var(--mono);font-weight:700">${fmtNum(e.debit)}</td>
      <td style="padding:6px;text-align:right;font-family:var(--mono);font-weight:700">${fmtNum(e.credit)}</td>
      <td style="padding:6px;text-align:center;font-size:.7rem;color:var(--muted)">${escapeHtml(e.refNum || '—')}</td>
    </tr>`).join('');
  }

  // Bind event listeners pour les inputs
  document.getElementById('gl-filter-from').addEventListener('change', renderGeneralLedgerPanel);
  document.getElementById('gl-filter-to').addEventListener('change', renderGeneralLedgerPanel);
  document.getElementById('gl-filter-account').addEventListener('change', renderGeneralLedgerPanel);
  document.getElementById('gl-sort-by').addEventListener('change', function () {
    glSortBy = this.value;
    renderGeneralLedgerPanel();
  });
}
window.renderGeneralLedgerPanel = renderGeneralLedgerPanel;

// ════════════════════════════════════════════════════════════════════
// ─── EXPORTS JOURNAUX ──────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════

function _exportToCsv(filename, csvContent) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportGeneralLedgerCsv() {
  const t = (k, d) => translate ? translate(k) : d;
  const entries = buildGeneralLedger(glFilterDateFrom, glFilterDateTo, 'all');
  
  let csv = 'GENERAL LEDGER — CityRent — ' + new Date().toISOString().substring(0, 10) + '\n';
  csv += 'Period,' + glFilterDateFrom + ' to ' + glFilterDateTo + '\n\n';
  csv += 'Date,Account Code,Account Name,Type,Description,Debit,Credit,Reference\n';

  entries.forEach(e => {
    csv += `${e.date},"${e.accountCode}","${e.accountName.replace(/"/g, '""')}","${e.type}","${e.description.replace(/"/g, '""')}",${e.debit.toFixed(3)},${e.credit.toFixed(3)},"${e.refNum}"\n`;
  });

  _exportToCsv('General_Ledger_' + glFilterDateFrom + '_to_' + glFilterDateTo + '.csv', csv);
  showToast('✅ ' + (t('gl.exportedLedger', 'General Ledger exported')));
}
window.exportGeneralLedgerCsv = exportGeneralLedgerCsv;

function exportJournalSales() {
  const t = (k, d) => translate ? translate(k) : d;
  const entries = buildGeneralLedger(glFilterDateFrom, glFilterDateTo, 'all')
    .filter(e => e.type === 'Revenue');

  let csv = 'SALES JOURNAL (Produits) — CityRent — ' + new Date().toISOString().substring(0, 10) + '\n';
  csv += 'Period,' + glFilterDateFrom + ' to ' + glFilterDateTo + '\n\n';
  csv += 'Date,Account Code,Description,Amount,Reference,Client\n';

  entries.forEach(e => {
    csv += `${e.date},"${e.accountCode}","${e.description.replace(/"/g, '""')}",${e.credit.toFixed(3)},"${e.refNum}","${e.sourceType === 'contract' ? DB.contracts?.find(c => c.id === e.sourceId)?.client_name || '—' : ''}"\n`;
  });

  _exportToCsv('Journal_Sales_' + glFilterDateFrom + '_to_' + glFilterDateTo + '.csv', csv);
  showToast('✅ ' + (t('gl.exportedJournal', 'Sales Journal exported')));
}
window.exportJournalSales = exportJournalSales;

function exportJournalPurchases() {
  const t = (k, d) => translate ? translate(k) : d;
  const entries = buildGeneralLedger(glFilterDateFrom, glFilterDateTo, 'all')
    .filter(e => e.type === 'Expense');

  let csv = 'PURCHASE JOURNAL (Achats) — CityRent — ' + new Date().toISOString().substring(0, 10) + '\n';
  csv += 'Period,' + glFilterDateFrom + ' to ' + glFilterDateTo + '\n\n';
  csv += 'Date,Account Code,Category,Description,Amount,Reference\n';

  entries.forEach(e => {
    csv += `${e.date},"${e.accountCode}","${e.description.split(' — ')[0]}","${e.description.replace(/"/g, '""')}",${e.debit.toFixed(3)},"${e.refNum}"\n`;
  });

  _exportToCsv('Journal_Purchases_' + glFilterDateFrom + '_to_' + glFilterDateTo + '.csv', csv);
  showToast('✅ ' + (t('gl.exportedJournal', 'Purchase Journal exported')));
}
window.exportJournalPurchases = exportJournalPurchases;

function exportJournalBank() {
  const t = (k, d) => translate ? translate(k) : d;
  const entries = buildGeneralLedger(glFilterDateFrom, glFilterDateTo, 'all')
    .filter(e => e.type === 'Payment');

  let csv = 'BANK JOURNAL — CityRent — ' + new Date().toISOString().substring(0, 10) + '\n';
  csv += 'Period,' + glFilterDateFrom + ' to ' + glFilterDateTo + '\n\n';
  csv += 'Date,Description,Amount,Payment Method,Reference\n';

  entries.forEach(e => {
    csv += `${e.date},"${e.description.replace(/"/g, '""')}",${e.debit.toFixed(3)},"Bank","${e.refNum}"\n`;
  });

  _exportToCsv('Journal_Bank_' + glFilterDateFrom + '_to_' + glFilterDateTo + '.csv', csv);
  showToast('✅ ' + (t('gl.exportedJournal', 'Bank Journal exported')));
}
window.exportJournalBank = exportJournalBank;

// ════════════════════════════════════════════════════════════════════
// ─── HOOK INTÉGRATION UI ───────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════
// ─── HOOK INTÉGRATION UI (corrigé 2026-09) ─────────────────────────
// ════════════════════════════════════════════════════════════════════
// L'app utilise `switchRevenueTab(tab)` avec des `data-app-value="..."`
// (overview/daily/monthly/yearly/vehicle/profit/category/roi/accounting).
// On s'y accroche en injectant un nouvel onglet "gl" dans la pill bar
// existante (à côté de "tab-accounting" et "tab-vat") et un nouveau
// panneau `revenue-gl-section` à côté de `revenue-accounting-section`.

// 1) Injecter l'onglet "Grand Livre" dans la pill bar
function _ensureGlTab() {
  if (document.getElementById('tab-gl')) return; // déjà injecté
  const accountTab = document.getElementById('tab-accounting');
  if (!accountTab) return; // pas encore rendu
  const tab = document.createElement('button');
  tab.className = 'mod-pill';
  tab.id = 'tab-gl';
  tab.setAttribute('data-app-action', 'switch-revenue-tab');
  tab.setAttribute('data-app-value', 'gl');
  tab.innerHTML = '📖 <span data-i18n="gl.tab">Grand Livre</span>';
  // Insérer après "tab-vat" si présent, sinon après "tab-accounting"
  const vatTab = document.getElementById('tab-vat');
  const refTab = vatTab || accountTab;
  refTab.parentNode.insertBefore(tab, refTab.nextSibling);
}

// 2) Créer le panneau "revenue-gl-section"
function _ensureGlSection() {
  if (document.getElementById('revenue-gl-section')) return;
  const accSection = document.getElementById('revenue-accounting-section');
  if (!accSection) return;
  const section = document.createElement('div');
  section.id = 'revenue-gl-section';
  section.style.display = 'none';
  section.innerHTML = '<div id="general-ledger-panel"></div>';
  // Insérer après la section VAT si présente, sinon après accounting
  const vatSection = document.getElementById('revenue-vat-section');
  const refSection = vatSection || accSection;
  refSection.parentNode.insertBefore(section, refSection.nextSibling);
}

// 3) Attendre que la page revenue-stats soit dans le DOM
function _waitForRevenueStatsPageForGl() {
  if (document.getElementById('tab-accounting') && document.getElementById('revenue-accounting-section')) {
    _ensureGlTab();
    _ensureGlSection();
    return;
  }
  setTimeout(_waitForRevenueStatsPageForGl, 200);
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _waitForRevenueStatsPageForGl);
} else {
  _waitForRevenueStatsPageForGl();
}
// Observer les changements (la page est injectée après navigation)
new MutationObserver(function () {
  if (document.getElementById('tab-accounting') && document.getElementById('revenue-accounting-section')) {
    _ensureGlTab();
    _ensureGlSection();
  }
}).observe(document.body, { childList: true, subtree: true });

// 4) Wrapper switchRevenueTab pour afficher le panneau GL
if (typeof window.switchRevenueTab === 'function') {
  const _prevSwitchRevenueTab = window.switchRevenueTab;
  window.switchRevenueTab = function (tab) {
    if (tab === 'gl') {
      // D'abord : appeler la version originale pour mettre à jour la pill bar
      _prevSwitchRevenueTab('accounting');
      // Puis : cacher les sections existantes et afficher la nôtre
      const accSection = document.getElementById('revenue-accounting-section');
      const vatSection = document.getElementById('revenue-vat-section');
      const glSection = document.getElementById('revenue-gl-section');
      if (accSection) accSection.style.display = 'none';
      if (vatSection) vatSection.style.display = 'none';
      if (glSection) {
        glSection.style.display = 'block';
        // Marquer visuellement la pill "gl" comme active
        document.querySelectorAll('.mod-pill').forEach(p => p.classList.remove('on'));
        const glTab = document.getElementById('tab-gl');
        if (glTab) glTab.classList.add('on');
        renderGeneralLedgerPanel();
      }
      return;
    }
    // Pour tous les autres onglets : cacher notre section GL
    const glSection = document.getElementById('revenue-gl-section');
    if (glSection) glSection.style.display = 'none';
    return _prevSwitchRevenueTab.apply(this, arguments);
  };
}
