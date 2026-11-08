// ═══════════════════════════════════════════════════════════════════
// module-daily-rentals-payments.js
// PAYMENTS — historique / ajout de paiements sur un contrat
// Extrait automatiquement de module-daily-rentals.js (découpage mécanique,
// aucune ligne modifiée — tout reste en portée globale, comme avant).
// ═══════════════════════════════════════════════════════════════════

// ── paymentsForContract — IMPORTANT : les numéros de contrat sont propres à
// chaque branche (BARKA et MOEBELA ont chacune leur propre séquence
// indépendante, ex: contrat "4499" existe une fois côté BARKA et une fois
// côté MOEBELA — ce n'est PAS un doublon, c'est le fonctionnement normal).
// Matcher les paiements uniquement par numéro de contrat (sans la branche)
// mélange donc les paiements de deux contrats différents qui partagent le
// même numéro dans des branches différentes. Cette fonction centralise le
// matching correct : contrat + branche (+ véhicule si connu, en sécurité
// supplémentaire). Toujours utiliser cette fonction plutôt que de filtrer
// DB.payments par contrat seul.
// ── PERF (2026-08) : index par contract, reconstruit auto si DB.payments
// change (ref ou length) — évite de rescanner TOUT DB.payments à chaque
// appel (avant : O(rentals × payments) sur chaque render/filter de Daily
// Rentals). Le résultat reste 100% live : mêmes objets payments réels,
// juste un accès O(1) par contract au lieu d'un scan complet. ──
let _paymentsIdxCache = null;
let _paymentsIdxRef = null;
let _paymentsIdxLen = -1;
function _getPaymentsIndex(){
  if(_paymentsIdxCache && _paymentsIdxRef === DB.payments && _paymentsIdxLen === DB.payments.length) return _paymentsIdxCache;
  let idx = new Map();
  for(let i=0;i<DB.payments.length;i++){
    let p = DB.payments[i];
    let key = String(p.contract);
    if(key === '') continue;
    let arr = idx.get(key);
    if(!arr){ arr = []; idx.set(key, arr); }
    arr.push(p);
  }
  _paymentsIdxCache = idx;
  _paymentsIdxRef = DB.payments;
  _paymentsIdxLen = DB.payments.length;
  return idx;
}

function paymentsForContract(contract, branch, vehicleId){
  let key = String(contract);
  if(key === '') return [];
  let candidates = _getPaymentsIndex().get(key) || [];
  return candidates.filter(p => {
    if(branch && p.branch && String(p.branch).toUpperCase() !== String(branch).toUpperCase()) return false;
    if(vehicleId && p.vehicleId && p.vehicleId !== vehicleId) return false;
    return true;
  });
}


// ── getRealReceiptFor — FIX (2026-09) : le champ `rental.receipt` est un ID interne de secours
// (généré via 'R'+Date.now() si aucun receipt n'a été saisi) — PAS le vrai numéro de reçu
// business (ex: "10539B"). Le vrai numéro de reçu vit sur les PAIEMENTS (DB.payments[i].receipt,
// format "N°+lettre branche"). Cette fonction va chercher le vrai reçu le plus pertinent
// (le plus récent, hors quickAdd qui n'a pas de reçu) pour un contrat donné. ──
function getRealReceiptFor(rental){
  if(!rental) return null;
  let pays = paymentsForContract(rental.contract, rental.branch, rental.vehicleId)
    .filter(p => !p._quickAdd && p.receipt);
  if(!pays.length) return null;
  pays.sort((a,b) => (parseInt(String(b.receipt).replace(/[^0-9]/g,''),10)||0) - (parseInt(String(a.receipt).replace(/[^0-9]/g,''),10)||0));
  return pays[0].receipt;
}


// FONCTION SAVE RENTAL CORRIGÉE — LE BUG PRINCIPAL EST ICI

// ─── Multi-Payment System ───────────────────────────────────────
window._editingRentalPayments = [];

// ── renderPaymentHistory (orig. line 4416) ──
function renderPaymentHistory(){
  let hist = document.getElementById('r-paid-history');
  let totEl = document.getElementById('r-paid-total');
  let paidHidden = document.getElementById('r-paid');
  if(!hist) return;
  let payments = window._editingRentalPayments || [];
  let total = payments.reduce((s,p) => s + Number(p.amount||0), 0);
  if(paidHidden) paidHidden.value = total;
  if(totEl) totEl.textContent = fmtNum(total) + ' OMR';
  if(!payments.length){
    hist.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:.78rem;padding:8px">No payments yet</div>';
    return;
  }
  // Récupérer le contract in progress d'édition pour enrichissement
  let _editContract = document.getElementById('r-contract') ? document.getElementById('r-contract').value : '';
  // FIX (2026-08) : récupérer aussi la branche du rental édité pour scoper
  // la recherche ci-dessous (sinon libellé méthode/reçu pouvait venir d'un
  // paiement de l'autre branche partageant même n° contrat + même montant/date).
  let _editId2 = document.getElementById('modal-rental') ? document.getElementById('modal-rental').getAttribute('data-edit-id') : '';
  let _editBranch = (_editId2 && _editId2 !== '') ? (DB.rentals.find(r => r.id === Number(_editId2))||{}).branch : undefined;
  hist.innerHTML = payments.map((p,i) => {
    let d = p.date ? p.date.split('-') : ['','',''];
    let dFmt = d.length===3 ? d[2]+'/'+d[1]+'/'+d[0] : (p.date||'—');
    let method = p.method || '';
    let receipt = p.receipt || '';
    // Si method/receipt manquent, chercher dans DB.payments
    if((!method || !receipt) && _editContract){
      let match = DB.payments.find(dp =>
        String(dp.contract) === String(_editContract) &&
        Number(dp.price) === Number(p.amount) &&
        (dp.dateOut||'').slice(0,10) === (p.date||'').slice(0,10) &&
        (!_editBranch || !dp.branch || String(dp.branch).toUpperCase() === String(_editBranch).toUpperCase())
      );
      if(match){ method = method || match.paymentMethod || ''; receipt = receipt || match.receipt || ''; }
    }
    let meta = '';
    if(method && method !== 'POST') meta += ' · ' + method;
    else if(method === 'POST') meta += ' · POST';
    if(receipt) meta += ' #' + receipt;
    return `<div style="display:flex;align-items:center;gap:8px;background:var(--s1);border:1px solid var(--border);border-radius:6px;padding:6px 10px">
      <span style="font-size:.8rem">💳</span>
      <span style="font-family:var(--mono);font-weight:700;color:var(--green);font-size:.88rem">${fmtNum(Number(p.amount))} OMR</span>
      <span style="color:var(--muted);font-size:.75rem">📅 ${dFmt}${meta ? ' <span style="opacity:.75">'+meta+'</span>' : ''}</span>
      <button type="button" data-dr-action="remove-payment-entry" data-dr-index="${i}" style="margin-left:auto;background:rgba(220,38,38,.1);border:1px solid rgba(220,38,38,.2);color:var(--red);border-radius:4px;padding:2px 7px;cursor:pointer;font-size:.75rem;font-weight:700">✕</button>
    </div>`;
  }).join('');
}


// ── quickAddPayment (orig. line 4458) ──
function quickAddPayment(){
  let amtEl = document.getElementById('r-paid-add');
  let dateEl = document.getElementById('r-paid-date');
  let methodEl = document.getElementById('r-paid-method');
  let amt = parseFloat(amtEl.value);
  if(!amt || amt <= 0){ toast('⚠️ Please enter a valid amount'); amtEl.focus(); return; }
  let date = dateEl.value || new Date().toISOString().slice(0,10);
  // Block receipt/payment dates earlier than the contract's Date Out
  let contractOutEl = document.getElementById('r-out');
  if(contractOutEl && contractOutEl.value){
    let contractOutDay = contractOutEl.value.slice(0,10);
    if(date < contractOutDay){
      alert(t(translate('rental.alertPaymentDateBeforeContract'), date, contractOutDay));
      dateEl.focus();
      return;
    }
  }
  let method = methodEl ? methodEl.value : 'CASH';
  let contract = document.getElementById('r-contract') ? document.getElementById('r-contract').value.trim() : '';
  let plate = document.getElementById('r-plate') ? document.getElementById('r-plate').value.trim() : '';
  let vehicleIdQ = null; if(plate){ let fv = DB.vehicles.find(v => v.plate === plate); if(fv) vehicleIdQ = fv.id; }
  // Pas de receipt pour quickAdd — identifiant interne uniquement pour le tracking
  let internalId = 'QA' + Date.now() + Math.random().toString(36).slice(2,5);
  let newEntry = { amount: amt, date: date, method: method, receipt: '', id: Date.now(), _quickAdd: true, _internalId: internalId };
  if(!window._editingRentalPayments) window._editingRentalPayments = [];
  window._editingRentalPayments.push(newEntry);
  // Pousser dans DB.payments sans receipt — jamais visible dans le menu Payments
  if(contract){
    let initStatus = method === 'POST' ? 'PAID' : method === 'TRANSFERT' ? 'TRANSFERT' : 'UNPAID-CASH';
    let syncR = DB.rentals.find(r => String(r.contract) === String(contract));
    let vehQ = vehicleIdQ ? DB.vehicles.find(v => v.id === vehicleIdQ) : DB.vehicles.find(v => v.plate === plate);
    // Branche depuis session en priorité, pas depuis le véhicule (shared)
    let branchQ = (window.AUTH && !window.AUTH.isAdmin && Array.isArray(window.AUTH.branches) && window.AUTH.branches[0])
      || (syncR && syncR.branch && syncR.branch.toLowerCase() !== 'shared' ? syncR.branch : undefined)
      || undefined;
    DB.payments.push({
      id: _genId(),
      vehicleId: vehicleIdQ,
      _plate: vehicleIdQ ? undefined : plate,
      contract: contract,
      branch: branchQ,
      receipt: '',           // PAS de receipt
      _internalId: internalId,
      paymentMethod: method,
      statusLabel: initStatus,
      price: amt,
      paid: amt,
      paymentDone: initStatus === 'PAID',
      dateOut: date,
      _quickAdd: true        // exclu du menu Payments et des reçus
    });
    // Sync r.paid immediatement sur le rental existant
    if(syncR){
      syncR.paid = paymentsForContract(contract, syncR.branch, syncR.vehicleId).reduce((s,p) => s + Number(p.price||0), 0);
      syncR._balManual = false;
      if(syncR.dateIn && syncR.dateIn !== '') syncR.bal = calcRentalBAL(syncR);
      else syncR.bal = calcOpenContractBAL(syncR);
    }
  }
  amtEl.value = '';
  renderPaymentHistory();
  toast('⚡ ' + fmtNum(amt) + ' OMR added — click Save to record');
}


// ── addPaymentEntry (orig. line 4516) ──
function addPaymentEntry(){
  let amtEl = document.getElementById('r-paid-add');
  let dateEl = document.getElementById('r-paid-date');
  let methodEl = document.getElementById('r-paid-method');
  let amt = parseFloat(amtEl.value);
  if(!amt || amt <= 0){ toast(translate('rental.enterValidAmount')); amtEl.focus(); return; }
  let date = dateEl.value || new Date().toISOString().slice(0,10);
  // Block receipt/payment dates earlier than the contract's Date Out
  let contractOutEl2 = document.getElementById('r-out');
  if(contractOutEl2 && contractOutEl2.value){
    let contractOutDay2 = contractOutEl2.value.slice(0,10);
    if(date < contractOutDay2){
      alert(t(translate('rental.alertPaymentDateBeforeContract'), date, contractOutDay2));
      dateEl.focus();
      return;
    }
  }
  let plate = document.getElementById('r-plate').value.trim();
  let contract = document.getElementById('r-contract').value.trim();
  window._pendingPaymentFromRental = { amount: amt, date: date, contract: contract };
  editingPaymentId = null;
  document.getElementById('pay-plate').value = plate;
  document.getElementById('pay-contract').value = contract;
  document.getElementById('pay-amount').value = amt;
  document.getElementById('pay-date').value = date;
  let m = methodEl ? methodEl.value : 'POST';
  document.getElementById('pay-method').value = m;
  updatePayStatusPreview(m);
  togglePdfUpload(m);
  currentPdfData = null;
  let pdfInfo = document.getElementById('pdf-preview-info');
  if(pdfInfo) pdfInfo.innerHTML = '';
  let maxR = 0;
  DB.payments.forEach(function(p){ let n = parseInt((p.receipt||'').toString().replace(/[^0-9]/g,''),10); if(!isNaN(n)&&n>maxR) maxR=n; });
  let branchLetterR = (Array.isArray(window.AUTH.branches) && window.AUTH.branches.length === 1)
    ? window.AUTH.branches[0].charAt(0).toUpperCase() : '';
  document.getElementById('pay-receipt').value = maxR > 0 ? (maxR+1).toString() + branchLetterR : '';
  if(document.getElementById('pay-bank-receipt')) document.getElementById('pay-bank-receipt').value = '';
  amtEl.value = '';
  openModal('payment-modal');
}


// ── removePaymentEntry (orig. line 4556) ──
function removePaymentEntry(idx){
  if(!window._editingRentalPayments) return;
  // 🔒 Protection mot de passe
  securePrompt('🗑️ Enter password to delete payment').then(function(pw){
  if(pw === null) return; // annulé
  checkPassword(pw, 'Daily Rentals — Delete Payment Entry').then(function(ok){
  if(!ok){
    toast(translate('rental.wrongPasswordExclaim'));
    return;
  }
  let p = window._editingRentalPayments[idx];
  window._editingRentalPayments.splice(idx, 1);
  // Delete de DB.payments — par receipt (payments normaux) ou _internalId (quickAdd)
  if(p){
    if(p.receipt && p.receipt !== ''){
      DB.payments = DB.payments.filter(x => x.receipt !== p.receipt);
    } else if(p._internalId && p._internalId !== ''){
      DB.payments = DB.payments.filter(x => x._internalId !== p._internalId);
    } else if(p.id){
      // Fallback: match by id (covers quickAdd entries without _internalId)
      DB.payments = DB.payments.filter(x => x.id !== p.id);
    }
    // ── FIX (2026-07) : notifier le serveur EXPLICITEMENT — /save (complète)
    // ne supprime plus rien par déduction, donc sans ceci le paiement
    // réapparaîtrait tout seul au prochain chargement. No-op sans risque si
    // ce paiement n'était pas encore synchronisé côté serveur.
    if(p.id && typeof deleteOne === 'function') deleteOne('payments', p.id, null);
  }
  // Sync r.paid depuis DB.payments (source de verite)
  let contract = document.getElementById('r-contract') ? document.getElementById('r-contract').value : '';
  if(contract){
    // FIX (2026-08) : préférer le match par edit-id (non-ambigu) plutôt que par
    // contrat seul — évite de choper le mauvais rental si le même n° de contrat
    // existe dans l'autre branche (session Directeur).
    let _editId = document.getElementById('modal-rental') ? document.getElementById('modal-rental').getAttribute('data-edit-id') : '';
    let syncR = (_editId && _editId !== '') ? DB.rentals.find(r => r.id === Number(_editId)) : DB.rentals.find(r => String(r.contract) === String(contract));
    if(syncR){
      let scopedPays = paymentsForContract(contract, syncR.branch, syncR.vehicleId);
      syncR.paid = scopedPays.reduce((s,x) => s + Number(x.paid || x.price||0), 0);
      syncR.paymentLog = scopedPays.map(x => ({ amount: Number(x.paid || x.price||0), date: x.dateOut||'', method: x.paymentMethod||'CASH', receipt: x.receipt||'', id: x.id }));
      syncR._balManual = false;
      if(syncR.dateIn && syncR.dateIn !== '') syncR.bal = calcRentalBAL(syncR);
      else syncR.bal = calcOpenContractBAL(syncR);
    }
  }
  // Update visible paid field (important for new rentals not yet saved)
  let paidHiddenEl = document.getElementById('r-paid');
  if(paidHiddenEl){
    let newTotal = (window._editingRentalPayments||[]).reduce((s,x) => s + Number(x.amount||0), 0);
    paidHiddenEl.value = newTotal;
  }
  renderPaymentHistory();
  if(p) toast('🗑️ Removed: ' + fmtNum(Number(p.amount)) + ' OMR');
  }); // end checkPassword
  }); // end securePrompt
}


// ── showPaymentHistory (orig. line 6275) ──
function showPaymentHistory(contractNum, branchHint){
  // FIX (2026-08) : branchHint (optionnel) désambiguïse quand le même n° de
  // contrat existe dans les 2 branches (session Directeur) — sans ça on
  // pouvait tomber sur le mauvais rental/paiements de l'autre agence.
  let matchBranch = r => !branchHint || !r.branch || String(r.branch).toUpperCase() === String(branchHint).toUpperCase();
  let rental = DB.rentals.find(r => String(r.contract) === String(contractNum) && (!r.dateIn || r.dateIn === '') && matchBranch(r));
  if(!rental) rental = DB.rentals.find(r => String(r.contract) === String(contractNum) && matchBranch(r));
  if(!rental) rental = DB.rentals.find(r => String(r.contract) === String(contractNum));
  if(!rental){ toast(translate('rental.contractNotFound')); return; }
  let v = DB.vehicles.find(x => x.id === rental.vehicleId) || {};
  let monthNames=['January','February','March','April','May','June','July','August','September','October','November','December'];

  // ── Source unique : DB.payments pour ce contract, scopé par branche/véhicule ──
  let dbPays = paymentsForContract(contractNum, rental.branch, rental.vehicleId);

  // Construire la liste complète de payments
  let allRows = dbPays.map(p => ({
    date: p.dateOut || '',
    amount: Number(p.price||0),
    method: p.paymentMethod || '',
    receipt: p.receipt || '',
    _quickAdd: p._quickAdd || false
  }));

  // Fallback : paymentLog du rental si DB.payments vide
  if(!allRows.length && (rental.paymentLog||[]).length){
    allRows = (rental.paymentLog||[]).map(p => ({
      date: p.date||'', amount: Number(p.amount||0),
      method: p.method||'', receipt: p.receipt||''
    }));
  }

  // Fallback ultime : r.paid sans detail
  if(!allRows.length && Number(rental.paid||0) > 0){
    allRows = [{ date: rental.dateOut ? rental.dateOut.slice(0,10) : '', amount: Number(rental.paid), method: '', receipt: '', _legacy: true }];
  }

  allRows.sort((a,b) => (a.date||'').localeCompare(b.date||''));

  // ── Grouper par month ──
  let byMonth = {};
  allRows.forEach(p => {
    let ym = (p.date||'').slice(0,7) || 'unknown';
    if(!byMonth[ym]) byMonth[ym] = [];
    byMonth[ym].push(p);
  });
  let months = Object.keys(byMonth).sort();
  let grandTotal = allRows.reduce((s,p) => s + p.amount, 0);
  let bal = calcBAL(rental);

  let html = `<div class="ph-contract-title">💳 Contract <strong>${contractNum}</strong> — ${escapeHtml(v.name||rental._name)||'—'} · ${escapeHtml(v.plate||rental._plate)||'—'}<br>
    <span style="font-size:.75rem;color:var(--muted);font-weight:400">Departure: ${rental.dateOut ? rental.dateOut.slice(0,10) : '—'} &nbsp;·&nbsp; Remaining BAL: <span style="color:${bal>0?'#ef4444':'#22c55e'};font-weight:700">${fmtNum(bal)} OMR</span></span></div>`;

  if(!months.length){
    html += `<div class="ph-empty">📭 No payment records for this contract</div>`;
  } else {
    months.forEach((ym, mi) => {
      let rows = byMonth[ym];
      let monthTotal = rows.reduce((s,p) => s + p.amount, 0);
      let [yr, mo] = ym.split('-');
      let mLabel = mo ? (monthNames[Number(mo)-1] + ' ' + yr) : ym;
      let blockId = 'ph-month-' + ym.replace('-','');
      html += `
        <div style="margin-bottom:8px;border:1.5px solid var(--border);border-radius:8px;overflow:hidden">
          <div data-dr-action="toggle-by-id" data-dr-target="${blockId}" data-dr-chev-class="ph-chev"
            style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:linear-gradient(135deg,var(--green3),var(--green));cursor:pointer;user-select:none">
            <span style="font-weight:700;color:#fff;font-size:.88rem">📅 ${mLabel}</span>
            <div style="display:flex;align-items:center;gap:10px">
              <span style="background:rgba(255,255,255,.25);border-radius:20px;padding:2px 10px;font-size:.72rem;color:#fff;font-weight:700">${rows.length} payment${rows.length>1?'s':''}</span>
              <span style="font-family:var(--mono);font-weight:800;color:#fff;font-size:.92rem">${fmtNum(monthTotal)} OMR</span>
              <span class="ph-chev" style="color:#fff;font-size:.8rem">▼</span>
            </div>
          </div>
          <div id="${blockId}" style="display:${mi===months.length-1?'block':'none'}">
            ${rows.map((p,i) => {
              let d = (p.date||'').split('-');
              let dFmt = d.length===3 ? d[2]+'/'+d[1]+'/'+d[0] : (p.date||'—');
              let meta = '';
              if(p._quickAdd) meta += ' <span style="background:rgba(37,99,235,.15);color:#60a5fa;border-radius:3px;padding:1px 5px;font-size:.68rem;font-weight:700">⚡ Quick</span>';
              if(p.method && p.method !== 'POST') meta += ' · ' + p.method;
              else if(p.method === 'POST') meta += ' · POST';
              if(p.receipt && !p._quickAdd) meta += ' <span style="font-size:.72rem;color:var(--muted)">#'+p.receipt+'</span>';
              if(p._legacy) meta += ' <span style="background:rgba(217,119,6,.15);color:#d97706;border-radius:3px;padding:1px 5px;font-size:.68rem;font-weight:700">inherited</span>';
              return `<div style="display:flex;align-items:center;gap:10px;padding:8px 14px;border-top:1px solid var(--border);${i%2===0?'background:var(--s2)':'background:var(--s1)'}">
                <span>💳</span>
                <span style="font-family:var(--mono);font-weight:700;color:var(--green);min-width:72px">${fmtNum(p.amount)} OMR</span>
                <span style="font-size:.78rem;color:var(--muted)">📅 ${dFmt}${meta ? ' '+meta : ''}</span>
              </div>`;
            }).join('')}
          </div>
        </div>`;
    });
    html += `<div class="ph-total-row"><span class="ph-total-label">💰 Total Amount</span><span class="ph-total-amount">${fmtNum(grandTotal)} OMR</span></div>`;
  }

  document.getElementById('pay-history-content').innerHTML = html;
  openModal('modal-pay-history');
}
