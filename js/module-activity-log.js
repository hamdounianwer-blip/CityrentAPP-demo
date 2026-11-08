// ── Event delegation for data-actlog-action buttons ──
(function() {
  document.addEventListener('click', function(e) {
    const btn = e.target.closest('[data-actlog-action]');
    if (!btn) return;
    e.preventDefault();
    const action = btn.dataset.actlogAction;
    const type = btn.dataset.type;
    const delta = Number(btn.dataset.delta);
    if (action === 'filterType') {
      logFilter = type;
      logPage = 0;
      renderActivityLog();
    } else if (action === 'filterUser') {
      logUserFilter = btn.dataset.user;
      logPage = 0;
      renderActivityLog();
    } else if (action === 'changePage') {
      changeLogPage(delta);
    }
  });
})();

// ── _actorBadgeStyle — couleur/icône associée à un compte (directeur,
// barka_*, moebela_*, autre). Utilisée à la fois pour le badge affiché sur
// chaque ligne de log ET pour les chips du filtre "par compte" ci-dessous,
// pour ne pas dupliquer la logique de couleur à deux endroits. ──
function _actorBadgeStyle(username){
  let uLow = (username||'').toLowerCase();
  if(uLow === 'directeur') return { bg:'rgba(245,158,11,.15)', color:'#fbbf24', border:'rgba(245,158,11,.4)', icon:'👑' };
  if(uLow.includes('barka')) return { bg:'rgba(37,99,235,.15)', color:'#93c5fd', border:'rgba(37,99,235,.4)', icon:'🔵' };
  if(uLow.includes('moebela')||uLow.includes('moabela')) return { bg:'rgba(124,58,237,.15)', color:'#a78bfa', border:'rgba(124,58,237,.4)', icon:'🟣' };
  return { bg:'rgba(100,100,100,.15)', color:'var(--muted)', border:'rgba(100,100,100,.3)', icon:'👤' };
}

// ── renderActivityLog (orig. line 3509) ──
let logPage = 0;
const LOG_PAGE_SIZE = 50;
function renderActivityLog(){
  ensurePageLoaded('actlog');
  let container = document.getElementById('log-container');
  if(!container) return;
  // DB pas encore chargé — afficher un spinner au lieu d'une page blanche
  if(!DB || !DB.logs){
    container.innerHTML = '<div style="text-align:center;padding:48px;color:var(--muted)">⏳ '+translate('dash.loading')+'</div>';
    return;
  }
  let types = {new_rental:{icon:'🔑', color:'#4ade80', label:translate('actlog.type.new_rental')}, edit_rental:{icon:'✏️', color:'#60a5fa', label:translate('actlog.type.edit_rental')}, return:{icon:'🔄', color:'#a78bfa', label:translate('actlog.type.return')}, payment:{icon:'💰', color:'#fbbf24', label:translate('actlog.type.payment')}, new_vehicle:{icon:'🚗', color:'#34d399', label:translate('actlog.type.new_vehicle')}, edit_vehicle:{icon:'🔧', color:'#f97316', label:translate('actlog.type.edit_vehicle')}, delete:{icon:'🗑️', color:'#f87171', label:translate('actlog.type.delete')}, km_update:{icon:'📍', color:'#38bdf8', label:translate('actlog.type.km_update')}, bal_edit:{icon:'🔓', color:'#fb923c', label:translate('actlog.type.bal_edit')}, new_client:{icon:'👤', color:'#a3e635', label:translate('actlog.type.new_client')}, edit_client:{icon:'✏️', color:'#67e8f9', label:translate('actlog.type.edit_client')}, blacklist:{icon:'🚫', color:'#f43f5e', label:translate('actlog.type.blacklist')}, security:{icon:'🔐', color:'#eab308', label:translate('actlog.type.security')}, booking_confirmed:{icon:'✅', color:'#22c55e', label:translate('actlog.type.booking_confirmed')}, booking_converted:{icon:'🔑', color:'#06b6d4', label:translate('actlog.type.booking_converted')}, booking_cancelled:{icon:'❌', color:'#ef4444', label:translate('actlog.type.booking_cancelled')}};
  let filtered = DB.logs.filter(l => { if(logFilter !== 'all' && l.type !== logFilter) return false; if(logUserFilter !== 'all' && (l.user||'') !== logUserFilter) return false; if(logSearch){ let s = logSearch.toLowerCase(); if(!(l.label+l.detail+(l.ref||'')).toLowerCase().includes(s)) return false; } return true; });
  let allTypes = Object.keys(types);
  let chipHtml = `<button data-actlog-action="filterType" data-type="all" class="log-chip${logFilter==='all'?' log-chip-on':''}">${translate('actlog.all')} (${DB.logs.length})</button>`;
  allTypes.forEach(t => { let cnt = DB.logs.filter(l=>l.type===t).length; if(cnt===0) return; chipHtml += `<button data-actlog-action="filterType" data-type="${t}" class="log-chip${logFilter===t?' log-chip-on':''}" style="${logFilter===t?'border-color:'+types[t].color+';color:'+types[t].color:''}">${types[t].icon} ${types[t].label} (${cnt})</button>`; });
  // ── Filtre "par compte" — réservé au directeur (window.AUTH.isAdmin) :
  // chaque compte à part (barka_user, moebela_user, tout nouveau compte créé
  // depuis Gestion des utilisateurs...), ou "Tous" pour les voir ensemble
  // (comportement par défaut, logUserFilter==='all'). Compte les logs SANS
  // tenir compte du filtre par type actif, pour que les chiffres restent
  // stables quand on change juste le filtre type. ──
  if(window.AUTH && window.AUTH.isAdmin){
    let users = Array.from(new Set(DB.logs.map(l => l.user).filter(Boolean))).sort();
    if(users.length){
      chipHtml += `<span style="width:100%;height:0"></span><span style="font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);margin-right:4px">Compte :</span>`;
      chipHtml += `<button data-actlog-action="filterUser" data-user="all" class="log-chip${logUserFilter==='all'?' log-chip-on':''}">👥 ${translate('actlog.all')} (${DB.logs.length})</button>`;
      users.forEach(u => {
        let s = _actorBadgeStyle(u);
        let cnt = DB.logs.filter(l => l.user === u).length;
        chipHtml += `<button data-actlog-action="filterUser" data-user="${escapeHtml(u)}" class="log-chip${logUserFilter===u?' log-chip-on':''}" style="${logUserFilter===u?'border-color:'+s.border+';color:'+s.color:''}">${s.icon} ${escapeHtml(u)} (${cnt})</button>`;
      });
    }
  }
  document.getElementById('log-chips').innerHTML = chipHtml;
  if(!filtered.length){ container.innerHTML = `<div style="text-align:center;padding:48px;color:var(--muted);font-style:italic">${translate('actlog.empty1')}<br><small>${translate('actlog.empty2')}</small></div>`; return; }
  // ── Sort récent → ancien ──────────────────────────────────────
  filtered = filtered.slice().sort((a,b) => (b.ts||b.tsDisplay||"").localeCompare(a.ts||a.tsDisplay||""));
  // ── Pagination : 50 par page ──────────────────────────────────
  let totalPages = Math.max(1, Math.ceil(filtered.length / LOG_PAGE_SIZE));
  if(logPage < 0) logPage = 0;
  if(logPage > totalPages - 1) logPage = totalPages - 1;
  let pageStart = logPage * LOG_PAGE_SIZE;
  let pageItems = filtered.slice(pageStart, pageStart + LOG_PAGE_SIZE);
  let groups = {};
  pageItems.forEach(l => { let day = (l.ts || l.tsDisplay || '').slice(0,10); if(!day){ day = '0000-00-00'; } if(!groups[day]) groups[day]=[]; groups[day].push(l); });
  let html = '';
  Object.keys(groups).sort((a,b)=>b.localeCompare(a)).forEach(day => { let [y,m,d] = day.split('-'); let months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; html += `<div class="log-day-header">${d} ${months[Number(m)-1]} ${y}</div>`; groups[day].forEach(l => { let t = types[l.type] || {icon:'•', color:'var(--muted)', label:l.type}; let detailHtml = ''; if(l.detail){ if(l.detail.includes(' → ')){ let parts = l.detail.split(' | '); detailHtml = '<div style="display:flex;flex-direction:column;gap:3px;margin-top:4px">' + parts.map(p => { let hasDiff = p.includes(' → '); if(hasDiff){ let colonIdx = p.indexOf(':'); let fieldName = colonIdx > -1 ? p.slice(0,colonIdx).trim() : ''; let rest = colonIdx > -1 ? p.slice(colonIdx+1).trim() : p; let arrow = rest.indexOf(' → '); let oldVal = arrow > -1 ? rest.slice(1, arrow-1) : rest; let newVal = arrow > -1 ? rest.slice(arrow+4, rest.length-1) : ''; return '<div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap"><span style="font-size:.7rem;font-weight:700;color:var(--muted);min-width:90px;text-align:right;flex-shrink:0">'+escapeHtml(fieldName)+'</span><span style="font-family:IBM Plex Mono,monospace;font-size:.72rem;background:rgba(239,68,68,.12);color:#f87171;border-radius:4px;padding:1px 6px;text-decoration:line-through">'+escapeHtml(oldVal)+'</span><span style="font-size:.7rem;color:var(--dim)">→</span><span style="font-family:IBM Plex Mono,monospace;font-size:.72rem;background:rgba(34,197,94,.12);color:#4ade80;border-radius:4px;padding:1px 6px">'+escapeHtml(newVal)+'</span></div>'; } else { return '<span style="font-size:.75rem;color:var(--muted)">'+escapeHtml(p)+'</span>'; } }).join('') + '</div>'; } else { let parts = l.detail.split(' | '); detailHtml = '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">' + parts.map(p => '<span style="font-size:.72rem;background:var(--s3);color:var(--muted);border-radius:4px;padding:2px 7px;border:1px solid var(--border)">'+escapeHtml(p)+'</span>').join('') + '</div>'; } } let userActor = l.user || '';
      let userBadge = '';
      if(userActor){
        let s = _actorBadgeStyle(userActor);
        userBadge = `<span style="display:inline-flex;align-items:center;gap:3px;background:${s.bg};color:${s.color};border:1px solid ${s.border};border-radius:20px;padding:1px 8px;font-size:.65rem;font-weight:700;margin-top:4px;letter-spacing:.3px">${s.icon} ${escapeHtml(userActor)}</span>`;
      }
      html += `<div class="log-row"><div class="log-icon" style="background:${t.color}22;color:${t.color};border:1px solid ${t.color}44">${t.icon}</div><div class="log-body"><div class="log-label" style="font-size:.88rem">${escapeHtml(l.label)}</div>${detailHtml}${l.ref ? `<span class="log-ref" style="margin-top:4px">${escapeHtml(l.ref)}</span>` : ''}<br>${userBadge}</div><div class="log-time">${(l.tsDisplay || '00:00:00').slice(11)}<br><span style="font-size:.65rem;color:var(--dim)">${(l.tsDisplay || '0000-00-00').slice(0,10).split('-').reverse().join('/')}</span></div></div>`; }); });
  // ── Barre de pagination ──────────────────────────────────
  html += `<div class="log-pagination" style="display:flex;align-items:center;justify-content:center;gap:14px;padding:16px 0;margin-top:8px;border-top:1px solid var(--border)">
    <button data-actlog-action="changePage" data-delta="-1" ${logPage===0?'disabled':''} class="log-chip" style="${logPage===0?'opacity:.4;cursor:not-allowed':'cursor:pointer'}">${translate('actlog.prev')}</button>
    <span style="font-size:.8rem;color:var(--muted)">${translate('actlog.page')} ${logPage+1} / ${totalPages} &nbsp;(${filtered.length} ${translate('actlog.entries')})</span>
    <button data-actlog-action="changePage" data-delta="1" ${logPage>=totalPages-1?'disabled':''} class="log-chip" style="${logPage>=totalPages-1?'opacity:.4;cursor:not-allowed':'cursor:pointer'}">${translate('actlog.next')}</button>
  </div>`;
  container.innerHTML = html;
}

// ── changeLogPage : navigation pagination Activity Log ──
function changeLogPage(delta){
  logPage += delta;
  renderActivityLog();
  let container = document.getElementById('log-container');
  if(container) container.scrollIntoView({behavior:'smooth', block:'start'});
}

// ── clearLogsWithPassword (orig. line 5549) ──
function clearLogsWithPassword(){
  securePrompt('🔒 Password required to clear logs :').then(function(pwd){
    if(pwd === null) return;
    checkPassword(pwd, 'Activity Log — Clear all logs').then(function(ok){
    if(!ok){
      toast('❌ Wrong password!');
      return;
    }
    if(confirm('⚠️ Clear ALL ' + DB.logs.length + ' logs? This action is IRREVERSIBLE.\n\nClick OK to confirm.')){
      DB.logs = [];
      logsClearFlag = true; // demande explicite au serveur de vider vraiment la table logs
      renderActivityLog();
      updateLogBadge();
      saveAll();
      toast('🗑️ Logs cleared');
    }
    }); // end checkPassword
  }); // end securePrompt
}

