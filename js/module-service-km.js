// ── showServicePopupForPlate — bulle Service & KM affichée dès la saisie d'une plaque valide (New Rental) ──
let _lastSvcPopupPlate = '';
function showServicePopupForPlate(v, anchorEl){
  if(!v) return;
  let plateKey = (v.plate||'').toUpperCase();
  if(plateKey === _lastSvcPopupPlate) return; // déjà affiché pour ce véhicule
  _lastSvcPopupPlate = plateKey;

  let existing = document.getElementById('svc-plate-popup');
  if(existing) existing.remove();

  let latestKm = (typeof getLatestKmFromRentals === 'function') ? getLatestKmFromRentals(v.id, v.plate) : null;
  let currentKm = (latestKm !== null && latestKm > 0) ? latestKm : (v.todayKm || 0);
  let targetKm = v.svcKm || 0;
  let diffKm = targetKm > 0 ? Math.round(targetKm - currentKm) : null;

  let diffColor = diffKm === null ? 'var(--muted)' : diffKm <= 0 ? '#ef4444' : diffKm < 1000 ? '#f97316' : '#22c55e';
  let diffText = diffKm === null
    ? '—'
    : diffKm <= 0
      ? '⚠️ ' + translate('svc.serviceDue')
      : diffKm.toLocaleString() + ' km';

  let fmtD = d => { if(!d) return '—'; let m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3]+'/'+m[2]+'/'+m[1] : d; };
  let lastSvcDateTxt = fmtD(v.lastSvcDate);

  let popup = document.createElement('div');
  popup.id = 'svc-plate-popup';
  popup.style.cssText = 'position:fixed;z-index:9999;background:var(--s2);border:1.5px solid #60a5fa;border-radius:10px;padding:12px 14px;min-width:220px;max-width:300px;box-shadow:0 8px 32px rgba(0,0,0,.35);font-family:var(--font)';
  popup.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <span style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#60a5fa">🔧 Service — ${escapeHtml(v.plate||'')}</span>
      <button data-dr-action="close-overlay" data-dr-overlay-id="svc-plate-popup" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:1rem;line-height:1">✕</button>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;gap:10px">
      <span style="font-size:.75rem;color:var(--muted)">${translate('svc.kmLeft')||'KM restants'}</span>
      <span style="font-weight:800;font-size:.88rem;color:${diffColor};white-space:nowrap">${diffText}</span>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
      <span style="font-size:.75rem;color:var(--muted)">${translate('svc.lastSvc')||'Dernière vidange'}</span>
      <span style="font-weight:700;font-size:.85rem;font-family:var(--mono)">${lastSvcDateTxt}</span>
    </div>
  `;
  document.body.appendChild(popup);

  // Positionnement juste sous le champ plaque
  let rect = anchorEl.getBoundingClientRect();
  let x = rect.left, y = rect.bottom + 6;
  if(x + 300 > window.innerWidth) x = window.innerWidth - 310;
  if(y + 110 > window.innerHeight) y = rect.top - 110;
  popup.style.left = x + 'px';
  popup.style.top  = y + 'px';

  // Fermeture automatique + clic extérieur
  let autoClose = setTimeout(() => { if(document.getElementById('svc-plate-popup')===popup) popup.remove(); }, 6000);
  setTimeout(() => {
    document.addEventListener('click', function closePopup(e){
      if(!popup.isConnected){ document.removeEventListener('click', closePopup); return; }
      if(!popup.contains(e.target) && e.target !== anchorEl){
        popup.remove();
        clearTimeout(autoClose);
        document.removeEventListener('click', closePopup);
      }
    });
  }, 100);
}

// ── Event delegation for data-svc-action buttons ──
(function() {
  document.addEventListener('click', function(e) {
    const btn = e.target.closest('[data-svc-action]');
    if (!btn) return;
    e.preventDefault();
    const action = btn.dataset.svcAction;
    const id = Number(btn.dataset.id);
    if (action === 'updateKm') openUpdateKm(id);
  });
})();

// ── getServiceInterval — intervalle de vidange, défini manuellement par véhicule ──
// L'ancienne règle automatique (MG/Jetour=10000, reste=8000) a été retirée.
// Chaque véhicule a maintenant son propre champ v.svcInterval, rempli dans
// Update Vehicle Record (bloc ② Service — KM Target). Fallback à 8000 km
// uniquement si le champ n'a jamais été renseigné.
function getServiceInterval(v){
  return v.svcInterval || 8000;
}

// ── updateSvcBadge — kept as a no-op stub so existing calls don't break.
// The Service & KM menu no longer shows any alert badge or sound alarms;
// all alerts (Oil Change, Mulkiya & Ministry of Transport, Customer Return
// Overdue, New Booking Requests) are organized exclusively on the Dashboard. ──
function updateSvcBadge(){ /* intentionally empty — alerts moved to Dashboard */ }

// ── renderService (orig. line 8783) — vehicle KM/service grid only, no alerts ──
function renderService(){ ensurePageLoaded('service'); let tous = [];
  // PERF (2026-09) : index construit UNE FOIS (O(historique)) au lieu de
  // rescanner tout l'historique 2x PAR véhicule (une fois ligne ci-dessous,
  // une fois dans le .map() plus bas) — voir _buildKmIndex().
  let _kmIdx = (typeof _buildKmIndex === 'function') ? _buildKmIndex() : null;
  DB.vehicles.forEach(v => {
    let hasRentals = DB.rentals.some(r => r.vehicleId === v.id && r.kmIn && Number(r.kmIn) > 0);
    let lastSvc = v.lastSvcKm || 0;
    let svcIntervalV = getServiceInterval(v);
    let effKm = getEffectiveKm(v, _kmIdx); let diff = (lastSvc > 0 && lastSvc <= effKm && hasRentals) ? effKm - lastSvc : 0;
    let pct = svcIntervalV ? diff / svcIntervalV : 0; tous.push({v,diff,pct});
  }); let liste = tous; if(svcSearch) liste = liste.filter(({v}) => (v.name+v.plate).toLowerCase().includes(svcSearch)); document.getElementById('svc-body').innerHTML = liste.map(({v,diff,pct}) => { let fmtD = d => { if(!d) return '—'; let m = d.match(/^(\d{4})-(\d{2})-(\d{2})/); if(m) return m[3]+'/'+m[2]+'/'+m[1]; return d; }; let couleurBarre = pct >= 1 ? 'var(--red)' : (pct >= 0.8 ? 'var(--yellow)' : 'var(--green)'); let pctLimite = Math.min(pct, 1) * 100; let diffKmDB = (v.todayKm||0) - (v.lastSvcKm||0); // Données pour la ligne Service & KM
    let vPlateS = (v.plate||'').toLowerCase();
    let enSortieS = DB.rentals.some(r => { if(r.dateIn&&r.dateIn!=='') return false; if(r.vehicleId===v.id) return true; return (r._plate||'').toLowerCase()===vPlateS&&vPlateS; });
    let moveOutSvc = (DB.moves||[]).find(m => !m.dateIn && extractPlateNum(m.plate) === extractPlateNum(vPlateS));
    if(!enSortieS && moveOutSvc) enSortieS = true;
    let badgeStatutS = enSortieS ? '<span class="badge badge-yellow">'+translate('svc.out')+'</span>' : '<span class="badge badge-green">'+translate('svc.avail')+'</span>';
    let svcDateS = v.lastSvcDate ? v.lastSvcDate.slice(0,10) : '—';
    // Intervalle de vidange selon le type (8000 km par défaut, 10000 km pour MG/Jetour) — utilisé UNIQUEMENT pour la couleur/%, jamais pour recalculer le target
    let svcIntervalS = getServiceInterval(v);
    let lastSvcKmS = v.lastSvcKm || 0;
    let todayKmS   = getEffectiveKm(v, _kmIdx);
    // Km cible = valeur réelle saisie par l'admin (jamais recalculée automatiquement)
    let targetKmS  = v.svcKm || 0;
    // km restants avant la prochaine vidange (donnée réelle, inchangée)
    let diffKmS2    = targetKmS > 0 ? targetKmS - todayKmS : 0;
    let diffColorS2 = diffKmS2<=0 ? '#ef4444' : diffKmS2<1000 ? '#f97316' : 'var(--green)';
    // % restant, calculé à partir du diff réel / intervalle du véhicule (100% = vient d'être fait → vert, 0%/moins = SERVICE DÛ → rouge)
    let pctProgressS = (targetKmS > 0 && svcIntervalS > 0)
      ? Math.max(0, Math.min(100, Math.round(diffKmS2 / svcIntervalS * 100)))
      : 0;
    let pctLeftS = pctProgressS;
    let barColorS = pctProgressS<=0 ? '#ef4444' : pctProgressS<=20 ? '#f97316' : pctProgressS<=50 ? '#eab308' : '#22c55e';
    
    let diffDisplayS = diffKmS2<=0
      ? '<span style="color:#ef4444;font-weight:800;font-size:.82rem">'+translate('svc.serviceDue')+'</span>'
      : `<span style="color:${diffColorS2};font-weight:700">${diffKmS2.toLocaleString()} km</span>`;
    // km left label & icon
    let kmLeftVal = Math.round(diffKmS2);
    let kmLeftColor = kmLeftVal <= 0 ? '#ef4444' : kmLeftVal < 1000 ? '#f97316' : '#22c55e';
    let kmLeftIcon = kmLeftVal <= 0 ? '🔴' : kmLeftVal < 1000 ? '🟠' : '✅';
    let kmLeftLabel = kmLeftVal <= 0
      ? `<span style="color:#ef4444;font-weight:800;font-size:.65rem">⚠ ${translate('svc.serviceDue')}</span>`
      : `<span style="color:${kmLeftColor};font-weight:700;font-size:.65rem">${kmLeftVal.toLocaleString()} ${translate('svc.kmLeft')}</span>`;
    let barS = targetKmS > 0
      ? `<div style="margin-top:2px;background:var(--border);border-radius:3px;height:5px;overflow:hidden"><div style="width:${pctProgressS}%;background:${barColorS};height:5px;border-radius:3px;transition:width .3s ease"></div></div><div style="display:flex;justify-content:space-between;align-items:center;margin-top:2px">${kmLeftLabel}<span style="font-size:.75rem">${kmLeftIcon}</span></div>`
      : '';
    let oilSvcDateS = fmtD(v.oilSvcDate);
    let svBadgeStyle = getVehicleBadgeStyle(v.name);
    let isOilAlarm = targetKmS > 0 && diffKmS2 <= 1000;
    let rowClass = isOilAlarm ? 'oil-alarm-row' : '';
    let cardBorderColor = isOilAlarm ? '#ef4444' : pctProgressS<=50 ? '#eab308' : 'var(--green)';
    let cardBg = isOilAlarm ? 'background:rgba(239,68,68,.04)' : '';

    // --- Branch coloring (same as fleet) ---
    let branchRaw = (v.branch || v.bureau || '').trim();
    let branchLower = branchRaw.toLowerCase();
    let branchCardBg = '', branchCardBorder = '', branchBadgeHtml = '';
    if(branchRaw){
      if(branchLower.includes('canceled') || branchLower.includes('cancelled')){
        branchCardBg = 'rgba(185,28,28,.08)';
        branchCardBorder = '2px solid rgba(220,38,38,.5)';
        branchBadgeHtml = `<span style="background:rgba(220,38,38,.18);color:#dc2626;border:1px solid rgba(220,38,38,.45);border-radius:20px;padding:1px 8px;font-size:.65rem;font-weight:700;flex-shrink:0">🚫 ${branchRaw}</span>`;
      } else if(branchLower.includes('barka')){
        branchCardBg = 'rgba(37,99,235,.07)';
        branchCardBorder = '2px solid rgba(37,99,235,.45)';
        branchBadgeHtml = `<span style="background:rgba(37,99,235,.15);color:#2563eb;border:1px solid rgba(37,99,235,.4);border-radius:20px;padding:1px 8px;font-size:.65rem;font-weight:700;flex-shrink:0">🏢 ${branchRaw}</span>`;
      } else if(branchLower.includes('moebela') || branchLower.includes('moabela') || branchLower.includes('mabela')){
        branchCardBg = 'rgba(124,58,237,.07)';
        branchCardBorder = '2px solid rgba(124,58,237,.45)';
        branchBadgeHtml = `<span style="background:rgba(124,58,237,.15);color:#7c3aed;border:1px solid rgba(124,58,237,.4);border-radius:20px;padding:1px 8px;font-size:.65rem;font-weight:700;flex-shrink:0">🏢 ${branchRaw}</span>`;
      } else {
        branchCardBg = 'rgba(13,148,136,.07)';
        branchCardBorder = '2px solid rgba(13,148,136,.45)';
        branchBadgeHtml = `<span style="background:rgba(13,148,136,.15);color:#0d9488;border:1px solid rgba(13,148,136,.4);border-radius:20px;padding:1px 8px;font-size:.65rem;font-weight:700;flex-shrink:0">🏢 ${branchRaw}</span>`;
      }
    }
    let cardBgFinal = branchRaw ? `background:${branchCardBg}` : (cardBg || 'background:var(--s1)');
    let cardBorderFinal = branchRaw ? branchCardBorder : `1px solid var(--border)`;

    // Battery expiry color
    let batDaysCard = v.batteryExp ? Math.round((new Date(v.batteryExp)-new Date())/86400000) : null;
    let batColor = batDaysCard===null ? 'var(--muted)' : batDaysCard<=0 ? '#ef4444' : batDaysCard<=30 ? '#f97316' : batDaysCard<=90 ? '#eab308' : 'var(--green)';
    let batVal = fmtD(v.batteryExp) || '—';

    // Mulkiya expiry color
    let mulkDaysCard = v.mulkiya ? Math.round((new Date(v.mulkiya)-new Date())/86400000) : null;
    let mulkColor = mulkDaysCard===null ? 'var(--muted)' : mulkDaysCard<=0 ? '#ef4444' : mulkDaysCard<=30 ? '#f97316' : mulkDaysCard<=90 ? '#eab308' : 'var(--green)';
    let mulkVal = fmtD(v.mulkiya) || '—';

    // Oil svc date color
    let oilColor = oilSvcDateS === '—' ? 'var(--muted)' : 'var(--text)';

    // KM urgency badge
    let kmUrgency = kmLeftVal <= 0
      ? `<span style="background:#ef4444;color:#fff;font-size:.58rem;font-weight:800;padding:1px 5px;border-radius:3px">${translate('svc.serviceDue').replace('!','')}</span>`
      : kmLeftVal < 1000
        ? `<span style="background:#f97316;color:#fff;font-size:.58rem;font-weight:700;padding:1px 5px;border-radius:3px">${kmLeftVal.toLocaleString()} km</span>`
        : `<span style="font-size:.68rem;color:var(--green);font-weight:700">${kmLeftVal.toLocaleString()} km</span>`;

    return `<div${rowClass?` class="${rowClass}"`:''} style="${cardBgFinal};border:${cardBorderFinal};border-top:2px solid ${cardBorderColor};border-radius:9px;padding:10px 12px;transition:box-shadow .15s,transform .15s">

      <!-- Header: badge + plaque + status + bouton -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <div style="display:flex;align-items:center;gap:6px;min-width:0">
          <span class="badge" style="${svBadgeStyle};font-size:.68rem;flex-shrink:0">${escapeHtml(v.name)}</span>
          <span style="font-family:var(--mono);font-weight:700;font-size:.85rem">${escapeHtml(v.plate)}</span>
          ${branchBadgeHtml}
        </div>
        <div style="display:flex;align-items:center;gap:4px;flex-shrink:0">
          ${badgeStatutS}
          <button data-svc-action="updateKm" data-id="${v.id}" style="background:none;border:1px solid var(--border);border-radius:5px;padding:3px 9px;font-size:.76rem;color:var(--muted);cursor:pointer" title="${translate('svc.updateKm')}">⬆</button>
        </div>
      </div>

      <!-- KM actuel / cible -->
      <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:4px">
        <div>
          <span style="font-family:var(--mono);font-weight:800;font-size:1rem;color:var(--blue)">${todayKmS.toLocaleString()}</span>
          ${targetKmS>0?`<span style="font-size:.7rem;color:var(--muted);margin-left:3px">/ ${targetKmS.toLocaleString()} km</span>`:''}
        </div>
        ${kmUrgency}
      </div>

      <!-- Barre progression -->
      ${targetKmS > 0 ? `<div style="background:var(--border);border-radius:3px;height:5px;overflow:hidden;margin-bottom:10px"><div style="width:${pctProgressS}%;background:${barColorS};height:5px;border-radius:3px;transition:width .3s ease"></div></div>` : '<div style="margin-bottom:10px"></div>'}

      <!-- Données détaillées — 3 lignes pleine largeur -->
      <div style="border-top:1px solid var(--border);padding-top:8px;display:flex;flex-direction:column;gap:5px">
        <div style="display:flex;align-items:center;justify-content:space-between;background:var(--bg);border-radius:6px;padding:5px 9px">
          <span style="font-size:.7rem;color:var(--muted);font-weight:600">${translate('svc.lastSvc')}</span>
          <span style="font-size:.8rem;font-weight:700;color:var(--text);font-family:var(--mono)">${svcDateS}</span>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;background:var(--bg);border-radius:6px;padding:5px 9px">
          <span style="font-size:.7rem;color:var(--muted);font-weight:600">${translate('svc.oilGear')}</span>
          <span style="font-size:.8rem;font-weight:700;color:${oilColor};font-family:var(--mono)">${oilSvcDateS}${v.oilNotes?` <span style="font-size:.6rem;background:rgba(37,99,235,.2);color:#60a5fa;border-radius:3px;padding:0 5px;font-family:var(--font)">✓</span>`:''}</span>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;background:var(--bg);border-radius:6px;padding:5px 9px">
          <span style="font-size:.7rem;color:var(--muted);font-weight:600">${translate('svc.battery')}</span>
          <span style="font-size:.8rem;font-weight:700;color:${batColor};font-family:var(--mono)">${batVal}</span>
        </div>
      </div>
    </div>`;
  }).join('');

  if(editMode) mettreAJourInterfaceEdition(); }
// ── filterSvc (orig. line 9032) ──
function filterSvc(q){ svcSearch = q.toLowerCase(); renderService(); }
// ── getLastVehicleAutoFill (orig. line 9062) ──
function getLastVehicleAutoFill(plate){
  // Build a flat list {km, fuel, condition, dt, src} from BOTH Daily Rentals AND Internal Movements
  // LOGIC: Always use the HIGHEST KM ever recorded (vehicles only go up in mileage, never down)
  if(!plate) return null;
  let candidates = [];
  let plateN = extractPlateNum(plate);

  // Source 1: Daily Rentals — both OUT and IN
  DB.rentals.filter(r => {
    let v = r.vehicleId ? (DB.vehicles.find(x=>x.id===r.vehicleId)||{}) : {};
    let rPlate = v.plate || r._plate || '';
    return extractPlateNum(rPlate) === plateN && !r._cancelled;
  }).forEach(r => {
    // kmIn from return (most authoritative — vehicle came back)
    if(r.kmIn && Number(r.kmIn) > 0 && r.dateIn && r.dateIn !== '')
      candidates.push({
        km: Number(r.kmIn),
        fuel: (r.fuelIn!==undefined && r.fuelIn!==null && r.fuelIn!=='') ? r.fuelIn : null,
        condition: r.cleanAfter || null,
        dt: r.dateIn,
        src: 'rental-IN'
      });
    // kmOut from departure (fallback if no return yet)
    if(r.kmOut && Number(r.kmOut) > 0 && r.dateOut && r.dateOut !== '')
      candidates.push({
        km: Number(r.kmOut),
        fuel: (r.fuelOut!==undefined && r.fuelOut!==null && r.fuelOut!=='') ? r.fuelOut : null,
        condition: r.cleanBefore || null,
        dt: r.dateOut,
        src: 'rental-OUT'
      });
  });

  // Source 2: Internal Movements — both OUT and IN
  (DB.moves || []).filter(m => extractPlateNum(m.plate||'') === plateN).forEach(m => {
    if(m.kmIn && Number(m.kmIn) > 0 && m.dateIn && m.dateIn !== '')
      candidates.push({
        km: Number(m.kmIn),
        fuel: (m.fuelIn!==undefined && m.fuelIn!==null && m.fuelIn!=='') ? m.fuelIn : null,
        condition: m.condIn || null,
        dt: m.dateIn,
        src: 'move-IN'
      });
    if(m.kmOut && Number(m.kmOut) > 0 && m.dateOut && m.dateOut !== '')
      candidates.push({
        km: Number(m.kmOut),
        fuel: (m.fuelOut!==undefined && m.fuelOut!==null && m.fuelOut!=='') ? m.fuelOut : null,
        condition: m.condOut || null,
        dt: m.dateOut,
        src: 'move-OUT'
      });
  });

  if(!candidates.length) return null;

  // Sort by KM descending — always use the HIGHEST KM recorded (most recent mileage)
  candidates.sort((a, b) => b.km - a.km);
  return candidates[0];
}

// ── autoFillKmFuelOut (orig. line 9122) ──
function autoFillKmFuelOut(){
  // Skip if currently editing an existing rental
  let editId = document.getElementById('modal-rental').getAttribute('data-edit-id');
  if(editId && editId !== '') return;

  let plate = (document.getElementById('r-plate').value || '').trim();
  if(!plate) return;

  // Auto-fill Vehicle Name from GPS Tracking (master list: own + other branches)
  let vnameEl = document.getElementById('r-vname');
  if(vnameEl && !vnameEl._userEdited){
    let norm = plate.toUpperCase();
    let foundG = DB.gpsLinks && DB.gpsLinks.find(g => (g.plate||'').trim().toUpperCase() === norm);
    let autoName = foundG ? foundG.name : null;
    if(!autoName){ let fv = DB.vehicles.find(v => (v.plate||'').toUpperCase() === norm); autoName = fv ? fv.name : null; }
    if(autoName){ vnameEl.value = autoName; vnameEl.style.borderColor = '#10b981'; setTimeout(()=>{ vnameEl.style.borderColor = ''; }, 2000); }
  }

  let kmEl = document.getElementById('r-km-out');
  let fuelEl = document.getElementById('r-fuel-out');
  let kmIcon = document.getElementById('kmout-lock-icon');
  let fuelIcon = document.getElementById('fuelout-lock-icon');

  let last = getLastVehicleAutoFill(plate);
  if(!last){
    // Aucun historique — laisser les champs ouverts
    lockKmOutField(false);
    lockFuelOutField(false);
    if(kmIcon) kmIcon.innerHTML = '';
    if(fuelIcon) fuelIcon.innerHTML = '';
    return;
  }

  // KM OUT — auto-fill & lock
  if(kmEl){
    kmEl.value = last.km;
    lockKmOutField(true);
  }

  // Fuel OUT — auto-fill & lock (only if a fuel value was recorded)
  if(fuelEl && last.fuel !== null && last.fuel !== undefined){
    fuelEl.value = String(last.fuel);
    lockFuelOutField(true);
  } else {
    lockFuelOutField(false);
    if(fuelIcon) fuelIcon.innerHTML = '';
  }

  // POINT 4 — Auto-fill Condition Before from last return's condition
  if(last.condition){
    let cbYes = document.getElementById('r-clean-before-yes');
    let cbNo  = document.getElementById('r-clean-before-no');
    if(cbYes && cbNo){
      cbYes.checked = (last.condition === 'clean');
      cbNo.checked  = (last.condition === 'dirty');
    }
  }

  toast(translate('svc.autoFilledFrom') + (last.src === 'move-IN' ? translate('svc.autoFillMove') : (last.src === 'move-OUT' ? translate('svc.autoFillMoveOut') : last.src === 'rental-OUT' ? translate('svc.autoFillRentalOut') : translate('svc.autoFillRental'))));
  logAction('km_update', '📍 New Rental — Auto-fill KM/Fuel/Condition Out ('+plate+')', 'KM Out: '+last.km+(last.fuel!==null?' | Fuel Out: '+last.fuel:'')+(last.condition?' | Condition: '+last.condition:'')+' | Source: '+last.src+' | Date: '+(last.dt||'—'), plate);
  updateLogBadge();
}

// ── CANCELLED contract toggle ─────────────────────────────────────
// ── onCancelledToggle (orig. line 9186) ──
function onCancelledToggle(checked){
  let titleEl = document.getElementById('rental-modal-title');
  let wrap    = document.getElementById('cancelled-toggle-wrap');
  let label   = document.getElementById('cancelled-label');
  if(checked){
    if(titleEl){ titleEl.textContent = translate('rental.cancelledTitle'); titleEl.style.color = '#f87171'; }
    if(wrap){ wrap.style.background = 'rgba(220,38,38,.35)'; wrap.style.borderColor = '#dc2626'; }
    if(label){ label.style.color = '#fff'; }
    // Flash the header border
    let hdr = document.querySelector('#modal-rental .modal > div:first-child');
    if(!hdr) hdr = document.querySelector('#modal-rental > div > div');
  } else {
    let editId = document.getElementById('modal-rental').getAttribute('data-edit-id');
    if(titleEl){ titleEl.textContent = editId && editId !== '' ? translate('rental.editTitle') : translate('rental.newTitle'); titleEl.style.color = '#f1f5f9'; }
    if(wrap){ wrap.style.background = 'rgba(220,38,38,.15)'; wrap.style.borderColor = 'rgba(220,38,38,.4)'; }
    if(label){ label.style.color = '#f87171'; }
  }
}

// ── _buildKmIndex / getLatestKmFromIndex (2026-09, PERF) ──────────────────
// getLatestKmFromRentals() ci-dessous rescanne TOUT DB.kmHistory + TOUT
// DB.moves à chaque appel — correct, mais coûteux quand on l'appelle une
// fois PAR VÉHICULE dans une boucle (calculerAlertesOil, renderService,
// renderAvailableVehicles) : ça fait O(véhicules × historique) au lieu de
// O(véhicules + historique).
//
// _buildKmIndex() fait le même scan, mais UNE SEULE FOIS, et range le
// résultat dans 2 Map (par vehicleId, par plaque normalisée) au lieu de le
// refaire pour chaque véhicule. getLatestKmFromIndex() devient un lookup
// O(1). Résultat strictement identique à getLatestKmFromRentals() : la
// fonction d'origine retient le MAX km parmi toute ligne qui matche par id
// OU par plaque — or max(A∪B) = max(max(A), max(B)), donc indexer les deux
// critères séparément puis prendre le plus grand des deux ne change rien
// au résultat, juste au nombre de fois où on relit l'historique.
//
// Usage : construire l'index UNE FOIS en tête d'une boucle sur DB.vehicles
// (`let _kmIdx = _buildKmIndex();`), puis appeler
// getEffectiveKm(v, _kmIdx) au lieu de getEffectiveKm(v) pour chaque
// véhicule. getLatestKmFromRentals() reste inchangée et continue de servir
// telle quelle aux appels ponctuels sur UN seul véhicule (popup service,
// changement de véhicule dans un select, etc.) où reconstruire un index
// complet ne vaudrait pas le coup. ──
function _buildKmIndex(){
  let byId = new Map();
  let byPlate = new Map();
  const _kmSource = (DB.kmHistory && DB.kmHistory.length) ? DB.kmHistory : DB.rentals;
  const bump = (map, key, km) => { if(key === undefined || key === null || key === '') return; let cur = map.get(key); if(cur === undefined || km > cur) map.set(key, km); };
  _kmSource.forEach(r => {
    let pNorm = extractPlateNum(r._plate || r.plate || '');
    if(r.kmIn  && Number(r.kmIn)  > 0 && r.dateIn  && r.dateIn  !== ''){ bump(byId, r.vehicleId, Number(r.kmIn));  bump(byPlate, pNorm, Number(r.kmIn)); }
    if(r.kmOut && Number(r.kmOut) > 0 && r.dateOut && r.dateOut !== ''){ bump(byId, r.vehicleId, Number(r.kmOut)); bump(byPlate, pNorm, Number(r.kmOut)); }
  });
  (DB.moves || []).forEach(m => {
    let pNorm = extractPlateNum(m.plate || '');
    if(m.kmIn  && Number(m.kmIn)  > 0 && m.dateIn  && m.dateIn  !== '') bump(byPlate, pNorm, Number(m.kmIn));
    if(m.kmOut && Number(m.kmOut) > 0 && m.dateOut && m.dateOut !== '') bump(byPlate, pNorm, Number(m.kmOut));
  });
  return { byId, byPlate };
}
function getLatestKmFromIndex(idx, vid, plate){
  let best = null;
  if(vid && idx.byId.has(vid)) best = idx.byId.get(vid);
  if(plate){
    let pNorm = extractPlateNum(plate);
    if(pNorm && idx.byPlate.has(pNorm)){
      let v2 = idx.byPlate.get(pNorm);
      if(best === null || v2 > best) best = v2;
    }
  }
  return best;
}

// ── getLatestKmFromRentals (orig. line 9283) ──
function getLatestKmFromRentals(vid, plate){
  // Build a flat list {km, dt, src} from BOTH Daily Rentals AND Internal Movements
  let candidates = [];
  const plateNorm = (plate||'').trim().toLowerCase();

  // Source 1: Daily Rentals — utilise DB.kmHistory (TOUJOURS toutes branches,
  // voir server.js dbLoad) plutôt que DB.rentals (filtré par branche pour les
  // comptes Barka/Moebela). Le KM d'un véhicule est le même peu importe quelle
  // agence a fait le dernier contrat — sinon une session de branche calcule un
  // "KM Today" vide/faux pour un véhicule dont le dernier relevé vient de
  // l'autre agence, et l'alerte vidange ne se déclenche pas.
  // Fallback sur DB.rentals si kmHistory n'est pas encore chargé (compat).
  let _kmSource = (DB.kmHistory && DB.kmHistory.length) ? DB.kmHistory : DB.rentals;
  _kmSource.filter(r => {
    if(vid   && r.vehicleId === vid) return true;
    if(plate && extractPlateNum(r._plate||r.plate||'') === extractPlateNum(plate)) return true;
    return false;
  }).forEach(r => {
    if(r.kmIn  && Number(r.kmIn)  > 0 && r.dateIn  && r.dateIn  !== '')
      candidates.push({ km: Number(r.kmIn),  dt: r.dateIn,  src: 'rental-IN'  });
    if(r.kmOut && Number(r.kmOut) > 0 && r.dateOut && r.dateOut !== '')
      candidates.push({ km: Number(r.kmOut), dt: r.dateOut, src: 'rental-OUT' });
  });

  // Source 2: Internal Movements (filtered by plate only — moves have no vehicleId)
  if(plate){
    (DB.moves || []).filter(m =>
      extractPlateNum(m.plate) === extractPlateNum(plate||'')
    ).forEach(m => {
      if(m.kmIn  && Number(m.kmIn)  > 0 && m.dateIn  && m.dateIn  !== '')
        candidates.push({ km: Number(m.kmIn),  dt: m.dateIn,  src: 'move-IN'  });
      if(m.kmOut && Number(m.kmOut) > 0 && m.dateOut && m.dateOut !== '')
        candidates.push({ km: Number(m.kmOut), dt: m.dateOut, src: 'move-OUT' });
    });
  }

  if(!candidates.length) return null;

  // ✅ FIX: Always use the HIGHEST KM ever recorded (vehicles only go up in
  // mileage, never down) — same logic as getLastVehicleAutoFill, instead of
  // sorting by date which could surface a stale/lower value.
  candidates.sort((a, b) => b.km - a.km);

  return candidates[0].km;
}

// ── onKmVehicleChange (orig. line 9322) ──
function onKmVehicleChange(vid){
  let v = DB.vehicles.find(x => x.id === Number(vid));
  if(!v) return;
  let kmEl = document.getElementById('km-value');
  if(kmEl){
    // Get latest KM from Daily Rentals OR Internal Movements (sorted by datetime)
    let latestKm = getLatestKmFromRentals(v.id, v.plate);
    if(latestKm !== null && latestKm > 0){
      kmEl.value = latestKm;
      kmEl.style.borderColor = '#22c55e';
      kmEl.title = '✅ Auto-filled: highest KM ever recorded from Daily Rentals or Internal Movements';
    } else {
      // Fallback to manually stored todayKm
      kmEl.value = v.todayKm || '';
      kmEl.style.borderColor = v.todayKm ? '#60a5fa' : '';
      kmEl.title = v.todayKm ? '📋 From last manual KM update' : '';
    }
  }
  let svcKmEl = document.getElementById('km-svc-km'); if(svcKmEl && v.svcKm) svcKmEl.value = v.svcKm;
  let svcDateEl = document.getElementById('km-svc-date'); if(svcDateEl && v.lastSvcDate) svcDateEl.value = v.lastSvcDate;
  let svcIntervalEl = document.getElementById('km-svc-interval'); if(svcIntervalEl) svcIntervalEl.value = v.svcInterval || '';
  let battEl = document.getElementById('km-battery'); if(battEl) battEl.value = v.batteryExp || '';
  let notesEl = document.getElementById('km-notes'); if(notesEl) notesEl.value = v.oilNotes || '';
  let oilDateEl = document.getElementById('km-oil-date'); if(oilDateEl) oilDateEl.value = v.oilSvcDate || '';
  let oilKmEl = document.getElementById('km-oil-km'); if(oilKmEl) oilKmEl.value = v.oilSvcKm || '';
}

// ── openUpdateKm (orig. line 9348) ──
function openUpdateKm(vid){
  // Reset form
  ['km-value','km-svc-km','km-svc-date','km-svc-interval','km-battery','km-oil-date','km-oil-km','km-notes'].forEach(id => {
    let el = document.getElementById(id); if(el) el.value = '';
  });
  let sel = document.getElementById('km-vehicle');
  if(sel) sel.value = '';
  if(vid){
    if(sel) sel.value = vid;
    onKmVehicleChange(vid);
  }
  openModal('modal-km');
}

// ── saveKm (orig. line 9362) ──
// ── saveKm (CORRIGÉE : Met à jour la DB locale avant sauvegarde SQL) ──
function saveKm(){
  let vid = Number(document.getElementById('km-vehicle').value);
  let km = Number(document.getElementById('km-value').value);
  if(!vid){ toast(translate('svc.selectVehicle')); return; }
  
  let i = DB.vehicles.findIndex(v => v.id === vid);
  if(i === -1){ toast(translate('svc.vehicleNotFound')); return; }
  
  pushUndo();
  
  // 1. On récupère la référence directe dans DB.vehicles
  let v = DB.vehicles[i];
  
  // 2. On applique les changements sur l'objet local
  if(km) v.todayKm = km;
  let svcDate = document.getElementById('km-svc-date').value;
  let svcKm = document.getElementById('km-svc-km').value;
  let svcInterval = document.getElementById('km-svc-interval').value;
  let battery = document.getElementById('km-battery').value;
  let oilDate = document.getElementById('km-oil-date').value;
  let oilKm = document.getElementById('km-oil-km').value;
  let notes = document.getElementById('km-notes').value;
  
  if(svcDate) v.lastSvcDate = svcDate;
  if(svcKm) v.lastSvcKm = Number(svcKm);
  if(svcKm) v.svcKm = Number(svcKm);
  if(svcInterval) v.svcInterval = Number(svcInterval);
  if(battery !== undefined) v.batteryExp = battery;
  if(oilDate !== undefined) v.oilSvcDate = oilDate;
  if(oilKm) v.oilSvcKm = Number(oilKm);
  if(notes !== undefined) v.oilNotes = notes;
  // FIX 01/08/2026 : timestamp d'édition explicite — voir server.js dbSave() / clients fix
  v.updatedAt = Date.now();
  
  // 🔥 CRUCIAL : On réinjecte l'objet mis à jour dans le tableau global DB
  DB.vehicles[i] = v;

  // 3. Log de l'action
  let detail = 'Plate: '+v.plate
    + (km ? ' | KM: '+km.toLocaleString() : '')
    + (svcDate ? ' | Svc Date: '+svcDate : '')
    + (svcKm ? ' | Svc KM Target: '+Number(svcKm).toLocaleString() : '')
    + (svcInterval ? ' | Svc Interval: '+Number(svcInterval).toLocaleString()+' km' : '')
    + (battery ? ' | Battery EXP: '+battery : '')
    + (oilDate ? ' | Oil/Gear Date: '+oilDate : '')
    + (oilKm ? ' | Oil/Gear KM: '+Number(oilKm).toLocaleString() : '')
    + (notes ? ' | Notes: '+notes : '');
  logAction('km_update', '📍 Database — Update Record '+v.name+' ('+v.plate+')', detail, v.plate);
  updateLogBadge();
  
  closeModal('modal-km');
  toast(translate('svc.recordUpdated'));
  
  // 4. Rendu de l'interface
  renderFleet(); 
  renderService(); 
  buildDashboard(); 
  updateTopStats();
  
  // 5. Envoi ciblé au serveur SQLite (utilise maintenant les données fraîches de DB.vehicles)
  saveVehicle(v.id);
}