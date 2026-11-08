// ═══════════════════════════════════════════════════════════════════
// module-daily-rentals-balance.js
// BALANCE — calcul du BAL (solde), modales de détail BAL
// Extrait automatiquement de module-daily-rentals.js (découpage mécanique,
// aucune ligne modifiée — tout reste en portée globale, comme avant).
// ═══════════════════════════════════════════════════════════════════

// ── calcKmExtra (orig. line 5210) ──
function calcKmExtra(kmTotal, durationType, is4x4, kmRate, joursCal, basePrice){
  /*
   * SIMPLIFIED LOGIC (no day/week/month conversion, no smart comparison)
   * DAILY:   200 km/day (4x4) or 250 km/day (sedan) included
   * WEEKLY:  1400 km/week included
   * MONTHLY: 4500 km/month (4x4) or 5000 km/month (sedan) included
   *
   * Any km beyond the included total is simply billed as:
   *   extraCharge = kmExtra × kmRate
   * kmRate is always 0.05 OMR/km (sedan) or 0.100 OMR/km (4x4), passed in by the caller.
   */

  const kmPerDay   = is4x4 ? 200 : 250;
  const kmPerMonth = is4x4 ? 4500 : 5000;

  let bp = Number(basePrice || 0);
  let dayPrice = bp;
  let kmInclusTotal = 0;

  if(durationType === 'daily'){
    kmInclusTotal = kmPerDay * (joursCal || 1);
  } else if(durationType === 'weekly'){
    dayPrice = Math.round((bp / 7) * 100) / 100;
    let totalWeeks = Math.ceil((joursCal || 1) / 7);
    kmInclusTotal = totalWeeks * 1400;
  } else {
    dayPrice = Math.round((bp / 30) * 100) / 100;
    // FIX: un contrat Monthly facture toujours au minimum 1 mois complet de KM inclus
    // même si la durée réelle est inférieure à 30 jours (ex: rendu le même jour)
    let fullMonths = Math.max(1, Math.floor((joursCal || 1) / 30));
    let remDaysKm  = (joursCal || 1) % 30;
    kmInclusTotal  = fullMonths * kmPerMonth + Math.round(remDaysKm * (kmPerMonth / 30));
  }

  let kmExtra = Math.max(0, kmTotal - kmInclusTotal);
  let extraCharge = Math.round(kmExtra * kmRate * 100) / 100;

  return {
    kmInclusTotal,
    kmExtra,
    extraPeriods: 0,
    extraDays: 0,
    resteKm: 0,
    extraCharge,
    calPeriods: 0,
    calRemDays: durationType === 'daily' ? joursCal : 0,
    kmMonthsCharge: 0,
    kmDaysCharge: 0,
    dayPrice,
    restBilledMethod: 'km'
  };
}

// ── Helper unifié : calcule la BAL d'un rental (ouvert ou fermé) ────────────
// ── calcBAL (orig. line 5422) ──
function calcBAL(r){
  if(!r.dateIn || r.dateIn === ''){
    let b = calcOpenContractBAL(r);
    return b !== null ? b : Number((r.price||0)) - Number(r.paid||0);
  }
  let b = calcRentalBAL(r);
  if(b !== null) return b;
  return (r.bal !== undefined && r.bal !== null) ? Number(r.bal) : Number((r.price||0)) - Number(r.paid||0);
}

// ── Règle de classification : fermé ET soldé → Daily ────────────────────────
// ── isClosedAndSettled (orig. line 5432) ──
function isClosedAndSettled(r){
  if(!r.dateIn || r.dateIn === '') return false; // voiture encore dehors → Open
  let bal = r._balManual ? Number(r.bal||0) : calcBAL(r);
  return bal <= 0; // soldé ou trop-payé (vert) → Daily
}


// ── calcRentalBAL (orig. line 5438) ──
function calcRentalBAL(r){
  if(!r.dateOut || !r.dateIn || r.dateIn === '') return null;
  
  let out = new Date(r.dateOut);
  let inD = new Date(r.dateIn);
  
  // ✅ SYNCHRONISÉ AVEC LE MODAL: Calcul identique pour les contrats fermés
  
  // 1. Calcul des minutes et heures supplémentaires
  let outMin = out.getHours() * 60 + out.getMinutes();
  let inMin  = inD.getHours()  * 60 + inD.getMinutes();
  let diffMin = inMin - outMin;
  let extraH  = diffMin > 0 ? Math.floor(diffMin / 60) : 0;
  
  // 2. Détection du type de contrat
  let { is4x4, durationType } = detectContractType(r);
  let _defRate = is4x4 ? 0.100 : 0.050;
  let kmRate = Number(r.kmRate) || _defRate;
  
  // 3. Préparation des variables de base
  let basePrice = Number(r.basePrice || 0);
  let price = Number(r.price || 0);
  let kmOut = Number(r.kmOut || 0);
  let kmIn  = Number(r.kmIn  || 0);
  let kmTotal = Math.max(0, kmIn - kmOut);
  
  // 4. Calcul des jours calendaires
  let calOutDay = new Date(out.getFullYear(), out.getMonth(), out.getDate());
  let calInDay  = new Date(inD.getFullYear(), inD.getMonth(), inD.getDate());
  let joursCalRaw = Math.round((calInDay - calOutDay) / 86400000);
  
  // 5. Calcul du jour supplémentaire si retard ≥7h (logique IDENTIQUE au modal)
  // FIX: weekly/monthly rendu AVANT la fin de la période minimale (ex: 29j 5h sur un mois de 30j)
  // → le minimum de période couvre tout, aucune heure sup ni jour sup.
  let _withinMin = (durationType === 'monthly' && joursCalRaw < 30) || (durationType === 'weekly' && joursCalRaw < 7);
  let lateExtraDay = (!_withinMin && joursCalRaw >= 1 && extraH >= 7) ? 1 : 0;
  // New hourly rule (retard < 7h) : 1ère heure gratuite, puis 1 OMR par heure entamée
  // (tolérance 30min par heure : ≤30min pas facturé, >30min = heure complète facturée)
  let heuresOMR = 0;
  if(!_withinMin && joursCalRaw >= 1 && !lateExtraDay && diffMin > 60){
    let extraMinAfterFirstHour = diffMin - 60;
    let fullExtraHours = Math.floor(extraMinAfterFirstHour / 60);
    let remainderMin = extraMinAfterFirstHour % 60;
    heuresOMR = fullExtraHours + (remainderMin > 30 ? 1 : 0);
  }
  let joursCal = joursCalRaw === 0 ? 1 : joursCalRaw;
  let joursFactures = joursCal + lateExtraDay;
  
  // 6. Calcul du prix journalier
  let periodDays = durationType === 'weekly' ? 7 : 30;
  // Fallback : si basePrice n'est pas enregistré, reconstruire le prix complet
  // de la période à partir du prix/jour (évite que le minimum semaine/mois soit cassé)
  let bp = (durationType !== 'daily') ? (basePrice > 0 ? basePrice : Math.round(price * periodDays * 100) / 100) : price;
  let dayPrice = (durationType !== 'daily') ? Math.round((bp/periodDays)*100)/100 : price;
  let calPeriods = (durationType !== 'daily') ? Math.floor(joursCal/periodDays) : 0;
  let calRemDays = (durationType !== 'daily') ? joursCal % periodDays : joursCal;
  
  // 7. Calcul du prix (IDENTIQUE au modal)
  let prixJours;
  if(durationType === 'daily'){
    prixJours = price * joursFactures;
  } else {
    let rawPrix = Math.round((calPeriods * bp + calRemDays * dayPrice + lateExtraDay * dayPrice)*100)/100;
    // FIX: un contrat Monthly ou Weekly facture toujours au minimum 1 période complète
    // Monthly : rendu en 1 jour → 100 OMR minimum (pas 3.33 OMR)
    // Weekly  : rendu en 3 jours → prix semaine minimum (pas 3×prix/jour)
    prixJours = (durationType === 'monthly' || durationType === 'weekly') ? Math.max(bp, rawPrix) : rawPrix;
  }
  
  // 8. Calcul du KM supplémentaire
  let kmResult = { kmInclusTotal:0, kmExtra:0, extraPeriods:0, extraDays:0,
                   resteKm:0, extraCharge:0, kmMonthsCharge:0, kmDaysCharge:0, dayPrice:dayPrice };
  if(kmIn && kmOut){
    kmResult = calcKmExtra(kmTotal, durationType, is4x4, kmRate, joursFactures, bp);
  }
  
  // 9. Calcul total KM (IDENTIQUE au modal)
  let kmCharge = kmResult.kmMonthsCharge + kmResult.kmDaysCharge + kmResult.extraCharge;
  
  // 10. Calcul du carburant
  let fuelOutOMR = fuelToOMR(r.fuelOut);
  let fuelInOMR  = fuelToOMR(r.fuelIn);
  let petrol = Math.max(0, fuelOutOMR - fuelInOMR);
  
  // 11. Calcul des frais de nettoyage
  let cleanFee = (r.cleanBefore !== 'dirty' && r.cleanAfter === 'dirty') ? 1 : 0;
  
  // 12. Total dû
  let totalDu = prixJours + heuresOMR + kmCharge + petrol + cleanFee;
  
  // 13. Calcul du payé (utilise la vraie somme depuis DB.payments, SYNCHRONISÉ)
  let _dbPays = paymentsForContract(r.contract, r.branch, r.vehicleId);
  let _dbPaidSum = _dbPays.reduce((s,p) => s + Number(p.paid || p.price || 0), 0);
  let paid = _dbPaidSum > 0 ? _dbPaidSum : Number(r.paid || 0);

  // 13b. FIX (2026-09) : crédit reporté (carry-forward) — vient d'un contrat SOURCE déjà
  // encaissé/compté dans Revenue Stats à une date antérieure. On ne le traite donc PAS comme
  // un vrai paiement (pas de doublon dans DB.payments/Revenue), mais on le déduit ici du BAL
  // uniquement — voir aussi calcOpenContractBAL() et showBalDetail()/showBalDetailDirect().
  let cfCredit = Number(r._carryForwardCredit || 0);

  // 14. BAL FINAL (IDENTIQUE au modal : arrondissement à 1 décimale)
  return Math.round((totalDu - paid - cfCredit) * 10) / 10;
}


// Calcul BAL simplifié pour contracts OUVERTS (vehicle not yet rentrée)
// On ne calcule QUE prix × jours écoulés — pas d'extra hours, pas de pétrol, pas de clean
// ── calcOpenContractBAL (orig. line 5522) ──
function calcOpenContractBAL(r){
  if(!r.dateOut || r.dateIn) return null;
  let out = new Date(r.dateOut);
  let now = new Date();
  let calOut = new Date(out.getFullYear(), out.getMonth(), out.getDate());
  let calNow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let joursCal = Math.round((calNow - calOut) / 86400000);
  if(joursCal === 0) joursCal = 1;
  let price     = Number(r.price     || 0);
  let basePrice = Number(r.basePrice || 0);
  let { durationType } = detectContractType(r);
  let totalDu;
  if(durationType === 'daily'){
    totalDu = price * joursCal;
  } else {
    let periodDays = durationType === 'weekly' ? 7 : 30;
    // Fallback : reconstruire le prix complet de la période si basePrice absent
    let bp       = basePrice > 0 ? basePrice : Math.round(price * periodDays * 100) / 100;
    let dayPrice = Math.round((bp / periodDays) * 100) / 100;
    let periods  = Math.floor(joursCal / periodDays);
    let remDays  = joursCal % periodDays;
    let rawTotalDu = Math.round((periods * bp + remDays * dayPrice) * 100) / 100;
    // FIX: un contrat Monthly ou Weekly ouvert facture toujours au minimum 1 période (bp)
    // Monthly : rendu en 1 jour → 100 OMR minimum
    // Weekly  : rendu en 3 jours → prix semaine minimum
    totalDu = (durationType === 'monthly' || durationType === 'weekly') ? Math.max(bp, rawTotalDu) : rawTotalDu;
  }
  let paid = Number(r.paid || 0);
  // FIX (2026-09) : idem calcRentalBAL — déduire le crédit reporté du BAL (pas un vrai paiement).
  let cfCredit = Number(r._carryForwardCredit || 0);
  return Math.round((totalDu - paid - cfCredit) * 100) / 100;
}


// ── ocUnlockKmIn (orig. line 5548) ──
function ocUnlockKmIn(rentalId){ let el = document.getElementById('oc-kmin-' + rentalId); if(!el || !el.readOnly) return; securePrompt('🔒 Enter password to edit KM In:').then(function(pw){ if(pw === null) return; checkPassword(pw, 'Daily Rentals — Unlock KM In').then(function(ok){ if(ok){ el.readOnly = false; el.style.cursor = 'text'; el.style.opacity = '1'; el.style.borderColor = '#f97316'; el.style.background = 'rgba(251,191,36,.15)'; el.style.color = 'var(--text)'; el.oninput = function(){ ocPreviewKmIn(rentalId, this.value); }; el.onblur = function(){ ocSetKmIn(rentalId, this.value); }; el.onkeydown = function(e){ if(e.key==='Enter'){ e.preventDefault(); ocSetKmIn(rentalId, this.value); this.blur(); }}; el.onclick = null; let icon = el.nextElementSibling; if(icon) icon.textContent = '🔓'; el.focus(); toast(translate('rental.kmInUnlocked')); } else { toast(translate('rental.wrongPassword')); } }); }); }

// ── ocPreviewKmIn (orig. line 5566) ──
function ocPreviewKmIn(rentalId, kmVal){ let el = document.getElementById('oc-kmin-' + rentalId); if(!el) return; let km = Number(kmVal); if(km > 0){ el.style.borderColor = '#22c55e'; el.style.background = '#f0fdf4'; } else { el.style.borderColor = '#2563eb'; el.style.background = '#f8fafc'; } }

// ── ocSetKmIn (orig. line 5567) ──
function ocSetKmIn(rentalId, kmVal){ let km = Number(kmVal); if(!km || isNaN(km)) return; let r = DB.rentals.find(x => x.id === rentalId); if(!r) return; pushUndo(); r.kmIn = km; let pad = n => String(n).padStart(2,'0'); if(!r.dateIn || r.dateIn === ''){ let now = new Date(); let dateStr = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`; r.dateIn = dateStr; let cellDate = document.getElementById(`oc-datein-${rentalId}`); if(cellDate){ cellDate.textContent = `${pad(now.getDate())}/${pad(now.getMonth()+1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`; cellDate.style.color = '#22c55e'; cellDate.style.fontWeight = '700'; } toast(`✅ Date In auto: ${pad(now.getDate())}/${pad(now.getMonth()+1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`); } let newBal = calcRentalBAL(r); if(newBal !== null){ r.bal = newBal; let row = document.getElementById(`oc-row-${rentalId}`); if(row){ let cells = row.querySelectorAll('td'); let balCell = cells[8]; if(balCell){ let balColor = newBal > 0 ? '#ef4444' : (newBal < 0 ? '#22c55e' : '#22c55e'); balCell.textContent = fmtNum(newBal); balCell.style.color = balColor; balCell.style.fontWeight = '700'; } } toast(`💰 BAL updated : ${fmtNum(newBal)} OMR`); } let kmEl = document.getElementById(`oc-kmin-${rentalId}`); if(kmEl){ kmEl.readOnly = true; kmEl.style.borderColor = '#22c55e'; kmEl.style.background = '#f0fdf4'; kmEl.style.cursor = 'not-allowed'; kmEl.title = '🔒 Click to edit with password'; kmEl.onclick = function(){ ocUnlockKmIn(rentalId); }; kmEl.oninput = null; kmEl.onblur = null; } let v2 = r.vehicleId ? (DB.vehicles.find(x=>x.id===r.vehicleId)||{}) : {}; let rPlate2 = v2.plate || r._plate || '—';
  /* FIX: mark vehicle as available after return */
  if(v2 && v2.id){ v2.status = 'available'; }
  else { let vByPlate = DB.vehicles.find(x => (x.plate||'').toLowerCase() === (r._plate||'').toLowerCase()); if(vByPlate) vByPlate.status = 'available'; }
  logAction('return', `🔄 Daily Rentals — Back Vehicle Cont. ${r.contract} (${rPlate2})`, `Plate: ${rPlate2} | KM Out: ${r.kmOut||'—'} | KM In: ${km} | Diff: ${km&&r.kmOut?km-r.kmOut:'—'} km | BAL: ${r.bal !== null && r.bal !== undefined ? r.bal : '—'} OMR | Date In: ${r.dateIn||'?'}`, `Cont. ${r.contract} · ${rPlate2}`); updateLogBadge();
  // saveOne: rental retourné + véhicule
  (function(){
    if(r && r.id) saveRental(r.id);
    let _vret = DB.vehicles.find(x => (x.plate||'').toLowerCase() === (r._plate||'').toLowerCase());
    if(_vret) saveVehicle(_vret.id);
  })();
  renderFleet(); }


// ── translateBalModal() : Traduit tous les labels du modal BAL après rendu ──
function translateBalModal(){
  let content = document.getElementById('bal-detail-content');
  if(!content) return;
  
  let html = content.innerHTML;
  
  // Remplacements simples (textes directs)
  html = html.replace(/>Contract N°</g, `>${translate('bal.contractNo')}<`);
  html = html.replace(/>Vehicle</g, `>${translate('bal.vehicle')}<`);
  html = html.replace(/>Date Out</g, `>${translate('bal.dateOut')}<`);
  html = html.replace(/>Date In</g, `>${translate('bal.dateIn')}<`);
  html = html.replace(/>Calendar days</g, `>${translate('bal.calendarDays')}<`);
  html = html.replace(/>Extra hours</g, `>${translate('bal.extraHours')}<`);
  html = html.replace(/>KM Out</g, `>${translate('bal.kmOut')}<`);
  html = html.replace(/>KM In</g, `>${translate('bal.kmIn')}<`);
  html = html.replace(/>Total driven</g, `>${translate('bal.totalDriven')}<`);
  html = html.replace(/>Included</g, `>${translate('bal.included')}<`);
  html = html.replace(/>KM extra</g, `>${translate('bal.kmExtra')}<`);
  html = html.replace(/>KM Rate</g, `>${translate('bal.kmRate')}<`);
  html = html.replace(/>Fuel Out</g, `>${translate('bal.fuelOut')}<`);
  html = html.replace(/>Fuel In</g, `>${translate('bal.fuelIn')}<`);
  html = html.replace(/>Petrol due</g, `>${translate('bal.petrolDue')}<`);
  html = html.replace(/>Before rental</g, `>${translate('bal.beforeRental')}<`);
  html = html.replace(/>After return</g, `>${translate('bal.afterReturn')}<`);
  html = html.replace(/>Cleaning fee</g, `>${translate('bal.cleaningFee')}<`);
  html = html.replace(/>Summary</g, `>${translate('bal.summary')}<`);
  html = html.replace(/>Calendar charge</g, `>${translate('bal.calendarCharge')}<`);
  html = html.replace(/>Total due</g, `>${translate('bal.totalDue')}<`);
  html = html.replace(/>Paid</g, `>${translate('bal.paid')}<`);
  html = html.replace(/>BALANCE</g, `>${translate('bal.balance')}<`);
  html = html.replace(/>CLEAN</g, `>${translate('bal.clean')}<`);
  html = html.replace(/within limit/g, translate('bal.withinLimit'));
  html = html.replace(/1st hour free, then 1 OMR\/h \(30min tolerance\)/g, translate('bal.hourlyNote'));
  
  content.innerHTML = html;
}


function _resetBalModal(){
  let mi=document.getElementById('modal-bal-detail-inner');
  let mh=document.getElementById('modal-bal-detail-header');
  let mt=document.getElementById('modal-bal-detail-title');
  if(mi) mi.style.maxWidth='480px';
  if(mh) mh.style.background='linear-gradient(135deg,#1e3a5f,#1e40af)';
  if(mt) mt.textContent=translate('rental.balDetail');
}

// ── showBalDetail (orig. line 5581) ──
function showBalDetail(rentalId){ _resetBalModal(); let r = DB.rentals.find(x => x.id === rentalId); if(!r || !r.dateOut){ toast(translate('rental.missingDateOut')); return; }
  // Si preview, utiliser le vrai numéro de contrat pour l'affichage
  if(r._displayContract) r.contract = r._displayContract;
  // If balance was set manually, display it directly without recalculating
  if(r._balManual){
    let manualBal = (r.bal !== undefined && r.bal !== null) ? Number(r.bal) : 0;
    let paid2 = Number(r.paid || 0);
    let v2b = r.vehicleId ? (DB.vehicles.find(x => x.id === r.vehicleId) || {}) : {};
    let pad2 = n => String(n).padStart(2,'0');
    let out2 = new Date(r.dateOut);
    // Compute real auto balance ignoring _balManual flag
    let _rCopy = Object.assign({}, r, { _balManual: false });
    let _realBalRaw = calcRentalBAL(_rCopy);
    let _realBal = _realBalRaw !== null ? Math.round(_realBalRaw * 100) / 100 : null;
    let _realBalColor = _realBal === null ? '#94a3b8' : (_realBal > 0 ? '#f87171' : (_realBal < 0 ? '#22c55e' : '#4ade80'));
    let _realBalStr = _realBal !== null ? _realBal + ' OMR' : 'N/A';
    // FIX (2026-09) : le crédit reporté (carry-forward) n'apparaissait nulle part dans
    // cette vue "Manual" — on l'affiche explicitement pour que l'origine du 13 OMR
    // (ex: from #5209B) reste tracée même après un BAL forcé manuellement.
    let cfCredit2 = Number(r._carryForwardCredit || 0);
    let cfSourceR2 = r._carryForwardSourceId ? DB.rentals.find(x => x.id === Number(r._carryForwardSourceId)) : null;
    let cfReceiptDisplay2 = cfSourceR2 ? (getRealReceiptFor(cfSourceR2) || (cfSourceR2.receipt ? String(cfSourceR2.receipt).replace(/^R/,'') : '')) : '';
    let cfRow2 = (cfSourceR2 && cfCredit2 > 0) ? `
  <div style="display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid rgba(96,165,250,.15)">
    <span style="color:#16a34a;font-size:.8rem;max-width:70%">💰 Carried forward credit (from #${cfSourceR2.contract || '?'}${cfReceiptDisplay2 ? ' · Receipt #' + cfReceiptDisplay2 : ''})</span>
    <span style="font-family:'IBM Plex Mono',monospace;font-weight:700;color:#16a34a;white-space:nowrap;flex-shrink:0">− ${fmtNum(cfCredit2)} OMR</span>
  </div>` : '';
    let html2 = `<div style="font-family:'IBM Plex Sans',sans-serif;font-size:.85rem;padding:2px 0">
<div style="background:rgba(251,191,36,.12);border:1px solid rgba(251,191,36,.4);border-radius:8px;padding:9px 14px;margin-bottom:14px;color:#d97706;font-size:.78rem;font-weight:700">⚠️ BALANCE DEFINED MANUALLY — This value was set directly and overrides automatic calculation.</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
  <div style="background:linear-gradient(135deg,#1e3a5f,#1e40af);border-radius:10px;padding:14px 16px">
    <div style="font-size:.62rem;text-transform:uppercase;letter-spacing:1.4px;color:#93c5fd;margin-bottom:6px;font-weight:700">Contract N°</div>
    <div style="font-weight:900;font-size:1.8rem;color:#fff;letter-spacing:1px;font-family:'IBM Plex Mono',monospace;line-height:1">${r.contract || '—'}</div>
  </div>
  <div style="background:linear-gradient(135deg,#14532d,#166534);border-radius:10px;padding:14px 16px">
    <div style="font-size:.62rem;text-transform:uppercase;letter-spacing:1.4px;color:#86efac;margin-bottom:6px;font-weight:700">Vehicle</div>
    <div style="font-weight:900;font-size:1.4rem;color:#fff;font-family:'IBM Plex Mono',monospace;line-height:1">${(v2b.plate || r._plate || '—').toUpperCase()}</div>
    <div style="font-size:.8rem;color:#bbf7d0;font-weight:600;margin-top:4px">${v2b.name || r._name || '—'}</div>
  </div>
</div>
<div style="background:linear-gradient(135deg,#0f172a,#1e293b);border-radius:12px;padding:16px 18px;margin-top:8px;border:1px solid #334155">
  <div style="font-size:.62rem;text-transform:uppercase;letter-spacing:1.4px;color:#64748b;margin-bottom:12px;font-weight:700">Manual Balance Summary</div>
  <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #1e293b">
    <span style="color:#94a3b8;font-size:.8rem">Paid</span>
    <span style="font-family:'IBM Plex Mono',monospace;font-weight:700;color:#f87171">− ${paid2} OMR</span>
  </div>
  ${cfRow2}
  <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 0 2px">
    <span style="font-weight:800;font-size:1rem;color:#e2e8f0;letter-spacing:.5px;text-transform:uppercase">BALANCE (Manual)</span>
    <span style="font-family:'IBM Plex Mono',monospace;font-weight:900;font-size:1.6rem;color:${manualBal>0?'#f87171':(manualBal<0?'#22c55e':'#4ade80')}">${manualBal} OMR</span>
  </div>
</div>
<div style="background:rgba(96,165,250,.07);border:1px solid rgba(96,165,250,.3);border-radius:12px;padding:16px 18px;margin-top:10px">
  <div style="font-size:.62rem;text-transform:uppercase;letter-spacing:1.4px;color:#60a5fa;margin-bottom:12px;font-weight:700">🔵 Real Balance (Auto-calculated)</div>
  <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(96,165,250,.15)">
    <span style="color:#94a3b8;font-size:.8rem">Paid</span>
    <span style="font-family:'IBM Plex Mono',monospace;font-weight:700;color:#f87171">− ${paid2} OMR</span>
  </div>
  ${cfRow2}
  <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 0 2px">
    <span style="font-weight:800;font-size:1rem;color:#60a5fa;letter-spacing:.5px;text-transform:uppercase">REAL BALANCE</span>
    <span style="font-family:'IBM Plex Mono',monospace;font-weight:900;font-size:1.6rem;color:${_realBalColor}">${_realBalStr}</span>
  </div>
</div>
</div>`;
    document.getElementById('bal-detail-content').innerHTML = html2; openModal('modal-bal-detail'); translateBalModal(); return;
  }
  let isOpenContract = !r.dateIn || r.dateIn === ''; let out = new Date(r.dateOut); let pad = n => String(n).padStart(2,'0'); let fmtDT = d => `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; let price = Number(r.price || 0);
  // Always recalculate paid from DB.payments (quickAdd may not have synced r.paid)
  let _dbPays = paymentsForContract(r.contract, r.branch, r.vehicleId);
  let _dbPaidSum = _dbPays.reduce((s,p) => s + Number(p.paid || p.price || 0), 0);
  let paid = _dbPaidSum > 0 ? _dbPaidSum : Number(r.paid || 0); let cfCredit = Number(r._carryForwardCredit || 0); let cfSourceR = r._carryForwardSourceId ? DB.rentals.find(x => x.id === Number(r._carryForwardSourceId)) : null; let cfReceiptDisplay = cfSourceR ? (getRealReceiptFor(cfSourceR) || (cfSourceR.receipt ? String(cfSourceR.receipt).replace(/^R/,'') : '')) : ''; let v2 = r.vehicleId ? (DB.vehicles.find(x => x.id === r.vehicleId) || {}) : {}; let vPlateD = (v2.plate || r._plate || '—').toUpperCase(); let vNameD = v2.name || r._name || '—'; const sec = (icon, title) => `<div style="display:flex;align-items:center;gap:7px;margin:18px 0 8px;padding-bottom:5px;border-bottom:2px solid var(--border2)"><span style="font-size:1rem">${icon}</span><span style="font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:1.2px;color:var(--muted);font-family:'IBM Plex Sans',sans-serif">${title}</span></div>`; const row = (label, val, color='var(--text)', sub='') => `<div style="display:flex;justify-content:space-between;align-items:baseline;padding:7px 2px;border-bottom:1px solid var(--border)"><span style="color:var(--muted);font-size:.8rem;font-family:'IBM Plex Sans',sans-serif;max-width:65%">${label}${sub?`<br><span style="font-size:.68rem;color:var(--dim);font-style:italic">${sub}</span>`:''}  </span><span style="font-weight:700;color:${color};font-family:'IBM Plex Mono',monospace;white-space:nowrap">${val}</span></div>`; const rnd = v => Number((Math.round(Number(v) * 10) / 10).toFixed(1));

  if(isOpenContract){
    // OPEN CONTRACT : calcul simplifié — prix × jours seulement
    let now = new Date();
    let calOut = new Date(out.getFullYear(), out.getMonth(), out.getDate());
    let calNow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let joursCal = Math.round((calNow - calOut) / 86400000);
    if(joursCal === 0) joursCal = 1;
    let { durationType: dtO } = detectContractType(r);
    let bpO = Number(r.basePrice || 0);
    let pdO = dtO === 'weekly' ? 7 : 30;
    // Fallback : reconstruire le prix complet de la période si basePrice absent
    let effBpO = (dtO !== 'daily') ? (bpO > 0 ? bpO : Math.round(price * pdO * 100) / 100) : price;
    let dpO = dtO !== 'daily' ? Math.round((effBpO/pdO)*100)/100 : price;
    let periodsO = dtO !== 'daily' ? Math.floor(joursCal/pdO) : 0;
    let remO     = dtO !== 'daily' ? joursCal % pdO : joursCal;
    let rawTotalDuO = dtO === 'daily'
      ? price * joursCal
      : Math.round((periodsO * effBpO + remO * dpO)*100)/100;
    // Minimum 1 période complète (weekly/monthly) si la période n'est pas terminée
    let totalDu = (dtO === 'monthly' || dtO === 'weekly') ? Math.max(effBpO, rawTotalDuO) : rawTotalDuO;
    let bal = Math.round((totalDu - paid - cfCredit) * 100) / 100;
    let html = `<div style="font-family:'IBM Plex Sans',sans-serif;font-size:.85rem;padding:2px 0"><div style="background:rgba(251,191,36,.12);border:1px solid rgba(251,191,36,.4);border-radius:8px;padding:9px 14px;margin-bottom:14px;color:#d97706;font-size:.78rem;font-weight:700;font-family:'IBM Plex Mono',monospace">⚠️ OPEN CONTRACT — Provisional estimate based on ${joursCal} day(s). Petrol, extra hours and cleaning will be calculated on return.</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px"><div style="background:linear-gradient(135deg,#1e3a5f,#1e40af);border-radius:10px;padding:14px 16px"><div style="font-size:.62rem;text-transform:uppercase;letter-spacing:1.4px;color:#93c5fd;margin-bottom:6px;font-weight:700">Contract N°</div><div style="font-weight:900;font-size:1.8rem;color:#fff;letter-spacing:1px;font-family:'IBM Plex Mono',monospace;line-height:1">${r.contract || '—'}</div></div><div style="background:linear-gradient(135deg,#14532d,#166534);border-radius:10px;padding:14px 16px"><div style="font-size:.62rem;text-transform:uppercase;letter-spacing:1.4px;color:#86efac;margin-bottom:6px;font-weight:700">Vehicle</div><div style="font-weight:900;font-size:1.4rem;color:#fff;letter-spacing:1px;font-family:'IBM Plex Mono',monospace;line-height:1">${vPlateD}</div><div style="font-size:.8rem;color:#bbf7d0;font-weight:600;margin-top:4px;font-family:'IBM Plex Sans',sans-serif">${vNameD}</div></div></div>${sec('⏱', 'Provisional duration')}${row('Date Out', fmtDT(out), '#60a5fa')}${row('Date In', '— (vehicle not yet returned)', '#fbbf24')}${row('Days elapsed', `${joursCal} day${joursCal>1?'s':''}`, '#a78bfa')}${sec('💵', 'Provisional estimate')}${row(`${price} OMR/day × ${joursCal} day${joursCal>1?'s':''}`, `${rnd(totalDu)} OMR`, '#22c55e')}<div style="background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.3);border-radius:8px;padding:10px 14px;margin-top:12px;font-size:.76rem;color:#d97706"><strong>⚠️ Not included (calculated on return):</strong><br>• Extra hours<br>• Extra KM<br>• Petrol<br>• Cleaning</div><div style="background:linear-gradient(135deg,#0f172a,#1e293b);border-radius:12px;padding:16px 18px;margin-top:16px;border:1px solid #334155"><div style="font-size:.62rem;text-transform:uppercase;letter-spacing:1.4px;color:#64748b;margin-bottom:12px;font-weight:700">Provisional summary</div><div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #1e293b"><span style="color:#94a3b8;font-size:.8rem">Rental (${joursCal}d)</span><span style="font-family:'IBM Plex Mono',monospace;font-weight:700;color:#e2e8f0">${rnd(totalDu)} OMR</span></div><div style="display:flex;justify-content:space-between;padding:10px 0 6px;border-bottom:1px solid #334155"><span style="color:#cbd5e1;font-size:.88rem;font-weight:700">Provisional total</span><span style="font-family:'IBM Plex Mono',monospace;font-weight:800;font-size:1.1rem;color:#38bdf8">${rnd(totalDu)} OMR</span></div><div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #1e293b"><span style="color:#94a3b8;font-size:.8rem">Paid</span><span style="font-family:'IBM Plex Mono',monospace;font-weight:700;color:#f87171">− ${rnd(paid)} OMR</span></div>${cfCredit > 0 ? `<div style="display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid #1e293b"><span style="color:#16a34a;font-size:.8rem;max-width:65%">💰 Carried forward credit (from #${cfSourceR ? cfSourceR.contract : '?'}${cfReceiptDisplay ? ' · Receipt #' + cfReceiptDisplay : ''})</span><span style="font-family:'IBM Plex Mono',monospace;font-weight:700;color:#16a34a;white-space:nowrap;flex-shrink:0">− ${rnd(cfCredit)} OMR</span></div>` : ''}<div style="display:flex;justify-content:space-between;align-items:center;padding:14px 0 2px"><span style="font-weight:800;font-size:1rem;color:#e2e8f0;letter-spacing:.5px;text-transform:uppercase">Provisional balance</span><span style="font-family:'IBM Plex Mono',monospace;font-weight:900;font-size:1.6rem;color:${bal>0?'#f87171':(bal<0?'#22c55e':'#4ade80')}">${bal} OMR</span></div></div></div>`;
    document.getElementById('bal-detail-content').innerHTML = html; openModal('modal-bal-detail'); translateBalModal(); return;
  }

  // CONTRACT FERME : calcul complet
  let inD = new Date(r.dateIn);
  let outMin = out.getHours() * 60 + out.getMinutes();
  let inMin  = inD.getHours()  * 60 + inD.getMinutes();
  let diffMin = inMin - outMin;
  let extraH   = diffMin > 0 ? Math.floor(diffMin / 60) : 0;
  let { is4x4, durationType } = detectContractType(r);
  let _defRate2 = is4x4 ? 0.100 : 0.050;
  let kmRate = Number(r.kmRate) || _defRate2;
  // IMPORTANT: Utiliser TOUJOURS r.kmRate enregistré (ne pas recalculer par le vehicle)
  let basePrice2 = Number(r.basePrice || 0);
  let kmOut = Number(r.kmOut || 0);
  let kmIn  = Number(r.kmIn  || 0);
  let kmTotal = Math.max(0, kmIn - kmOut);
  let vehicleLabel  = is4x4 ? '4×4' : 'Sedan/SUV';
  let durationLabel = durationType === 'daily' ? 'Daily' : durationType === 'weekly' ? 'Weekly' : 'Monthly';
  let calOutDay2 = new Date(out.getFullYear(), out.getMonth(), out.getDate());
  let calInDay2  = new Date(inD.getFullYear(), inD.getMonth(), inD.getDate());
  let joursCalRaw2 = Math.round((calInDay2 - calOutDay2) / 86400000);
  // lateExtraDay only applies if rental spans at least 1 full calendar day
  let _withinMin = (durationType === 'monthly' && joursCalRaw2 < 30) || (durationType === 'weekly' && joursCalRaw2 < 7);
  let lateExtraDayD = (!_withinMin && joursCalRaw2 >= 1 && extraH >= 7) ? 1 : 0;
  // When late ≥7h → full extra day billed, no hourly surcharge; same-day = no extra
  // New hourly rule (retard < 7h) : 1ère heure gratuite, puis 1 OMR par heure entamée
  // (tolérance 30min par heure : ≤30min pas facturé, >30min = heure complète facturée)
  let heuresOMR = 0;
  if(!_withinMin && joursCalRaw2 >= 1 && !lateExtraDayD && diffMin > 60){
    let extraMinAfterFirstHour = diffMin - 60;
    let fullExtraHours = Math.floor(extraMinAfterFirstHour / 60);
    let remainderMin = extraMinAfterFirstHour % 60;
    heuresOMR = fullExtraHours + (remainderMin > 30 ? 1 : 0);
  }
  let joursCal2 = joursCalRaw2 === 0 ? 1 : joursCalRaw2;
  let joursFactures = joursCal2 + lateExtraDayD;

  let periodDays2 = durationType === 'weekly' ? 7 : 30;
  // Fallback : si basePrice n'est pas enregistré, reconstruire le prix complet
  // de la période à partir du prix/jour (évite que le minimum semaine/mois soit cassé)
  let bp2 = (durationType !== 'daily') ? (basePrice2 > 0 ? basePrice2 : Math.round(price * periodDays2 * 100) / 100) : price;
  let dayPrice2 = (durationType !== 'daily') ? Math.round((bp2/periodDays2)*100)/100 : price;
  let calPeriods2  = (durationType !== 'daily') ? Math.floor(joursCal2/periodDays2) : 0;
  let calRemDays2  = (durationType !== 'daily') ? joursCal2 % periodDays2 : joursCal2;

  let prixJours;
  if(durationType === 'daily'){
    prixJours = price * joursFactures;
  } else {
    // FIX: contrat Weekly/Monthly = minimum 1 période complète (identique à calcRentalBAL)
    let rawPrix2 = Math.round((calPeriods2 * bp2 + calRemDays2 * dayPrice2 + lateExtraDayD * dayPrice2)*100)/100;
    prixJours = (durationType === 'monthly' || durationType === 'weekly') ? Math.max(bp2, rawPrix2) : rawPrix2;
  }

  let kmResult = { kmInclusTotal:0, kmExtra:0, extraPeriods:0, extraDays:0,
                   resteKm:0, extraCharge:0, kmMonthsCharge:0, kmDaysCharge:0, dayPrice:dayPrice2 };
  if(kmIn && kmOut){
    kmResult = calcKmExtra(
      kmTotal,
      durationType,
      is4x4,
      kmRate,
      joursFactures,
      bp2
    );
  }

  let kmCharge = kmResult.kmMonthsCharge + kmResult.kmDaysCharge + kmResult.extraCharge;

  let fuelOutOMR = fuelToOMR(r.fuelOut);
  let fuelInOMR  = fuelToOMR(r.fuelIn);
  let petrol   = Math.max(0, fuelOutOMR - fuelInOMR);
  let cleanFee = (r.cleanBefore !== 'dirty' && r.cleanAfter === 'dirty') ? 1 : 0;
  let totalDu  = prixJours + heuresOMR + kmCharge + petrol + cleanFee;
  let bal      = Math.round((totalDu - paid - cfCredit) * 10) / 10;
  let prixJoursR   = rnd(prixJours);
  let heuresOMRR   = rnd(heuresOMR);
  let extraChargeR = rnd(kmResult.extraCharge);
  let petrolR      = rnd(petrol);
  let totalDuR     = rnd(totalDu);
  let balR         = Math.round((totalDuR - rnd(paid) - rnd(cfCredit)) * 10) / 10;
  let kmPerDay2b = durationType==='weekly' ? (is4x4?200:200) : (is4x4?150:167);
  let html = `<div style="font-family:'IBM Plex Sans',sans-serif;font-size:.85rem;padding:2px 0">
<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
  <div style="background:linear-gradient(135deg,#1e3a5f,#1e40af);border-radius:10px;padding:14px 16px">
    <div style="font-size:.62rem;text-transform:uppercase;letter-spacing:1.4px;color:#93c5fd;margin-bottom:6px;font-weight:700">Contract N°</div>
    <div style="font-weight:900;font-size:1.8rem;color:#fff;letter-spacing:1px;font-family:'IBM Plex Mono',monospace;line-height:1">${r.contract || '—'}</div>
  </div>
  <div style="background:linear-gradient(135deg,#14532d,#166534);border-radius:10px;padding:14px 16px">
    <div style="font-size:.62rem;text-transform:uppercase;letter-spacing:1.4px;color:#86efac;margin-bottom:6px;font-weight:700">Vehicle</div>
    <div style="font-weight:900;font-size:1.4rem;color:#fff;letter-spacing:1px;font-family:'IBM Plex Mono',monospace;line-height:1">${vPlateD}</div>
    <div style="font-size:.8rem;color:#bbf7d0;font-weight:600;margin-top:4px;font-family:'IBM Plex Sans',sans-serif">${vNameD}</div>
  </div>
</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:4px">
  <div style="background:var(--s2);border-radius:8px;padding:10px 12px;border-left:3px solid #60a5fa">
    <div style="font-size:.62rem;text-transform:uppercase;letter-spacing:1px;color:var(--dim);margin-bottom:4px;font-weight:700">Date Out</div>
    <div style="font-family:'IBM Plex Mono',monospace;font-size:.85rem;font-weight:700;color:var(--text)">${fmtDT(out)}</div>
  </div>
  <div style="background:var(--s2);border-radius:8px;padding:10px 12px;border-left:3px solid #4ade80">
    <div style="font-size:.62rem;text-transform:uppercase;letter-spacing:1px;color:var(--dim);margin-bottom:4px;font-weight:700">Date In</div>
    <div style="font-family:'IBM Plex Mono',monospace;font-size:.85rem;font-weight:700;color:var(--text)">${fmtDT(inD)}</div>
  </div>
</div>

${sec('⏱', 'Duration')}
<div style="background:var(--s2);border-radius:8px;padding:10px 14px">
  ${row('Calendar days', `${joursCal2} day${joursCal2!==1?'s':''}`, '#60a5fa', `${pad(out.getDate())}/${pad(out.getMonth()+1)}/${out.getFullYear()} → ${pad(inD.getDate())}/${pad(inD.getMonth()+1)}/${inD.getFullYear()}`)}
  ${(()=>{ if(durationType==='daily') return ''; let s=''; if(calPeriods2>0) s+=row(`Full ${durationLabel} periods`, `${calPeriods2} × ${periodDays2} days`, '#a78bfa'); if(calRemDays2>0) s+=row('Remaining days', `${calRemDays2} day${calRemDays2>1?'s':''}`, '#a78bfa'); return s; })()}
  ${(()=>{
    if(joursCalRaw2 === 0) return row('Extra hours', `<span style="color:#4ade80">0 OMR — same day</span>`, 'var(--text)', `${pad(inD.getHours())}:${pad(inD.getMinutes())} − ${pad(out.getHours())}:${pad(out.getMinutes())} = ${extraH}h — 1 day already billed`);
    if(_withinMin) return row('Extra hours', `<span style="color:#4ade80">0 OMR — covered by ${durationLabel.toLowerCase()} minimum</span>`, 'var(--text)', `Returned before end of the ${durationType==='weekly'?7:30}-day period`);
    if(diffMin <= 0) return row('Extra hours', translate('rental.zeroOmr'), '#a78bfa');
    if(lateExtraDayD) return row('Extra hours', `<span style="color:#4ade80">0 OMR — included in extra day</span>`, 'var(--text)', `${pad(inD.getHours())}:${pad(inD.getMinutes())} − ${pad(out.getHours())}:${pad(out.getMinutes())} = ${extraH}h ≥ 7h → billed as full day`);
    return row('Extra hours', `${heuresOMRR} OMR`, '#a78bfa', `${pad(inD.getHours())}:${pad(inD.getMinutes())} − ${pad(out.getHours())}:${pad(out.getMinutes())} = ${extraH}h · 1st hour free, then 1 OMR/h (30min tolerance)`);
  })()}
</div>

${sec('💵', 'Price (Calendar)')}
<div style="background:var(--s2);border-radius:8px;padding:10px 14px">
  ${(()=>{
    if(durationType==='daily') return row(`${price} OMR/day × ${joursFactures} days`, `${prixJoursR} OMR`, '#22c55e');
    let lines='';
    if(calPeriods2 === 0){
      // Minimum period applies (e.g. 1-3 days on a Weekly/Monthly contract) — showing "N day × X/day" here would contradict the subtotal
      lines += row(`${durationLabel} minimum`, `${prixJoursR} OMR`, '#22c55e', `${calRemDays2} day${calRemDays2>1?'s':''} used — minimum ${periodDays2}-day ${durationLabel.toLowerCase()} rate applies`);
    } else {
      lines += row(`${calPeriods2} × ${durationLabel} (${bp2} OMR)`, `${rnd(calPeriods2*bp2)} OMR`, '#22c55e');
      if(calRemDays2>0) lines += row(`${calRemDays2} day${calRemDays2>1?'s':''} × ${dayPrice2} OMR/day`, `${rnd(calRemDays2*dayPrice2)} OMR`, '#22c55e', `${bp2} ÷ ${periodDays2} = ${dayPrice2} OMR/day`);
      if(lateExtraDayD) lines += row(`Extra day (late return)`, `${rnd(dayPrice2)} OMR`, '#22c55e');
    }
    lines += row('Calendar subtotal', `${prixJoursR} OMR`, '#16a34a');
    return lines;
  })()}
  ${heuresOMRR > 0 ? row('Extra hours', `${heuresOMRR} OMR`, '#22c55e') : ''}
</div>

${sec('🛣️', `KM — ${durationLabel} · ${vehicleLabel}`)}
<div style="background:var(--s2);border-radius:8px;padding:10px 14px">
  ${row('KM Out', `${kmOut.toLocaleString()} km`)}
  ${row('KM In',  `${kmIn.toLocaleString()} km`)}
  ${row('Total driven', `${kmTotal.toLocaleString()} km`, kmTotal > kmResult.kmInclusTotal ? '#f97316' : '#4ade80')}
  ${(()=>{
    if(durationType==='daily'){
      return row(`Included (${is4x4?200:250} km/day × ${joursFactures} days)`, `${kmResult.kmInclusTotal.toLocaleString()} km`, '#60a5fa');
    }
    if(durationType === 'monthly'){
      const kmPM = is4x4 ? 4500 : 5000;
      const kmPD = Math.round(kmPM / 30);
      let label = `${calPeriods2} Monthly${calPeriods2>1?'s':''} × ${kmPM.toLocaleString()} km`;
      if(calRemDays2 > 0) label += ` + ${calRemDays2} day${calRemDays2>1?'s':''} × ${kmPD} km`;
      return row(`Included (${label})`, `${kmResult.kmInclusTotal.toLocaleString()} km`, '#60a5fa');
    }
    return row(`Included (${calPeriods2} ${durationLabel}${calPeriods2>1?'s':''} × ${kmResult.kmInclusTotal/Math.max(calPeriods2,1)} km)`, `${kmResult.kmInclusTotal.toLocaleString()} km`, '#60a5fa');
  })()}
  ${kmResult.kmExtra <= 0 ? row('KM extra', '0 km — within limit ✅', '#4ade80') : row('KM extra', `${kmResult.kmExtra.toLocaleString()} km over limit`, '#f97316')}
  ${(()=>{
    if(kmResult.kmExtra <= 0) return '';
    let lines='';
    // Facturation simple : tout le dépassement × kmRate
    if(kmResult.kmExtra > 0) lines += row(`${kmResult.kmExtra.toLocaleString()} km × ${kmRate} OMR/km`, `${extraChargeR} OMR`, '#f97316');

    let kmTotal2 = extraChargeR;
    lines += row('KM subtotal', `${kmTotal2} OMR`, '#16a34a');
    return lines;
  })()}
  <div style="display:flex;justify-content:space-between;padding:5px 2px;margin-top:2px">
    <span style="color:var(--dim);font-size:.75rem">KM Rate</span>
    <span style="font-family:'IBM Plex Mono',monospace;font-size:.78rem;color:var(--muted)">${Number(kmRate).toFixed(3)} OMR/km</span>
  </div>
</div>

${sec('⛽', 'Petrol')}
<div style="background:var(--s2);border-radius:8px;padding:10px 14px">
  ${row('Fuel Out', `${r.fuelOut} tank → ${fuelOutOMR} OMR`)}
  ${row('Fuel In',  `${r.fuelIn} tank → ${fuelInOMR} OMR`)}
  ${row('Petrol due', `${petrolR} OMR`, petrolR > 0 ? '#f97316' : '#4ade80')}
</div>

${sec('🧹', 'Car Condition')}
<div style="background:var(--s2);border-radius:8px;padding:10px 14px">
  ${row('Before rental', r.cleanBefore==='dirty' ? '❌ DIRTY' : '✅ CLEAN', r.cleanBefore==='dirty'?'#f87171':'#4ade80')}
  ${row('After return',  r.cleanAfter ==='dirty' ? '❌ DIRTY' : '✅ CLEAN', r.cleanAfter ==='dirty'?'#f87171':'#4ade80')}
  ${cleanFee > 0 ? row('Cleaning fee', '1 OMR', '#f97316', 'Returned dirty') : row('Cleaning fee', 'None', '#4ade80')}
</div>

<div style="background:linear-gradient(135deg,#0f172a,#1e293b);border-radius:12px;padding:16px 18px;margin-top:16px;border:1px solid #334155">
  <div style="font-size:.62rem;text-transform:uppercase;letter-spacing:1.4px;color:#64748b;margin-bottom:12px;font-weight:700">Summary</div>
  <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #1e293b">
    <span style="color:#94a3b8;font-size:.8rem">Calendar charge</span>
    <span style="font-family:'IBM Plex Mono',monospace;font-weight:700;color:#e2e8f0">${prixJoursR} OMR</span>
  </div>
  ${heuresOMRR > 0 ? `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #1e293b"><span style="color:#94a3b8;font-size:.8rem">Extra hours</span><span style="font-family:'IBM Plex Mono',monospace;font-weight:700;color:#e2e8f0">${heuresOMRR} OMR</span></div>` : ''}
  ${(kmResult.kmMonthsCharge > 0 || kmResult.kmDaysCharge > 0 || kmResult.extraCharge > 0) ? `
  <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #1e293b">
    <span style="color:#94a3b8;font-size:.8rem">KM extra charge</span>
    <span style="font-family:'IBM Plex Mono',monospace;font-weight:700;color:#e2e8f0">${rnd(kmResult.kmMonthsCharge + kmResult.kmDaysCharge + kmResult.extraCharge)} OMR</span>
  </div>` : ''}
  ${petrolR > 0 ? `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #1e293b"><span style="color:#94a3b8;font-size:.8rem">Fuel</span><span style="font-family:'IBM Plex Mono',monospace;font-weight:700;color:#e2e8f0">${petrolR} OMR</span></div>` : ''}
  ${cleanFee > 0 ? `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #1e293b"><span style="color:#94a3b8;font-size:.8rem">Frais nettoyage</span><span style="font-family:'IBM Plex Mono',monospace;font-weight:700;color:#e2e8f0">1 OMR</span></div>` : ''}
  <div style="display:flex;justify-content:space-between;padding:10px 0 6px;border-bottom:1px solid #334155">
    <span style="color:#cbd5e1;font-size:.88rem;font-weight:700">Total due</span>
    <span style="font-family:'IBM Plex Mono',monospace;font-weight:800;font-size:1.1rem;color:#38bdf8">${totalDuR} OMR</span>
  </div>
  <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #1e293b">
    <span style="color:#94a3b8;font-size:.8rem">Paid</span>
    <span style="font-family:'IBM Plex Mono',monospace;font-weight:700;color:#f87171">− ${rnd(paid)} OMR</span>
  </div>
  ${cfCredit > 0 ? `<div style="display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid #1e293b"><span style="color:#16a34a;font-size:.8rem;max-width:65%">💰 Carried forward credit (from #${cfSourceR ? cfSourceR.contract : '?'}${cfReceiptDisplay ? ' · Receipt #' + cfReceiptDisplay : ''})</span><span style="font-family:'IBM Plex Mono',monospace;font-weight:700;color:#16a34a;white-space:nowrap;flex-shrink:0">− ${rnd(cfCredit)} OMR</span></div>` : ''}
  <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 0 2px">
    <span style="font-weight:800;font-size:1rem;color:#e2e8f0;letter-spacing:.5px;text-transform:uppercase">BALANCE</span>
    <span style="font-family:'IBM Plex Mono',monospace;font-weight:900;font-size:1.6rem;color:${balR>0?'#f87171':(balR<0?'#22c55e':'#4ade80')}">${Number(balR).toFixed(1)} OMR</span>
  </div>
</div>
</div>`;
  document.getElementById('bal-detail-content').innerHTML = html; openModal('modal-bal-detail'); translateBalModal(); }



/* ═══════════════════════════════════════════════════════════
   💰 BAL PREVIEW FROM RENTAL MODAL
   Affiche le detail BAL avec les valeurs actuelles du formulaire
   BEFORE de saveer — permet au client de view le montant dû
   ═══════════════════════════════════════════════════════════ */
// ── previewBalFromModal (orig. line 5876) ──
function previewBalFromModal() {
  // Récupérer les valeurs du formulaire
  const rId = document.getElementById('r-edit-id').value;
  const kmInVal = document.getElementById('r-km-in').value;
  const dateInVal = document.getElementById('r-in').value;
  const dateOutVal = document.getElementById('r-out').value;
  const kmOutVal = document.getElementById('r-km-out').value;
  const priceVal = document.getElementById('r-price').value || document.getElementById('r-price-per-day')?.value || 0;
  const basePriceVal = document.getElementById('r-base-price')?.value || document.getElementById('price-base-input')?.value || 0;
  const paidTotal = document.getElementById('r-paid-total')?.textContent || '0';
  const contractTypeVal = document.getElementById('r-contract-type')?.value || '';
  const carTypeVal = document.getElementById('r-car-type')?.value || '';
  const vName = document.getElementById('r-vname').value;
  const vPlate = document.getElementById('r-plate').value;
  const contractNum = document.getElementById('r-contract').value;
  const fuelOut = document.getElementById('r-fuel-out').value;
  const fuelIn = document.getElementById('r-fuel-in').value;
  const cleanBefore = document.querySelector('input[name="clean-before"]:checked')?.value || '';
  const cleanAfter = document.querySelector('input[name="clean-after"]:checked')?.value || '';
  const kmRate = document.getElementById('r-km-rate').value || 0.050;
  const kmPerDay = document.getElementById('r-km-day').value || 250;

  // Vérifier que KM In est saisi
  if (!kmInVal || parseFloat(kmInVal) <= 0) {
    toast("⚠️ Please enter KM In first");
    document.getElementById('r-km-in').focus();
    return;
  }

  // Vérifier que Date In est remplie (auto ou manuelle)
  if (!dateInVal) {
    toast(translate('rental.missingKmIn'));
    return;
  }

  // FIX (2026-09) : retrouver le contrat réel en base pour récupérer son éventuel
  // carry-forward (_carryForwardSourceId/_carryForwardCredit). Sans ça, l'objet
  // "virtuel" reconstruit à partir des seuls champs du formulaire ne portait jamais
  // ce lien → l'aperçu affichait un BALANCE plus haut que la réalité, sans mentionner
  // nulle part le crédit reporté depuis l'ancien contrat.
  const _previewExisting = rId ? DB.rentals.find(x => x.id === Number(rId)) : null;

  // Construire un objet rental "virtuel" avec les valeurs du formulaire
  const previewRental = {
    id: rId || 'PREVIEW',
    contract: '__PREVIEW__',  // sentinel: évite collision avec DB.payments (paid viendra de r.paid)
    _displayContract: contractNum || '—',  // vrai numéro pour l'affichage
    _plate: vPlate,
    _name: vName,
    dateOut: dateOutVal,
    dateIn: dateInVal,
    kmOut: parseFloat(kmOutVal) || 0,
    kmIn: parseFloat(kmInVal) || 0,
    price: parseFloat(priceVal) || 0,
    basePrice: parseFloat(basePriceVal) || 0,
    contractType: contractTypeVal,
    carType: carTypeVal,
    paid: parseFloat(paidTotal.replace(/[^0-9.]/g, '')) || 0,
    paymentLog: window._currentPaymentLog || [],
    fuelOut: fuelOut,
    fuelIn: fuelIn,
    cleanBefore: cleanBefore,
    cleanAfter: cleanAfter,
    kmRate: parseFloat(kmRate) || 0.050,
    kmPerDay: parseFloat(kmPerDay) || 250,
    _carryForwardSourceId: _previewExisting ? _previewExisting._carryForwardSourceId : undefined,
    _carryForwardCredit: _previewExisting ? _previewExisting._carryForwardCredit : undefined,
    _balManual: false  // Force recalculation (l'aperçu montre toujours le calcul automatique réel)
  };

  // Résoudre vehicleId si possible
  if (DB && DB.vehicles) {
    const matchedVehicle = DB.vehicles.find(v => v.plate && v.plate.toUpperCase() === (vPlate || '').toUpperCase());
    if (matchedVehicle) {
      previewRental.vehicleId = matchedVehicle.id;
    }
  }

  // Utiliser la même logique d'affichage que showBalDetail
  showBalDetailPreview(previewRental);
}



// ── showBalDetailDirect (orig. line 5950) ──
function showBalDetailDirect(r){
  if(!r || !r.dateOut){ toast(translate('rental.missingDateOut')); return; }
  // Si preview, utiliser le vrai numéro de contrat pour l'affichage
  if(r._displayContract) r.contract = r._displayContract;
  // If balance was set manually, display it directly without recalculating
  if(r._balManual){
    let manualBal = (r.bal !== undefined && r.bal !== null) ? Number(r.bal) : 0;
    let paid2 = Number(r.paid || 0);
    let v2b = r.vehicleId ? (DB.vehicles.find(x => x.id === r.vehicleId) || {}) : {};
    let pad2 = n => String(n).padStart(2,'0');
    let out2 = new Date(r.dateOut);
    // Compute real auto balance ignoring _balManual flag
    let _rCopy = Object.assign({}, r, { _balManual: false });
    let _realBalRaw = calcRentalBAL(_rCopy);
    let _realBal = _realBalRaw !== null ? Math.round(_realBalRaw * 100) / 100 : null;
    let _realBalColor = _realBal === null ? '#94a3b8' : (_realBal > 0 ? '#f87171' : (_realBal < 0 ? '#22c55e' : '#4ade80'));
    let _realBalStr = _realBal !== null ? _realBal + ' OMR' : 'N/A';
    // FIX (2026-09) : même correctif que showBalDetail — afficher explicitement le
    // crédit reporté (carry-forward) dans cette vue "Manual", sinon son origine
    // (ex: from #5209B) disparaissait complètement une fois le BAL figé manuellement.
    let cfCredit2 = Number(r._carryForwardCredit || 0);
    let cfSourceR2 = r._carryForwardSourceId ? DB.rentals.find(x => x.id === Number(r._carryForwardSourceId)) : null;
    let cfReceiptDisplay2 = cfSourceR2 ? (getRealReceiptFor(cfSourceR2) || (cfSourceR2.receipt ? String(cfSourceR2.receipt).replace(/^R/,'') : '')) : '';
    let cfRow2 = (cfSourceR2 && cfCredit2 > 0) ? `
  <div style="display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid rgba(96,165,250,.15)">
    <span style="color:#16a34a;font-size:.8rem;max-width:70%">💰 Carried forward credit (from #${cfSourceR2.contract || '?'}${cfReceiptDisplay2 ? ' · Receipt #' + cfReceiptDisplay2 : ''})</span>
    <span style="font-family:'IBM Plex Mono',monospace;font-weight:700;color:#16a34a;white-space:nowrap;flex-shrink:0">− ${fmtNum(cfCredit2)} OMR</span>
  </div>` : '';
    let html2 = `<div style="font-family:'IBM Plex Sans',sans-serif;font-size:.85rem;padding:2px 0">
<div style="background:rgba(251,191,36,.12);border:1px solid rgba(251,191,36,.4);border-radius:8px;padding:9px 14px;margin-bottom:14px;color:#d97706;font-size:.78rem;font-weight:700">⚠️ BALANCE DEFINED MANUALLY — This value was set directly and overrides automatic calculation.</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
  <div style="background:linear-gradient(135deg,#1e3a5f,#1e40af);border-radius:10px;padding:14px 16px">
    <div style="font-size:.62rem;text-transform:uppercase;letter-spacing:1.4px;color:#93c5fd;margin-bottom:6px;font-weight:700">Contract N°</div>
    <div style="font-weight:900;font-size:1.8rem;color:#fff;letter-spacing:1px;font-family:'IBM Plex Mono',monospace;line-height:1">${r.contract || '—'}</div>
  </div>
  <div style="background:linear-gradient(135deg,#14532d,#166534);border-radius:10px;padding:14px 16px">
    <div style="font-size:.62rem;text-transform:uppercase;letter-spacing:1.4px;color:#86efac;margin-bottom:6px;font-weight:700">Vehicle</div>
    <div style="font-weight:900;font-size:1.4rem;color:#fff;font-family:'IBM Plex Mono',monospace;line-height:1">${(v2b.plate || r._plate || '—').toUpperCase()}</div>
    <div style="font-size:.8rem;color:#bbf7d0;font-weight:600;margin-top:4px">${v2b.name || r._name || '—'}</div>
  </div>
</div>
<div style="background:linear-gradient(135deg,#0f172a,#1e293b);border-radius:12px;padding:16px 18px;margin-top:8px;border:1px solid #334155">
  <div style="font-size:.62rem;text-transform:uppercase;letter-spacing:1.4px;color:#64748b;margin-bottom:12px;font-weight:700">Manual Balance Summary</div>
  <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #1e293b">
    <span style="color:#94a3b8;font-size:.8rem">Paid</span>
    <span style="font-family:'IBM Plex Mono',monospace;font-weight:700;color:#f87171">− ${paid2} OMR</span>
  </div>
  ${cfRow2}
  <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 0 2px">
    <span style="font-weight:800;font-size:1rem;color:#e2e8f0;letter-spacing:.5px;text-transform:uppercase">BALANCE (Manual)</span>
    <span style="font-family:'IBM Plex Mono',monospace;font-weight:900;font-size:1.6rem;color:${manualBal>0?'#f87171':(manualBal<0?'#22c55e':'#4ade80')}">${manualBal} OMR</span>
  </div>
</div>
<div style="background:rgba(96,165,250,.07);border:1px solid rgba(96,165,250,.3);border-radius:12px;padding:16px 18px;margin-top:10px">
  <div style="font-size:.62rem;text-transform:uppercase;letter-spacing:1.4px;color:#60a5fa;margin-bottom:12px;font-weight:700">🔵 Real Balance (Auto-calculated)</div>
  <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(96,165,250,.15)">
    <span style="color:#94a3b8;font-size:.8rem">Paid</span>
    <span style="font-family:'IBM Plex Mono',monospace;font-weight:700;color:#f87171">− ${paid2} OMR</span>
  </div>
  ${cfRow2}
  <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 0 2px">
    <span style="font-weight:800;font-size:1rem;color:#60a5fa;letter-spacing:.5px;text-transform:uppercase">REAL BALANCE</span>
    <span style="font-family:'IBM Plex Mono',monospace;font-weight:900;font-size:1.6rem;color:${_realBalColor}">${_realBalStr}</span>
  </div>
</div>
</div>`;
    document.getElementById('bal-detail-content').innerHTML = html2; openModal('modal-bal-detail'); translateBalModal(); return;
  }
  let isOpenContract = !r.dateIn || r.dateIn === ''; let out = new Date(r.dateOut); let pad = n => String(n).padStart(2,'0'); let fmtDT = d => `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; let price = Number(r.price || 0);
  // Always recalculate paid from DB.payments (quickAdd may not have synced r.paid)
  let _dbPays = paymentsForContract(r.contract, r.branch, r.vehicleId);
  let _dbPaidSum = _dbPays.reduce((s,p) => s + Number(p.paid || p.price || 0), 0);
  let paid = _dbPaidSum > 0 ? _dbPaidSum : Number(r.paid || 0); let cfCredit = Number(r._carryForwardCredit || 0); let cfSourceR = r._carryForwardSourceId ? DB.rentals.find(x => x.id === Number(r._carryForwardSourceId)) : null; let cfReceiptDisplay = cfSourceR ? (getRealReceiptFor(cfSourceR) || (cfSourceR.receipt ? String(cfSourceR.receipt).replace(/^R/,'') : '')) : ''; let v2 = r.vehicleId ? (DB.vehicles.find(x => x.id === r.vehicleId) || {}) : {}; let vPlateD = (v2.plate || r._plate || '—').toUpperCase(); let vNameD = v2.name || r._name || '—'; const sec = (icon, title) => `<div style="display:flex;align-items:center;gap:7px;margin:18px 0 8px;padding-bottom:5px;border-bottom:2px solid var(--border2)"><span style="font-size:1rem">${icon}</span><span style="font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:1.2px;color:var(--muted);font-family:'IBM Plex Sans',sans-serif">${title}</span></div>`; const row = (label, val, color='var(--text)', sub='') => `<div style="display:flex;justify-content:space-between;align-items:baseline;padding:7px 2px;border-bottom:1px solid var(--border)"><span style="color:var(--muted);font-size:.8rem;font-family:'IBM Plex Sans',sans-serif;max-width:65%">${label}${sub?`<br><span style="font-size:.68rem;color:var(--dim);font-style:italic">${sub}</span>`:''}  </span><span style="font-weight:700;color:${color};font-family:'IBM Plex Mono',monospace;white-space:nowrap">${val}</span></div>`; const rnd = v => Number((Math.round(Number(v) * 10) / 10).toFixed(1));

  if(isOpenContract){
    // OPEN CONTRACT : calcul simplifié — prix × jours seulement
    let now = new Date();
    let calOut = new Date(out.getFullYear(), out.getMonth(), out.getDate());
    let calNow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let joursCal = Math.round((calNow - calOut) / 86400000);
    if(joursCal === 0) joursCal = 1;
    let { durationType: dtO } = detectContractType(r);
    let bpO = Number(r.basePrice || 0);
    let pdO = dtO === 'weekly' ? 7 : 30;
    // Fallback : reconstruire le prix complet de la période si basePrice absent
    let effBpO = (dtO !== 'daily') ? (bpO > 0 ? bpO : Math.round(price * pdO * 100) / 100) : price;
    let dpO = dtO !== 'daily' ? Math.round((effBpO/pdO)*100)/100 : price;
    let periodsO = dtO !== 'daily' ? Math.floor(joursCal/pdO) : 0;
    let remO     = dtO !== 'daily' ? joursCal % pdO : joursCal;
    let rawTotalDuO = dtO === 'daily'
      ? price * joursCal
      : Math.round((periodsO * effBpO + remO * dpO)*100)/100;
    // Minimum 1 période complète (weekly/monthly) si la période n'est pas terminée
    let totalDu = (dtO === 'monthly' || dtO === 'weekly') ? Math.max(effBpO, rawTotalDuO) : rawTotalDuO;
    let bal = Math.round((totalDu - paid - cfCredit) * 100) / 100;
    let html = `<div style="font-family:'IBM Plex Sans',sans-serif;font-size:.85rem;padding:2px 0"><div style="background:rgba(251,191,36,.12);border:1px solid rgba(251,191,36,.4);border-radius:8px;padding:9px 14px;margin-bottom:14px;color:#d97706;font-size:.78rem;font-weight:700;font-family:'IBM Plex Mono',monospace">⚠️ OPEN CONTRACT — Provisional estimate based on ${joursCal} day(s). Petrol, extra hours and cleaning will be calculated on return.</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px"><div style="background:linear-gradient(135deg,#1e3a5f,#1e40af);border-radius:10px;padding:14px 16px"><div style="font-size:.62rem;text-transform:uppercase;letter-spacing:1.4px;color:#93c5fd;margin-bottom:6px;font-weight:700">Contract N°</div><div style="font-weight:900;font-size:1.8rem;color:#fff;letter-spacing:1px;font-family:'IBM Plex Mono',monospace;line-height:1">${r.contract || '—'}</div></div><div style="background:linear-gradient(135deg,#14532d,#166534);border-radius:10px;padding:14px 16px"><div style="font-size:.62rem;text-transform:uppercase;letter-spacing:1.4px;color:#86efac;margin-bottom:6px;font-weight:700">Vehicle</div><div style="font-weight:900;font-size:1.4rem;color:#fff;letter-spacing:1px;font-family:'IBM Plex Mono',monospace;line-height:1">${vPlateD}</div><div style="font-size:.8rem;color:#bbf7d0;font-weight:600;margin-top:4px;font-family:'IBM Plex Sans',sans-serif">${vNameD}</div></div></div>${sec('⏱', 'Provisional duration')}${row('Date Out', fmtDT(out), '#60a5fa')}${row('Date In', '— (vehicle not yet returned)', '#fbbf24')}${row('Days elapsed', `${joursCal} day${joursCal>1?'s':''}`, '#a78bfa')}${sec('💵', 'Provisional estimate')}${row(`${price} OMR/day × ${joursCal} day${joursCal>1?'s':''}`, `${rnd(totalDu)} OMR`, '#22c55e')}<div style="background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.3);border-radius:8px;padding:10px 14px;margin-top:12px;font-size:.76rem;color:#d97706"><strong>⚠️ Not included (calculated on return):</strong><br>• Extra hours<br>• Extra KM<br>• Petrol<br>• Cleaning</div><div style="background:linear-gradient(135deg,#0f172a,#1e293b);border-radius:12px;padding:16px 18px;margin-top:16px;border:1px solid #334155"><div style="font-size:.62rem;text-transform:uppercase;letter-spacing:1.4px;color:#64748b;margin-bottom:12px;font-weight:700">Provisional summary</div><div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #1e293b"><span style="color:#94a3b8;font-size:.8rem">Rental (${joursCal}d)</span><span style="font-family:'IBM Plex Mono',monospace;font-weight:700;color:#e2e8f0">${rnd(totalDu)} OMR</span></div><div style="display:flex;justify-content:space-between;padding:10px 0 6px;border-bottom:1px solid #334155"><span style="color:#cbd5e1;font-size:.88rem;font-weight:700">Provisional total</span><span style="font-family:'IBM Plex Mono',monospace;font-weight:800;font-size:1.1rem;color:#38bdf8">${rnd(totalDu)} OMR</span></div><div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #1e293b"><span style="color:#94a3b8;font-size:.8rem">Paid</span><span style="font-family:'IBM Plex Mono',monospace;font-weight:700;color:#f87171">− ${rnd(paid)} OMR</span></div>${cfCredit > 0 ? `<div style="display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid #1e293b"><span style="color:#16a34a;font-size:.8rem;max-width:65%">💰 Carried forward credit (from #${cfSourceR ? cfSourceR.contract : '?'}${cfReceiptDisplay ? ' · Receipt #' + cfReceiptDisplay : ''})</span><span style="font-family:'IBM Plex Mono',monospace;font-weight:700;color:#16a34a;white-space:nowrap;flex-shrink:0">− ${rnd(cfCredit)} OMR</span></div>` : ''}<div style="display:flex;justify-content:space-between;align-items:center;padding:14px 0 2px"><span style="font-weight:800;font-size:1rem;color:#e2e8f0;letter-spacing:.5px;text-transform:uppercase">Provisional balance</span><span style="font-family:'IBM Plex Mono',monospace;font-weight:900;font-size:1.6rem;color:${bal>0?'#f87171':(bal<0?'#22c55e':'#4ade80')}">${bal} OMR</span></div></div></div>`;
    document.getElementById('bal-detail-content').innerHTML = html; openModal('modal-bal-detail'); translateBalModal(); return;
  }

  // CONTRACT FERME : calcul complet
  let inD = new Date(r.dateIn);
  let outMin = out.getHours() * 60 + out.getMinutes();
  let inMin  = inD.getHours()  * 60 + inD.getMinutes();
  let diffMin = inMin - outMin;
  let extraH   = diffMin > 0 ? Math.floor(diffMin / 60) : 0;
  let { is4x4, durationType } = detectContractType(r);
  let _defRate2 = is4x4 ? 0.100 : 0.050;
  let kmRate = Number(r.kmRate) || _defRate2;
  // IMPORTANT: Utiliser TOUJOURS r.kmRate enregistré (ne pas recalculer par le vehicle)
  let basePrice2 = Number(r.basePrice || 0);
  let kmOut = Number(r.kmOut || 0);
  let kmIn  = Number(r.kmIn  || 0);
  let kmTotal = Math.max(0, kmIn - kmOut);
  let vehicleLabel  = is4x4 ? '4×4' : 'Sedan/SUV';
  let durationLabel = durationType === 'daily' ? 'Daily' : durationType === 'weekly' ? 'Weekly' : 'Monthly';
  let calOutDay2 = new Date(out.getFullYear(), out.getMonth(), out.getDate());
  let calInDay2  = new Date(inD.getFullYear(), inD.getMonth(), inD.getDate());
  let joursCalRaw2 = Math.round((calInDay2 - calOutDay2) / 86400000);
  // lateExtraDay only applies if rental spans at least 1 full calendar day
  let _withinMin = (durationType === 'monthly' && joursCalRaw2 < 30) || (durationType === 'weekly' && joursCalRaw2 < 7);
  let lateExtraDayD = (!_withinMin && joursCalRaw2 >= 1 && extraH >= 7) ? 1 : 0;
  // When late ≥7h → full extra day billed, no hourly surcharge; same-day = no extra
  // New hourly rule (retard < 7h) : 1ère heure gratuite, puis 1 OMR par heure entamée
  // (tolérance 30min par heure : ≤30min pas facturé, >30min = heure complète facturée)
  let heuresOMR = 0;
  if(!_withinMin && joursCalRaw2 >= 1 && !lateExtraDayD && diffMin > 60){
    let extraMinAfterFirstHour = diffMin - 60;
    let fullExtraHours = Math.floor(extraMinAfterFirstHour / 60);
    let remainderMin = extraMinAfterFirstHour % 60;
    heuresOMR = fullExtraHours + (remainderMin > 30 ? 1 : 0);
  }
  let joursCal2 = joursCalRaw2 === 0 ? 1 : joursCalRaw2;
  let joursFactures = joursCal2 + lateExtraDayD;

  let periodDays2 = durationType === 'weekly' ? 7 : 30;
  // Fallback : si basePrice n'est pas enregistré, reconstruire le prix complet
  // de la période à partir du prix/jour (évite que le minimum semaine/mois soit cassé)
  let bp2 = (durationType !== 'daily') ? (basePrice2 > 0 ? basePrice2 : Math.round(price * periodDays2 * 100) / 100) : price;
  let dayPrice2 = (durationType !== 'daily') ? Math.round((bp2/periodDays2)*100)/100 : price;
  let calPeriods2  = (durationType !== 'daily') ? Math.floor(joursCal2/periodDays2) : 0;
  let calRemDays2  = (durationType !== 'daily') ? joursCal2 % periodDays2 : joursCal2;

  let prixJours;
  if(durationType === 'daily'){
    prixJours = price * joursFactures;
  } else {
    // FIX: contrat Weekly/Monthly = minimum 1 période complète (identique à calcRentalBAL)
    let rawPrix2 = Math.round((calPeriods2 * bp2 + calRemDays2 * dayPrice2 + lateExtraDayD * dayPrice2)*100)/100;
    prixJours = (durationType === 'monthly' || durationType === 'weekly') ? Math.max(bp2, rawPrix2) : rawPrix2;
  }

  let kmResult = { kmInclusTotal:0, kmExtra:0, extraPeriods:0, extraDays:0,
                   resteKm:0, extraCharge:0, kmMonthsCharge:0, kmDaysCharge:0, dayPrice:dayPrice2 };
  if(kmIn && kmOut){
    kmResult = calcKmExtra(
      kmTotal,
      durationType,
      is4x4,
      kmRate,
      joursFactures,
      bp2
    );
  }

  let kmCharge = kmResult.kmMonthsCharge + kmResult.kmDaysCharge + kmResult.extraCharge;

  let fuelOutOMR = fuelToOMR(r.fuelOut);
  let fuelInOMR  = fuelToOMR(r.fuelIn);
  let petrol   = Math.max(0, fuelOutOMR - fuelInOMR);
  let cleanFee = (r.cleanBefore !== 'dirty' && r.cleanAfter === 'dirty') ? 1 : 0;
  let totalDu  = prixJours + heuresOMR + kmCharge + petrol + cleanFee;
  let bal      = Math.round((totalDu - paid - cfCredit) * 10) / 10;
  let prixJoursR   = rnd(prixJours);
  let heuresOMRR   = rnd(heuresOMR);
  let extraChargeR = rnd(kmResult.extraCharge);
  let petrolR      = rnd(petrol);
  let totalDuR     = rnd(totalDu);
  let balR         = Math.round((totalDuR - rnd(paid) - rnd(cfCredit)) * 10) / 10;
  let kmPerDay2b = durationType==='weekly' ? (is4x4?200:200) : (is4x4?150:167);
  let html = `<div style="font-family:'IBM Plex Sans',sans-serif;font-size:.85rem;padding:2px 0">
<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
  <div style="background:linear-gradient(135deg,#1e3a5f,#1e40af);border-radius:10px;padding:14px 16px">
    <div style="font-size:.62rem;text-transform:uppercase;letter-spacing:1.4px;color:#93c5fd;margin-bottom:6px;font-weight:700">Contract N°</div>
    <div style="font-weight:900;font-size:1.8rem;color:#fff;letter-spacing:1px;font-family:'IBM Plex Mono',monospace;line-height:1">${r.contract || '—'}</div>
  </div>
  <div style="background:linear-gradient(135deg,#14532d,#166534);border-radius:10px;padding:14px 16px">
    <div style="font-size:.62rem;text-transform:uppercase;letter-spacing:1.4px;color:#86efac;margin-bottom:6px;font-weight:700">Vehicle</div>
    <div style="font-weight:900;font-size:1.4rem;color:#fff;letter-spacing:1px;font-family:'IBM Plex Mono',monospace;line-height:1">${vPlateD}</div>
    <div style="font-size:.8rem;color:#bbf7d0;font-weight:600;margin-top:4px;font-family:'IBM Plex Sans',sans-serif">${vNameD}</div>
  </div>
</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:4px">
  <div style="background:var(--s2);border-radius:8px;padding:10px 12px;border-left:3px solid #60a5fa">
    <div style="font-size:.62rem;text-transform:uppercase;letter-spacing:1px;color:var(--dim);margin-bottom:4px;font-weight:700">Date Out</div>
    <div style="font-family:'IBM Plex Mono',monospace;font-size:.85rem;font-weight:700;color:var(--text)">${fmtDT(out)}</div>
  </div>
  <div style="background:var(--s2);border-radius:8px;padding:10px 12px;border-left:3px solid #4ade80">
    <div style="font-size:.62rem;text-transform:uppercase;letter-spacing:1px;color:var(--dim);margin-bottom:4px;font-weight:700">Date In</div>
    <div style="font-family:'IBM Plex Mono',monospace;font-size:.85rem;font-weight:700;color:var(--text)">${fmtDT(inD)}</div>
  </div>
</div>

${sec('⏱', 'Duration')}
<div style="background:var(--s2);border-radius:8px;padding:10px 14px">
  ${row('Calendar days', `${joursCal2} day${joursCal2!==1?'s':''}`, '#60a5fa', `${pad(out.getDate())}/${pad(out.getMonth()+1)}/${out.getFullYear()} → ${pad(inD.getDate())}/${pad(inD.getMonth()+1)}/${inD.getFullYear()}`)}
  ${(()=>{ if(durationType==='daily') return ''; let s=''; if(calPeriods2>0) s+=row(`Full ${durationLabel} periods`, `${calPeriods2} × ${periodDays2} days`, '#a78bfa'); if(calRemDays2>0) s+=row('Remaining days', `${calRemDays2} day${calRemDays2>1?'s':''}`, '#a78bfa'); return s; })()}
  ${(()=>{
    if(joursCalRaw2 === 0) return row('Extra hours', `<span style="color:#4ade80">0 OMR — same day</span>`, 'var(--text)', `${pad(inD.getHours())}:${pad(inD.getMinutes())} − ${pad(out.getHours())}:${pad(out.getMinutes())} = ${extraH}h — 1 day already billed`);
    if(_withinMin) return row('Extra hours', `<span style="color:#4ade80">0 OMR — covered by ${durationLabel.toLowerCase()} minimum</span>`, 'var(--text)', `Returned before end of the ${durationType==='weekly'?7:30}-day period`);
    if(diffMin <= 0) return row('Extra hours', translate('rental.zeroOmr'), '#a78bfa');
    if(lateExtraDayD) return row('Extra hours', `<span style="color:#4ade80">0 OMR — included in extra day</span>`, 'var(--text)', `${pad(inD.getHours())}:${pad(inD.getMinutes())} − ${pad(out.getHours())}:${pad(out.getMinutes())} = ${extraH}h ≥ 7h → billed as full day`);
    return row('Extra hours', `${heuresOMRR} OMR`, '#a78bfa', `${pad(inD.getHours())}:${pad(inD.getMinutes())} − ${pad(out.getHours())}:${pad(out.getMinutes())} = ${extraH}h · 1st hour free, then 1 OMR/h (30min tolerance)`);
  })()}
</div>

${sec('💵', 'Price (Calendar)')}
<div style="background:var(--s2);border-radius:8px;padding:10px 14px">
  ${(()=>{
    if(durationType==='daily') return row(`${price} OMR/day × ${joursFactures} days`, `${prixJoursR} OMR`, '#22c55e');
    let lines='';
    if(calPeriods2 === 0){
      // Minimum period applies (e.g. 1-3 days on a Weekly/Monthly contract) — showing "N day × X/day" here would contradict the subtotal
      lines += row(`${durationLabel} minimum`, `${prixJoursR} OMR`, '#22c55e', `${calRemDays2} day${calRemDays2>1?'s':''} used — minimum ${periodDays2}-day ${durationLabel.toLowerCase()} rate applies`);
    } else {
      lines += row(`${calPeriods2} × ${durationLabel} (${bp2} OMR)`, `${rnd(calPeriods2*bp2)} OMR`, '#22c55e');
      if(calRemDays2>0) lines += row(`${calRemDays2} day${calRemDays2>1?'s':''} × ${dayPrice2} OMR/day`, `${rnd(calRemDays2*dayPrice2)} OMR`, '#22c55e', `${bp2} ÷ ${periodDays2} = ${dayPrice2} OMR/day`);
      if(lateExtraDayD) lines += row(`Extra day (late return)`, `${rnd(dayPrice2)} OMR`, '#22c55e');
    }
    lines += row('Calendar subtotal', `${prixJoursR} OMR`, '#16a34a');
    return lines;
  })()}
  ${heuresOMRR > 0 ? row('Extra hours', `${heuresOMRR} OMR`, '#22c55e') : ''}
</div>

${sec('🛣️', `KM — ${durationLabel} · ${vehicleLabel}`)}
<div style="background:var(--s2);border-radius:8px;padding:10px 14px">
  ${row('KM Out', `${kmOut.toLocaleString()} km`)}
  ${row('KM In',  `${kmIn.toLocaleString()} km`)}
  ${row('Total driven', `${kmTotal.toLocaleString()} km`, kmTotal > kmResult.kmInclusTotal ? '#f97316' : '#4ade80')}
  ${(()=>{
    if(durationType==='daily'){
      return row(`Included (${is4x4?200:250} km/day × ${joursFactures} days)`, `${kmResult.kmInclusTotal.toLocaleString()} km`, '#60a5fa');
    }
    if(durationType === 'monthly'){
      const kmPM = is4x4 ? 4500 : 5000;
      const kmPD = Math.round(kmPM / 30);
      let label = `${calPeriods2} Monthly${calPeriods2>1?'s':''} × ${kmPM.toLocaleString()} km`;
      if(calRemDays2 > 0) label += ` + ${calRemDays2} day${calRemDays2>1?'s':''} × ${kmPD} km`;
      return row(`Included (${label})`, `${kmResult.kmInclusTotal.toLocaleString()} km`, '#60a5fa');
    }
    return row(`Included (${calPeriods2} ${durationLabel}${calPeriods2>1?'s':''} × ${kmResult.kmInclusTotal/Math.max(calPeriods2,1)} km)`, `${kmResult.kmInclusTotal.toLocaleString()} km`, '#60a5fa');
  })()}
  ${kmResult.kmExtra <= 0 ? row('KM extra', '0 km — within limit ✅', '#4ade80') : row('KM extra', `${kmResult.kmExtra.toLocaleString()} km over limit`, '#f97316')}
  ${(()=>{
    if(kmResult.kmExtra <= 0) return '';
    let lines='';
    // Facturation simple : tout le dépassement × kmRate
    if(kmResult.kmExtra > 0) lines += row(`${kmResult.kmExtra.toLocaleString()} km × ${kmRate} OMR/km`, `${extraChargeR} OMR`, '#f97316');

    let kmTotal2 = extraChargeR;
    lines += row('KM subtotal', `${kmTotal2} OMR`, '#16a34a');
    return lines;
  })()}
  <div style="display:flex;justify-content:space-between;padding:5px 2px;margin-top:2px">
    <span style="color:var(--dim);font-size:.75rem">KM Rate</span>
    <span style="font-family:'IBM Plex Mono',monospace;font-size:.78rem;color:var(--muted)">${Number(kmRate).toFixed(3)} OMR/km</span>
  </div>
</div>

${sec('⛽', 'Petrol')}
<div style="background:var(--s2);border-radius:8px;padding:10px 14px">
  ${row('Fuel Out', `${r.fuelOut} tank → ${fuelOutOMR} OMR`)}
  ${row('Fuel In',  `${r.fuelIn} tank → ${fuelInOMR} OMR`)}
  ${row('Petrol due', `${petrolR} OMR`, petrolR > 0 ? '#f97316' : '#4ade80')}
</div>

${sec('🧹', 'Car Condition')}
<div style="background:var(--s2);border-radius:8px;padding:10px 14px">
  ${row('Before rental', r.cleanBefore==='dirty' ? '❌ DIRTY' : '✅ CLEAN', r.cleanBefore==='dirty'?'#f87171':'#4ade80')}
  ${row('After return',  r.cleanAfter ==='dirty' ? '❌ DIRTY' : '✅ CLEAN', r.cleanAfter ==='dirty'?'#f87171':'#4ade80')}
  ${cleanFee > 0 ? row('Cleaning fee', '1 OMR', '#f97316', 'Returned dirty') : row('Cleaning fee', 'None', '#4ade80')}
</div>

<div style="background:linear-gradient(135deg,#0f172a,#1e293b);border-radius:12px;padding:16px 18px;margin-top:16px;border:1px solid #334155">
  <div style="font-size:.62rem;text-transform:uppercase;letter-spacing:1.4px;color:#64748b;margin-bottom:12px;font-weight:700">Summary</div>
  <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #1e293b">
    <span style="color:#94a3b8;font-size:.8rem">Calendar charge</span>
    <span style="font-family:'IBM Plex Mono',monospace;font-weight:700;color:#e2e8f0">${prixJoursR} OMR</span>
  </div>
  ${heuresOMRR > 0 ? `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #1e293b"><span style="color:#94a3b8;font-size:.8rem">Extra hours</span><span style="font-family:'IBM Plex Mono',monospace;font-weight:700;color:#e2e8f0">${heuresOMRR} OMR</span></div>` : ''}
  ${(kmResult.kmMonthsCharge > 0 || kmResult.kmDaysCharge > 0 || kmResult.extraCharge > 0) ? `
  <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #1e293b">
    <span style="color:#94a3b8;font-size:.8rem">KM extra charge</span>
    <span style="font-family:'IBM Plex Mono',monospace;font-weight:700;color:#e2e8f0">${rnd(kmResult.kmMonthsCharge + kmResult.kmDaysCharge + kmResult.extraCharge)} OMR</span>
  </div>` : ''}
  ${petrolR > 0 ? `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #1e293b"><span style="color:#94a3b8;font-size:.8rem">Fuel</span><span style="font-family:'IBM Plex Mono',monospace;font-weight:700;color:#e2e8f0">${petrolR} OMR</span></div>` : ''}
  ${cleanFee > 0 ? `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #1e293b"><span style="color:#94a3b8;font-size:.8rem">Frais nettoyage</span><span style="font-family:'IBM Plex Mono',monospace;font-weight:700;color:#e2e8f0">1 OMR</span></div>` : ''}
  <div style="display:flex;justify-content:space-between;padding:10px 0 6px;border-bottom:1px solid #334155">
    <span style="color:#cbd5e1;font-size:.88rem;font-weight:700">Total due</span>
    <span style="font-family:'IBM Plex Mono',monospace;font-weight:800;font-size:1.1rem;color:#38bdf8">${totalDuR} OMR</span>
  </div>
  <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #1e293b">
    <span style="color:#94a3b8;font-size:.8rem">Paid</span>
    <span style="font-family:'IBM Plex Mono',monospace;font-weight:700;color:#f87171">− ${rnd(paid)} OMR</span>
  </div>
  ${cfCredit > 0 ? `<div style="display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid #1e293b"><span style="color:#16a34a;font-size:.8rem;max-width:65%">💰 Carried forward credit (from #${cfSourceR ? cfSourceR.contract : '?'}${cfReceiptDisplay ? ' · Receipt #' + cfReceiptDisplay : ''})</span><span style="font-family:'IBM Plex Mono',monospace;font-weight:700;color:#16a34a;white-space:nowrap;flex-shrink:0">− ${rnd(cfCredit)} OMR</span></div>` : ''}
  <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 0 2px">
    <span style="font-weight:800;font-size:1rem;color:#e2e8f0;letter-spacing:.5px;text-transform:uppercase">BALANCE</span>
    <span style="font-family:'IBM Plex Mono',monospace;font-weight:900;font-size:1.6rem;color:${balR>0?'#f87171':(balR<0?'#22c55e':'#4ade80')}">${Number(balR).toFixed(1)} OMR</span>
  </div>
</div>
</div>`;
  document.getElementById('bal-detail-content').innerHTML = html; openModal('modal-bal-detail'); translateBalModal(); }



/* ═══════════════════════════════════════════════════════════
   💰 BAL PREVIEW FROM RENTAL MODAL
   Affiche le detail BAL avec les valeurs actuelles du formulaire
   BEFORE de saveer — permet au client de view le montant dû
   ═══════════════════════════════════════════════════════════ */

// ── showBalDetailPreview (orig. line 6247) ──
function showBalDetailPreview(r) {
  showBalDetailDirect(r);
}


// ── showBalDetailOverlay (orig. line 6251) ──
function showBalDetailOverlay(html) {
  // Remove existing temp overlay if any
  const existing = document.getElementById('bal-preview-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'bal-preview-overlay';
  overlay.className = 'overlay show';
  overlay.style.zIndex = '300';
  overlay.innerHTML = `
    <div class="modal" style="max-width:560px;max-height:90vh;overflow-y:auto">
      <div class="modal-header" style="background:linear-gradient(135deg,#1e3a5f,#1e40af)">
        <div class="modal-title" style="color:#fff">💰 BAL Calculation Detail — PREVIEW</div>
        <button class="modal-close" data-dr-action="close-overlay" data-dr-overlay-id="bal-preview-overlay" style="color:#94a3b8">✕</button>
      </div>
      <div class="modal-body" style="padding:18px 20px">${html}</div>
      <div class="modal-footer" style="border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end;padding:14px 20px">
        <button class="btn btn-ghost" data-dr-action="close-overlay" data-dr-overlay-id="bal-preview-overlay">Close</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}
