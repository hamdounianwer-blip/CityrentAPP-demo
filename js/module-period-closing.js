// ════════════════════════════════════════════════════════════════════
// module-period-closing.js — Clôture de période (#8 de la roadmap
// comptabilité)
// ════════════════════════════════════════════════════════════════════
// DB.closedMonths : tableau de mois 'YYYY-MM' (chargé depuis le serveur,
// voir core.js). Persisté via POST /save-closed-months (server.js) —
// stocké dans la table meta, même mécanisme que depenceCategories.
//
// Application du blocage : server.js est la SEULE source de vérité —
// /save-one et /delete-one renvoient une erreur 403 explicite pour toute
// dépense/paiement dont la date tombe dans un mois clôturé, et dbSave()
// (autosave en arrière-plan) ignore silencieusement ces enregistrements
// en défense en profondeur. Ce module ne fait qu'exposer le panneau
// "Clôturer [mois]" (visible Directeur + rôle comptable, voir #11 /
// module-director-filter.js pour isDirector() et window.AUTH.role) et
// afficher clairement l'erreur serveur si un utilisateur tente quand
// même une modification sur un mois clôturé.
//
// ⚠️ LIMITE CONNUE : la "écriture de correction explicite, datée du mois
// courant, qui référence la pièce d'origine" prévue par la roadmap pour
// corriger une erreur découverte après clôture N'EST PAS implémentée —
// aujourd'hui, une fois un mois clôturé, ses dépenses/paiements sont
// bloqués sans mécanisme de contournement officiel dans l'app (il faudra
// rouvrir le mois via reopenMonth() ci-dessous, corriger, puis re-
// clôturer — pas idéal pour l'audit trail, mais fonctionnel en
// attendant une vraie écriture de correction).
// ════════════════════════════════════════════════════════════════════

function _closeCanManage() {
  return !!(window.AUTH && (window.AUTH.isAdmin || window.AUTH.role === 'accountant'));
}

function isMonthClosedClient(dateStr) {
  if (!dateStr || !Array.isArray(DB.closedMonths)) return false;
  const mk = String(dateStr).substring(0, 7);
  return DB.closedMonths.indexOf(mk) !== -1;
}
window.isMonthClosedClient = isMonthClosedClient;

// ── Persistance — même pattern que saveDepenceCategories() (core.js) :
// POST du tableau complet, pas d'upsert ligne par ligne. ──
function _saveClosedMonths(newList, onSuccess) {
  if (!_SERVER_MODE) return;
  const opts = {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ closedMonths: newList })
  };
  if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) opts.signal = AbortSignal.timeout(45000);
  fetch('/save-closed-months', opts)
    .then(r => {
      if (r.status === 401) { handleAuthExpired(); return null; }
      return r.json().then(body => ({ status: r.status, body }));
    })
    .then(result => {
      if (!result) return;
      if (result.status === 200 && result.body.ok) {
        DB.closedMonths = result.body.closedMonths;
        if (typeof onSuccess === 'function') onSuccess();
        renderPeriodClosingPanel();
      } else {
        showToast('❌ ' + (result.body.error || 'Save failed'));
      }
    })
    .catch(err => {
      console.error('❌ save-closed-months réseau KO:', err.message);
      showToast('⚠️ Closed months not saved — server unreachable');
    });
}

function closeSelectedMonth() {
  if (!_closeCanManage()) return;
  const input = document.getElementById('closure-month-input');
  const month = input ? input.value : '';
  if (!month) { showToast('⚠️ ' + (translate('close.pickMonth') || 'Pick a month first')); return; }
  if ((DB.closedMonths || []).indexOf(month) !== -1) { showToast('ℹ️ ' + month + ' — ' + (translate('close.alreadyClosed') || 'already closed')); return; }

  const label = (typeof _calLabelFor === 'function') ? _calLabelFor(month, 'month') : month;
  if (!confirm((translate('close.confirmClose') || 'Close {month}? Expenses and payments dated in this month can no longer be edited or deleted.').replace('{month}', label))) return;

  const newList = (DB.closedMonths || []).concat([month]).sort();
  _saveClosedMonths(newList, function () {
    showToast('🔒 ' + label + ' ' + (translate('close.closedToast') || 'closed'));
  });
}
window.closeSelectedMonth = closeSelectedMonth;

function reopenMonth(month) {
  if (!_closeCanManage()) return;
  const label = (typeof _calLabelFor === 'function') ? _calLabelFor(month, 'month') : month;
  if (!confirm((translate('close.confirmReopen') || 'Reopen {month}? Its expenses and payments become editable again.').replace('{month}', label))) return;
  const newList = (DB.closedMonths || []).filter(m => m !== month);
  _saveClosedMonths(newList, function () {
    showToast('🔓 ' + label + ' ' + (translate('close.reopenedToast') || 'reopened'));
  });
}
window.reopenMonth = reopenMonth;

function renderPeriodClosingPanel() {
  const panel = document.getElementById('period-closing-panel');
  if (!panel) return;
  if (!_closeCanManage()) { panel.style.display = 'none'; return; }
  panel.style.display = 'block';

  const list = document.getElementById('closed-months-list');
  if (!list) return;
  const months = (DB.closedMonths || []).slice().sort().reverse();
  if (!months.length) {
    list.innerHTML = '<span style="font-size:.78rem;color:var(--muted);font-style:italic">' + (translate('close.noneClosed') || 'No month closed yet.') + '</span>';
    return;
  }
  list.innerHTML = months.map(m => {
    const label = (typeof _calLabelFor === 'function') ? _calLabelFor(m, 'month') : m;
    return '<span style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;background:#dc262614;color:#dc2626;font-size:.75rem;font-weight:700">' +
      '🔒 ' + label +
      ' <button type="button" onclick="reopenMonth(\'' + m + '\')" title="' + (translate('close.reopenTitle') || 'Reopen') + '" style="border:none;background:none;color:#dc2626;cursor:pointer;font-weight:800;padding:0 2px">✕</button>' +
      '</span>';
  }).join('');
}
window.renderPeriodClosingPanel = renderPeriodClosingPanel;

// ── Hook — on ENVELOPPE renderAccountingStats() (déjà défini par
// module-chart-of-accounts.js) plutôt que de redéfinir tout
// switchRevenueTab() une 4e fois : plus sûr, ne dépend d'aucun détail
// interne des couches précédentes. ──
(function () {
  const _prevRenderAccountingStats = (typeof renderAccountingStats === 'function') ? renderAccountingStats : function () {};
  function renderAccountingStatsWithClosing() {
    _prevRenderAccountingStats();
    renderPeriodClosingPanel();
  }
  window.renderAccountingStats = renderAccountingStatsWithClosing;
})();
