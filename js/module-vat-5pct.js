// ════════════════════════════════════════════════════════════════════
// module-vat-5pct.js — Gestion TVA 5% (Oman)
// ════════════════════════════════════════════════════════════════════
// Ajoute la gestion de la TVA 5% à CityRent :
//  1) Chaque dépense/revenu peut être marqué "vat5Pct: true"
//     → calcul auto HT/TTC
//  2) Résumé TVA collectée (revenus) / TVA déductible (dépenses)
//  3) Solde TVA à payer / crédit TVA
//  4) Export CSV pour déclaration mensuelle/trimestrielle
//
// Chargé APRÈS module-chart-of-accounts.js (voir app.html).
// Ajoute un onglet "TVA" dans Revenue Stats (menu Comptabilité).
//
// Pattern : redefine renderAccountingStats() en le wrappant (comme
// module-period-closing.js), plutôt que de toucher à switchRevenueTab()
// — plus robuste et indépendant de la structure interne.
// ════════════════════════════════════════════════════════════════════

let vatFilterMonth = new Date().toISOString().substring(0, 7);
let vatFilterQuarter = 'all'; // 'all' | 'Q1' | 'Q2' | 'Q3' | 'Q4'

// ─── VAT_RATE constant ───────────────────────────────────────────
const VAT_RATE = 0.05; // 5% en Oman

// ── Helper: calcule le HT depuis le TTC (vat5Pct = true)
function vatCalcNet(ttcAmount) {
  return parseFloat(ttcAmount) / (1 + VAT_RATE);
}

// ── Helper: calcule le TTC depuis le HT
function vatCalcGross(htAmount) {
  return parseFloat(htAmount) * (1 + VAT_RATE);
}

// ── Helper: extrait la TVA du montant TTC
function vatExtract(ttcAmount) {
  const net = vatCalcNet(ttcAmount);
  return ttcAmount - net;
}

window.vatCalcNet = vatCalcNet;
window.vatCalcGross = vatCalcGross;
window.vatExtract = vatExtract;

// ════════════════════════════════════════════════════════════════════
// ─── CALCUL TVA COLLECTÉE (revenues) ───────────────────────────────
// ════════════════════════════════════════════════════════════════════
function calculateVatOutput(filterMonth, filterYear) {
  let total = 0, vat = 0;
  (DB.contracts || []).forEach(c => {
    const cDate = c.date_in || c.date_out || '';
    if (filterMonth && cDate.substring(0, 7) !== filterMonth) return;
    if (filterYear && cDate.substring(0, 4) !== String(filterYear)) return;
    const amt = parseFloat(c.price || 0);
    if (c.vat5Pct) {
      const ht = vatCalcNet(amt);
      const v = amt - ht;
      total += ht;
      vat += v;
    } else {
      total += amt;
    }
  });
  return { amount: total, vat };
}

// ════════════════════════════════════════════════════════════════════
// ─── CALCUL TVA DÉDUCTIBLE (expenses) ──────────────────────────────
// ════════════════════════════════════════════════════════════════════
function calculateVatInput(filterMonth, filterYear) {
  let total = 0, vat = 0;
  (DB.depence || []).forEach(e => {
    const eDate = e.date || '';
    if (filterMonth && eDate.substring(0, 7) !== filterMonth) return;
    if (filterYear && eDate.substring(0, 4) !== String(filterYear)) return;
    const amt = parseFloat(e.amount || 0);
    if (e.vat5Pct) {
      const ht = vatCalcNet(amt);
      const v = amt - ht;
      total += ht;
      vat += v;
    } else {
      total += amt;
    }
  });
  return { amount: total, vat };
}

window.calculateVatOutput = calculateVatOutput;
window.calculateVatInput = calculateVatInput;

// ════════════════════════════════════════════════════════════════════
// ─── RÉSUMÉ TVA MENSUEL/TRIMESTRIEL ───────────────────────────────
// ════════════════════════════════════════════════════════════════════
function calculateVatBalance(filterMonth) {
  const output = calculateVatOutput(filterMonth);  // Collectée
  const input = calculateVatInput(filterMonth);    // Déductible
  const balance = output.vat - input.vat;
  return {
    output: output,
    input: input,
    balance: balance,
    toPay: balance > 0 ? balance : 0,    // À verser
    creditForward: balance < 0 ? -balance : 0  // Crédit à reporter
  };
}
window.calculateVatBalance = calculateVatBalance;

// ════════════════════════════════════════════════════════════════════
// ─── UI: PANNEAU TVA PRINCIPAL ─────────────────────────────────────
// ════════════════════════════════════════════════════════════════════
function renderVatPanel() {
  const panel = document.getElementById('vat-panel');
  if (!panel) return;
  const t = (k, d) => translate ? translate(k) : d;

  // Sélecteur de mois
  const monthPicker = document.getElementById('vat-month-picker');
  if (monthPicker) monthPicker.value = vatFilterMonth;

  const balance = calculateVatBalance(vatFilterMonth);
  const label = (typeof _calLabelFor === 'function') ? _calLabelFor(vatFilterMonth, 'month') : vatFilterMonth;

  const html = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(240px, 1fr));gap:16px;margin-bottom:24px">
      <!-- TVA Collectée -->
      <div class="stat-card" style="border-left:3px solid #16a34a">
        <div class="stat-label">📤 ${t('vat.outputLabel', 'VAT Output (Collected)')}</div>
        <div style="font-size:1.3rem;font-weight:700;color:#16a34a">${fmtNum(balance.output.vat)} OMR</div>
        <div style="font-size:.75rem;color:var(--muted);margin-top:6px">
          ${t('vat.onRevenue', 'On revenue')}: ${fmtNum(balance.output.amount)} OMR
        </div>
      </div>
      
      <!-- TVA Déductible -->
      <div class="stat-card" style="border-left:3px solid #2563eb">
        <div class="stat-label">📥 ${t('vat.inputLabel', 'VAT Input (Deductible)')}</div>
        <div style="font-size:1.3rem;font-weight:700;color:#2563eb">${fmtNum(balance.input.vat)} OMR</div>
        <div style="font-size:.75rem;color:var(--muted);margin-top:6px">
          ${t('vat.onExpenses', 'On expenses')}: ${fmtNum(balance.input.amount)} OMR
        </div>
      </div>
      
      <!-- Solde TVA -->
      <div class="stat-card" style="border-left:3px solid ${balance.balance > 0 ? '#dc2626' : '#0891b2'}">
        <div class="stat-label">${balance.balance > 0 ? '💳 ' : '💰 '}${t('vat.balanceLabel', 'VAT Balance')}</div>
        <div style="font-size:1.3rem;font-weight:700;color:${balance.balance > 0 ? '#dc2626' : '#0891b2'}">
          ${balance.balance > 0 ? '+' : ''}${fmtNum(balance.balance)} OMR
        </div>
        <div style="font-size:.75rem;color:var(--muted);margin-top:6px">
          ${balance.toPay > 0 ? '🔴 À verser: ' + fmtNum(balance.toPay) + ' OMR' : 
            balance.creditForward > 0 ? '🟢 Crédit: ' + fmtNum(balance.creditForward) + ' OMR' : 
            'Équilibré'}
        </div>
      </div>
    </div>

    <!-- Détail des transactions TVA -->
    <div style="background:var(--s1);border-radius:var(--radius);padding:16px;border:1px solid var(--border);margin-bottom:24px">
      <h4 style="margin-bottom:12px;font-size:.95rem;font-weight:700">${t('vat.detailsHeader', 'Transactions with VAT 5%')}</h4>
      <table style="width:100%;font-size:.8rem;border-collapse:collapse">
        <thead>
          <tr style="border-bottom:2px solid var(--border);font-weight:700">
            <th style="padding:8px;text-align:left">${t('vat.date', 'Date')}</th>
            <th style="padding:8px;text-align:left">${t('vat.type', 'Type')}</th>
            <th style="padding:8px;text-align:left">${t('vat.description', 'Description')}</th>
            <th style="padding:8px;text-align:right">${t('vat.netAmount', 'Net HT')}</th>
            <th style="padding:8px;text-align:right">📊 VAT</th>
            <th style="padding:8px;text-align:right">${t('vat.grossAmount', 'Gross TTC')}</th>
          </tr>
        </thead>
        <tbody id="vat-transactions-tbody"></tbody>
      </table>
    </div>
  `;

  panel.innerHTML = html;
  renderVatTransactions(vatFilterMonth);
}
window.renderVatPanel = renderVatPanel;

function renderVatTransactions(filterMonth) {
  const tbody = document.getElementById('vat-transactions-tbody');
  if (!tbody) return;

  const rows = [];
  const t = (k, d) => translate ? translate(k) : d;

  // Revenus avec TVA
  (DB.contracts || []).forEach(c => {
    if (!c.vat5Pct) return;
    const cDate = c.date_in || c.date_out || '';
    if (filterMonth && cDate.substring(0, 7) !== filterMonth) return;
    const ht = vatCalcNet(c.price || 0);
    const vat = (c.price || 0) - ht;
    rows.push({
      date: cDate,
      type: 'Revenue',
      desc: c.client_name || '—',
      net: ht,
      vat: vat,
      gross: c.price || 0,
      typeClass: '#16a34a'
    });
  });

  // Dépenses avec TVA
  (DB.depence || []).forEach(e => {
    if (!e.vat5Pct) return;
    const eDate = e.date || '';
    if (filterMonth && eDate.substring(0, 7) !== filterMonth) return;
    const ht = vatCalcNet(e.amount || 0);
    const vat = (e.amount || 0) - ht;
    rows.push({
      date: eDate,
      type: 'Expense',
      desc: escapeHtml(e.category || '—'),
      net: ht,
      vat: vat,
      gross: e.amount || 0,
      typeClass: '#2563eb'
    });
  });

  // Trier par date (recent first)
  rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:16px;color:var(--muted)">${t('vat.noTransactions', 'No transactions with VAT for this period')}</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(r => `<tr style="border-top:1px solid var(--border)">
    <td style="padding:8px">${r.date}</td>
    <td style="padding:8px"><span style="background:${r.typeClass}22;color:${r.typeClass};padding:2px 8px;border-radius:6px;font-weight:700;font-size:.7rem">${r.type}</span></td>
    <td style="padding:8px">${r.desc}</td>
    <td style="padding:8px;text-align:right;font-family:var(--mono,monospace);font-weight:700">${fmtNum(r.net)}</td>
    <td style="padding:8px;text-align:right;font-family:var(--mono,monospace);font-weight:700;color:#9333ea">${fmtNum(r.vat)}</td>
    <td style="padding:8px;text-align:right;font-family:var(--mono,monospace);font-weight:700">${fmtNum(r.gross)}</td>
  </tr>`).join('');
}
window.renderVatTransactions = renderVatTransactions;

// ════════════════════════════════════════════════════════════════════
// ─── EXPORT DÉCLARATION TVA (CSV) ──────────────────────────────────
// ════════════════════════════════════════════════════════════════════
function exportVatDeclaration(format = 'csv') {
  const t = (k, d) => translate ? translate(k) : d;
  const balance = calculateVatBalance(vatFilterMonth);
  const monthLabel = (typeof _calLabelFor === 'function') ? _calLabelFor(vatFilterMonth, 'month') : vatFilterMonth;

  if (format === 'csv') {
    // CSV pour import dans software comptable
    let csv = 'VAT Declaration Export — CityRent — ' + monthLabel + '\n\n';
    csv += 'Period,' + vatFilterMonth + '\n';
    csv += 'Date Generated,' + new Date().toISOString().substring(0, 10) + '\n\n';

    csv += 'SUMMARY,\n';
    csv += 'VAT Output (Collected),' + balance.output.vat + ',OMR\n';
    csv += 'VAT Input (Deductible),' + balance.input.vat + ',OMR\n';
    csv += 'VAT Balance,' + balance.balance + ',OMR\n';
    csv += 'Amount to Pay,' + balance.toPay + ',OMR\n\n';

    csv += 'DETAIL — REVENUES,\n';
    csv += 'Date,Client,Net HT,VAT 5%,Gross TTC\n';
    (DB.contracts || []).forEach(c => {
      if (!c.vat5Pct) return;
      const cDate = c.date_in || c.date_out || '';
      if (vatFilterMonth && cDate.substring(0, 7) !== vatFilterMonth) return;
      const ht = vatCalcNet(c.price || 0);
      const vat = (c.price || 0) - ht;
      csv += `${cDate},"${(c.client_name || '').replace(/"/g, '""')}",${ht.toFixed(3)},${vat.toFixed(3)},${(c.price || 0).toFixed(3)}\n`;
    });

    csv += '\nDETAIL — EXPENSES,\n';
    csv += 'Date,Category,Net HT,VAT 5%,Gross TTC\n';
    (DB.depence || []).forEach(e => {
      if (!e.vat5Pct) return;
      const eDate = e.date || '';
      if (vatFilterMonth && eDate.substring(0, 7) !== vatFilterMonth) return;
      const ht = vatCalcNet(e.amount || 0);
      const vat = (e.amount || 0) - ht;
      csv += `${eDate},"${(e.category || '').replace(/"/g, '""')}",${ht.toFixed(3)},${vat.toFixed(3)},${(e.amount || 0).toFixed(3)}\n`;
    });

    // Trigger download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'VAT_Declaration_' + vatFilterMonth + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('✅ ' + (translate ? translate('vat.exportedCsv') : 'VAT declaration exported'));
  }
}
window.exportVatDeclaration = exportVatDeclaration;

// ════════════════════════════════════════════════════════════════════
// ─── HOOK INTÉGRATION UI (corrigé 2026-09) ─────────────────────────
// ════════════════════════════════════════════════════════════════════
// L'app utilise `switchRevenueTab(tab)` avec des `data-app-value="..."`
// (overview/daily/monthly/yearly/vehicle/profit/category/roi/accounting).
// On s'y accroche en injectant un nouvel onglet "vat" dans la pill bar
// existante (à côté de "tab-accounting") et un nouveau panneau
// `revenue-vat-section` à côté de `revenue-accounting-section`.

// 1) Injecter l'onglet "VAT 5%" dans la pill bar (à côté de "tab-accounting")
function _ensureVatTab() {
  if (document.getElementById('tab-vat')) return; // déjà injecté
  const accountTab = document.getElementById('tab-accounting');
  if (!accountTab) return; // pas encore rendu
  const tab = document.createElement('button');
  tab.className = 'mod-pill';
  tab.id = 'tab-vat';
  tab.setAttribute('data-app-action', 'switch-revenue-tab');
  tab.setAttribute('data-app-value', 'vat');
  tab.innerHTML = '📊 <span data-i18n="vat.tab">TVA 5%</span>';
  accountTab.parentNode.insertBefore(tab, accountTab.nextSibling);
}

// 2) Créer le panneau "revenue-vat-section" à côté de "revenue-accounting-section"
function _ensureVatSection() {
  if (document.getElementById('revenue-vat-section')) return;
  const accSection = document.getElementById('revenue-accounting-section');
  if (!accSection) return;
  const section = document.createElement('div');
  section.id = 'revenue-vat-section';
  section.style.display = 'none';
  // Le panneau est rempli par renderVatPanel() à la première ouverture
  section.innerHTML = '<div id="vat-panel"></div>';
  accSection.parentNode.insertBefore(section, accSection.nextSibling);
}

// 3) Attendre que la page revenue-stats soit dans le DOM
function _waitForRevenueStatsPage() {
  if (document.getElementById('tab-accounting') && document.getElementById('revenue-accounting-section')) {
    _ensureVatTab();
    _ensureVatSection();
    return;
  }
  // Retry plus tard (la page est peut-être en cours de chargement)
  setTimeout(_waitForRevenueStatsPage, 200);
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _waitForRevenueStatsPage);
} else {
  _waitForRevenueStatsPage();
}
// Aussi : observer les changements du DOM (la page est injectée après navigation)
new MutationObserver(function () {
  if (document.getElementById('tab-accounting') && document.getElementById('revenue-accounting-section')) {
    _ensureVatTab();
    _ensureVatSection();
  }
}).observe(document.body, { childList: true, subtree: true });

// 4) Wrapper switchRevenueTab pour afficher le panneau VAT
if (typeof window.switchRevenueTab === 'function') {
  const _prevSwitchRevenueTab = window.switchRevenueTab;
  window.switchRevenueTab = function (tab) {
    if (tab === 'vat') {
      // D'abord : appeler la version originale pour mettre à jour la pill bar
      _prevSwitchRevenueTab('accounting');
      // Puis : cacher la section "Compte de Résultat" et afficher la nôtre
      const accSection = document.getElementById('revenue-accounting-section');
      const vatSection = document.getElementById('revenue-vat-section');
      if (accSection) accSection.style.display = 'none';
      if (vatSection) {
        vatSection.style.display = 'block';
        // Marquer visuellement la pill "vat" comme active
        document.querySelectorAll('.mod-pill').forEach(p => p.classList.remove('on'));
        const vatTab = document.getElementById('tab-vat');
        if (vatTab) vatTab.classList.add('on');
        renderVatPanel();
      }
      return;
    }
    // Pour tous les autres onglets : cacher notre section VAT
    const vatSection = document.getElementById('revenue-vat-section');
    if (vatSection) vatSection.style.display = 'none';
    return _prevSwitchRevenueTab.apply(this, arguments);
  };
}
