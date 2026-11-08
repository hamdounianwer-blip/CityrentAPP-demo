// ═══════════════════════════════════════════════════════════════════
// module-daily-rentals-temp.js
// TEMP REPLACEMENT — remplacement temporaire de véhicule
// Extrait automatiquement de module-daily-rentals.js (découpage mécanique,
// aucune ligne modifiée — tout reste en portée globale, comme avant).
// ═══════════════════════════════════════════════════════════════════


// ── TEMP REPLACEMENT VEHICLE — voir conversation design (badges croisés, _balManual=true, bal=0, verrouillage password) ──
// Index performant (même pattern que _getPaymentsIndex) : linkedRentalId -> rental temp qui le remplace.
// Évite de rescanner tout DB.rentals à chaque ligne rendue dans buildLigne/buildOcRow.
let _tempLinkIdxCache = null;
let _tempLinkIdxRef = null;
let _tempLinkIdxLen = -1;
function _getTempLinkIndex(){
  if(_tempLinkIdxCache && _tempLinkIdxRef === DB.rentals && _tempLinkIdxLen === DB.rentals.length) return _tempLinkIdxCache;
  let idx = new Map();
  for(let i=0;i<DB.rentals.length;i++){
    let r = DB.rentals[i];
    if(r._tempReplacement === true && r._linkedRentalId){
      idx.set(Number(r._linkedRentalId), r);
    }
  }
  _tempLinkIdxCache = idx;
  _tempLinkIdxRef = DB.rentals;
  _tempLinkIdxLen = DB.rentals.length;
  return idx;
}

function findTempReplacementFor(rentalId){
  return _getTempLinkIndex().get(Number(rentalId)) || null;
}


// ── onTempReplacementToggle — checkbox "🔄 Voiture temporaire" dans New Rental ──
function onTempReplacementToggle(checked){
  let cb = document.getElementById('r-temp-replacement-check');
  let selWrap = document.getElementById('temp-replacement-select-wrap');
  let wrap = document.getElementById('temp-toggle-wrap');
  if(checked){
    // Si ce contract est déjà sauvegardé en tant que temp (data-locked=1), on ne devrait
    // jamais arriver ici en checked=true depuis un état non-coché — cas normal uniquement.
    if(selWrap) selWrap.style.display = 'flex';
    populateTempReplacementSelect();
    if(wrap) wrap.style.background = 'rgba(124,58,237,.35)';
  } else {
    // Tentative de décocher — si le contract est verrouillé (déjà sauvegardé en temp),
    // on bloque et on redemande le mot de passe au lieu de laisser décocher directement.
    if(cb && cb.getAttribute('data-locked') === '1'){
      cb.checked = true; // revert immédiat
      unlockTempReplacement();
      return;
    }
    if(selWrap) selWrap.style.display = 'none';
    let linkSel = document.getElementById('r-temp-replaces-id'); if(linkSel) linkSel.value = '';
    if(wrap) wrap.style.background = 'rgba(124,58,237,.15)';
  }
}


// ── populateTempReplacementSelect — liste des contracts ouverts pouvant être remplacés ──
function populateTempReplacementSelect(){
  let sel = document.getElementById('r-temp-replaces-id');
  if(!sel) return;
  let editId = document.getElementById('modal-rental').getAttribute('data-edit-id');
  let selfId = editId ? Number(editId) : null;
  let opens = DB.rentals.filter(r => (!r.dateIn || r.dateIn === '') && !r._cancelled && !r._tempReplacement && r.id !== selfId);
  opens.sort((a,b) => Number(b.contract||0) - Number(a.contract||0));
  let prevVal = sel.value;
  sel.innerHTML = '<option value="">— Select the open contract to replace —</option>' + opens.map(r => {
    let v = r.vehicleId ? (DB.vehicles.find(x=>x.id===r.vehicleId)||{}) : {};
    let plate = v.plate || r._plate || '—';
    let name = v.name || r._name || '';
    return `<option value="${r.id}">#${r.contract||'—'} — ${escapeHtml(name)} ${escapeHtml(plate)}</option>`;
  }).join('');
  if(prevVal) sel.value = prevVal;
}


// ── onTempReplacesSelectChange — dès qu'un contract est choisi : price=0, bal=0 gelé ──
function onTempReplacesSelectChange(val){
  if(!val) return;
  let priceEl = document.getElementById('r-price');
  if(priceEl) priceEl.value = 0;
  // getFormPrice() donne PRIORITÉ à price-base-input (weekly/monthly) sur r-price —
  // il faut aussi le vider, sinon un contract weekly/monthly sauvegarderait le prix
  // de base réel au lieu de 0.
  let baseInp = document.getElementById('price-base-input');
  if(baseInp) baseInp.value = 0;
  let balEl = document.getElementById('r-bal');
  if(balEl) balEl.value = 0;
  window._balManuallyEdited = true; // réutilise le mécanisme _balManual existant — bal gelé à 0
}


// ── unlockTempReplacement — repasser un contract temp vers un contract normal (password requis) ──
async function unlockTempReplacement(){
  let cb = document.getElementById('r-temp-replacement-check');
  let contractVal = document.getElementById('r-contract') ? document.getElementById('r-contract').value : '';
  const pw = await securePrompt('🔒 This contract is marked as a TEMPORARY REPLACEMENT vehicle (0 OMR).\n\nEnter password to convert it back to a normal contract:');
  if(pw === null) return;
  const ok = await checkPassword(pw, 'Daily Rentals — Unlock Temp Replacement (Contract ' + contractVal + ')');
  if(!ok){ toast('❌ Wrong password.'); return; }
  if(cb){ cb.checked = false; cb.setAttribute('data-locked','0'); cb.disabled = false; }
  let selWrap = document.getElementById('temp-replacement-select-wrap'); if(selWrap) selWrap.style.display = 'none';
  let linkSel = document.getElementById('r-temp-replaces-id'); if(linkSel){ linkSel.value = ''; linkSel.disabled = false; }
  // Le prix repasse à vide — le staff doit le resaisir manuellement (aucun prix par défaut).
  let priceEl = document.getElementById('r-price');
  if(priceEl){ priceEl.value = ''; priceEl.readOnly = false; priceEl.style.opacity = '1'; priceEl.style.cursor = 'text'; }
  let baseInp2 = document.getElementById('price-base-input');
  if(baseInp2) baseInp2.value = '';
  window._balManuallyEdited = false;
  let wrap = document.getElementById('temp-toggle-wrap'); if(wrap) wrap.style.background = 'rgba(124,58,237,.15)';
  logAction('security', '🔓 Daily Rentals — Temp Replacement UNLOCKED (Contract ' + contractVal + ')', 'Converted back to a normal contract — price cleared, must be re-entered by staff.', 'Cont. ' + contractVal);
  toast('✅ Unlocked — please re-enter the price/day.');
}


// ── tempPanelFor — bloc de détails COMPLET (pas juste un badge) intégré directement dans la
// carte, pour que l'info du contrat lié soit visible sans avoir à naviguer/scroller, même quand
// les deux cartes sont dans des sections totalement différentes de la page (mois courant vs
// anciens contrats ouverts, ou Open Contracts vs Daily Rentals). ──
function tempPanelFor(r, viewYm){
  if(r._tempReplacement === true){
    let orig = r._linkedRentalId ? DB.rentals.find(x => x.id === Number(r._linkedRentalId)) : null;
    if(!orig) return '';
    let ov = orig.vehicleId ? (DB.vehicles.find(x=>x.id===orig.vehicleId)||{}) : {};
    let oPlate = ov.plate || orig._plate || '—';
    let oName = ov.name || orig._name || '—';
    let oClient = orig._clientId ? (DB.clients||[]).find(c => c.id === orig._clientId) : null;
    let oClientName = escapeHtml(orig._clientName || (oClient ? (oClient.firstname||'') : ''));
    let oOpen = !orig.dateIn || orig.dateIn === '';
    return `<div class="oc-temp-panel" data-dr-action="jump-rental" data-dr-id="${orig.id}" style="cursor:pointer;margin:8px 0;padding:9px 11px;border-radius:9px;background:rgba(124,58,237,.08);border:1.5px solid rgba(124,58,237,.3);display:flex;align-items:center;gap:9px">
      <span style="font-size:1.05rem;line-height:1;flex-shrink:0">🔄</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:.62rem;font-weight:800;color:#a78bfa;text-transform:uppercase;letter-spacing:.4px">Temporary replacement for</div>
        <div style="font-size:.84rem;font-weight:700;color:var(--text)">${escapeHtml(oName)} ${escapeHtml(oPlate)} <span style="color:var(--muted);font-weight:600">#${orig.contract||'?'}</span></div>
        <div style="font-size:.7rem;color:var(--muted)">${oClientName ? oClientName+' · ' : ''}Out since ${fmtDate(orig.dateOut)}${oOpen ? '' : ' · Returned ' + fmtDate(orig.dateIn)}</div>
      </div>
      <span style="font-size:.68rem;font-weight:700;color:#a78bfa;white-space:nowrap;flex-shrink:0">View →</span>
    </div>`;
  } else {
    let linkedTemp = findTempReplacementFor(r.id);
    if(!linkedTemp) return '';
    let isTempOpen = !linkedTemp.dateIn || linkedTemp.dateIn === '';
    if(!isTempOpen){
      // Contrat temp déjà rendu — ce panneau n'a de sens que pour le mois où ça s'est passé.
      // Dans les mois suivants, la carte de l'original redevient normale (info consultable
      // dans Daily Rentals du mois de clôture du temp).
      let closedYm = (linkedTemp.dateIn||'').slice(0,7);
      if(viewYm && closedYm !== viewYm) return '';
    }
    let tv = linkedTemp.vehicleId ? (DB.vehicles.find(x=>x.id===linkedTemp.vehicleId)||{}) : {};
    let tPlate = tv.plate || linkedTemp._plate || '—';
    let tName = tv.name || linkedTemp._name || '—';
    let bg = isTempOpen ? 'rgba(245,158,11,.1)' : 'rgba(100,116,139,.1)';
    let border = isTempOpen ? 'rgba(245,158,11,.35)' : 'rgba(100,116,139,.3)';
    let labelColor = isTempOpen ? '#d97706' : '#64748b';
    let statusText = isTempOpen ? 'Temp replacement — currently out' : 'Temp replacement — returned';
    return `<div class="oc-temp-panel" data-dr-action="jump-rental" data-dr-id="${linkedTemp.id}" style="cursor:pointer;margin:8px 0;padding:9px 11px;border-radius:9px;background:${bg};border:1.5px solid ${border};display:flex;align-items:center;gap:9px">
      <span style="font-size:1.05rem;line-height:1;flex-shrink:0">${isTempOpen ? '🔁' : '✅'}</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:.62rem;font-weight:800;color:${labelColor};text-transform:uppercase;letter-spacing:.4px">${statusText}</div>
        <div style="font-size:.84rem;font-weight:700;color:var(--text)">${escapeHtml(tName)} ${escapeHtml(tPlate)} <span style="color:var(--muted);font-weight:600">#${linkedTemp.contract||'?'}</span></div>
        <div style="font-size:.7rem;color:var(--muted)">Out ${fmtDate(linkedTemp.dateOut)}${isTempOpen ? '' : ' · Returned ' + fmtDate(linkedTemp.dateIn)}</div>
      </div>
      <span style="font-size:.68rem;font-weight:700;color:${labelColor};white-space:nowrap;flex-shrink:0">View →</span>
    </div>`;
  }
}


// ── tempInlineTextFor — version compacte (une ligne, sans box) du panneau temp, pour les
// lignes de tableau (Daily Rentals) où une box complète casserait la mise en page. ──
function tempInlineTextFor(r, viewYm){
  if(r._tempReplacement === true){
    let orig = r._linkedRentalId ? DB.rentals.find(x => x.id === Number(r._linkedRentalId)) : null;
    if(!orig) return '';
    let ov = orig.vehicleId ? (DB.vehicles.find(x=>x.id===orig.vehicleId)||{}) : {};
    let oPlate = ov.plate || orig._plate || '—';
    let oName = ov.name || orig._name || '—';
    return `<div data-dr-action="jump-rental" data-dr-id="${orig.id}" style="cursor:pointer;font-size:.65rem;font-weight:700;color:#a78bfa;white-space:nowrap;margin-top:2px" title="Click to view original contract">🔄 Replaces ${escapeHtml(oName)} ${escapeHtml(oPlate)} · #${orig.contract||'?'}</div>`;
  } else {
    let linkedTemp = findTempReplacementFor(r.id);
    if(!linkedTemp) return '';
    let isTempOpen = !linkedTemp.dateIn || linkedTemp.dateIn === '';
    if(!isTempOpen){
      let closedYm = (linkedTemp.dateIn||'').slice(0,7);
      if(viewYm && closedYm !== viewYm) return '';
    }
    let tv = linkedTemp.vehicleId ? (DB.vehicles.find(x=>x.id===linkedTemp.vehicleId)||{}) : {};
    let tPlate = tv.plate || linkedTemp._plate || '—';
    let tName = tv.name || linkedTemp._name || '—';
    let color = isTempOpen ? '#d97706' : '#64748b';
    let icon = isTempOpen ? '🔁' : '✅';
    return `<div data-dr-action="jump-rental" data-dr-id="${linkedTemp.id}" style="cursor:pointer;font-size:.65rem;font-weight:700;color:${color};white-space:nowrap;margin-top:2px" title="Click to view temp contract">${icon} Temp: ${escapeHtml(tName)} ${escapeHtml(tPlate)} · #${linkedTemp.contract||'?'}${isTempOpen?'':' (returned)'}</div>`;
  }
}


// ── tempBadgesFor — construit les badges croisés pour une ligne (Daily Rentals + Open Contracts) ──
function tempBadgesFor(r, viewYm){
  let html = '';
  if(r._tempReplacement === true){
    let orig = r._linkedRentalId ? DB.rentals.find(x => x.id === Number(r._linkedRentalId)) : null;
    let origContract = orig ? (orig.contract || '?') : '?';
    html += `<span data-dr-action="jump-rental" data-dr-id="${Number(r._linkedRentalId)||0}" style="cursor:pointer;background:#7c3aed;color:#fff;font-size:.6rem;font-weight:800;border-radius:20px;padding:2px 8px;margin-left:4px;white-space:nowrap" title="Click to view original contract">🔄 Temp for #${origContract}</span>`;
  } else {
    let linkedTemp = findTempReplacementFor(r.id);
    if(linkedTemp){
      let isTempOpen = !linkedTemp.dateIn || linkedTemp.dateIn === '';
      let showIt = true;
      if(!isTempOpen){
        let closedYm = (linkedTemp.dateIn||'').slice(0,7);
        if(viewYm && closedYm !== viewYm) showIt = false;
      }
      if(showIt){
        let tv = linkedTemp.vehicleId ? (DB.vehicles.find(x=>x.id===linkedTemp.vehicleId)||{}) : {};
        let tPlate = tv.plate || linkedTemp._plate || '—';
        html += isTempOpen
          ? `<span data-dr-action="jump-rental" data-dr-id="${linkedTemp.id}" style="cursor:pointer;background:#f59e0b;color:#1e293b;font-size:.6rem;font-weight:800;border-radius:20px;padding:2px 8px;margin-left:4px;white-space:nowrap" title="Click to view temp contract">🔁 Temp active: ${escapeHtml(tPlate)} (#${linkedTemp.contract||'?'})</span>`
          : `<span data-dr-action="jump-rental" data-dr-id="${linkedTemp.id}" style="cursor:pointer;background:#64748b;color:#fff;font-size:.6rem;font-weight:800;border-radius:20px;padding:2px 8px;margin-left:4px;white-space:nowrap" title="Click to view temp contract">🔁 Temp returned: ${escapeHtml(tPlate)} (#${linkedTemp.contract||'?'})</span>`;
      }
    }
  }
  // Ajouter le badge de crédit reporté
  html += carryForwardBadgeFor(r);
  return html;
}
