// ── Event delegation for data-gps-action buttons ──
(function() {
  document.addEventListener('click', function(e) {
    const btn = e.target.closest('[data-gps-action]');
    if (!btn) return;
    e.preventDefault();
    const action = btn.dataset.gpsAction;
    const id = Number(btn.dataset.id);
    const plate = btn.dataset.plate;
    const type = btn.dataset.type;
    if (action === 'openLink') openGpsLinkById(id);
    else if (action === 'edit') editGpsLink(id);
    else if (action === 'delete') deleteGpsLink(id);
    else if (action === 'openVehicle') openVehicleGps(plate);
    else if (action === 'setFilter') {
      window._gpsSelectedType = type || 'all';
      renderGpsTracking();
    }
  });
})();

// ── _normPlate (orig. line 9957) ──
function _normPlate(p){ return (p||'').toString().trim().replace(/[\s-]+/g,'').toUpperCase(); }

// ── getGpsLink (orig. line 9959) ──
function getGpsLink(plate){
  if(!DB.gpsLinks || !plate) return null;
  let norm = _normPlate(plate);
  let found = DB.gpsLinks.find(g => _normPlate(g.plate) === norm);
  return found ? found.link : null;
}

// ── openVehicleGps (orig. line 9966) ──
function openVehicleGps(plate){
  let link = getGpsLink(plate);
  if(!link){ toast(translate('gps.noLinkToast')); return; }
  window.open(link, '_blank');
}

// ── gpsLocateIconHtml (orig. line 9972) ──
function gpsLocateIconHtml(plate){
  let link = getGpsLink(plate);
  if(!link) return '';
  return `<button type="button" class="oc-btn" data-gps-action="openVehicle" data-plate="${(plate||'').replace(/"/g,'&quot;')}" title="📍 ${translate('gps.locate')}" style="padding:3px 6px;font-size:.8rem;background:rgba(14,165,233,.15);border:1px solid #0ea5e9;border-radius:5px;margin-left:5px">📍</button>`;
}

// ── renderGpsTracking (orig. line 9978) ──
function renderGpsTracking(){
  ensurePageLoaded('gps');
  let tbody = document.getElementById('gps-tbody');
  if(!tbody) return;
  let q = (document.getElementById('gps-search')?.value || '').trim().toLowerCase();
  let selectedType = window._gpsSelectedType || 'all';
  
  let list = (DB.gpsLinks || []).slice().sort((a,b) => (a.name||'').localeCompare(b.name||''));
  
  // Filter by search
  if(q){
    list = list.filter(g => (g.name||'').toLowerCase().includes(q) || (g.plate||'').toLowerCase().includes(q));
  }
  
  // Filter by vehicle type
  if(selectedType !== 'all'){
    list = list.filter(g => {
      let vType = extractVehicleType(g.name || '');
      return vType === selectedType;
    });
  }
  
  // Render filter chips
  renderGpsFilterChips(list);
  
  if(!list.length){
    tbody.innerHTML = '<div class="gps-empty"><div class="gps-empty-icon">🛰️</div><div>'+translate('gps.empty')+'</div></div>';
    return;
  }
  
  // ── Perf : pré-calcul en 1 seul passage sur DB.rentals/DB.moves, réutilisé
  // pour tous les véhicules ci-dessous — remplace un DB.rentals.some() +
  // DB.moves.find() (donc un scan COMPLET des 2 tableaux) exécuté à chaque
  // itération de list.map(), qui devenait lourd avec l'historique qui grossit.
  // Logique de correspondance strictement identique à l'originale. ──
  const _gpsOpenRentalPlates = new Set();
  (DB.rentals||[]).forEach(r => {
    if(r.dateIn && r.dateIn !== '') return;
    let rPlate = (r._plate||'').toLowerCase();
    if(rPlate) _gpsOpenRentalPlates.add(rPlate);
  });
  const _gpsOpenMoveByPlateNum = new Map();
  (DB.moves||[]).forEach(m => {
    if(m.dateIn) return;
    let key = extractPlateNum(m.plate);
    if(key && !_gpsOpenMoveByPlateNum.has(key)) _gpsOpenMoveByPlateNum.set(key, m);
  });
  
  tbody.innerHTML = list.map(g => {
    let vBadgeStyle = getVehicleBadgeStyle(g.name);
    let shortLink = (g.link || '').replace(/^https?:\/\//, '').substring(0, 42) + ((g.link||'').length > 42 ? '…' : '');
    // Check if vehicle is currently rented or in movement
    let vPlate = (g.plate||'').toLowerCase();
    let enSortie = _gpsOpenRentalPlates.has(vPlate);
    let moveOut = _gpsOpenMoveByPlateNum.get(extractPlateNum(vPlate)) || null;
    const DEST_LBL = {workshop:translate('moves.dest.workshop'),washing:translate('moves.dest.washing'),inspection:translate('moves.dest.inspection'),airport:translate('moves.dest.airport'),delivery:translate('moves.dest.delivery'),personal:translate('moves.dest.personal'),office:translate('moves.dest.office'),other:translate('moves.dest.other')};
    let statusHtml;
    if(enSortie){
      statusHtml = '<span style="background:rgba(217,119,6,.15);color:#d97706;border:1.5px solid rgba(217,119,6,.4);border-radius:20px;padding:3px 12px;font-size:.78rem;font-weight:700">'+translate('gps.rented')+'</span>';
    } else if(moveOut){
      statusHtml = '<span style="background:rgba(99,102,241,.15);color:#6366f1;border:1.5px solid rgba(99,102,241,.4);border-radius:20px;padding:3px 12px;font-size:.78rem;font-weight:700">🔄 '+(DEST_LBL[moveOut.dest]||moveOut.dest||'Out')+'</span>';
    } else {
      statusHtml = '<span style="background:rgba(22,163,74,.13);color:var(--green);border:1.5px solid rgba(22,163,74,.35);border-radius:20px;padding:3px 12px;font-size:.78rem;font-weight:700">'+translate('gps.available')+'</span>';
    }
    let cardBorderTop = enSortie ? '3px solid #d97706' : moveOut ? '3px solid #6366f1' : '3px solid var(--green)';

    // ── GPS Expiry + IMEI : source = MadarTech (gps-device-map.js), matché par
    // plaque normalisée (_normPlate, comme getGpsLink()). Si une date a été
    // saisie à la main dans la fiche (g.gpsExpiry), elle garde la priorité ;
    // sinon on retombe automatiquement sur la date MadarTech. N'écrit jamais
    // dans DB.gpsLinks ni dans aucun id véhicule — affichage uniquement.
    // rouge = expiré, orange = ≤30j, vert = OK, rien = aucune info trouvée. ──
    let deviceInfo = (typeof getGpsDeviceInfo === 'function') ? getGpsDeviceInfo(g.plate) : null;
    let effectiveExpiry = g.gpsExpiry || (deviceInfo ? deviceInfo.expiry : '');
    let expiryHtml = '';
    if(effectiveExpiry){
      let expD = new Date(effectiveExpiry);
      let daysLeft = Math.ceil((expD - new Date()) / 86400000);
      let expColor, expBg, expBorder, expLabel;
      if(daysLeft < 0){ expColor = '#dc2626'; expBg = 'rgba(220,38,38,.12)'; expBorder = 'rgba(220,38,38,.35)'; expLabel = 'GPS expired (' + effectiveExpiry + ')'; }
      else if(daysLeft <= 30){ expColor = '#d97706'; expBg = 'rgba(217,119,6,.12)'; expBorder = 'rgba(217,119,6,.35)'; expLabel = 'GPS expires in ' + daysLeft + 'd (' + effectiveExpiry + ')'; }
      else { expColor = 'var(--green)'; expBg = 'rgba(22,163,74,.1)'; expBorder = 'rgba(22,163,74,.3)'; expLabel = 'GPS expires on ' + effectiveExpiry; }
      expiryHtml = `<div style="padding:6px 14px;border-bottom:1px solid var(--border);background:${expBg}">
        <span style="color:${expColor};font-size:.76rem;font-weight:700">📅 ${expLabel}</span>
      </div>`;
    }
    let imeiHtml = deviceInfo ? `<div style="padding:6px 14px;border-bottom:1px solid var(--border)">
        <span style="color:var(--muted);font-size:.76rem;font-weight:600">📶 IMEI ${deviceInfo.imei}</span>
      </div>` : '';

    return `<div style="background:var(--s1);border:1px solid var(--border);border-radius:12px;overflow:hidden;border-top:${cardBorderTop};box-shadow:0 1px 4px rgba(0,0,0,.06);transition:box-shadow .2s,transform .15s"
      onmouseover="this.style.boxShadow='0 4px 16px rgba(0,0,0,.12)';this.style.transform='translateY(-1px)'"
      onmouseout="this.style.boxShadow='0 1px 4px rgba(0,0,0,.06)';this.style.transform='translateY(0)'">

      <!-- Header: name + plate -->
      <div style="padding:10px 14px;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--border)">
        <span class="badge" style="${vBadgeStyle};font-size:.82rem;font-weight:700;flex-shrink:0">${escapeHtml(g.name)||'—'}</span>
        <span style="font-family:var(--mono);font-weight:700;font-size:.92rem;color:var(--text);flex-shrink:0">${escapeHtml(g.plate)||'—'}</span>
      </div>

      ${expiryHtml}
      ${imeiHtml}

      <!-- GPS link -->
      <div style="padding:10px 14px;border-bottom:1px solid var(--border)">
        ${g.link
          ? `<button data-gps-action="openLink" data-id="${g.id}" style="width:100%;display:flex;align-items:center;gap:8px;background:rgba(14,165,233,.1);color:#0ea5e9;border:1.5px solid rgba(14,165,233,.3);border-radius:8px;padding:8px 12px;font-size:.8rem;font-weight:600;cursor:pointer;text-align:left;transition:filter .15s" onmouseover="this.style.filter='brightness(.9)'" onmouseout="this.style.filter=''">
              <span style="font-size:1rem;flex-shrink:0">🔗</span>
              <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${shortLink}</span>
              <span style="margin-left:auto;font-size:.75rem;opacity:.7;flex-shrink:0">${translate('gps.open')} ↗</span>
            </button>`
          : `<div style="text-align:center;color:var(--dim);font-size:.8rem;padding:6px 0">${translate('gps.noLink')}</div>`
        }
      </div>

      <!-- Footer: actions -->
      <div style="padding:8px 14px;display:flex;gap:6px;justify-content:flex-end">
        <button class="btn btn-ghost" style="padding:5px 14px;font-size:.82rem" data-gps-action="edit" data-id="${g.id}">✏️ ${translate('gps.edit')}</button>
        <button class="btn btn-ghost btn-delete" style="padding:5px 10px;font-size:.82rem" data-gps-action="delete" data-id="${g.id}">🗑️</button>
      </div>
    </div>`;
  }).join('');
}

// ── extractVehicleType (orig. line 10060) ──
function extractVehicleType(name){
  if(!name) return 'other';
  let normalized = name.trim().toUpperCase();
  let type = normalized.split(/\s+/)[0];
  return type || 'other';
}

// ── renderGpsFilterChips (orig. line 10067) ──
function renderGpsFilterChips(list){
  let chipsContainer = document.getElementById('gps-filter-chips');
  if(!chipsContainer) return;
  
  // Count vehicles by type
  let typeCounts = {};
  list.forEach(g => {
    let type = extractVehicleType(g.name);
    typeCounts[type] = (typeCounts[type] || 0) + 1;
  });
  
  let totalCount = list.length;
  let allVehicles = (DB.gpsLinks || []);
  let typeCountsAll = {};
  allVehicles.forEach(g => {
    let type = extractVehicleType(g.name);
    typeCountsAll[type] = (typeCountsAll[type] || 0) + 1;
  });
  
  // Build chips
  let chips = [];
  
  // All button
  let isAllSelected = window._gpsSelectedType === 'all';
  chips.push(`
    <button data-gps-action="setFilter" data-type="all" style="background:${isAllSelected ? 'rgba(14,165,233,.18)' : 'var(--s2)'};color:${isAllSelected ? '#0ea5e9' : 'var(--muted)'};border:${isAllSelected ? '1.5px solid #0ea5e9' : '1px solid var(--border)'};border-radius:20px;padding:5px 13px;font-size:.78rem;font-weight:700;cursor:pointer;transition:all .15s;letter-spacing:.02em">
      ${translate('gps.all')} · ${Object.values(typeCountsAll).reduce((a,b) => a+b, 0)}
    </button>
  `);
  
  // Type buttons sorted by count descending
  let types = Object.keys(typeCountsAll).sort((a,b) => typeCountsAll[b] - typeCountsAll[a]);
  types.forEach(type => {
    let count = typeCountsAll[type];
    let isSelected = window._gpsSelectedType === type;
    chips.push(`
      <button data-gps-action="setFilter" data-type="${type}" style="background:${isSelected ? 'rgba(14,165,233,.18)' : 'var(--s2)'};color:${isSelected ? '#0ea5e9' : 'var(--muted)'};border:${isSelected ? '1.5px solid #0ea5e9' : '1px solid var(--border)'};border-radius:20px;padding:5px 13px;font-size:.78rem;font-weight:700;cursor:pointer;transition:all .15s">
        ${type} <span style="opacity:.6;font-weight:500;margin-left:3px">${count}</span>
      </button>
    `);
  });
  
  chipsContainer.innerHTML = chips.join('');
}

// ── openGpsModal (orig. line 10112) ──
function openGpsModal(){
  document.getElementById('gps-edit-id').value = '';
  document.getElementById('gps-name').value = '';
  document.getElementById('gps-plate').value = '';
  document.getElementById('gps-link').value = '';
  document.getElementById('gps-expiry').value = '';
  document.getElementById('gps-color-name').value = '#0ea5e9';
  document.getElementById('gps-color-plate').value = '#10b981';
  document.getElementById('gps-color-link').value = '#f59e0b';
  document.getElementById('gps-modal-title').textContent = translate('gps.addVehicle');
  updateGpsColorPreview();
  openModal('gps-modal');
}

// ── editGpsLink (orig. line 10125) ──
function editGpsLink(id){
  let g = (DB.gpsLinks || []).find(x => x.id === id);
  if(!g) return;
  document.getElementById('gps-edit-id').value = id;
  document.getElementById('gps-name').value = g.name || '';
  document.getElementById('gps-plate').value = g.plate || '';
  document.getElementById('gps-link').value = g.link || '';
  document.getElementById('gps-expiry').value = g.gpsExpiry || '';
  document.getElementById('gps-color-name').value = g.colorName || '#0ea5e9';
  document.getElementById('gps-color-plate').value = g.colorPlate || '#10b981';
  document.getElementById('gps-color-link').value = g.colorLink || '#f59e0b';
  document.getElementById('gps-modal-title').textContent = translate('gps.editVehicle');
  updateGpsColorPreview();
  openModal('gps-modal');
}

// ── saveGpsLink (orig. line 10140) ──
function saveGpsLinkModal(){
  let editId = document.getElementById('gps-edit-id').value;
  let name = document.getElementById('gps-name').value.trim();
  let plate = document.getElementById('gps-plate').value.trim();
  let link = document.getElementById('gps-link').value.trim();
  let gpsExpiry = document.getElementById('gps-expiry').value || '';
  let colorName = document.getElementById('gps-color-name').value.trim();
  let colorPlate = document.getElementById('gps-color-plate').value.trim();
  let colorLink = document.getElementById('gps-color-link').value.trim();
  if(!plate){ toast(translate('gps.plateRequired')); return; }
  if(!link){ toast(translate('gps.linkRequired')); return; }
  if(!DB.gpsLinks) DB.gpsLinks = [];
  // ── Anti-doublon plate : une même plaque ne peut pas exister 2x dans GPS Tracking ──
  let _dupGps = DB.gpsLinks.find(g => g.id !== Number(editId) && _normPlate(g.plate) === _normPlate(plate));
  if(_dupGps){ toast(translate('gps.duplicatePlate') + (_dupGps.name||translate('gps.duplicateAnother'))); return; }
  if(editId){
    let g = DB.gpsLinks.find(x => x.id === Number(editId));
    if(g){ 
      g.name = name; 
      g.plate = plate; 
      g.link = link; 
      g.gpsExpiry = gpsExpiry;
      g.colorName = colorName;
      g.colorPlate = colorPlate;
      g.colorLink = colorLink;
    }
  } else {
    DB.gpsLinks.push({ 
      id: _genId(), 
      name: name, 
      plate: plate, 
      link: link, 
      gpsExpiry: gpsExpiry,
      colorName: colorName,
      colorPlate: colorPlate,
      colorLink: colorLink
    });
  }
  // ── Capturer l'ID AVANT de fermer le modal (closeModal peut vider les champs) ──
  let _savedGpsId = editId ? Number(editId) : (DB.gpsLinks[DB.gpsLinks.length-1] ? DB.gpsLinks[DB.gpsLinks.length-1].id : null);
  closeModal('gps-modal');
  renderGpsTracking();
  if(_savedGpsId){ saveGpsLink(_savedGpsId); }
  toast(translate('gps.saved'));
}

// ── deleteGpsLink (orig. line 10179) ──
function deleteGpsLink(id){
  if(!confirm(translate('gps.confirmDelete'))) return;
  DB.gpsLinks = (DB.gpsLinks || []).filter(g => g.id !== id);
  renderGpsTracking();
  deleteOne('gps_links', id);
  toast(translate('gps.deleted'));
}

// ── openGpsLinkById (orig. line 10187) ──
function openGpsLinkById(id){
  let g = (DB.gpsLinks || []).find(x => x.id === id);
  if(!g || !g.link){ toast(translate('gps.noLinkAvailable')); return; }
  window.open(g.link, '_blank');
}

// ── updateGpsColorPreview (orig. line 10193) ──
function updateGpsColorPreview(){
  let colorName = document.getElementById('gps-color-name').value;
  let colorPlate = document.getElementById('gps-color-plate').value;
  let colorLink = document.getElementById('gps-color-link').value;
  
  let dotName = document.getElementById('gps-color-name-dot');
  let dotPlate = document.getElementById('gps-color-plate-dot');
  let dotLink = document.getElementById('gps-color-link-dot');
  
  if(dotName) dotName.style.color = colorName;
  if(dotPlate) dotPlate.style.color = colorPlate;
  if(dotLink) dotLink.style.color = colorLink;
}


