// ── Calendrier universel (jours, mois, années) ────────────────────────────
// Affiche un calendrier adaptable selon le type:
// - "day": grille de jours (Daily stats)
// - "month": grille de mois (Monthly, Vehicle, Cheque stats)
// - "year": grille d'années (Yearly stats)
// 
// Remplace les inputs natifs côté visuel, garde les inputs cachés avec même ID
// pour compatibilité avec tout le code existant.

// ── Fix (2026-08) : listeners globaux uniques au lieu d'un scroll/resize/
// click par calendrier créé — avant, openMonthCalendar() ajoutait 3 nouveaux
// listeners à CHAQUE premier ouverture d'un calendrier jamais vu (un par
// hiddenInputId distinct : daily-stats, monthly-stats, vehicle-stats,
// cheque-stats...), sans jamais les retirer. Impact réel faible vu le
// nombre de calendriers fixe dans l'app, mais listeners jamais nettoyés =
// mauvaise pratique qui deviendrait un vrai problème si un calendrier était
// un jour généré dynamiquement (une ligne de tableau, par ex). Maintenant :
// un seul scroll/resize/click enregistré une fois pour toutes, qui
// s'applique à tous les popovers ouverts via leur référence stockée
// (pop._triggerBtn).
function _calRepositionAllOpen(){
  document.querySelectorAll('.cal-popover').forEach(function(pop){
    if(pop.style.display !== 'none' && pop._triggerBtn) _calPositionPopover(pop, pop._triggerBtn);
  });
}
window.addEventListener('scroll', _calRepositionAllOpen, true);
window.addEventListener('resize', _calRepositionAllOpen);
document.addEventListener('click', function(e){
  document.querySelectorAll('.cal-popover').forEach(function(pop){
    if(pop.style.display === 'none') return;
    let btnEl = pop._triggerBtn;
    if(!pop.contains(e.target) && e.target !== btnEl && !(btnEl && btnEl.contains(e.target))){
      pop.style.display = 'none';
    }
  });
});

// ── Event delegation for data-cal-action buttons ──
(function() {
  document.addEventListener('click', function(e) {
    const btn = e.target.closest('[data-cal-action]');
    if (!btn) return;
    e.preventDefault();
    const action = btn.dataset.calAction;
    const hiddenInputId = btn.dataset.inputId;
    const type = btn.dataset.calType || 'month';
    const delta = Number(btn.dataset.delta);
    const year = Number(btn.dataset.year);
    const month = Number(btn.dataset.month);
    const day = Number(btn.dataset.day);
    
    if (action === 'shift') _calShift(hiddenInputId, type, delta);
    else if (action === 'pick') _calPick(hiddenInputId, type, year, month, day);
  });
})();

var MCAL_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function _mcalMonthsShort(){
  if(typeof translate !== 'function' || (window._currentLang||'en') === 'en') return MCAL_MONTHS;
  var out = [];
  for(var i=0;i<12;i++) out.push(translate('month.'+i));
  return out;
}

// Label pour le button trigger (adapté au type)
function _calLabelFor(value, type){
  if(!value) {
    if(typeof translate === 'function') {
      if(type === 'day') return translate('daily.selectDate') || 'Select date';
      if(type === 'year') return translate('yearly.selectYear') || 'Select year';
      return translate('daily.selectMonth') || 'Select month';
    }
    if(type === 'day') return 'Select date';
    if(type === 'year') return 'Select year';
    return 'Select month';
  }
  
  var parts = value.split('-');
  if(type === 'day') {
    var y = parts[0], m = parseInt(parts[1], 10), d = parseInt(parts[2], 10);
    return _mcalMonthsShort()[m - 1] + ' ' + d + ', ' + y;
  }
  if(type === 'year') {
    return parts[0];
  }
  // month
  var y = parts[0], m = parseInt(parts[1], 10);
  return _mcalMonthsShort()[m - 1] + ' ' + y;
}

// Met à jour les labels sur tous les buttons trigger
function refreshMonthCalendarLabels(){
  document.querySelectorAll('[data-cal-trigger][data-input]').forEach(function(btn){
    var input = document.getElementById(btn.dataset.input);
    var label = document.getElementById(btn.dataset.input + '-label');
    var type = btn.dataset.calType || 'month';
    if(input && label) label.textContent = _calLabelFor(input.value, type);
  });
}

function openMonthCalendar(hiddenInputId, btnEl){
  var type = btnEl.dataset.calType || 'month';
  var calId = 'cal-' + type + '-' + hiddenInputId;
  var existing = document.getElementById(calId);
  
  if(existing){
    var willShow = existing.style.display === 'none';
    document.querySelectorAll('.cal-popover').forEach(function(p){ p.style.display = 'none'; });
    if(willShow){ 
      existing._triggerBtn = btnEl; // rafraîchi au cas où le bouton a été recréé par un re-render
      existing.style.display = 'block'; 
      _calPositionPopover(existing, btnEl);
      _calRenderGrid(hiddenInputId, type, parseInt(existing.dataset.year, 10), parseInt(existing.dataset.month||1, 10));
    }
    return;
  }
  
  document.querySelectorAll('.cal-popover').forEach(function(p){ p.style.display = 'none'; });

  var input = document.getElementById(hiddenInputId);
  var now = new Date();
  var cur, year, month, day;
  
  if(input && input.value) {
    var parts = input.value.split('-');
    year = parseInt(parts[0], 10);
    month = parts[1] ? parseInt(parts[1], 10) : now.getMonth() + 1;
    day = parts[2] ? parseInt(parts[2], 10) : 1;
  } else {
    year = now.getFullYear();
    month = now.getMonth() + 1;
    day = now.getDate();
  }

  var pop = document.createElement('div');
  pop.id = calId;
  pop.className = 'cal-popover';
  pop.dataset.year = year;
  pop.dataset.month = month;
  pop.dataset.type = type;
  
  var navLbl = (type === 'day') ? _mcalMonthsShort()[month-1] + ' ' + year : 
               (type === 'year') ? year : year;
  
  pop.innerHTML =
    '<div class="cal-head">' +
      '<button type="button" class="cal-nav" data-cal-action="shift" data-input-id="' + hiddenInputId + '" data-cal-type="' + type + '" data-delta="-1">◀</button>' +
      '<span class="cal-period" id="cal-period-' + hiddenInputId + '">' + navLbl + '</span>' +
      '<button type="button" class="cal-nav" data-cal-action="shift" data-input-id="' + hiddenInputId + '" data-cal-type="' + type + '" data-delta="1">▶</button>' +
    '</div>' +
    '<div class="cal-grid" id="cal-grid-' + hiddenInputId + '"></div>';

  // Référence stockée sur le popover — lue par les listeners globaux
  // uniques (scroll/resize/click-outside) déclarés une fois en haut du
  // fichier, au lieu d'en recréer 3 par calendrier ouvert.
  pop._triggerBtn = btnEl;

  // Position:fixed anchored to the trigger button's live coordinates so the
  // popover always escapes ancestor overflow:hidden / sticky headers (mod-hero).
  document.body.appendChild(pop);
  pop.style.display = 'block';
  _calPositionPopover(pop, btnEl);
  _calRenderGrid(hiddenInputId, type, year, month, day);
}

function _calPositionPopover(pop, btnEl){
  var r = btnEl.getBoundingClientRect();
  var popW = pop.offsetWidth || 260;
  var left = Math.min(r.left, window.innerWidth - popW - 10);
  left = Math.max(10, left);
  var top = r.bottom + 6;
  if(top + pop.offsetHeight > window.innerHeight - 10 && r.top - pop.offsetHeight - 6 > 0){
    top = r.top - pop.offsetHeight - 6; // flip above if no room below
  }
  pop.style.position = 'fixed';
  pop.style.top = top + 'px';
  pop.style.left = left + 'px';
}

function _calShift(hiddenInputId, type, delta){
  var calId = 'cal-' + type + '-' + hiddenInputId;
  var pop = document.getElementById(calId);
  if(!pop) return;
  
  var year = parseInt(pop.dataset.year, 10);
  var month = parseInt(pop.dataset.month, 10);
  
  if(type === 'day' || type === 'month') {
    month += delta;
    if(month > 12) { month = 1; year++; }
    else if(month < 1) { month = 12; year--; }
  } else if(type === 'year') {
    year += delta * 10; // Sauts de 10 ans pour l'année
  }
  
  pop.dataset.year = year;
  pop.dataset.month = month;
  var navLbl = (type === 'day') ? _mcalMonthsShort()[month-1] + ' ' + year : 
               (type === 'year') ? (year - 9) + ' - ' + (year + 10) : year;
  document.getElementById('cal-period-' + hiddenInputId).textContent = navLbl;
  _calRenderGrid(hiddenInputId, type, year, month);
}

function _calRenderGrid(hiddenInputId, type, year, month, selectedDay){
  var grid = document.getElementById('cal-grid-' + hiddenInputId);
  if(!grid) return;
  
  var input = document.getElementById(hiddenInputId);
  var curVal = input ? input.value : '';
  var selY = curVal ? parseInt(curVal.split('-')[0], 10) : null;
  var selM = curVal ? parseInt(curVal.split('-')[1], 10) : null;
  var selD = (curVal && curVal.split('-')[2]) ? parseInt(curVal.split('-')[2], 10) : null;
  
  var now = new Date();
  var todayY = now.getFullYear();
  var todayM = now.getMonth() + 1;
  var todayD = now.getDate();

  if(type === 'day') {
    _renderDayGrid(grid, hiddenInputId, year, month, selY, selM, selD, todayY, todayM, todayD);
  } else if(type === 'month') {
    _renderMonthGrid(grid, hiddenInputId, year, selY, selM, todayY, todayM);
  } else if(type === 'year') {
    _renderYearGrid(grid, hiddenInputId, year, selY, todayY);
  }
}

function _renderDayGrid(grid, hiddenInputId, year, month, selY, selM, selD, todayY, todayM, todayD){
  var firstDay = new Date(year, month - 1, 1).getDay();
  var daysInMonth = new Date(year, month, 0).getDate();
  var html = '';
  
  // Jours vides avant le 1er
  for(var i = 0; i < firstDay; i++) html += '<div class="cal-empty"></div>';
  
  // Jours du mois
  for(var d = 1; d <= daysInMonth; d++){
    var isSel = (year === selY && month === selM && d === selD);
    var isToday = (year === todayY && month === todayM && d === todayD);
    var cls = 'cal-day' + (isSel ? ' cal-sel' : '') + (isToday && !isSel ? ' cal-today' : '');
    html += '<button type="button" class="' + cls + '" data-cal-action="pick" data-input-id="' + hiddenInputId + '" data-cal-type="day" data-year="' + year + '" data-month="' + month + '" data-day="' + d + '">' + d + '</button>';
  }
  grid.innerHTML = html;
  grid.style.gridTemplateColumns = 'repeat(7, 1fr)';
}

function _renderMonthGrid(grid, hiddenInputId, year, selY, selM, todayY, todayM){
  var months = _mcalMonthsShort();
  grid.innerHTML = months.map(function(m, i){
    var mm = i + 1;
    var isSel = (year === selY && mm === selM);
    var isToday = (year === todayY && mm === todayM);
    var cls = 'cal-month' + (isSel ? ' cal-sel' : '') + (isToday && !isSel ? ' cal-today' : '');
    return '<button type="button" class="' + cls + '" data-cal-action="pick" data-input-id="' + hiddenInputId + '" data-cal-type="month" data-year="' + year + '" data-month="' + mm + '">' + m + '</button>';
  }).join('');
  grid.style.gridTemplateColumns = 'repeat(3, 1fr)';
}

function _renderYearGrid(grid, hiddenInputId, centerYear, selY, todayY){
  var start = centerYear - 9;
  var html = '';
  for(var y = start; y < start + 20; y++){
    var isSel = (y === selY);
    var isToday = (y === todayY);
    var cls = 'cal-year' + (isSel ? ' cal-sel' : '') + (isToday && !isSel ? ' cal-today' : '');
    html += '<button type="button" class="' + cls + '" data-cal-action="pick" data-input-id="' + hiddenInputId + '" data-cal-type="year" data-year="' + y + '">' + y + '</button>';
  }
  grid.innerHTML = html;
  grid.style.gridTemplateColumns = 'repeat(4, 1fr)';
}

function _calPick(hiddenInputId, type, year, month, day){
  var input = document.getElementById(hiddenInputId);
  if(!input) return;
  
  var val;
  if(type === 'day') {
    val = year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
  } else if(type === 'year') {
    val = year.toString();
  } else {
    val = year + '-' + String(month).padStart(2, '0');
  }
  
  input.value = val;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  
  var label = document.getElementById(hiddenInputId + '-label');
  if(label) label.textContent = _calLabelFor(val, type);
  
  var calId = 'cal-' + type + '-' + hiddenInputId;
  var pop = document.getElementById(calId);
  if(pop) pop.style.display = 'none';
}

// Rétro-compatibilité: les anciennes fonctions month-only
function openDayCalendar(hiddenInputId, btnEl){
  if(!btnEl.dataset.calType) btnEl.dataset.calType = 'day';
  openMonthCalendar(hiddenInputId, btnEl);
}
function openYearCalendar(hiddenInputId, btnEl){
  if(!btnEl.dataset.calType) btnEl.dataset.calType = 'year';
  openMonthCalendar(hiddenInputId, btnEl);
}
