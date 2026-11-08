// ════════════════════════════════════════════════════════════════════
// module-cheque-alerts.js — Alertes d'échéance chèques (#7 de la roadmap
// comptabilité)
// ════════════════════════════════════════════════════════════════════
// Ajoute, sans toucher à module-depence.js :
//  1) Un badge d'échéance ("dû dans Xj" / "en retard de Xj") sur chaque
//     ligne de la liste des chèques (onglet Dépenses → Cheque).
//  2) Deux cartes "Trésorerie sortante" (J+7 / J+30) dans le résumé de
//     statut, en plus des cartes Pending/Cleared/Returned/Cancelled déjà
//     présentes.
//
// Chargé APRÈS module-depence.js (voir tableau `modules` dans app.html) —
// ce fichier redéfinit renderDepChequeStatusSummary() et
// renderDepChequeList() en entier, même technique que
// module-chart-of-accounts.js qui redéfinit déjà des fonctions de
// module-depence.js et module-revenue-stats.js.
//
// ⚠️ LIMITE CONNUE (à lire avant d'étendre) : ceci ne suit que les
// chèques ÉMIS par CityRent (DB.depence, e.payment === 'Cheque' →
// e.cheque.date). Les chèques REÇUS des clients n'ont aujourd'hui aucune
// structure équivalente (DB.payments a juste paymentMethod === 'CHEQUE',
// sans champ de date d'encaissement) — donc le point 2 de la roadmap
// ("trésorerie à J+7/J+30 qui combine chèques à encaisser ET chèques
// émis") n'est fait ici que pour le sens SORTANT. Pour le sens ENTRANT,
// il faudrait ajouter un sous-objet `cheque: {date, number}` aux
// paiements clients réglés par chèque (probablement dans
// module-payments.js, non fourni) puis étendre calculateCashflowForecast()
// ci-dessous — la fonction est volontairement écrite pour accueillir ça
// facilement (voir le bloc "chèques clients" en commentaire plus bas).
// ════════════════════════════════════════════════════════════════════

// ── Badge d'échéance pour un chèque pending ──
// diffDays < 0  → en retard
// diffDays = 0  → dû aujourd'hui
// diffDays 1-7  → urgent (orange)
// diffDays 8-30 → à venir (bleu)
// diffDays > 30 → pas de badge (pas encore pertinent)
function depChequeDueBadge(chq, status) {
  if (status !== 'pending' || !chq || !chq.date) return '';
  const t = (k, d) => (typeof translate === 'function' && translate(k) !== k) ? translate(k) : d;
  const due = new Date(chq.date);
  if (isNaN(due.getTime())) return '';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  const diffDays = Math.round((due - today) / 86400000);

  let label, color;
  if (diffDays < 0) {
    label = '⏰ ' + t('dep.chequeOverdueBy', 'Overdue by {n}d').replace('{n}', Math.abs(diffDays));
    color = '#dc2626';
  } else if (diffDays === 0) {
    label = '⏰ ' + t('dep.chequeDueToday', 'Due today');
    color = '#dc2626';
  } else if (diffDays <= 7) {
    label = '⏳ ' + t('dep.chequeDueIn', 'Due in {n}d').replace('{n}', diffDays);
    color = '#d97706';
  } else if (diffDays <= 30) {
    label = '📅 ' + t('dep.chequeDueIn', 'Due in {n}d').replace('{n}', diffDays);
    color = '#0891b2';
  } else {
    return '';
  }
  return '<span style="font-size:.68rem;font-weight:700;padding:2px 8px;border-radius:999px;background:' + color + '1e;color:' + color + ';white-space:nowrap">' + label + '</span>';
}
window.depChequeDueBadge = depChequeDueBadge;

// ── Prévision de trésorerie sortante (chèques émis pending) à J+7 / J+30 ──
// Volontairement séparée de renderDepChequeStatusSummary() pour pouvoir être
// réutilisée ailleurs (dashboard, futur module bancaire #12) sans dupliquer
// la logique de calcul.
function calculateCashflowForecast() {
  const allCheques = (DB.depence || []).filter(e => e.payment === 'Cheque');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const in7 = new Date(today.getTime() + 7 * 86400000);
  const in30 = new Date(today.getTime() + 30 * 86400000);

  let out7 = 0, out30 = 0;
  allCheques.forEach(e => {
    const chq = e.cheque || {};
    const status = (typeof CHEQUE_STATUSES !== 'undefined' && CHEQUE_STATUSES.indexOf(chq.status) !== -1) ? chq.status : 'pending';
    if (status !== 'pending' || !chq.date) return;
    const d = new Date(chq.date); d.setHours(0, 0, 0, 0);
    if (isNaN(d.getTime()) || d < today) return; // en retard déjà compté visuellement via le badge, pas dans la prévision à venir
    const amount = parseFloat(e.amount) || 0;
    if (d <= in7) out7 += amount;
    if (d <= in30) out30 += amount;
  });

  // ── Chèques clients (entrants) — PAS ENCORE TRACKÉS avec une date
  // d'encaissement structurée (voir note en tête de fichier). Quand
  // module-payments.js exposera p.cheque.date, décommenter et adapter :
  //
  // let in7Amt = 0, in30Amt = 0;
  // (DB.payments || []).forEach(p => {
  //   if ((p.paymentMethod || '').toUpperCase() !== 'CHEQUE' || !p.cheque || !p.cheque.date) return;
  //   const d = new Date(p.cheque.date); d.setHours(0,0,0,0);
  //   if (isNaN(d.getTime()) || d < today) return;
  //   const amount = parseFloat(p.paid || p.price || 0) || 0;
  //   if (d <= in7) in7Amt += amount;
  //   if (d <= in30) in30Amt += amount;
  // });

  return { out7: out7, out30: out30, in7: 0, in30: 0, inTracked: false };
}
window.calculateCashflowForecast = calculateCashflowForecast;

// ── Status summary — redéfinition COMPLÈTE de module-depence.js, mêmes
// 4 cartes de statut + mêmes 2 cartes "due this week/month" qu'avant,
// plus 2 nouvelles cartes de prévision de trésorerie sortante J+7/J+30. ──
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

  const forecast = calculateCashflowForecast();

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
    card('#4338ca', '📆 ' + t('dep.chequeDueMonth', 'Due this month'), dueThisMonth) +
    card('#be123c', '📤 ' + t('dep.cashflowOut7', 'Cash Out — 7 days'), forecast.out7) +
    card('#9f1239', '📤 ' + t('dep.cashflowOut30', 'Cash Out — 30 days'), forecast.out30, t('dep.cashflowNote', 'Only supplier cheques issued (tracked here) feed this forecast — client cheques received are not yet tracked with a due date in Payments.'));
}
window.renderDepChequeStatusSummary = renderDepChequeStatusSummary;

// ── Liste des chèques — redéfinition COMPLÈTE de module-depence.js,
// identique + une cellule "Échéance" (badge) en fin de ligne. ──
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
    ? `✓ ${t('dep.filtered', 'Filtered')}: ${depChequeListFrom || t('dep.start', 'start')} ${t('dep.to', 'to')} ${depChequeListTo || t('dep.now', 'now')} — ${list.length} ${t('dep.charges', 'charges')}`
    : `📅 ${t('dep.showingAllMonths', 'Showing all months')} — ${list.length} ${t('dep.charges', 'charges')}`;
  document.getElementById('depChequeListTotal').textContent = fmtNum(total);

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:20px;opacity:.5">${t('dep.noChequesPeriod', 'No cheque payments recorded for this period.')}</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(e => {
    let vehLabel = '—';
    if (e.kind === 'vehicle' && e.vehicleId) vehLabel = escapeHtml(depVehicleLabel(e.vehicleId));
    else if (e.kind === 'general') vehLabel = `<span style="opacity:.6">${t('dep.generalExpenses', 'General')}</span>`;
    const chq = e.cheque || {};
    const status = CHEQUE_STATUSES.indexOf(chq.status) !== -1 ? chq.status : 'pending';
    const meta = chequeStatusMeta(status);
    const statusSelect = `<select onchange="setChequeStatus(${e.id}, this.value)" style="font-size:.72rem;font-weight:700;padding:3px 6px;border-radius:6px;border:1px solid ${meta.color};color:${meta.color};background:${meta.color}14">
      ${CHEQUE_STATUSES.map(s => { const m = chequeStatusMeta(s); return `<option value="${s}" ${s === status ? 'selected' : ''}>${m.dot} ${m.label}</option>`; }).join('')}
    </select>`;
    const dueBadge = depChequeDueBadge(chq, status) || '<span style="opacity:.3">—</span>';
    return `<tr style="border-top:1px solid var(--border)">
      <td style="padding:8px 10px">${depFmtDate(chq.date || e.date)}</td>
      <td style="padding:8px 10px">${vehLabel}</td>
      <td style="padding:8px 10px"><span class="badge" style="background:${depTypeColor(e.category)}22;color:${depTypeColor(e.category)};padding:2px 8px;border-radius:999px;font-size:.7rem;font-weight:700">${escapeHtml(e.category || '')}</span></td>
      <td style="padding:8px 10px;text-align:right;font-weight:700;font-family:var(--mono,monospace)">${fmtNum(e.amount)}</td>
      <td style="padding:8px 10px">${escapeHtml(chq.name || '—')}</td>
      <td style="padding:8px 10px;font-family:var(--mono,monospace)">${escapeHtml(chq.number || '—')}</td>
      <td style="padding:8px 10px">${statusSelect}</td>
      <td style="padding:8px 10px">${dueBadge}</td>
    </tr>`;
  }).join('');
}
window.renderDepChequeList = renderDepChequeList;
