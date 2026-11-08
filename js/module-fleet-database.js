// ── deleteVehicle (orig. line 7999) ──
function deleteVehicle(id){ 
  let idx = DB.vehicles.findIndex(v => v.id === id); 
  if(idx === -1) return; 
  securePrompt(translate('fleet.deletePwdPrompt') + DB.vehicles[idx].name + ' (' + DB.vehicles[idx].plate + ')').then(password => {
    if(password === null) return;
    checkPassword(password, 'Delete Vehicle — ' + DB.vehicles[idx].name + ' (' + DB.vehicles[idx].plate + ')').then(function(ok){
    if(ok){
      let v = DB.vehicles[idx]; 
      logAction('delete', 'Vehicle Deleted', 'Name: '+v.name+' | Plate: '+v.plate+' | Mulkiya: '+(v.mulkiya||'—'), v.name+' · '+v.plate); 
      pushUndo(); 
      DB.vehicles.splice(idx, 1); 
      deleteOne('vehicles', id);
      refreshAll(); 
      showUndoToast(translate('fleet.deletedUndo')); 
    } else {
      toast(translate('fleet.wrongPassword'));
    }
    }); // end checkPassword
  }); // end securePrompt
}
// ── Dashboard Alerts — organized by category, English labels ──────────
// Each category feeds its own separate box on the Dashboard page.
// (Service & KM page no longer shows any alerts — see module-service-km.js)

// ── Dashboard continuous alert alarm ───────────────────────────────────
// Plays a repeating chime for as long as ANY alert exists (Oil Change,
// Mulkiya/Ministry, Customer Return Overdue, New Booking Requests).
// It does NOT stop on its own — only when the user clicks the Sound
// button to manually silence it. This guarantees the alert gets noticed.
window._dashAlarmPlaying = false;
window._dashAlarmManuallyStopped = false;
window._dashAlarmInterval = null;
window._dashAudioCtx = null;

// Browsers block audio until the user has interacted with the page at least
// once. This unlocks/resumes the AudioContext on the very first click/key
// press anywhere in the app, so the alarm is guaranteed to be able to play.
function _unlockDashAudio(){
  try {
    if(!window._dashAudioCtx) window._dashAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if(window._dashAudioCtx.state === 'suspended') window._dashAudioCtx.resume();
  } catch(e){}
}
document.addEventListener('click', _unlockDashAudio, {once:true});
document.addEventListener('keydown', _unlockDashAudio, {once:true});

function _playDashAlertChime(){
  try {
    if(!window._dashAudioCtx) window._dashAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    var ctx = window._dashAudioCtx;
    if(ctx.state === 'suspended') ctx.resume();
    [[880,0,.18],[880,.24,.18],[1046,.48,.28]].forEach(function(p){
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = p[0]; o.type = 'sine';
      g.gain.setValueAtTime(0, ctx.currentTime + p[1]);
      g.gain.linearRampToValueAtTime(.35, ctx.currentTime + p[1] + .02);
      g.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + p[1] + p[2]);
      o.start(ctx.currentTime + p[1]); o.stop(ctx.currentTime + p[1] + p[2] + .05);
    });
  } catch(e){}
}

function _updateDashAlarmBtn(){
  var btn = document.getElementById('dash-alarm-btn');
  if(!btn) return;
  var st = window._dashAlarmPlaying ? 'playing' : (window._dashAlarmManuallyStopped ? 'stopped' : 'idle');
  btn.className = 'btn-alarm btn-alarm-' + st;
  btn.removeAttribute('style');
  btn.innerHTML = dvIco(st === 'stopped' ? 'volx' : 'vol', 14) + '<span>' + (st === 'stopped' ? dv2T('soundOff') : dv2T('soundOn')) + '</span>';
}

function startDashAlarm(){
  window._dashAlarmPlaying = true;
  window._dashAlarmManuallyStopped = false;
  _playDashAlertChime();
  if(window._dashAlarmInterval) clearInterval(window._dashAlarmInterval);
  window._dashAlarmInterval = setInterval(function(){
    if(window._dashAlarmPlaying) _playDashAlertChime();
  }, 3000);
  _updateDashAlarmBtn();
}

function stopDashAlarm(manual){
  window._dashAlarmPlaying = false;
  if(manual) window._dashAlarmManuallyStopped = true;
  if(window._dashAlarmInterval){ clearInterval(window._dashAlarmInterval); window._dashAlarmInterval = null; }
  _updateDashAlarmBtn();
}

// Called by the 🔊 SOUND button — manual stop/restart
function toggleDashAlarm(){
  if(window._dashAlarmPlaying){
    stopDashAlarm(true);
  } else {
    window._dashAlarmManuallyStopped = false;
    startDashAlarm();
  }
}

// ── calculerAlertesMulkiya — Mulkiya expiring within 30 days ──
function calculerAlertesMulkiya(){
  let aujourdhui = new Date(); aujourdhui.setHours(0,0,0,0);
  let alertes = [];
  DB.vehicles.forEach(v => {
    if(!v.mulkiya) return;
    let exp = new Date(v.mulkiya);
    let diff = Math.round((exp - aujourdhui) / 86400000);
    if(diff <= 30) alertes.push({type:'mulkiya', vehicle:v, diff:diff, date:v.mulkiya});
  });
  return alertes.sort((a,b) => a.diff - b.diff);
}

// ── calculerAlertesMinistry — Ministry of Transport expiring within 30 days ──
function calculerAlertesMinistry(){
  let aujourdhui = new Date(); aujourdhui.setHours(0,0,0,0);
  let alertes = [];
  DB.vehicles.forEach(v => {
    if(!v.ministryExp) return;
    let exp = new Date(v.ministryExp);
    let diff = Math.round((exp - aujourdhui) / 86400000);
    if(diff <= 30) alertes.push({type:'ministry', vehicle:v, diff:diff, date:v.ministryExp});
  });
  return alertes.sort((a,b) => a.diff - b.diff);
}

// ── calculerAlertesOil — vehicles needing Oil/Gear service (≤1000 km left) ──
function calculerAlertesOil(){
  let alertes = [];
  // PERF (2026-09) : index construit UNE FOIS (O(historique)) au lieu de
  // rescanner tout l'historique à chaque véhicule (O(véhicules × historique))
  // — voir _buildKmIndex() dans module-service-km.js.
  let _kmIdx = (typeof _buildKmIndex === 'function') ? _buildKmIndex() : null;
  DB.vehicles.forEach(v => {
    if(!v.svcKm || v.svcKm <= 0) return;
    let effKm = getEffectiveKm(v, _kmIdx);
    if(effKm <= 0) return;
    let kmLeft = v.svcKm - effKm;
    if(kmLeft <= 1000) alertes.push({type:'oil', vehicle:v, kmLeft:kmLeft, effKm:effKm});
  });
  return alertes.sort((a,b) => a.kmLeft - b.kmLeft);
}

// ── calculerAlertesOverdueReturn — open rentals past their expected return date ──
function calculerAlertesOverdueReturn(){
  let today = new Date();
  return DB.rentals.filter(r => {
    if(r.dateIn && r.dateIn !== '') return false;
    if(!r.expectedReturn || r.expectedReturn === '') return false;
    let expD = new Date(r.expectedReturn); expD.setHours(23,59,59,999);
    return today > expD;
  }).sort((a,b) => new Date(a.expectedReturn) - new Date(b.expectedReturn));
}

// ── calculerAlertes — combined count of all categories (topbar / KPI use only) ──
// GPS alerts (offline / sans mouvement) viennent de window._gpsAlertsCache,
// rempli par refreshGpsAlerts() via GET /api/gps-alerts (table gps_status,
// indexée par IMEI + plaque — voir gps-alerts-lib.js). Aucune lecture ni
// écriture sur DB.vehicles ici, jamais de correspondance par id véhicule.
//
// getMatchedGpsAlerts() filtre/normalise ce cache brut en le recoupant avec
// DB.gpsLinks (module GPS Tracking) — UNIQUEMENT par plaque normalisée
// (_normPlate, comme getGpsLink()). Une alerte MadarTech dont la plaque ne
// correspond à aucune plaque suivie n'est jamais comptée ni affichée (device
// hors flotte / mal identifié côté MadarTech). Utilisée à la fois par le
// compteur (calculerAlertes) et l'affichage (renderGpsAlertsBox) pour que le
// badge "ALERTS" de la topbar corresponde exactement à ce qui est listé.
function getMatchedGpsAlerts(){
  let gpsAlerts = window._gpsAlertsCache || [];
  if(typeof _normPlate !== 'function' || !Array.isArray(DB.gpsLinks)) return gpsAlerts;
  let knownByPlate = {};
  DB.gpsLinks.forEach(g => { if(g.plate) knownByPlate[_normPlate(g.plate)] = g; });
  return gpsAlerts.reduce((acc, a) => {
    let match = knownByPlate[_normPlate(a.plate)];
    if(match) acc.push(Object.assign({}, a, { name: match.name || a.name, plate: match.plate || a.plate }));
    return acc;
  }, []);
}

function calculerAlertes(){
  let bookingAlerts = (DB.bookings||[]).filter(b => b.status === 'pending');
  let gpsAlerts = getMatchedGpsAlerts();
  return [].concat(
    calculerAlertesMulkiya(),
    calculerAlertesMinistry(),
    calculerAlertesOil(),
    calculerAlertesOverdueReturn(),
    bookingAlerts,
    gpsAlerts
  );
}
// ── getRealFleetAvailability — single source of truth for Out/Available ──
// Reuses the EXACT same detection as the Available Vehicles module
// (_availIsOut / _availIsBooked from module-available-vehicles.js):
//   OUT       = vehicle has an open rental (any branch, via DB.kmHistory)
//               OR an open internal movement (workshop/transfer)
//   AVAILABLE = NOT out AND NOT held by a pending/confirmed online booking
// This keeps the Dashboard, the topbar, and the Available Vehicles page
// always showing the same numbers.
function getRealFleetAvailability(){
  let list = DB.vehicles || [];
  let total = list.length;
  if(typeof _availIsOut !== 'function'){
    // Fallback (should not normally happen — module-available-vehicles.js
    // not loaded) : old, simpler rentals-only calculation.
    let out = DB.rentals.filter(r => !r.dateIn || r.dateIn === '').length;
    return { total, out, disponible: total - out, bookedHeld: 0 };
  }
  let outVehicles = list.filter(v => _availIsOut(v));
  let notOut = list.filter(v => !_availIsOut(v));
  let bookedHeld = (typeof _availIsBooked === 'function') ? notOut.filter(v => _availIsBooked(v)).length : 0;
  return { total, out: outVehicles.length, disponible: notOut.length - bookedHeld, bookedHeld };
}

// ── updateTopStats (orig. line 8342) ──
function updateTopStats(){ let av = getRealFleetAvailability(); document.getElementById('ts-total').innerHTML = av.total; document.getElementById('ts-out').innerHTML = av.out; document.getElementById('ts-alerts').innerHTML = calculerAlertes().length; }
// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD (2026-09) — design « City Rent Car · Modern Dashboard » :
// live bar, hero, KPI (anneau / barre / sparkline), 3 graphiques SVG (sans
// Chart.js), alertes en cartes dégradées, tableaux modernes, feed d'activité.
// Textes EN/AR embarqués ici (data-dv2 dans le template) : pas de dépendance
// à js/i18n.js pour les nouvelles chaînes.
// ═══════════════════════════════════════════════════════════════════════════
var DV2_I18N = {
  en: {
    live:'LIVE SYNC',
    lastUpd: function(s){ return 'Last update: ' + (s < 60 ? s + ' second' + (s === 1 ? '' : 's') : s < 3600 ? Math.floor(s/60) + ' min' : Math.floor(s/3600) + ' h') + ' ago'; },
    brBarka:'Barka Branch', brMoebela:'Moebela Branch', brOnline:'Online',
    title:'Dashboard', overview: function(){ return 'Overview · Démo'; }, export:'Export',
    kFleet:'Total Fleet', kOut:'Out Today', kAvail:'Available', kCollected:'Collected · OMR', kExpenses:'Expenses · OMR', kAlerts:'Alerts',
    utilization:'Utilization', dHigh:'High demand', dMid:'Moderate demand', dLow:'Low demand',
    availWord:'Available', fleetCap:'Fleet capacity', ofFleet:'of fleet', readyRent:'Ready to rent',
    urgent:'Urgent', needsAttn:'Needs attention', allClear:'All clear', ok:'OK',
    oilW:'Oil', retW:'Returns', docW:'Docs', bookW:'Booking', gpsW:'GPS',
    cFleet:'Fleet Utilization', cFleetSub:'Live status breakdown', total:'Total',
    lgOut:'Out', lgAvail:'Available', lgBooked:'Booked',
    cRev:'Revenue vs Expenses', cRevSub:'Last 6 months trend', mom:'MoM', lgRev:'Collected', lgExp:'Expenses', lgRevenue:'Revenue',
    cAlerts:'Alerts Distribution', cAlertsSub:'By category', active:'Active',
    lgOil:'Oil', lgReturn:'Return', lgDocs:'Docs', lgBooking:'Booking', lgGps:'GPS',
    vehiclesW:'vehicles', alertsW:'alerts',
    alertsTitle:'Alerts & Notifications', soundOn:'Sound On', soundOff:'Sound Off',
    alOil:'Oil Change', alOilSub:'Due for oil change', alDoc:'Mulkiya & Ministry', alDocSub:'Documents expiring',
    alOver:'Return Overdue', alOverSub:'Customers late', alBook:'New Bookings', alBookSub:'Pending approval',
    alGps:'GPS Offline', alGpsSub:'No movement signal',
    tOut:'Vehicles Out', tWork:'Workshop', viewAll:'View All →',
    colVehicle:'Vehicle', colCustomer:'Customer', colContract:'Contract', colSince:'Since', colBalance:'Balance',
    colStatus:'Status', colLocation:'Location', colDriver:'Driver',
    stActive:'Active', stOverdue:'Overdue', stWorkshop:'In workshop',
    feedTitle:"Today's Activity", feedSub:'Live feed', fAll:'All', fOut:'Out', fRet:'Returns', fPay:'Payments', noFeed:'No activity today',
    fdRentedOut:'rented out', fdReturned:'returned', fdSentTo:'sent to', fdCheckedIn:'checked in', fdPayment:'Payment received',
    fdFrom:'from', fdOverdue:'Return overdue', fdCustomer:'Customer', fdDriver:'Driver', fdContract:'Contract',
    fdInternal:'Internal movement', fdAuto:'Auto-flagged',
    fdDaysLate: function(n){ return n <= 0 ? 'due today' : n + ' day' + (n > 1 ? 's' : '') + ' late'; },
    fdVehiclesWord: function(n){ return n + ' vehicle' + (n > 1 ? 's' : ''); },
    fdGpsLostRest:'detected with GPS signal lost'
  },
  ar: {
    live:'مزامنة مباشرة',
    lastUpd: function(s){ return 'آخر تحديث: منذ ' + (s < 60 ? s + ' ثانية' : s < 3600 ? Math.floor(s/60) + ' دقيقة' : Math.floor(s/3600) + ' ساعة'); },
    brBarka:'فرع بركاء', brMoebela:'فرع المعبيلة', brOnline:'أونلاين',
    title:'لوحة القيادة', overview: function(){ return 'نظرة عامة · بركاء والمعبيلة'; }, export:'تصدير',
    kFleet:'إجمالي الأسطول', kOut:'خارج اليوم', kAvail:'متاح', kCollected:'المحصّل · ر.ع', kExpenses:'المصروفات · ر.ع', kAlerts:'التنبيهات',
    utilization:'الاستخدام', dHigh:'طلب مرتفع', dMid:'طلب متوسط', dLow:'طلب منخفض',
    availWord:'متاح', fleetCap:'سعة الأسطول', ofFleet:'من الأسطول', readyRent:'جاهز للتأجير',
    urgent:'عاجل', needsAttn:'يحتاج انتباه', allClear:'لا توجد تنبيهات', ok:'سليم',
    oilW:'زيت', retW:'إرجاع', docW:'وثائق', bookW:'حجز', gpsW:'GPS',
    cFleet:'استخدام الأسطول', cFleetSub:'توزيع الحالات مباشرة', total:'الإجمالي',
    lgOut:'خارج', lgAvail:'متاح', lgBooked:'محجوز',
    cRev:'الإيرادات مقابل المصروفات', cRevSub:'اتجاه آخر 6 أشهر', mom:'شهريًا', lgRev:'المحصّل', lgExp:'المصروفات', lgRevenue:'الإيرادات',
    cAlerts:'توزيع التنبيهات', cAlertsSub:'حسب الفئة', active:'نشط',
    lgOil:'زيت', lgReturn:'إرجاع', lgDocs:'وثائق', lgBooking:'حجز', lgGps:'GPS',
    vehiclesW:'مركبة', alertsW:'تنبيه',
    alertsTitle:'التنبيهات والإشعارات', soundOn:'الصوت مفعّل', soundOff:'الصوت متوقف',
    alOil:'تغيير الزيت', alOilSub:'موعد تغيير الزيت', alDoc:'الملكية ووزارة النقل', alDocSub:'وثائق قاربت على الانتهاء',
    alOver:'تأخر الإرجاع', alOverSub:'عملاء متأخرون', alBook:'حجوزات جديدة', alBookSub:'بانتظار الموافقة',
    alGps:'GPS غير متصل', alGpsSub:'لا توجد إشارة حركة',
    tOut:'المركبات الخارجة', tWork:'الورشة', viewAll:'عرض الكل ←',
    colVehicle:'المركبة', colCustomer:'العميل', colContract:'العقد', colSince:'منذ', colBalance:'الرصيد',
    colStatus:'الحالة', colLocation:'الموقع', colDriver:'السائق',
    stActive:'نشط', stOverdue:'متأخر', stWorkshop:'في الورشة',
    feedTitle:'نشاط اليوم', feedSub:'مباشر', fAll:'الكل', fOut:'خروج', fRet:'إرجاع', fPay:'دفعات', noFeed:'لا يوجد نشاط اليوم',
    fdRentedOut:'تم تأجيرها', fdReturned:'تم إرجاعها', fdSentTo:'أُرسلت إلى', fdCheckedIn:'تم استلامها', fdPayment:'دفعة مستلمة',
    fdFrom:'من', fdOverdue:'تأخر الإرجاع', fdCustomer:'العميل', fdDriver:'السائق', fdContract:'العقد',
    fdInternal:'حركة داخلية', fdAuto:'تنبيه تلقائي',
    fdDaysLate: function(n){ return n <= 0 ? 'مستحق اليوم' : n + ' يوم تأخير'; },
    fdVehiclesWord: function(n){ return n + ' مركبة'; },
    fdGpsLostRest:'فقدت إشارة GPS'
  }
};

function dv2Lang(){
  var sb = document.querySelector('.sidebar');
  if(sb && sb.getAttribute('dir') === 'rtl') return 'ar';
  return document.documentElement.getAttribute('lang') === 'ar' ? 'ar' : 'en';
}
function dv2T(key, arg){
  var d = DV2_I18N[dv2Lang()] || DV2_I18N.en;
  var v = (d[key] !== undefined) ? d[key] : DV2_I18N.en[key];
  if(v === undefined) return key;
  return (typeof v === 'function') ? v(arg) : v;
}
function dv2ApplyText(root){
  var pg = document.getElementById('page-dashboard');
  if(pg) pg.classList.toggle('dv-ar', dv2Lang() === 'ar');
  (root || document).querySelectorAll('[data-dv2]').forEach(function(el){
    el.textContent = dv2T(el.getAttribute('data-dv2'));
  });
}

// ── Langue EN/AR : re-rendu du dashboard quand dir="rtl" bascule sur .sidebar ──
(function(){
  if(window._dv2LangHooked) return;
  var sb = document.querySelector('.sidebar');
  if(!sb) return;
  window._dv2LangHooked = true;
  new MutationObserver(function(){
    var pg = document.getElementById('page-dashboard');
    if(pg && pg.classList.contains('show') && document.getElementById('dash-stats')) buildDashboard();
  }).observe(sb, { attributes: true, attributeFilter: ['dir'] });
})();

// ── Icônes SVG (mêmes tracés que la référence) ──
var DV_ICO = {
  car:'<path d="M5 17h14M5 17a2 2 0 1 1-2-2M5 17V9l2-5h10l2 5v8M19 17a2 2 0 1 0 2-2M9 9V5h6v4"/>',
  carS:'<path d="M5 17h14M5 17a2 2 0 1 1-2-2M5 17V9l2-5h10l2 5v8"/>',
  wheel:'<circle cx="7.5" cy="15.5" r="5.5"/><circle cx="17.5" cy="15.5" r="4.5"/><path d="M11.5 5h5l3 5v6"/>',
  check:'<polyline points="20 6 9 17 4 12"/>',
  dollar:'<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  card:'<rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>',
  warn:'<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  up:'<polyline points="18 15 12 9 6 15"/>',
  down:'<polyline points="6 9 12 15 18 9"/>',
  drop:'<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>',
  file:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
  clock:'<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  mail:'<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>',
  gps:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M4.93 19.07l2.12-2.12M16.95 7.05l2.12-2.12"/>',
  gpsS:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  pin:'<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  vol:'<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>',
  volx:'<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>'
};
function dvIco(name, size, sw){
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (sw || 2) + '" stroke-linecap="round" stroke-linejoin="round"' + (size ? ' width="' + size + '" height="' + size + '"' : '') + '>' + (DV_ICO[name] || '') + '</svg>';
}

// ── Info-bulle (même rendu que les tooltips Chart.js de la référence) ──
(function(){
  if(window._dvTipInit) return;
  window._dvTipInit = true;
  var tip = null;
  function el(){ if(!tip){ tip = document.createElement('div'); tip.id = 'dv-tip'; document.body.appendChild(tip); } return tip; }
  function fill(t){
    var tt = t.getAttribute('data-tt') || '', tb = t.getAttribute('data-tb') || '';
    var h = tt ? '<div class="dv-tip-t">' + escapeHtml(tt) + '</div>' : '';
    tb.split('¦').forEach(function(l){
      var i = l.indexOf('|'); if(i < 0) return;
      h += '<div class="dv-tip-r"><i style="background:' + escapeHtml(l.slice(0, i)) + '"></i><span>' + escapeHtml(l.slice(i + 1)) + '</span></div>';
    });
    el().innerHTML = h;
  }
  function place(e){
    var t = el(), w = t.offsetWidth, h = t.offsetHeight, x = e.clientX + 14, y = e.clientY + 14;
    if(x + w > window.innerWidth - 8) x = e.clientX - w - 14;
    if(y + h > window.innerHeight - 8) y = e.clientY - h - 14;
    t.style.transform = 'translate(' + Math.max(4, x) + 'px,' + Math.max(4, y) + 'px)';
  }
  window.dv2HideTip = function(){ if(tip) tip.classList.remove('on'); };
  document.addEventListener('mouseover', function(e){
    var t = e.target.closest && e.target.closest('#page-dashboard [data-tb]');
    if(!t) return;
    fill(t); el().classList.add('on'); place(e);
  });
  document.addEventListener('mousemove', function(e){
    if(tip && tip.classList.contains('on')) place(e);
  });
  document.addEventListener('mouseout', function(e){
    var t = e.target.closest && e.target.closest('#page-dashboard [data-tb]');
    if(t && !(e.relatedTarget && t.contains(e.relatedTarget))) window.dv2HideTip();
  });
  window.addEventListener('scroll', window.dv2HideTip, true);
})();

function dv2RenderHeader(){
  // En-tête .mod-hero : sous-titre + badge du mois en cours (comme le badge "101 vehicles" de Fleet)
  var el = document.getElementById('dash-subtitle');
  if(el) el.textContent = dv2T('overview');
  var mb = document.getElementById('dash-month-badge');
  if(mb){
    var m = '';
    try { m = new Date().toLocaleDateString(dv2Lang() === 'ar' ? 'ar-u-nu-latn' : 'en-US', { month:'long', year:'numeric' }); } catch(e){}
    mb.textContent = m;
    mb.style.display = m ? '' : 'none';
  }
}

// ── Helpers données ──
function dv2MonthKey(off){
  var n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + off, 1)).toISOString().slice(0,7);
}
function dv2MonthLabel(key){
  try { return new Date(key + '-01T00:00:00Z').toLocaleDateString(dv2Lang() === 'ar' ? 'ar-u-nu-latn' : 'en-US', { month:'short', timeZone:'UTC' }); }
  catch(e){ return key.slice(5); }
}
// 6 derniers mois — mêmes formules que les KPI (payments.price par dateOut / depence.amount par date)
function dv2Series(){
  var keys = [], i;
  for(i = -5; i <= 0; i++) keys.push(dv2MonthKey(i));
  var rev = keys.map(function(){ return 0; }), exp = rev.slice();
  (DB.payments || []).forEach(function(p){
    var ix = keys.indexOf(p.dateOut ? String(p.dateOut).slice(0,7) : '');
    if(ix >= 0) rev[ix] += Number(p.price) || 0;
  });
  (DB.depence || []).forEach(function(e){
    var ix = keys.indexOf(String(e.date || '').slice(0,7));
    if(ix >= 0) exp[ix] += parseFloat(e.amount) || 0;
  });
  return { keys: keys, rev: rev, exp: exp };
}
// Variation nette des locations ouvertes depuis minuit (ouvertes aujourd'hui − clôturées aujourd'hui)
function dv2NetOutToday(){
  var today = new Date().toISOString().slice(0,10), o = 0, c = 0;
  (DB.rentals || []).forEach(function(r){
    if(r.dateOut && String(r.dateOut).indexOf(today) === 0) o++;
    if(r.dateIn && String(r.dateIn).indexOf(today) === 0) c++;
  });
  return o - c;
}
function dv2AlertCounts(){
  return {
    oil:  calculerAlertesOil().length,
    ret:  calculerAlertesOverdueReturn().length,
    doc:  calculerAlertesMulkiya().length + calculerAlertesMinistry().length,
    book: (DB.bookings || []).filter(function(b){ return b.status === 'pending'; }).length,
    gps:  getMatchedGpsAlerts().length
  };
}
function dv2VehLabel(name, plate){
  name = String(name || '').trim(); plate = String(plate || '').trim();
  if(name && plate.toUpperCase().indexOf(name.toUpperCase()) === 0 && plate.length > name.length) plate = plate.slice(name.length).trim();
  return (name + (plate ? ' ' + plate : '')).trim() || '—';
}
function dv2RentalVeh(r){
  var v = r.vehicleId ? ((DB.vehicles || []).find(function(x){ return x.id === r.vehicleId; }) || {}) : {};
  var plate = v.plate || r._plate || '';
  var name = v.name || r._name || (typeof getVehicleNameByPlate === 'function' ? getVehicleNameByPlate(plate) : '') || '';
  return dv2VehLabel(name, plate);
}
function dv2RentalCustomer(r){
  var c = r._clientId ? ((DB.clients || []).find(function(x){ return x.id === r._clientId; }) || null) : null;
  return r._clientName || (c ? c.firstname : '') || '';
}

// ── Pastille de statut (tableaux) ──
function dv2Pill(kind){
  var map = { active:['orange','●','stActive'], overdue:['red','●','stOverdue'], workshop:['amber','🔧','stWorkshop'] };
  var m = map[kind] || map.active;
  return '<span class="status-pill status-pill-' + m[0] + '">' + m[1] + ' ' + dv2T(m[2]) + '</span>';
}

// ── KPI ──
function dv2Delta(n, inverse, suffix){
  if(n === null || n === undefined || isNaN(n)) return '';
  var good = inverse ? n < 0 : n > 0;
  var cls = n === 0 ? 'flat' : (good ? 'up' : 'down');
  return '<span class="kpi-trend ' + cls + '">' + (n === 0 ? '' : dvIco(n > 0 ? 'up' : 'down', 10, 3)) + (n > 0 ? '+' : '') + n + (suffix || '') + '</span>';
}
function dv2Meta(a, b, warn){
  return '<div class="kpi-meta"><div class="kpi-meta-label">' + a + '</div><div class="kpi-meta-sub' + (warn ? ' kpi-meta-warn' : '') + '">' + b + '</div></div>';
}
function dv2Ring(p){
  p = Math.max(0, Math.min(100, p));
  return '<div class="kpi-ring-wrap"><svg class="kpi-ring" viewBox="0 0 36 36"><circle class="ring-bg" cx="18" cy="18" r="15.9" fill="none" stroke-width="3"/>' +
    '<circle class="ring-fg" cx="18" cy="18" r="15.9" fill="none" stroke-width="3" stroke-dasharray="' + p + ', 100" stroke-linecap="round"/></svg>' +
    '<div class="kpi-ring-text">' + p + '%</div></div>';
}
function dv2Bar(p, grad){
  p = Math.max(0, Math.min(100, p));
  return '<div class="kpi-bar-wrap"><div class="kpi-bar"><div class="kpi-bar-fill" style="width:' + p + '%;background:' + grad + '"></div></div><div class="kpi-bar-num">' + p + '%</div></div>';
}
// Courbe lissée (même algorithme « tension 0.4 » que Chart.js)
function dvSpline(p, t){
  var n = p.length, cp = [], i, H = 32;
  var cl = function(y){ return Math.max(0, Math.min(H, y)).toFixed(2); };
  for(i = 0; i < n; i++){
    var p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1] || p[i];
    var d01 = Math.sqrt(Math.pow(p1.x - p0.x, 2) + Math.pow(p1.y - p0.y, 2));
    var d12 = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
    var s = d01 + d12, s01 = s ? d01 / s : 0, s12 = s ? d12 / s : 0;
    cp.push({
      pre:  { x: p1.x - t * s01 * (p2.x - p0.x), y: p1.y - t * s01 * (p2.y - p0.y) },
      next: { x: p1.x + t * s12 * (p2.x - p0.x), y: p1.y + t * s12 * (p2.y - p0.y) }
    });
  }
  var d = 'M' + p[0].x.toFixed(2) + ' ' + p[0].y.toFixed(2);
  for(i = 0; i < n - 1; i++){
    d += ' C' + cp[i].next.x.toFixed(2) + ' ' + cl(cp[i].next.y) + ' ' + cp[i + 1].pre.x.toFixed(2) + ' ' + cl(cp[i + 1].pre.y) + ' ' + p[i + 1].x.toFixed(2) + ' ' + p[i + 1].y.toFixed(2);
  }
  return d;
}
function dv2Spark(id, vals, color){
  var W = 100, H = 32, pad = 4, n = vals.length;
  var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals), rng = mx - mn;
  var pts = vals.map(function(v, i){
    return { x: n > 1 ? i / (n - 1) * W : W / 2, y: rng > 0 ? H - pad - (v - mn) / rng * (H - pad * 2) : H / 2 };
  });
  var line = n > 1 ? dvSpline(pts, 0.4) : 'M0 ' + (H / 2) + ' L' + W + ' ' + (H / 2);
  var area = line + ' L' + W + ' ' + H + ' L0 ' + H + ' Z';
  return '<svg class="kpi-sparkline" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true">' +
    '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + color + '" stop-opacity=".38"/><stop offset="1" stop-color="' + color + '" stop-opacity="0"/></linearGradient></defs>' +
    '<path d="' + area + '" fill="url(#' + id + ')" stroke="none"/><path class="dv-spark-line" d="' + line + '" stroke="' + color + '"/></svg>';
}
function dv2Kpi(o){
  return '<div class="kpi-card kpi-' + o.cls + (o.extra ? ' ' + o.extra : '') + '"' + (o.id ? ' id="' + o.id + '"' : '') + (o.attrs ? ' ' + o.attrs : '') + '>' +
    '<div class="kpi-card-top"><div class="kpi-icon-box">' + dvIco(o.ico) + '</div>' + (o.chip || '') + '</div>' +
    '<div class="kpi-body"><div class="kpi-val">' + o.val + '</div><div class="kpi-label">' + o.label + '</div></div>' +
    '<div class="kpi-footer">' + (o.foot || '') + '</div>' +
  '</div>';
}
function dv2AlertsKpi(c){
  var n = c.oil + c.ret + c.doc + c.book + c.gps;
  var parts = [];
  [['oil','oilW'],['ret','retW'],['doc','docW'],['book','bookW'],['gps','gpsW']].forEach(function(p){
    if(c[p[0]] > 0) parts.push('<bdi>' + c[p[0]] + ' ' + dv2T(p[1]) + '</bdi>');
  });
  return dv2Kpi({
    cls:'red', extra: n ? 'kpi-pulse' : '', id:'dv2-kpi-alerts', ico:'warn',
    attrs: n ? 'data-fleet-action="scroll-to-alerts" style="cursor:pointer"' : '',
    chip: n ? '<span class="kpi-trend alert"><span class="kpi-pulse-dot"></span>' + dv2T('urgent').toUpperCase() + '</span>' : '<span class="kpi-trend up">' + dv2T('ok') + '</span>',
    val: n, label: dv2T('kAlerts'),
    foot: n ? dv2Meta(parts.slice(0, 3).join(' · '), dv2T('needsAttn'), true) : dv2Meta(dv2T('allClear'), '&nbsp;')
  });
}
function dv2KpiCards(x){
  var occ = x.total > 0 ? Math.round(x.out / x.total * 100) : 0;
  var avp = x.total > 0 ? Math.round(x.disponible / x.total * 100) : 0;
  var demand = occ >= 80 ? 'dHigh' : occ >= 50 ? 'dMid' : 'dLow';
  var s = dv2Series();
  var momR = s.rev[4] > 0 ? Math.round((s.rev[5] - s.rev[4]) / s.rev[4] * 100) : null;
  var momE = s.exp[4] > 0 ? Math.round((s.exp[5] - s.exp[4]) / s.exp[4] * 100) : null;
  var net = dv2NetOutToday();
  return '' +
    dv2Kpi({ cls:'blue', ico:'car', val:x.total, label:dv2T('kFleet'),
      foot: dv2Ring(occ) + dv2Meta(dv2T('utilization'), dv2T(demand)) }) +
    dv2Kpi({ cls:'orange', ico:'wheel', chip:dv2Delta(net), val:x.out, label:dv2T('kOut'),
      foot: dv2Bar(occ, 'linear-gradient(90deg,#fb923c,#f59e0b)') + dv2Meta(x.disponible + ' ' + dv2T('availWord'), dv2T('fleetCap')) }) +
    dv2Kpi({ cls:'green', ico:'check', chip:dv2Delta(-net), val:x.disponible, label:dv2T('kAvail'),
      foot: dv2Bar(avp, 'linear-gradient(90deg,#4ade80,#16a34a)') + dv2Meta(avp + '% ' + dv2T('ofFleet') + (x.booked ? ' · ' + x.booked + ' ' + dv2T('lgBooked').toLowerCase() : ''), dv2T('readyRent')) }) +
    dv2Kpi({ cls:'emerald', ico:'dollar', chip:dv2Delta(momR, false, '%'), val:x.revenu.toLocaleString(), label:dv2T('kCollected'),
      foot: dv2Spark('dvsg-rev', s.rev, '#10b981') }) +
    dv2Kpi({ cls:'rose', ico:'card', chip:dv2Delta(momE, true, '%'), val:x.depenseTotal.toLocaleString(), label:dv2T('kExpenses'),
      foot: dv2Spark('dvsg-exp', s.exp, '#f43f5e') }) +
    dv2AlertsKpi(x.counts);
}

// ── Graphiques SVG (rendu calé sur la config Chart.js de la référence) ──
function dv2Donut(segs, center, sub, centerColor){
  var outer = 88, inner = outer * 0.72, R = (outer + inner) / 2, sw = outer - inner, C = 2 * Math.PI * R;
  var live = segs.filter(function(s){ return s.v > 0; });
  var tot = live.reduce(function(a, s){ return a + s.v; }, 0), off = 0, arcs = '';
  var T = dv2T;
  if(tot > 0){
    live.forEach(function(s){
      var len = s.v / tot * C, gap = live.length > 1 ? 4 : 0;
      arcs += '<circle class="dv-arc" cx="100" cy="100" r="' + R.toFixed(2) + '" stroke="' + s.color + '" stroke-width="' + sw.toFixed(2) + '"' +
        ' stroke-dasharray="' + Math.max(len - gap, 0.01).toFixed(2) + ' ' + C.toFixed(2) + '" stroke-dashoffset="' + (-(off + gap / 2)).toFixed(2) + '"' +
        ' transform="rotate(-90 100 100)" style="--C:' + C.toFixed(2) + '"' +
        ' data-tb="' + escapeHtml(s.color + '|' + s.label + ': ' + s.v + ' ' + (s.unit || '') + (s.pct ? ' (' + Math.round(s.v / tot * 100) + '%)' : '')) + '"/>';
      off += len;
    });
  } else {
    arcs = '<circle class="dv-track" cx="100" cy="100" r="' + R.toFixed(2) + '" stroke-width="' + sw.toFixed(2) + '"/>';
  }
  return '<svg class="dv-donut" viewBox="0 0 200 200" role="img">' + arcs +
    '<text class="dv-donut-big" x="100" y="94"' + (centerColor ? ' style="fill:' + centerColor + '"' : '') + '>' + center + '</text>' +
    '<text class="dv-donut-small" x="100" y="118">' + String(sub).toUpperCase() + '</text></svg>';
}
function dv2LegendHtml(rows){
  return rows.map(function(r){
    return '<div class="legend-item"><span class="legend-dot" style="background:' + r.color + '"></span><span class="legend-label">' + r.label + '</span>' + (r.v !== undefined ? '<span class="legend-val">' + r.v + '</span>' : '') + '</div>';
  }).join('');
}
function dv2NiceStep(mx, target){
  var raw = mx / target, mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10)), nm = raw / mag;
  return (nm <= 1 ? 1 : nm <= 2 ? 2 : nm <= 2.5 ? 2.5 : nm <= 5 ? 5 : 10) * mag;
}
function dv2BarsSvg(ser, W, animate){
  var H = 200, n = ser.keys.length, i;
  var mx = Math.max.apply(null, ser.rev.concat(ser.exp).concat([1]));
  var step = dv2NiceStep(mx, 5), steps = Math.max(1, Math.ceil(mx / step)), top = steps * step;
  var labels = [];
  for(i = 0; i <= steps; i++) labels.push(Math.round(i * step * 100) / 100);
  var lblTxt = labels.map(function(v){ return v.toLocaleString() + ' OMR'; });
  var lw = Math.max.apply(null, lblTxt.map(function(l){ return l.length; })) * 5.7;
  var pl = Math.ceil(lw) + 12, pr = 6, pt = 8, pb = 26, pw = W - pl - pr, ph = H - pt - pb;
  var cw = pw / n, slot = cw * 0.7 / 2, bw = slot * 0.6;
  var s = '<svg class="dv-bars' + (animate === false ? ' dv-static' : '') + '" viewBox="0 0 ' + W + ' ' + H + '" role="img">' +
    '<defs><linearGradient id="dvg-rev" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="220"><stop offset="0" stop-color="#22c55e"/><stop offset="1" stop-color="#16a34a"/></linearGradient>' +
    '<linearGradient id="dvg-exp" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="220"><stop offset="0" stop-color="#f87171"/><stop offset="1" stop-color="#dc2626"/></linearGradient></defs>';
  labels.forEach(function(v, ix){
    var y = pt + ph - (v / top) * ph;
    s += '<line class="dv-gridl" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '"/>' +
         '<text class="dv-ax dv-axy" x="' + (pl - 8) + '" y="' + (y + 3.5).toFixed(1) + '">' + escapeHtml(lblTxt[ix]) + '</text>';
  });
  var bar = function(x, v, grad, ix){
    if(!(v > 0)) return '';
    var h = Math.max(v / top * ph, 1), r = Math.min(8, bw / 2, h / 2);
    return '<rect class="dv-bar" style="--i:' + ix + '" x="' + x.toFixed(1) + '" y="' + (pt + ph - h).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="' + r.toFixed(1) + '" fill="url(#' + grad + ')"/>';
  };
  ser.keys.forEach(function(k, ix){
    var cx = pl + cw * ix + cw / 2, lbl = dv2MonthLabel(k);
    s += bar(cx - slot + (slot - bw) / 2, ser.rev[ix], 'dvg-rev', ix) + bar(cx + (slot - bw) / 2, ser.exp[ix], 'dvg-exp', ix);
    s += '<text class="dv-ax dv-axx" x="' + cx.toFixed(1) + '" y="' + (H - 8) + '">' + escapeHtml(lbl) + '</text>';
    s += '<rect class="dv-hit" x="' + (pl + cw * ix).toFixed(1) + '" y="' + pt + '" width="' + cw.toFixed(1) + '" height="' + ph + '" data-tt="' + escapeHtml(lbl) + '"' +
      ' data-tb="' + escapeHtml('#22c55e|' + dv2T('lgRevenue') + ': ' + Math.round(ser.rev[ix]).toLocaleString() + ' OMR¦#ef4444|' + dv2T('lgExp') + ': ' + Math.round(ser.exp[ix]).toLocaleString() + ' OMR') + '"/>';
  });
  return s + '</svg>';
}
function dv2RenderBars(animate){
  var el = document.getElementById('dv2-chart-rev');
  if(!el || !window._dv2Ser) return;
  var w = el.clientWidth;
  el.innerHTML = dv2BarsSvg(window._dv2Ser, w > 60 ? w : 570, animate);
  if(!el._dvRO && window.ResizeObserver){
    var last = w;
    el._dvRO = new ResizeObserver(function(){
      var nw = el.clientWidth;
      if(nw > 60 && Math.abs(nw - last) > 2){ var first = last < 60; last = nw; dv2RenderBars(first); }
    });
    el._dvRO.observe(el);
  }
}
function dv2RenderAlertsChart(c){
  var el = document.getElementById('dv2-chart-alerts');
  if(!el) return;
  c = c || dv2AlertCounts();
  var n = c.oil + c.ret + c.doc + c.book + c.gps, u = dv2T('alertsW');
  var rows = [
    { label:dv2T('lgOil'),     v:c.oil,  color:'#f97316', unit:u },
    { label:dv2T('lgReturn'),  v:c.ret,  color:'#ef4444', unit:u },
    { label:dv2T('lgDocs'),    v:c.doc,  color:'#dc2626', unit:u },
    { label:dv2T('lgBooking'), v:c.book, color:'#16a34a', unit:u },
    { label:dv2T('lgGps'),     v:c.gps,  color:'#0891b2', unit:u }
  ];
  el.innerHTML = dv2Donut(rows, n, dv2T('active'), n > 0 ? '#dc2626' : '#16a34a');
  var lg = document.getElementById('dv2-legend-alerts'); if(lg) lg.innerHTML = dv2LegendHtml(rows);
  var bd = document.getElementById('dv2-badge-alerts');
  if(bd) bd.innerHTML = '<div class="chart-badge ' + (n > 0 ? 'chart-badge-red' : 'chart-badge-green') + '"><span class="chart-badge-dot"></span>' + n + ' ' + dv2T('active') + '</div>';
}
// Recalcule KPI "Alerts" + donut (appelé aussi quand le cache GPS MadarTech se met à jour)
function dv2RefreshAlertViews(){
  if(!document.getElementById('dash-stats')) return;
  var c = dv2AlertCounts(), k = document.getElementById('dv2-kpi-alerts');
  if(k) k.outerHTML = dv2AlertsKpi(c);
  dv2RenderAlertsChart(c);
}
function dv2RenderCharts(av){
  var bk = av.bookedHeld || 0, u = dv2T('vehiclesW');
  var frows = [
    { label:dv2T('lgOut'),    v:av.out,        color:'#f59e0b', unit:u, pct:1 },
    { label:dv2T('lgAvail'),  v:av.disponible, color:'#16a34a', unit:u, pct:1 },
    { label:dv2T('lgBooked'), v:bk,            color:'#7c3aed', unit:u, pct:1 }
  ];
  var occ = av.total > 0 ? Math.round(av.out / av.total * 100) : 0;
  var el = document.getElementById('dv2-chart-fleet');
  if(el) el.innerHTML = dv2Donut(frows, occ + '%', dv2T('lgOut'));
  el = document.getElementById('dv2-legend-fleet'); if(el) el.innerHTML = dv2LegendHtml(frows);
  el = document.getElementById('dv2-badge-fleet');
  if(el) el.innerHTML = '<div class="chart-badge chart-badge-blue"><span class="chart-badge-dot"></span>' + av.total + ' ' + dv2T('total') + '</div>';

  var s = dv2Series();
  window._dv2Ser = s;
  dv2RenderBars(true);
  // Légende du graphique Revenue vs Expenses (vert = revenus, rouge = dépenses)
  el = document.getElementById('dv2-legend-rev');
  if(el) el.innerHTML = dv2LegendHtml([
    { label:dv2T('lgRevenue'), color:'#22c55e' },
    { label:dv2T('lgExp'),     color:'#ef4444' }
  ]);
  var mom = s.rev[4] > 0 ? Math.round((s.rev[5] - s.rev[4]) / s.rev[4] * 100) : null;
  el = document.getElementById('dv2-rev-mom');
  if(el) el.innerHTML = mom === null ? '' :
    '<div class="chart-badge ' + (mom >= 0 ? 'chart-badge-green' : 'chart-badge-red') + '">' + dvIco(mom >= 0 ? 'up' : 'down', 10, 3) + (mom > 0 ? '+' : '') + mom + '% ' + dv2T('mom') + '</div>';
}

// ── Feed "Today's Activity" ──
function dv2Ts(s){
  if(!s) return null; s = String(s);
  if(s.length <= 10) return null;
  var t = Date.parse(s.replace(' ', 'T'));
  return isNaN(t) ? null : t;
}
function dv2Hm(ts){ var d = new Date(ts); return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0'); }
function dv2Dmy(ts){ var d = new Date(ts); return String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0') + '/' + d.getFullYear() + ' ' + dv2Hm(ts); }
function dv2Tag(txt, tone){ return txt ? ' <span class="activity-tag tag-' + tone + '">' + txt + '</span>' : ''; }
function dv2BuildFeed(){
  var today = new Date().toISOString().slice(0,10), items = [], esc = escapeHtml, T = dv2T;
  var isToday = function(s){ return s && String(s).indexOf(today) === 0; };
  (DB.rentals || []).forEach(function(r){
    var vl = esc(dv2RentalVeh(r)), cust = dv2RentalCustomer(r);
    var contract = r.contract ? ' · ' + T('fdContract') + ' #' + esc(String(r.contract)) : '';
    var custLine = cust ? T('fdCustomer') + ': ' + esc(cust) : '';
    var br = r.branch ? esc(String(r.branch)) : '';
    var act = 'data-fleet-action="goto-contract" data-fleet-id="' + esc(String(r.id)) + '"';
    if(isToday(r.dateOut)){
      var tsO = dv2Ts(r.dateOut);
      items.push({ type:'out', ts:tsO, time:tsO ? dv2Hm(tsO) : '—', tone:'orange', ico:'carS', attrs:act,
        title:'<strong>' + vl + '</strong> ' + T('fdRentedOut') + dv2Tag(br, 'orange') + contract, meta:custLine });
      if(Number(r.paid) > 0) items.push({ type:'pay', ts:tsO, time:tsO ? dv2Hm(tsO) : '—', tone:'green', ico:'dollar', attrs:act,
        title:T('fdPayment') + ' <strong>' + esc(fmtNum(r.paid)) + ' OMR</strong> ' + T('fdFrom') + ' <strong>' + vl + '</strong>' + contract, meta:custLine });
    }
    if(isToday(r.dateIn)){
      var tsI = dv2Ts(r.dateIn), km = '';
      if(Number(r.kmOut) > 0 && Number(r.kmIn) > 0) km = 'KM: ' + Math.round(r.kmOut).toLocaleString() + ' → ' + Math.round(r.kmIn).toLocaleString() + ' (Δ ' + Math.round(r.kmIn - r.kmOut).toLocaleString() + ')';
      items.push({ type:'ret', ts:tsI, time:tsI ? dv2Hm(tsI) : '—', tone:'blue', ico:'pin', attrs:act,
        title:'<strong>' + vl + '</strong> ' + T('fdReturned') + dv2Tag(br, 'blue') + contract, meta:[custLine, km].filter(Boolean).join(' · ') });
    }
  });
  (DB.moves || []).forEach(function(m){
    var dbVeh = (DB.vehicles || []).find(function(v){ return extractPlateNum(v.plate) === extractPlateNum(m.plate); }) || {};
    var vl = esc(dv2VehLabel(dbVeh.name || '', m.plate));
    var act = 'data-fleet-action="goto-nav" data-fleet-page="moves"';
    if(isToday(m.dateOut)){
      var tsM = dv2Ts(m.dateOut);
      var dest = m.workshopLocation || (m.dest ? translate('moves.dest.' + m.dest) : '') || '';
      items.push({ type:'out', ts:tsM, time:tsM ? dv2Hm(tsM) : '—', tone:'orange', ico:'carS', attrs:act,
        title:'<strong>' + vl + '</strong> ' + T('fdSentTo') + dv2Tag(esc(dest), 'orange'),
        meta:[m.user ? T('fdDriver') + ': ' + esc(m.user) : '', tsM ? dv2Dmy(tsM) : ''].filter(Boolean).join(' · ') });
    }
    if(isToday(m.dateIn)){
      var tsB = dv2Ts(m.dateIn), kmm = '';
      if(Number(m.kmOut) > 0 && Number(m.kmIn) > 0) kmm = 'KM: ' + Math.round(m.kmOut).toLocaleString() + ' → ' + Math.round(m.kmIn).toLocaleString() + ' (Δ ' + Math.round(m.kmIn - m.kmOut).toLocaleString() + ')';
      items.push({ type:'ret', ts:tsB, time:tsB ? dv2Hm(tsB) : '—', tone:'blue', ico:'pin', attrs:act,
        title:'<strong>' + vl + '</strong> ' + T('fdCheckedIn'), meta:[T('fdInternal'), kmm].filter(Boolean).join(' · ') });
    }
  });
  items.sort(function(a, b){ return (b.ts || 0) - (a.ts || 0); });
  // Alertes auto (sans heure) — toujours en bas, comme dans la référence
  var od = calculerAlertesOverdueReturn().map(function(r){
    return { r:r, late:Math.floor((Date.now() - new Date(r.expectedReturn)) / 86400000) };
  }).sort(function(a, b){ return b.late - a.late; }).slice(0, 6);
  od.forEach(function(o){
    var r = o.r, cust = dv2RentalCustomer(r);
    items.push({ type:'ret', ts:null, time:'—', tone:'red', ico:'clock', attrs:'data-fleet-action="goto-contract" data-fleet-id="' + esc(String(r.id)) + '"',
      title:T('fdOverdue') + ' · <strong>' + esc(dv2RentalVeh(r)) + '</strong> · ' + dv2Tag(T('fdDaysLate', o.late), 'red').trim(),
      meta:[cust ? T('fdCustomer') + ': ' + esc(cust) : '', r.contract ? T('fdContract') + ' #' + esc(String(r.contract)) : ''].filter(Boolean).join(' · ') });
  });
  var gpsOff = getMatchedGpsAlerts().filter(function(a){ return a.is_offline; }).length;
  if(gpsOff > 0) items.push({ type:'alert', ts:null, time:'—', tone:'purple', ico:'gpsS', attrs:'data-fleet-action="goto-nav" data-fleet-page="gps"',
    title:'<strong>' + T('fdVehiclesWord', gpsOff) + '</strong> ' + T('fdGpsLostRest') + dv2Tag(T('fdAuto'), 'purple'), meta:'MadarTech API' });
  return items.slice(0, 60);
}
function dv2RenderFeed(){
  var box = document.getElementById('dash-today-feed');
  if(!box) return;
  var f = window._dv2FeedFilter || 'all';
  var list = (window._dv2FeedItems || []).filter(function(it){ return f === 'all' || it.type === f; });
  document.querySelectorAll('#dv2-feed-tabs [data-dv2-filter]').forEach(function(b){
    b.classList.toggle('active', b.getAttribute('data-dv2-filter') === f);
  });
  box.innerHTML = list.length ? list.map(function(it){
    return '<div class="activity-item"' + (it.attrs ? ' ' + it.attrs : '') + '>' +
      '<div class="activity-time">' + it.time + '</div><div class="activity-connector"></div>' +
      '<div class="activity-icon activity-icon-' + it.tone + '">' + dvIco(it.ico, 14) + '</div>' +
      '<div class="activity-body"><div class="activity-text">' + it.title + '</div>' + (it.meta ? '<div class="activity-meta">' + it.meta + '</div>' : '') + '</div></div>';
  }).join('') : '<div class="empty">' + dv2T('noFeed') + '</div>';
}

// ── Export CSV (bouton "Export") : KPI du mois + liste des véhicules sortis ──
function dv2ExportCsv(){
  var sn = window._dv2Snap || {}, rows = [], q = function(v){ return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
  rows.push(['Dashboard', sn.ym || '']);
  [['Total fleet', sn.total], ['Out', sn.out], ['Available', sn.disponible], ['Booked', sn.booked],
   ['Collected (OMR)', sn.revenu], ['Expenses (OMR)', sn.depenseTotal], ['Alerts', sn.alerts]].forEach(function(p){ rows.push(p); });
  rows.push([]);
  rows.push(['Vehicle', 'Customer', 'Contract', 'Since', 'Balance (OMR)', 'Status']);
  (DB.rentals || []).filter(function(r){ return !r.dateIn || r.dateIn === ''; }).forEach(function(r){
    var b; if(!r.dateIn || r.dateIn === '') b = calcOpenContractBAL(r); else b = calcRentalBAL(r);
    if(b === null || b === undefined) b = (r.bal !== undefined && r.bal !== null) ? Number(r.bal) : Number((r.price || 0) - (r.paid || 0));
    var late = false;
    if(r.expectedReturn){ var e = new Date(r.expectedReturn); e.setHours(23,59,59,999); late = new Date() > e; }
    rows.push([dv2RentalVeh(r), dv2RentalCustomer(r), r.contract || '', r.dateOut ? String(r.dateOut).slice(0,10) : '', Number(b), late ? 'Overdue' : 'Active']);
  });
  var csv = '\uFEFF' + rows.map(function(r){ return r.map(q).join(','); }).join('\r\n');
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type:'text/csv;charset=utf-8' }));
  a.download = 'dashboard-' + new Date().toISOString().slice(0,10) + '.csv';
  document.body.appendChild(a); a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

// ── buildDashboard (orig. line 8343) ──
function buildDashboard(){ ensurePageLoaded('dashboard'); let av = getRealFleetAvailability(); let total = av.total; let out = av.out; let disponible = av.disponible;
  // Dashboard = vue mensuelle glissante : revient automatiquement à 0 au changement de mois
  let ym = new Date().toISOString().slice(0,7);
  let payments = DB.payments; if(ym){ payments = payments.filter(p => p.dateOut && p.dateOut.slice(0,7) === ym); } let revenu = payments.reduce((s,p) => s + (p.price||0), 0); let alertes = calculerAlertes();
  let depenses = (DB.depence || []).filter(e => (e.date||'').slice(0,7) === ym); let depenseTotal = depenses.reduce((s,e) => s + (parseFloat(e.amount)||0), 0);
  // ── GPS alerts (offline/no-movement) — resync en tâche de fond, ne bloque pas le rendu ──
  refreshGpsAlerts();
  // ── Continuous alarm: keeps ringing while any alert exists, until the
  // user manually stops it with the 🔊 SOUND button. Re-arms automatically
  // once alerts clear and new ones later appear. ──
  if(alertes.length > 0){
    if(!window._dashAlarmManuallyStopped && !window._dashAlarmPlaying) startDashAlarm();
  } else {
    stopDashAlarm(false);
    window._dashAlarmManuallyStopped = false; // reset so a future alert auto-rings again
  }
  _updateDashAlarmBtn();

  // ── Dashboard nav badge — alert count shown next to the Dashboard menu ──
  let dashBadge = document.getElementById('dash-badge');
  if(dashBadge){
    if(alertes.length > 0){ dashBadge.textContent = alertes.length; dashBadge.style.display = 'inline-block'; }
    else { dashBadge.style.display = 'none'; }
  }
  let occPct = total > 0 ? Math.round((out/total)*100) : 0;
  let occColor = occPct >= 80 ? '#ef4444' : occPct >= 50 ? '#f59e0b' : '#16a34a';
  let ymLabel = ym ? (() => { let [y,m] = ym.split('-'); let mn=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; return mn[parseInt(m)-1]+' '+y; })() : 'All time';
  if(window.dv2HideTip) window.dv2HideTip();
  dv2ApplyText();
  dv2RenderHeader();
  document.getElementById('dash-stats').innerHTML = dv2KpiCards({ total: total, out: out, disponible: disponible, booked: av.bookedHeld || 0, revenu: revenu, depenseTotal: depenseTotal, counts: dv2AlertCounts() });

  let fmtDate = d => { if(!d) return ''; let m=d.match(/^(\d{4})-(\d{2})-(\d{2})/); return m?m[3]+'/'+m[2]+'/'+m[1]:''; };

  // ── Box 1: Oil Change ──────────────────────────────────────────────
  let oilAlerts = calculerAlertesOil();
  let oilCountEl = document.getElementById('dash-oil-count'); if(oilCountEl) oilCountEl.textContent = oilAlerts.length;
  document.getElementById('dash-oil-alerts').innerHTML = oilAlerts.length ? oilAlerts.map(a => {
    let isOverdue = a.kmLeft <= 0;
    let label = isOverdue
      ? t(translate('dash.oilOverdue'), Math.abs(Math.round(a.kmLeft)).toLocaleString())
      : t(translate('dash.oilDue'), Math.round(a.kmLeft).toLocaleString());
    return `<div class="alert-item ${isOverdue?'alert-red':'alert-yellow'}"><div class="alert-icon">🛢️</div><div class="alert-text"><strong>${escapeHtml(a.vehicle.name)} — ${escapeHtml(a.vehicle.plate)}</strong><span>${label} · ${t(translate('dash.targetNow'), (a.vehicle.svcKm||0).toLocaleString(), a.effKm.toLocaleString())}</span></div></div>`;
  }).join('') : '<div class="empty">'+translate('dash.noOilChanges')+'</div>';

  // ── Box 2: Documents — Mulkiya & Ministry of Transport (combined) ──
  let docAlerts = [].concat(calculerAlertesMulkiya(), calculerAlertesMinistry()).sort((a,b) => a.diff - b.diff);
  let docCountEl = document.getElementById('dash-doc-count'); if(docCountEl) docCountEl.textContent = docAlerts.length;
  document.getElementById('dash-doc-alerts').innerHTML = docAlerts.length ? docAlerts.map(a => {
    let isMulkiya = a.type === 'mulkiya';
    let icon = isMulkiya ? '📄' : '🏛️';
    let docName = isMulkiya ? translate('dash.docMulkiya') : translate('dash.docMinistry');
    let label = a.diff<=0 ? t(translate('dash.docExpired'),docName,fmtDate(a.date)) : t(translate('dash.docDueIn'),docName,a.diff,fmtDate(a.date));
    return `<div class="alert-item alert-${a.diff<=0?'red':'yellow'}"><div class="alert-icon">${icon}</div><div class="alert-text"><strong>${escapeHtml(a.vehicle.name)} — ${escapeHtml(a.vehicle.plate)}</strong><span>${label}</span></div></div>`;
  }).join('') : '<div class="empty">'+translate('dash.noDocAlerts')+'</div>';

  // ── Box 3: Customers who haven't returned the car (past expected return date) ──
  let overdueReturnAlerts = calculerAlertesOverdueReturn();
  let overdueCountEl = document.getElementById('dash-overdue-count'); if(overdueCountEl){ overdueCountEl.textContent = overdueReturnAlerts.length; let oc2 = overdueCountEl.closest('.alert-card'); if(oc2) oc2.classList.toggle('alert-pulse-strong', overdueReturnAlerts.length > 0); }
  document.getElementById('dash-overdue-alerts').innerHTML = overdueReturnAlerts.length ? overdueReturnAlerts.map(r => {
    let v = r.vehicleId ? (DB.vehicles.find(v => v.id === r.vehicleId) || {}) : {};
    let vN = v.name || r._name || '—';
    let vP = v.plate || r._plate || '—';
    let today = new Date();
    let expFmt = r.expectedReturn.split('-').reverse().join('/');
    let daysLate = Math.floor((today - new Date(r.expectedReturn)) / 86400000);
    let lateLabel = daysLate === 0 ? translate('dash.dueToday') : daysLate + ' ' + (daysLate > 1 ? translate('dash.daysLate') : translate('dash.dayLate'));
    return `<div class="alert-item alert-red" style="cursor:pointer" data-fleet-action="goto-contract" data-fleet-id="${r.id}" title="Click to view contract">
      <div class="alert-icon">🚨</div>
      <div class="alert-text">
        <strong>${vN} — ${vP}</strong>
        <span>${t(translate('dash.expectedReturn'), expFmt, lateLabel, r.contract||'—')}</span>
      </div>
    </div>`;
  }).join('') : '<div class="empty">'+translate('dash.noOverdueReturns')+'</div>';

  // ── Box 4: New Booking Requests (online public booking page) ──
  let bookingAlerts = (DB.bookings||[]).filter(b => b.status === 'pending')
    .sort((a,b) => new Date(b.createdAt||b.dateCreated||0) - new Date(a.createdAt||a.dateCreated||0));
  let bookingCountEl = document.getElementById('dash-booking-count'); if(bookingCountEl) bookingCountEl.textContent = bookingAlerts.length;
  let bookingBox = document.getElementById('dash-booking-alerts');
  if(bookingBox){
    bookingBox.innerHTML = bookingAlerts.length ? bookingAlerts.map(b => {
      let bName = b.name || b.clientName || '—';
      let bTel = b.tel || b.phone || '—';
      let bVeh = b.vehicleName || b.vehicle || '—';
      let bWhen = b.createdAt || b.dateCreated ? fmtDate((b.createdAt||b.dateCreated).slice(0,10)) : '';
      return `<div class="alert-item alert-yellow" style="cursor:pointer" data-fleet-action="goto-nav" data-fleet-page="booking" title="Click to view booking requests">
        <div class="alert-icon">📩</div>
        <div class="alert-text">
          <strong>${bName} — ${bTel}</strong>
          <span>${t(translate('dash.newBookingReq'), bVeh, bWhen?' · '+bWhen:'')}</span>
        </div>
      </div>`;
    }).join('') : '<div class="empty">'+translate('dash.noPendingBookings')+'</div>';
  }

  // ── Box 5: GPS Offline / No Movement (MadarTech) — utilise le cache
  // rempli par refreshGpsAlerts(). Correspondance véhicule uniquement par
  // PLAQUE (jamais par id) — voir renderGpsAlertsBox() plus bas. ──
  renderGpsAlertsBox();

// ── makeVehicleCellPlain (2026-08) : même alignement que makeVehiclePill
// (largeur fixe 132px, police mono, plaque toujours au même niveau) mais
// SANS badge coloré — texte simple, demandé pour alléger visuellement
// les tableaux Vehicles Out / Workshop du dashboard. ──────────────────
// ── dashVehiclePlateCell (2026-08) : format standardise "NOM PLAQUE" en
// UNE seule chaine mono, largeur fixe identique sur toutes les lignes,
// sans couleur/badge — ex. "KONA 1234-T". Utilise pour Vehicles Out ET
// Workshop afin que les deux tableaux soient visuellement identiques. ──
function dashVehiclePlateCell(vName, plateRaw){
  let name = (vName||'').trim();
  let plate = (typeof plateRaw === 'string' ? plateRaw : String(plateRaw||'')).trim();
  // si le nom et la plaque sont colles (ex. "KONA1234-T"), on les separe
  if(name && plate.toUpperCase().startsWith(name.toUpperCase()) && plate.length > name.length){
    plate = plate.slice(name.length).trim();
  }
  let label = (name + (plate ? ' ' + plate : '')).trim();
  return `<span class="vehicle-cell" title="${escapeHtml(label)}"><span class="vehicle-name">${escapeHtml(name)}</span>${plate ? '<span class="vehicle-plate">' + escapeHtml(plate) + '</span>' : ''}</span>`;
}

  let sorties = DB.rentals.filter(r => !r.dateIn || r.dateIn === '');
  { let oc = document.getElementById('dash-out-count'); if(oc) oc.textContent = sorties.length; }
  document.getElementById('dash-out-body').innerHTML = sorties.length ? sorties.map(r => {
    let v = r.vehicleId ? (DB.vehicles.find(v => v.id === r.vehicleId) || {}) : {};
    let vN = v.name || r._name || getVehicleNameByPlate(v.plate||r._plate) || '—';
    let vP = v.plate || r._plate || '—';
    let vehicleCell = dashVehiclePlateCell(vN, vP);
    let cClient = r._clientId ? (DB.clients||[]).find(c => c.id === r._clientId) : null;
    let cName = r._clientName || (cClient ? cClient.firstname : '') || '—';
    let rBal = (()=>{
      let b;
      if(!r.dateIn || r.dateIn === ''){ b = calcOpenContractBAL(r); } else { b = calcRentalBAL(r); }
      if(b===null || b===undefined) b = (r.bal!==undefined&&r.bal!==null) ? Number(r.bal) : Number((r.price||0)-(r.paid||0));
      let n = Number(b);
      return `<span class="balance-pill ${n>0?'balance-warning':'balance-success'}">${fmtNum(n)} OMR</span>`;
    })();
    let contractCell = r.contract ? `<a class="link-blue" data-fleet-action="payment-history" data-fleet-contract="${escapeHtml(r.contract)}" data-fleet-branch="${escapeHtml(r.branch||'')}" title="Payment History">${escapeHtml(r.contract)}</a>` : '—';
    let rowOverdue = false;
    if(r.expectedReturn && r.expectedReturn !== ''){ let expD = new Date(r.expectedReturn); expD.setHours(23,59,59,999); rowOverdue = new Date() > expD; }
    return `<tr data-fleet-action="goto-contract" data-fleet-id="${r.id}" style="cursor:pointer${rowOverdue?';animation:dash-overdue-blink 1.1s ease-in-out infinite':''}" title="Click to view contract"><td>${vehicleCell}</td><td><span class="dv-clip" title="${escapeHtml(cName)}">${escapeHtml(cName)}</span></td><td>${contractCell}</td><td>${fmtDate(r.dateOut)}</td><td>${rBal}</td><td>${dv2Pill(rowOverdue?'overdue':'active')}</td></tr>`;
  }).join('') : '<tr><td colspan="6" class="empty">'+translate('dash.noVehiclesOut')+'</td></tr>';
// ── Overdue sound alert ──
(function(){
  let overdueCount = sorties.filter(r => {

    if(!r.expectedReturn || r.expectedReturn === '') return false;
    let expD = new Date(r.expectedReturn); expD.setHours(23,59,59,999);
    return new Date() > expD;
  }).length;
  if(overdueCount === 0) return;
  // Jouer une seule fois par heure (clé = YYYY-MM-DD-HH)
  let hourKey = new Date().toISOString().slice(0,13);
  let storKey = 'overdueAlertHour';
  if(sessionStorage.getItem(storKey) === hourKey) return;
  sessionStorage.setItem(storKey, hourKey);
  // Son généré via Web Audio API — aucun fichier externe
  try {
    let ctx = new (window.AudioContext || window.webkitAudioContext)();
    let playBeep = function(freq, startT, dur){
      let osc = ctx.createOscillator();
      let gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startT);
      gain.gain.setValueAtTime(0, startT);
      gain.gain.linearRampToValueAtTime(0.35, startT + 0.02);
      gain.gain.linearRampToValueAtTime(0, startT + dur);
      osc.start(startT); osc.stop(startT + dur + 0.05);
    };
    let t = ctx.currentTime;
    // 3 bips descendants : 880 → 660 → 440 Hz
    playBeep(880, t,       0.18);
    playBeep(660, t + 0.25, 0.18);
    playBeep(440, t + 0.50, 0.30);
  } catch(e){}
})();
// ── Workshop — DB vehicles currently at the garage only ──
  const DEST_LBL = {workshop:translate('moves.dest.workshop'),washing:translate('moves.dest.washing'),inspection:translate('moves.dest.inspection'),airport:translate('moves.dest.airport'),delivery:translate('moves.dest.delivery'),personal:translate('moves.dest.personal'),office:translate('moves.dest.office'),other:translate('moves.dest.other')};
  let movesOut = (DB.moves||[]).filter(m => {
    if(m.dateIn && m.dateIn !== '') return false; // already returned
    if(m.dest !== 'workshop') return false; // ✅ Workshop widget : uniquement les vehicules au garage
    // Only vehicles in DB.vehicles — match by extracted plate number
    let mPlate = extractPlateNum(m.plate);
    return DB.vehicles.some(v => extractPlateNum(v.plate) === mPlate);
  }).sort((a,b) => (a.dateOut||'') < (b.dateOut||'') ? 1 : -1);
  const movesOutCount = document.getElementById('dash-moves-out-count');
  if(movesOutCount) movesOutCount.textContent = movesOut.length;
  document.getElementById('dash-moves-out-body').innerHTML = movesOut.length ? movesOut.map(m => {
    const dbVeh = DB.vehicles.find(v => extractPlateNum(v.plate) === extractPlateNum(m.plate)) || {};
    const vName = dbVeh.name || m.plate;
    const vehicleCell = dashVehiclePlateCell(vName, m.plate);
    const garageLabel = escapeHtml(m.workshopLocation) || DEST_LBL[m.dest] || m.dest || '—';
    const since = m.dateOut ? (()=>{const d=new Date(m.dateOut);return String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');})() : '—';
    return `<tr style="cursor:pointer" data-fleet-action="goto-nav" data-fleet-page="moves" title="Click to open Internal Movements">
      <td>${vehicleCell}</td>
      <td><span class="location-badge" title="${garageLabel}">${dvIco('pin', 12)}<span class="dv-clip">${garageLabel}</span></span></td>
      <td><span class="dv-clip" title="${escapeHtml(m.user)||''}">${escapeHtml(m.user)||'—'}</span></td>
      <td class="mono-cell">${since}</td>
      <td>${dv2Pill('workshop')}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="5" class="empty">'+translate('dash.noWorkshopVehicles')+'</td></tr>';

  window._dv2Snap = { ym: ym, total: total, out: out, disponible: disponible, booked: av.bookedHeld || 0, revenu: revenu, depenseTotal: depenseTotal, alerts: alertes.length };
  dv2RenderCharts(av);
  dv2RenderAlertsChart();
  window._dv2FeedItems = dv2BuildFeed();
  dv2RenderFeed();
}

// ── Dashboard alert buttons (2026-08) ───────────────────────────────────
// Un clic sur un bouton (Oil / Mulkiya / Overdue / Booking) ouvre le
// panneau de detail partage. Un clic sur ce MEME bouton (deja actif)
// referme le panneau. Un clic sur un AUTRE bouton bascule simplement le
// contenu affiche (pas besoin de fermer avant de rouvrir).
const DASH_ALERT_META = {
  oil:      { icon: '🛢️', titleKey: 'dash.oil' },
  doc:      { icon: '📄', titleKey: 'dash.mulkiya' },
  overdue:  { icon: '🚨', titleKey: 'dash.overdue' },
  booking:  { icon: '📩', titleKey: 'dash.bookingReq' },
  gps:      { icon: '🛰️', titleKey: 'dash.gps' },
};
function toggleDashAlertDetail(type){
  let meta = DASH_ALERT_META[type];
  if(!meta) return;
  let panel = document.getElementById('dash-alert-detail');
  if(!panel) return;
  let isSameAlreadyOpen = panel.style.display !== 'none' && panel.getAttribute('data-active-type') === type;
  if(isSameAlreadyOpen){
    closeDashAlertDetail(); // meme bouton deja actif -> un clic referme
    return;
  }
  panel.setAttribute('data-active-type', type);
  panel.style.display = '';
  document.getElementById('dash-alert-detail-icon').textContent = meta.icon;
  document.getElementById('dash-alert-detail-title').textContent = translate(meta.titleKey);
  ['oil','doc','overdue','booking','gps'].forEach(function(t){
    let el = document.getElementById('dash-'+t+'-alerts');
    if(el) el.style.display = (t === type) ? '' : 'none';
    let btn = document.querySelector('.dash-alert-btn[data-alert-type="'+t+'"]');
    if(btn) btn.classList.toggle('active', t === type);
  });
  panel.scrollIntoView({ behavior:'smooth', block:'nearest' });
}
function closeDashAlertDetail(){
  let panel = document.getElementById('dash-alert-detail');
  if(!panel) return;
  panel.style.display = 'none';
  panel.removeAttribute('data-active-type');
  // FIX (2026-08) : nettoyage explicite des 4 boutons par type plutot que
  // de chercher '.active' au moment T — evite qu'un click(2) du
  // double-clic (traite juste avant/pendant ce close) laisse la classe
  // reappliquee sur un bouton apres la fermeture du panneau.
  ['oil','doc','overdue','booking','gps'].forEach(function(t){
    let btn = document.querySelector('.dash-alert-btn[data-alert-type="'+t+'"]');
    if(btn) btn.classList.remove('active');
    let el = document.getElementById('dash-'+t+'-alerts');
    if(el) el.style.display = 'none';
  });
}


// ── GPS Alerts (offline / sans mouvement) — Dashboard box #5 ───────────
// Source : GET /api/gps-alerts → table gps_status (server.js + gps-alerts-lib.js),
// indexée par IMEI, avec une colonne `plate` dédiée à la correspondance
// visuelle véhicule ↔ traceur GPS — EXACTEMENT comme getGpsLink() dans
// module-gps-tracking.js. Ce module ne lit, n'écrit ni ne modifie JAMAIS
// DB.vehicles ni aucun id véhicule. window._gpsAlertsCache est seulement
// consommé (lecture) par calculerAlertes() pour le compteur global.
window._gpsAlertsCache = [];
window._gpsAlertsPollStarted = false;

async function refreshGpsAlerts(){
  try {
    let r = await fetch('/api/gps-alerts', { headers: authHeaders() });
    if(r.ok){
      let d = await r.json();
      window._gpsAlertsCache = (d && d.alerts) || [];
    }
  } catch(e){ /* pas critique — on garde le cache précédent */ }

  renderGpsAlertsBox();

  // Recalcule badge nav + alarme + KPI "Alerts" sans reconstruire tout le dashboard
  let alertes = calculerAlertes();
  let dashBadge = document.getElementById('dash-badge');
  if(dashBadge){
    if(alertes.length > 0){ dashBadge.textContent = alertes.length; dashBadge.style.display = 'inline-block'; }
    else { dashBadge.style.display = 'none'; }
  }
  if(alertes.length > 0){
    if(!window._dashAlarmManuallyStopped && !window._dashAlarmPlaying) startDashAlarm();
  } else {
    stopDashAlarm(false);
    window._dashAlarmManuallyStopped = false;
  }

  dv2RefreshAlertViews();
  if(document.getElementById('dash-today-feed')){ window._dv2FeedItems = dv2BuildFeed(); dv2RenderFeed(); }

  if(!window._gpsAlertsPollStarted){
    window._gpsAlertsPollStarted = true;
    setInterval(refreshGpsAlerts, 5 * 60 * 1000); // re-sync toutes les 5 min
  }
}

function renderGpsAlertsBox(){
  let gpsAlerts = getMatchedGpsAlerts();
  let countEl = document.getElementById('dash-gps-count');
  if(countEl) countEl.textContent = gpsAlerts.length;
  let box = document.getElementById('dash-gps-alerts');
  if(!box) return;
  let fmtDT = ts => { if(!ts) return '—'; let d = new Date(ts*1000); return String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'); };
  let fmtDur = sec => { if(!sec) return '—'; let h = Math.floor(sec/3600); let d = Math.floor(h/24); return d > 0 ? (d+'j '+(h%24)+'h') : (h+'h'); };
  box.innerHTML = gpsAlerts.length ? gpsAlerts.map(a => {
    let isOffline = !!a.is_offline;
    let label = isOffline
      ? (translate('dash.gpsOffline') + ' ' + fmtDT(a.last_update_ts))
      : (translate('dash.gpsNoMovement') + ' ' + fmtDur(a.stop_duration_sec));
    return `<div class="alert-item ${isOffline?'alert-red':'alert-yellow'}"><div class="alert-icon">🛰️</div><div class="alert-text"><strong>${escapeHtml(a.name||'—')} — ${escapeHtml(a.plate||'—')}</strong><span>${label}</span></div></div>`;
  }).join('') : '<div class="empty">'+translate('dash.noGpsAlerts')+'</div>';
}

// Vehicle type color palette (15 colors)
const VEHICLE_COLORS = {
  // WHITE background (text dark)
  'JETOUR X50': '#888888',
  // GREEN background
  'MG-5': '#16a34a',
  // YELLOW background
  'MG-3': '#ca8a04',
  // BLACK background (text white)
  'KIA OPTIMA': '#1a1a1a', 'KIA RIO': '#1a1a1a', 'CAMRY': '#1a1a1a', 'MAZDA': '#1a1a1a',
  // BLUE background
  'SPARK': '#2563eb', 'CHR': '#2563eb', 'VENUE': '#2563eb', 'ROGUE': '#2563eb',
  // PINK/ROSE background
  'PRADO': '#db2777', 'FORTUNER': '#db2777', 'N-PATROL': '#db2777', 'N-PATHFINDER': '#db2777', 'N-PATROL': '#db2777', 'N-PATHFINDER': '#db2777', 'OUTLANDER': '#db2777',
  // Others
  'YARIS': '#0891b2', 'HONDA': '#dc2626'
};
// ── renderFleet (orig. line 8603) ──
function renderFleet(){
  ensurePageLoaded('fleet');
  // --- Filter chips ---
  let vehicleTypes = ['All', ...new Set(DB.vehicles.map(v => v.name).filter(Boolean).sort())];
  let fc = document.getElementById('fleet-filters');
  fc.innerHTML = vehicleTypes.map((n,i) => {
    let val = i===0 ? 'all' : n;
    let isActive = activeFleetFilter===val;
    let count = i===0 ? DB.vehicles.length : DB.vehicles.filter(v=>v.name===n).length;
    let safeVal = val.replace(/'/g, "\\'");
    let chipColor = val==='all' ? '#16a34a' : getVehicleColor(n);
    let chipBg = isActive ? chipColor : 'transparent';
    let chipTextColor = isActive ? '#fff' : chipColor;
    return '<button class="filter-chip" style="background:'+chipBg+';color:'+chipTextColor+';border-color:'+chipColor+';font-weight:'+(isActive?'700':'600')+';" data-fleet-action="set-filter" data-fleet-filter="' + escapeHtml(safeVal) + '">' + n + ' <span style="font-size:.72rem;opacity:.85;margin-left:3px">' + count + '</span></button>';
  }).join('');

  // --- Build list ---
  let liste = DB.vehicles.filter(v => activeFleetFilter==='all' || v.name === activeFleetFilter);
  if(fleetSearch) liste = liste.filter(v => (v.name+v.plate).toLowerCase().includes(fleetSearch));
  document.getElementById('fleet-count').innerHTML = liste.length + ' ' + translate('avail.vehicles');

  let aujourdhui = new Date(); aujourdhui.setHours(0,0,0,0);
  function fmtD(str){ if(!str) return '—'; let m = str.match(/^(\d{4})-(\d{2})-(\d{2})/); if(m) return m[3]+'/'+m[2]+'/'+m[1]; return str; }
  function daysLeft(dateStr){ if(!dateStr) return null; return Math.round((new Date(dateStr) - new Date()) / 86400000); }

  const DEST_LBL_FL = {workshop:translate('moves.dest.workshop'),washing:translate('moves.dest.washing'),inspection:translate('moves.dest.inspection'),airport:translate('moves.dest.airport'),delivery:translate('moves.dest.delivery'),personal:translate('moves.dest.personal'),office:translate('moves.dest.office'),other:translate('moves.dest.other')};

  let grid = document.getElementById('fleet-grid');
  if(!grid){ console.error('fleet-grid not found'); return; }

  if(liste.length === 0){
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--muted)"><div style="font-size:3rem;margin-bottom:12px">🚗</div><div style="font-size:1.1rem;font-weight:600">'+translate('fleet.noVehiclesFound')+'</div></div>';
    let emptyBar = document.getElementById('pgbar-fleet-grid');
    if(emptyBar) emptyBar.style.display = 'none';
    return;
  }

  // ── Pagination : évite de générer des centaines de cartes DOM d'un coup ──
  if(typeof window._fleetPageState === 'undefined') window._fleetPageState = { page: 0, pageSize: 40 };
  let _fleetPg = renderPaginationBar(grid, window._fleetPageState, liste.length, renderFleet);
  liste = liste.slice(_fleetPg.pageStart, _fleetPg.pageStart + window._fleetPageState.pageSize);

  grid.innerHTML = liste.map(v => {
    // --- Status ---
    let vPlate = (v.plate||'').toLowerCase();
    let enSortie = DB.rentals.some(r => {
      if(r.dateIn && r.dateIn !== '') return false;
      if(r.vehicleId === v.id) return true;
      let rPlate = (r._plate || '').toLowerCase();
      return rPlate && rPlate === vPlate;
    });
    let moveOut = (DB.moves||[]).find(m => !m.dateIn && extractPlateNum(m.plate) === extractPlateNum(vPlate));
    let statusHtml, statusBorder, statusBg;
    if(enSortie){
      statusHtml = '<span style="background:rgba(217,119,6,.15);color:#d97706;border:1.5px solid rgba(217,119,6,.4);border-radius:20px;padding:3px 12px;font-size:.78rem;font-weight:700">'+translate('gps.rented')+'</span>';
      statusBorder = '#d97706'; statusBg = 'rgba(217,119,6,.04)';
    } else if(moveOut){
      let destLabel = DEST_LBL_FL[moveOut.dest]||moveOut.dest||'Out';
      statusHtml = '<span style="background:rgba(99,102,241,.15);color:#6366f1;border:1.5px solid rgba(99,102,241,.4);border-radius:20px;padding:3px 12px;font-size:.78rem;font-weight:700">🔄 '+destLabel+'</span>';
      statusBorder = '#6366f1'; statusBg = 'rgba(99,102,241,.04)';
    } else {
      statusHtml = '<span style="background:rgba(22,163,74,.13);color:var(--green);border:1.5px solid rgba(22,163,74,.35);border-radius:20px;padding:3px 12px;font-size:.78rem;font-weight:700">'+translate('gps.available')+'</span>';
      statusBorder = 'var(--border)'; statusBg = 'transparent';
    }

    // --- Mulkiya badge ---
    let mulkiDays = daysLeft(v.mulkiya);
    let mulkiyaFmt = fmtD(v.mulkiya);
    let mulkiBadge, mulkiIcon;
    if(mulkiDays===null){ mulkiBadge='badge-gray'; mulkiIcon='—'; }
    else if(mulkiDays<=0){ mulkiBadge='badge-red'; mulkiIcon='⚠️ '+mulkiyaFmt+' '+translate('avail.expired'); }
    else if(mulkiDays<=30){ mulkiBadge='badge-red'; mulkiIcon='⚠️ '+mulkiyaFmt+' ('+mulkiDays+'d)'; }
    else if(mulkiDays<=90){ mulkiBadge='badge-yellow'; mulkiIcon='🟡 '+mulkiyaFmt; }
    else { mulkiBadge='badge-green'; mulkiIcon='✓ '+mulkiyaFmt; }

    // --- Ministry badge ---
    let minDays = daysLeft(v.ministryExp);
    let minFmt = fmtD(v.ministryExp);
    let minBadge, minIcon;
    if(minDays===null){ minBadge='badge-gray'; minIcon='—'; }
    else if(minDays<=0){ minBadge='badge-red'; minIcon='⚠️ '+minFmt+' '+translate('avail.expired'); }
    else if(minDays<=30){ minBadge='badge-red'; minIcon='⚠️ '+minFmt+' ('+minDays+'d)'; }
    else if(minDays<=90){ minBadge='badge-yellow'; minIcon='🟡 '+minFmt; }
    else { minBadge='badge-green'; minIcon='✓ '+minFmt; }

    // --- Battery badge ---
    let batDays = daysLeft(v.batteryExp);
    let batFmt = fmtD(v.batteryExp);
    let batBadge, batIcon;
    if(batDays===null){ batBadge='badge-gray'; batIcon='—'; }
    else if(batDays<=0){ batBadge='badge-red'; batIcon='⚠️ '+batFmt+' '+translate('avail.expired'); }
    else if(batDays<=30){ batBadge='badge-red'; batIcon='⚠️ '+batFmt+' ('+batDays+'d)'; }
    else { batBadge='badge-green'; batIcon='✓ '+batFmt; }

    // --- KM / Service ---
    let diffKm = Math.round((v.svcKm||0) - (v.todayKm||0));
    let interval = (v.svcKm||0) - (v.lastSvcKm||0);
    let pctLeft = (interval > 0 && diffKm >= 0) ? Math.min(Math.round(diffKm / interval * 100), 100) : (diffKm <= 0 ? 0 : 100);
    let barColor = pctLeft <= 0 ? '#ef4444' : pctLeft <= 10 ? '#f97316' : pctLeft <= 30 ? '#eab308' : '#22c55e';
    let kmColor = diffKm <= 0 ? '#ef4444' : diffKm < 1000 ? '#f97316' : 'var(--green)';
    let kmLabel = diffKm <= 0 ? translate('svc.serviceDue') : diffKm.toLocaleString()+' '+translate('svc.kmLeft');
    let progressBar = interval > 0
      ? `<div style="margin-top:5px;background:var(--border);border-radius:4px;height:5px"><div style="width:${pctLeft}%;background:${barColor};height:5px;border-radius:4px;transition:width .4s"></div></div><div style="font-size:.67rem;color:var(--muted);margin-top:2px">${pctLeft}% ${translate('fleet.untilNextService')}</div>`
      : '';

    // --- KM odometer ---
    let kmDisplay = v.todayKm ? Number(v.todayKm).toLocaleString()+' km' : '—';

    // --- Vehicle badge color ---
    let vBadgeStyle = getVehicleBadgeStyle(v.name);

    // --- Oil notes ---
    let oilHtml = v.oilNotes ? `<span title="${v.oilNotes}" style="font-size:.72rem;background:rgba(37,99,235,.12);color:#2563eb;border:1px solid rgba(37,99,235,.25);border-radius:10px;padding:1px 7px">${translate('fleet.oilOk')}</span>` : '';

    // --- Balance due: REMOVED from Database view ---
    let balBannerHtml = '';

    // --- Card border color based on alert urgency ---
    let hasAlert = (mulkiDays!==null&&mulkiDays<=30)||(minDays!==null&&minDays<=30)||(batDays!==null&&batDays<=30)||diffKm<=0;
    let cardBorderTop = hasAlert ? '3px solid var(--red)' : enSortie ? '3px solid #d97706' : '3px solid var(--green)';

    // --- Bureau coloring ---
    let bureauRaw = (v.branch || '').trim();
    let bureauLower = bureauRaw.toLowerCase();
    let bureauBg = '', bureauBorder = '', bureauBadgeHtml = '';
    if(bureauRaw){
      // Barka = bleu, Moebela = violet, autres = teal
      if(bureauLower.includes('canceled') || bureauLower.includes('cancelled')){
        bureauBg = 'rgba(185,28,28,.08)';
        bureauBorder = '2px solid rgba(220,38,38,.5)';
        bureauBadgeHtml = `<span style="background:rgba(220,38,38,.18);color:#dc2626;border:1px solid rgba(220,38,38,.45);border-radius:20px;padding:2px 10px;font-size:.72rem;font-weight:700;flex-shrink:0">🚫 ${bureauRaw}</span>`;
      } else if(bureauLower.includes('barka')){
        bureauBg = 'rgba(37,99,235,.07)';
        bureauBorder = '2px solid rgba(37,99,235,.45)';
        bureauBadgeHtml = `<span style="background:rgba(37,99,235,.15);color:#2563eb;border:1px solid rgba(37,99,235,.4);border-radius:20px;padding:2px 10px;font-size:.72rem;font-weight:700;flex-shrink:0">🏢 ${bureauRaw}</span>`;
      } else if(bureauLower.includes('moebela') || bureauLower.includes('moabela') || bureauLower.includes('mabela')){
        bureauBg = 'rgba(124,58,237,.07)';
        bureauBorder = '2px solid rgba(124,58,237,.45)';
        bureauBadgeHtml = `<span style="background:rgba(124,58,237,.15);color:#7c3aed;border:1px solid rgba(124,58,237,.4);border-radius:20px;padding:2px 10px;font-size:.72rem;font-weight:700;flex-shrink:0">🏢 ${bureauRaw}</span>`;
      } else {
        bureauBg = 'rgba(13,148,136,.07)';
        bureauBorder = '2px solid rgba(13,148,136,.45)';
        bureauBadgeHtml = `<span style="background:rgba(13,148,136,.15);color:#0d9488;border:1px solid rgba(13,148,136,.4);border-radius:20px;padding:2px 10px;font-size:.72rem;font-weight:700;flex-shrink:0">🏢 ${bureauRaw}</span>`;
      }
    }
    let cardStyle = bureauRaw
      ? `background:${bureauBg};border:${bureauBorder};border-radius:12px;overflow:hidden;border-top:${cardBorderTop};box-shadow:0 1px 4px rgba(0,0,0,.06);transition:box-shadow .2s,transform .15s;cursor:default`
      : `background:var(--s1);border:1px solid var(--border);border-radius:12px;overflow:hidden;border-top:${cardBorderTop};box-shadow:0 1px 4px rgba(0,0,0,.06);transition:box-shadow .2s,transform .15s;cursor:default`;

    return `<div draggable="true" data-vid="${v.id}" style="${cardStyle}"
      onmouseover="this.style.boxShadow='0 4px 16px rgba(0,0,0,.12)';this.style.transform='translateY(-1px)'"
      onmouseout="this.style.boxShadow='0 1px 4px rgba(0,0,0,.06)';this.style.transform='translateY(0)'">

      <!-- Card header -->
      <div style="padding:10px 14px;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--border);flex-wrap:wrap">
        <span style="cursor:grab;color:var(--dim);font-size:1.1rem;flex-shrink:0" title="${translate('fleet.dragReorder')}">⠿</span>
        <span class="badge" style="${vBadgeStyle};font-size:.82rem;font-weight:700;flex-shrink:0">${escapeHtml(v.name)}</span>
        <span style="font-family:var(--mono);font-weight:700;font-size:.92rem;color:var(--text);flex-shrink:0">${escapeHtml(v.plate)}</span>
        <span style="display:inline-flex;gap:4px;flex-shrink:0;white-space:nowrap">
          <button class="btn btn-ghost" title="Voir / Télécharger Mulkiya" style="padding:3px 7px;font-size:.78rem;line-height:1" data-fleet-action="view-mulkiya" data-fleet-id="${v.id}">📄</button>
          <button class="btn btn-ghost" title="Imprimer Mulkiya" style="padding:3px 7px;font-size:.78rem;line-height:1" data-fleet-action="print-mulkiya" data-fleet-id="${v.id}">🖨️</button>
          <button class="btn btn-ghost" title="Upload nouvelle Mulkiya" style="padding:3px 7px;font-size:.78rem;line-height:1" data-fleet-action="upload-mulkiya" data-fleet-id="${v.id}">📤</button>
        </span>
        ${bureauBadgeHtml}
        <div style="flex-shrink:0;margin-left:auto">${statusHtml}</div>
      </div>

      <!-- Card body -->
      <div style="padding:12px 14px;display:flex;flex-direction:column;gap:9px">

        <!-- Docs row -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:7px">
          <div style="background:var(--s2);border-radius:7px;padding:7px 9px">
            <div style="font-size:.68rem;text-transform:uppercase;letter-spacing:.4px;color:var(--muted);font-weight:600;margin-bottom:3px">${translate('avail.mulkiya')}</div>
            <span class="badge ${mulkiBadge}" style="font-size:.72rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;display:block">${mulkiIcon}</span>
          </div>
          <div style="background:var(--s2);border-radius:7px;padding:7px 9px">
            <div style="font-size:.68rem;text-transform:uppercase;letter-spacing:.4px;color:var(--muted);font-weight:600;margin-bottom:3px">${translate('avail.ministry')}</div>
            <span class="badge ${minBadge}" style="font-size:.72rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;display:block">${minIcon}</span>
          </div>
        </div>

        ${oilHtml ? `<div>${oilHtml}</div>` : ''}

        ${balBannerHtml}

      </div>

      <!-- Card footer: actions -->
      <div style="padding:8px 14px 10px;display:flex;gap:6px;justify-content:flex-end;border-top:1px solid var(--border)">
        <button class="btn btn-ghost" style="padding:5px 14px;font-size:.82rem" data-fleet-action="edit-vehicle" data-fleet-id="${v.id}">✏️ ${translate('gps.edit')}</button>
        <button class="btn btn-ghost btn-delete" style="padding:5px 10px;font-size:.82rem" data-fleet-action="delete-vehicle" data-fleet-id="${v.id}">🗑️</button>
      </div>
    </div>`;
  }).join('');

  if(editMode) mettreAJourInterfaceEdition();
  initFleetDragDrop();
}

// ── filterFleet (orig. line 8775) ──
function filterFleet(q){ fleetSearch = q.toLowerCase(); if(window._fleetPageState) window._fleetPageState.page = 0; renderFleet(); }

// ── Mulkiya photo: view / print / upload (overwrite) ──
// (2026-08) Migration base64 → fichiers sur disque. Avant : v.mulkiyaPhoto
// contenait l'image ENTIÈRE en base64 (parfois 2-4 Mo par véhicule), ce qui
// gonflait chaque /save et causait des coupures réseau sur les postes en
// connexion lente (Barka). Maintenant : v.mulkiyaPhoto ne contient plus
// qu'un chemin léger ("mulkiya/1234-T.jpg"), le fichier réel vit dans
// D:\DOSSIER-DEMO\MULKIYA côté serveur, servi par GET /mulkiya/*.
// encodeURI() gère les espaces dans les noms de fichiers ("1234-T KIA RIO.jpeg").
function viewMulkiyaPhoto(id){
  let v = DB.vehicles.find(x => x.id === id); if(!v) return;
  if(!v.mulkiyaPhoto){ toast('Aucune Mulkiya uploadée pour ce véhicule'); return; }
  window.open(encodeURI(v.mulkiyaPhoto), '_blank');
}
function printMulkiyaPhoto(id){
  let v = DB.vehicles.find(x => x.id === id); if(!v) return;
  if(!v.mulkiyaPhoto){ toast('Aucune Mulkiya uploadée pour ce véhicule'); return; }
  let w = window.open('', '_blank');
  w.document.write('<html><head><title>Mulkiya - '+v.plate+'</title></head><body style="margin:0;display:flex;align-items:center;justify-content:center;background:#fff"><img src="'+encodeURI(v.mulkiyaPhoto)+'" style="max-width:100%;max-height:100vh" onload="window.print()"></body></html>');
  w.document.close();
}
// ── Upload d'une photo mulkiya vers le serveur (remplace l'ancien base64) ──
// Envoie le fichier à /api/upload-mulkiya-photo (multipart), le serveur
// l'écrit sur disque et renvoie juste le chemin relatif à stocker.
function _uploadMulkiyaFile(file, plate){
  let fd = new FormData();
  fd.append('plate', plate);
  fd.append('file', file, file.name);
  return fetch('/api/upload-mulkiya-photo', { method:'POST', credentials:'same-origin', headers: { 'x-auth-token': (window.AUTH && window.AUTH.token) || '' }, body: fd })
    .then(r => r.json())
    .then(res => {
      if(!res || !res.ok) throw new Error((res && res.error) || 'Upload échoué');
      return res.path; // ex: "mulkiya/1234-T.jpg"
    });
}
function uploadMulkiyaPhoto(id){
  let v = DB.vehicles.find(x => x.id === id); if(!v) return;
  let input = document.createElement('input');
  input.type = 'file'; input.accept = 'image/*';
  input.onchange = function(){
    let file = input.files[0]; if(!file) return;
    _uploadMulkiyaFile(file, v.plate).then(relPath => {
      v.mulkiyaPhoto = relPath;
      if(typeof saveVehicle === 'function') saveVehicle(v.id);
      if(typeof logAction === 'function') logAction('edit_vehicle', '📄 Mulkiya Photo Updated', 'Plate: '+v.plate, v.plate);
      toast('Mulkiya mise à jour');
      refreshAll();
    }).catch(err => {
      console.error('Mulkiya upload error:', err);
      toast('Échec upload Mulkiya: ' + err.message);
    });
  };
  input.click();
}

// ── Mulkiya batch import — match filenames to plate numbers automatically ──
function _normPlateForMatch(s){ return String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,''); }
function uploadMulkiyaBatch(){
  let input = document.createElement('input');
  input.type = 'file'; input.accept = 'image/*'; input.multiple = true;
  input.onchange = function(){
    let files = Array.from(input.files || []);
    if(!files.length) return;
    let matched = [], unmatched = [];
    let pending = files.length;
    function finish(){
      if(typeof logAction === 'function') logAction('edit_vehicle', '📦 Mulkiya — Import groupé', 'Importées: '+matched.length+' | Non reconnus: '+unmatched.length+(unmatched.length ? ' ('+unmatched.join(', ')+')' : ''), '');
      toast(matched.length+' Mulkiya importée(s)'+(unmatched.length ? ' — '+unmatched.length+' fichier(s) non reconnu(s)' : ''));
      if(unmatched.length) console.warn('Mulkiya — fichiers non appariés à une plaque:', unmatched);
      refreshAll();
    }
    files.forEach(file => {
      let base = file.name.replace(/\.[^.]+$/, '');
      let firstToken = base.split(/\s+/)[0];
      let normToken = _normPlateForMatch(firstToken);
      let normFull = _normPlateForMatch(base);
      let v = DB.vehicles.find(x => _normPlateForMatch(x.plate) === normToken)
           || DB.vehicles.find(x => { let np = _normPlateForMatch(x.plate); return np.length >= 3 && normFull.includes(np); });
      if(!v){ unmatched.push(file.name); pending--; if(pending === 0) finish(); return; }
      _uploadMulkiyaFile(file, v.plate).then(relPath => {
        v.mulkiyaPhoto = relPath;
        if(typeof saveVehicle === 'function') saveVehicle(v.id);
        matched.push(v.plate);
        pending--; if(pending === 0) finish();
      }).catch(err => {
        console.error('Mulkiya batch upload error for', v.plate, err);
        unmatched.push(file.name+' (upload échoué)');
        pending--; if(pending === 0) finish();
      });
    });
  };
  input.click();
}

// ── getEffectiveKm (orig. line 8777) ──
function getEffectiveKm(v, idx){
  // Use unified function: scans Daily Rentals + Internal Movements, sorted by datetime.
  // Si un index pré-construit (_buildKmIndex(), voir module-service-km.js) est
  // passé en 2e argument, lookup O(1) au lieu de rescanner tout l'historique —
  // à utiliser quand on appelle getEffectiveKm() en boucle sur DB.vehicles.
  let dynamicKm = idx ? getLatestKmFromIndex(idx, v.id, v.plate) : getLatestKmFromRentals(v.id, v.plate);
  if(dynamicKm !== null && dynamicKm > 0) return dynamicKm;
  return v.todayKm || 0;
}
// ── openAddVehicle (orig. line 9038) ──
function openAddVehicle(){ editingVehicleId = null; document.getElementById('modal-vehicle-title').innerHTML = translate('fleet.addVehicle'); ['v-name','v-plate','v-mulkiya','v-ministry-exp','v-svc-km','v-svc-date','v-today-km','v-km-to-do','v-oil-date','v-oil-km','v-oil-notes'].forEach(id => { let el = document.getElementById(id); if(el) el.value = ''; }); populateBranchSelect('v-branch', (window.AUTH && !window.AUTH.isAdmin && window.AUTH.branches && window.AUTH.branches[0]) || ''); openModal('modal-vehicle'); }
// ── editVehicle (orig. line 9039) ──
function editVehicle(id){ let v = DB.vehicles.find(v => v.id === id); if(!v) return; editingVehicleId = id; document.getElementById('modal-vehicle-title').innerHTML = (v.name||'') + ' &mdash; ' + v.plate; document.getElementById('v-name').value = v.name; document.getElementById('v-plate').value = v.plate; document.getElementById('v-mulkiya').value = v.mulkiya || ''; document.getElementById('v-ministry-exp').value = v.ministryExp || ''; document.getElementById('v-color').value = v.customColor || '#16a34a'; document.getElementById('v-color-preview').textContent = v.customColor ? translate('fleet.custom') : translate('fleet.auto'); populateBranchSelect('v-branch', v.branch || v.bureau || ''); openModal('modal-vehicle'); }
// ── saveVehicle (orig. line 9040) ──
function saveVehicleModal(){ let nom = document.getElementById('v-name').value.trim(); let plaque = document.getElementById('v-plate').value.trim(); if(!nom || !plaque){ toast(translate('fleet.requiredFields')); return; }
  // ── Anti-doublon plate : une même plaque ne peut pas exister 2x dans le Fleet ──
  let _normP = (typeof _normPlate === 'function') ? _normPlate : (p => (p||'').toString().trim().replace(/[\s-]+/g,'').toUpperCase());
  let _dupVeh = DB.vehicles.find(v => v.id !== editingVehicleId && _normP(v.plate) === _normP(plaque));
  if(_dupVeh){ toast(translate('fleet.duplicatePlate') + (_dupVeh.name||translate('fleet.duplicateAnother'))); return; }
  // Preserve existing service/oil data when editing from Database modal
  let existing = editingVehicleId ? (DB.vehicles.find(v => v.id === editingVehicleId) || {}) : {};
  let customColor = document.getElementById('v-color').value;
  let branchVal = (document.getElementById('v-branch') ? document.getElementById('v-branch').value.trim() : '') || undefined;
  // Sécurité : un compte de branche (non-admin) ne peut jamais assigner une autre branche que la sienne
  if(window.AUTH && !window.AUTH.isAdmin && Array.isArray(window.AUTH.branches) && window.AUTH.branches.length){
    branchVal = window.AUTH.branches[0];
  }
  let data = {
    name: nom,
    plate: plaque,
    customColor: customColor || undefined,
    branch: branchVal,
    mulkiya: document.getElementById('v-mulkiya').value,
    batteryExp: existing.batteryExp || '',
    ministryExp: document.getElementById('v-ministry-exp').value,
    // Preserve service & KM fields (edited only from Service & KM menu)
    svcKm: existing.svcKm || 0,
    lastSvcKm: existing.lastSvcKm || 0,
    lastSvcDate: existing.lastSvcDate || '',
    todayKm: existing.todayKm || 0,
    kmToDo: existing.kmToDo || 0,
    oilDate: existing.oilDate || '',
    oilKm: existing.oilKm || 0,
    oilNotes: existing.oilNotes || '',
    // FIX 01/08/2026 : timestamp d'édition explicite — même principe que pour les clients,
    // empêche l'autosave silencieux d'un poste resté ouvert avec une vieille copie de
    // DB.vehicles d'écraser une modif plus récente faite depuis l'autre branche.
    updatedAt: Date.now()
  }; pushUndo(); if(editingVehicleId){ let i = DB.vehicles.findIndex(v => v.id === editingVehicleId); if(i !== -1){ let old = DB.vehicles[i]; let fieldLabels = {name:'Vehicle Name',plate:'Plate',branch:'Branch',mulkiya:'Mulkiya Expiry',batteryExp:'Battery Expiry',ministryExp:'Ministry of Transportation Expiry',svcKm:'Service Target KM',lastSvcDate:'Last Service Date',todayKm:'Current KM',kmToDo:'KM To Do',oilDate:'Oil Date',oilKm:'Oil KM',oilNotes:'Oil Notes',customColor:'Badge Color'}; let changes = []; Object.keys(fieldLabels).forEach(k => { let ov = String(old[k]!==undefined&&old[k]!==null?old[k]:'—'); let nv = String(data[k]!==undefined&&data[k]!==null&&data[k]!==''?data[k]:'—'); if(ov !== nv) changes.push(fieldLabels[k]+': ['+ov+'] → ['+nv+']'); }); DB.vehicles[i] = {...old,...data}; let detail = changes.length ? changes.join(' | ') : (typeof translate === 'function' ? translate('fleet.noModification') : 'No modification detected'); logAction('edit_vehicle', '✏️ Database — Edit Vehicle '+nom+' ('+plaque+')', detail, plaque); // Propager la couleur custom à TOUS les véhicules du même nom
if(data.customColor){ DB.vehicles.forEach((vv,ii) => { if(vv.name === nom && ii !== i){ DB.vehicles[ii] = {...vv, customColor: data.customColor}; } }); } } var _savedVehicleId = editingVehicleId; } else { DB.vehicles.push({id:_genId(), ...data}); let detail = 'Name: '+nom+' | Plate: '+plaque+' | Current KM: '+data.todayKm+' | Mulkiya: '+(data.mulkiya||'—')+' | Service cible: '+data.svcKm+' km'; logAction('new_vehicle', '➕ Database — New Vehicle '+nom+' ('+plaque+')', detail, plaque); var _savedVehicleId = DB.vehicles[DB.vehicles.length-1].id; } updateLogBadge(); closeModal('modal-vehicle'); refreshAll();
  // ── Sauvegarde effective côté serveur (avant on affichait juste un toast sans sauver) ──
  if(_savedVehicleId) {
    saveVehicle(_savedVehicleId);
    // Si la couleur a été propagée à d'autres véhicules du même nom, les sauver aussi
    // MAIS: seulement si la couleur a VRAIMENT changé, pas juste du bruit du modal
    let originalVehicle = DB.vehicles.find(v => v.id === editingVehicleId);
    if(data.customColor && originalVehicle && originalVehicle.customColor !== data.customColor) { 
      DB.vehicles.forEach(vv => { 
        if(vv.name === nom && vv.id !== _savedVehicleId) saveVehicle(vv.id); 
      }); 
    }
  }
}

// ── initFleetDragDrop (orig. line 10292) ──
// Event delegation : les listeners sont attachés UNE SEULE FOIS sur le
// conteneur `grid` (via un flag data-drag-init), au lieu de 5 listeners
// par carte véhicule re-créés à chaque appel de renderFleet(). Avec ~40-50
// véhicules, ça évitait de recréer ~200-250 listeners à chaque rendu.
function initFleetDragDrop(){
  const grid = document.getElementById('fleet-grid');
  if(!grid) return;
  if(grid.dataset.dragInit === '1') return; // déjà initialisé, ne pas re-attacher
  grid.dataset.dragInit = '1';

  let draggingCard = null;

  grid.addEventListener('dragstart', e => {
    const card = e.target.closest('div[draggable]');
    if(!card) return;
    draggingCard = card;
    card.style.opacity = '0.4';
    e.dataTransfer.effectAllowed = 'move';
  });

  grid.addEventListener('dragend', e => {
    const card = e.target.closest('div[draggable]');
    if(!card) return;
    draggingCard = null;
    card.style.opacity = '1';
    grid.querySelectorAll('div[data-vid]').forEach(c => c.style.outline = '');
  });

  grid.addEventListener('dragover', e => {
    const card = e.target.closest('div[data-vid]');
    if(!card) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if(draggingCard && draggingCard !== card){
      grid.querySelectorAll('div[data-vid]').forEach(c => c.style.outline = '');
      card.style.outline = '2.5px solid #60a5fa';
    }
  });

  grid.addEventListener('dragleave', e => {
    const card = e.target.closest('div[data-vid]');
    if(!card) return;
    card.style.outline = '';
  });

  grid.addEventListener('drop', e => {
    const card = e.target.closest('div[data-vid]');
    if(!card) return;
    e.preventDefault();
    if(!draggingCard || draggingCard === card) return;
    card.style.outline = '';
    const allCards = [...grid.querySelectorAll('div[data-vid]')];
    const fromIdx = allCards.indexOf(draggingCard);
    const toIdx   = allCards.indexOf(card);
    if(fromIdx === -1 || toIdx === -1) return;
    if(fromIdx < toIdx){
      card.parentNode.insertBefore(draggingCard, card.nextSibling);
    } else {
      card.parentNode.insertBefore(draggingCard, card);
    }
    const newOrder = [...grid.querySelectorAll('div[data-vid]')].map(c => Number(c.dataset.vid));
    const vehicleMap = {};
    DB.vehicles.forEach(v => vehicleMap[v.id] = v);
    const ordered = newOrder.map(id => vehicleMap[id]).filter(Boolean);
    const rest = DB.vehicles.filter(v => !newOrder.includes(v.id));
    DB.vehicles = [...ordered, ...rest];
    draggingCard.style.background = 'rgba(96,165,250,.1)';
    setTimeout(() => { if(draggingCard) draggingCard.style.background = ''; }, 600);
    // Drag reorder: sauvegarder tous les véhicules affectés (ordre changed)
    DB.vehicles.forEach(v => saveVehicle(v.id));
    showToast(translate('dash.orderSaved'));
  });
}

// ════════════════════════════════════════════════════════════════
// BRANCHES — menu déroulant extensible (BARKA / MOEBELA / + futures)
// ════════════════════════════════════════════════════════════════

// ── populateBranchSelect — remplit un <select> avec la liste des branches ──
// selectId: id du <select>. selectedValue: valeur à présélectionner.
// Si l'utilisateur connecté n'est PAS admin, le select est verrouillé sur sa branche.
function populateBranchSelect(selectId, selectedValue){
  let sel = document.getElementById(selectId);
  if(!sel) return;
  let list = (DB.branches && DB.branches.length) ? DB.branches.slice() : ['BARKA', 'MOEBELA'];
  // Toujours inclure la valeur existante même si elle a été supprimée de la liste (ancien enregistrement)
  if(selectedValue && !list.includes(selectedValue)) list.push(selectedValue);

  let isRestricted = window.AUTH && !window.AUTH.isAdmin && Array.isArray(window.AUTH.branches) && window.AUTH.branches.length > 0;
  if(isRestricted){
    // Compte de branche : un seul choix possible, verrouillé
    let myBranch = window.AUTH.branches[0];
    sel.innerHTML = `<option value="${myBranch}">${myBranch}</option>`;
    sel.value = myBranch;
    sel.disabled = true;
  } else {
    sel.disabled = false;
    sel.innerHTML = '<option value="">—</option>' + list.map(b => `<option value="${b}">${b}</option>`).join('');
    sel.value = selectedValue || '';
  }
}

// ── promptAddBranch — ajoute une nouvelle branche (directeur uniquement) ──
function promptAddBranch(){
  if(window.AUTH && !window.AUTH.isAdmin){
    toast(translate('fleet.onlyDirectorBranch'));
    return;
  }
  let name = prompt(translate('fleet.newBranchPrompt'));
  if(!name || !name.trim()) return;
  let clean = name.trim().toUpperCase();
  fetch('/api/branches', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-auth-token': (window.AUTH && window.AUTH.token) || '' },
    body: JSON.stringify({ name: clean })
  })
  .then(r => r.json())
  .then(r => {
    if(r.ok){
      DB.branches = r.branches;
      populateBranchSelect('v-branch', clean);
      toast(t(translate('fleet.branchAdded'), clean));
    } else {
      toast('❌ ' + (r.error || translate('fleet.error')));
    }
  })
  .catch(() => toast(translate('fleet.networkError')));
}
window.populateBranchSelect = populateBranchSelect;
window.promptAddBranch = promptAddBranch;


// ── Délégation d'événements (2026-08) — remplace les onclick= inline sur
// tous les boutons/lignes générés dynamiquement ci-dessus (dashboard,
// tableau "sorties", tableau "ateliers", filtres flotte, cartes véhicule).
// Comportement strictement identique, y compris le stopPropagation() sur
// les 3 boutons Mulkiya qui l'utilisaient déjà.
document.addEventListener('click', function(e){
  let btn = e.target.closest('[data-fleet-action]');
  if(!btn) return;
  let action = btn.dataset.fleetAction;
  if(action === 'scroll-to-alerts'){
    document.getElementById('dash-alerts-panel')?.scrollIntoView({behavior:'smooth'});
  } else if(action === 'goto-contract'){
    goToContract(Number(btn.dataset.fleetId));
  } else if(action === 'goto-nav'){
    goTo(btn.dataset.fleetPage, document.querySelector('.nav-item[data-nav-page="' + btn.dataset.fleetPage + '"]'));
  } else if(action === 'payment-history'){
    e.stopPropagation();
    showPaymentHistory(btn.dataset.fleetContract, btn.dataset.fleetBranch);
  } else if(action === 'set-filter'){
    setFilter(btn.dataset.fleetFilter, btn);
  } else if(action === 'view-mulkiya'){
    e.stopPropagation();
    viewMulkiyaPhoto(Number(btn.dataset.fleetId));
  } else if(action === 'print-mulkiya'){
    e.stopPropagation();
    printMulkiyaPhoto(Number(btn.dataset.fleetId));
  } else if(action === 'upload-mulkiya'){
    e.stopPropagation();
    uploadMulkiyaPhoto(Number(btn.dataset.fleetId));
  } else if(action === 'edit-vehicle'){
    editVehicle(Number(btn.dataset.fleetId));
  } else if(action === 'delete-vehicle'){
    deleteVehicle(Number(btn.dataset.fleetId));
  } else if(action === 'dv2-refresh'){
    let ic = btn.querySelector('svg');
    if(ic){ ic.style.animation = 'dv-spin .6s ease-in-out'; setTimeout(function(){ ic.style.animation = ''; }, 650); }
    buildDashboard();
  } else if(action === 'dv2-export'){
    dv2ExportCsv();
  } else if(action === 'dv2-feed-filter'){
    window._dv2FeedFilter = btn.getAttribute('data-dv2-filter') || 'all';
    dv2RenderFeed();
  }
});
