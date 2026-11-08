// ═══════════════════════════════════════════════════════════════════
// module-daily-rentals-form.js
// FORM — modale Add/Edit Rental : lock/unlock des champs, sélection type de véhicule, sauvegarde
// Extrait automatiquement de module-daily-rentals.js (découpage mécanique,
// aucune ligne modifiée — tout reste en portée globale, comme avant).
// ═══════════════════════════════════════════════════════════════════


// ── onNoticeToggle — toggle cosmétique du badge NOTICE (aucune validation, aucun mot de passe, l'agrément peut rester OUT) ──
function onNoticeToggle(checked){
  let wrap = document.getElementById('notice-toggle-wrap');
  if(wrap) wrap.style.background = checked ? 'rgba(220,38,38,.35)' : 'rgba(220,38,38,.15)';
}


// ── onCancelledBalanceSync — dès que la case CANCELLED est cochée : bal=0 gelé (même logique que Temp Replacement) ──
// Appelée en plus de onCancelledToggle() (voir onchange dans app.html) pour donner un retour visuel
// immédiat dans le modal, sans attendre la sauvegarde. La logique de gel définitif au save se trouve
// dans saveRentalModal() (bloc "CANCELLED CONTRACTS : balance auto TOUJOURS = 0").
function onCancelledBalanceSync(checked){
  if(!checked){
    // Si on décoche CANCELLED (hors contract déjà fermé/soldé), on ne force rien :
    // le staff peut ressaisir une BAL normale ou laisser le recalcul automatique reprendre.
    return;
  }
  let balEl = document.getElementById('r-bal');
  if(balEl) balEl.value = 0;
  window._balManuallyEdited = true; // gèle bal à 0 — réutilise le mécanisme _balManual existant
}


// ── openAddRental (orig. line 3537) ──
function openAddRental(){
  document.getElementById('modal-rental').setAttribute('data-edit-id','');
  _lastSvcPopupPlate=''; let existingSvcPopup=document.getElementById('svc-plate-popup'); if(existingSvcPopup) existingSvcPopup.remove();
  window._editingRentalPayments = [];
  window._currentRentalClientId = null;
  let rcid = document.getElementById('r-client-id'); if(rcid) rcid.value = '';
  let rcst = document.getElementById('r-client-status'); if(rcst){ rcst.textContent = translate('rental.noClient'); rcst.style.background='var(--s2)'; rcst.style.border='1px solid var(--border)'; rcst.style.color='var(--muted)'; }
  if(document.getElementById('r-paid-history')) document.getElementById('r-paid-history').innerHTML='';
  if(document.getElementById('r-paid-total')) document.getElementById('r-paid-total').textContent=translate('rental.zeroOmr');
  if(document.getElementById('r-paid-add')) document.getElementById('r-paid-add').value='';
  ['r-vname','r-plate','r-contract','r-price','r-out','r-in','r-km-out','r-km-in','r-paid','r-tel','r-notes','r-bal'].forEach(id=>{
    let el=document.getElementById(id); if(el){ el.value=''; el._userEdited=false; }
  });
  let cbY=document.getElementById('r-clean-before-yes'); if(cbY) cbY.checked=false;
  let cbN=document.getElementById('r-clean-before-no'); if(cbN) cbN.checked=false;
  let caY=document.getElementById('r-clean-after-yes'); if(caY) caY.checked=false;
  let caN=document.getElementById('r-clean-after-no'); if(caN) caN.checked=false;
  // Reset CANCELLED checkbox
  let cancelCk = document.getElementById('r-cancelled-check');
  if(cancelCk){ cancelCk.checked = false; onCancelledToggle(false); }
  // Reset NOTICE checkbox (cosmetic only)
  let noticeCk = document.getElementById('r-notice-check');
  if(noticeCk){ noticeCk.checked = false; onNoticeToggle(false); }
  // Reset TEMP REPLACEMENT checkbox/select
  let tempCk3 = document.getElementById('r-temp-replacement-check');
  if(tempCk3){ tempCk3.checked = false; tempCk3.setAttribute('data-locked','0'); tempCk3.disabled = false; }
  let tempSelWrap3 = document.getElementById('temp-replacement-select-wrap'); if(tempSelWrap3) tempSelWrap3.style.display = 'none';
  let tempSel3 = document.getElementById('r-temp-replaces-id'); if(tempSel3){ tempSel3.value = ''; tempSel3.disabled = false; }
  let tempWrap3 = document.getElementById('temp-toggle-wrap'); if(tempWrap3) tempWrap3.style.background = 'rgba(124,58,237,.15)';
  // Load contracts for new rental (will fill after client is selected)
  let cfSourceInp = document.getElementById('r-cf-source-contract');
  if(cfSourceInp) cfSourceInp.innerHTML = `<option value="">${translate('cf.selectPlaceholder')}</option>`;
  let cfClientInfoReset = document.getElementById('r-cf-client-info');
  if(cfClientInfoReset) cfClientInfoReset.innerHTML = `<span style="color:var(--muted)">${translate('cf.noClientYet')}</span>`;
  // FIX (2026-09) : #r-cf-amount et le panneau info sont des champs PARTAGÉS par toute la
  // modale Rental (réutilisée pour tous les contrats). Sans ce reset explicite, un montant
  // affiché en consultant un AUTRE contrat restait dans le DOM et pouvait se sauvegarder
  // silencieusement sur le contrat suivant, sans qu'aucun contrat source ait été choisi
  // (bug "crédit reporté fantôme — from #?", cas réels : #5187B, #5235B, #5240B — 18 OMR
  // chacun, tous fermés le même jour, tous sans sourceId).
  let cfAmountReset = document.getElementById('r-cf-amount');
  if(cfAmountReset) cfAmountReset.value = '';
  let cfInfoReset = document.getElementById('r-cf-source-info');
  if(cfInfoReset) cfInfoReset.style.display = 'none';
  let kmDay=document.getElementById('r-km-day'); if(kmDay) kmDay.value='0';
  let fo=document.getElementById('r-fuel-out'); if(fo) fo.value='';
  let fi=document.getElementById('r-fuel-in'); if(fi) fi.value='';
  let balEl=document.getElementById('r-bal'); if(balEl) balEl.value='';
  // FIX (12/07/2026) : toISOString() renvoie l'heure UTC, pas l'heure locale du PC
  // (décalage de 4h à Oman) — on construit maintenant la date/heure locale à la main.
  let _now = new Date();
  let _pad = n => String(n).padStart(2,'0');
  let maintenant = `${_now.getFullYear()}-${_pad(_now.getMonth()+1)}-${_pad(_now.getDate())}T${_pad(_now.getHours())}:${_pad(_now.getMinutes())}`;
  document.getElementById('r-out').value=maintenant;

  // FIX (2026-08) demandé par Hicham : même correctif que pour r-out (date OUT)
  // ci-dessus — préremplir le champ "PAYMENT & BAL" (r-paid-date) avec la date
  // locale du PC (pas UTC) au lieu de le laisser vide (jj/mm/aaaa) sur un
  // NOUVEAU contrat.
  let aujourdhui = `${_now.getFullYear()}-${_pad(_now.getMonth()+1)}-${_pad(_now.getDate())}`;
  let paidDateNewEl = document.getElementById('r-paid-date');
  if(paidDateNewEl) paidDateNewEl.value = aujourdhui;

  // Verrouille la DATE sur aujourd'hui pour un NOUVEAU contrat (l'heure reste libre) :
  // empêche de sauvegarder par erreur un contrat daté d'hier. Ne s'applique pas en
  // mode édition (data-edit-id rempli). Échappatoire : le bouton "🔐 Unlock All"
  // existant lève ce verrou (voir unlockAllNewRentalFields) — pas de bouton dédié.
  window._rOutDateLockDisabled = false; // reset à chaque ouverture du modal New Rental
  (function(){
    let el = document.getElementById('r-out');
    if(!el || el._todayLockBound) return;
    el._todayLockBound = true;
    el.addEventListener('input', function(){
      let modal = document.getElementById('modal-rental');
      if(modal && modal.getAttribute('data-edit-id')) return; // mode édition → pas de verrou
      if(window._rOutDateLockDisabled) return; // débloqué via 🔐 Unlock All
      let now2 = new Date();
      let pad2 = n => String(n).padStart(2,'0');
      let todayStr = `${now2.getFullYear()}-${pad2(now2.getMonth()+1)}-${pad2(now2.getDate())}`;
      let val = el.value || '';
      let datePart = val.slice(0,10);
      let timePart = val.slice(11,16) || `${pad2(now2.getHours())}:${pad2(now2.getMinutes())}`;
      if(datePart && datePart !== todayStr){
        el.value = todayStr + 'T' + timePart;
        if(typeof toast === 'function') toast(translate('rental.exitDateMustBeToday'));
      }
    });
  })();

  // FIX (2026-08) demandé par Hicham : MÊME verrou que r-out ci-dessus, appliqué
  // au champ "PAYMENT & BAL" (r-paid-date) — la date de paiement ne doit jamais
  // pouvoir être changée vers une autre date que celle du PC sur un NOUVEAU
  // contrat. Ne s'applique pas en mode édition. Levé par "🔐 Unlock All" (voir
  // unlockAllNewRentalFields).
  window._rPaidDateLockDisabled = false; // reset à chaque ouverture du modal New Rental
  (function(){
    let el = document.getElementById('r-paid-date');
    if(!el || el._todayLockBound) return;
    el._todayLockBound = true;
    el.addEventListener('input', function(){
      let modal = document.getElementById('modal-rental');
      if(modal && modal.getAttribute('data-edit-id')) return; // mode édition → pas de verrou
      if(window._rPaidDateLockDisabled) return; // débloqué via 🔐 Unlock All
      let now2 = new Date();
      let pad2 = n => String(n).padStart(2,'0');
      let todayStr = `${now2.getFullYear()}-${pad2(now2.getMonth()+1)}-${pad2(now2.getDate())}`;
      if(el.value && el.value !== todayStr){
        el.value = todayStr;
        if(typeof toast === 'function') toast(translate('rental.exitDateMustBeToday'));
      }
    });
  })();

  // ── AUTO-FILL CONTRACT N° (next sequential number, locked) ──
  // Chaque branche a sa propre séquence indépendante (ex: BARKA et MOEBELA
  // ont chacune leur propre numérotation, qui peut légitimement se recouper —
  // ce n'est pas un bug). Pour les comptes restreints à une branche, DB.rentals
  // est déjà filtré côté serveur à cette branche, donc ce scan local donne
  // naturellement le bon "prochain numéro" DANS la bonne séquence.
  (function(){
    let maxC = 0;
    (DB.rentals||[]).forEach(function(r){
      let n = parseInt(r.contract, 10);
      if(!isNaN(n) && n > maxC) maxC = n;
    });
    let nextC = maxC + 1;
    // Suffixe de branche (B = BARKA, M = MOEBELA) pour éviter tout recoupement
    // de numéro entre les deux séquences indépendantes. N'a d'effet que pour un
    // compte mono-branche (le Directeur ne crée jamais de contrat — cf. AUTH.isAdmin).
    let branchLetter = (Array.isArray(window.AUTH.branches) && window.AUTH.branches.length === 1)
      ? window.AUTH.branches[0].charAt(0).toUpperCase() : '';
    let cEl = document.getElementById('r-contract');
    if(cEl){
      cEl.value = nextC + branchLetter;
      cEl.readOnly = true;
      cEl.style.cursor = 'not-allowed';
      cEl.style.opacity = '.85';
      cEl.style.background = 'var(--s2)';
      cEl.title = translate('rental.autoGenerated');
    }
    let cIcon = document.getElementById('contract-lock-icon');
    if(cIcon){ cIcon.innerHTML = translate('rental.contractLocked'); cIcon.style.color = '#7c3aed'; }
  })();

  // ── NEW RENTAL: tous les champs sont ouverts librement ──
  // Unlock all fields for fresh entry (contract excluded — locked above)
  ['r-vname','r-plate','r-tel','r-km-out','r-out','r-notes'].forEach(id=>{
    let el=document.getElementById(id);
    if(el){ el.readOnly=false; el.style.cursor='text'; el.style.opacity='1'; el.style.background=''; }
  });

  // KM In — open for new rental
  let kmInNew=document.getElementById('r-km-in');
  if(kmInNew){ kmInNew.readOnly=false; kmInNew.style.cursor='text'; kmInNew.style.opacity='1'; }
  let kminIcon=document.getElementById('kmin-lock-icon');
  if(kminIcon) kminIcon.innerHTML='';

  // Date In — open for new rental
  let dateInEl=document.getElementById('r-in');
  if(dateInEl){ dateInEl.readOnly=false; dateInEl.style.cursor='text'; dateInEl.style.opacity='1'; dateInEl.value=''; }
  let dateinIcon=document.getElementById('datein-lock-icon');
  if(dateinIcon){ dateinIcon.textContent=''; }

  // Price — open for new rental
  let priceElN=document.getElementById('r-price');
  if(priceElN){ priceElN.readOnly=false; priceElN.style.cursor='text'; priceElN.style.opacity='1'; }
  let priceLockN=document.getElementById('price-lock-icon');
  if(priceLockN) priceLockN.innerHTML='';
  let pricePwN=document.getElementById('price-pw-row');
  if(pricePwN) pricePwN.style.display='none';

  // BAL — open for new rental
  let balEl2=document.getElementById('r-bal');
  if(balEl2){ balEl2.readOnly=false; balEl2.style.cursor='text'; balEl2.style.opacity='1'; }
  let balIcon=document.getElementById('bal-lock-icon');
  if(balIcon) balIcon.innerHTML='';
  let balPwRow=document.getElementById('bal-pw-row');
  if(balPwRow) balPwRow.style.display='none';

  // Fuel & condition — open
  let fo2=document.getElementById('r-fuel-out'); if(fo2){ fo2.disabled=false; fo2.style.opacity='1'; }
  let fi2=document.getElementById('r-fuel-in');  if(fi2){ fi2.disabled=false; fi2.style.opacity='1'; }
  let fuelinIconNew=document.getElementById('fuelin-lock-icon'); if(fuelinIconNew) fuelinIconNew.innerHTML='';
  // KM Out / Fuel Out — reset auto-fill lock state for fresh entry
  lockKmOutField(false);
  lockFuelOutField(false);
  document.querySelectorAll('input[name="clean-before"],input[name="clean-after"]').forEach(el=>{ el.disabled=false; });
  let caGroupNew=document.getElementById('clean-after-group'); if(caGroupNew){ caGroupNew.setAttribute('data-locked','0'); caGroupNew.style.opacity='1'; }
  let cleanafterIconNew=document.getElementById('cleanafter-lock-icon'); if(cleanafterIconNew) cleanafterIconNew.innerHTML='';
  let kmRate=document.getElementById('r-km-rate'); if(kmRate){ kmRate.disabled=false; kmRate.style.opacity='1'; }

  // Car type buttons
  let ctSmall=document.getElementById('car-type-small');
  let ct4x4=document.getElementById('car-type-4x4');
  if(ctSmall){ ctSmall.disabled=false; ctSmall.style.cursor='pointer'; ctSmall.style.opacity='1'; ctSmall.style.borderColor='var(--border)'; ctSmall.style.background='var(--s1)'; }
  if(ct4x4){   ct4x4.disabled=false;   ct4x4.style.cursor='pointer';   ct4x4.style.opacity='1';   ct4x4.style.borderColor='var(--border)'; ct4x4.style.background='var(--s1)'; }
  // FIX: Hide both pickers (never remove static elements from DOM)
  let sp=document.getElementById('small-duration-picker'); if(sp) sp.style.display='none';
  let opt4=document.getElementById('car-type-4x4-options'); if(opt4) opt4.style.display='none';
  let lbl4=document.getElementById('car-type-4x4-label'); if(lbl4) lbl4.textContent=translate('rental.selectDuration4x4');
  let lblS=document.getElementById('car-type-small-label'); if(lblS) lblS.textContent=translate('rental.selectDuration');
  let pptr=document.getElementById('price-per-type-row'); if(pptr) pptr.style.display='none';

  // Reset global state
  window._priceDurationLocked=false;
  window._allFieldsUnlocked=true;
  window._currentCarType=null;
  window._currentDuration=null;
  // FIX: Reset hidden contract/car type inputs so second registration starts clean
  let ctHidden=document.getElementById('r-contract-type'); if(ctHidden) ctHidden.value='';
  let carHidden=document.getElementById('r-car-type'); if(carHidden) carHidden.value='';
  let bpHidden=document.getElementById('r-base-price'); if(bpHidden) bpHidden.value='';

  // Remove locked banner
  let banner=document.getElementById('rental-locked-banner'); if(banner) banner.style.display='none';

  // Header buttons — show unlock-new-btn hidden, unlock-all hidden
  let unlockAllBtn=document.getElementById('unlock-all-btn');
  if(unlockAllBtn){ unlockAllBtn.style.display='none'; unlockAllBtn.textContent=translate('rental.unlockAll'); unlockAllBtn.style.borderColor='#fbbf24'; unlockAllBtn.style.color='#fbbf24'; unlockAllBtn.style.background='rgba(251,191,36,.15)'; }
  let unlockNewBtn=document.getElementById('unlock-new-btn');
  if(unlockNewBtn){ unlockNewBtn.style.display='none'; }

  document.getElementById('modal-rental').setAttribute('data-type-locked','0');
  openModal('modal-rental');
}


const CAR_TYPES = { small: { daily: { kmDay: 250, label: '250 km/day' }, weekly: { kmDay: 200, label: '1400 km/week' }, monthly: { kmDay: 167, label: '5000 km/month' } }, '4x4': { daily: { kmDay: 200, label: '200 km/day' }, weekly: { kmDay: 200, label: '1400 km/week' }, monthly: { kmDay: 150, label: '4500 km/month' } } };
const KM_LIMITS = { small: { daily: 250, weekly: 1400, monthly: 5000 }, '4x4': { daily: 200, weekly: 1400, monthly: 4500 } };
window._currentCarType = null; window._currentDuration = null;

// ── selectCarType (orig. line 3670) ──
function selectCarType(type){
  // Check if already locked (existing rental edit mode)
  let editId = document.getElementById('modal-rental').getAttribute('data-edit-id');
  let isLocked = document.getElementById('modal-rental').getAttribute('data-type-locked') === '1';
  if(isLocked && editId && editId !== ''){
    securePrompt('🔒 Contract locked. Enter password to change type:').then(function(pw){
      if(pw === null) return;
      checkPassword(pw, 'Daily Rentals — Unlock Contract Type').then(function(ok){
      if(!ok){ toast(translate('rental.wrongPassword')); return; }
      document.getElementById('modal-rental').setAttribute('data-type-locked','0');
      toast(translate('rental.contractUnlockMsg'));
      window._currentCarType = type;
      // re-trigger the rest of selectCarType logic
      let kmRateSelect = document.getElementById('r-km-rate');
      if(kmRateSelect){
        if(type === 'small') kmRateSelect.value = '0.050';
        else if(type === '4x4') kmRateSelect.value = '0.100';
      }
      document.getElementById('car-type-small').style.borderColor = type==='small' ? '#2563eb' : '#e2e8f0';
      document.getElementById('car-type-small').style.background  = type==='small' ? 'rgba(37,99,235,.07)' : '#f8fafc';
      document.getElementById('car-type-4x4').style.borderColor  = type==='4x4' ? '#7c3aed' : '#e2e8f0';
      document.getElementById('car-type-4x4').style.background   = type==='4x4' ? 'rgba(124,58,237,.07)' : '#f8fafc';
      }); // end checkPassword
    }); // end securePrompt
    return;
  }
  window._currentCarType = type;
  
  // AUTO-SELECT KM RATE BASÉ SUR LE TYPE DE VEHICLE
  let kmRateSelect = document.getElementById('r-km-rate');
  if(kmRateSelect){
    if(type === 'small'){
      kmRateSelect.value = '0.050'; // Standard pour Sedan
    } else if(type === '4x4'){
      kmRateSelect.value = '0.100'; // Premium pour 4×4
    }
  }
  
  document.getElementById('car-type-small').style.borderColor = type==='small' ? '#2563eb' : '#e2e8f0';
  document.getElementById('car-type-small').style.background  = type==='small' ? 'rgba(37,99,235,.07)' : '#f8fafc';
  document.getElementById('car-type-4x4').style.borderColor  = type==='4x4' ? '#7c3aed' : '#e2e8f0';
  document.getElementById('car-type-4x4').style.background   = type==='4x4' ? 'rgba(124,58,237,.07)' : '#f8fafc';
  // FIX: Always use the static pickers (show/hide only — never recreate)
  let _sdp = document.getElementById('small-duration-picker');
  let _4xo = document.getElementById('car-type-4x4-options');
  if(type === 'small'){
    if(_4xo) _4xo.style.display = 'none';
    if(_sdp){ _sdp.style.display = 'flex'; _sdp.querySelectorAll('button').forEach(function(b){ b.disabled=false; b.style.cursor='pointer'; b.style.opacity='1'; }); }
  } else {
    if(_sdp) _sdp.style.display = 'none';
    if(_4xo){ _4xo.style.display = 'flex'; _4xo.querySelectorAll('button').forEach(function(b){ b.disabled=false; b.style.cursor='pointer'; b.style.opacity='1'; }); }
  }
}


// ── applySmall (orig. line 3722) ──
function applySmall(duration){
  if(window._priceDurationLocked && !window._allFieldsUnlocked && window._currentDuration && window._currentDuration !== duration){
    toast(translate('rental.priceLocked'));
    unlockBasePrice();
    return;
  }
  window._currentDuration = duration;
  let data = CAR_TYPES.small[duration];
  let kmLabels = { daily: '📅 Daily — 250 Km', weekly: '📆 Weekly — 1400 Km', monthly: '🗓️ Monthly — 5000 Km' };
  _applyCarTypeData(data, 'Sedan/SUV', '#2563eb', duration, 'small');
  let lbl = document.getElementById('car-type-small-label'); if(lbl) lbl.textContent = kmLabels[duration];
}

// ── apply4x4 (orig. line 3734) ──
function apply4x4(duration){
  if(window._priceDurationLocked && !window._allFieldsUnlocked && window._currentDuration && window._currentDuration !== duration){
    toast(translate('rental.priceLocked'));
    unlockBasePrice();
    return;
  }
  window._currentDuration = duration;
  let data = CAR_TYPES['4x4'][duration];
  let kmLabels = { daily: '📅 Daily — 200 Km', weekly: '📆 Weekly — 1400 Km', monthly: '🗓️ Monthly — 4500 Km' };
  _applyCarTypeData(data, '4×4', '#7c3aed', duration, '4x4');
  let lbl = document.getElementById('car-type-4x4-label'); if(lbl) lbl.textContent = kmLabels[duration];
}


// ── _applyCarTypeData (orig. line 3747) ──
function _applyCarTypeData(data, carLabel, color, duration, carType){
  // Reset price lock when duration panel is rebuilt fresh
  window._priceDurationLocked = false;
  // FIX: Always sync the picker panels visibility with the selected carType
  let _sdp2 = document.getElementById('small-duration-picker');
  let _4xo2 = document.getElementById('car-type-4x4-options');
  if(carType === '4x4'){ if(_sdp2) _sdp2.style.display='none'; if(_4xo2) _4xo2.style.display='flex'; }
  else { if(_4xo2) _4xo2.style.display='none'; if(_sdp2) _sdp2.style.display='flex'; }
  let kmDayEl = document.getElementById('r-km-day'); if(kmDayEl) kmDayEl.value = data.kmDay;
  let ctEl = document.getElementById('r-contract-type'); if(!ctEl){ ctEl = document.createElement('input'); ctEl.type = 'hidden'; ctEl.id = 'r-contract-type'; document.getElementById('r-km-day').parentNode.appendChild(ctEl); } ctEl.value = duration;
  let ctCarEl = document.getElementById('r-car-type'); if(!ctCarEl){ ctCarEl = document.createElement('input'); ctCarEl.type = 'hidden'; ctCarEl.id = 'r-car-type'; document.getElementById('r-km-day').parentNode.appendChild(ctCarEl); } ctCarEl.value = carType;
  let priceRow = document.getElementById('price-per-type-row'); if(!priceRow){ priceRow = document.createElement('div'); priceRow.id = 'price-per-type-row'; document.getElementById('r-price').closest('.form-group').appendChild(priceRow); } priceRow.style.cssText = 'display:block;margin-top:0;border:1.5px solid '+color+';border-radius:10px;padding:12px 14px;background:rgba(0,0,0,.03)';
  let lockBtnHtml = `<button type="button" id="price-base-lock-btn" data-dr-action="lock-base-price" title="Verrouiller le prix" style="background:none;border:1.5px solid #d97706;color:#d97706;border-radius:6px;padding:4px 9px;cursor:pointer;font-size:.75rem;font-weight:700;margin-top:8px;display:flex;align-items:center;gap:4px">🔒 Confirm & Verrouiller</button>`;
  if(duration === 'daily'){
    priceRow.innerHTML = `<div style="font-size:.7rem;color:${color};font-weight:800;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">📅 DAILY — ${carLabel} <span style="font-size:.72rem;color:#22c55e;margin-left:6px;font-weight:700">25 OMR / day</span></div><div style="display:flex;align-items:center;gap:8px"><div><div style="font-size:.65rem;color:var(--muted);margin-bottom:3px">Price / day <span id="price-base-lock-icon"></span></div><input type="number" id="price-base-input" placeholder="Ex: 25" min="0" step="0.5" style="width:100px;background:#fff;border:1.5px solid ${color};border-radius:6px;padding:6px 10px;font-size:1.1rem;font-weight:800;color:${color};font-family:var(--mono);outline:none" oninput="computeSmartPrice()"/></div><div style="font-size:.8rem;color:var(--muted);padding-top:16px">OMR / day</div></div>${lockBtnHtml}<div id="price-preview" style="margin-top:8px;font-size:.78rem;color:var(--muted)"></div>`;
  } else if(duration === 'weekly'){
    priceRow.innerHTML = `<div style="font-size:.7rem;color:${color};font-weight:800;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">📆 WEEKLY — ${carLabel}</div><div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap"><div><div style="font-size:.65rem;color:var(--muted);margin-bottom:3px">Weekly price (7 days) <span id="price-base-lock-icon"></span></div><input type="number" id="price-base-input" placeholder="Ex: 50" min="0" step="1" style="width:110px;background:#fff;border:1.5px solid ${color};border-radius:6px;padding:6px 10px;font-size:1.1rem;font-weight:800;color:${color};font-family:var(--mono);outline:none" oninput="computeSmartPrice()"/></div><div style="font-size:1.2rem;color:var(--muted);padding-top:16px">→</div><div id="price-day-result" style="padding-top:12px"><div style="font-size:.65rem;color:var(--muted);margin-bottom:3px">Price / day (÷ 7)</div><div style="font-size:1.1rem;font-weight:800;color:#16a34a;font-family:var(--mono)" id="price-day-val">—</div></div></div>${lockBtnHtml}<div id="price-preview" style="margin-top:8px;font-size:.78rem;color:var(--muted)"></div>`;
  } else {
    priceRow.innerHTML = `<div style="font-size:.7rem;color:${color};font-weight:800;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">🗓️ MONTHLY — ${carLabel} <span style="font-size:.72rem;color:#22c55e;margin-left:6px;font-weight:700">180 OMR / month</span></div><div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap"><div><div style="font-size:.65rem;color:var(--muted);margin-bottom:3px">Monthly price (30 days) <span id="price-base-lock-icon"></span></div><input type="number" id="price-base-input" placeholder="180" min="0" step="1" style="width:120px;background:#fff;border:1.5px solid ${color};border-radius:6px;padding:6px 10px;font-size:1.1rem;font-weight:800;color:${color};font-family:var(--mono);outline:none" oninput="computeSmartPrice()"/></div><div style="font-size:1.2rem;color:var(--muted);padding-top:16px">→</div><div style="padding-top:12px"><div style="font-size:.65rem;color:var(--muted);margin-bottom:3px">Price / extra day (÷ 30)</div><div style="font-size:1.1rem;font-weight:800;color:#16a34a;font-family:var(--mono)" id="price-day-val">—</div></div></div>${lockBtnHtml}<div id="price-preview" style="margin-top:8px;font-size:.78rem;color:var(--muted)"></div>`;
  }
  setTimeout(()=>{ let el=document.getElementById('price-base-input'); if(el) el.focus(); }, 80);
}


// ── computeSmartPrice (orig. line 3770) ──
function computeSmartPrice(){
  let baseInput = document.getElementById('price-base-input'); if(!baseInput) return;
  // If price is locked, block typing
  if(window._priceDurationLocked){
    let prev = baseInput.getAttribute('data-locked-val') || '';
    baseInput.value = prev;
    toast(translate('rental.priceLockPassword'));
    return;
  }
  let baseVal = Number(baseInput.value) || 0;
  let duration = window._currentDuration;
  let priceEl = document.getElementById('r-price'); if(!priceEl) return;
  priceEl.readOnly = false; priceEl.style.cursor = 'text'; priceEl.style.opacity = '1';
  let bpEl = document.getElementById('r-base-price'); if(!bpEl){ bpEl = document.createElement('input'); bpEl.type = 'hidden'; bpEl.id = 'r-base-price'; document.getElementById('r-km-day').parentNode.appendChild(bpEl); } bpEl.value = baseVal;
  let dayPrice = 0, preview = '';
  if(duration === 'daily'){ dayPrice = baseVal; preview = baseVal > 0 ? `✅ ${baseVal} OMR / day` : ''; }
  else if(duration === 'weekly'){ dayPrice = baseVal > 0 ? Math.round((baseVal / 7) * 100) / 100 : 0; let dayValEl = document.getElementById('price-day-val'); if(dayValEl) dayValEl.textContent = dayPrice > 0 ? dayPrice + ' OMR' : '—'; preview = baseVal > 0 ? `✅ ${baseVal} OMR/week ÷ 7 = ${dayPrice} OMR/day` : ''; }
  else { dayPrice = baseVal > 0 ? Math.round((baseVal / 30) * 100) / 100 : 0; let dayValEl = document.getElementById('price-day-val'); if(dayValEl) dayValEl.textContent = dayPrice > 0 ? dayPrice + ' OMR' : '—'; preview = baseVal > 0 ? `✅ ${baseVal} OMR/month ÷ 30 = ${dayPrice} OMR/day` : ''; }
  priceEl.value = dayPrice > 0 ? dayPrice : ''; priceEl.style.borderColor = dayPrice > 0 ? 'var(--green)' : '';
  let prevEl = document.getElementById('price-preview'); if(prevEl) prevEl.textContent = preview;
  // Always sync the hidden r-price so saveRentalModal works without needing lockBasePrice
  let rPriceHid = document.getElementById('r-price'); if(rPriceHid && dayPrice > 0) rPriceHid.value = dayPrice;
}


// ── lockBasePrice (orig. line 3794) ──
function lockBasePrice(){
  let baseInput = document.getElementById('price-base-input'); if(!baseInput) return;
  let val = baseInput.value;
  if(!val || Number(val) <= 0){ toast(translate('rental.enterValidPrice')); return; }
  // Lock the input
  baseInput.setAttribute('data-locked-val', val);
  baseInput.readOnly = true;
  baseInput.style.cursor = 'not-allowed';
  baseInput.style.opacity = '.8';
  baseInput.style.background = '#f1f5f9';
  window._priceDurationLocked = true;
  // Update lock button → show unlock
  let btn = document.getElementById('price-base-lock-btn');
  if(btn){ btn.innerHTML = translate('rental.editBtn'); btn.style.borderColor='#7c3aed'; btn.style.color='#7c3aed'; btn.onclick = unlockBasePrice; }
  // Update icon
  let icon = document.getElementById('price-base-lock-icon');
  if(icon){ icon.innerHTML = ' <span style="color:#16a34a;font-size:.75rem">✅ Locked</span>'; }
  toast(translate('rental.priceLockedConfirm'));
  // Sync hidden r-price so saveRentalModal can always read it
  let rPrice = document.getElementById('r-price');
  if(rPrice) rPrice.value = getFormPrice();
}


// ══════════════════════════════════════════════════════════
// GENERIC UNLOCK FUNCTION — Replaces all 18 individual unlock functions
// ══════════════════════════════════════════════════════════
// ── genericUnlock (orig. line 3820) ──
function genericUnlock(config) {
  const { 
    fieldId,           // ID of element to unlock
    label,             // Label for messages (e.g., "Date In")
    iconId,            // ID of lock icon to update
    useDisabled,       // true if field uses .disabled, false if .readOnly
    groupId,           // ID of group container (for multi-element)
    multiSelector,     // querySelector for multiple elements within group
    styles             // { cursor, opacity, border, borderBottom, background }
  } = config;
  
  // Determine element(s) to unlock
  let elements = [];
  let groupEl = null;
  
  if(groupId && multiSelector) {
    // Multiple elements in a group
    groupEl = document.getElementById(groupId);
    if(!groupEl) return;
    elements = Array.from(groupEl.querySelectorAll(multiSelector));
  } else if(fieldId) {
    // Single element
    let el = document.getElementById(fieldId);
    if(!el) return;
    // Check if already unlocked
    if(useDisabled && !el.disabled) return;
    if(!useDisabled && !el.readOnly) return;
    elements = [el];
  }
  
  if(elements.length === 0) return;
  
  // Ask for password
  securePrompt(`🔒 Enter password to edit ${label}:`).then(pw => {
    if(pw === null) return; // cancelled
    checkPassword(pw, 'Daily Rentals — Unlock Field: ' + label).then(ok => {
    if(!ok) {
      toast(translate('rental.wrongPassword'));
      return;
    }
    
    // Apply unlock to all elements
    elements.forEach(el => {
      if(useDisabled) {
        el.disabled = false;
      } else {
        el.readOnly = false;
      }
      
      // Apply cursor
      el.style.cursor = styles?.cursor || 'text';
      
      // Apply opacity
      el.style.opacity = styles?.opacity || '1';
      
      // Apply custom styles
      if(styles?.border) el.style.borderColor = styles.border;
      if(styles?.borderBottom) el.style.borderBottom = styles.borderBottom;
      if(styles?.background) el.style.background = styles.background;
      
      // Focus first element
      if(el === elements[0]) el.focus();
    });
    
    // Update lock icon
    if(iconId) {
      let icon = document.getElementById(iconId);
      if(icon) {
        icon.textContent = '🔓 Unlocked';
        icon.style.color = '#f97316';
      }
    }
    
    // Update group state if applicable
    if(groupEl) {
      groupEl.setAttribute('data-locked', '0');
      groupEl.style.opacity = '1';
    }
    
    toast(`🔓 ${label} unlocked`);
    }); // end checkPassword
  }); // end securePrompt
}


// ── unlockBasePrice (orig. line 3902) ──
function unlockBasePrice(){
  // Show inline password row instead of prompt()
  let btn = document.getElementById('price-base-lock-btn');
  if(!btn) return;
  // Inject password row if not already there
  let existingPwRow = document.getElementById('price-base-pw-row');
  if(existingPwRow){ existingPwRow.style.display = 'flex'; existingPwRow.querySelector('input').focus(); return; }
  let pwRow = document.createElement('div');
  pwRow.id = 'price-base-pw-row';
  pwRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:6px;flex-wrap:wrap';
  pwRow.innerHTML = `<input type="password" id="price-base-pw-input" placeholder="Password…" autocomplete="one-time-code" data-lpignore="true" data-form-type="other" spellcheck="false" style="background:var(--s2);border:1px solid var(--border2);color:var(--text);padding:5px 8px;border-radius:5px;font-size:.8rem;width:140px" onkeydown="if(event.key==='Enter')confirmBasePricePassword()"><button type="button" data-dr-action="confirm-base-price-pwd" style="background:#7c3aed;color:#fff;border:none;border-radius:5px;padding:5px 10px;cursor:pointer;font-size:.8rem;font-weight:600">OK</button><button type="button" data-dr-action="cancel-base-price-unlock" style="background:none;border:1px solid var(--border2);color:var(--muted);border-radius:5px;padding:5px 8px;cursor:pointer;font-size:.8rem">✕</button>`;
  btn.parentNode.insertBefore(pwRow, btn.nextSibling);
  setTimeout(()=>{ let inp = document.getElementById('price-base-pw-input'); if(inp) inp.focus(); }, 50);
}


// ── confirmBasePricePassword (orig. line 3917) ──
function confirmBasePricePassword(){
  let inp = document.getElementById('price-base-pw-input');
  if(!inp) return;
  checkPassword(inp.value, 'Daily Rentals — Unlock Base Price').then(function(ok){
  if(ok){
    let baseInput = document.getElementById('price-base-input'); if(!baseInput) return;
    baseInput.readOnly = false;
    baseInput.style.cursor = 'text';
    baseInput.style.opacity = '1';
    baseInput.style.background = '#fff';
    window._priceDurationLocked = false;
    let btn = document.getElementById('price-base-lock-btn');
    if(btn){ btn.innerHTML = translate('rental.priceLockBtn'); btn.style.borderColor='#d97706'; btn.style.color='#d97706'; btn.onclick = lockBasePrice; }
    let icon = document.getElementById('price-base-lock-icon');
    if(icon){ icon.innerHTML = ' <span style="color:#f97316;font-size:.75rem">🔓 Unlocked</span>'; }
    let pwRow = document.getElementById('price-base-pw-row');
    if(pwRow) pwRow.style.display = 'none';
    baseInput.focus();
    toast(translate('rental.priceUnlock'));
  } else {
    toast(translate('rental.wrongPassword'));
    let inp2 = document.getElementById('price-base-pw-input');
    if(inp2){ inp2.value=''; inp2.focus(); }
  }
  }); // end checkPassword
}


// ── cancelBasePriceUnlock (orig. line 3942) ──
function cancelBasePriceUnlock(){
  let pwRow = document.getElementById('price-base-pw-row');
  if(pwRow) pwRow.style.display = 'none';
}


// ── autoFillDateIn (orig. line 3947) ──
function autoFillDateIn(kmVal){
  let km = Number(kmVal);
  let dateInEl = document.getElementById('r-in');
  if(!dateInEl) return;
  // dateInEl.readOnly === true  → champ en mode "auto-géré" (pas déverrouillé manuellement par mot de passe)
  // → on peut le remplir OU le vider automatiquement selon le KM In.
  // dateInEl.readOnly === false → l'utilisateur l'a déverrouillé lui-même (unlockDateInField, mot de passe) :
  // on ne touche plus jamais à ce champ ici, sa valeur est volontaire.
  if(!dateInEl.readOnly) return;
  if(km > 0){
    let now = new Date(); let pad = n => String(n).padStart(2,'0');
    let dateStr = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    dateInEl.value = dateStr;
    dateInEl.style.borderColor = '#22c55e';
    dateInEl.style.background = 'rgba(34,197,94,.08)';
  } else {
    // KM In effacé/vidé → on retire aussi la Date In auto-remplie, pour ne jamais
    // laisser un contrat "Closed" (Date In présente) sans KM In.
    dateInEl.value = '';
    dateInEl.style.borderColor = '';
    dateInEl.style.background = '';
  }
}

// ── unlockDateInField (orig. line 3948) ──
function unlockDateInField(){
  genericUnlock({ fieldId: 'r-in', label: 'Date In', iconId: 'datein-lock-icon', useDisabled: false, styles: { cursor: 'text', opacity: '1', border: '#f97316', background: 'rgba(249,115,22,.06)' } });
}

// ── unlockKmInField (orig. line 3951) ──
function unlockKmInField(){
  genericUnlock({ fieldId: 'r-km-in', label: 'KM In', iconId: 'kmin-lock-icon', useDisabled: false, styles: { cursor: 'text', opacity: '1', borderBottom: '2px solid #f97316' } });
}

// ── lockKmInField (orig. line 3954) ──
function lockKmInField(){ let el = document.getElementById('r-km-in'); if(!el) return; el.readOnly = true; el.style.cursor = 'not-allowed'; el.style.opacity = '.7'; el.style.borderBottom = ''; let icon = document.getElementById('kmin-lock-icon'); if(icon) icon.innerHTML = translate('rental.lockedOnceSet'); }


// ── unlockFuelInField (orig. line 3956) ──
function unlockFuelInField(){
  genericUnlock({ fieldId: 'r-fuel-in', label: 'Fuel In', iconId: 'fuelin-lock-icon', useDisabled: true, styles: { cursor: '', opacity: '1', border: '#f97316' } });
}

// ── lockFuelInField (orig. line 3959) ──
function lockFuelInField(){ let el = document.getElementById('r-fuel-in'); if(!el) return; if(el.value === '' || el.value === null) return; el.disabled = true; el.style.cursor = 'not-allowed'; el.style.opacity = '.7'; let icon = document.getElementById('fuelin-lock-icon'); if(icon) icon.innerHTML = translate('rental.lockedOnceSet'); }


// ── unlockCleanAfterField (orig. line 3961) ──
function unlockCleanAfterField(ev){
  if(ev){ ev.preventDefault(); ev.stopPropagation(); }
  genericUnlock({ groupId: 'clean-after-group', multiSelector: 'input[name="clean-after"]', label: 'Condition After', iconId: 'cleanafter-lock-icon', useDisabled: true });
}

// ── lockCleanAfterField (orig. line 3965) ──
function lockCleanAfterField(){
  let group = document.getElementById('clean-after-group');
  let checked = document.querySelector('input[name="clean-after"]:checked');
  if(!group || !checked) return;
  document.querySelectorAll('input[name="clean-after"]').forEach(el=>{ el.disabled = true; });
  group.setAttribute('data-locked','1');
  group.style.opacity = '.7';
  let icon = document.getElementById('cleanafter-lock-icon'); if(icon) icon.innerHTML = translate('rental.lockedOnceSet');
}


// ── autoLockClientId (orig. line 3975) ──
function autoLockClientId(){
  let el = document.getElementById('r-client-id');
  if(!el) return;
  
  // Si le champ a une valeur, le verrouiller
  if(el.value && el.value.trim()){
    el.readOnly = true;
    el.style.cursor = 'not-allowed';
    el.style.opacity = '.7';
    el.style.borderColor = '#16a34a';
    el.title = '🔒 ID Card locked once filled';
  } else {
    // Si vide, le déverrouiller
    el.readOnly = false;
    el.style.cursor = 'text';
    el.style.opacity = '1';
    el.title = '';
  }
}


// ── clientIdLookup (orig. line 3995) ──
function clientIdLookup(val){
  let statusEl = document.getElementById('r-client-status');
  if(!statusEl) return;
  
  if(!val || !val.trim()){
    window._currentRentalClientId = null;
    statusEl.innerHTML = translate('rental.noClient');
    statusEl.style.background = 'var(--s2)';
    statusEl.style.border = '1px solid var(--border)';
    statusEl.style.color = 'var(--muted)';
    return;
  }
  
  let found = (DB.clients||[]).find(c => (c.idcard||'').toLowerCase() === val.trim().toLowerCase());
  
  if(found){
    window._currentRentalClientId = found.id;
    
    // Load closed contracts for carry-forward credit option
    loadClientContractsForCarryForward(found.id);

    // ── Client blacklisté : alerte rouge ──
    if(found.blacklisted){
      window._currentRentalClientId = null; // bloque l'enregistrement
      statusEl.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-weight:800;color:#dc2626">🚫 BLACKLISTÉ — ${escapeHtml(found.firstname) || 'Client'}</span>
          ${found.blacklistReason ? `<span style="font-size:.7rem;color:#dc2626;font-weight:600">(${escapeHtml(found.blacklistReason)})</span>` : ''}
          <button type="button" data-dr-action="view-client" data-dr-id="${found.id}"
            style="background:rgba(220,38,38,.12);border:1px solid #dc2626;border-radius:5px;padding:2px 8px;color:#dc2626;cursor:pointer;font-size:.75rem;font-weight:600;font-family:var(--font)">
            👁️ View
          </button>
        </div>
      `;
      statusEl.style.background = 'rgba(220,38,38,.1)';
      statusEl.style.border = '1px solid rgba(220,38,38,.5)';
      statusEl.style.color = '#dc2626';
      return;
    }

    // ── ID Card et/ou Licence expirée : avertissement visuel (n'empêche PAS la location,
    // contrairement au blacklist ci-dessus — Lamis doit juste être alerté avant de continuer) ──
    let _todayStr = new Date().toISOString().slice(0,10);
    let _idExpired  = !!(found.idcardExp  && found.idcardExp  < _todayStr);
    let _licExpired = !!(found.licenceExp && found.licenceExp < _todayStr);

    if(_idExpired || _licExpired){
      let _expParts = [];
      if(_idExpired)  _expParts.push(`🪪 ID Card exp. ${found.idcardExp.split('-').reverse().join('/')}`);
      if(_licExpired) _expParts.push(`📜 Licence exp. ${found.licenceExp.split('-').reverse().join('/')}`);

      statusEl.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-weight:800;color:#f59e0b">⚠️ EXPIRED — ${escapeHtml(found.firstname || found.name) || 'Client'}</span>
          <span style="font-size:.7rem;color:#f59e0b;font-weight:700">(${_expParts.join(' · ')})</span>
          <button type="button" data-dr-action="view-client" data-dr-id="${found.id}"
            style="background:rgba(245,158,11,.12);border:1px solid #f59e0b;border-radius:5px;padding:2px 8px;color:#f59e0b;cursor:pointer;font-size:.75rem;font-weight:600;font-family:var(--font)">
            👁️ View
          </button>
        </div>
      `;
      statusEl.style.background = 'rgba(245,158,11,.1)';
      statusEl.style.border = '1px solid rgba(245,158,11,.5)';
      statusEl.style.color = '#f59e0b';

      let _telElExp = document.getElementById('r-tel');
      if(_telElExp && !_telElExp.value && found.tel) _telElExp.value = found.tel;

      return;
    }

    statusEl.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span style="font-weight:700;color:#16a34a">✅ ${escapeHtml(found.firstname || found.name) || 'Client'}</span>
        <button type="button" data-dr-action="view-client" data-dr-id="${found.id}" 
          style="background:rgba(37,99,235,.12);border:1px solid #2563eb;border-radius:5px;padding:2px 8px;color:#2563eb;cursor:pointer;font-size:.75rem;font-weight:600;font-family:var(--font)">
          👁️ View
        </button>
      </div>
    `;
    statusEl.style.background = 'rgba(22,163,74,.1)';
    statusEl.style.border = '1px solid rgba(22,163,74,.4)';
    statusEl.style.color = '#16a34a';
    
    let telEl = document.getElementById('r-tel'); 
    if(telEl && !telEl.value && found.tel) telEl.value = found.tel;
    
  } else {
    window._currentRentalClientId = null;
    
    statusEl.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span style="color:#ef4444;font-weight:600">⚠️ Not found</span>
        <button type="button" data-dr-action="quick-add-client" data-dr-value="${escapeHtml(val.trim())}" 
          style="background:rgba(22,163,74,.12);border:1px solid #16a34a;border-radius:5px;padding:2px 10px;color:#16a34a;cursor:pointer;font-size:.75rem;font-weight:700;font-family:var(--font)">
          ➕ Add
        </button>
      </div>
    `;
    statusEl.style.background = 'rgba(239,68,68,.08)';
    statusEl.style.border = '1px solid rgba(239,68,68,.3)';
    statusEl.style.color = '#ef4444';
  }
}

// ── goToClientProfile (orig. line 4065) ──
function goToClientProfile(clientId){
  // Ferme le modal New Rental
  let rentalOverlay = document.getElementById('rental-overlay');
  if(rentalOverlay) rentalOverlay.classList.remove('show');
  // Navigate vers page Clients
  let navBtn = [...document.querySelectorAll('.nav-item')].find(b => b.textContent.includes('Clients'));
  goTo('clients', navBtn || null);
  // Ouvre le profil client après un court délai (le temps que la page s'affiche)
  setTimeout(()=>{ viewClientDetail(clientId); }, 120);
}

// ── viewClientDetail (orig. line 4075) ──
function viewClientDetail(clientId){
  let client = (DB.clients||[]).find(c => c.id === clientId);
  if(!client){ toast(translate('rental.clientNotFound')); return; }

  // ── Widen modal for client stats view ──
  let modalInner = document.getElementById('modal-bal-detail-inner');
  let modalHeader = document.getElementById('modal-bal-detail-header');
  let modalTitle  = document.getElementById('modal-bal-detail-title');
  if(modalInner) modalInner.style.maxWidth = '780px';
  if(modalHeader) modalHeader.style.background = 'linear-gradient(135deg,#312e81,#4338ca)';
  if(modalTitle)  modalTitle.textContent = translate('rental.clientProfile');

  // ── Gather all rentals for this client ──
  let clientRentals = (DB.rentals||[])
    .filter(r => r._clientId === clientId && r.dateOut)
    .sort((a,b) => new Date(b.dateOut) - new Date(a.dateOut));

  // ── Stats calculation ──
  let totalContracts = clientRentals.length;
  let totalPaid = clientRentals.reduce((s,r) => s + Number(r.paid||0), 0);
  let totalBAL  = clientRentals.reduce((s,r) => {
    let b;
    if(r._balManual){
      b = (r.bal !== undefined && r.bal !== null) ? Number(r.bal) : 0;
    } else {
      b = (!r.dateIn || r.dateIn === '') ? calcOpenContractBAL(r) : calcRentalBAL(r);
      if(b === null) b = (r.bal !== undefined && r.bal !== null) ? Number(r.bal) : Number((r.price||0) - (r.paid||0));
    }
    return s + Number(b);
  }, 0);
  let totalDays = clientRentals.reduce((s,r) => {
    if(!r.dateOut) return s;
    let out = new Date(r.dateOut), inn = r.dateIn ? new Date(r.dateIn) : new Date();
    let d = Math.ceil((inn - out) / 86400000);
    return s + (d > 0 ? d : 1);
  }, 0);
  let totalKm = clientRentals.reduce((s,r) => {
    let km = (r.kmIn && r.kmOut && r.kmIn > r.kmOut) ? r.kmIn - r.kmOut : 0;
    return s + km;
  }, 0);

  // Favourite vehicle (most used plate)
  let plateCount = {};
  clientRentals.forEach(r => {
    let v = r.vehicleId ? (DB.vehicles||[]).find(x=>x.id===r.vehicleId)||{} : {};
    let p = v.plate || r._plate || '';
    if(p) plateCount[p] = (plateCount[p]||0) + 1;
  });
  let favPlate = Object.keys(plateCount).sort((a,b)=>plateCount[b]-plateCount[a])[0] || null;
  let favName  = favPlate ? (getVehicleNameByPlate(favPlate) || favPlate) : '—';

  let lastRental = clientRentals[0];
  let isCurrentlyOut = clientRentals.some(r => r.dateOut && !r.dateIn);

  let today = new Date().toISOString().slice(0,10);
  let fmtDate = dt => { if(!dt) return '—'; let d=new Date(dt); return String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear(); };
  let fmtNum2 = n => Number(n).toFixed(3);

  // ── Contract rows ──
  let contractRows = clientRentals.map(r => {
    let v = r.vehicleId ? (DB.vehicles||[]).find(x=>x.id===r.vehicleId)||{} : {};
    let plate = v.plate || r._plate || '—';
    let vname = getVehicleNameByPlate(plate) || v.name || '—';
    let bal;
    if(r._balManual){
      bal = (r.bal !== undefined && r.bal !== null) ? Number(r.bal) : 0;
    } else {
      bal = (!r.dateIn || r.dateIn === '') ? calcOpenContractBAL(r) : calcRentalBAL(r);
      if(bal === null) bal = (r.bal !== undefined && r.bal !== null) ? Number(r.bal) : Number((r.price||0) - (r.paid||0));
    }
    let balNum = Number(bal);
    let balColor = balNum > 0 ? '#f59e0b' : (balNum < 0 ? '#22c55e' : '#22c55e');
    let balLabel = balNum > 0 ? `⚠️ BAL ${fmtNum2(balNum)} OMR` : (balNum < 0 ? `↩️ ${fmtNum2(Math.abs(balNum))} OMR` : '✅ Paid');
    let status = r.dateIn ? '<span style="color:#22c55e;font-weight:700">✅ Closed</span>' : '<span style="color:#f59e0b;font-weight:700;animation:blink 1.2s infinite">🔓 OUT</span>';
    let km = (r.kmIn && r.kmOut && r.kmIn > r.kmOut) ? '+'+Math.round(r.kmIn - r.kmOut)+' km' : '—';
    return `<tr style="border-bottom:1px solid var(--border);font-size:.78rem">
      <td style="padding:7px 10px;font-family:var(--mono);font-weight:700;color:#2563eb">${r.contract||'—'}</td>
      <td style="padding:7px 10px">
        <span style="font-family:var(--mono);font-size:.75rem;background:var(--s2);border:1px solid var(--border);border-radius:5px;padding:2px 6px">${plate}</span>
        <div style="font-size:.68rem;color:var(--muted);margin-top:2px">${vname}</div>
      </td>
      <td style="padding:7px 10px;color:var(--muted)">${fmtDate(r.dateOut)} → ${r.dateIn ? fmtDate(r.dateIn) : '<span style="color:#f59e0b">OUT</span>'}</td>
      <td style="padding:7px 10px;font-family:var(--mono);font-weight:700;color:var(--green)">${fmtNum2(r.paid||0)} OMR</td>
      <td style="padding:7px 10px;font-family:var(--mono);font-size:.72rem;color:${balColor}">${balLabel}</td>
      <td style="padding:7px 10px;font-family:var(--mono);color:var(--muted)">${km}</td>
      <td style="padding:7px 10px">${status}</td>
    </tr>`;
  }).join('');

  let html = `
    <div style="font-family:var(--font)">

      <!-- ── Header card ── -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
        <div style="background:linear-gradient(135deg,#1e3a5f,#1e40af);border-radius:10px;padding:14px 16px">
          <div style="font-size:.6rem;text-transform:uppercase;letter-spacing:1px;color:#93c5fd;font-weight:700">👨‍👩‍👧‍👦 Name</div>
          <div style="font-weight:800;font-size:1.1rem;color:#fff">${escapeHtml(client.firstname) || '—'}</div>
          ${isCurrentlyOut ? '<div style="margin-top:6px"><span style="background:#f59e0b;color:#000;border-radius:20px;padding:2px 10px;font-size:.65rem;font-weight:800">🔓 CURRENTLY OUT</span></div>' : ''}
        </div>
        <div style="background:linear-gradient(135deg,#14532d,#166534);border-radius:10px;padding:14px 16px">
          <div style="font-size:.6rem;text-transform:uppercase;letter-spacing:1px;color:#86efac;font-weight:700">📞 Tel</div>
          <div style="font-weight:800;font-size:1.1rem;color:#fff">${escapeHtml(client.tel) || '—'}</div>
          <div style="font-size:.68rem;color:#86efac;margin-top:4px">${escapeHtml(client.nationality) || ''}</div>
        </div>
      </div>

      <!-- ── ID / Licence ── -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
        <div style="background:var(--s2);border-radius:8px;padding:10px 12px">
          <div style="font-size:.6rem;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);margin-bottom:4px">🪪 ID Card</div>
          <div style="font-family:var(--mono);font-weight:700;font-size:.85rem">${escapeHtml(client.idcard) || '—'}</div>
          <div style="font-size:.65rem;color:${client.idcardExp && client.idcardExp < today ? '#ef4444' : 'var(--muted)'}">Exp: ${client.idcardExp ? client.idcardExp.split('-').reverse().join('/') : '—'}</div>
        </div>
        <div style="background:var(--s2);border-radius:8px;padding:10px 12px">
          <div style="font-size:.6rem;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);margin-bottom:4px">📜 Licence</div>
          <div style="font-family:var(--mono);font-weight:700;font-size:.85rem">${escapeHtml(client.licence) || '—'}</div>
          <div style="font-size:.65rem;color:${client.licenceExp && client.licenceExp < today ? '#ef4444' : 'var(--muted)'}">Exp: ${client.licenceExp ? client.licenceExp.split('-').reverse().join('/') : '—'}</div>
        </div>
      </div>

      <!-- ── Stats cards ── -->
      <div style="background:linear-gradient(135deg,rgba(99,102,241,.1),rgba(139,92,246,.06));border:1.5px solid rgba(99,102,241,.25);border-radius:12px;padding:14px 16px;margin-bottom:14px">
        <div style="font-size:.68rem;font-weight:800;text-transform:uppercase;letter-spacing:.8px;color:#818cf8;margin-bottom:12px">📊 Client Statistics</div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
          <div style="text-align:center">
            <div style="font-size:1.6rem;font-weight:900;color:#6366f1">${totalContracts}</div>
            <div style="font-size:.62rem;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Contracts</div>
          </div>
          <div style="text-align:center">
            <div style="font-size:1.6rem;font-weight:900;color:#22c55e">${fmtNum2(totalPaid)}</div>
            <div style="font-size:.62rem;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">OMR Paid</div>
          </div>
          <div style="text-align:center">
            <div style="font-size:1.6rem;font-weight:900;color:${totalBAL > 0 ? '#f59e0b' : '#22c55e'}">${fmtNum2(Math.abs(totalBAL))}</div>
            <div style="font-size:.62rem;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">${totalBAL > 0 ? 'OMR BAL due' : totalBAL < 0 ? 'OMR Credit' : 'BAL Clear'}</div>
          </div>
          <div style="text-align:center">
            <div style="font-size:1.6rem;font-weight:900;color:#38bdf8">${totalDays}</div>
            <div style="font-size:.62rem;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Days Rented</div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px;padding-top:10px;border-top:1px solid rgba(99,102,241,.2)">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:.65rem;color:var(--muted)">🚗 Favourite:</span>
            <span style="font-family:var(--mono);font-weight:700;font-size:.78rem;color:var(--text)">${favName}</span>
            ${favPlate ? `<span style="font-size:.65rem;color:var(--muted)">(${favPlate})</span>` : ''}
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:.65rem;color:var(--muted)">📅 Last rental:</span>
            <span style="font-family:var(--mono);font-weight:700;font-size:.78rem;color:var(--text)">${lastRental ? fmtDate(lastRental.dateOut) : '—'}</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:.65rem;color:var(--muted)">🛣 Total KM:</span>
            <span style="font-family:var(--mono);font-weight:700;font-size:.78rem;color:var(--text)">${totalKm > 0 ? Math.round(totalKm).toLocaleString()+' km' : '—'}</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:.65rem;color:var(--muted)">💰 Avg/contract:</span>
            <span style="font-family:var(--mono);font-weight:700;font-size:.78rem;color:var(--text)">${totalContracts > 0 ? fmtNum2(totalPaid/totalContracts)+' OMR' : '—'}</span>
          </div>
        </div>
      </div>

      <!-- ── Contract history ── -->
      ${totalContracts > 0 ? `
      <div style="border:1px solid var(--border);border-radius:10px;overflow:hidden">
        <div style="background:linear-gradient(135deg,rgba(245,158,11,.08),transparent);padding:10px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
          <span style="font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:var(--muted)">📋 ${translate('rental.contractHistory')}</span>
          <span style="font-size:.7rem;color:var(--muted)">${totalContracts} contract${totalContracts>1?'s':''}</span>
        </div>
        <div style="max-height:220px;overflow-y:auto">
          <table style="width:100%;border-collapse:collapse">
            <thead>
              <tr style="background:var(--s2)">
                <th style="padding:6px 10px;font-size:.65rem;font-weight:700;text-transform:uppercase;color:var(--muted);text-align:left">Contract</th>
                <th style="padding:6px 10px;font-size:.65rem;font-weight:700;text-transform:uppercase;color:var(--muted);text-align:left">Vehicle</th>
                <th style="padding:6px 10px;font-size:.65rem;font-weight:700;text-transform:uppercase;color:var(--muted);text-align:left">Period</th>
                <th style="padding:6px 10px;font-size:.65rem;font-weight:700;text-transform:uppercase;color:var(--muted);text-align:left">Paid</th>
                <th style="padding:6px 10px;font-size:.65rem;font-weight:700;text-transform:uppercase;color:var(--muted);text-align:left">BAL</th>
                <th style="padding:6px 10px;font-size:.65rem;font-weight:700;text-transform:uppercase;color:var(--muted);text-align:left">KM</th>
                <th style="padding:6px 10px;font-size:.65rem;font-weight:700;text-transform:uppercase;color:var(--muted);text-align:left">Status</th>
              </tr>
            </thead>
            <tbody>${contractRows}</tbody>
          </table>
        </div>
      </div>` : '<div style="text-align:center;padding:20px;color:var(--muted);font-size:.85rem">No contracts recorded for this client</div>'}

    </div>
  `;

  document.getElementById('bal-detail-content').innerHTML = html;
  openModal('modal-bal-detail');
  translateBalModal();
}


// ── viewClientScan (orig. line 4269) ──
function viewClientScan(b64, label){
  let win = window.open('', '_blank', 'width=600,height=700');
  win.document.write(`
    <html><head><title>${label} Scan</title>
    <style>body{margin:0;display:flex;align-items:center;justify-content:center;background:#0f172a;height:100vh}img{max-width:95vw;max-height:95vh;border-radius:8px;box-shadow:0 4px 24px rgba(0,0,0,.5)}</style>
    </head><body><img src="${b64}" alt="${label}"></body></html>
  `);
  win.document.close();
}


// ── quickAddClientFromRental (orig. line 4279) ──
function quickAddClientFromRental(idcard){
  openClientModal();
  document.getElementById('cl-idcard').value = idcard;
  document.getElementById('cl-idcard').focus();
  document.getElementById('client-modal-title').textContent = '➕ New Client / عميل جديد (ID: ' + idcard + ')';
}


// ── lockContractField (orig. line 4285) ──
function lockContractField(){

  let el = document.getElementById('r-contract');
  if(!el) return;
  el.readOnly = true;
  el.style.cursor = 'not-allowed';
  el.style.opacity = '.85';
  el.style.background = 'var(--s2)';
  el.title = translate('rental.autoGenerated');
  let icon = document.getElementById('contract-lock-icon');
  if(icon){ icon.innerHTML = '🔒 Locked'; icon.style.color = '#7c3aed'; }
}

// ── unlockContractField (orig. line 4297) ──
function unlockContractField(){
  genericUnlock({ fieldId: 'r-contract', label: 'Contract N°', iconId: 'contract-lock-icon', useDisabled: false, styles: { cursor: 'text', opacity: '1', border: '#f97316' } });
}


// ── unlockAllNewRentalFields (orig. line 4301) ──
function unlockAllNewRentalFields(){
  securePrompt('🔐 Enter password to unlock all fields:').then(function(pw){
    if(pw === null) return;
    checkPassword(pw, 'Daily Rentals — Unlock All Fields').then(function(ok){
    if(!ok){ toast(translate('rental.wrongPassword')); return; }
    
    // ═══ DEPARTURE (OUT) SECTION ═══
    // 1. Plate Number
    let plateEl = document.getElementById('r-plate');
    if(plateEl){ plateEl.readOnly=false; plateEl.style.cursor='text'; plateEl.style.opacity='1'; }
    
    // 2. TEL
    let telEl = document.getElementById('r-tel');
    if(telEl){ telEl.readOnly=false; telEl.style.cursor='text'; telEl.style.opacity='1'; }
    
    // 3. Car Type (Sedan/4x4) - enable buttons
    let smallBtn = document.getElementById('car-type-small');
    let btn4x4 = document.getElementById('car-type-4x4');
    if(smallBtn){ smallBtn.disabled=false; smallBtn.style.cursor='pointer'; smallBtn.style.opacity='1'; }
    if(btn4x4){ btn4x4.disabled=false; btn4x4.style.cursor='pointer'; btn4x4.style.opacity='1'; }
    
    // 4. Price/Day (base input)
    let priceBaseInput = document.getElementById('price-base-input');
    if(priceBaseInput){ priceBaseInput.readOnly=false; priceBaseInput.style.opacity='1'; priceBaseInput.style.cursor='text'; }
    let priceEl = document.getElementById('r-price');
    if(priceEl){ priceEl.readOnly=false; priceEl.style.cursor='text'; priceEl.style.opacity='1'; }
    
    // 5. Date Out
    let dateOutEl = document.getElementById('r-out');
    if(dateOutEl){ dateOutEl.readOnly=false; dateOutEl.style.cursor='text'; dateOutEl.style.opacity='1'; }
    window._rOutDateLockDisabled = true; // lève le verrou "date = aujourd'hui" pour ce contrat

    // 5bis. Payment Date (r-paid-date) — FIX (2026-08) : même verrou levé que Date Out
    let paidDateUnlockEl = document.getElementById('r-paid-date');
    if(paidDateUnlockEl){ paidDateUnlockEl.readOnly=false; paidDateUnlockEl.style.cursor='text'; paidDateUnlockEl.style.opacity='1'; }
    window._rPaidDateLockDisabled = true; // lève le verrou "date = aujourd'hui" pour ce contrat
    
    // 6. KM Out
    let kmOutEl = document.getElementById('r-km-out');
    if(kmOutEl){ kmOutEl.readOnly=false; kmOutEl.style.cursor='text'; kmOutEl.style.opacity='1'; }
    
    // 7. Fuel Out
    let fuelOutEl = document.getElementById('r-fuel-out');
    if(fuelOutEl){ fuelOutEl.disabled=false; fuelOutEl.style.cursor=''; fuelOutEl.style.opacity='1'; }
    
    // 8. Condition BEFORE - enable radios
    let cleanBeforeRadios = document.querySelectorAll('input[name="clean-before"]');
    cleanBeforeRadios.forEach(el => { el.disabled=false; });
    
    // 9. Condition AFTER - enable radios & group
    let cleanAfterGroup = document.getElementById('clean-after-group');
    if(cleanAfterGroup){ cleanAfterGroup.setAttribute('data-locked','0'); cleanAfterGroup.style.opacity='1'; }
    let cleanAfterRadios = document.querySelectorAll('input[name="clean-after"]');
    cleanAfterRadios.forEach(el => { el.disabled=false; });
    
    // ═══ RETURN (IN) SECTION ═══
    // 10. Contract N°
    let contractEl = document.getElementById('r-contract');
    if(contractEl){ contractEl.readOnly=false; contractEl.style.cursor='text'; contractEl.style.opacity='1'; }
    
    // 11. Date In
    let dateInEl = document.getElementById('r-in');
    if(dateInEl){ dateInEl.readOnly=false; dateInEl.style.cursor='text'; dateInEl.style.opacity='1'; dateInEl.style.borderColor='#f97316'; }
    
    // 12. KM In
    let kmInEl = document.getElementById('r-km-in');
    if(kmInEl){ kmInEl.readOnly=false; kmInEl.style.cursor='text'; kmInEl.style.opacity='1'; kmInEl.style.borderBottom='2px solid #f97316'; }
    
    // 13. Fuel In
    let fuelInEl = document.getElementById('r-fuel-in');
    if(fuelInEl){ fuelInEl.disabled=false; fuelInEl.style.cursor=''; fuelInEl.style.opacity='1'; fuelInEl.style.borderColor='#f97316'; }
    
    // 14. BAL
    let balEl = document.getElementById('r-bal');
    if(balEl){ balEl.readOnly=false; balEl.style.cursor='text'; balEl.style.opacity='1'; }
    
    // Update button text
    let btn = document.getElementById('unlock-all-btn');
    if(btn){ btn.textContent='🔓 All Unlocked'; btn.style.borderColor='#4ade80'; btn.style.color='#4ade80'; btn.style.background='rgba(74,222,128,.12)'; }
    
    window._allFieldsUnlocked = true;
    document.getElementById('modal-rental').setAttribute('data-type-locked','0');
    window._priceDurationLocked = false;
    
    toast(translate('rental.allFieldsUnlocked'));
    }); // end checkPassword
  }); // end securePrompt
}


// ── unlockAllWithPassword (orig. line 4382) ──
function unlockAllWithPassword(){
  // Deprecated - now uses unlockAllNewRentalFields()
  unlockAllNewRentalFields();
}


// ── unlockBalField (orig. line 4387) ──
function unlockBalField(){ let balEl = document.getElementById('r-bal'); if(!balEl.readOnly) return; let pwRow = document.getElementById('bal-pw-row'); if(pwRow) { pwRow.style.display='flex'; pwRow.style.alignItems='center'; pwRow.style.flexWrap='wrap'; pwRow.style.gap='4px'; } let pwIn = document.getElementById('bal-pw-input'); if(pwIn){ pwIn.value=''; setTimeout(()=>pwIn.focus(),50); } }

// ── confirmBalPassword (orig. line 4388) ──
function confirmBalPassword(){ let pwIn = document.getElementById('bal-pw-input'); if(!pwIn) return; checkPassword(pwIn.value, 'Daily Rentals — Unlock BAL').then(function(ok){ if(ok){ let balEl = document.getElementById('r-bal'); balEl.readOnly = false; balEl.style.cursor = 'text'; balEl.style.opacity = '1'; let lockIcon = document.getElementById('bal-lock-icon'); if(lockIcon) lockIcon.innerHTML = '🔓 Unlocked'; let pwRow = document.getElementById('bal-pw-row'); if(pwRow) pwRow.style.display = 'none'; balEl.focus(); toast(translate('rental.balUnlocked')); } else { toast(translate('rental.wrongPassword')); pwIn.value=''; pwIn.focus(); } }); }

// ── cancelBalUnlock (orig. line 4389) ──
function cancelBalUnlock(){ let pwRow = document.getElementById('bal-pw-row'); if(pwRow) pwRow.style.display='none'; }

// ── lockBalField (orig. line 4390) ──
function lockBalField(){ let balEl = document.getElementById('r-bal'); if(balEl){ balEl.readOnly=true; balEl.style.cursor='not-allowed'; balEl.style.opacity='.7'; } let lockIcon = document.getElementById('bal-lock-icon'); if(lockIcon) lockIcon.innerHTML = translate('rental.passwordRequiredEdit'); let pwRow = document.getElementById('bal-pw-row'); if(pwRow) pwRow.style.display='none'; }

// ── unlockPriceField (orig. line 4391) ──
function unlockPriceField(){ let el = document.getElementById('r-price'); if(!el || !el.readOnly) return; let pwRow = document.getElementById('price-pw-row'); if(pwRow){ pwRow.style.display='flex'; } let pwIn = document.getElementById('price-pw-input'); if(pwIn){ pwIn.value=''; setTimeout(()=>pwIn.focus(),50); } }

// ── confirmPricePassword (orig. line 4392) ──
function confirmPricePassword(){ let pwIn = document.getElementById('price-pw-input'); if(!pwIn) return; checkPassword(pwIn.value, 'Daily Rentals — Unlock Price/Day').then(function(ok){ if(ok){ let el = document.getElementById('r-price'); el.readOnly = false; el.style.cursor='text'; el.style.opacity='1'; let lockIcon = document.getElementById('price-lock-icon'); if(lockIcon) lockIcon.innerHTML = '🔓 Unlocked'; let pwRow = document.getElementById('price-pw-row'); if(pwRow) pwRow.style.display='none'; // Also unlock base price input if present
  let bpInp = document.getElementById('price-base-input'); if(bpInp){ bpInp.readOnly=false; bpInp.style.opacity='1'; bpInp.style.cursor='text'; } let bpIcon = document.getElementById('price-base-lock-icon'); if(bpIcon) bpIcon.innerHTML='🔓'; el.focus(); toast(translate('rental.priceDayUnlocked')); } else { toast(translate('rental.wrongPassword')); pwIn.value=''; pwIn.focus(); } }); }

// ── cancelPriceUnlock (orig. line 4394) ──
function cancelPriceUnlock(){ let pwRow = document.getElementById('price-pw-row'); if(pwRow) pwRow.style.display='none'; }

// ── lockPriceField (orig. line 4395) ──
function lockPriceField(){ let el = document.getElementById('r-price'); if(el){ el.readOnly=true; el.style.cursor='not-allowed'; el.style.opacity='.7'; } let lockIcon = document.getElementById('price-lock-icon'); if(lockIcon) lockIcon.innerHTML = translate('rental.passwordRequired'); let pwRow = document.getElementById('price-pw-row'); if(pwRow) pwRow.style.display='none'; }


// ── Helper: lire le prix depuis price-base-input (priorité) ou r-price ──
// ── getFormPrice (orig. line 4398) ──
function getFormPrice(){
  let baseInp = document.getElementById('price-base-input');
  if(baseInp && baseInp.value !== ''){
    // Calculer le prix/day selon la durée selectede
    let dur = window._currentDuration || 'daily';
    let val = Number(baseInp.value) || 0;
    if(dur === 'weekly') return val > 0 ? Math.round((val/7)*100)/100 : 0;
    if(dur === 'monthly') return val > 0 ? Math.round((val/30)*100)/100 : 0;
    return val;
  }
  return Number(document.getElementById('r-price').value) || 0;
}

// ────────────────────────────────────────────────────────────────
async function saveRentalModal(){
  let plate=document.getElementById('r-plate').value.trim();
  let vname=document.getElementById('r-vname').value.trim();
  let contract=document.getElementById('r-contract').value.trim();
  if(!plate || !contract){ toast(translate('rental.plateAndContractRequired')); return; }

  // ── VALIDATION OBLIGATOIRE : Type véhicule + Durée + Prix > 0 ─────────────
  // Empêche d'enregistrer un contrat sans avoir choisi Sedan/SUV ou 4×4, ni la
  // durée (daily/weekly/monthly). Si le prix/jour reste à 0, seul un mot de
  // passe permet de forcer l'enregistrement (aucune autre exception).
  {
    let _vtCancelled = document.getElementById('r-cancelled-check') && document.getElementById('r-cancelled-check').checked;
    let _vtTempReplacement = document.getElementById('r-temp-replacement-check') && document.getElementById('r-temp-replacement-check').checked;
    if(_vtTempReplacement){
      let _vtLinkVal = document.getElementById('r-temp-replaces-id') ? document.getElementById('r-temp-replaces-id').value : '';
      if(!_vtLinkVal){
        toast('⚠️ Select which open contract this temporary vehicle replaces.');
        return;
      }
    }
    if(!_vtCancelled && !_vtTempReplacement){
      let _vtCarType  = (document.getElementById('r-car-type')      ? document.getElementById('r-car-type').value      : '').trim();
      let _vtDuration = (document.getElementById('r-contract-type') ? document.getElementById('r-contract-type').value : '').trim();

      if(!_vtCarType){
        toast(translate('rental.selectTypeBeforeSave'));
        let _vtBtn4 = document.getElementById('car-type-4x4');
        if(_vtBtn4){ _vtBtn4.style.borderColor='#dc2626'; setTimeout(()=>{ _vtBtn4.style.borderColor=''; }, 2000); }
        return;
      }
      if(!_vtDuration){
        toast(translate('rental.selectDurationBeforeSave'));
        return;
      }
      let _vtPrice = getFormPrice();
      if(!_vtPrice || _vtPrice <= 0){
        const _vtPw = await securePrompt('⚠️ Price/day is 0 OMR.\n\nSaving with 0 OMR/day requires a password.\nEnter password to confirm:');
        if(_vtPw === null){ toast(translate('rental.saveCancelledZeroPrice')); return; }
        const _vtPwOk = await checkPassword(_vtPw, 'New Rental — Save with Price/day = 0 (Contract ' + contract + ')');
        if(!_vtPwOk){ toast('❌ Wrong password. Save cancelled.'); return; }
        toast(translate('rental.passwordConfirmedZeroPrice'));
      }
    }
  }

  // ── CARRIED FORWARD CREDIT VALIDATION ──
  // FIX (2026-09) : le BAL manuel (_balManual) a désormais le dernier mot. Si l'utilisateur
  // a tapé une valeur dans le champ BAL déverrouillé (window._balManuallyEdited) OU si ce
  // contrat était déjà gelé manuellement lors d'un save précédent (existing._balManual),
  // cette validation devient sans objet — le solde final ne dépend plus du calcul auto,
  // donc plus la peine d'exiger un montant de report > 0 pour pouvoir sauvegarder.
  // La fonction carry-forward elle-même n'est PAS touchée : _carryForwardSourceId et
  // _carryForwardCredit continuent d'être sauvegardés normalement plus bas (avec leur
  // fallback existant sur existing._carryForwardCredit) — seul le blocage disparaît.
  {
    let _cfEditId  = document.getElementById('modal-rental').getAttribute('data-edit-id');
    let _cfSelfId  = _cfEditId ? Number(_cfEditId) : null;
    let _existingForBal = _cfSelfId ? DB.rentals.find(x => x.id === _cfSelfId) : null;
    let _balOverridden = window._balManuallyEdited === true || (_existingForBal && _existingForBal._balManual === true);

    let cfSourceId = document.getElementById('r-cf-source-contract') ? Number(document.getElementById('r-cf-source-contract').value) : 0;
    if(cfSourceId && !_balOverridden){
      let cfAmount = document.getElementById('r-cf-amount') ? Number(document.getElementById('r-cf-amount').value) : 0;
      if(!cfAmount || cfAmount <= 0){
        // FIX (2026-09) : ce message s'affichait même quand un contrat source ÉTAIT choisi
        // (le vrai problème était le bug de calcul du crédit — voir onCarryForwardSourceSelect).
        // Message reformulé pour refléter ce qui se passe réellement : aucun crédit disponible.
        toast(translate('cf.noAvailableCredit'));
        return;
      }
      let cfSource = DB.rentals.find(r => r.id === cfSourceId);
      if(!cfSource){
        toast(translate('cf.sourceNotFound'));
        return;
      }
      // Vérifier que le client est le même
      if(window._currentRentalClientId && cfSource._clientId && window._currentRentalClientId !== cfSource._clientId){
        toast(translate('cf.clientMismatch'));
        return;
      }
      // FIX (2026-09) : re-vérifier au moment du save que le montant saisi ne dépasse pas
      // le pool réellement disponible (en excluant CE contrat de "déjà utilisé"), au cas où
      // le crédit aurait changé entre la sélection et le save (ex: un autre contrat vient
      // de consommer le reliquat entre-temps).
      let _cfSourceBAL = Number(cfSource.bal || 0);
      let _cfCreditPool = _cfSourceBAL < 0 ? Math.abs(_cfSourceBAL) : 0;
      let _cfUsedElsewhere = DB.rentals
        .filter(x => x._carryForwardSourceId === cfSourceId && x.id !== _cfSelfId)
        .reduce((sum, x) => sum + (Number(x._carryForwardCredit || 0)), 0);
      let _cfMaxAllowed = Math.max(0, _cfCreditPool - _cfUsedElsewhere);
      if(cfAmount > _cfMaxAllowed + 0.001){
        toast(`⚠️ Only ${fmtNum(_cfMaxAllowed)} OMR available from this source now — please re-check the amount.`);
        return;
      }
    }
  }

  // ── CANCELLED CONTRACTS : balance auto TOUJOURS = 0 (même logique que Temp Replacement) ──
  // Exactement comme onTempReplacesSelectChange() force bal=0 + _balManual=true pour les
  // véhicules de remplacement temporaire, on gèle ici la BAL à 0 pour tout contrat CANCELLED,
  // quel que soit le prix/payé saisi. Couvre le cas NOUVEAU contrat ET EDIT (les deux branches
  // de sauvegarde plus bas lisent #r-bal et window._balManuallyEdited).
  {
    let _vtCancelledBal = document.getElementById('r-cancelled-check') && document.getElementById('r-cancelled-check').checked;
    if(_vtCancelledBal){
      let balElCancel = document.getElementById('r-bal');
      if(balElCancel) balElCancel.value = 0;
      window._balManuallyEdited = true; // gèle bal à 0 via le mécanisme _balManual existant
    }
  }

  // ── Blocage client blacklisté (double vérification : par ID ET par CIN) ──
  {
    let _bClient = null;
    // 1) Via l'ID client lié
    if(window._currentRentalClientId){
      _bClient = (DB.clients||[]).find(c => c.id === window._currentRentalClientId);
    }
    // 2) Fallback : chercher par le CIN tapé dans le champ r-client-id
    if(!_bClient){
      let _cinVal = (document.getElementById('r-client-id') ? document.getElementById('r-client-id').value : '').trim().toLowerCase();
      if(_cinVal) _bClient = (DB.clients||[]).find(c => (c.idcard||'').toLowerCase() === _cinVal);
    }
    if(_bClient && _bClient.blacklisted){
      let _cinEl = document.getElementById('r-client-id');
      if(_cinEl){ _cinEl.style.borderColor='#dc2626'; _cinEl.style.background='rgba(220,38,38,.07)'; setTimeout(()=>{ _cinEl.style.borderColor=''; _cinEl.style.background=''; },3000); }
      alert(t(translate('rental.alertBlacklist'), (_bClient.firstname||_bClient.name||'this client'), (_bClient.blacklistReason||'Not specified')));
      return;
    }
  }

  // Validate plate exists in fleet (GPS Tracking) — only if a vehicleId is NOT already resolved
  let _resolvedVehicleId = (()=>{ let v=DB.vehicles.find(v=>(v.plate||'').toUpperCase()===plate.toUpperCase()); return v?v.id:null; })();
  if(!_resolvedVehicleId && !fleetPlateExists(plate)){
    alert(t(translate('rental.alertPlateNotFound'), plate));
    let plEl = document.getElementById('r-plate'); if(plEl){ plEl.style.borderColor='#ef4444'; plEl.focus(); }
    return;
  }

  // Validate Date In is not before Date Out (same calendar day is OK).
  // Without this check, calcRentalBAL() silently returns null and the BAL
  // field is left stale/empty/incorrect with no explanation to the user.
  let _dOutVal = document.getElementById('r-out').value;
  let _dInVal  = document.getElementById('r-in').value;
  if(_dOutVal && _dInVal){
    let _dOut = new Date(_dOutVal);
    let _dIn  = new Date(_dInVal);
    let _calOut = new Date(_dOut.getFullYear(), _dOut.getMonth(), _dOut.getDate());
    let _calIn  = new Date(_dIn.getFullYear(), _dIn.getMonth(), _dIn.getDate());
    if(_calIn < _calOut){
      alert(t(translate('rental.alertDateInBeforeDateOut'), _dInVal.slice(0,10), _dOutVal.slice(0,10)));
      return;
    }
  }

  // ── GARDE-FOU GÉNÉRAL : impossible de fermer un contrat (Date In renseignée)
  // sans KM In (>0). Couvre TOUS les cas de save (nouveau contrat ET édition
  // d'un contrat existant, déjà fermé ou pas) — pas seulement le cas "véhicule
  // OUT ailleurs" plus bas qui ne protège que ce scénario précis. ──────────
  {
    let _gfDateIn = (document.getElementById('r-in').value || '').trim();
    let _gfKmIn   = (document.getElementById('r-km-in').value || '').trim();
    let _gfKmOut  = (document.getElementById('r-km-out').value || '').trim();
    if(_gfDateIn !== '' && (_gfKmIn === '' || Number(_gfKmIn) <= 0)){
      toast('⚠️ KM In is required to close this contract (Date In is set but KM In is empty).');
      let _gfKmEl = document.getElementById('r-km-in');
      if(_gfKmEl){ _gfKmEl.style.borderColor = '#dc2626'; _gfKmEl.focus(); setTimeout(()=>{ _gfKmEl.style.borderColor=''; }, 2000); }
      return;
    }
    // ── KM In doit être >= KM Out (égal autorisé, jamais inférieur) ──
    if(_gfKmIn !== '' && _gfKmOut !== '' && Number(_gfKmIn) < Number(_gfKmOut)){
      toast(`⚠️ KM In (${_gfKmIn}) cannot be less than KM Out (${_gfKmOut}).`);
      let _gfKmEl2 = document.getElementById('r-km-in');
      if(_gfKmEl2){ _gfKmEl2.style.borderColor = '#dc2626'; _gfKmEl2.focus(); setTimeout(()=>{ _gfKmEl2.style.borderColor=''; }, 2000); }
      return;
    }
  }

  let editId = document.getElementById('modal-rental').getAttribute('data-edit-id');

  if(!editId || editId === ''){
    // Check if vehicle is OUT in Daily Rentals
    let plateOut = DB.rentals.find(r => {
      let v = r.vehicleId ? (DB.vehicles.find(x=>x.id===r.vehicleId)||{}) : {};
      let rPlate = v.plate || r._plate || '';
      return rPlate.toLowerCase() === plate.toLowerCase() && (!r.dateIn || r.dateIn === '') && !r._cancelled;
    });
    // Check if vehicle is OUT in Internal Movements
    let moveOut = (DB.moves||[]).find(m => extractPlateNum(m.plate) === extractPlateNum(plate) && (!m.dateIn || m.dateIn === ''));

    let isCancelled = document.getElementById('r-cancelled-check') && document.getElementById('r-cancelled-check').checked;

    if(isCancelled){
      // CANCELLED contracts: must have both dateIn and kmIn filled
      let formDateIn = (document.getElementById('r-in').value || '').trim();
      let formKmIn   = (document.getElementById('r-km-in').value || '').trim();
      if(!formDateIn || !formKmIn || Number(formKmIn) <= 0){
        toast(translate('rental.cancelledMissingData'));
        return;
      }
    } else if(plateOut){
      // Vehicle is OUT in Daily Rentals — allow only if it's a historical (closed) entry
      let formDateIn = (document.getElementById('r-in').value || '').trim();
      let formKmIn   = (document.getElementById('r-km-in').value || '').trim();
      let hasDateIn  = formDateIn !== '';
      let hasKmIn    = formKmIn !== '' && Number(formKmIn) > 0;
      if(!hasDateIn && !hasKmIn){
        toast(`🚫 ${plate} is currently OUT — Contract ${plateOut.contract}. To record a past contract, fill in Date In AND KM In.`);
        return;
      }
      if(!hasDateIn){
        toast(`⚠️ ${plate} is OUT. Date In required for a past contract.`);
        return;
      }
      if(!hasKmIn){
        toast(`⚠️ ${plate} is OUT. KM In required for a past contract (must be > 0).`);
        return;
      }
      // Both filled → historical contract, allow it to be saved
    } else if(moveOut){
      // Vehicle is OUT in Internal Movements — block completely (can't rent a car that's at workshop etc.)
      let destLabel = moveOut.dest ? moveOut.dest.charAt(0).toUpperCase()+moveOut.dest.slice(1) : 'Internal Movement';
      toast(`🚫 ${plate} is currently in an internal movement (${destLabel}). Return the vehicle before creating a contract.`);
      return;
    }
    // ── FIX (2026-08) : l'ancien check global "dupContract" (sans branche) a été
    // supprimé — il bloquait à tort la création d'un contrat côté Directeur dès
    // que le même numéro existait dans l'AUTRE branche (ce qui est légitime, voir
    // dupInBranch plus bas qui fait le check CORRECT, scopé par branche). ──

    // ── CHRONOLOGIE CONTRATS : Bloquer si date antérieure au dernier contrat ──────
    let _dOutNewRental = (document.getElementById('r-out').value || '').slice(0,10);
    if(_dOutNewRental) {
      let _allRentals = DB.rentals.filter(r => r.dateOut);
      if(_allRentals.length > 0) {
        _allRentals.sort((a,b) => {
          let ca = parseInt((a.contract||'0').toString().replace(/[^0-9]/g,''),10)||0;
          let cb = parseInt((b.contract||'0').toString().replace(/[^0-9]/g,''),10)||0;
          return cb - ca;
        });
        let _lastRental = _allRentals[0];
        let _lastContractDate = (_lastRental.dateOut||'').slice(0,10);
        if(_lastContractDate && _dOutNewRental < _lastContractDate) {
          const _bypassPw = await securePrompt(
            '⚠️ Old contract detected\n\nContract N° ' + (_lastRental.contract||'?') + ' is dated ' + _lastContractDate + '.\nRequested date (' + _dOutNewRental + ') is earlier.\n\nTo force entry of a past contract, enter password:'
          );
          if (_bypassPw === null) { toast(translate('rental.saveCancelled')); return; }
          const _bypassOk = await checkPassword(_bypassPw, 'Daily Rentals — Bypass Chronology');
          if (!_bypassOk) {
            toast('❌ Wrong password. Save cancelled.');
            return;
          }
          toast(translate('rental.pastContractAuthorised'));
        }
      }
    }
    // ── FIN CHRONOLOGIE CONTRATS ────────────────────────────────────────────────
  }

  let vehicleId = findOrUseVehicleByPlate(plate, vname);

  // ── GARDE ANTI-CHEVAUCHEMENT SERVEUR (FIX 04/08/2026) ──────────────────
  // Contexte : le check "véhicule déjà OUT" plus haut (plateOut) ne regarde
  // QUE la copie DB.rentals en mémoire de CET onglet, qui peut être périmée
  // de plusieurs minutes avec 3 sessions ouvertes en simultané (Barka /
  // Moebela / Directeur). Ici on revérifie contre l'état RÉEL en base avant
  // de créer/modifier quoi que ce soit localement — seule façon d'empêcher 2
  // clients différents de se retrouver liés au même véhicule.
  if(vehicleId){
    try{
      let _cvResp = await fetch('/check-vehicle-conflict', {
        method:'POST',
        headers: authHeaders({'Content-Type':'application/json'}),
        body: JSON.stringify({
          vehicleId: vehicleId,
          dateOut: document.getElementById('r-out').value,
          dateIn: document.getElementById('r-in').value,
          excludeId: (editId && editId !== '') ? Number(editId) : null
        })
      });
      let _cvData = await _cvResp.json();
      if(_cvData && _cvData.conflict){
        let c = _cvData.conflict;
        alert(t(translate('rental.alertVehicleConflict'), (c.contract||'?'), (c.dateOut||'?'),
              (c.dateIn ? t(translate('rental.alertVehicleConflictReturned'), c.dateIn) : translate('rental.alertVehicleConflictNotReturned'))));
        return;
      }
    }catch(e){
      // Réseau KO sur le pré-check : on ne bloque pas la saisie (pas pire qu'avant ce fix),
      // le garde-fou côté serveur dans /save-one reste le filet de sécurité final.
      console.warn('check-vehicle-conflict: échec réseau, poursuite sans double-check', e);
    }
  }

  // ── Détermination de la branche du contrat ────────────────────────────
  // Priorité : branche du véhicule lié > branche déjà présente sur l'ancien contrat > branche du compte connecté (si compte de branche)
  let rentalBranch = (function(){
    // Priorité absolue : session utilisateur (BARKA/MOEBELA) — ignorer 'shared' du véhicule
    if(window.AUTH && !window.AUTH.isAdmin && Array.isArray(window.AUTH.branches) && window.AUTH.branches.length) return window.AUTH.branches[0];
    // Directeur : prendre la branche du véhicule seulement si pas 'shared'
    let veh = vehicleId ? DB.vehicles.find(v => v.id === vehicleId) : DB.vehicles.find(v => v.plate === plate);
    let vb = veh && (veh.branch || veh.bureau);
    if(vb && vb.toLowerCase() !== 'shared') return vb;
    return undefined;
  })();

  // ── GARDE-FOU : empêcher un numéro de contrat dupliqué DANS LA MÊME BRANCHE ──
  // (deux branches peuvent légitimement avoir le même numéro chacune dans sa
  // propre séquence — ce n'est PAS un doublon. Un doublon DANS la même branche,
  // en revanche, est toujours une erreur — ex: champ contrat déverrouillé
  // manuellement et retapé sur un numéro déjà pris.)
  if(contract){
    let dupInBranch = DB.rentals.find(r =>
      String(r.contract).trim() === String(contract).trim() &&
      (!editId || r.id !== Number(editId)) &&
      rentalBranch && r.branch &&
      String(r.branch).toUpperCase() === String(rentalBranch).toUpperCase()
    );
    if(dupInBranch){
      alert(t(translate('rental.alertContractExists'), contract, rentalBranch));
      return;
    }
  }

  // ── SNAPSHOT client : on fige le nom (et le CIN) du client lié AU MOMENT DU SAVE. ──
  // Avant, le nom n'existait nulle part sur le contrat : il fallait toujours re-chercher
  // DB.clients via _clientId, donc un _clientId cassé/orphelin/mal-changé = nom perdu à jamais.
  // Maintenant le nom est copié en dur sur le contrat, il ne bougera plus jamais,
  // même si la fiche client est éditée, supprimée, ou si _clientId se corrompt plus tard.
  let _clientSnap = window._currentRentalClientId
    ? (DB.clients||[]).find(c => c.id === window._currentRentalClientId)
    : null;
  let _snapClientName   = _clientSnap ? (_clientSnap.firstname || '') : '';
  let _snapClientIdcard = _clientSnap ? (_clientSnap.idcard   || '') : '';

  if(editId && editId !== ''){
    let i=DB.rentals.findIndex(r=>r.id===Number(editId));
    if(i!==-1){
      pushUndo();
      let existing=DB.rentals[i];
      // ── FIX (2026-08) : SYNC PAYMENTS SI LA PLAQUE/VEHICULE DU CONTRAT CHANGE ──
      // Avant : si on corrigeait la plaque d'un contrat déjà sauvegardé, les
      // paiements déjà enregistrés pour ce contrat gardaient l'ANCIEN vehicleId
      // (ou l'ancienne plaque en texte libre) → l'ancienne plaque restait affichée
      // sur eux (Payments tab, historique...). Pire : paymentsForContract() filtre
      // aussi par vehicleId (voir plus bas), donc le total "paid" recalculé juste
      // après pouvait rater ces paiements et afficher un montant payé inférieur
      // à la réalité. On resynchronise ici TOUS les paiements du contrat (match
      // contract+branche uniquement, sans filtrer par vehicleId puisqu'il vient
      // justement de changer) vers le nouveau véhicule/plaque, AVANT de recalculer
      // paymentLog/total. Couvre aussi le cas où la plaque n'était pas reconnue
      // comme véhicule existant (payment stocké avec _plate en texte libre).
      {
        let _oldVid = existing.vehicleId || null;
        let _newVid = vehicleId || null;
        let _oldPlateTxt = existing._plate || '';
        let _vehicleOrPlateChanged = (_oldVid !== _newVid) || (!_oldVid && !_newVid && _oldPlateTxt !== plate);
        if(_vehicleOrPlateChanged){
          let _payToSync = paymentsForContract(contract, rentalBranch || existing.branch, null)
            .filter(p => (p.vehicleId && p.vehicleId === _oldVid) || (!p.vehicleId && (p._plate||'') === _oldPlateTxt));
          _payToSync.forEach(p => {
            p.vehicleId = _newVid || undefined;
            p._plate = _newVid ? undefined : plate; // le plate se retrouve via vehicleId si connu, sinon texte libre à jour
            p.updatedAt = Date.now();
            if(typeof saveOne === 'function') saveOne('payments', p, null);
          });
          if(_payToSync.length){
            console.log('[Rental] Plaque changée sur contrat ' + contract + ' — ' + _payToSync.length + ' paiement(s) resynchronisé(s) vers le nouveau véhicule/plaque.');
            logAction('edit_rental', `🔄 Daily Rentals — Plate change Cont. ${contract}`, `${_payToSync.length} payment(s) re-linked to new vehicle/plate`, `Cont. ${contract} · ${plate}`);
          }
        }
      }
      // Reconstruire paymentLog depuis DB.payments (source de verite unique, inclut quickAdd)
      let paymentLog = paymentsForContract(contract, rentalBranch || existing.branch, vehicleId || existing.vehicleId)
        .map(p => ({ amount: Number(p.price||0), date: p.dateOut||'', method: p.paymentMethod||'CASH', receipt: p.receipt||'', id: p.id, _quickAdd: p._quickAdd||false }));
      if(paymentLog.length === 0) paymentLog = window._editingRentalPayments || [];
      // paid = sum TOTALE de tous les payments dans DB.payments pour ce contract
      // (quickAdd y sont maintenant aussi, pushes immediatement par quickAddPayment)
      let totalPaidAllMonths = paymentsForContract(contract, rentalBranch || existing.branch, vehicleId || existing.vehicleId)
        .reduce((s,p) => s + Number(p.paid || p.price||0), 0);
      // Si aucun payment dans DB.payments, fallback sur paymentLog
      if(totalPaidAllMonths === 0 && paymentLog.length > 0){
        totalPaidAllMonths = paymentLog.reduce((sum,p) => sum + Number(p.amount||0), 0);
      }
      let paidByMonth = existing.paidByMonth ? {...existing.paidByMonth} : {};
      // FIX (2026-09) : calcul UNIQUE et partagé des 3 champs carry-forward (au lieu de 3
      // IIFE indépendantes qui lisaient chacune le DOM séparément). _cfFinalCredit dépend
      // maintenant EXPLICITEMENT de _cfFinalSourceId : si aucune source ne résout (ni
      // nouvellement choisie, ni existante), le crédit est forcé à undefined, quoi qu'il y
      // ait dans #r-cf-amount ou dans l'ancien enregistrement. Ça rend le bug "crédit
      // fantôme from #?" structurellement impossible ici, et guérit automatiquement tout
      // contrat déjà corrompu (#5187B/#5235B/#5240B) dès qu'il est réédité et sauvegardé.
      let _cfSrcId = document.getElementById('r-cf-source-contract') ? Number(document.getElementById('r-cf-source-contract').value) : 0;
      let _cfSrc = _cfSrcId ? DB.rentals.find(r => r.id === _cfSrcId) : null;
      let _cfFinalSourceId = _cfSrcId ? (_cfSrc ? _cfSrc.id : (existing._carryForwardSourceId || undefined)) : (existing._carryForwardSourceId || undefined);
      let _cfFinalReceipt = _cfSrcId ? (_cfSrc ? (_cfSrc.receipt || ('R'+_cfSrc.id)) : (existing._carryForwardSourceReceipt || undefined)) : (existing._carryForwardSourceReceipt || undefined);
      let _cfAmtRaw = document.getElementById('r-cf-amount') ? document.getElementById('r-cf-amount').value : '';
      let _cfFinalCredit = _cfFinalSourceId
        ? (_cfAmtRaw && Number(_cfAmtRaw) > 0 ? Number(_cfAmtRaw) : (existing._carryForwardCredit || undefined))
        : undefined;
      DB.rentals[i]={
        id:existing.id,
        vehicleId:vehicleId,
        _plate: vehicleId ? undefined : plate,
        _name: vehicleId ? undefined : vname,
        contract:contract,
        _cancelled: (document.getElementById('r-cancelled-check') && document.getElementById('r-cancelled-check').checked) ? true : undefined, // FIX: décocher retire vraiment CANCELLED
        _notice: (document.getElementById('r-notice-check') && document.getElementById('r-notice-check').checked) ? true : undefined, // FIX: décocher doit vraiment retirer تعميم (avant: retombait sur existing._notice)
        _tempReplacement: (document.getElementById('r-temp-replacement-check') && document.getElementById('r-temp-replacement-check').checked) ? true : undefined, // FIX: après Unlock (mot de passe), le contrat redevient normal
        _linkedRentalId: (document.getElementById('r-temp-replacement-check') && document.getElementById('r-temp-replacement-check').checked)
          ? (Number(document.getElementById('r-temp-replaces-id').value) || existing._linkedRentalId || null)
          : undefined,
        _carryForwardSourceId: _cfFinalSourceId,
        _carryForwardSourceReceipt: _cfFinalReceipt,
        _carryForwardCredit: _cfFinalCredit,
        price:getFormPrice(),
        dateOut:document.getElementById('r-out').value,
        dateIn:document.getElementById('r-in').value,
        kmOut:Number(document.getElementById('r-km-out').value)||existing.kmOut||0,
        kmIn:Number(document.getElementById('r-km-in').value)||existing.kmIn||0,
        paid: totalPaidAllMonths,
        paymentLog: paymentLog,
        paidByMonth:paidByMonth,
        cleanBefore: (()=>{ let el=document.querySelector("input[name='clean-before']:checked"); return el?el.value:null; })(),
        cleanAfter:  (()=>{ let el=document.querySelector("input[name='clean-after']:checked");  return el?el.value:null; })(),
        fuelOut: (()=>{ let v=document.getElementById('r-fuel-out').value; return v===''?null:Number(v); })(),
        fuelIn:  (()=>{ let v=document.getElementById('r-fuel-in').value;  return v===''?null:Number(v); })(),
        kmPerDay: Number(document.getElementById('r-km-day').value)||0,
        kmRate: Number(document.getElementById('r-km-rate').value)||0.050,
        contractType: document.getElementById('r-contract-type') ? document.getElementById('r-contract-type').value : (existing.contractType||''),
        carType: document.getElementById('r-car-type') ? document.getElementById('r-car-type').value : (existing.carType||''),
        basePrice: document.getElementById('r-base-price') ? (Number(document.getElementById('r-base-price').value)||existing.basePrice||0) : (existing.basePrice||0),
        tel:document.getElementById('r-tel').value||'',
        notes:document.getElementById('r-notes').value,
        receipt:existing.receipt||('R'+Date.now()),
        paymentDone:existing.paymentDone||false,
        _clientId: window._currentRentalClientId !== undefined ? window._currentRentalClientId : (existing._clientId || null),
        _clientName: window._currentRentalClientId !== undefined
          ? (window._currentRentalClientId ? _snapClientName : '')
          : (existing._clientName || ''),
        _clientIdcard: window._currentRentalClientId !== undefined
          ? (window._currentRentalClientId ? _snapClientIdcard : '')
          : (existing._clientIdcard || ''),
        bal:(()=>{ let balInput = document.getElementById('r-bal').value; return balInput !== '' ? Number(balInput) : null; })(),
        _balManual: (()=>{ return window._balManuallyEdited === true ? true : (existing._balManual === true); })(),
        expectedReturn: document.getElementById('r-exp-return') ? (document.getElementById('r-exp-return').value || '') : (existing.expectedReturn || ''),
        branch: rentalBranch || existing.branch
      };
      // Recalculer BAL immediatement apres save si pas manual
      if(!DB.rentals[i]._balManual){
        let freshBal = DB.rentals[i].dateIn && DB.rentals[i].dateIn !== ''
          ? calcRentalBAL(DB.rentals[i])
          : calcOpenContractBAL(DB.rentals[i]);
        if(freshBal !== null) DB.rentals[i].bal = freshBal;
      }
      document.getElementById('modal-rental').setAttribute('data-edit-id', '');
      let _old = existing;
      let _champs = { price: 'Price/day (OMR)', dateOut: 'Date Out', dateIn: 'Date In', kmOut: 'KM Out', kmIn: 'KM In', paid: 'Paid (OMR)', tel: 'Phone', notes: 'Notes', fuelOut: 'Fuel Out', fuelIn: 'Fuel In', cleanBefore: 'Condition Before', cleanAfter: 'Condition After', contractType: 'Type contract', carType: 'Type vehicle', bal: 'BAL (OMR)' };
      let _saved = DB.rentals[i];
      let _diffs = [];
      Object.keys(_champs).forEach(k => { let ov = String(_old[k]!==undefined&&_old[k]!==null?_old[k]:'—'); let nv = String(_saved[k]!==undefined&&_saved[k]!==null&&_saved[k]!==''?_saved[k]:'—'); if(ov !== nv) _diffs.push(_champs[k]+': ['+ov+'] → ['+nv+']'); });
      let _detail = _diffs.length ? _diffs.join(' | ') : 'Nonee modification detectede';
      logAction('edit_rental', `✏️ Daily Rentals — Edit Cont. ${contract} (${plate})`, _detail, `Cont. ${contract} · ${plate}`);
      let balElCheck = document.getElementById('r-bal');
      if(balElCheck && !balElCheck.readOnly){ logAction('bal_edit', `🔓 Daily Rentals — BAL Updated Cont. ${contract} (${plate})`, `Ancienne BAL: [${_old.bal !== null && _old.bal !== undefined ? _old.bal : '—'} OMR] → Nouvelle BAL: [${balElCheck.value} OMR]`, `Cont. ${contract} · ${plate}`); }
      window._allFieldsUnlocked = false;
      toast(translate('rental.updated'));
      document.getElementById('modal-rental').setAttribute('data-type-locked','1');
    }
  }else{
    let rentalPayments = window._editingRentalPayments || [];
    // For quickAdd entries already in DB.payments, sum from DB.payments to avoid 0
    let newPaidAmt = rentalPayments.reduce((s,p) => s + Number(p.amount||0), 0);
    // Fallback: also check DB.payments for any quickAdd entries linked to this contract
    let dbPaidForNew = paymentsForContract(contract, rentalBranch, vehicleId).reduce((s,p) => s + Number(p.price||0), 0);
    if(dbPaidForNew > newPaidAmt) newPaidAmt = dbPaidForNew;
    let initYm = window._currentYm || new Date().toISOString().slice(0,7);
    // FIX (2026-09) : même garde-fou que côté édition — voir commentaire au-dessus de
    // DB.rentals[i]={...} plus haut dans ce fichier.
    let _cfSrcIdNew = document.getElementById('r-cf-source-contract') ? Number(document.getElementById('r-cf-source-contract').value) : 0;
    let _cfSrcNew = _cfSrcIdNew ? DB.rentals.find(r => r.id === _cfSrcIdNew) : null;
    let _cfFinalSourceIdNew = _cfSrcNew ? _cfSrcNew.id : undefined;
    let _cfFinalReceiptNew = _cfSrcNew ? (_cfSrcNew.receipt || ('R'+_cfSrcNew.id)) : undefined;
    let _cfAmtRawNew = document.getElementById('r-cf-amount') ? document.getElementById('r-cf-amount').value : '';
    let _cfFinalCreditNew = _cfFinalSourceIdNew && _cfAmtRawNew && Number(_cfAmtRawNew) > 0 ? Number(_cfAmtRawNew) : undefined;
    let newRental = {
      id:_genId(),
      vehicleId:vehicleId,
      _plate: vehicleId ? undefined : plate,
      _name: vehicleId ? undefined : vname,
      contract:contract,
      _cancelled: (document.getElementById('r-cancelled-check') && document.getElementById('r-cancelled-check').checked) ? true : undefined,
      _notice: (document.getElementById('r-notice-check') && document.getElementById('r-notice-check').checked) ? true : undefined,
      _tempReplacement: (document.getElementById('r-temp-replacement-check') && document.getElementById('r-temp-replacement-check').checked) ? true : undefined,
      _linkedRentalId: (document.getElementById('r-temp-replacement-check') && document.getElementById('r-temp-replacement-check').checked)
        ? (Number(document.getElementById('r-temp-replaces-id').value) || null)
        : undefined,
      _carryForwardSourceId: _cfFinalSourceIdNew,
      _carryForwardSourceReceipt: _cfFinalReceiptNew,
      _carryForwardCredit: _cfFinalCreditNew,
      price:getFormPrice(),
      dateOut:document.getElementById('r-out').value,
      dateIn:document.getElementById('r-in').value,
      kmOut:Number(document.getElementById('r-km-out').value)||0,
      kmIn:Number(document.getElementById('r-km-in').value)||0,
      paid:newPaidAmt,
      paymentLog: rentalPayments.length > 0 ? JSON.parse(JSON.stringify(rentalPayments)) : (newPaidAmt > 0 ? [{amount:newPaidAmt, date: new Date().toISOString().slice(0,10), method:'CASH', receipt:'', id:Date.now()}] : []),
      paidByMonth:{[initYm]:newPaidAmt},
      cleanBefore: (()=>{ let el=document.querySelector("input[name='clean-before']:checked"); return el?el.value:null; })(),
      cleanAfter:  (()=>{ let el=document.querySelector("input[name='clean-after']:checked");  return el?el.value:null; })(),
      fuelOut:(()=>{ let v=document.getElementById('r-fuel-out').value; return v===''?null:Number(v); })(),
      fuelIn: (()=>{ let v=document.getElementById('r-fuel-in').value;  return v===''?null:Number(v); })(),
      kmPerDay:Number(document.getElementById('r-km-day').value)||0,
      kmRate:Number(document.getElementById('r-km-rate').value)||0.050,
      contractType: document.getElementById('r-contract-type') ? document.getElementById('r-contract-type').value : '',
      carType: document.getElementById('r-car-type') ? document.getElementById('r-car-type').value : '',
      basePrice: document.getElementById('r-base-price') ? (Number(document.getElementById('r-base-price').value)||0) : 0,
      tel:document.getElementById('r-tel').value||'',
      notes:document.getElementById('r-notes').value,
      receipt:'R'+Date.now(),
      paymentDone:false,
      _clientId: window._currentRentalClientId || null,
      _clientName: window._currentRentalClientId ? _snapClientName : '',
      _clientIdcard: window._currentRentalClientId ? _snapClientIdcard : '',
      bal:(()=>{ let balInput = document.getElementById('r-bal').value; return balInput !== '' ? Number(balInput) : null; })(),
      _balManual: window._balManuallyEdited === true ? true : undefined, // gèle bal (CANCELLED ou TEMP REPLACEMENT) — même mécanisme que la branche EDIT
      expectedReturn: document.getElementById('r-exp-return') ? (document.getElementById('r-exp-return').value || '') : '',
      branch: rentalBranch
    };
    DB.rentals.push(newRental);
    // Sync payments to DB.payments so they appear in the Payments tab.
    // Entries added via addPaymentEntry() already exist in DB.payments (with a receipt).
    // Entries added via quickAddPayment() have no receipt and need to be pushed.
    rentalPayments.forEach(function(p){
      if(p.receipt && p.receipt !== ''){
        // Already in DB.payments from addPaymentEntry — just make sure contract is set
        let existing = DB.payments.find(x => x.receipt === p.receipt);
        if(existing){ existing.contract = contract; existing.vehicleId = vehicleId; existing.branch = rentalBranch; }
        return;
      }
      // quickAdd already in DB.payments — just update contract/vehicleId
      if(p._quickAdd && p._internalId){
        let existingQA = DB.payments.find(x => x._internalId === p._internalId);
        if(existingQA){ existingQA.contract = contract; existingQA.vehicleId = vehicleId; existingQA.branch = rentalBranch; }
        return;
      }
      // Other entry not yet in DB.payments
      DB.payments.push({
        id: _genId(),
        vehicleId: vehicleId,
        _plate: vehicleId ? undefined : plate,
        contract: contract,
        branch: rentalBranch,
        receipt: 'R'+Date.now()+Math.random().toString(36).slice(2,6),
        paymentMethod: p.method || 'CASH',
        statusLabel: (p.method === 'POST') ? 'PAID' : (p.method === 'TRANSFERT') ? 'TRANSFERT' : 'UNPAID-CASH',
        price: Number(p.amount||0),
        paid: Number(p.amount||0),
        paymentDone: true,
        dateOut: p.date || new Date().toISOString().slice(0,10)
      });
    });
    window._editingRentalPayments = [];
    let _newDetail = ['Vehicle: '+vname+' ('+plate+')', 'Price/day: '+getFormPrice()+' OMR', 'Date Out: '+document.getElementById('r-out').value.slice(0,10), document.getElementById('r-in').value ? 'Date In: '+document.getElementById('r-in').value.slice(0,10) : 'Date In: OPEN', 'KM Out: '+(document.getElementById('r-km-out').value||'—'), 'Paid: '+(document.getElementById('r-paid').value||'0')+' OMR', 'Tel: '+(document.getElementById('r-tel').value||'—'), 'Notes: '+(document.getElementById('r-notes').value||'—')].join(' | ');
    logAction('new_rental', `➕ Daily Rentals — New Contract ${contract} (${plate})`, _newDetail, `Cont. ${contract} · ${plate}`);
    toast(translate('rental.saved'));
    document.getElementById('modal-rental').setAttribute('data-type-locked','1');
  }
  lockBalField();
  lockPriceField();
  lockKmInField();
  lockFuelInField();
  lockCleanAfterField();
  window._balManuallyEdited = false;
  updateLogBadge();
  // saveOne ciblé — capturer le rental AVANT closeModal (qui peut vider les champs)
  // editId est capturé en haut de la fonction avant tout reset de data-edit-id
  let _rentalToSave = (editId && editId !== '')
    ? DB.rentals.find(x => x.id === Number(editId))
    : DB.rentals[DB.rentals.length - 1];
  closeModal('modal-rental');
  if(_rentalToSave && _rentalToSave.id !== undefined){
    saveRental(_rentalToSave.id);
    let _contract = _rentalToSave.contract || '';
    // FIX (2026-08) : scopé par branche/véhicule — sinon on re-persiste aussi
    // (sans les modifier) les paiements de l'autre branche portant le même n°.
    paymentsForContract(_contract, _rentalToSave.branch, _rentalToSave.vehicleId).forEach(p => savePayment(p.id));
  } else {
    console.warn('saveRentalModal: rental not found after save, falling back to saveAll');
    saveAll();
  }
  refreshAll();
}


// Verrouille tous les champs du modal en mode édition (after savee)
// ── lockAllRentalFields (orig. line 4896) ──
function lockAllRentalFields(){
  // Price / Day — lock after save (requires password)
  let priceEl2 = document.getElementById('r-price');
  if(priceEl2){ priceEl2.readOnly=true; priceEl2.style.cursor='not-allowed'; priceEl2.style.opacity='.7'; }
  let priceLockIcon2 = document.getElementById('price-lock-icon');
  if(priceLockIcon2) priceLockIcon2.innerHTML = translate('rental.passwordRequired');
  // KM Out
  let kmOut = document.getElementById('r-km-out');
  if(kmOut){ kmOut.readOnly=true; kmOut.style.cursor='not-allowed'; kmOut.style.opacity='.7'; kmOut.style.background='var(--s2)'; }
  let kmoutIconLock = document.getElementById('kmout-lock-icon'); if(kmoutIconLock) kmoutIconLock.innerHTML='';
  // Date Out
  let dateOut = document.getElementById('r-out');
  if(dateOut){ dateOut.readOnly=true; dateOut.style.cursor='not-allowed'; dateOut.style.opacity='.7'; }
  // Vehicle Name & Plate & Tel (read-only in edit)
  ['r-vname','r-plate','r-tel'].forEach(id=>{
    let el=document.getElementById(id);
    if(el){ el.readOnly=true; el.style.cursor='not-allowed'; el.style.opacity='.7'; }
  });
  // Contract N° — lock via dedicated function (shows lock icon)
  lockContractField();
  // Fuel selects → disable Fuel OUT only (Fuel IN locked once set, password to edit)
  let fo=document.getElementById('r-fuel-out'); if(fo){ fo.disabled=true; fo.style.opacity='.7'; fo.style.cursor='not-allowed'; }
  let fuelOutIconLock = document.getElementById('fuelout-lock-icon'); if(fuelOutIconLock) fuelOutIconLock.innerHTML='';
  // Fuel IN — lock once set (requires password to edit again)
  lockFuelInField();
  // Clean Before radios → disable; Clean After — lock once set (requires password to edit again)
  document.querySelectorAll('input[name="clean-before"]').forEach(el=>{ el.disabled=true; });
  lockCleanAfterField();
  // Notes — always editable (not locked after save)
  let notes=document.getElementById('r-notes'); if(notes){ notes.readOnly=false; notes.style.cursor=''; notes.style.opacity='1'; }
  // KM Rate select
  let kmRate=document.getElementById('r-km-rate'); if(kmRate){ kmRate.disabled=true; kmRate.style.opacity='.7'; }
  // Car type buttons → disable
  let cs=document.getElementById('car-type-small'); if(cs){ cs.disabled=true; cs.style.cursor='not-allowed'; cs.style.opacity='.8'; }
  let c4=document.getElementById('car-type-4x4');   if(c4){ c4.disabled=true; c4.style.cursor='not-allowed'; c4.style.opacity='.8'; }
  // Duration buttons → disable (both dynamic pickers and static HTML buttons)
  document.querySelectorAll('#small-duration-picker button,#car-type-4x4-options button').forEach(el=>{ el.disabled=true; el.style.cursor='not-allowed'; el.style.opacity='.6'; });
  document.querySelectorAll('[onclick*="applySmall"],[onclick*="apply4x4"]').forEach(function(el){ el.disabled=true; el.style.cursor='not-allowed'; el.style.opacity='.6'; });
  // Show locked banner
  let banner = document.getElementById('rental-locked-banner');
  if(!banner){
    banner = document.createElement('div');
    banner.id = 'rental-locked-banner';
    banner.style.cssText = 'background:rgba(124,58,237,.1);border:1.5px solid #7c3aed;border-radius:8px;padding:8px 14px;margin-bottom:12px;font-size:.78rem;color:#7c3aed;font-weight:700;display:flex;align-items:center;gap:8px';
    banner.innerHTML = '🔒 Rental saved — fields locked. Only KM In and Date In are editable. Price, Fuel In, Condition After and other fields require password.';
    let body = document.querySelector('#modal-rental .modal-body');
    if(body) body.insertBefore(banner, body.firstChild);
  } else { banner.style.display='flex'; }
}


// ── unlockAllRentalFields (orig. line 4946) ──
function unlockAllRentalFields(){
  ['r-vname','r-plate','r-tel','r-km-out','r-out','r-notes'].forEach(id=>{
    let el=document.getElementById(id); if(el){ el.readOnly=false; el.style.cursor='text'; el.style.opacity='1'; }
  });
  // Contract N° — unlock directly (password already verified by caller)
  let cElU = document.getElementById('r-contract');
  if(cElU){ cElU.readOnly=false; cElU.style.cursor='text'; cElU.style.opacity='1'; cElU.style.background=''; cElU.style.borderColor='#f97316'; }
  let cIconU = document.getElementById('contract-lock-icon');
  if(cIconU){ cIconU.innerHTML='🔓 Unlocked'; cIconU.style.color='#f97316'; }
  // Unlock price/day
  let priceElU = document.getElementById('r-price');
  if(priceElU){ priceElU.readOnly=false; priceElU.style.cursor='text'; priceElU.style.opacity='1'; }
  let priceLockIconU = document.getElementById('price-lock-icon');
  if(priceLockIconU) priceLockIconU.innerHTML = '🔓 Unlocked';
  let fo=document.getElementById('r-fuel-out'); if(fo){ fo.disabled=false; fo.style.opacity='1'; fo.style.cursor=''; }
  let fi=document.getElementById('r-fuel-in');  if(fi){ fi.disabled=false; fi.style.opacity='1'; fi.style.cursor=''; }
  let fuelinIconU=document.getElementById('fuelin-lock-icon'); if(fuelinIconU) fuelinIconU.innerHTML='';
  document.querySelectorAll('input[name="clean-before"],input[name="clean-after"]').forEach(el=>{ el.disabled=false; });
  let caGroupU=document.getElementById('clean-after-group'); if(caGroupU){ caGroupU.setAttribute('data-locked','0'); caGroupU.style.opacity='1'; }
  let cleanafterIconU=document.getElementById('cleanafter-lock-icon'); if(cleanafterIconU) cleanafterIconU.innerHTML='';
  let notes=document.getElementById('r-notes'); if(notes){ notes.readOnly=false; notes.style.cursor=''; notes.style.opacity='1'; }
  let kmRate=document.getElementById('r-km-rate'); if(kmRate){ kmRate.disabled=false; kmRate.style.opacity='1'; }
  let cs=document.getElementById('car-type-small'); if(cs){ cs.disabled=false; cs.style.cursor='pointer'; cs.style.opacity='1'; }
  let c4=document.getElementById('car-type-4x4');   if(c4){ c4.disabled=false; c4.style.cursor='pointer'; c4.style.opacity='1'; }
  document.querySelectorAll('#small-duration-picker button,#car-type-4x4-options button').forEach(el=>{ el.disabled=false; el.style.cursor='pointer'; el.style.opacity='1'; });
  let banner=document.getElementById('rental-locked-banner'); if(banner) banner.style.display='none';
}


// ── editRental (orig. line 7850) ──
function editRental(id){
  _lastSvcPopupPlate=''; let existingSvcPopup=document.getElementById('svc-plate-popup'); if(existingSvcPopup) existingSvcPopup.remove();
  window._allFieldsUnlocked = false; // reset unlock state
  window._balManuallyEdited = false; // reset BAL manual edit flag
  window._currentRentalClientId = null;
  let r = DB.rentals.find(r=>r.id===id);
  if(!r) return;
  // Pre-fill client ID from rental._clientId
  if(r._clientId){
    window._currentRentalClientId = r._clientId;
    let foundClient = (DB.clients||[]).find(c => c.id === r._clientId);
    let rcid = document.getElementById('r-client-id');
    let rcst = document.getElementById('r-client-status');
    if(rcid && foundClient){ rcid.value = foundClient.idcard || ''; }
    if(rcst && foundClient){
      rcst.textContent = '✅ ' + (foundClient.firstname||'');
      rcst.style.background='rgba(22,163,74,.1)'; rcst.style.border='1px solid rgba(22,163,74,.4)'; rcst.style.color='#16a34a';
    }
  } else {
    let rcid = document.getElementById('r-client-id'); if(rcid) rcid.value = '';
    let rcst = document.getElementById('r-client-status'); if(rcst){ rcst.textContent=translate('rental.noClient'); rcst.style.background='var(--s2)'; rcst.style.border='1px solid var(--border)'; rcst.style.color='var(--muted)'; }
  }
  let v = r.vehicleId ? (DB.vehicles.find(v=>v.id===r.vehicleId)||{}) : {};
  document.getElementById('r-vname').value = v.name || r._name || '';
  document.getElementById('r-plate').value = v.plate || r._plate || '';
  document.getElementById('r-contract').value = r.contract;
  lockContractField(); // verrouiller immédiatement — déverrouillage par mot de passe uniquement
  document.getElementById('r-price').value = r.price;
  // Also pre-fill price-base-input if visible
  setTimeout(()=>{ let bpi=document.getElementById('price-base-input'); if(bpi && r.basePrice) bpi.value=r.basePrice; else if(bpi && r.price) bpi.value=r.price; }, 150);
  document.getElementById('r-out').value = r.dateOut || '';
  let dateInEditEl = document.getElementById('r-in');
  if(dateInEditEl){ dateInEditEl.value = r.dateIn || ''; dateInEditEl.readOnly = true; dateInEditEl.style.cursor = 'not-allowed'; dateInEditEl.style.opacity = '.7'; dateInEditEl.style.borderColor = ''; dateInEditEl.style.background = ''; }
  let dateinIconEdit = document.getElementById('datein-lock-icon'); if(dateinIconEdit){ dateinIconEdit.textContent = '🔒 Click to edit'; dateinIconEdit.style.color = 'var(--muted)'; }
  document.getElementById('r-km-out').value = r.kmOut || '';
  document.getElementById('r-km-in').value = r.kmIn || '';
  // KM Out / Fuel Out — always editable when editing an existing rental
  lockKmOutField(false);
  lockFuelOutField(false);
  // Construire la liste des payments directement depuis DB.payments (source de verite unique)
  // Inclut automatiquement quickAdd (receipt QA...) et payments avec receipt normaux
  let _dbPayments = paymentsForContract(r.contract, r.branch, r.vehicleId);
  let _baseLog = _dbPayments.map(p => ({
    amount: Number(p.paid || p.price||0),
    date: p.dateOut||'',
    method: p.paymentMethod||'CASH',
    receipt: p.receipt||'',
    id: p.id,
    _quickAdd: p._quickAdd||false,
    _internalId: p._internalId||''
  }));
  // Legacy fallback: si pas de payments dans DB.payments mais r.paymentLog existe
  if(!_baseLog.length && (r.paymentLog||[]).length > 0){
    _baseLog = JSON.parse(JSON.stringify(r.paymentLog));
  }
  // Legacy fallback ultime: si toujours vide et r.paid > 0
  if(!_baseLog.length && Number(r.paid||0) > 0){
    _baseLog = [{ amount: Number(r.paid), date: r.dateOut ? r.dateOut.slice(0,10) : new Date().toISOString().slice(0,10), method:'CASH', receipt:'', id: Date.now() }];
  }
  window._editingRentalPayments = _baseLog;
  renderPaymentHistory();
  let todayVal = new Date().toISOString().slice(0,10);
  let paidDateEl = document.getElementById('r-paid-date');
  if(paidDateEl) paidDateEl.value = todayVal;
  document.getElementById('r-paid').value = r.paid || 0;
  let kmInEl = document.getElementById('r-km-in'); if(r.kmIn && Number(r.kmIn) > 0){ kmInEl.readOnly = true; kmInEl.style.cursor='not-allowed'; kmInEl.style.opacity='.7'; let icon = document.getElementById('kmin-lock-icon'); if(icon) icon.innerHTML = translate('rental.lockedOnceSet'); } else { kmInEl.readOnly = false; kmInEl.style.cursor='text'; kmInEl.style.opacity='1'; }
  // Load CANCELLED state
  let cancelCk2 = document.getElementById('r-cancelled-check');
  if(cancelCk2){ cancelCk2.checked = r._cancelled === true; onCancelledToggle(r._cancelled === true); }
  // Load NOTICE state (cosmetic only)
  let noticeCk2 = document.getElementById('r-notice-check');
  if(noticeCk2){ noticeCk2.checked = r._notice === true; onNoticeToggle(r._notice === true); }
  // Load TEMP REPLACEMENT state — locked (password required to uncheck) once saved as temp
  let tempCk2 = document.getElementById('r-temp-replacement-check');
  let tempSelWrap2 = document.getElementById('temp-replacement-select-wrap');
  let tempSel2 = document.getElementById('r-temp-replaces-id');
  let tempWrap2 = document.getElementById('temp-toggle-wrap');
  if(tempCk2){
    let isTemp2 = r._tempReplacement === true;
    tempCk2.checked = isTemp2;
    tempCk2.setAttribute('data-locked', isTemp2 ? '1' : '0');
    if(isTemp2){
      if(tempSelWrap2) tempSelWrap2.style.display = 'flex';
      populateTempReplacementSelect();
      if(tempSel2){ tempSel2.value = r._linkedRentalId || ''; tempSel2.disabled = true; }
    } else {
      if(tempSelWrap2) tempSelWrap2.style.display = 'none';
      if(tempSel2){ tempSel2.value = ''; tempSel2.disabled = false; }
    }
    if(tempWrap2) tempWrap2.style.background = isTemp2 ? 'rgba(124,58,237,.35)' : 'rgba(124,58,237,.15)';
  }
  let cbBef = document.getElementById(r.cleanBefore==='dirty' ? 'r-clean-before-no' : (r.cleanBefore==='clean' ? 'r-clean-before-yes' : null));
  document.querySelectorAll('input[name="clean-before"]').forEach(el=>el.checked=false);
  if(cbBef) cbBef.checked = true;
  document.querySelectorAll('input[name="clean-after"]').forEach(el=>{ el.checked=false; el.disabled=false; });
  let caAft = r.cleanAfter ? document.getElementById(r.cleanAfter==='dirty' ? 'r-clean-after-no' : 'r-clean-after-yes') : null;
  if(caAft) caAft.checked = true;
  let caGroup = document.getElementById('clean-after-group');
  let caIcon = document.getElementById('cleanafter-lock-icon');
  if(r.cleanAfter){
    document.querySelectorAll('input[name="clean-after"]').forEach(el=>{ el.disabled = true; });
    if(caGroup){ caGroup.setAttribute('data-locked','1'); caGroup.style.opacity='.7'; }
    if(caIcon) caIcon.innerHTML = translate('rental.lockedOnceSet');
  } else {
    if(caGroup){ caGroup.setAttribute('data-locked','0'); caGroup.style.opacity='1'; }
    if(caIcon) caIcon.innerHTML = '';
  }
  let foEl = document.getElementById('r-fuel-out'); let fiEl = document.getElementById('r-fuel-in');
  if(foEl) foEl.value = (r.fuelOut !== undefined && r.fuelOut !== null) ? String(r.fuelOut) : '';
  if(fiEl) fiEl.value = (r.fuelIn !== undefined && r.fuelIn !== null) ? String(r.fuelIn) : '';
  let fiIcon = document.getElementById('fuelin-lock-icon');
  if(fiEl && r.fuelIn !== undefined && r.fuelIn !== null && r.fuelIn !== ''){
    fiEl.disabled = true; fiEl.style.cursor='not-allowed'; fiEl.style.opacity='.7';
    if(fiIcon) fiIcon.innerHTML = translate('rental.lockedOnceSet');
  } else if(fiEl) {
    fiEl.disabled = false; fiEl.style.cursor=''; fiEl.style.opacity='1';
    if(fiIcon) fiIcon.innerHTML = '';
  }
  let kdEl = document.getElementById('r-km-day'); if(kdEl) kdEl.value = String(r.kmPerDay||0);
  let krEl = document.getElementById('r-km-rate'); if(krEl) krEl.value = String(Number(r.kmRate || 0.050).toFixed(3));
  document.getElementById('r-tel').value = r.tel||'';
  document.getElementById('r-notes').value = r.notes||'';
  // Load available contracts for carry forward + pre-fill if editing
  // FIX (2026-09) : reset INCONDITIONNEL de #r-cf-amount (+ panneau info) AVANT toute
  // autre logique, quel que soit l'état de CE contrat — l'ancien code ne touchait ce
  // champ que si r._carryForwardSourceId était déjà vrai, donc éditer un contrat SANS
  // lien CF laissait tel quel un montant provenant d'un contrat consulté juste avant.
  let cfAmountResetEdit = document.getElementById('r-cf-amount');
  if(cfAmountResetEdit) cfAmountResetEdit.value = '';
  let cfInfoResetEdit = document.getElementById('r-cf-source-info');
  if(cfInfoResetEdit) cfInfoResetEdit.style.display = 'none';
  if(r._clientId){
    loadClientContractsForCarryForward(r._clientId);
    if(r._carryForwardSourceId){
      let cfSourceContractEl = document.getElementById('r-cf-source-contract');
      if(cfSourceContractEl) cfSourceContractEl.value = r._carryForwardSourceId;
      onCarryForwardSourceSelect(r._carryForwardSourceId);
    }
  } else {
    let cfSourceContractElReset = document.getElementById('r-cf-source-contract');
    if(cfSourceContractElReset) cfSourceContractElReset.innerHTML = `<option value="">${translate('cf.selectPlaceholder')}</option>`;
  }
  let balEl = document.getElementById('r-bal'); if(balEl) balEl.value = (r.bal !== undefined && r.bal !== null && r.bal !== '') ? r.bal : '';
  let expRetEl = document.getElementById('r-exp-return'); if(expRetEl) expRetEl.value = r.expectedReturn || '';
  document.getElementById('modal-rental').setAttribute('data-edit-id', id);
  lockBalField(); lockPriceField();
  document.getElementById('modal-rental').setAttribute('data-type-locked','1');
  if(r.contractType){
    window._currentDuration = r.contractType; window._currentCarType = r.carType || 'small';
    let color = (r.carType === '4x4') ? '#7c3aed' : '#2563eb';
    let carLabel = (r.carType === '4x4') ? '4×4' : 'Sedan/SUV';
    let data = CAR_TYPES[r.carType || 'small'][r.contractType] || {};
    let ctSmall = document.getElementById('car-type-small'); let ct4x4 = document.getElementById('car-type-4x4');
    if(ctSmall){ ctSmall.style.borderColor = window._currentCarType==='small'?'#2563eb':'#e2e8f0'; ctSmall.style.background = window._currentCarType==='small'?'rgba(37,99,235,.07)':'#f8fafc'; }
    if(ct4x4){ ct4x4.style.borderColor = window._currentCarType==='4x4'?'#7c3aed':'#e2e8f0'; ct4x4.style.background = window._currentCarType==='4x4'?'rgba(124,58,237,.07)':'#f8fafc'; }
    _applyCarTypeData(data, carLabel, color, r.contractType, r.carType || 'small');
    setTimeout(()=>{
      let bpInp = document.getElementById('price-base-input');
      if(bpInp && r.basePrice){ bpInp.value = r.basePrice; computeSmartPrice(); }
      let priceEl = document.getElementById('r-price'); if(priceEl) priceEl.value = r.price;
      // Auto-lock price-base-input since this is an existing contract
      if(bpInp && Number(bpInp.value) > 0){ lockBasePrice(); }
    }, 120);
  }
  lockAllRentalFields();
  // Show unlock-all button in edit mode, hide unlock-new-btn
  let unlockAllBtn = document.getElementById('unlock-all-btn');
  if(unlockAllBtn) unlockAllBtn.style.display = 'inline-flex';
  let unlockNewBtn = document.getElementById('unlock-new-btn');
  if(unlockNewBtn) unlockNewBtn.style.display = 'none';
  openModal('modal-rental');
}


// ── deleteRental (orig. line 7980) ──
function deleteRental(id){ 
  let idx = DB.rentals.findIndex(r => r.id === id); 
  if(idx === -1) return; 
  securePrompt('🗑️ Enter password to delete contract ' + DB.rentals[idx].contract).then(password => {
    if(password === null) return;
    checkPassword(password, 'Delete Rental — Cont. ' + DB.rentals[idx].contract).then(function(ok){
    if(ok){
      let r = DB.rentals[idx]; 
      let v = r.vehicleId ? (DB.vehicles.find(x=>x.id===r.vehicleId)||{}) : {}; 
      logAction('delete', 'Rental Deleted — Cont. '+r.contract, 'Plate: '+(v.plate||r._plate||'?')+' | Price: '+r.price+' OMR | Date Out: '+r.dateOut+' | BAL: '+(r.bal ?? '—')+' OMR', 'Cont. '+r.contract+' · '+(v.plate||r._plate||'?')); 
      updateLogBadge(); 
      pushUndo(); 
      DB.rentals.splice(idx, 1); 
      // ── FIX (2026-07) : notifier le serveur EXPLICITEMENT de la suppression.
      // Depuis le correctif anti-perte-de-données, /save (sauvegarde complète)
      // ne supprime plus rien par déduction — donc sans cet appel, ce contrat
      // réapparaîtrait tout seul au prochain chargement (le serveur ne saurait
      // jamais qu'il a été supprimé). Sans risque si le contrat n'était pas
      // encore synchronisé côté serveur (delete-one sur un id inexistant = no-op).
      if(typeof deleteOne === 'function') deleteOne('rentals', id, null);
      refreshAll(); 
      showUndoToast('🗑️ Deleted — <strong style="cursor:pointer;text-decoration:underline" data-i18n-action="undo">UNDO</strong> &nbsp;|&nbsp; Press Save to confirm'); 
    } else {
      toast(translate('rental.wrongPasswordExclaim'));
    }
    }); // end checkPassword
  }); // end securePrompt
}

// ── deleteRentalUndo (orig. line 7998) ──
function deleteRentalUndo(id){ deleteRental(id); }


// ==== RECEIPT DATE VALIDATION ====
// ── validateReceiptDate (orig. line 10929) ──
function validateReceiptDate(){

    let contractOut = document.getElementById('r-out');
    let receiptInput = document.getElementById('receipt-date-input');

    if(!contractOut || !receiptInput) return true;

    let contractDateOut = new Date(contractOut.value);
    let recuDate = new Date(receiptInput.value);

    if (recuDate < contractDateOut) {
        alert(translate('rental.alertReceiptDateBeforeContract'));
        return false;
    }

    return true;
}


// ==== BALANCE PATCH ====
// ── recalcFormTotal (FIXED VERSION — UNIQUE définition) ──
// NOTE: r-bal est readonly et calculé par calcRentalBAL() (rentals fermées)
// ou calcOpenContractBAL() (rentals ouvertes). r-total-due et r-balance
// n'existent plus dans app.html, donc cette fonction est un no-op volontaire
// pour éviter les erreurs quand r-paid change (oninput dans app.html).
function recalcFormTotal(){
   let balEl = document.getElementById('r-bal');
   if(!balEl) return;
   // Le calcul réel du solde est délégué à calcRentalBAL() / calcOpenContractBAL()
}
