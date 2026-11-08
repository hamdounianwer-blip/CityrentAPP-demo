// ═══════════════════════════════════════════════════════════════════════════
// module-doc-alerts.js — Alertes ID / Licence client expirés  (EN + AR)
//
// Couvre :
//   1. Enregistrement client  : bandeau live sous les dates + confirmation au save
//   2. Liste clients          : (voir patch module-clients.js) bandeau + filtre « Docs »
//   3. Nouveau contrat        : bandeau dans le bloc Client + garde au save
//   4. Contrats ouverts       : badge rouge sur la carte (voiture sortie, sans Date In)
//   5. Dashboard / menu       : carte « Client Docs », badge sur « Clients », toast au démarrage
//
// Tous les textes viennent de I18N_DICT (clés docAlert.* dans i18n.js) → bascule EN/AR
// instantanée via toggleLanguage().
// À charger APRÈS module-clients.js et module-daily-rentals.js (fin de la liste).
// ═══════════════════════════════════════════════════════════════════════════
(function(){
'use strict';

var CFG = {
  SOON_DAYS:    30,         // « expire bientôt » = dans ≤ 30 jours
  RENTAL_GUARD: 'confirm',  // nouveau contrat + doc expiré : 'confirm' | 'password' | 'block'
  REFRESH_MS:   3 * 60 * 1000,
  STARTUP_TOAST: true
};

var state = { summaries: null, out: [], last: 0, busy: false, toasted: false };

// ── i18n helpers ───────────────────────────────────────────────────────────
function isAr(){ return window._currentLang === 'ar'; }
function tr(key){ return (typeof translate === 'function') ? translate(key) : key; }
function fs(key){                                   // translate + remplace %1% %2% %3%
  var s = tr(key);
  for(var i = 1; i < arguments.length; i++) s = s.split('%'+i+'%').join(arguments[i]);
  return s;
}
function nd(s){ return (isAr() && typeof toArabicDigits === 'function') ? toArabicDigits(s) : s; }  // popups natifs
function dirAttr(){ return isAr() ? ' dir="rtl"' : ''; }
function durTxt(n){                                  // « 1 day / يوم واحد », « 2 days / يومين », « 5 أيام », « 12 يومًا »
  n = Math.abs(n);
  if(n === 1) return tr('docAlert.dayOne');
  if(n === 2) return tr('docAlert.dayTwo');
  return fs(n <= 10 ? 'docAlert.daysFew' : 'docAlert.daysMany', n);
}
function docName(kind){ return tr(kind === 'id' ? 'docAlert.idCard' : 'docAlert.licence'); }

// ── Helpers généraux ───────────────────────────────────────────────────────
function p2(n){ return String(n).padStart(2,'0'); }
function todayStr(){ var d = new Date(); return d.getFullYear()+'-'+p2(d.getMonth()+1)+'-'+p2(d.getDate()); }
function daysTo(s){
  if(!s) return null;
  var b = new Date(String(s).slice(0,10)+'T00:00:00');
  if(isNaN(b.getTime())) return null;
  return Math.round((b - new Date(todayStr()+'T00:00:00')) / 86400000);
}
function fmt(s){ var x = String(s||'').slice(0,10).split('-'); return x.length===3 ? x[2]+'/'+x[1]+'/'+x[0] : '—'; }
function esc(s){
  if(typeof escapeHtml === 'function') return escapeHtml(s);
  return String(s==null?'':s).replace(/[&<>"']/g, function(m){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]; });
}
function el(id){ return document.getElementById(id); }
function val(id){ var e = el(id); return e ? (e.value||'').trim() : ''; }
function clients(){ return (typeof DB !== 'undefined' && DB && DB.clients) ? DB.clients : []; }
function clientById(id){ return clients().find(function(c){ return String(c.id) === String(id); }) || null; }
function isExpired(i){ return i.state === 'expired'; }

function evalDoc(kind, exp){                          // kind : 'id' | 'lic'
  var d = daysTo(exp);
  if(d === null) return { kind:kind, exp:'', days:null, state:'missing' };
  if(d < 0)      return { kind:kind, exp:exp, days:d, state:'expired' };
  if(d <= CFG.SOON_DAYS) return { kind:kind, exp:exp, days:d, state:'soon' };
  return { kind:kind, exp:exp, days:d, state:'ok' };
}
function issuesOf(c){
  if(!c) return [];
  return [ evalDoc('id', c.idcardExp), evalDoc('lic', c.licenceExp) ]
    .filter(function(i){ return i.state === 'expired' || i.state === 'soon'; });
}
function hasProblem(c){ return issuesOf(c).length > 0; }

function line(i){                                     // phrase longue (sans puce)
  var name = docName(i.kind);
  if(i.state === 'expired') return fs('docAlert.lineExpired', name, fmt(i.exp), fs('docAlert.ago', durTxt(i.days)));
  return fs('docAlert.lineSoon', name, i.days === 0 ? tr('docAlert.today') : fs('docAlert.inDur', durTxt(i.days)), fmt(i.exp));
}
function shortTxt(i){                                 // badge court
  var name = docName(i.kind).toUpperCase();
  if(i.state === 'expired') return fs('docAlert.shortExpired', name, fs('docAlert.shortD', -i.days));
  return i.days === 0 ? fs('docAlert.shortToday', name) : fs('docAlert.shortSoon', name, fs('docAlert.shortD', i.days));
}
var RED   = { c:'#dc2626', bg:'rgba(220,38,38,.10)',  bd:'rgba(220,38,38,.40)' };
var AMBER = { c:'#d97706', bg:'rgba(245,158,11,.10)', bd:'rgba(245,158,11,.45)' };

function wrap(name, make){
  var orig = window[name];
  if(typeof orig !== 'function' || orig.__daWrapped) return;
  var w = make(orig); w.__daWrapped = true; window[name] = w;
}

// ── Bandeau pour la carte de la liste clients (utilisé par module-clients.js) ──
function cardBanner(c, isOut){
  var is = issuesOf(c); if(!is.length) return '';
  var red = is.some(isExpired), k = red ? RED : AMBER;
  return '<div'+dirAttr()+' style="background:'+k.bg+';border:1.5px solid '+k.bd+';border-radius:7px;padding:5px 10px;margin-bottom:8px;'
    + 'font-size:.7rem;font-weight:800;color:'+k.c+'">'+(red?'⛔ ':'⏳ ')+esc(is.map(shortTxt).join(' · '))
    + (isOut && red ? ' '+esc(tr('docAlert.carOut')) : '')+'</div>';
}

// ═══ 1. FORMULAIRE CLIENT ═════════════════════════════════════════════════
function refreshClientForm(){
  var box = el('cl-doc-warn');
  if(!box){
    var anchor = el('cl-duplicate-warn'); if(!anchor) return;
    box = document.createElement('div'); box.id = 'cl-doc-warn'; box.style.cssText = 'display:none;margin-bottom:10px';
    anchor.parentNode.insertBefore(box, anchor);
  }
  box.dir = isAr() ? 'rtl' : 'ltr';
  var items = [ evalDoc('id', val('cl-idcard-exp')), evalDoc('lic', val('cl-licence-exp')) ];
  var html = '';
  items.forEach(function(i){
    var numberTyped = i.kind === 'id' ? val('cl-idcard') : val('cl-licence');
    if(i.state === 'expired' || i.state === 'soon'){
      var k = i.state === 'expired' ? RED : AMBER;
      html += '<div style="background:'+k.bg+';border:1.5px solid '+k.bd+';color:'+k.c+';border-radius:8px;padding:7px 12px;'
        + 'font-size:.78rem;font-weight:800;margin-bottom:6px">'+(i.state==='expired'?'⛔ ':'⏳ ')+esc(line(i))+'</div>';
    } else if(i.state === 'missing' && numberTyped){
      html += '<div style="background:'+AMBER.bg+';border:1.5px dashed '+AMBER.bd+';color:'+AMBER.c+';border-radius:8px;padding:6px 12px;'
        + 'font-size:.74rem;font-weight:700;margin-bottom:6px">⚠️ '+esc(fs('docAlert.expiryMissing', docName(i.kind)))+'</div>';
    }
  });
  box.innerHTML = html;
  box.style.display = html ? 'block' : 'none';
}
document.addEventListener('input',  function(e){ var id = e.target && e.target.id; if(id==='cl-licence-exp'||id==='cl-idcard-exp'||id==='cl-licence'||id==='cl-idcard') refreshClientForm(); });
document.addEventListener('change', function(e){ var id = e.target && e.target.id; if(id==='cl-licence-exp'||id==='cl-idcard-exp') refreshClientForm(); });

wrap('openClientModal', function(orig){ return function(){
  var r = orig.apply(this, arguments);
  try{ refreshClientForm(); }catch(e){ console.warn('[doc-alerts]', e); }
  return r;
};});

wrap('saveClientModal', function(orig){ return async function(){
  try{
    var bad = [ evalDoc('id', val('cl-idcard-exp')), evalDoc('lic', val('cl-licence-exp')) ].filter(isExpired);
    if(bad.length){
      var msg = tr('docAlert.expiredTitle')+'\n\n'+bad.map(function(i){ return '• '+line(i); }).join('\n')+'\n\n'+tr('docAlert.saveClientAnyway');
      if(!window.confirm(nd(msg))) return;
    }
  }catch(e){ console.warn('[doc-alerts]', e); }
  return orig.apply(this, arguments);
};});

// ═══ 3. NOUVEAU CONTRAT ═══════════════════════════════════════════════════
function rentalClient(){
  var c = window._currentRentalClientId ? clientById(window._currentRentalClientId) : null;
  if(!c){
    var v = val('r-client-id').toLowerCase();
    if(v) c = clients().find(function(x){ return (x.idcard||'').toLowerCase() === v; }) || null;
  }
  return c;
}
function refreshRentalBanner(){
  var status = el('r-client-status'); if(!status) return;
  var host = status.parentElement && status.parentElement.parentElement; if(!host) return;
  var box = el('r-doc-warn');
  if(!box){ box = document.createElement('div'); box.id = 'r-doc-warn'; box.style.cssText = 'display:none;margin-top:10px'; host.appendChild(box); }
  box.dir = isAr() ? 'rtl' : 'ltr';
  var c = rentalClient(), is = c ? issuesOf(c) : [];
  box.innerHTML = is.map(function(i){
    var k = i.state === 'expired' ? RED : AMBER;
    return '<div style="background:'+k.bg+';border:1.5px solid '+k.bd+';color:'+k.c+';border-radius:8px;padding:7px 12px;'
      + 'font-size:.78rem;font-weight:800;margin-bottom:5px">'+(i.state==='expired'?'⛔ ':'⏳ ')+esc(line(i))
      + (i.state==='expired' ? ' '+esc(tr('docAlert.renewBefore')) : '')+'</div>';
  }).join('');
  box.style.display = is.length ? 'block' : 'none';
}
function watchRentalStatus(){
  var status = el('r-client-status');
  if(!status){ return false; }
  new MutationObserver(function(){ try{ refreshRentalBanner(); }catch(e){} })
    .observe(status, { childList:true, characterData:true, subtree:true });
  return true;
}

async function askOverride(c, bad){
  var msg = fs('docAlert.expiredTitleClient', c.firstname || tr('docAlert.clientFallback'))+'\n\n'
          + bad.map(function(i){ return '• '+line(i); }).join('\n');
  if(CFG.RENTAL_GUARD === 'block'){ window.alert(nd(msg+'\n\n'+tr('docAlert.renewFirst'))); return false; }
  if(CFG.RENTAL_GUARD === 'password' && typeof securePrompt === 'function' && typeof checkPassword === 'function'){
    var pw = await securePrompt(nd(msg+'\n\n'+tr('docAlert.enterPassword')));
    if(pw === null) return false;
    var ok = await checkPassword(pw, 'New Rental — Expired client document ('+(c.firstname||'')+')');
    if(!ok){ if(typeof toast === 'function') toast(tr('docAlert.wrongPassword')); return false; }
    return true;
  }
  return window.confirm(nd(msg+'\n\n'+tr('docAlert.createAnyway')));
}
wrap('saveRentalModal', function(orig){ return async function(){
  try{
    var modal = el('modal-rental');
    var isNew = !(modal && modal.getAttribute('data-edit-id'));
    var stillOut = !val('r-in');
    var cancelled = el('r-cancelled-check') && el('r-cancelled-check').checked;
    var c = rentalClient();
    if(isNew && stillOut && !cancelled && c && !c.blacklisted){
      var bad = issuesOf(c).filter(isExpired);
      if(bad.length && !(await askOverride(c, bad))) return;
    }
  }catch(e){ console.warn('[doc-alerts]', e); }
  return orig.apply(this, arguments);
};});

// ═══ 4. CARTES « CONTRATS OUVERTS » ═══════════════════════════════════════
function decorateOpenCards(){
  var cards = document.querySelectorAll('.oc-card[id^="oc-row-"]');
  Array.prototype.forEach.call(cards, function(card){
    if(card.querySelector('.da-oc-badge')) return;
    var rid = card.id.replace('oc-row-','');
    var r = (DB.rentals||[]).find(function(x){ return String(x.id) === rid; });
    if(!r || r.dateIn) return;                       // uniquement voiture encore sortie
    var nm = card.querySelector('.oc-client-name[data-dr-id]');
    var c = clientById(r._clientId != null ? r._clientId : (nm ? nm.getAttribute('data-dr-id') : null));
    var is = issuesOf(c); if(!is.length) return;
    var red = is.some(isExpired), k = red ? RED : AMBER;
    var meta = card.querySelector('.oc-client-meta') || card.querySelector('.oc-client-row'); if(!meta) return;
    meta.insertAdjacentHTML('beforeend',
      '<span class="da-oc-badge"'+dirAttr()+' style="display:inline-block;margin-top:3px;background:'+k.c+';color:#fff;border-radius:20px;'
      + 'padding:2px 9px;font-size:.62rem;font-weight:800;white-space:nowrap" title="'+esc(is.map(line).join(' | '))+'">'
      + (red?'⛔ ':'⏳ ')+esc(is.map(shortTxt).join(' · '))+'</span>');
    if(red) card.style.boxShadow = 'inset 4px 0 0 '+RED.c;
  });
}
wrap('renderOpenContracts', function(orig){ return function(){
  var r = orig.apply(this, arguments);
  try{ decorateOpenCards(); }catch(e){ console.warn('[doc-alerts]', e); }
  return r;
};});

// ═══ 5. DASHBOARD / MENU / TOAST ══════════════════════════════════════════
function localSummaries(){
  var m = {};
  (DB.rentals||[]).forEach(function(r){
    if(r._clientId == null || !r.dateOut || r.dateIn) return;
    if(!m[r._clientId] || r.dateOut >= m[r._clientId].activeRental.dateOut){
      m[r._clientId] = { activeRental: { contract:r.contract, plate:r._plate||r.plate||'', dateOut:r.dateOut, branch:r.branch||'' } };
    }
  });
  return m;
}
function computeOut(){
  var m = state.summaries || {}, out = [];
  clients().forEach(function(c){
    var s = m[c.id] || m[String(c.id)], r = s && s.activeRental;
    if(!r) return;
    var is = issuesOf(c);
    if(is.length) out.push({ c:c, is:is, r:r });
  });
  out.sort(function(a,b){
    var ea = a.is.some(isExpired) ? 0 : 1, eb = b.is.some(isExpired) ? 0 : 1;
    if(ea !== eb) return ea - eb;
    return Math.min.apply(null, a.is.map(function(i){return i.days;})) - Math.min.apply(null, b.is.map(function(i){return i.days;}));
  });
  return out;
}
function nExpiredOut(){ return state.out.filter(function(x){ return x.is.some(isExpired); }).length; }

function ensureCard(){
  var panel = el('dash-alerts-panel'); if(!panel || el('dash-docs-card')) return;
  var card = document.createElement('div');
  card.id = 'dash-docs-card';
  card.className = 'alert-card alert-card-red dash-alert-btn';
  card.title = tr('docAlert.cardTitle');
  card.innerHTML =
    '<div class="alert-card-bg"></div>'
    + '<div class="alert-card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
    + '<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><line x1="6" y1="15" x2="10" y2="15"/></svg></div>'
    + '<div class="alert-card-body"><div class="alert-card-count" id="dash-docs-count">0</div>'
    + '<div class="alert-card-label" data-i18n="docAlert.cardLabel">'+esc(tr('docAlert.cardLabel'))+'</div>'
    + '<div class="alert-card-sub" id="dash-docs-sub">'+esc(tr('docAlert.cardSubDefault'))+'</div></div>'
    + '<div class="alert-card-bar"></div>';
  card.addEventListener('click', openPanel);
  panel.appendChild(card);
  paint();
}
function ensureNavBadge(){
  var nav = document.querySelector('[data-nav-page="clients"]'); if(!nav) return;
  var b = el('da-nav-badge');
  if(!b){
    b = document.createElement('span'); b.id = 'da-nav-badge';
    b.style.cssText = 'margin-inline-start:auto;background:#dc2626;color:#fff;border-radius:20px;padding:1px 7px;font-size:.62rem;font-weight:800;display:none';
    nav.appendChild(b);
  }
  b.title = tr('docAlert.navBadge');
  var n = nExpiredOut();
  b.textContent = n; b.style.display = n ? 'inline-block' : 'none';
}
function paint(){
  var n = state.out.length, ne = nExpiredOut();
  var card = el('dash-docs-card'); if(card) card.title = tr('docAlert.cardTitle');
  var c = el('dash-docs-count'); if(c) c.textContent = n;
  var s = el('dash-docs-sub');   if(s) s.textContent = n ? fs('docAlert.cardSub', ne, n - ne) : tr('docAlert.allValid');
  ensureNavBadge();
}

function openPanel(){
  var m = el('da-modal');
  if(!m){
    m = document.createElement('div'); m.className = 'overlay'; m.id = 'da-modal'; document.body.appendChild(m);
    m.addEventListener('click', function(e){
      if(e.target === m){ closeModal('da-modal'); return; }
      var b = e.target.closest('[data-da-act]'); if(!b) return;
      if(b.getAttribute('data-da-act') === 'close'){ closeModal('da-modal'); }
      else if(b.getAttribute('data-da-act') === 'profile'){
        closeModal('da-modal');
        if(typeof viewClientDetail === 'function') viewClientDetail(Number(b.getAttribute('data-da-id')));
      }
    });
  }
  var th = 'padding:6px 10px;text-align:start';
  var rows = state.out.map(function(x){
    var c = x.c, r = x.r, tel = String(c.tel||'').replace(/[^0-9]/g,'');
    var chips = x.is.map(function(i){
      var k = i.state === 'expired' ? RED : AMBER;
      return '<div style="display:inline-block;margin:0 4px 3px 0;background:'+k.c+';color:#fff;border-radius:20px;padding:2px 9px;font-size:.62rem;font-weight:800;white-space:nowrap">'
        + esc(shortTxt(i))+'</div>';
    }).join('');
    return '<tr style="border-top:1px solid var(--border)">'
      + '<td style="padding:9px 10px"><b>'+esc(c.firstname||'—')+'</b><div dir="ltr" style="font-family:var(--mono);font-size:.7rem;color:var(--muted);text-align:start">'+esc(c.idcard||'')+'</div></td>'
      + '<td style="padding:9px 10px">'+chips+'</td>'
      + '<td style="padding:9px 10px"><b>'+esc(r.plate||r._plate||'—')+'</b><div style="font-size:.7rem;color:var(--muted)">'+esc(r.contract||'')+(r.branch?' · '+esc(r.branch):'')+'</div></td>'
      + '<td style="padding:9px 10px;white-space:nowrap">'+fmt(r.dateOut)+'</td>'
      + '<td style="padding:9px 10px;white-space:nowrap">'
        + (tel ? '<a href="tel:'+esc(c.tel)+'" title="'+esc(tr('docAlert.call'))+'" style="text-decoration:none;font-size:1rem;margin-inline-end:6px">📞</a>'
               + '<a href="https://wa.me/'+tel+'" target="_blank" rel="noopener" title="'+esc(tr('docAlert.whatsapp'))+'" style="text-decoration:none;font-size:1rem;margin-inline-end:6px">💬</a>' : '')
        + '<button class="btn btn-primary" data-da-act="profile" data-da-id="'+esc(c.id)+'" style="padding:3px 10px;font-size:.7rem" title="'+esc(tr('docAlert.profile'))+'">📊</button>'
      + '</td></tr>';
  }).join('');
  m.innerHTML =
    '<div class="modal"'+dirAttr()+' style="max-width:860px;border-radius:16px;overflow:hidden">'
    + '<div style="background:linear-gradient(135deg,#7f1d1d,#dc2626);padding:16px 20px;display:flex;align-items:center;gap:10px">'
    +   '<div style="flex:1;font-size:1.05rem;font-weight:800;color:#fff">'+esc(tr('docAlert.modalTitle'))+' <span style="opacity:.8">('+state.out.length+')</span></div>'
    +   '<button class="modal-close" data-da-act="close" style="color:#fff;font-size:1.2rem">✕</button>'
    + '</div>'
    + '<div class="modal-body" style="padding:14px 18px;max-height:72vh;overflow:auto">'
    + (rows
        ? '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:.8rem"><thead><tr style="color:var(--muted);font-size:.62rem;text-transform:uppercase;letter-spacing:.6px">'
          + '<th style="'+th+'">'+esc(tr('docAlert.colClient'))+'</th><th style="'+th+'">'+esc(tr('docAlert.colProblem'))+'</th>'
          + '<th style="'+th+'">'+esc(tr('docAlert.colVehicle'))+'</th><th style="'+th+'">'+esc(tr('docAlert.colOutSince'))+'</th><th style="'+th+'"></th>'
          + '</tr></thead><tbody>'+rows+'</tbody></table></div>'
        : '<div style="text-align:center;padding:40px;color:var(--muted)">'+esc(tr('docAlert.emptyPanel'))+'</div>')
    + '</div></div>';
  openModal('da-modal');
}

function refresh(){
  if(state.busy) return Promise.resolve();
  state.busy = true; state.last = Date.now();
  return fetch('/api/client-summaries', { headers: (typeof authHeaders === 'function') ? authHeaders() : {} })
    .then(function(r){ return r.ok ? r.json() : Promise.reject('HTTP '+r.status); })
    .then(function(d){ state.summaries = d.summaries || {}; })
    .catch(function(){ state.summaries = localSummaries(); })
    .then(function(){
      try{
        state.out = computeOut(); paint();
        var ne = nExpiredOut();
        if(CFG.STARTUP_TOAST && !state.toasted && ne > 0 && typeof toast === 'function'){
          state.toasted = true;
          toast(fs('docAlert.toast', ne));
        }
      } finally { state.busy = false; }
    });
}
function tick(){
  try{
    ensureCard(); ensureNavBadge();
    if(!document.hidden && clients().length && (!state.last || Date.now() - state.last > CFG.REFRESH_MS)) refresh();
  }catch(e){ state.busy = false; console.warn('[doc-alerts]', e); }
}

// ═══ Changement de langue EN <-> AR ═══════════════════════════════════════
function onLangChange(){
  refreshClientForm();
  refreshRentalBanner();
  paint();
  Array.prototype.forEach.call(document.querySelectorAll('.da-oc-badge'), function(b){ b.remove(); });
  decorateOpenCards();
  var pg = document.querySelector('.page.active');
  if(pg && pg.id === 'page-clients' && typeof renderClients === 'function') renderClients();
  var m = el('da-modal'); if(m && m.classList.contains('show')) openPanel();
}
wrap('toggleLanguage', function(orig){ return function(){
  var r = orig.apply(this, arguments);
  try{ onLangChange(); }catch(e){ console.warn('[doc-alerts]', e); }
  return r;
};});

function init(){
  if(!watchRentalStatus()){ setTimeout(watchRentalStatus, 3000); }
  setInterval(tick, 3000);
  tick();
}
if(window.__modulesReady) init(); else window.addEventListener('cityrent:modules-ready', init, { once:true });

window.DocAlerts = {
  issuesOf: issuesOf, hasProblem: hasProblem, cardBanner: cardBanner,
  refresh: refresh, openPanel: openPanel, config: CFG
};

})();
