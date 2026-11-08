// ═══════════════════════════════════════════════════════════════════
// module-daily-rentals-list.js
// LIST — rendu Daily Rentals / Open Contracts, filtres, routeur de clics data-dr-action
// Extrait automatiquement de module-daily-rentals.js (découpage mécanique,
// aucune ligne modifiée — tout reste en portée globale, comme avant).
// ═══════════════════════════════════════════════════════════════════


// ── jumpToRentalRow — scroll + surlignage vers un contract lié (badge croisé temp ↔ original) ──
function jumpToRentalRow(id){
  let ocEl = document.getElementById('oc-row-' + id);
  if(ocEl){
    ocEl.scrollIntoView({behavior:'smooth', block:'center'});
    ocEl.style.transition = 'box-shadow .3s';
    ocEl.style.boxShadow = '0 0 0 3px rgba(124,58,237,.75)';
    setTimeout(()=>{ ocEl.style.boxShadow = ''; }, 1800);
    return;
  }
  let rowEl = document.getElementById('rental-row-' + id);
  if(rowEl){
    let dayTable = rowEl.closest('.day-table');
    if(dayTable && dayTable.style.display === 'none') dayTable.style.display = 'block';
    let oldBlock = rowEl.closest('div[style*="overflow-x:auto"]');
    if(oldBlock && oldBlock.style.display === 'none') oldBlock.style.display = 'block';
    rowEl.scrollIntoView({behavior:'smooth', block:'center'});
    let origBg = rowEl.style.background;
    rowEl.style.transition = 'background .3s';
    rowEl.style.background = 'rgba(124,58,237,.3)';
    setTimeout(()=>{ rowEl.style.background = origBg; }, 1800);
    return;
  }
  toast('⚠️ Contract not visible in the current month/view.');
}


// ── renderDaily (orig. line 4974) ──
// ── OC status filter helpers (niveau module — partagés par renderDaily et renderOpenContracts) ──
const OC_LATE_DAYS = 30;
function ocDaysSince(dateStr){
  if(!dateStr) return 0;
  let d = new Date(String(dateStr).replace(' ','T'));
  if(isNaN(d)) return 0;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

function ocContractBal(r){
  if(r._balManual) return (r.bal !== undefined && r.bal !== null) ? Number(r.bal) : 0;
  let isOpenR = !r.dateIn || r.dateIn === '';
  let b = isOpenR ? calcOpenContractBAL(r) : calcRentalBAL(r);
  if(b === null) b = (r.bal !== undefined && r.bal !== null) ? Number(r.bal) : Number((r.price||0)-(r.paid||0));
  return Number(b);
}

function ocStatusMatch(r, filter){
  if(filter === 'all') return true;
  let bal = ocContractBal(r);
  let paid = Number(r.paid||0);
  let isOpenR = !r.dateIn || r.dateIn === '';
  if(filter === 'unpaid') return bal > 0 && paid === 0;
  if(filter === 'inrental') return isOpenR;
  if(filter === 'partial') return paid > 0 && bal > 0;
  if(filter === 'late') return bal > 0 && ocDaysSince(r.dateOut) >= OC_LATE_DAYS;
  if(filter === 'closedbal') return !isOpenR && bal > 0;
  if(filter === 'temp') return r._tempReplacement === true;
  return true;
}


function renderDaily(){
  let picker = document.getElementById('month-picker');
  let ym = (picker && picker.value) ? picker.value : (window._currentYm || new Date().toISOString().slice(0,7));
  window._currentYm = ym;
  let [yr,mo] = ym.split('-').map(Number);

  // Helper: date du dernier payment d'un contract
  const lastPaymentYm = r => {
    let pays = paymentsForContract(r.contract, r.branch, r.vehicleId).filter(p => p.dateOut);
    if(!pays.length && r.paymentLog && r.paymentLog.length){
      let dates = r.paymentLog.map(p => (p.date||'')).filter(Boolean).sort();
      return dates.length ? dates[dates.length-1].slice(0,7) : (r.dateOut||'').slice(0,7);
    }
    let dates = pays.map(p => p.dateOut).sort();
    return dates.length ? dates[dates.length-1].slice(0,7) : (r.dateOut||'').slice(0,7);
  };

  let filtrees = DB.rentals.filter(r => {
    if(!isClosedAndSettled(r)) return false; // open ou BAL > 0 → pas dans Daily
    let outYm = (r.dateOut||'').slice(0,7);
    let inYm  = (r.dateIn||'').slice(0,7);
    let lpYm  = lastPaymentYm(r);
    // Rental ouvert ce month
    if(outYm === ym) return true;
    // Rental ouvert before, fermé ce month
    if(outYm < ym && inYm === ym) return true;
    // Rental soldé ce month (dernier payment = ce month, même si ouvert/fermé before)
    if(outYm < ym && lpYm === ym) return true;
    return false;
  });

  let ocActiveFilter = window._ocFilter || 'all';
  if(ocActiveFilter !== 'all'){
    filtrees = filtrees.filter(r => ocStatusMatch(r, ocActiveFilter));
  }

  const isOldContract = r => (r.dateOut||'').slice(0,7) < ym;
  // ✅ i18n (2026-07) : noms de mois traduits selon la langue active
  const monthNames = (typeof i18nMonthNames === 'function') ? i18nMonthNames() : ['January','February','March','April','May','June','July','August','September','October','November','December'];

  // Rentals normaux du month (dateOut = ce month)
  let normaux = filtrees.filter(r => (r.dateOut||'').slice(0,7) === ym);
  // Rentals old fermés ce month (dateIn = ce month, dateOut < ce month)
  let olds = filtrees.filter(r => isOldContract(r) && (r.dateIn||'').slice(0,7) === ym);
  // Rentals soldés tardivement ce month (dateOut < ce month, dateIn < ce month OU dateIn autre, mais dernier payment = ce month)
  let settledLate = filtrees.filter(r => {
    let outYm = (r.dateOut||'').slice(0,7);
    let inYm  = (r.dateIn||'').slice(0,7);
    if(outYm === ym) return false; // déjà dans normaux
    if(inYm === ym) return false;  // déjà dans olds
    return lastPaymentYm(r) === ym;
  });
  const buildLigne = r => { let v = r.vehicleId ? (DB.vehicles.find(v => v.id === r.vehicleId) || {}) : {}; let plateFromRental = r._plate || r.plate; let vehicleByPlate = DB.vehicles.find(veh => veh["Plate No."] === plateFromRental); let isExternal = !vehicleByPlate; let isCancelled = r._cancelled === true; let isNotice = r._notice === true; let tempBadgesHtml = tempBadgesFor(r, ym);
    // Branch coloring (same palette as Fleet & Service cards)
    let branchRawL = (r.branch || '').trim(); // branch du contrat, pas du véhicule
    let branchLowerL = branchRawL.toLowerCase();
    let branchBadgeL = '';
    if(branchRawL && !isCancelled){
      if(branchLowerL.includes('canceled') || branchLowerL.includes('cancelled')){
        branchBadgeL = `<span style="background:#dc2626;color:#fff;border:1px solid #b91c1c;border-radius:20px;padding:1px 7px;font-size:.6rem;font-weight:700;margin-left:4px">🚫 ${branchRawL}</span>`;
      } else if(branchLowerL.includes('barka')){
        branchBadgeL = `<span style="background:#2563eb;color:#fff;border:1px solid #1d4ed8;border-radius:20px;padding:1px 7px;font-size:.6rem;font-weight:700;margin-left:4px">🏢 ${branchRawL}</span>`;
      } else if(branchLowerL.includes('moebela') || branchLowerL.includes('moabela') || branchLowerL.includes('mabela')){
        branchBadgeL = `<span style="background:#ea580c;color:#fff;border:1px solid #c2410c;border-radius:20px;padding:1px 7px;font-size:.6rem;font-weight:700;margin-left:4px">🏢 ${branchRawL}</span>`;
      } else {
        branchBadgeL = `<span style="background:#0d9488;color:#fff;border:1px solid #0f766e;border-radius:20px;padding:1px 7px;font-size:.6rem;font-weight:700;margin-left:4px">🏢 ${branchRawL}</span>`;
      }
    }
    let bgStyle = (isCancelled||isNotice) ? 'background:rgba(220,38,38,.06);outline:2px solid rgba(220,38,38,.35);outline-offset:-2px;animation:cancelledBlink 1.5s ease-in-out infinite;' : (isExternal ? 'background:rgba(245,158,11,.15);outline:1px solid rgba(245,158,11,.35);outline-offset:-1px;' : ''); let vName = v.name || r._name || getVehicleNameByPlate(v.plate||r._plate) || '—'; let vPlateRaw = v.plate || r._plate || '—'; let {plateFormatted:vPlate} = formatVehicleDisplay(vName, vPlateRaw); let hasNote = r.notes && r.notes.trim() !== ''; let plateCellHtml = hasNote ? `<span style="font-weight:700;cursor:pointer;text-decoration:underline dotted;color:#60a5fa" data-dr-action="show-note-popup" data-dr-id="${r.id}" title="📝 View note">` + vPlate + `</span>` : vPlate; let diff = r.kmIn && r.kmOut ? Math.round(r.kmIn - r.kmOut) : '—'; let cleanBeforeIcon = r.cleanBefore==='dirty' ? '<span style="color:#f87171;font-weight:700">❌</span>' : (r.cleanBefore==='clean' ? '<span style="color:#4ade80;font-weight:700">✅</span>' : '<span style="color:var(--muted)">—</span>'); let cleanAfterIcon  = r.cleanAfter ==='dirty' ? '<span style="color:#f87171;font-weight:700">❌</span>' : (r.cleanAfter ==='clean' ? '<span style="color:#4ade80;font-weight:700">✅</span>' : '<span style="color:var(--muted)">—</span>'); let fuelOutVal = (r.fuelOut !== undefined && r.fuelOut !== null && r.fuelOut !== '') ? r.fuelOut : '—'; let fuelInVal  = (r.fuelIn  !== undefined && r.fuelIn  !== null && r.fuelIn  !== '') ? r.fuelIn  : '—'; let balCell = (()=>{ let b; if(r._balManual){ b = (r.bal !== undefined && r.bal !== null) ? Number(r.bal) : 0; } else { b = calcRentalBAL(r); if(b===null) b=(r.bal!==undefined&&r.bal!==null)?Number(r.bal):Number((r.price||0)-(r.paid||0)); } let col=Number(b)>0?'#ef4444':(Number(b)<0?'#22c55e':'var(--green)'); return `<span style="color:${col}">${fmtNum(b)}</span>`; })(); let cKey = String(r.contract||r.id); let hasVid = window._contractVideos && window._contractVideos[cKey]; let vidBtnStyle = hasVid ? 'background:rgba(37,99,235,.3);border:1px solid #2563eb;color:#93c5fd' : 'background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:var(--muted)'; let condBCol2 = r.cleanBefore==='dirty'?'#f87171':'#4ade80'; let condACol2 = r.cleanAfter==='dirty'?'#f87171':'#4ade80'; let condBefore2=r.cleanBefore==='dirty'?'❌':(r.cleanBefore==='clean'?'✅':'—'); let condAfter2=r.cleanAfter==='dirty'?'❌':(r.cleanAfter==='clean'?'✅':'—'); let condCell2=`<span style="color:${condBCol2};font-weight:700">${condBefore2}</span><span style="color:var(--muted);margin:0 2px">→</span><span style="color:${condACol2};font-weight:700">${condAfter2}</span>`; let vehicleCell2=makeVehiclePill(vName, plateCellHtml, null); return `<tr id="rental-row-${r.id}" style="${bgStyle}">${(isCancelled||isNotice) ? '<style>@keyframes cancelledBlink{0%,100%{outline-color:rgba(220,38,38,.35)}50%{outline-color:rgba(220,38,38,.8)}}</style>' : ''}<td style="white-space:nowrap">${vehicleCell2}${branchBadgeL}</td><td><span style="display:flex;align-items:center;gap:5px"><span data-dr-action="payment-history" data-dr-contract="${escapeHtml(r.contract||'')}" data-dr-branch="${escapeHtml(r.branch||'')}" style="cursor:pointer;color:#2563EB;font-weight:700;text-decoration:underline;font-size:.88rem;text-underline-offset:2px" title="${translate('rental.paymentHistory')}">${r.contract||'—'}</span>${isCancelled ? '<span style="background:#dc2626;color:#fff;font-size:.6rem;font-weight:900;border-radius:4px;padding:1px 5px;letter-spacing:.5px;animation:cancelledBlink 1.5s ease-in-out infinite">CANCELLED</span>' : ''}${isNotice ? '<span style="background:#dc2626;color:#fff;font-size:.6rem;font-weight:900;border-radius:4px;padding:1px 5px;letter-spacing:.5px;animation:cancelledBlink 1.5s ease-in-out infinite">تعميم</span>' : ''}${tempBadgesHtml}</span>${tempInlineTextFor(r, ym)}</td><td>${displayPrice(r)}</td><td>${fmtDate(r.dateOut)}</td><td>${r.dateIn ? fmtDate(r.dateIn) : translate('rental.out')}</td><td>${r.kmOut ? Math.round(r.kmOut) : '—'}</td><td>${r.kmIn ? Math.round(r.kmIn) : '—'}</td><td>${diff}</td><td style="color:var(--green)">${fmtNum(r.paid)}</td><td style="font-weight:700;cursor:pointer;text-decoration:underline dotted" data-dr-action="show-bal-detail" data-dr-id="${r.id}" title="Click to view detail">${balCell}</td><td style="text-align:center;white-space:nowrap">${condCell2}</td><td>${fuelOutVal}</td><td>${fuelInVal}</td><td>${escapeHtml(r.tel)||'—'}</td><td><div style="display:inline-flex;gap:5px;align-items:center"><button class="btn btn-ghost" style="padding:3px 10px;font-size:.8rem" data-dr-action="edit-rental" data-dr-id="${r.id}">✏️ Edit</button><button class="btn btn-ghost btn-delete" style="padding:3px 10px;font-size:.8rem" data-dr-action="delete-rental" data-dr-id="${r.id}">🗑️</button><button class="btn btn-ghost" style="padding:3px 8px;font-size:.78rem;${vidBtnStyle};border-radius:6px" data-dr-action="open-contract-video" data-dr-ckey="${escapeHtml(cKey)}" title="${hasVid?'▶ Play video':'📁 Add video'}">🎬</button></div></td></tr>`; };
  const tableHead = `<table class="rentals-table"><thead><tr><th style="min-width:74px">${translate('col.vehicle')}</th><th style="min-width:48px">${translate('col.contract')}</th><th style="min-width:42px">${translate('col.price')}</th><th style="min-width:76px">${translate('col.dateOut')}</th><th style="min-width:76px">${translate('col.dateIn')}</th><th style="min-width:48px">${translate('col.kmOut')}</th><th style="min-width:48px">${translate('col.kmIn')}</th><th style="min-width:38px">${translate('col.diff')}</th><th style="min-width:42px">${translate('col.paid')}</th><th style="min-width:42px">${translate('col.bal')}</th><th style="min-width:44px">${translate('col.cond')}</th><th style="min-width:42px">${translate('col.fuelOut')}</th><th style="min-width:42px">${translate('col.fuelIn')}</th><th style="min-width:58px">${translate('col.tel')}</th><th style="min-width:64px">${translate('col.actions')}</th></tr></thead>`;
  let oldByOriginMonth = {};
  olds.forEach(r => { let originYm = r.dateOut.slice(0,7); if(!oldByOriginMonth[originYm]) oldByOriginMonth[originYm] = []; oldByOriginMonth[originYm].push(r); });
  let oldMonthsSorted = Object.keys(oldByOriginMonth).sort().reverse();
  let oldBlocksHtml = oldMonthsSorted.map(originYm => { let [oyr, omo] = originYm.split('-').map(Number); let originLabel = monthNames[omo-1] + ' ' + oyr; let rentsOld = oldByOriginMonth[originYm].sort((a,b) => Number(b.contract||0)-Number(a.contract||0)); let totalOld = rentsOld.reduce((s,r) => s + Number(r.paid||0), 0); let lignesOld = rentsOld.map(buildLigne).join(''); return `<div style="margin-bottom:14px;border:2px solid #F59E0B;border-radius:10px;overflow:hidden;background:var(--card)"><div style="display:flex;align-items:center;gap:12px;padding:10px 16px;background:linear-gradient(135deg,#d97706,#f59e0b);cursor:pointer" data-dr-action="toggle-next-sibling" data-dr-chev-class="old-chev"><span style="font-size:1rem">📦</span><span style="font-family:'IBM Plex Mono',monospace;font-size:.9rem;font-weight:700;color:#fff">${translate('daily.opened')} ${originLabel}</span><span style="background:rgba(255,255,255,.25);border-radius:20px;padding:2px 10px;font-size:.72rem;color:#fff;font-weight:700">${rentsOld.length} ${i18nPlural('daily.rental','daily.rentals',rentsOld.length)}</span><span style="margin-left:auto;color:rgba(255,255,255,.85);font-size:.82rem;font-family:'IBM Plex Mono',monospace">${fmtNum(totalOld)} ${translate('daily.omrCollected')}</span><span class="old-chev" style="color:#fff;font-size:.85rem">▼</span></div><div style="overflow-x:auto">${tableHead}<tbody>${lignesOld}</tbody></table></div></div>`; }).join('');

  // Blocs "Settled Late" — contracts soldés ce month mais ouverts/fermés dans un month antérieur
  let settledByOriginMonth = {};
  settledLate.forEach(r => { let originYm = r.dateOut.slice(0,7); if(!settledByOriginMonth[originYm]) settledByOriginMonth[originYm] = []; settledByOriginMonth[originYm].push(r); });
  let settledMonthsSorted = Object.keys(settledByOriginMonth).sort().reverse();
  let settledBlocksHtml = settledMonthsSorted.map(originYm => {
    let [oyr, omo] = originYm.split('-').map(Number);
    let originLabel = monthNames[omo-1] + ' ' + oyr;
    let rentsS = settledByOriginMonth[originYm].sort((a,b) => Number(b.contract||0)-Number(a.contract||0));
    let totalS = rentsS.reduce((s,r) => s + Number(r.paid||0), 0);
    let lignesS = rentsS.map(buildLigne).join('');
    return `<div style="margin-bottom:14px;border:2px solid #7c3aed;border-radius:10px;overflow:hidden;background:var(--card)">
      <div style="display:flex;align-items:center;gap:12px;padding:10px 16px;background:linear-gradient(135deg,#6d28d9,#7c3aed);cursor:pointer"
        data-dr-action="toggle-next-sibling" data-dr-chev-class="sl-chev">
        <span style="font-size:1rem">💰</span>
        <span style="font-family:'IBM Plex Mono',monospace;font-size:.9rem;font-weight:700;color:#fff">${translate('daily.settled')} ${monthNames[mo-1]} ${yr}</span>
        <span style="background:rgba(255,255,255,.2);border-radius:20px;padding:2px 8px;font-size:.7rem;color:rgba(255,255,255,.8);font-weight:600">Opened ${originLabel}</span>
        <span style="background:rgba(255,255,255,.25);border-radius:20px;padding:2px 10px;font-size:.72rem;color:#fff;font-weight:700">${rentsS.length} ${i18nPlural('daily.rental','daily.rentals',rentsS.length)}</span>
        <span style="margin-left:auto;color:rgba(255,255,255,.85);font-size:.82rem;font-family:'IBM Plex Mono',monospace">${fmtNum(totalS)} ${translate('daily.omrCollected')}</span>
        <span class="sl-chev" style="color:#fff;font-size:.85rem">▼</span>
      </div>
      <div style="overflow-x:auto">${tableHead}<tbody>${lignesS}</tbody></table></div>
    </div>`;
  }).join('');
  let parJour = {};
  normaux.forEach(r => { let day = r.dateOut.slice(0,10); if(!parJour[day]) parJour[day]=[]; parJour[day].push(r); });
  Object.keys(parJour).forEach(day => parJour[day].sort((a,b) => Number(b.contract||0)-Number(a.contract||0)));
  let jours = Object.keys(parJour).sort().reverse(); // DESC: Most recent first ✅
  let container = document.getElementById('daily-container');
  if(!filtrees.length){ container.innerHTML='<div class="empty">'+translate('daily.noClosedRentals')+'</div>'; renderOpenContracts(); return; } // FIX: sans ce appel, compteurs/pilules/cartes Open restaient figés (0) quand la liste groupée était vide
  let monthName = monthNames[mo-1] + ' ' + yr;
  // Collect payments for this month from paymentLog ONLY (independent from Payments menu)
  let allMonthPayments = [];
  DB.rentals.forEach(r => {
    let v2 = r.vehicleId ? (DB.vehicles.find(x=>x.id===r.vehicleId)||{}) : {};
    (r.paymentLog || []).forEach(p => {
      if((p.date||'').startsWith(ym)){
        allMonthPayments.push({
          amount: Number(p.amount||0),
          date: p.date,
          contract: r.contract,
          plate: v2.plate || r._plate || '—',
          name: v2.name || r._name || '—'
        });
      }
    });
  });
  allMonthPayments.sort((a,b) => (a.date||'').localeCompare(b.date||''));
  let totalMonth = allMonthPayments.reduce((s,p) => s + p.amount, 0);
  let totalRentals = filtrees.length;
  let daysHtml = jours.map(day => { let rentals = parJour[day]; let lignes = rentals.map(buildLigne).join(''); let totalJour = rentals.reduce((s,r) => s + Number(r.paid||0), 0); let d = new Date(day); let jourFmt = d.getDate().toString().padStart(2,'0')+'/'+(d.getMonth()+1).toString().padStart(2,'0')+'/'+d.getFullYear(); return `<div class="day-block" id="day-${day}"><div class="day-header" data-dr-action="toggle-day" data-dr-target="day-${day}"><span class="day-label">📅 ${jourFmt}</span><span class="day-count">${rentals.length} ${i18nPlural('daily.rental','daily.rentals',rentals.length)} · ${fmtNum(totalJour)} ${translate('daily.omrCollected')}</span><span class="day-chevron">▼</span></div><div class="day-table">${tableHead}<tbody>${lignes}</tbody></table></div></div>`; }).join('');
  // Store payments for click detail
  window._monthPaymentsCache = allMonthPayments;
  window._monthPaymentLabel = monthName;
  container.innerHTML = `<div class="month-block" id="month-block-${ym}"><div class="month-header" data-dr-action="toggle-month-block" data-dr-target="month-block-${ym}"><div class="month-header-title">📆 ${monthName}<span style="background:rgba(255,255,255,.2);border-radius:20px;padding:2px 10px;font-size:.75rem">${totalRentals} ${i18nPlural('daily.rental','daily.rentals',totalRentals)}</span></div><div style="display:flex;align-items:center;gap:14px"><span class="month-header-stats" data-dr-action="show-month-payment-detail" title="Click to see payment detail" style="cursor:pointer;text-decoration:underline dotted;text-underline-offset:3px">💰 ${fmtNum(totalMonth)} ${translate('daily.omrCollected')}</span><span class="month-header-chevron">▼</span></div></div><div class="month-days">${settledBlocksHtml}${oldBlocksHtml}${daysHtml}</div></div>`;
  if(editMode) mettreAJourInterfaceEdition();
  renderOpenContracts();
}


// ── renderOpenContracts (orig. line 5085) ──
// ── ocSetFilter : bascule le filtre pilule des cartes OC et re-render ──
function ocSetFilter(filter){
  window._ocFilter = (window._ocFilter === filter) ? 'all' : filter; // toggle: 2e clic = désactive
  renderDaily(); // ← manquait : sans ça la liste groupée en dessous ne bouge jamais
}


function renderOpenContracts(searchQuery){
  let tbody = document.getElementById('open-contracts-body');
  if(!tbody) return;
  let s = (searchQuery||'').toLowerCase().trim();
  // ── PERF (2026-07) : fusion de l'ancien double passage sur DB.rentals
  // (1) un forEach qui recalculait le BAL de TOUS les contrats, même les
  // milliers déjà fermés/soldés depuis des mois, puis (2) un .filter()
  // séparé qui reparcourait tout DB.rentals une 2e fois pour ne garder
  // que les "opens". Comportement strictement identique, mais un seul
  // parcours du tableau au lieu de deux → moins de travail à chaque
  // ouverture de Daily Rentals sur une grosse base de contrats. ──
  let opens = [];
  DB.rentals.forEach(function(r){
    if(!r.dateIn || r.dateIn === ''){
      // Rental ouvert : BAL = prix × jours seulement (pas d'extra hours/petrol/clean)
      if(!r._balManual){
        var openBal = calcOpenContractBAL(r);
        if(openBal !== null) r.bal = openBal;
      }
      opens.push(r); // voiture encore dehors → toujours Open
    } else {
      var fresh = calcRentalBAL(r);
      if(fresh !== null && !r._balManual){ r.bal = fresh; }
      if(!isClosedAndSettled(r)) opens.push(r); // fermé mais BAL > 0 → reste dans Open jusqu'au payment
    }
  });
  let picker = document.getElementById('month-picker');
  let currentYm = (picker && picker.value) ? picker.value : (window._currentYm || new Date().toISOString().slice(0,7));
  let currentOpens = opens.filter(r => (r.dateOut||'').slice(0,7) === currentYm);
  let ancientOpens = opens.filter(r => (r.dateOut||'').slice(0,7) < currentYm || !(r.dateOut||''));
  currentOpens.sort((a,b) => (b.dateOut||'').localeCompare(a.dateOut||''));
  ancientOpens.sort((a,b) => (b.dateOut||'').localeCompare(a.dateOut||''));

  // ── OC status filter pills (All / Unpaid / In rental / Partial / Late) ──
  // Ne s'applique qu'aux deux sections cartes ci-dessous, jamais aux autres tableaux.
  // (ocStatusMatch/ocContractBal/ocDaysSince/OC_LATE_DAYS sont maintenant au niveau module, cf. plus haut — partagés avec renderDaily)
  let ocActiveFilter = window._ocFilter || 'all';
  let ocAllContracts = currentOpens.concat(ancientOpens);
  let ocCounts = { all: ocAllContracts.length, unpaid: 0, inrental: 0, partial: 0, late: 0, closedbal: 0, temp: 0 };
  ocAllContracts.forEach(r => {
    if(ocStatusMatch(r,'unpaid')) ocCounts.unpaid++;
    if(ocStatusMatch(r,'inrental')) ocCounts.inrental++;
    if(ocStatusMatch(r,'partial')) ocCounts.partial++;
    if(ocStatusMatch(r,'late')) ocCounts.late++;
    if(ocStatusMatch(r,'closedbal')) ocCounts.closedbal++;
    if(ocStatusMatch(r,'temp')) ocCounts.temp++;
  });
  Object.keys(ocCounts).forEach(k => { let el = document.getElementById('oc-filter-count-'+k); if(el) el.textContent = ocCounts[k]; });
  let filterBar = document.getElementById('oc-filter-bar');
  if(filterBar){
    filterBar.querySelectorAll('.mod-pill').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-filter') === ocActiveFilter);
    });
  }
  if(ocActiveFilter !== 'all'){
    currentOpens = currentOpens.filter(r => ocStatusMatch(r, ocActiveFilter));
    ancientOpens = ancientOpens.filter(r => ocStatusMatch(r, ocActiveFilter));
  }
  let badge = document.getElementById('oc-count-badge'); if(badge) badge.textContent = currentOpens.length + ' ' + i18nPlural('daily.rental','daily.rentals',currentOpens.length);
  let ancientBanner = document.getElementById('ancient-contracts-banner'); let ancientBody = document.getElementById('ancient-contracts-body'); let ancientBadge = document.getElementById('ancient-count-badge'); let ancientTotal = document.getElementById('ancient-total-display');
  if(ancientBanner) ancientBanner.style.display = ancientOpens.length ? 'block' : 'none';
  if(ancientBadge) ancientBadge.textContent = ancientOpens.length;
  if(ancientTotal) ancientTotal.textContent = ancientOpens.length + ' ' + translate('section.oldOpenContracts');
  if(ancientBody){
    // ── Pagination : les vieux contrats ouverts (impayés non soldés) s'accumulent
    // sans limite dans le temps — contrairement à currentOpens qui est déjà borné
    // au mois sélectionné. Le total BAL reste calculé sur TOUTE la liste
    // (ancientOpens), seul l'affichage des lignes est paginé. ──
    if(typeof window._ancientOcPageState === 'undefined') window._ancientOcPageState = { page: 0, pageSize: 50 };
    let _ancPg = renderPaginationBar(ancientBody, window._ancientOcPageState, ancientOpens.length, function(){ renderOpenContracts(searchQuery); });
    let ancientOpensPage = ancientOpens.slice(_ancPg.pageStart, _ancPg.pageStart + window._ancientOcPageState.pageSize);
    ancientBody.innerHTML = ancientOpens.length ? ancientOpensPage.map(r => buildOcRow(r, currentYm)).join('') : `<tr><td colspan="18" style="text-align:center;padding:20px;">${translate('section.noOldOpenContracts')}</td></tr>`;
    let ancientTotalBal = ancientOpens.reduce((s,r) => { let b; if(r._balManual){ b=(r.bal!==undefined&&r.bal!==null)?Number(r.bal):0; } else { b=(!r.dateIn||r.dateIn==='') ? calcOpenContractBAL(r) : calcRentalBAL(r); if(b===null) b=(r.bal!==undefined&&r.bal!==null)?Number(r.bal):Number((r.price||0)-(r.paid||0)); } return s + Math.max(0, Number(b)); }, 0);
    let ancientTotalEl = document.getElementById('ancient-total-display');
    if(ancientTotalEl && ancientOpens.length){ let balCol = ancientTotalBal > 0 ? '#ef4444' : (ancientTotalBal < 0 ? '#22c55e' : '#22c55e'); ancientTotalEl.innerHTML = `<span>${ancientOpens.length} ${translate('section.oldOpenContracts')}</span> &nbsp;·&nbsp; <span style="font-weight:700;color:${balCol};font-family:'IBM Plex Mono',monospace">BAL: ${fmtNum(ancientTotalBal)} OMR</span>`; }
  }
  let totalDisplay = document.getElementById('oc-total-display');
  if(totalDisplay){ let totalPaid = currentOpens.reduce((s,r) => s + Number(r.paid||0), 0); let totalBal = currentOpens.reduce((s,r) => { let b; if(r._balManual){ b=(r.bal!==undefined&&r.bal!==null)?Number(r.bal):0; } else { b=(!r.dateIn||r.dateIn==='') ? calcOpenContractBAL(r) : calcRentalBAL(r); if(b===null) b=(r.bal!==undefined&&r.bal!==null)?Number(r.bal):Number((r.price||0)-(r.paid||0)); } return s + Math.max(0, Number(b)); }, 0); let balCol = totalBal > 0 ? '#ef4444' : '#22c55e'; totalDisplay.innerHTML = `<span>${translate('section.totalPaid')}: <strong style="font-family:'IBM Plex Mono',monospace">${fmtNum(totalPaid)} OMR</strong></span> &nbsp;·&nbsp; <span style="font-weight:700;color:${balCol};font-family:'IBM Plex Mono',monospace">BAL: ${fmtNum(totalBal)} OMR</span>`; }
  if(!currentOpens.length){ tbody.innerHTML = '<tr><td colspan="18" style="text-align:center;padding:20px;">✅ '+translate('daily.noOpenContracts')+'</td></tr>'; return; }
  tbody.innerHTML = currentOpens.map(r => buildOcRow(r, currentYm)).join('');
}


// ── ocClientColor : couleur d'avatar stable par nom de client (palette fixe, hash simple) ──
function ocClientColor(name){
  let palette = ['#dc2626','#ea580c','#0d9488','#2563eb','#7c3aed','#db2777','#16a34a','#0891b2'];
  let str = String(name || '?');
  let hash = 0;
  for(let i=0;i<str.length;i++){ hash = (hash * 31 + str.charCodeAt(i)) >>> 0; }
  return palette[hash % palette.length];
}

// ── buildOcRow (orig. line 5124) ──
function buildOcRow(r, currentYm){
    let v = r.vehicleId ? (DB.vehicles.find(x => x.id === r.vehicleId) || {}) : {};
    let vName = v.name || r._name || getVehicleNameByPlate(v.plate||r._plate) || '—';
    let vPlateRaw = v.plate || r._plate || '—';
    let {plateFormatted: vPlate} = formatVehicleDisplay(vName, vPlateRaw);

    // Check if vehicle plate exists in database (MA BASE vs EXTERNE)
    let plateFromRental = r._plate || r.plate;
    let vehicleByPlate = DB.vehicles.find(veh => veh["Plate No."] === plateFromRental || veh.plate === plateFromRental);
    let isExternal = !vehicleByPlate;
    let isCancelledOc = r._cancelled === true;
    let isNoticeOc = r._notice === true;
    let tempBadgesHtmlOc = tempBadgesFor(r, currentYm);

    let cardStateClass = isCancelledOc ? 'cancelled' : (isNoticeOc ? 'notice' : (isExternal ? 'external' : ''));
    let cancelledTag = isCancelledOc
      ? '<span style="background:#dc2626;color:#fff;font-size:.6rem;font-weight:900;border-radius:4px;padding:1px 5px;letter-spacing:.5px;margin-left:4px">CANCELLED</span>'
      : '';
    let noticeTag = isNoticeOc
      ? '<span style="background:#dc2626;color:#fff;font-size:.6rem;font-weight:900;border-radius:4px;padding:1px 5px;letter-spacing:.5px;margin-left:4px">تعميم</span>'
      : '';

    // Branch coloring (same palette as Fleet)
    let branchRawOc = (r.branch || '').trim(); // branch du contrat, pas du véhicule
    let branchLowerOc = branchRawOc.toLowerCase();
    let branchBadgeOc = '';
    if(branchRawOc && !isExternal){
      if(branchLowerOc.includes('canceled') || branchLowerOc.includes('cancelled')){
        cardStateClass = 'cancelled';
        branchBadgeOc = `<span class="oc-branch-badge" style="background:#dc2626;border:1px solid #b91c1c">🚫 ${branchRawOc}</span>`;
      } else if(branchLowerOc.includes('barka')){
        branchBadgeOc = `<span class="oc-branch-badge" style="background:#2563eb;border:1px solid #1d4ed8">🏢 ${branchRawOc}</span>`;
      } else if(branchLowerOc.includes('moebela') || branchLowerOc.includes('moabela') || branchLowerOc.includes('mabela')){
        branchBadgeOc = `<span class="oc-branch-badge" style="background:#ea580c;border:1px solid #c2410c">🏢 ${branchRawOc}</span>`;
      } else {
        branchBadgeOc = `<span class="oc-branch-badge" style="background:#0d9488;border:1px solid #0f766e">🏢 ${branchRawOc}</span>`;
      }
    }

    let hasNoteOc = r.notes && r.notes.trim() !== '';
    let plateCellOc = (hasNoteOc
      ? `<span style="font-weight:700;cursor:pointer;color:#60a5fa;text-decoration:underline dotted" data-dr-action="show-note-popup" data-dr-id="${r.id}" title="📝 Click to view note">${vPlate}</span>`
      : vPlate);
    let gpsIconOc = gpsLocateIconHtml(vPlate);

    // Type de véhicule : couleur directement sur le nom (pas de badge en plus)
    let isOc4x4 = r.carType === '4x4';
    let vTypeColorOc = isOc4x4 ? '#a78bfa' : '#60a5fa';

    // Nom du client lié au contrat.
    // Priorité au nom figé sur le contrat (_clientName, snapshot pris au save) —
    // reste correct même si la fiche client change ou si _clientId se corrompt.
    // Fallback sur le lookup live pour les vieux contrats sauvés avant ce snapshot.
    let clientOc = r._clientId ? (DB.clients||[]).find(c => c.id === r._clientId) : null;
    let rawClientNameOc = r._clientName || (clientOc ? (clientOc.firstname || '—') : '—');
    let clientNameOc = escapeHtml(rawClientNameOc);
    let clientRowHtml = clientOc
      ? `<span class="oc-client-name" data-dr-action="goto-client-profile" data-dr-id="${clientOc.id}" title="View client profile">${clientNameOc}</span>`
      : `<span style="color:var(--muted)">${clientNameOc}</span>`;

    // Avatar rond du client (initiale + couleur stable par nom) et boutons appel/message
    let clientInitialOc = escapeHtml((rawClientNameOc && rawClientNameOc !== '—') ? rawClientNameOc.trim().charAt(0).toUpperCase() : '?');
    let clientColorOc = ocClientColor(rawClientNameOc);
    let telDigitsOc = String(r.tel||'').replace(/[^0-9]/g,'');
    let clientCommsHtml = telDigitsOc ? `
          <a class="oc-round-btn" href="tel:${escapeHtml(r.tel)}" title="Call">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.7a2 2 0 0 1-.4 2.1L8.1 9.7a16 16 0 0 0 6.2 6.2l1.2-1.2a2 2 0 0 1 2.1-.4c.9.3 1.8.5 2.7.6a2 2 0 0 1 1.7 2z"/></svg>
          </a>
          <a class="oc-round-btn" href="https://wa.me/${telDigitsOc}" target="_blank" rel="noopener" title="Message">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
          </a>` : '';

    // PAID = montant payé dans le month selected uniquement
    let paidThisMonth = DB.payments
      .filter(p => paymentsForContract(r.contract, r.branch, r.vehicleId).includes(p) && (p.dateOut||'').slice(0,7) === currentYm)
      .reduce((s,p) => s + Number(p.price||0), 0);
    // Si aucun payment dans DB.payments pour ce month, essayer paymentLog
    if(paidThisMonth === 0 && (r.paymentLog||[]).length){
      paidThisMonth = (r.paymentLog||[])
        .filter(p => (p.date||'').slice(0,7) === currentYm)
        .reduce((s,p) => s + Number(p.amount||0), 0);
    }
    // Total payé tous month confondus (pour tooltip)
    let paidTotal = Number(r.paid || 0);
    let isOpen = !r.dateIn || r.dateIn === '';
    let balVal;
    if(r._balManual){ balVal = (r.bal !== undefined && r.bal !== null) ? Number(r.bal) : 0; }
    else { balVal = isOpen ? calcOpenContractBAL(r) : calcRentalBAL(r); if(balVal === null) balVal = (r.bal !== undefined && r.bal !== null) ? Number(r.bal) : Number((r.price||0)-(r.paid||0)); }
    let balNum = Number(balVal); let balDisplay = fmtNum(balNum);
    if(!r._balManual) r.bal = balNum;

    // ── Status visuel unifié (barre du haut + pastille + bandeau balance) ──
    // Priorité : annulé/تعميم > fermé avec solde impayé > paliers de solde
    let ocStatus;
    if(cardStateClass === 'cancelled' || cardStateClass === 'notice'){
      ocStatus = { cls:'st-red', icon: cardStateClass==='cancelled'?'🚫':'📢', label: cardStateClass==='cancelled'?'CANCELLED':'تعميم' };
    } else if(!isOpen && balNum > 0){
      ocStatus = { cls:'st-purple', icon:'💳', label:'RETURNED · DUE' };
    } else if(balNum > 50){
      ocStatus = { cls:'st-red', icon:'💰', label:'BALANCE DUE' };
    } else if(balNum > 0){
      ocStatus = { cls:'st-amber', icon:'◷', label:'PARTIAL DUE' };
    } else {
      ocStatus = { cls:'st-green', icon:'✓', label: isOpen ? 'ON TRACK' : 'SETTLED' };
    }

    let paidCellHtml = paidThisMonth > 0
      ? `<span title="Paid this month: ${fmtNum(paidThisMonth)} OMR · Total: ${fmtNum(paidTotal)} OMR" style="cursor:help;color:#22c55e;font-weight:800;font-size:1.05em">${fmtNum(paidThisMonth)}</span>`
      : `<span title="Total paid: ${fmtNum(paidTotal)} OMR" style="color:var(--muted);cursor:help">0</span>`;

    let dateInHtml = r.dateIn
      ? `<span id="oc-datein-${r.id}">${fmtDate(r.dateIn)}</span>`
      : `<span id="oc-datein-${r.id}" class="oc-datein-flag">${translate('rental.out')}</span>`;

    let cKey = r.contract || r.id;
    let hasVid = window._contractVideos && window._contractVideos[cKey];

    // Avatar rond avec icône voiture, teinté selon le type de véhicule
    let avatarBgOc = isOc4x4 ? 'rgba(167,139,250,.18)' : 'rgba(96,165,250,.18)';
    let avatarSvgOc = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${vTypeColorOc}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11"/><rect x="3" y="11" width="18" height="6" rx="2"/><circle cx="7.5" cy="17.5" r="1.4" fill="${vTypeColorOc}" stroke="none"/><circle cx="16.5" cy="17.5" r="1.4" fill="${vTypeColorOc}" stroke="none"/></svg>`;

    let vplateBadgeClass = isOc4x4 ? 'v-4x4' : 'v-sedan';
    let ocPhotoUrl = (typeof findBookingVehiclePhoto === 'function') ? findBookingVehiclePhoto(vPlateRaw) : '';
    let avatarInnerOc = `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">${avatarSvgOc}</div>${ocPhotoUrl ? `<img src="${ocPhotoUrl}" alt="${vName}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'">` : ''}`;

    return `<div id="oc-row-${r.id}" class="oc-card ${cardStateClass} ${ocStatus.cls}">
      <div class="oc-card-top">
        <div class="oc-avatar" style="background:${avatarBgOc};position:relative;overflow:hidden">${avatarInnerOc}</div>
        <div class="oc-vehicle-info" title="${vName} ${vPlateRaw}">
          <span class="oc-vplate-badge ${vplateBadgeClass}">
            <span class="oc-vname-part">${vName}</span>
            <span class="oc-plate-num">${plateCellOc}</span>
            ${gpsIconOc}
          </span>
          <div class="oc-badges-line">${branchBadgeOc}${cancelledTag}${noticeTag}${tempBadgesHtmlOc}<span class="oc-contract-link" data-dr-action="payment-history" data-dr-contract="${escapeHtml(r.contract||'')}" data-dr-branch="${escapeHtml(r.branch||'')}" title="${translate('rental.paymentHistory')}">#${r.contract||'—'}</span></div>
        </div>
      </div>

      <div class="oc-client-row">
        <div class="oc-client-avatar" style="background:${clientColorOc}">${clientInitialOc}</div>
        <div class="oc-client-meta">
          <span class="oc-client-name-line" title="${clientOc ? clientNameOc : ''}">${clientRowHtml}</span>
          <span class="oc-client-tel-line">${escapeHtml(r.tel)||'—'}</span>
        </div>
        <div class="oc-client-comms">${clientCommsHtml}</div>
      </div>

      <div class="oc-info-row">
        <span class="oc-info-item">
          <span style="font-size:.85rem;line-height:1">⏱️</span>
          ${displayPrice(r)}
        </span>
      </div>
      <div class="oc-dates-row">
        <span style="font-size:.85rem;line-height:1;margin-top:1px">📅</span>
        <span class="oc-dates-text">${fmtDate(r.dateOut)}${r.dateIn ? ' — ' + fmtDate(r.dateIn) : ''}</span>
      </div>

      ${tempPanelFor(r, currentYm)}
      ${carryForwardPanelFor(r)}

      <div class="oc-block">
        <div class="oc-block-label">${translate('col.paid')}</div>
        <div class="oc-block-val">${paidCellHtml}</div>
      </div>

      <div class="oc-card-foot">
        <div class="oc-balance-banner ${ocStatus.cls}" data-dr-action="show-bal-detail" data-dr-id="${r.id}" title="View balance detail">
          <span class="oc-bal-label">${translate('bal.balance')}</span>
          <span class="oc-bal-value">${balDisplay}<small>OMR</small></span>
        </div>
        <div class="oc-actions-row oc-actions-row-4">
          <button class="oc-action-btn" data-dr-action="edit-rental" data-dr-id="${r.id}" title="Edit">
            <span style="font-size:16px;line-height:1">✏️</span>
            <span>Edit</span>
          </button>
          <button class="oc-action-btn oc-action-danger" data-dr-action="delete-rental-undo" data-dr-id="${r.id}" title="Delete">
            <span style="font-size:16px;line-height:1">🗑️</span>
            <span>Delete</span>
          </button>
          <button class="oc-action-btn ${hasVid?'oc-action-active':''}" data-dr-action="open-contract-video" data-dr-ckey="${escapeHtml(cKey)}" title="${hasVid?'▶ Play video':'📁 Add video'}">
            <span style="font-size:16px;line-height:1">🖼️</span>
            <span>Media</span>
          </button>
          <button class="oc-action-btn oc-action-pay" data-dr-action="quick-add-payment" data-dr-contract="${escapeHtml(r.contract||'')}" data-dr-plate="${escapeHtml(vPlateRaw||'')}" title="Add Payment">
            <span style="font-size:15px;line-height:1">💰</span>
            <span>Pay</span>
          </button>
        </div>
      </div>
    </div>`;
}


// Fuel level → OMR equivalent. Negative values are HALF-STEPS used for intermediate fuel
// levels (e.g. -0.75 sits between 0.5 and 0.75), NOT "below empty". Ordered from lowest to
// highest fuel level: 0 < -0.25 < 0.25 < -0.5 < 0.5 < -0.75 < 0.75 < -1 < 1
// ── fuelToOMR (orig. line 5180) ──
function fuelToOMR(val){
  let v = Number(val);
  if(isNaN(v)) return 0;
  let map = { '1':8, '-1':7, '0.75':6, '-0.75':5, '0.5':4, '-0.5':3, '0.25':2, '-0.25':1, '0':0 };
  let key = String(v);
  if(map.hasOwnProperty(key)) return map[key];
  // Fallback for any unexpected value: clamp/interpolate on the same 0..8 scale
  if(v >= 1) return 8;
  if(v <= -1) return 7;
  if(v >= 0) return v * 8;
  return 0;
}

// ── detectContractType (orig. line 5192) ──
function detectContractType(r){ let durationType = r.contractType || ''; let is4x4 = r.carType === '4x4'; let kmPD = Number(r.kmPerDay || 0); if(!r.carType) is4x4 = (kmPD === 150); let calDays = 0; if(r.dateOut && r.dateIn && r.dateIn !== ''){ let out = new Date(r.dateOut); let inD = new Date(r.dateIn); let calOut = new Date(out.getFullYear(), out.getMonth(), out.getDate()); let calIn = new Date(inD.getFullYear(), inD.getMonth(), inD.getDate()); calDays = Math.round((calIn - calOut) / 86400000); } if(!durationType){ if(calDays >= 25) durationType = 'monthly'; else if(calDays >= 5) durationType = 'weekly'; else durationType = 'daily'; } return { is4x4, durationType, calDays }; }


// ── displayPrice: show basePrice for weekly/monthly, price/day for daily ──
// ── displayPrice (orig. line 5195) ──
function displayPrice(r){
  let { durationType } = detectContractType(r);
  let bp = Number(r.basePrice || 0);
  let pr = Number(r.price || 0);
  if(durationType === 'monthly'){
    let val = bp > 0 ? bp : pr;
    return `<span style="font-family:'IBM Plex Mono',monospace;font-weight:700">${fmtNum(val)}</span><span style="font-size:.65rem;color:var(--muted);margin-left:2px">/mo</span>`;
  }
  if(durationType === 'weekly'){
    let val = bp > 0 ? bp : pr;
    return `<span style="font-family:'IBM Plex Mono',monospace;font-weight:700">${fmtNum(val)}</span><span style="font-size:.65rem;color:var(--muted);margin-left:2px">/wk</span>`;
  }
  // daily
  return `<span style="font-family:'IBM Plex Mono',monospace;font-weight:700">${fmtNum(pr)}</span><span style="font-size:.65rem;color:var(--muted);margin-left:2px">/day</span>`;
}


// ── filterDaily (orig. line 6369) ──
function filterDaily(q){
  let s = (q||'').toLowerCase().trim();
  let picker = document.getElementById('month-picker');
  let ym = (picker && picker.value) ? picker.value : (window._currentYm || new Date().toISOString().slice(0,7));

  // Helper : ce rental correspond-il à la recherche ?
  function matches(r){
    if(!s) return true;
    let v = DB.vehicles.find(x => x.id === r.vehicleId) || {};
    let cl = r._clientId ? (DB.clients||[]).find(c => c.id === r._clientId) : null;
    let clName = r._clientName || (cl ? (cl.firstname||'') : '');
    let clIdcard = r._clientIdcard || (cl ? (cl.idcard||'') : '');
    return [v.name||r._name||'', v.plate||r._plate||'', r.contract||'',
      r.tel||'', r.notes||'', r.dateOut||'', r.dateIn||'',
      String(r.paid||''), String(r.price||''), String(r.kmOut||''), String(r.kmIn||''),
      clName, clIdcard
    ].join(' ').toLowerCase().includes(s);
  }

  // ── Recalc BAL pour tous ──────────────────────────────────────────────
  DB.rentals.forEach(r => {
    if(!r.dateIn||r.dateIn===''){if(!r._balManual){let b=calcOpenContractBAL(r);if(b!==null)r.bal=b;}}
    else{let b=calcRentalBAL(r);if(b!==null&&!r._balManual)r.bal=b;}
  });

  // ── OPEN CONTRACTS ────────────────────────────────────────────────────
  let allOpens = DB.rentals.filter(r => (!r.dateIn||r.dateIn==='')||!isClosedAndSettled(r));
  let currentOpens = allOpens.filter(r => (r.dateOut||'').slice(0,7)===ym && matches(r));
  let ancientOpens = allOpens.filter(r => ((r.dateOut||'').slice(0,7)<ym||!(r.dateOut||'')) && matches(r));
  currentOpens.sort((a,b)=>Number(a.contract||0)-Number(b.contract||0));
  ancientOpens.sort((a,b)=>((a.dateOut||'').localeCompare(b.dateOut||'')));

  let tbody = document.getElementById('open-contracts-body');
  let badge = document.getElementById('oc-count-badge');
  if(badge) badge.textContent = currentOpens.length + ' ' + i18nPlural('daily.rental','daily.rentals',currentOpens.length);
  if(tbody) tbody.innerHTML = currentOpens.length
    ? currentOpens.map(r=>buildOcRow(r,ym)).join('')
    : `<tr><td colspan="18" style="text-align:center;padding:20px;">${s?'🔍 '+translate('daily.noResultsFor')+' "'+q+'"':'✅ '+translate('daily.noOpenContracts')}</td></tr>`;
  let totalDisplay = document.getElementById('oc-total-display');
  if(totalDisplay){
    let tPaid=currentOpens.reduce((s,r)=>s+Number(r.paid||0),0);
    let tBal=currentOpens.reduce((s,r)=>s+Math.max(0,Number(calcBAL(r))),0);
    let bCol=tBal>0?'#ef4444':'#22c55e';
    totalDisplay.innerHTML=`<span>${translate('section.totalPaid')}: <strong style="font-family:'IBM Plex Mono',monospace">${fmtNum(tPaid)} OMR</strong></span> &nbsp;·&nbsp; <span style="font-weight:700;color:${bCol};font-family:'IBM Plex Mono',monospace">BAL: ${fmtNum(tBal)} OMR</span>`;
  }
  let ancientBanner=document.getElementById('ancient-contracts-banner');
  let ancientBody=document.getElementById('ancient-contracts-body');
  let ancientBadge=document.getElementById('ancient-count-badge');
  let ancientTotalEl=document.getElementById('ancient-total-display');
  if(ancientBanner) ancientBanner.style.display=ancientOpens.length?'block':'none';
  if(ancientBadge)  ancientBadge.textContent=ancientOpens.length;
  if(ancientBody){
    // ── Pagination : même état partagé que renderOpenContracts. Recherche active
    // → on repart toujours de la page 0 (le jeu de résultats change). ──
    if(typeof window._ancientOcPageState === 'undefined') window._ancientOcPageState = { page: 0, pageSize: 50 };
    if(s) window._ancientOcPageState.page = 0;
    let _ancPg2 = renderPaginationBar(ancientBody, window._ancientOcPageState, ancientOpens.length, function(){ filterDaily(q); });
    let ancientOpensPage2 = ancientOpens.slice(_ancPg2.pageStart, _ancPg2.pageStart + window._ancientOcPageState.pageSize);
    ancientBody.innerHTML=ancientOpens.length
      ? ancientOpensPage2.map(r=>buildOcRow(r,ym)).join('')
      : `<tr><td colspan="18" style="text-align:center;padding:20px;">${s?'🔍 No results':translate('section.noOldOpenContracts')}</td></tr>`;
    if(ancientTotalEl&&ancientOpens.length){
      let aBal=ancientOpens.reduce((sum,r)=>sum+Math.max(0,Number(calcBAL(r))),0);
      let bCol=aBal>0?'#ef4444':'#22c55e';
      ancientTotalEl.innerHTML=`<span>${ancientOpens.length} ${translate('section.oldOpenContracts')}</span> &nbsp;·&nbsp; <span style="font-weight:700;color:${bCol};font-family:'IBM Plex Mono',monospace">BAL: ${fmtNum(aBal)} OMR</span>`;
    }
  }

  // ── DAILY RENTALS ─────────────────────────────────────────────────────
  let container = document.getElementById('daily-container');
  if(!container) return;
  if(!s){ renderDaily(); return; }

  let dailyAll = DB.rentals.filter(r => isClosedAndSettled(r) && matches(r));
  if(!dailyAll.length){
    container.innerHTML=`<div class="empty">🔍 ${translate('daily.noResultsFor')} "${q}"</div>`;
    return;
  }
  // ✅ i18n (2026-07) : noms de mois traduits selon la langue active
  const mnNames = (typeof i18nMonthNames === 'function') ? i18nMonthNames() : ['January','February','March','April','May','June','July','August','September','October','November','December'];
  let parMonth={};
  dailyAll.forEach(r=>{let m=r.dateOut?r.dateOut.slice(0,7):'?';if(!parMonth[m])parMonth[m]=[];parMonth[m].push(r);});
  const tHead=`<table class="rentals-table"><thead><tr><th style="min-width:74px">${translate('col.vehicle')}</th><th style="min-width:48px">${translate('col.contract')}</th><th style="min-width:42px">${translate('col.price')}</th><th style="min-width:76px">${translate('col.dateOut')}</th><th style="min-width:76px">${translate('col.dateIn')}</th><th style="min-width:48px">${translate('col.kmOut')}</th><th style="min-width:48px">${translate('col.kmIn')}</th><th style="min-width:38px">${translate('col.diff')}</th><th style="min-width:42px">${translate('col.paid')}</th><th style="min-width:42px">${translate('col.bal')}</th><th style="min-width:44px">${translate('col.cond')}</th><th style="min-width:42px">${translate('col.fuelOut')}</th><th style="min-width:42px">${translate('col.fuelIn')}</th><th style="min-width:58px">${translate('col.tel')}</th><th style="min-width:64px">${translate('col.actions')}</th></tr></thead>`;
  const bRow=r=>{
    let v=r.vehicleId?(DB.vehicles.find(x=>x.id===r.vehicleId)||{}):{};
    let vN=v.name||r._name||'—'; let {plateFormatted:vP}=formatVehicleDisplay(vN,v.plate||r._plate||'—');
    let diff=r.kmIn&&r.kmOut?Math.round(r.kmIn-r.kmOut):'—';
    let fO=(r.fuelOut!==undefined&&r.fuelOut!==null&&r.fuelOut!=='')?r.fuelOut:'—';
    let fI=(r.fuelIn!==undefined&&r.fuelIn!==null&&r.fuelIn!=='')?r.fuelIn:'—';
    let cB=r.cleanBefore==='dirty'?'❌':(r.cleanBefore==='clean'?'✅':'—');
    let cA=r.cleanAfter==='dirty'?'❌':(r.cleanAfter==='clean'?'✅':'—');
    let b=r._balManual?Number(r.bal||0):calcBAL(r);
    let bC=b>0?'#ef4444':(b<0?'#22c55e':'var(--green)');
    let cK=String(r.contract||r.id);
    let hV=window._contractVideos&&window._contractVideos[cK];
    let vS=hV?'background:rgba(37,99,235,.3);border:1px solid #2563eb;color:#93c5fd':'background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:var(--muted)';
    let cBcol=r.cleanBefore==='dirty'?'#f87171':'#4ade80'; let cAcol=r.cleanAfter==='dirty'?'#f87171':'#4ade80';
    let condCell=`<span style="color:${cBcol};font-weight:700">${cB}</span><span style="color:var(--muted);margin:0 2px">→</span><span style="color:${cAcol};font-weight:700">${cA}</span>`;
    let isCancelledB=r._cancelled===true;
    let isNoticeB=r._notice===true;
    let bgStyleB=(isCancelledB||isNoticeB)?'background:rgba(220,38,38,.06);outline:2px solid rgba(220,38,38,.35);outline-offset:-2px;animation:cancelledBlink 1.5s ease-in-out infinite;':'';
    let cancelBadgeB=isCancelledB?'<span style="background:#dc2626;color:#fff;font-size:.6rem;font-weight:900;border-radius:4px;padding:1px 5px;letter-spacing:.5px;margin-left:5px;animation:cancelledBlink 1.5s ease-in-out infinite">CANCELLED</span>':'';
    cancelBadgeB+=isNoticeB?'<span style="background:#dc2626;color:#fff;font-size:.6rem;font-weight:900;border-radius:4px;padding:1px 5px;letter-spacing:.5px;margin-left:5px;animation:cancelledBlink 1.5s ease-in-out infinite">تعميم</span>':'';
    return `<tr style="${bgStyleB}">${(isCancelledB||isNoticeB) ? '<style>@keyframes cancelledBlink{0%,100%{outline-color:rgba(220,38,38,.35)}50%{outline-color:rgba(220,38,38,.8)}}</style>' : ''}<td style="white-space:nowrap">${makeVehiclePill(vN,vP,null)}</td><td><span style="display:flex;align-items:center;gap:5px"><span data-dr-action="payment-history" data-dr-contract="${escapeHtml(r.contract||'')}" data-dr-branch="${escapeHtml(r.branch||'')}" style="cursor:pointer;color:#2563EB;font-weight:700;text-decoration:underline;font-size:.88rem;text-underline-offset:2px" title="${translate('rental.paymentHistory')}">${r.contract||'—'}</span>${cancelBadgeB}</span></td><td>${displayPrice(r)}</td><td>${fmtDate(r.dateOut)}</td><td>${r.dateIn?fmtDate(r.dateIn):'OUT'}</td><td>${r.kmOut?Math.round(r.kmOut):'—'}</td><td>${r.kmIn?Math.round(r.kmIn):'—'}</td><td>${diff}</td><td style="color:var(--green)">${fmtNum(r.paid)}</td><td style="font-weight:700;cursor:pointer;text-decoration:underline dotted" data-dr-action="show-bal-detail" data-dr-id="${r.id}"><span style="color:${bC}">${fmtNum(b)}</span></td><td style="text-align:center;white-space:nowrap">${condCell}</td><td>${fO}</td><td>${fI}</td><td>${escapeHtml(r.tel)||'—'}</td><td><div style="display:inline-flex;gap:5px"><button class="btn btn-ghost" style="padding:3px 10px;font-size:.8rem" data-dr-action="edit-rental" data-dr-id="${r.id}">✏️ Edit</button><button class="btn btn-ghost btn-delete" style="padding:3px 10px;font-size:.8rem" data-dr-action="delete-rental" data-dr-id="${r.id}">🗑️</button><button class="btn btn-ghost" style="padding:3px 8px;font-size:.78rem;${vS};border-radius:6px" data-dr-action="open-contract-video" data-dr-ckey="${escapeHtml(cK)}">🎬</button></div></td></tr>`;
  };
  let mSorted=Object.keys(parMonth).sort().reverse();
  let html=mSorted.map(m=>{
    let [my,mm]=m.split('-').map(Number);
    let mL=(mm&&mnNames[mm-1])?mnNames[mm-1]+' '+my:m;
    let rts=parMonth[m].sort((a,b)=>Number(a.contract||0)-Number(b.contract||0));
    let tot=rts.reduce((s,r)=>s+Number(r.paid||0),0);
    let id='srch-'+m.replace('-','');
    return `<div class="month-block" style="margin-bottom:12px"><div class="month-header" data-dr-action="toggle-by-id" data-dr-target="${id}" style="cursor:pointer"><div class="month-header-title">📆 ${mL} <span style="background:rgba(255,255,255,.2);border-radius:20px;padding:2px 10px;font-size:.75rem">${rts.length} ${i18nPlural('daily.rental','daily.rentals',rts.length)}</span></div><div><span class="month-header-stats">${fmtNum(tot)} ${translate('daily.omrCollected')}</span></div></div><div id="${id}" style="overflow-x:auto">${tHead}<tbody>${rts.map(bRow).join('')}</tbody></table></div></div>`;
  }).join('');
  container.innerHTML=`<div style="margin-bottom:8px;font-size:.82rem;color:var(--muted)">🔍 <strong>${dailyAll.length}</strong> ${i18nPlural('daily.result','daily.results',dailyAll.length)} ${translate('daily.for')} "<strong>${q}</strong>" — ${translate('daily.allMonths')}</div>${html}`;
}

window.goToContract = goToContract;

// ── Contract type badge: D / W / M ──────────────────────────────
// ── getContractTypeBadge (orig. line 10498) ──
function getContractTypeBadge(r){
  let dt = r.contractType || '';
  if(!dt){
    if(r.dateOut && r.dateIn && r.dateIn !== ''){
      let calDays = Math.round((new Date(r.dateIn) - new Date(r.dateOut)) / 86400000);
      if(calDays >= 25) dt = 'monthly';
      else if(calDays >= 6) dt = 'weekly';
      else dt = 'daily';
    } else {
      let kmPD = Number(r.kmPerDay||0);
      if(kmPD >= 160) dt = 'monthly';
      else if(kmPD >= 140) dt = 'weekly';
      else dt = 'daily';
    }
  }
  if(dt === 'monthly') return '<span title="Monthly" style="background:#7c3aed;color:#fff;border-radius:4px;padding:1px 5px;font-size:.6rem;font-weight:900;letter-spacing:.2px">M</span>';
  if(dt === 'weekly')  return '<span title="Weekly"  style="background:#2563eb;color:#fff;border-radius:4px;padding:1px 5px;font-size:.6rem;font-weight:900;letter-spacing:.2px">W</span>';
  return              '<span title="Daily"   style="background:#16a34a;color:#fff;border-radius:4px;padding:1px 5px;font-size:.6rem;font-weight:900;letter-spacing:.2px">D</span>';
}



// ==== FILTER FIX ====
// ── safeDailyRentalFilter (orig. line 11001) ──
window.safeDailyRentalFilter = function(inputId, tableId){

    let input = document.getElementById(inputId);

    if(!input) return;

    let filter = (input.value || '').toLowerCase().trim();

    let table = document.getElementById(tableId);

    if(!table) return;

    let rows = table.querySelectorAll('tbody tr');

    rows.forEach(row=>{

        if(filter === ''){
            row.style.display = '';
            return;
        }

        let txt = row.innerText.toLowerCase();

        row.style.display = txt.includes(filter) ? '' : 'none';
    });
}


// ==== AUDIO PATCH ====


// ==== FILTER PATCH ====
// ── safeFilterContracts (orig. line 11249) — UNIQUE définition ──
function safeFilterContracts(filterValue){
    if(!filterValue || filterValue.trim() === ""){
        if(typeof showAllContracts === 'function'){
            showAllContracts();
        }
        return;
    }
}


// ──────────────────────────────────────────────────────────────────────────────────

document.addEventListener('click', function(e){
  let btn = e.target.closest('[data-dr-action]');
  if(!btn) return;
  let action = btn.dataset.drAction;
  let id = Number(btn.dataset.drId);

  if(action === 'jump-rental'){
    e.stopPropagation();
    jumpToRentalRow(id);
  } else if(action === 'lock-base-price'){
    lockBasePrice();
  } else if(action === 'confirm-base-price-pwd'){
    confirmBasePricePassword();
  } else if(action === 'cancel-base-price-unlock'){
    cancelBasePriceUnlock();
  } else if(action === 'view-client'){
    viewClientDetail(id);
  } else if(action === 'quick-add-client'){
    quickAddClientFromRental(btn.dataset.drValue);
  } else if(action === 'remove-payment-entry'){
    removePaymentEntry(Number(btn.dataset.drIndex));
  } else if(action === 'toggle-day'){
    toggleDay(btn.dataset.drTarget);
  } else if(action === 'toggle-month-block'){
    toggleMonthBlock(btn.dataset.drTarget);
  } else if(action === 'show-month-payment-detail'){
    e.stopPropagation();
    showMonthPaymentDetail();
  } else if(action === 'toggle-next-sibling'){
    let panel = btn.nextElementSibling;
    let willShow = panel.style.display === 'none';
    panel.style.display = willShow ? 'block' : 'none';
    let chevClass = btn.dataset.drChevClass;
    if(chevClass){ let chev = btn.querySelector('.' + chevClass); if(chev) chev.textContent = willShow ? '▼' : '▶'; }
  } else if(action === 'toggle-by-id'){
    let el = document.getElementById(btn.dataset.drTarget);
    if(el){
      let willShow = el.style.display === 'none';
      el.style.display = willShow ? 'block' : 'none';
      let chevClass = btn.dataset.drChevClass;
      if(chevClass){ let chev = btn.querySelector('.' + chevClass); if(chev) chev.textContent = willShow ? '▼' : '▶'; }
    }
  } else if(action === 'show-note-popup'){
    showNotePopup(e, id);
  } else if(action === 'goto-client-profile'){
    goToClientProfile(id);
  } else if(action === 'payment-history'){
    showPaymentHistory(btn.dataset.drContract, btn.dataset.drBranch);
  } else if(action === 'show-bal-detail'){
    showBalDetail(id);
  } else if(action === 'edit-rental'){
    editRental(id);
  } else if(action === 'delete-rental'){
    deleteRental(id);
  } else if(action === 'delete-rental-undo'){
    deleteRentalUndo(id);
  } else if(action === 'open-contract-video'){
    openContractVideo(btn.dataset.drCkey);
  } else if(action === 'quick-add-payment'){
    quickAddPaymentFor(btn.dataset.drContract, btn.dataset.drPlate);
  } else if(action === 'close-overlay'){
    document.getElementById(btn.dataset.drOverlayId)?.remove();
  } else if(action === 'edit-cf-credit'){
    e.stopPropagation();
    promptAdjustCarryForwardCredit(id);
  }
});
