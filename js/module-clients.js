// ── Globals used throughout this module ──
let clientSearch = '';
let clientFilter = 'all'; // 'all' | 'active' | 'blacklist'
let editingClientId = null;

if(!DB.clients) DB.clients = [];
if(!DB.nextCId) DB.nextCId = 1;

// ── renderClients (orig. line 13772) ──
// FIX cross-branch (2026-09) : DB.rentals est filtré par branche au /load —
// les contrats de l'autre agence sont invisibles depuis la session courante.
// Solution : un seul fetch GET /api/client-summaries récupère pour TOUS les
// clients { activeRental, totalBAL, rentalCount } en lisant toute la table
// rentals côté serveur, sans filtre de branche. Le résultat est stocké dans
// window._clientCrossSummaries (Map clientId → summary) et utilisé à la place
// de DB.rentals pour les badges OUT, BAL DUE, rentalCount, filtres Active/Balance.
// Le rendu DOM se déclenche dans _renderClientsDOM(), appelé après le fetch.
function renderClients(){
  ensurePageLoaded('clients');
  if(!DB.clients) DB.clients = [];

  // ── Fetch cross-branch summaries puis rendu ──────────────────────────────
  // Verrou anti-fetch-parallèle : si un fetch est déjà en vol, on mémorise
  // que renderClients a été rappelé (filtre/pagination changé entre-temps) et
  // on relance un rendu dès que le fetch en cours se termine — au lieu de
  // silently drop l'appel, ce qui laisserait l'UI figée sur l'ancien filtre.
  if(window._clSummaryFetching){
    window._clSummaryPending = true;
    return;
  }
  window._clSummaryFetching = true;
  window._clSummaryPending  = false;

  // Render immédiat avec cache existant (ou Map vide) pour ne pas bloquer l'UI,
  // puis re-render avec les données fraîches dès que le fetch répond.
  _renderClientsDOM(window._clientCrossSummaries || new Map());

  fetch('/api/client-summaries', {
    headers: (typeof authHeaders === 'function') ? authHeaders() : {}
  })
  .then(function(r){ return r.ok ? r.json() : Promise.reject('HTTP ' + r.status); })
  .then(function(data){
    let m = new Map();
    let raw = data.summaries || {};
    Object.keys(raw).forEach(function(cid){ m.set(Number(cid), raw[cid]); });
    window._clientCrossSummaries = m;
    _renderClientsDOM(m);
  })
  .catch(function(err){
    console.warn('[renderClients] Fallback DB locale (cross-branch indispo):', err);
    // Construit une Map à partir de DB.rentals local — données partielles
    // (même comportement qu'avant le fix — pas de régression)
    let m = new Map();
    (DB.rentals||[]).forEach(function(r){
      let cid = r._clientId;
      if(cid === undefined || cid === null) return;
      if(!m.has(cid)) m.set(cid, { activeRental: null, totalBAL: 0, rentalCount: 0 });
      let s = m.get(cid);
      s.rentalCount++;
      if(r.dateOut && (!r.dateIn || r.dateIn === '')) s.activeRental = r;
      let bal = r._balManual
        ? ((r.bal !== undefined && r.bal !== null) ? Number(r.bal) : 0)
        : (r.bal !== undefined && r.bal !== null ? Number(r.bal) : Number((r.price||0)) - Number((r.paid||0)));
      if(isFinite(bal)) s.totalBAL += bal;
    });
    m.forEach(function(s){ s.totalBAL = Math.round(s.totalBAL * 1000) / 1000; });
    window._clientCrossSummaries = m;
    _renderClientsDOM(m);
  })
  .finally(function(){
    window._clSummaryFetching = false;
    // Si renderClients a été rappelé pendant le fetch (filtre/pagination),
    // on relance maintenant que le verrou est libéré.
    if(window._clSummaryPending){ window._clSummaryPending = false; renderClients(); }
  });
}

// ── _renderClientsDOM ──────────────────────────────────────────────────────
// Rendu DOM réel de la liste clients.
// xMap : Map<clientId, { activeRental, totalBAL, rentalCount }> cross-branch.
function _renderClientsDOM(xMap){
  if(!DB.clients) DB.clients = [];
  let today = new Date().toISOString().slice(0,10);

  // Helper : summary cross-branch pour un client (fallback objet vide)
  function xSum(clientId){
    return xMap.get(Number(clientId)) || { activeRental: null, totalBAL: 0, rentalCount: 0 };
  }

  // Helper : dernier contrat local (vehicle badge quand client inactif)
  function getLastRentalLocal(clientId){
    let rr = (DB.rentals||[]).filter(function(r){ return r._clientId === clientId && r.dateOut; });
    if(!rr.length) return null;
    return rr.reduce(function(a,b){ return a.dateOut > b.dateOut ? a : b; });
  }

  let list = DB.clients;

  // ── Filtres — utilisent xSum() cross-branch ──────────────────────────────
  if(clientFilter === 'active'){
    list = list.filter(function(c){ return xSum(c.id).activeRental !== null; });
  }
  if(clientFilter === 'blacklist'){
    list = list.filter(function(c){ return c.blacklisted === true; });
  }
  if(clientFilter === 'balance'){
    list = list.filter(function(c){ return xSum(c.id).totalBAL > 0; });
  }
  if(clientFilter === 'docs'){
    list = list.filter(function(c){ return window.DocAlerts && DocAlerts.hasProblem(c); });
  }

  // Search filter
  if(clientSearch){
    let q = clientSearch.toLowerCase();
    list = list.filter(function(c){
      return (c.firstname+' '+(c.lastname||'')).toLowerCase().includes(q) ||
        (c.idcard||'').toLowerCase().includes(q) ||
        (c.licence||'').toLowerCase().includes(q) ||
        (c.tel||'').includes(q) ||
        (c.nationality||'').toLowerCase().includes(q);
    });
  }

  // ── Compteurs pills — cross-branch ───────────────────────────────────────
  let activeCount    = (DB.clients||[]).filter(function(c){ return xSum(c.id).activeRental !== null; }).length;
  let blacklistCount = (DB.clients||[]).filter(function(c){ return c.blacklisted === true; }).length;
  let balanceCount   = (DB.clients||[]).filter(function(c){ return xSum(c.id).totalBAL > 0; }).length;

  let cfAll = document.getElementById('cf-filter-count-all');
  if(cfAll) cfAll.textContent = DB.clients.length;
  let cfActive = document.getElementById('cf-filter-count-active');
  if(cfActive) cfActive.textContent = activeCount;
  let cfBalance = document.getElementById('cf-filter-count-balance');
  if(cfBalance) cfBalance.textContent = balanceCount;
  let cfDocs = document.getElementById('cf-filter-count-docs');
  if(cfDocs) cfDocs.textContent = (window.DocAlerts ? (DB.clients||[]).filter(function(c){ return DocAlerts.hasProblem(c); }).length : 0);
  let cfBlacklist = document.getElementById('cf-filter-count-blacklist');
  if(cfBlacklist) cfBlacklist.textContent = blacklistCount;

  let el = document.getElementById('client-list');
  if(!el) return;

  if(list.length === 0){
    let msg = clientFilter === 'active'
      ? '🚗 No clients with active rental'
      : clientFilter === 'blacklist'
        ? '🚫 No blacklisted clients'
        : clientFilter === 'docs'
          ? translate('docAlert.emptyFilter')
        : clientFilter === 'balance'
          ? '💰 No clients with outstanding balance'
          : '👨‍👩‍👧‍👦 No clients yet — click <strong>+ New Client</strong> to add one';
    el.innerHTML = '<div style="text-align:center;padding:60px;color:var(--muted)">'+msg+'</div>';
    return;
  }

  el.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px;padding:0 0 16px">' +
    (function(){
      // ── Pagination : évite de générer des centaines de cartes DOM d'un coup ──
      if(typeof window._clientsPageState === 'undefined') window._clientsPageState = { page: 0, pageSize: 60 };
      let _clPg = renderPaginationBar(el, window._clientsPageState, list.length, renderClients);
      return list.slice(_clPg.pageStart, _clPg.pageStart + window._clientsPageState.pageSize);
    })().map(function(c){
      let fullName   = escapeHtml((c.firstname || '').trim());
      let idExp      = c.idcardExp  ? fmtDate(c.idcardExp)  : '—';
      let licExp     = c.licenceExp ? fmtDate(c.licenceExp) : '—';
      let idExpired  = c.idcardExp  && c.idcardExp  < today;
      let licExpired = c.licenceExp && c.licenceExp < today;

      // ── Données cross-branch ─────────────────────────────────────────────
      let sx             = xSum(c.id);
      let activeRental   = sx.activeRental;  // null si aucun contrat actif toutes branches
      let clientTotalBAL = sx.totalBAL;      // BAL toutes branches
      let rentalCount    = sx.rentalCount;   // nb contrats toutes branches

      // ── Badge véhicule ───────────────────────────────────────────────────
      // Priorité : contrat actif cross-branch → sinon dernier contrat local
      let badgeRental = activeRental || getLastRentalLocal(c.id);
      let vehicleBadgeHtml = '';
      if(badgeRental){
        let rV     = badgeRental.vehicleId ? (DB.vehicles.find(function(x){ return x.id===badgeRental.vehicleId; })||{}) : {};
        let rPlate = rV.plate || badgeRental._plate || badgeRental.plate || '';
        let rName  = rV.name  || badgeRental._name  || '';
        let carType = badgeRental.carType || '';
        let label = (rName || rPlate)
          ? (rName ? rName + (rPlate?' · '+rPlate:'') : rPlate)
          : (carType || '?');
        if(rPlate || rName){
          if(activeRental){
            vehicleBadgeHtml = '<div style="display:inline-flex;align-items:center;gap:5px;background:rgba(22,163,74,.1);border:1px solid rgba(22,163,74,.3);border-radius:20px;padding:3px 10px;margin-top:7px">'
              + '<span style="width:7px;height:7px;border-radius:50%;background:#16a34a;flex-shrink:0;box-shadow:0 0 0 2px rgba(22,163,74,.25)"></span>'
              + '<span style="font-family:var(--mono);font-weight:700;font-size:.75rem;color:#16a34a;letter-spacing:.4px">'+label+'</span>'
              + '</div>';
          } else {
            vehicleBadgeHtml = '<div style="display:inline-flex;align-items:center;gap:5px;background:var(--s3);border:1px solid var(--border);border-radius:20px;padding:3px 10px;margin-top:7px">'
              + '<span style="font-size:.7rem">🕓</span>'
              + '<span style="font-family:var(--mono);font-weight:600;font-size:.74rem;color:var(--muted);letter-spacing:.3px">'+label+'</span>'
              + '</div>';
          }
        }
      }

      let balBadge = clientTotalBAL > 0
        ? '<div style="display:flex;align-items:center;gap:6px;background:rgba(245,158,11,.1);border:1.5px solid rgba(245,158,11,.4);border-radius:7px;padding:5px 10px;margin-bottom:8px">'
          + '<span style="font-size:.7rem;font-weight:800;color:#d97706;text-transform:uppercase;letter-spacing:.5px">⚠️ BAL DUE</span>'
          + '<span style="font-family:var(--mono);font-weight:900;font-size:.9rem;color:#d97706;margin-left:auto">'+Number(clientTotalBAL).toFixed(3)+' OMR</span>'
          + '</div>'
        : '';

      let borderColor = c.blacklisted ? 'rgba(220,38,38,.5)' : (idExpired || licExpired) ? 'rgba(220,38,38,.6)' : activeRental ? 'rgba(22,163,74,.35)' : 'var(--border)';
      let docWarnHtml = window.DocAlerts ? DocAlerts.cardBanner(c, !!activeRental) : '';
      let bgExtra     = c.blacklisted ? ';background:rgba(220,38,38,.04)' : '';
      let avatarBg    = c.blacklisted ? 'linear-gradient(135deg,#991b1b,#dc2626)' : 'linear-gradient(135deg,#1d4ed8,#3b82f6)';
      let avatarIcon  = c.blacklisted ? '🚫' : '👨‍👩‍👧‍👦';
      let nameColor   = c.blacklisted ? '#dc2626' : 'var(--text)';
      let headerBadge = c.blacklisted
        ? '<span style="flex-shrink:0;background:#dc2626;color:#fff;border-radius:20px;padding:2px 9px;font-size:.62rem;font-weight:800">🚫 BLACKLIST</span>'
        : activeRental
          ? '<span style="flex-shrink:0;background:#16a34a;color:#fff;border-radius:20px;padding:2px 9px;font-size:.62rem;font-weight:800">🔓 OUT</span>'
          : '';
      let blacklistReasonHtml = (c.blacklisted && c.blacklistReason)
        ? '<div style="background:rgba(220,38,38,.1);border:1px solid rgba(220,38,38,.2);border-radius:6px;padding:5px 10px;font-size:.72rem;color:#dc2626;margin-bottom:8px;font-weight:600">⚠️ '+escapeHtml(c.blacklistReason)+'</div>'
        : '';
      let footerLeft = (rentalCount > 0 ? '🔑 '+rentalCount+' rental'+(rentalCount>1?'s':'') : 'No rentals yet')
        + (badgeRental && badgeRental.carType ? ' · '+(badgeRental.carType==='4x4'?'🚙 4×4':'🚗 Sedan') : '');
      let blBtnStyle = c.blacklisted ? 'color:#16a34a;border-color:#16a34a' : 'color:#dc2626;border-color:#dc2626';
      let blBtnTitle = c.blacklisted ? 'Remove from blacklist' : 'Add to blacklist';
      let blBtnIcon  = c.blacklisted ? '✅' : '🚫';

      return '<div style="background:var(--s2);border:1px solid '+borderColor+';border-radius:12px;padding:14px;transition:box-shadow .15s'+bgExtra+'" onmouseenter="this.style.boxShadow=\'0 4px 16px rgba(0,0,0,.12)\'" onmouseleave="this.style.boxShadow=\'\'">'

        // Header
        + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">'
          + '<div style="width:40px;height:40px;border-radius:50%;background:'+avatarBg+';display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0">'+avatarIcon+'</div>'
          + '<div style="flex:1;min-width:0;overflow:hidden">'
            + '<div style="font-weight:800;font-size:.92rem;color:'+nameColor+';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+fullName+'</div>'
            + '<div style="font-size:.72rem;color:var(--muted);margin-top:1px">'+escapeHtml(c.nationality||'')+(c.tel ? ' · 📞 '+escapeHtml(c.tel) : '')+'</div>'
          + '</div>'
          + headerBadge
        + '</div>'

        // Blacklist reason
        + blacklistReasonHtml

        // ID / Licence expiry banner
        + docWarnHtml

        // Vehicle badge
        + (vehicleBadgeHtml ? '<div style="margin-bottom:8px">'+vehicleBadgeHtml+'</div>' : '')

        // ID + Licence
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px">'
          + '<div style="background:var(--s1);border-radius:6px;padding:6px 8px">'
            + '<div style="color:var(--muted);font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px">🪪 ID Card</div>'
            + '<div style="font-family:var(--mono);font-weight:700;font-size:.78rem">'+(escapeHtml(c.idcard)||'—')+'</div>'
            + '<div style="font-size:.65rem;color:'+(idExpired?'#ef4444':'var(--muted)')+'">'+(idExpired?'⚠️ ':'')+'Exp: '+idExp+'</div>'
          + '</div>'
          + '<div style="background:var(--s1);border-radius:6px;padding:6px 8px">'
            + '<div style="color:var(--muted);font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px">📜 Licence</div>'
            + '<div style="font-family:var(--mono);font-weight:700;font-size:.78rem">'+(escapeHtml(c.licence)||'—')+'</div>'
            + '<div style="font-size:.65rem;color:'+(licExpired?'#ef4444':'var(--muted)')+'">'+(licExpired?'⚠️ ':'')+'Exp: '+licExp+'</div>'
          + '</div>'
        + '</div>'

        // BAL badge
        + balBadge

        // Footer
        + '<div style="display:flex;align-items:center;justify-content:space-between;padding-top:8px;border-top:1px solid var(--border)">'
          + '<span style="font-size:.72rem;color:var(--muted)">'+footerLeft+'</span>'
          + '<div style="display:flex;gap:5px">'
            + '<button class="btn btn-primary" data-client-action="view" data-client-id="'+c.id+'" style="padding:3px 10px;font-size:.7rem;background:linear-gradient(135deg,#4338ca,#6366f1);border:none" title="Stats & History">📊</button>'
            + '<button class="btn btn-ghost" data-client-action="edit" data-client-id="'+c.id+'" style="padding:3px 8px;font-size:.7rem" title="Edit">✏️</button>'
            + '<button class="btn btn-ghost" data-client-action="toggle-blacklist" data-client-id="'+c.id+'" style="padding:3px 8px;font-size:.7rem;'+blBtnStyle+'" title="'+blBtnTitle+'">'+blBtnIcon+'</button>'
            + '<button class="btn btn-ghost" data-client-action="delete" data-client-id="'+c.id+'" style="padding:3px 8px;font-size:.7rem;color:var(--red)" title="Delete (locked)">🔐🗑</button>'
          + '</div>'
        + '</div>'

      + '</div>';
    }).join('') + '</div>';
}
// ── openClientModal (orig. line 13988) ──
function openClientModal(id=null){
  editingClientId = id;
  _clScanIdFile = null;
  _clScanLicFile = null;
  _clScanIdAttachmentId = null;
  _clScanLicAttachmentId = null;
  // FIX: mémorise le scan présent à l'ouverture, pour savoir au Save si
  // l'utilisateur l'a retiré sans le remplacer (voir saveClientModal).
  _clScanIdOriginalAttachmentId = null;

  ['cl-firstname','cl-licence','cl-idcard','cl-passport','cl-visa',
   'cl-nationality','cl-address','cl-tel'].forEach(function(fId){
    let el = document.getElementById(fId);
    if(el) el.value = '';
  });
  ['cl-licence-exp','cl-idcard-exp','cl-passport-exp','cl-visa-exp'].forEach(function(fId){
    let el = document.getElementById(fId);
    if(el) el.value = '';
  });

  clearClientScan('id');

  let titleEl = document.getElementById('client-modal-title');
  if(id){
    if(titleEl) titleEl.textContent = 'Edit Client / تعديل العميل';
    let c = (DB.clients||[]).find(x => x.id === id);
    if(c){
      document.getElementById('cl-firstname').value = c.firstname||'';
      document.getElementById('cl-licence').value = c.licence||'';
      document.getElementById('cl-idcard').value = c.idcard||'';
      document.getElementById('cl-passport').value = c.passport||'';
      document.getElementById('cl-visa').value = c.visa||'';
      document.getElementById('cl-nationality').value = c.nationality||'';
      document.getElementById('cl-tel').value = c.tel||'';
      if(c.licenceExp) document.getElementById('cl-licence-exp').value = c.licenceExp;
      if(c.idcardExp) document.getElementById('cl-idcard-exp').value = c.idcardExp;
      if(c.passportExp) document.getElementById('cl-passport-exp').value = c.passportExp;
      if(c.visaExp) document.getElementById('cl-visa-exp').value = c.visaExp;
      
      // ✅ CHANGED: Load scans from attachments folder
      _clScanIdAttachmentId = c.scanId || null;
      _clScanLicAttachmentId = c.scanLic || null;
      _clScanIdOriginalAttachmentId = c.scanId || null;
      
      if(c.scanId){
        // Try to load attachment info from attachments.json
        fetch('/api/attachment-info?id='+c.scanId)
          .then(r => r.json())
          .then(att => {
            if(att && att.path){
              showClientScanPreview('id', att.path, att.name);
            }
          })
          .catch(e => console.log('Could not load attachment preview'));
      }
    }
  } else {
    if(titleEl) titleEl.textContent = 'New Client / عميل جديد';
  }

  let warn = document.getElementById('cl-duplicate-warn');
  if(warn) warn.style.display = 'none';

  openModal('modal-client');
}

async function saveClientModal(){
  if(!DB.clients) DB.clients = [];
  let firstname = (document.getElementById('cl-firstname').value||'').trim();
  let licence   = (document.getElementById('cl-licence').value||'').trim();
  let idcard    = (document.getElementById('cl-idcard').value||'').trim();

  if(!firstname){ toast('❌ Full name required'); return; }
  if(!idcard){ toast('❌ ID Card number required'); return; }
  if(!licence){ toast('❌ Licence number required'); return; }

  let dup = DB.clients.find(c => c.idcard === idcard && c.id !== editingClientId);
  if(dup){ toast('❌ Client with this ID already exists'); return; }

  let data = {
    firstname, licence, idcard,
    passport:     (document.getElementById('cl-passport').value||'').trim(),
    visa:         (document.getElementById('cl-visa').value||'').trim(),
    nationality:  (document.getElementById('cl-nationality').value||'').trim(),
    tel:          (document.getElementById('cl-tel').value||'').trim(),
    licenceExp:   document.getElementById('cl-licence-exp').value||'',
    idcardExp:    document.getElementById('cl-idcard-exp').value||'',
    passportExp:  document.getElementById('cl-passport-exp').value||'',
    visaExp:      document.getElementById('cl-visa-exp').value||'',
    // ✅ CHANGED: Store attachment IDs instead of base64
    scanId:       _clScanIdAttachmentId || null,
    scanLic:      _clScanLicAttachmentId || null,
    // FIX 01/08/2026 : timestamp d'édition explicite — permet au serveur de refuser
    // qu'un autosave silencieux (photo mémoire périmée d'un autre poste/branche)
    // écrase cette modification avec une version plus ancienne (voir bug "nom client
    // qui change tout seul" entre BARKA et MOEBELA).
    updatedAt:    Date.now(),
  };

  // Determine client ID for upload
  let clientId = editingClientId;
  if(!clientId){
    clientId = _genId();
  }

  // Show loading state
  let saveBtn = document.getElementById('save-client-btn');
  if(saveBtn){
    let originalText = saveBtn.textContent;
    saveBtn.textContent = '⏳ Uploading...';
    saveBtn.disabled = true;
  }

  // Upload scans to attachments folder
  let uploadedIds = await uploadClientScans(clientId, firstname, idcard);
  if(uploadedIds.scanId) data.scanId = uploadedIds.scanId;
  if(uploadedIds.scanLic) data.scanLic = uploadedIds.scanLic;

  // FIX: suppression réelle du scan côté serveur, déclenchée ICI et une
  // seule fois — uniquement si un scan existait à l'ouverture du modal ET
  // qu'aucun nouveau fichier n'a été uploadé pour le remplacer (data.scanId
  // vide). Évite la race condition de l'ancienne version (delete au clic +
  // upload en parallèle sur le même attachmentId → fichier neuf supprimé).
  if(_clScanIdOriginalAttachmentId && !data.scanId){
    try {
      await fetch('/api/delete-client-scan', {
        method: 'POST',
        headers: Object.assign({'Content-Type':'application/json'}, authHeaders()),
        body: JSON.stringify({ attachmentId: _clScanIdOriginalAttachmentId })
      });
    } catch(e){
      console.error('Delete client scan error:', e);
    }
  }

  if(editingClientId){
    let idx = DB.clients.findIndex(c => c.id === editingClientId);
    if(idx >= 0){
      let _old = {...DB.clients[idx]};
      DB.clients[idx] = Object.assign(DB.clients[idx], data);
      let _fieldLabels = {firstname:'Full Name', idcard:'ID Card', licence:'Licence', licenceExp:'Licence Exp', idcardExp:'ID Exp', passport:'Passport', passportExp:'Passport Exp', visa:'Visa', visaExp:'Visa Exp', nationality:'Nationality', tel:'Phone'};
      let _diffs = [];
      Object.keys(_fieldLabels).forEach(k => {
        let ov = String(_old[k]!==undefined&&_old[k]!==null&&_old[k]!==''?_old[k]:'—');
        let nv = String(data[k]!==undefined&&data[k]!==null&&data[k]!==''?data[k]:'—');
        if(ov !== nv) _diffs.push(_fieldLabels[k]+': ['+ov+'] → ['+nv+']');
      });
      let _detail = _diffs.length ? _diffs.join(' | ') : 'No modification detected';
      logAction('edit_client', '✏️ Clients — Edit: '+data.firstname+' (ID: '+data.idcard+')', _detail, data.firstname+' · '+data.idcard);
    }
    toast('✅ Client updated');
  } else {
    data.id = clientId; // déjà généré par _genId() avant l'upload du scan
    DB.clients.push(data);
    let _newDetail = 'ID: '+data.idcard+' | Licence: '+data.licence+(data.nationality?' | Nationality: '+data.nationality:'')+(data.tel?' | Tel: '+data.tel:'')+(data.passport?' | Passport: '+data.passport:'');
    logAction('new_client', '➕ Clients — New Client: '+data.firstname+' (ID: '+data.idcard+')', _newDetail, data.firstname+' · '+data.idcard);
    toast('✅ Client saved');
  }

  updateLogBadge();
  // saveOne: capturer l'ID AVANT closeModal (editingClientId est global, safe)
  let _clientToSave = editingClientId
    ? DB.clients.find(x => x.id === editingClientId)
    : DB.clients[DB.clients.length - 1];
  closeModal('modal-client');
  if(_clientToSave && _clientToSave.id !== undefined){
    saveClient(_clientToSave.id);
  } else {
    console.warn('saveClientModal: client not found, falling back to saveAll');
    saveAll();
  }
  renderClients();
  
  // Reset button state
  if(saveBtn){
    saveBtn.textContent = '💾 Save Client';
    saveBtn.disabled = false;
  }
}

// ── deleteClientPwd (orig. line 14135) ──
function deleteClientPwd(id){
  let c = (DB.clients||[]).find(x => x.id === id);
  if(!c) return;
  securePrompt('🔐 Enter password to delete client:').then(pw => {
    if(pw === null) return;
    checkPassword(pw, 'Delete Client — ' + c.firstname + ' (' + (c.idcard||'—') + ')').then(function(ok){
    if(!ok){
      toast('❌ Wrong password');
      return;
    }
    if(!confirm('🚨 Delete ' + c.firstname + ' PERMANENTLY? This cannot be undone!')) return;
    DB.clients = DB.clients.filter(x => x.id !== id);
    logAction('delete', '🗑️ Clients — Deleted Client: '+c.firstname+' (ID: '+(c.idcard||'—')+')', 'ID Card: '+(c.idcard||'—')+' | Licence: '+(c.licence||'—')+(c.tel?' | Tel: '+c.tel:'')+(c.nationality?' | Nationality: '+c.nationality:''), c.firstname+' · '+(c.idcard||'—'));
    updateLogBadge();
    deleteOne('clients', id);
    renderClients();
    toast('🗑 Client deleted permanently');
    }); // end checkPassword
  }); // end securePrompt
}

// ── deleteClient (orig. line 14154) ──
function deleteClient(id){
  let c = (DB.clients||[]).find(x => x.id === id);
  if(!c) return;
  if(!confirm('Delete client ' + c.firstname + '?')) return;
  DB.clients = DB.clients.filter(x => x.id !== id);
  logAction('delete', '🗑️ Clients — Deleted Client: '+c.firstname+' (ID: '+(c.idcard||'—')+')', 'ID Card: '+(c.idcard||'—')+' | Licence: '+(c.licence||'—')+(c.tel?' | Tel: '+c.tel:'')+(c.nationality?' | Nationality: '+c.nationality:''), c.firstname+' · '+(c.idcard||'—'));
  updateLogBadge();
  deleteOne('clients', id);
  renderClients();
  toast('🗑 Client deleted');
}

// ── toggleBlacklist (orig. line 14166) ──
function toggleBlacklist(id){
  let c = (DB.clients||[]).find(x => x.id === id);
  if(!c) return;

  if(c.blacklisted){
    // Remove from blacklist — simple confirmation
    if(!confirm('Remove ' + c.firstname + ' from Black List ?')) return;
    let idx = DB.clients.findIndex(x => x.id === id);
    if(idx < 0) return;
    DB.clients[idx].blacklisted = false;
    DB.clients[idx].blacklistReason = '';
    logAction('blacklist', '✅ Clients — Removed from Blacklist: '+c.firstname+' (ID: '+(c.idcard||'—')+')', 'Previous reason: '+(c.blacklistReason||'—'), c.firstname+' · '+(c.idcard||'—'));
    updateLogBadge();
    saveClient(id);
    renderClients();
    toast('✅ ' + c.firstname + ' removed from blacklist');
  } else {
    // Add to blacklist — ask for reason
    let reason = prompt('Reason (optional):', '') ;
    if(reason === null) return; // annulé
    let idx = DB.clients.findIndex(x => x.id === id);
    if(idx < 0) return;
    DB.clients[idx].blacklisted = true;
    DB.clients[idx].blacklistReason = reason.trim();
    logAction('blacklist', '🚫 Clients — Added to Blacklist: '+c.firstname+' (ID: '+(c.idcard||'—')+')', 'Reason: '+(reason.trim()||'No reason given')+' | Licence: '+(c.licence||'—'), c.firstname+' · '+(c.idcard||'—'));
    updateLogBadge();
    saveClient(id);
    renderClients();
    toast('🚫 ' + c.firstname + ' added to blacklist');
  }
}

// ── Scan handling ─────────────────────────────────────────────────
// Variables to store attachment IDs (instead of base64)
let _clScanIdAttachmentId = null;  // ID reference for ID Card scan
let _clScanLicAttachmentId = null; // ID reference for Licence scan
// Store the file objects temporarily for upload
let _clScanIdFile = null;
let _clScanLicFile = null;
// FIX: scan présent à l'ouverture du modal (pour détecter une suppression
// sans remplacement au moment du Save — voir openClientModal / saveClientModal)
let _clScanIdOriginalAttachmentId = null;

// ── MODIFIED: Handle Client Scan Upload ────────────────────────────────────
// One photo = both ID Card and Licence (combined scan). Whichever input
// triggers this, the same File is stored in both slots so a single upload
// produces a single attachmentId reused for scanId and scanLic.
// ── handleClientScan (orig. line 14210) ──
function handleClientScan(input, type){
  let file = input.files[0];
  if(!file) return;

  _clScanIdFile = file;
  _clScanLicFile = file;

  // Show preview locally using blob URL (no base64 conversion)
  let blobUrl = URL.createObjectURL(file);
  showClientScanPreview('id', blobUrl, file.name);
}

// ── MODIFIED: Show Client Scan Preview ────────────────────────────────────
// ── showClientScanPreview (orig. line 14223) ──
function showClientScanPreview(type, blobUrl, filename){
  let suffix = type === 'id' ? 'id' : 'lic';
  let ph = document.getElementById('cl-scan-'+suffix+'-placeholder');
  let img = document.getElementById('cl-scan-'+suffix+'-img');
  let btn = document.getElementById('cl-scan-'+suffix+'-clear');
  let printBtn = document.getElementById('cl-scan-'+suffix+'-print');
  
  if(ph) ph.style.display = 'none';
  if(img){ 
    img.src = blobUrl; 
    img.style.display = 'block'; 
  }
  if(btn) btn.style.display = 'inline-block';
  if(printBtn) printBtn.style.display = 'inline-block';
  
  // Store filename as data attribute for later use
  if(img) img.dataset.filename = filename;
}

// ── NEW: Print the client scan photo ────────────────────────────────────
// ── printClientScan (orig. line 14243) ──
function printClientScan(){
  let img = document.getElementById('cl-scan-id-img');
  if(!img || !img.src){ toast('❌ No photo to print'); return; }
  let win = window.open('', '_blank', 'width=700,height=800');
  win.document.write(`
    <html><head><title>Print Scan</title>
    <style>
      @media print { @page{ margin:0; } body{ margin:0; } }
      body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#fff}
      img{max-width:100%;max-height:100vh}
    </style>
    </head><body>
      <img src="${img.src}" onload="window.print();" alt="Client scan">
    </body></html>
  `);
  win.document.close();
}

// ── MODIFIED: Clear Client Scan ────────────────────────────────────
// ── clearClientScan (orig. line 14262) ──
// FIX (v2): la v1 appelait /api/delete-client-scan immédiatement au clic,
// en parallèle d'un éventuel nouvel upload juste après (même attachmentId
// pour les deux car il est déterministe par client) → race condition : le
// delete pouvait s'exécuter APRÈS l'upload et supprimer le fichier tout
// juste envoyé (404 constatés en prod). On revient à un clear 100% local ;
// la suppression réelle ne se déclenche qu'au Save, une seule fois, voir
// saveClientModal().
function clearClientScan(type){
  let suffix = type === 'id' ? 'id' : 'lic';

  // Combined scan: clearing either side clears both
  _clScanIdFile = null;
  _clScanLicFile = null;
  _clScanIdAttachmentId = null;
  _clScanLicAttachmentId = null;
  
  let ph = document.getElementById('cl-scan-'+suffix+'-placeholder');
  let img = document.getElementById('cl-scan-'+suffix+'-img');
  let btn = document.getElementById('cl-scan-'+suffix+'-clear');
  let printBtn = document.getElementById('cl-scan-'+suffix+'-print');
  let inp = document.getElementById('cl-scan-'+suffix+'-input');
  
  // Revoke blob URL if it exists
  if(img && img.src) URL.revokeObjectURL(img.src);
  
  if(ph) ph.style.display = '';
  if(img){ img.src = ''; img.style.display = 'none'; }
  if(btn) btn.style.display = 'none';
  if(printBtn) printBtn.style.display = 'none';
  if(inp) inp.value = '';
}

// ── NEW: Upload Client Scan (combined, single file) to Server ─────────────
async function uploadClientScans(clientId, firstname, idcard){
  let uploaded = {};

  // Only one upload happens: _clScanIdFile and _clScanLicFile always point
  // to the same File object (set together in handleClientScan), so a single
  // POST is enough — the resulting attachmentId is reused for both fields.
  let file = _clScanIdFile || _clScanLicFile;
  if(file){
    try {
      let formData = new FormData();
      formData.append('file', file);
      formData.append('clientId', clientId);
      formData.append('type', 'combined');
      formData.append('clientName', firstname);
      formData.append('idcard', idcard || '');

      let res = await fetch('/api/upload-client-scan', {
        method: 'POST',
        headers: authHeaders(),
        body: formData
      });

      if(!res.ok) throw new Error('Upload failed');
      let data = await res.json();
      // ✅ Same attachmentId used for both scanId and scanLic — one file, one upload
      uploaded.scanId = data.attachmentId;
      uploaded.scanLic = data.attachmentId;
    } catch(err){
      console.error('Scan upload error:', err);
      toast('⚠️ Scan upload failed, saved without scan');
    }
  }

  return uploaded;
}

// ── handleClientScan_old (orig. line 14323) ──
function handleClientScan_old(input, type){
  let file = input.files[0];
  if(!file) return;
  let reader = new FileReader();
  reader.onload = function(e){
    let b64 = e.target.result;
    if(type === 'id'){ 
      _clScanId = b64; 
      _clScanLic = b64;  // Same image for both ID and Licence
      showClientScanPreview('id', b64); 
    }
    else { 
      _clScanId = b64; 
      _clScanLic = b64;  // Same image for both
      showClientScanPreview('id', b64); 
    }
  };
  reader.readAsDataURL(file);
}

// ── Duplicate check while typing ──────────────────────────────────
// ── checkDuplicateClient (orig. line 14344) ──
function checkDuplicateClient(){
  let val = (document.getElementById('cl-idcard').value||'').trim();
  let warn = document.getElementById('cl-duplicate-warn');
  if(!warn) return;
  if(!val){ warn.style.display = 'none'; return; }
  let dup = (DB.clients||[]).find(c => c.idcard === val && c.id !== editingClientId);
  warn.style.display = dup ? 'block' : 'none';
}
// ── goTo hook patch (orig. line 14352) ──

// Inject goTo hook
const _origGT = window.goTo;
if(_origGT){
  window.goTo = function(page, btn){
    _origGT(page, btn);
    if(page === 'clients'){
      renderClients();
      // Update blacklist badge
      let blCount = (DB.clients||[]).filter(c => c.blacklisted === true).length;
      let badge = document.getElementById('blacklist-btn-count');
      if(badge) badge.textContent = blCount ? '🚫 ' + blCount : '🚫';
    }
  };
}

// ── showBlacklistModal (orig. line 14482) ──
// ── BLACKLIST MODAL ────────────────────────────────────────────────
function showBlacklistModal(){
  let list = (DB.clients||[]).filter(c => c.blacklisted === true);
  let el = document.getElementById('blacklist-modal-body');
  if(!el) return;

  if(list.length === 0){
    el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted)">🚫 No blacklisted clients</div>';
  } else {
    el.innerHTML = '<div style="display:flex;flex-direction:column;gap:10px">' +
      list.map(c => {
        // rentalCount cross-branch : réutilise le cache du dernier fetch renderClients.
        // Si le cache est absent (modal ouvert sans passer par la liste), fallback local.
        let _xm = window._clientCrossSummaries;
        let rentalCount = _xm && _xm.has(Number(c.id))
          ? _xm.get(Number(c.id)).rentalCount
          : (DB.rentals||[]).filter(r => r._clientId === c.id).length;
        return `<div style="display:flex;align-items:center;gap:12px;background:rgba(220,38,38,.06);border:1px solid rgba(220,38,38,.25);border-radius:10px;padding:12px 14px">
          <div style="width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,#991b1b,#dc2626);display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0">🚫</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:800;font-size:.9rem;color:#dc2626">${escapeHtml(c.firstname)||'—'}</div>
            <div style="font-size:.72rem;color:var(--muted);margin-top:2px">
              🪪 ${escapeHtml(c.idcard)||'—'} · 📜 ${escapeHtml(c.licence)||'—'} ${c.tel?' · 📞 '+escapeHtml(c.tel):''}
            </div>
            ${c.blacklistReason ? `<div style="font-size:.72rem;color:#dc2626;margin-top:3px;font-weight:600">⚠️ ${escapeHtml(c.blacklistReason)}</div>` : ''}
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0">
            <button class="btn btn-primary" data-client-action="view" data-client-id="${c.id}" style="padding:3px 10px;font-size:.7rem;background:linear-gradient(135deg,#4338ca,#6366f1);border:none" title="Profil">📊</button>
            <button data-client-action="remove-blacklist" data-client-id="${c.id}" style="background:rgba(22,163,74,.1);border:1px solid #16a34a;border-radius:6px;padding:3px 10px;cursor:pointer;font-size:.75rem;font-weight:700;color:#16a34a;font-family:var(--font)" title="Remove">✅ Remove</button>
          </div>
        </div>`;
      }).join('') + '</div>';
  }

  // Update count badge in button
  let badge = document.getElementById('blacklist-btn-count');
  if(badge) badge.textContent = list.length ? '🚫 ' + list.length : '🚫';

  openModal('modal-blacklist');
}

// ── Délégation d'événements (2026-08) — remplace les onclick= inline sur
// les boutons générés dynamiquement ci-dessus (cartes clients + modal
// blacklist). Comportement strictement identique.
document.addEventListener('click', function(e){
  let btn = e.target.closest('[data-client-action]');
  if(!btn) return;
  let id = Number(btn.dataset.clientId);
  let action = btn.dataset.clientAction;
  if(action === 'view') viewClientDetail(id);
  else if(action === 'edit') openClientModal(id);
  else if(action === 'toggle-blacklist') toggleBlacklist(id);
  else if(action === 'delete') deleteClientPwd(id);
  else if(action === 'remove-blacklist'){ closeModal('modal-blacklist'); toggleBlacklist(id); }
});

// ── viewClientDetail — historique complet cross-branch (2026-09) ──────────
// AVANT : filtrait DB.rentals (chargé au /load, filtré par branche)
//          → la session BARKA ne voyait pas les contrats MOEBELA et vice-versa
//          → stats fausses (total payé, BAL, voiture favorite, nb contrats)
// APRÈS  : appelle GET /api/client-history/:id qui lit TOUTE la table rentals
//          sans filtre de branche, mais uniquement pour ce clientId précis.
async function viewClientDetail(id){
  let c = (DB.clients||[]).find(x => x.id === id);
  if(!c) return;

  // Afficher le modal avec un spinner pendant le fetch
  let modalBody = document.getElementById('modal-client-profile-body');
  if(modalBody){
    modalBody.innerHTML = '<div style="text-align:center;padding:60px 20px;color:var(--muted)">'
      + '<div style="font-size:2rem;margin-bottom:12px">⏳</div>'
      + '<div style="font-size:.85rem">Loading full history…</div>'
      + '</div>';
  }
  openModal('modal-client-profile');

  let clientRentals, clientPayments;
  try {
    let resp = await fetch('/api/client-history/' + id, {
      headers: (typeof authHeaders === 'function') ? authHeaders() : {}
    });
    if(!resp.ok) throw new Error('HTTP ' + resp.status);
    let data = await resp.json();
    clientRentals  = data.rentals  || [];
    clientPayments = data.payments || [];
  } catch(e){
    // Fallback sur DB locale en cas d'erreur réseau
    console.warn('[viewClientDetail] Fallback DB locale:', e.message);
    clientRentals  = (DB.rentals  ||[]).filter(r => r._clientId === id);
    clientPayments = (DB.payments ||[]).filter(p => clientRentals.some(r => r.contract === p.contract));
  }

  // ── Calcul des statistiques ──────────────────────────────────────────────
  let today = new Date().toISOString().slice(0,10);

  function _calcBAL(r){
    if(r._balManual){
      return (r.bal !== undefined && r.bal !== null) ? Number(r.bal) : 0;
    }
    let b = (!r.dateIn || r.dateIn === '')
      ? (typeof calcOpenContractBAL === 'function' ? calcOpenContractBAL(r) : null)
      : (typeof calcRentalBAL       === 'function' ? calcRentalBAL(r)       : null);
    if(b === null) b = (r.bal !== undefined && r.bal !== null)
      ? Number(r.bal)
      : Number((r.price||0) - (r.paid||0));
    return Number(b);
  }

  let totalPaid = 0, totalBAL = 0, totalDays = 0, totalKM = 0;
  let vehicleCount = {};
  let lastRentalDate = '';
  let activeRental = null;

  clientRentals.forEach(r => {
    totalPaid += Number(r.paid||0);
    totalBAL  += _calcBAL(r);
    if(r.dateOut && r.dateIn && r.dateIn !== ''){
      let d1 = new Date(r.dateOut), d2 = new Date(r.dateIn);
      if(!isNaN(d1) && !isNaN(d2)) totalDays += Math.max(0, Math.round((d2-d1)/86400000));
    }
    if(r.kmOut && r.kmIn && r.kmIn > r.kmOut) totalKM += (r.kmIn - r.kmOut);
    let plate = r._plate || r.plate || '';
    if(plate) vehicleCount[plate] = (vehicleCount[plate]||0) + 1;
    if(r.dateOut && r.dateOut > lastRentalDate) lastRentalDate = r.dateOut;
    if(r.dateOut && (!r.dateIn || r.dateIn === '')) activeRental = r;
  });

  totalBAL  = Math.round(totalBAL  * 1000) / 1000;
  totalPaid = Math.round(totalPaid * 1000) / 1000;

  let favPlate = '', favName = '', favCount = 0;
  Object.keys(vehicleCount).forEach(plate => {
    if(vehicleCount[plate] > favCount){
      favCount = vehicleCount[plate];
      favPlate = plate;
      let v = (DB.vehicles||[]).find(x => x.plate === plate);
      favName = v ? (v.name||'') : '';
    }
  });

  let avgPerContract = clientRentals.length > 0
    ? Math.round((totalPaid / clientRentals.length) * 1000) / 1000
    : 0;

  let idExp  = c.idcardExp  ? (typeof fmtDate === 'function' ? fmtDate(c.idcardExp)  : c.idcardExp)  : '—';
  let licExp = c.licenceExp ? (typeof fmtDate === 'function' ? fmtDate(c.licenceExp) : c.licenceExp) : '—';
  let idExpired  = c.idcardExp  && c.idcardExp  < today;
  let licExpired = c.licenceExp && c.licenceExp < today;

  // Tri : contrats actifs (OUT) en premier, puis par dateOut décroissant
  let sortedRentals = clientRentals.slice().sort((a, b) => {
    let aActive = !a.dateIn || a.dateIn === '';
    let bActive = !b.dateIn || b.dateIn === '';
    if(aActive && !bActive) return -1;
    if(!aActive && bActive) return  1;
    return (b.dateOut||'') > (a.dateOut||'') ? 1 : -1;
  });

  // ── Génération HTML ───────────────────────────────────────────────────────
  let html = `
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
    <div style="background:linear-gradient(135deg,#1d4ed8,#3b82f6);border-radius:10px;padding:14px 16px;color:#fff">
      <div style="font-size:.6rem;font-weight:700;opacity:.75;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">👨‍👩‍👧‍👦 NAME</div>
      <div style="font-weight:900;font-size:1rem;line-height:1.3">${escapeHtml(c.firstname||'—')}</div>
      ${activeRental ? '<div style="display:inline-block;background:rgba(255,255,255,.2);border-radius:20px;padding:2px 10px;font-size:.65rem;font-weight:800;margin-top:6px">🚗 CURRENTLY OUT</div>' : ''}
    </div>
    <div style="background:linear-gradient(135deg,#166534,#16a34a);border-radius:10px;padding:14px 16px;color:#fff">
      <div style="font-size:.6rem;font-weight:700;opacity:.75;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">📞 TEL</div>
      <div style="font-weight:900;font-size:1.1rem">${escapeHtml(c.tel||'—')}</div>
      ${c.nationality ? '<div style="font-size:.72rem;opacity:.8;margin-top:3px">'+escapeHtml(c.nationality)+'</div>' : ''}
    </div>
    <div style="background:var(--s2);border:1px solid var(--border);border-radius:10px;padding:12px 14px">
      <div style="font-size:.6rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px">🪪 ID CARD</div>
      <div style="font-family:var(--mono);font-weight:800;font-size:.88rem">${escapeHtml(c.idcard||'—')}</div>
      <div style="font-size:.65rem;color:${idExpired?'#ef4444':'var(--muted)'};margin-top:2px">${idExpired?'⚠️ ':''}Exp: ${idExp}</div>
    </div>
    <div style="background:var(--s2);border:1px solid var(--border);border-radius:10px;padding:12px 14px">
      <div style="font-size:.6rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px">📜 LICENCE</div>
      <div style="font-family:var(--mono);font-weight:800;font-size:.88rem">${escapeHtml(c.licence||'—')}</div>
      <div style="font-size:.65rem;color:${licExpired?'#ef4444':'var(--muted)'};margin-top:2px">${licExpired?'⚠️ ':''}Exp: ${licExp}</div>
    </div>
  </div>

  <div style="background:var(--s2);border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:14px">
    <div style="font-size:.62rem;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px">📊 CLIENT STATISTICS</div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;text-align:center;margin-bottom:12px">
      <div>
        <div style="font-weight:900;font-size:1.4rem;color:var(--text)">${clientRentals.length}</div>
        <div style="font-size:.6rem;color:var(--muted);text-transform:uppercase;letter-spacing:.4px">CONTRACTS</div>
      </div>
      <div>
        <div style="font-weight:900;font-size:1.4rem;color:#16a34a">${Number(totalPaid).toFixed(3)}</div>
        <div style="font-size:.6rem;color:var(--muted);text-transform:uppercase;letter-spacing:.4px">OMR PAID</div>
      </div>
      <div>
        <div style="font-weight:900;font-size:1.4rem;color:${totalBAL > 0 ? '#d97706' : '#16a34a'}">${Number(totalBAL).toFixed(3)}</div>
        <div style="font-size:.6rem;color:var(--muted);text-transform:uppercase;letter-spacing:.4px">${totalBAL > 0 ? 'OMR BAL DUE' : 'BAL CLEAR'}</div>
      </div>
      <div>
        <div style="font-weight:900;font-size:1.4rem;color:#3b82f6">${totalDays}</div>
        <div style="font-size:.6rem;color:var(--muted);text-transform:uppercase;letter-spacing:.4px">DAYS RENTED</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:.78rem">
      <div style="color:var(--muted)">🚗 Favourite: <strong style="color:var(--text)">${favName ? favName+' ('+favPlate+')' : (favPlate||'—')}</strong></div>
      <div style="color:var(--muted)">📅 Last rental: <strong style="color:var(--text)">${lastRentalDate ? (typeof fmtDate==='function'?fmtDate(lastRentalDate):lastRentalDate) : '—'}</strong></div>
      <div style="color:var(--muted)">🛣 Total KM: <strong style="color:var(--text)">${totalKM > 0 ? Number(totalKM).toLocaleString()+' km' : '—'}</strong></div>
      <div style="color:var(--muted)">💰 Avg/contract: <strong style="color:var(--text)">${Number(avgPerContract).toFixed(3)} OMR</strong></div>
    </div>
  </div>

  <div style="background:var(--s2);border:1px solid var(--border);border-radius:10px;padding:14px 16px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <div style="font-size:.62rem;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">📋 CONTRACT HISTORY</div>
      <div style="font-size:.72rem;color:var(--muted)">${clientRentals.length} contract${clientRentals.length!==1?'s':''}</div>
    </div>
    ${sortedRentals.length === 0
      ? '<div style="text-align:center;padding:20px;color:var(--muted);font-size:.8rem">No contracts yet</div>'
      : `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:.76rem">
          <thead><tr style="border-bottom:2px solid var(--border)">
            <th style="text-align:left;padding:5px 8px;color:var(--muted);font-weight:700;font-size:.63rem;text-transform:uppercase">CONTRACT</th>
            <th style="text-align:left;padding:5px 8px;color:var(--muted);font-weight:700;font-size:.63rem;text-transform:uppercase">VEHICLE</th>
            <th style="text-align:left;padding:5px 8px;color:var(--muted);font-weight:700;font-size:.63rem;text-transform:uppercase">PERIOD</th>
            <th style="text-align:right;padding:5px 8px;color:var(--muted);font-weight:700;font-size:.63rem;text-transform:uppercase">PAID</th>
            <th style="text-align:right;padding:5px 8px;color:var(--muted);font-weight:700;font-size:.63rem;text-transform:uppercase">BAL</th>
            <th style="text-align:right;padding:5px 8px;color:var(--muted);font-weight:700;font-size:.63rem;text-transform:uppercase">KM</th>
            <th style="text-align:center;padding:5px 8px;color:var(--muted);font-weight:700;font-size:.63rem;text-transform:uppercase">STATUS</th>
          </tr></thead>
          <tbody>
            ${sortedRentals.map(r => {
              let isActive = !r.dateIn || r.dateIn === '';
              let bal = _calcBAL(r);
              let veh = (DB.vehicles||[]).find(x => x.id === r.vehicleId) || {};
              let plate = veh.plate || r._plate || r.plate || '—';
              let name  = veh.name  || r._name  || '';
              let kmDelta = (r.kmIn && r.kmOut && r.kmIn > r.kmOut) ? '+' + (r.kmIn - r.kmOut) + ' km' : '—';
              let dOut = r.dateOut ? (typeof fmtDate==='function'?fmtDate(r.dateOut):r.dateOut) : '—';
              let dIn  = r.dateIn  ? (typeof fmtDate==='function'?fmtDate(r.dateIn) :r.dateIn)  : '—';
              let branchBadge = r.branch
                ? `<span style="font-size:.55rem;background:var(--s3);border:1px solid var(--border);border-radius:4px;padding:1px 5px;color:var(--muted);margin-left:4px;vertical-align:middle">${r.branch}</span>`
                : '';
              return `<tr style="border-bottom:1px solid var(--border)">
                <td style="padding:7px 8px">
                  <span style="font-family:var(--mono);font-weight:700;color:#4338ca;font-size:.8rem">${escapeHtml(r.contract||'—')}</span>${branchBadge}
                </td>
                <td style="padding:7px 8px">
                  <div style="font-family:var(--mono);font-weight:700;font-size:.72rem;background:var(--s3);border:1px solid var(--border);border-radius:5px;padding:2px 7px;display:inline-block">${escapeHtml(plate)}</div>
                  ${name ? '<div style="font-size:.65rem;color:var(--muted);margin-top:2px">'+escapeHtml(name)+'</div>' : ''}
                </td>
                <td style="padding:7px 8px;color:var(--muted);font-size:.74rem">
                  ${dOut} → ${isActive ? '<span style="color:#d97706;font-weight:700">OUT</span>' : dIn}
                </td>
                <td style="padding:7px 8px;text-align:right;font-weight:700;color:#16a34a;font-family:var(--mono);font-size:.78rem">${Number(r.paid||0).toFixed(3)}</td>
                <td style="padding:7px 8px;text-align:right;font-family:var(--mono);font-size:.78rem">
                  ${bal > 0
                    ? '<span style="color:#d97706;font-weight:700">⚠️ BAL '+Number(bal).toFixed(3)+' OMR</span>'
                    : '<span style="color:#16a34a;font-weight:700">✅ Paid</span>'}
                </td>
                <td style="padding:7px 8px;text-align:right;color:var(--muted);font-size:.7rem">${kmDelta}</td>
                <td style="padding:7px 8px;text-align:center">
                  ${isActive
                    ? '<span style="background:rgba(217,119,6,.1);border:1px solid rgba(217,119,6,.4);color:#d97706;border-radius:6px;padding:2px 8px;font-size:.63rem;font-weight:700">🔓 OUT</span>'
                    : '<span style="background:rgba(22,163,74,.1);border:1px solid rgba(22,163,74,.3);color:#16a34a;border-radius:6px;padding:2px 8px;font-size:.63rem;font-weight:700">✅ Closed</span>'}
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table></div>`
    }
  </div>`;

  if(modalBody){
    modalBody.innerHTML = html;
  }
}

