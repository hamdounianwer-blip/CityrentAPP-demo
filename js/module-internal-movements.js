// ── Event delegation for data-moves-action buttons ──
(function() {
  document.addEventListener('click', function(e) {
    const btn = e.target.closest('[data-moves-action]');
    if (!btn) return;
    e.preventDefault();
    const action = btn.dataset.movesAction;
    const id = Number(btn.dataset.id);
    if (action === 'quickClose') quickCloseMove(id);
    else if (action === 'edit') editMovePwd(id);
    else if (action === 'delete') deleteMovePwd(id);
  });
})();

// ── prevMovesMonth (orig. line 9460) ──
function prevMovesMonth(){
  const [y,m]=currentMovesMonth.split('-').map(Number);
  const d=new Date(y,m-2,1);
  currentMovesMonth=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  renderMoves();
}
// ── nextMovesMonth (orig. line 9466) ──
function nextMovesMonth(){
  const [y,m]=currentMovesMonth.split('-').map(Number);
  const d=new Date(y,m,1);
  currentMovesMonth=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  renderMoves();
}
// ── setMovesMonth (orig. line 9472) ──
function setMovesMonth(val){ if(val) currentMovesMonth=val; renderMoves(); }

function getDestLabels(){
  return {
    workshop: translate('moves.dest.workshop'), washing: translate('moves.dest.washing'), inspection: translate('moves.dest.inspection'),
    airport: translate('moves.dest.airport'), delivery: translate('moves.dest.delivery'), personal: translate('moves.dest.personal'),
    office: translate('moves.dest.office'), other: translate('moves.dest.other')
  };
}
// DEST_LABELS conservé pour compatibilité — recalculé à chaque accès pour suivre la langue active
Object.defineProperty(window, 'DEST_LABELS', { get: getDestLabels, configurable: true });
const DEST_COLORS = {
  workshop:'move-dest-workshop', washing:'move-dest-other', inspection:'move-dest-workshop',
  airport:'move-dest-office', delivery:'move-dest-other', personal:'move-dest-personal',
  office:'move-dest-office', other:'move-dest-other'
};

// ── fuelLabel (orig. line 9485) ──
function fuelLabel(v){ if(v===''||v===null||v===undefined) return '—'; const f=Number(v); return f===0?translate('moves.fuel.empty'):f===0.125?translate('moves.fuel.quarterMinus'):f===0.25?translate('moves.fuel.quarter'):f===0.375?translate('moves.fuel.halfMinus'):f===0.5?translate('moves.fuel.half'):f===0.625?translate('moves.fuel.threeQuarterMinus'):f===0.75?translate('moves.fuel.threeQuarter'):f===0.875?translate('moves.fuel.fullMinus'):f===1?translate('moves.fuel.full'):'~'+Math.round(f*100)+'%'; }

// ── toggleDestExtraFields (orig. toggleOfficeNameField, orig. line 9487) ──
// Affiche le champ "Office Name" si dest=office, "Garage/Workshop Name" si dest=workshop.
function toggleDestExtraFields(){
  let dest = document.getElementById('move-dest').value;
  let officeGrp = document.getElementById('office-name-group');
  let workshopGrp = document.getElementById('workshop-location-group');
  if(officeGrp) officeGrp.style.display = (dest === 'office') ? '' : 'none';
  if(workshopGrp) workshopGrp.style.display = (dest === 'workshop') ? '' : 'none';
  if(dest !== 'office'){
    let inp = document.getElementById('move-office-name');
    if(inp) inp.value = '';
  }
  if(dest !== 'workshop'){
    let inp2 = document.getElementById('move-workshop-location');
    if(inp2) inp2.value = '';
  }
}

// ── setMoveDir (orig. line 9497) ──
function setMoveDir(dir){
  document.getElementById('move-direction').value = dir;
  const sentBtn = document.getElementById('dir-sent-btn');
  const recvBtn = document.getElementById('dir-recv-btn');
  const departureSection = document.getElementById('departure-out-section');
  
  if(dir === 'sent'){
    sentBtn.style.border = '2.5px solid #dc2626';
    sentBtn.style.background = 'rgba(220,38,38,.15)';
    recvBtn.style.border = '2px solid rgba(22,163,74,.3)';
    recvBtn.style.background = 'rgba(22,163,74,.05)';
    document.getElementById('sec3-title').textContent = translate('moves.sec3TitleSent');
    document.getElementById('driver-label').textContent = translate('moves.driverLabelSent');
    document.getElementById('location-label').textContent = translate('moves.locationLabelSent');
    // Show Departure OUT section
    if(departureSection) departureSection.style.display = 'block';
  } else {
    recvBtn.style.border = '2.5px solid #16a34a';
    recvBtn.style.background = 'rgba(22,163,74,.15)';
    sentBtn.style.border = '2px solid rgba(220,38,38,.3)';
    sentBtn.style.background = 'rgba(220,38,38,.05)';
    document.getElementById('sec3-title').textContent = translate('moves.sec3TitleReceived');
    document.getElementById('driver-label').textContent = translate('moves.driverLabelReceived');
    document.getElementById('location-label').textContent = translate('moves.locationLabelReceived');
    // Hide Departure OUT section
    if(departureSection) departureSection.style.display = 'none';
  }
}

// ── renderMoves (orig. line 9526) ──
function renderMoves(){
  ensurePageLoaded('moves');
  if(!DB.moves) DB.moves=[];
  const search=(document.getElementById('moves-search')||{}).value||'';
  const sl=search.toLowerCase();
  let list = DB.moves.slice().sort((a,b)=>new Date(b.dateOut||b.dateIn||0)-new Date(a.dateOut||a.dateIn||0));

  // ── Filter by month: show movements of selected month + all open (not yet returned) ──
  list = list.filter(m=>{
    const isOpen = !m.dateIn;
    const mDate = (m.dateIn||m.dateOut||'').slice(0,7);
    return isOpen || mDate === currentMovesMonth;
  });

  if(movesFilter==='sent')     list=list.filter(m=>m.direction==='sent'||(m.direction===undefined));
  else if(movesFilter==='received') list=list.filter(m=>m.direction==='received');
  else if(movesFilter==='open')   list=list.filter(m=>!m.dateIn);
  else if(movesFilter==='closed') list=list.filter(m=>!!m.dateIn);
  else if(['workshop','washing','inspection','airport','delivery','personal','office','other'].includes(movesFilter)) list=list.filter(m=>m.dest===movesFilter);

  if(sl) list=list.filter(m=>(m.plate||'').toLowerCase().includes(sl)||(m.user||'').toLowerCase().includes(sl)||(m.notes||'').toLowerCase().includes(sl)||(DEST_LABELS[m.dest]||'').toLowerCase().includes(sl)||(m.officeNameText||'').toLowerCase().includes(sl)||(m.workshopLocation||'').toLowerCase().includes(sl));

  // ── Sync month input ──
  const monthInput=document.getElementById('moves-month-input');
  if(monthInput) monthInput.value=currentMovesMonth;

  // ── Month label in table header ──
  const [my,mm]=currentMovesMonth.split('-').map(Number);
  const monthNames=(typeof i18nMonthNames === 'function') ? i18nMonthNames() : ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const monthLabel=document.getElementById('moves-month-label');
  if(monthLabel) monthLabel.textContent=`— ${monthNames[mm-1]} ${my}`;

  // Stats
  document.getElementById('moves-stat-total').textContent=DB.moves.length;
  document.getElementById('moves-stat-sent').textContent=DB.moves.filter(m=>!m.direction||m.direction==='sent').length;
  document.getElementById('moves-stat-open').textContent=DB.moves.filter(m=>!m.dateIn).length;
  document.getElementById('moves-stat-month').textContent=DB.moves.filter(m=>(m.dateIn||m.dateOut||'').slice(0,7)===currentMovesMonth).length;
  document.getElementById('moves-count').textContent=list.length+' '+(list.length>1?translate('moves.countPlural'):translate('moves.count'));

  // Badge in nav
  const openCnt=DB.moves.filter(m=>!m.dateIn).length;
  const badge=document.getElementById('moves-badge');
  if(badge){ badge.textContent=openCnt; badge.style.display=openCnt>0?'':'none'; }

  const tbody=document.getElementById('moves-body');
  if(!list.length){ tbody.innerHTML='<tr><td colspan="16" class="empty">'+translate('moves.empty')+'</td></tr>'; return; }

  tbody.innerHTML=list.map(m=>{
    const isOpen=!m.dateIn;
    const isSent=!m.direction||m.direction==='sent';
    const kmDone=(m.kmIn&&m.kmOut&&m.kmIn>0&&m.kmOut>0)?m.kmIn-m.kmOut:null;
    const destLabel=DEST_LABELS[m.dest]||m.dest||'—';
    const destLabelFull = (m.dest === 'office' && m.officeNameText) ? destLabel + ' · ' + escapeHtml(m.officeNameText)
                         : (m.dest === 'workshop' && m.workshopLocation) ? destLabel + ' · ' + escapeHtml(m.workshopLocation)
                         : destLabel;
    const destClass=DEST_COLORS[m.dest]||'move-dest-other';
    const vehName=getVehicleNameByPlate(m.plate)||'—';
    // Couleur depuis GPS Tracking (par plaque) sinon fallback dynamique
    const _gpsEntry = (DB.gpsLinks||[]).find(g=>(g.plate||'').trim().toUpperCase()===(m.plate||'').trim().toUpperCase());
    const vColor = _gpsEntry && _gpsEntry.colorPlate ? _gpsEntry.colorPlate : getVehicleColor(vehName);
    const _gpsBg = _gpsEntry && _gpsEntry.colorPlate ? _gpsEntry.colorPlate+'22' : null;
    const _gpsBorder = _gpsEntry && _gpsEntry.colorPlate ? _gpsEntry.colorPlate+'66' : null;
    const {bg:_fallbackBg,border:_fallbackBorder}=getVehicleBadgeColors(vehName);
    const vBg = _gpsBg || _fallbackBg;
    const vBorder = _gpsBorder || _fallbackBorder;
    const depBg=vColor+'0a';
    const retBg=vColor+'0d';
    const statusBadge=isOpen
      ?'<span class="move-status-movement">'+translate('moves.statusOpen')+'</span>'
      :'<span class="move-status-available">'+translate('moves.statusClosed')+'</span>';
    const fmtDt=dt=>{ if(!dt) return '<span style="color:var(--dim)">—</span>'; const d=new Date(dt); return `<span style="font-family:var(--mono);font-size:.78rem">${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}</span>`; };
    // Badge véhicule coloré : fond couleur véhicule, texte blanc, plaque en mono
    const plateNum=m.plate||'—';
    const vehicleBadge=`<span style="display:inline-flex;align-items:center;gap:5px;background:${vBg};border:1.5px solid ${vBorder};border-radius:6px;padding:3px 8px;white-space:nowrap"><span style="font-size:.8rem;font-weight:800;color:#000;font-family:var(--mono)">${vehName}</span><span style="font-size:.72rem;font-weight:700;color:#000;opacity:.75;font-family:var(--mono)">${plateNum}</span></span>`;
    const rowBg = isOpen ? 'background:linear-gradient(90deg,rgba(245,158,11,.07),rgba(245,158,11,.03))' : '';
    const rowBorder = isOpen ? 'border-left:3px solid #f59e0b' : 'border-left:3px solid transparent';
    return `<tr style="${rowBg};${rowBorder};transition:background .15s" onmouseover="this.style.background='rgba(var(--accent-rgb),.04)'" onmouseout="this.style.background='${isOpen?'rgba(245,158,11,.05)':''}'" >
      <td style="padding:8px 12px;white-space:nowrap">${vehicleBadge}</td>
      <td style="padding:8px 12px"><span class="move-dest-badge ${destClass}">${destLabelFull}</span></td>
      <td style="padding:8px 12px;font-weight:700;font-size:.83rem;color:${vColor};background:${depBg};border-left:2px solid ${vColor}30">${m.user?escapeHtml(m.user):'<span style="color:var(--dim)">—</span>'}</td>
      <td style="padding:8px 12px;background:${depBg}">${fmtDt(m.dateOut)}</td>
      <td style="padding:8px 12px;font-family:var(--mono);font-size:.82rem;color:${vColor};font-weight:600;background:${depBg}">${m.kmOut>0?Number(m.kmOut).toLocaleString():'<span style="color:var(--dim)">—</span>'}</td>
      <td style="padding:8px 12px;background:${depBg}">${fuelLabel(m.fuelOut)}</td>
      <td style="padding:8px 12px;font-weight:700;font-size:.83rem;color:${vColor};background:${retBg};border-left:2px solid ${vColor}30">${m.userIn||'<span style="color:var(--dim)">—</span>'}</td>
      <td style="padding:8px 12px;background:${retBg}">${fmtDt(m.dateIn)}</td>
      <td style="padding:8px 12px;font-family:var(--mono);font-size:.82rem;color:${vColor};font-weight:600;background:${retBg}">${m.kmIn>0?Number(m.kmIn).toLocaleString():'<span style="color:var(--dim)">—</span>'}</td>
      <td style="${(m.fuelIn!==''&&m.fuelIn!==null&&m.fuelIn!==undefined&&m.fuelOut!==''&&m.fuelOut!==null&&m.fuelOut!==undefined&&Number(m.fuelIn)<Number(m.fuelOut))?'padding:8px 12px;background:rgba(220,38,38,.15);border-left:3px solid #dc2626':`padding:8px 12px;background:${retBg}`}">
        ${(m.fuelIn!==''&&m.fuelIn!==null&&m.fuelIn!==undefined&&m.fuelOut!==''&&m.fuelOut!==null&&m.fuelOut!==undefined&&Number(m.fuelIn)<Number(m.fuelOut))
          ?`<span style="color:#dc2626;font-weight:700">⚠ ${fuelLabel(m.fuelIn)}</span>`
          :fuelLabel(m.fuelIn)
        }
      </td>
      <td style="padding:8px 12px;text-align:center;font-family:var(--mono);font-size:.82rem;font-weight:700;${kmDone!==null&&kmDone>=0?'color:#2563eb':'color:var(--dim)'}">${kmDone!==null&&kmDone>=0?'<span style="background:rgba(37,99,235,.1);border:1px solid rgba(37,99,235,.25);border-radius:5px;padding:2px 7px">+'+kmDone.toLocaleString()+'</span>':'—'}</td>
      <td style="padding:8px 12px;text-align:center">${statusBadge}</td>
      <td style="padding:8px 12px;max-width:110px;overflow:hidden;text-overflow:ellipsis;font-size:.78rem;color:var(--muted)">${m.notes?escapeHtml(m.notes):'<span style=color:var(--dim)>—</span>'}</td>
      <td style="padding:8px 12px">
        <div style="display:flex;gap:5px;align-items:center">
          ${isOpen?`<button class="btn btn-primary" style="padding:4px 10px;font-size:.72rem;background:linear-gradient(135deg,#16a34a,#22c55e);border:none;white-space:nowrap;border-radius:6px" data-moves-action="quickClose" data-id="${m.id}">${translate('moves.returnBtn')}</button>`:''}
          <button class="btn btn-ghost" style="padding:4px 8px;font-size:.75rem" data-moves-action="edit" data-id="${m.id}">🔒✏️</button>
          <button class="btn btn-ghost btn-delete" style="padding:4px 8px;font-size:.75rem" data-moves-action="delete" data-id="${m.id}">🔒🗑️</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

// ── nowLocalDatetime : renvoie la date/heure LOCALE du PC (pas UTC) au format YYYY-MM-DDTHH:mm ──
function nowLocalDatetime(){
  const d = new Date();
  const pad = n => String(n).padStart(2,'0');
  return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes());
}

// ── openMoveModal (orig. line 9629) ──
function openMoveModal(){
  document.getElementById('move-overlay').classList.add('show');
  document.getElementById('move-edit-id').value='';
  document.getElementById('move-modal-title').textContent=translate('moves.newModalTitle');
  document.getElementById('move-plate').value=''; document.getElementById('move-plate').style.borderColor='';
  let _mvn=document.getElementById('move-vname'); if(_mvn){_mvn.value='';_mvn.style.borderColor='';_mvn.style.color='var(--muted)';}
  document.getElementById('move-user').value='';
  document.getElementById('move-user-in').value='';
  document.getElementById('move-dest').value='workshop';
  toggleDestExtraFields();
  document.getElementById('move-date-out').value=nowLocalDatetime();
  document.getElementById('move-date-in').value='';
  document.getElementById('move-km-out').value='';
  document.getElementById('move-km-in').value='';
  document.getElementById('move-fuel-out').value='';
  document.getElementById('move-fuel-in').value='';
  document.getElementById('move-notes').value='';
  resetFuelBtns('out'); resetFuelBtns('in');
  setMoveDir('sent');
  lockMoveKmOutField(false);
  lockMoveFuelOutField(false);
}

// ── setFuel (orig. line 9652) ──
function setFuel(dir,val){
  let sel = document.getElementById('move-fuel-'+dir);
  if(sel) sel.value = (val===null||val===undefined||val==='') ? '' : String(val);
}

// ── resetFuelBtns (orig. line 9657) ──
function resetFuelBtns(dir){
  let sel = document.getElementById('move-fuel-'+dir);
  if(sel) sel.value = '';
}

// ── getLastVehicleAutoFillForMove (orig. line 9662) ──
function getLastVehicleAutoFillForMove(plate, excludeMoveId){
  // Same logic as getLastVehicleAutoFill (incl. condition), but optionally excludes the current movement being edited
  // LOGIC: Always use the HIGHEST KM ever recorded (vehicles only go up in mileage, never down)
  if(!plate) return null;
  let plateN = extractPlateNum(plate);
  let candidates = [];

  DB.rentals.filter(r => {
    let v = r.vehicleId ? (DB.vehicles.find(x=>x.id===r.vehicleId)||{}) : {};
    let rPlate = v.plate || r._plate || '';
    return extractPlateNum(rPlate) === plateN && !r._cancelled;
  }).forEach(r => {
    if(r.kmIn && Number(r.kmIn) > 0 && r.dateIn && r.dateIn !== '')
      candidates.push({ km: Number(r.kmIn), fuel: (r.fuelIn!==undefined && r.fuelIn!==null && r.fuelIn!=='') ? r.fuelIn : null, dt: r.dateIn, src: 'rental-IN' });
  });

  (DB.moves || []).filter(m => extractPlateNum(m.plate||'') === plateN && m.id !== excludeMoveId).forEach(m => {
    if(m.kmIn && Number(m.kmIn) > 0 && m.dateIn && m.dateIn !== '')
      candidates.push({ km: Number(m.kmIn), fuel: (m.fuelIn!==undefined && m.fuelIn!==null && m.fuelIn!=='') ? m.fuelIn : null, dt: m.dateIn, src: 'move-IN' });
  });

  if(!candidates.length) return null;
  // Sort by KM descending — always use the HIGHEST KM recorded (most recent mileage)
  candidates.sort((a, b) => b.km - a.km);
  return candidates[0];
}

// ── autoFillMoveKmFuelOut (orig. line 9689) ──
function autoFillMoveKmFuelOut(){
  let editId = document.getElementById('move-edit-id').value;
  if(editId && editId !== '') return; // Skip auto-fill when editing an existing movement

  let plate = (document.getElementById('move-plate').value || '').trim();
  if(!plate) return;

  let kmEl = document.getElementById('move-km-out');
  let kmIcon = document.getElementById('movekmout-lock-icon');
  let fuelIcon = document.getElementById('movefuelout-lock-icon');

  let last = getLastVehicleAutoFillForMove(plate, null);
  if(!last){
    lockMoveKmOutField(false);
    lockMoveFuelOutField(false);
    if(kmIcon) kmIcon.innerHTML = '';
    if(fuelIcon) fuelIcon.innerHTML = '';
    return;
  }

  if(kmEl){
    kmEl.value = last.km;
    lockMoveKmOutField(true);
  }

  if(last.fuel !== null && last.fuel !== undefined){
    setFuel('out', Number(last.fuel));
    lockMoveFuelOutField(true);
  } else {
    lockMoveFuelOutField(false);
    if(fuelIcon) fuelIcon.innerHTML = '';
  }

  toast(translate('moves.autoFillToast') + (last.src === 'move-IN' ? translate('moves.autoFillFromMove') : translate('moves.autoFillFromRental')));
  logAction('km_update', '📍 Internal Movement — Auto-fill KM/Fuel Out ('+plate+')', 'KM Out: '+last.km+(last.fuel!==null?' | Fuel Out: '+last.fuel:'')+' | Source: '+(last.src==='move-IN'?'Internal Movement':'Rental')+' | Date: '+(last.dt||'—'), plate);
  updateLogBadge();
}

// ── lockMoveKmOutField (orig. line 9727) ──
function lockMoveKmOutField(locked){
  let kmEl = document.getElementById('move-km-out');
  let kmIcon = document.getElementById('movekmout-lock-icon');
  if(!kmEl) return;
  if(locked){
    kmEl.readOnly = true;
    kmEl.style.cursor = 'not-allowed';
    kmEl.style.opacity = '.7';
    if(kmIcon){ kmIcon.innerHTML = '🔒 Auto-filled'; kmIcon.style.color = '#f59e0b'; kmIcon.style.cursor='pointer'; }
  } else {
    kmEl.readOnly = false;
    kmEl.style.cursor = 'text';
    kmEl.style.opacity = '1';
    if(kmIcon){ kmIcon.innerHTML = ''; }
  }
}

// ── unlockMoveKmOutField (orig. line 9744) ──
function unlockMoveKmOutField(){
  let kmEl = document.getElementById('move-km-out');
  if(!kmEl || !kmEl.readOnly) return;
  securePrompt(translate('moves.pwdKmOutPrompt')).then(function(pw){
    if(pw === null) return;
    checkPassword(pw, 'Internal Movement — Unlock KM Out').then(function(ok){
    if(ok){
      kmEl.readOnly = false;
      kmEl.style.cursor = 'text';
      kmEl.style.opacity = '1';
      kmEl.style.borderColor = '#f97316';
      let icon = document.getElementById('movekmout-lock-icon');
      if(icon){ icon.innerHTML = '🔓 Unlocked'; icon.style.color = '#f97316'; }
      kmEl.focus();
      toast(translate('moves.kmOutUnlockedToast'));
      logAction('km_update', '🔓 Internal Movement — KM Out field unlocked', 'Plate: '+(document.getElementById('move-plate').value||'—'), '');
      updateLogBadge();
    } else {
      toast(translate('moves.wrongPassword'));
    }
    }); // end checkPassword
  }); // end securePrompt
}

// ── lockMoveFuelOutField (orig. line 9766) ──
function lockMoveFuelOutField(locked){
  let sel = document.getElementById('move-fuel-out');
  let fuelIcon = document.getElementById('movefuelout-lock-icon');
  if(!sel) return;
  if(locked){
    sel.disabled = true;
    sel.style.cursor = 'not-allowed';
    sel.style.opacity = '.7';
    if(fuelIcon){ fuelIcon.innerHTML = '🔒 Auto-filled'; fuelIcon.style.color = '#f59e0b'; fuelIcon.style.cursor='pointer'; }
  } else {
    sel.disabled = false;
    sel.style.cursor = '';
    sel.style.opacity = '1';
    if(fuelIcon){ fuelIcon.innerHTML = ''; }
  }
}

// ── unlockMoveFuelOutField (orig. line 9783) ──
function unlockMoveFuelOutField(ev){
  let sel = document.getElementById('move-fuel-out');
  if(!sel || !sel.disabled) return;
  if(ev) ev.stopPropagation();
  securePrompt(translate('moves.pwdFuelOutPrompt')).then(function(pw){
    if(pw === null) return;
    checkPassword(pw, 'Internal Movement — Unlock Fuel Out').then(function(ok){
    if(ok){
      sel.disabled = false;
      sel.style.cursor = '';
      sel.style.opacity = '1';
      sel.style.borderColor = '#f97316';
      let icon = document.getElementById('movefuelout-lock-icon');
      if(icon){ icon.innerHTML = '🔓 Unlocked'; icon.style.color = '#f97316'; }
      toast(translate('moves.fuelOutUnlockedToast'));
      logAction('km_update', '🔓 Internal Movement — Fuel Out field unlocked', 'Plate: '+(document.getElementById('move-plate').value||'—'), '');
      updateLogBadge();
    } else {
      toast(translate('moves.wrongPassword'));
    }
    }); // end checkPassword
  }); // end securePrompt
}
// ── closeMoveModal (orig. line 9804) ──
function closeMoveModal(){ document.getElementById('move-overlay').classList.remove('show'); }

// ── movePlateAutoFill (orig. line 9806) ──
function movePlateAutoFill(val){
  let nameEl = document.getElementById('move-vname');
  if(!nameEl) return;
  let norm = (val||'').trim().toUpperCase();
  // Look in GPS Tracking first (master list: own fleet + other branches)
  let foundG = DB.gpsLinks && DB.gpsLinks.find(g => (g.plate||'').trim().toUpperCase() === norm);
  let foundName = foundG ? foundG.name : null;
  // Fallback to DB.vehicles
  if(!foundName){ let fv = DB.vehicles.find(v => (v.plate||'').toUpperCase() === norm); foundName = fv ? fv.name : null; }
  let exists = !!foundName || fleetPlateExists(norm);
  if(foundName){
    nameEl.value = foundName;
    nameEl.style.color = 'var(--text)';
    nameEl.style.borderColor = '#10b981';
    document.getElementById('move-plate').style.borderColor = '#10b981';
  } else if(exists){
    nameEl.value = '—';
    nameEl.style.color = 'var(--muted)';
    nameEl.style.borderColor = '#10b981';
    document.getElementById('move-plate').style.borderColor = '#10b981';
  } else {
    nameEl.value = '';
    nameEl.style.color = 'var(--muted)';
    nameEl.style.borderColor = '';
    document.getElementById('move-plate').style.borderColor = val.length > 0 ? '#ef4444' : '';
  }
}
// ── fleetPlateExists (orig. line 9833) ──
function fleetPlateExists(plate){
  if(!plate) return false;
  let norm = plate.trim().toUpperCase();
  // GPS Tracking = master list (own fleet + other branches)
  if(DB.gpsLinks && DB.gpsLinks.some(g => (g.plate||'').trim().toUpperCase() === norm)) return true;
  // Fallback: DB.vehicles
  return DB.vehicles.some(v => (v.plate||'').toUpperCase() === norm);
}
// ── saveMove (orig. line 9841) ──
function saveMove(){
  const editId=document.getElementById('move-edit-id').value;
  const plate=document.getElementById('move-plate').value.trim();
  const user=document.getElementById('move-user').value.trim();
  const userIn=document.getElementById('move-user-in').value.trim();
  const dateOut=document.getElementById('move-date-out').value;
  const dateIn=document.getElementById('move-date-in').value;
  const direction=document.getElementById('move-direction').value||'sent';
  if(!plate){ alert(translate('moves.alertPlateRequired')); return; }
  if(!fleetPlateExists(plate)){ alert(translate('moves.alertPlateNotFound').replace('{plate}', plate)); document.getElementById('move-plate').style.borderColor='#ef4444'; document.getElementById('move-plate').focus(); return; }
  // ✅ Bloquer la création d'un mouvement interne si le véhicule est actuellement loué (contrat client ouvert)
  if(!editId){
    const openRental = (DB.rentals||[]).find(r => {
      const v = r.vehicleId ? (DB.vehicles.find(x=>x.id===r.vehicleId)||{}) : {};
      const rPlate = v.plate || r._plate || '';
      return extractPlateNum(rPlate) === extractPlateNum(plate) && (!r.dateIn || r.dateIn === '') && !r._cancelled;
    });
    if(openRental){
      alert(translate('moves.alertVehicleRented').replace('{plate}', plate).replace('{contract}', openRental.contract||openRental.id));
      document.getElementById('move-plate').style.borderColor='#ef4444';
      document.getElementById('move-plate').focus();
      return;
    }
  }
  if(!user){ alert(translate('moves.alertDriverRequired')); return; }
  // When direction is "received", check if userIn is provided
  if(direction==='received' && !userIn){ alert(translate('moves.alertDriverInRequired')); document.getElementById('move-user-in').focus(); return; }
  // ✅ "sent" → Date OUT requise (le véhicule part d'ici) | "received" → Date IN requise (le véhicule arrive d'un autre office, OUT non pertinent)
  if(direction==='sent'){
    if(!dateOut){ alert(translate('moves.alertDateOutRequired')); return; }
  } else {
    if(!dateIn){ alert(translate('moves.alertDateInRequired')); return; }
  }
  // ✅ Bloquer si un mouvement (ouvert OU déjà fermé) chevauche la période demandée pour cette plaque
  const newOut = dateOut ? new Date(dateOut).getTime() : null;
  const newIn  = dateIn  ? new Date(dateIn).getTime()  : Infinity;
  const overlapMove = (DB.moves||[]).find(m => {
    if(editId && m.id === Number(editId)) return false;
    if(extractPlateNum(m.plate) !== extractPlateNum(plate)) return false;
    const existOut = m.dateOut ? new Date(m.dateOut).getTime() : null;
    if(existOut === null || isNaN(existOut) || newOut === null || isNaN(newOut)) return false;
    const existIn = m.dateIn ? new Date(m.dateIn).getTime() : Infinity;
    return newOut < existIn && existOut < newIn;
  });
  if(overlapMove){
    alert(translate('moves.alertVehicleHasOpenMove').replace('{plate}', plate));
    document.getElementById('move-plate').style.borderColor='#ef4444';
    document.getElementById('move-plate').focus();
    return;
  }
  // ✅ Destination = Workshop → le nom du garage est obligatoire
  const destVal = document.getElementById('move-dest').value;
  const workshopLocationRaw = document.getElementById('move-workshop-location').value.trim();
  if(destVal === 'workshop' && !workshopLocationRaw){
    alert(translate('moves.alertWorkshopNameRequired'));
    document.getElementById('move-workshop-location').focus();
    return;
  }

  if(!DB.moves) DB.moves=[];
  if(!DB.nextMId) DB.nextMId=1;

  const mov={
    id: editId?Number(editId):_genId(),
    direction: direction,
    plate: plate.toUpperCase(),
    user: user,
    userIn: userIn,
    dest: destVal,
    officeNameText: (destVal === 'office') ? (document.getElementById('move-office-name').value.trim()) : '',
    workshopLocation: (destVal === 'workshop') ? workshopLocationRaw : '',
    dateOut: dateOut,
    kmOut: Number(document.getElementById('move-km-out').value)||0,
    fuelOut: document.getElementById('move-fuel-out').value,
    dateIn: document.getElementById('move-date-in').value,
    kmIn: Number(document.getElementById('move-km-in').value)||0,
    fuelIn: document.getElementById('move-fuel-in').value,
    notes: document.getElementById('move-notes').value.trim(),
    createdAt: editId?(DB.moves.find(m=>m.id===Number(editId))||{}).createdAt||new Date().toISOString():new Date().toISOString()
  };

  // ── Capturer l'ID AVANT closeMoveModal (sécurité : closeModal ne doit pas reset le form avant ça) ──
  let _savedId;
  if(editId){
    const idx=DB.moves.findIndex(m=>m.id===Number(editId));
    if(idx>-1) DB.moves[idx]=mov;
    _savedId = Number(editId);
  } else {
    DB.moves.push(mov);
    _savedId = mov.id;
    const dirLabel=direction==='sent'?translate('moves.dirSent'):translate('moves.dirReceived');
    const destDisplay = (mov.dest === 'office' && mov.officeNameText) ? (DEST_LABELS[mov.dest]||mov.dest)+' · '+mov.officeNameText
                       : (mov.dest === 'workshop' && mov.workshopLocation) ? (DEST_LABELS[mov.dest]||mov.dest)+' · '+mov.workshopLocation
                       : (DEST_LABELS[mov.dest]||mov.dest);
    logAction('edit','🔄 Internal Move — '+plate+' '+dirLabel+' → '+destDisplay,(direction==='sent'?'Driver: ':'From: ')+user+' | Date: '+dateOut,plate);
  }
  closeMoveModal();
  renderMoves();

  // ── Sauvegarde serveur — chemin unique via window._coreSaveMove (alias core.js) ──
  if(_savedId){
    if(typeof window._coreSaveMove === 'function'){
      window._coreSaveMove(_savedId);
    } else {
      console.error('❌ _coreSaveMove indisponible — core.js non chargé ?');
      alert(translate('moves.saveFailedAlert'));
    }
  }
  
  showToast(translate('moves.savedToast') + plate);
}

// ── editMove (orig. line 9897) ──
function editMove(id){
  if(!DB.moves) return;
  const m=DB.moves.find(x=>x.id===id);
  if(!m) return;
  openMoveModal();
  document.getElementById('move-edit-id').value=id;
  document.getElementById('move-modal-title').textContent=translate('moves.editModalTitle')+id;
  document.getElementById('move-plate').value=m.plate||''; movePlateAutoFill(m.plate||'');
  document.getElementById('move-user').value=m.user||'';
  document.getElementById('move-user-in').value=m.userIn||'';
  document.getElementById('move-dest').value=m.dest||'other';
  toggleDestExtraFields();
  let officeNameInp = document.getElementById('move-office-name');
  if(officeNameInp) officeNameInp.value = m.officeNameText || '';
  let workshopLocInp = document.getElementById('move-workshop-location');
  if(workshopLocInp) workshopLocInp.value = m.workshopLocation || '';
  document.getElementById('move-date-out').value=m.dateOut||'';
  document.getElementById('move-date-in').value=m.dateIn||'';
  document.getElementById('move-km-out').value=m.kmOut||'';
  document.getElementById('move-km-in').value=m.kmIn||'';
  document.getElementById('move-fuel-out').value=m.fuelOut!==undefined?m.fuelOut:'';
  document.getElementById('move-fuel-in').value=m.fuelIn!==undefined?m.fuelIn:'';
  document.getElementById('move-notes').value=m.notes||'';
  setMoveDir(m.direction||'sent');
  if(m.fuelOut!==''&&m.fuelOut!==undefined) setFuel('out',Number(m.fuelOut));
  if(m.fuelIn!==''&&m.fuelIn!==undefined) setFuel('in',Number(m.fuelIn));
}

// ── quickCloseMove (orig. line 9923) ──
function quickCloseMove(id){
  if(!DB.moves) return;
  const m=DB.moves.find(x=>x.id===id);
  if(!m) return;
  editMove(id);
  document.getElementById('move-date-in').value=nowLocalDatetime();
}

// ── deleteMove (orig. line 9931) ──
function deleteMove(id){
  if(!confirm(translate('moves.confirmDelete'))) return;
  if(!DB.moves) return;
  DB.moves=DB.moves.filter(m=>m.id!==id);
  renderMoves();
  deleteOne('moves', id);
  showToast(translate('moves.deletedToast'));
}

// ── deleteMovePwd (orig. line 9940) ──
function deleteMovePwd(id){
  securePrompt(translate('moves.pwdDeletePrompt')).then(function(pw){
    if(pw === null) return;
    checkPassword(pw, 'Internal Movement — Delete Movement #' + id).then(function(ok){
      if(!ok){ toast(translate('moves.wrongPassword')); return; }
      deleteMove(id);
    });
  });
}

// ── editMovePwd (orig. line 9948) ──
function editMovePwd(id){
  securePrompt(translate('moves.pwdEditPrompt')).then(function(pw){
    if(pw === null) return;
    checkPassword(pw, 'Internal Movement — Edit Movement #' + id).then(function(ok){
      if(!ok){ toast(translate('moves.wrongPassword')); return; }
      editMove(id);
    });
  });
}

// ═══════════════════════════════ GPS TRACKING (MadarTech) ═══════════════════════════════
