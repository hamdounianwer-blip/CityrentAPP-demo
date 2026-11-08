// ── _loadChartJs — lazy loader pour chart.umd.js (2026-08) ────────────────
// Avant : chart.umd.js (205 Ko) était chargé en dur au boot pour TOUT le
// monde, même ceux qui ne visitent jamais l'onglet Statistics du module
// Dépense (seul module qui utilise réellement Chart.js — Revenue Stats
// dessine ses propres graphes en SVG, voir createBarChart()).
// Maintenant : le script n'est injecté qu'au premier appel de cette
// fonction, et la Promise est mise en cache — un appel ultérieur (ex:
// l'utilisateur revient sur l'onglet) ne re-télécharge/re-parse rien,
// il reçoit juste la même Promise déjà résolue.
window._chartJsLoadPromise = null;
function _loadChartJs(){
  if(window.Chart) return Promise.resolve(); // déjà chargé (ex: hot reload)
  if(window._chartJsLoadPromise) return window._chartJsLoadPromise;
  window._chartJsLoadPromise = new Promise(function(resolve, reject){
    let s = document.createElement('script');
    s.src = 'js/chart.umd.js';
    s.onload = function(){ resolve(); };
    s.onerror = function(){
      window._chartJsLoadPromise = null; // permet de réessayer au prochain appel
      reject(new Error('Échec du chargement de chart.umd.js'));
    };
    document.head.appendChild(s);
  });
  return window._chartJsLoadPromise;
}

// ── t() — placeholder substitution helper (PAS du code mort : utilisé
// dans tout le Dashboard/Service/Payments pour formater des messages avec
// %1%, %2%, etc. Erreur de classification corrigée — restauré ici.) ──
function t(key, ...args) {
  let str = key;
  args.forEach((a, i) => { str = str.replace('%' + (i+1) + '%', a); });
  return str;
}
// ── fmtNum (orig. line 3438) ──

// ─── Utility functions (must be first) ──────────────────────────
function fmtNum(n){ if(n===null||n===undefined||n==='') return '0'; let x=Number(n); if(isNaN(x)) return '0'; return x%1===0 ? x.toLocaleString() : x.toFixed(2); }

// ── escapeHtml — échappe tout texte utilisateur avant injection via
// innerHTML (nom client, plaque, notes, adresse...). Sans ça, un champ
// contenant du HTML/JS (ex: "<img src=x onerror=alert(1)>") s'exécute
// dans le navigateur de tous les users qui affichent la fiche — risque
// de vol de session (token) entre BARKA/MOEBELA. Utilisée dans fleet,
// daily-rentals, clients, payments, movements, violations, gps-tracking,
// revenue-stats, service-km, available-vehicles, activity-log.
function escapeHtml(str){
  if(str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
window.escapeHtml = escapeHtml;

// ── debounce : retarde l'exécution d'une fonction tant que l'utilisateur
// continue de taper (évite un re-render complet du tableau à chaque
// caractère saisi dans les champs de recherche) ──
function debounce(fn, ms){
  let t;
  return function(...args){
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
  };
}

// ── Recherches débouncées (150ms) — les fonctions cibles sont vérifiées
// au moment de l'appel (typeof), donc ces wrappers peuvent être définis
// ici tout en haut, avant que les modules qui les définissent soient chargés ──
const filterFleetDebounced   = debounce(function(v){ if(typeof filterFleet === 'function') filterFleet(v); }, 150);
const filterDailyDebounced   = debounce(function(v){ if(typeof filterDaily === 'function') filterDaily(v); }, 150);
const filterSvcDebounced     = debounce(function(v){ if(typeof filterSvc === 'function') filterSvc(v); }, 150);
const filterMakhDebounced    = debounce(function(){ if(typeof makh_filterTable === 'function') makh_filterTable(); }, 150);
const renderMovesDebounced   = debounce(function(){ if(typeof renderMoves === 'function') renderMoves(); }, 150);
const renderGpsDebounced     = debounce(function(){ if(typeof renderGpsTracking === 'function') renderGpsTracking(); }, 150);
const renderLogDebounced     = debounce(function(){ if(typeof renderActivityLog === 'function') renderActivityLog(); }, 150);
const renderClientsDebounced = debounce(function(){ if(typeof renderClients === 'function') renderClients(); }, 150);

// ── renderPaginationBar : barre "précédent / X sur Y / suivant" générique,
// insérée en sibling APRÈS le conteneur passé (marche pour les tableaux
// comme pour les grilles de cartes, sans dépendre de la structure HTML de
// la page). Utilisée par Fleet, Payments, Daily Rentals, Clients — tables
// qui grossissent sans limite avec l'historique et ralentissaient le DOM.
// state = { page, pageSize } — muté en place par les boutons.
function renderPaginationBar(containerEl, state, totalCount, onPageChange){
  if(!containerEl) return { pageItemsSlice: (arr)=>arr };
  let totalPages = Math.max(1, Math.ceil(totalCount / state.pageSize));
  if(state.page < 0) state.page = 0;
  if(state.page > totalPages - 1) state.page = totalPages - 1;

  let barId = containerEl.id ? 'pgbar-' + containerEl.id : null;
  let bar = barId ? document.getElementById(barId) : null;
  if(!bar && barId){
    bar = document.createElement('div');
    bar.id = barId;
    bar.className = 'pagination-bar';
    bar.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:14px;padding:16px 0;margin-top:8px;border-top:1px solid var(--border)';
    containerEl.insertAdjacentElement('afterend', bar);
  }
  if(!bar) return { pageStart: state.page * state.pageSize };

  if(totalCount <= state.pageSize){
    bar.innerHTML = '';
    bar.style.display = 'none';
  } else {
    bar.style.display = 'flex';
    let prevDisabled = state.page === 0;
    let nextDisabled = state.page >= totalPages - 1;
    bar.innerHTML =
      '<button class="log-chip" style="' + (prevDisabled ? 'opacity:.4;cursor:not-allowed' : 'cursor:pointer') + '" ' + (prevDisabled ? 'disabled' : '') + '>' + (typeof translate === 'function' ? translate('actlog.prev') : 'Prev') + '</button>' +
      '<span style="font-size:.8rem;color:var(--muted)">' + (state.page + 1) + ' / ' + totalPages + ' &nbsp;(' + totalCount + ')</span>' +
      '<button class="log-chip" style="' + (nextDisabled ? 'opacity:.4;cursor:not-allowed' : 'cursor:pointer') + '" ' + (nextDisabled ? 'disabled' : '') + '>' + (typeof translate === 'function' ? translate('actlog.next') : 'Next') + '</button>';
    let btns = bar.querySelectorAll('button');
    if(!prevDisabled) btns[0].onclick = function(){ state.page--; onPageChange(); };
    if(!nextDisabled) btns[1].onclick = function(){ state.page++; onPageChange(); };
  }
  return { pageStart: state.page * state.pageSize };
}
window.renderPaginationBar = renderPaginationBar;


// fois qu'elle est visitée ou rendue (lazy-loading, perf). Les pages
// dashboard/fleet/service/payments/revenue-stats/moves/gps/makhalatat/
// actlog/clients ont leur HTML dans un <template id="tpl-page-X">
// (extrait de app.html) au lieu d'être parsées au chargement initial.
// page-daily n'a pas de template (page par défaut, déjà visible). ──
function ensurePageLoaded(page){
  let container = document.getElementById('page-' + page);
  if(!container) return;
  if(container.dataset.loaded === '1') return; // déjà hydratée, ne rien refaire
  let tpl = document.getElementById('tpl-page-' + page);
  if(!tpl){ container.dataset.loaded = '1'; return; } // pas de template pour cette page
  container.appendChild(tpl.content.cloneNode(true));
  container.dataset.loaded = '1';
  // FIX: le template clone est injecte APRES le dernier passage d'applyI18n()
  // (au chargement ou au toggle de langue) — sans ce rappel, les titres/
  // sous-titres de la page restent dans le texte anglais brut du template
  // tant que l'utilisateur ne rebascule pas la langue manuellement.
  if(typeof applyI18n === 'function') applyI18n();
  // FIX: les pages chargées à la demande (template) créent leurs <input type=month> APRÈS l'init du
  // démarrage (core.js: pm.value = ym tombait dans le vide) → valeur vide → 1er rendu SANS filtre de mois
  // (tout s'affichait) tant que l'utilisateur ne re-choisissait pas le mois à la main.
  // On renseigne donc ici le mois courant dans le sélecteur de la page qu'on vient d'hydrater.
  let _monthInputs = { daily:'month-picker', payments:'pay-month', moves:'moves-month-input' };
  if(_monthInputs[page]){
    let _n = new Date();
    let _ym = window._currentYm || (_n.getFullYear() + '-' + String(_n.getMonth()+1).padStart(2,'0'));
    window._currentYm = _ym;
    let _mi = document.getElementById(_monthInputs[page]);
    if(_mi && !_mi.value) _mi.value = _ym;
    if(typeof refreshMonthCalendarLabels === 'function') refreshMonthCalendarLabels();
  }
}

// ── goTo (orig. line 3442) ──
// Cache la dernière page déjà rendue pour éviter de tout reconstruire
// à chaque clic sur le même onglet du menu (fix lenteur/freeze navigation).
let _lastRenderedPage = null;
function goTo(page, btn){
  ensurePageLoaded(page);
  document.querySelectorAll('.page').forEach(s => s.classList.remove('show'));
  let el = document.getElementById('page-' + page);
  if(el) el.classList.add('show');
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  if(typeof refreshMonthCalendarLabels === 'function') refreshMonthCalendarLabels();

  // Si on est déjà sur cette page et qu'elle a déjà été rendue, on ne
  // relance pas tout le rendu (juste l'affichage/masquage ci-dessus).
  if(page === _lastRenderedPage) return;
  _lastRenderedPage = page;

  if(page === 'daily') { renderDaily(); } // renderOpenContracts() est déjà appelé en interne par renderDaily()
  else if(page === 'fleet-calendar') { if(typeof renderFleetCalendar === 'function') renderFleetCalendar(); }
  else if(page === 'available') renderAvailableVehicles();
  else if(page === 'fleet') renderFleet();
  else if(page === 'payments') renderPayments();
  else if(page === 'service') renderService();
  else if(page === 'dashboard') buildDashboard();
  else if(page === 'moves') renderMoves();
  else if(page === 'depence') renderDepence();
  else if(page === 'booking') renderBooking();
  else if(page === 'gps') { window._gpsSelectedType = 'all'; renderGpsTracking(); }
  else if(page === 'actlog') renderActivityLog();
  else if(page === 'users') { if(typeof renderUsers === 'function') renderUsers(); }
}

// ── forceRerenderCurrentPage : à appeler après un ajout/edit/suppression
// pour que la page se remette bien à jour malgré le cache de goTo() ──
function forceRerenderCurrentPage(){
  _lastRenderedPage = null;
}
// ── fmtDate (orig. line 3457) ──
function fmtDate(d){ if(!d) return '—'; let s=String(d); let dt=s.replace('T',' '); let parts=dt.split(' '); let datePart=parts[0]||''; let timePart=parts[1]?parts[1].slice(0,5):''; let dp=datePart.split('-'); if(dp.length===3) return dp[2]+'/'+dp[1]+'/'+dp[0]+(timePart?'&nbsp;&nbsp;&nbsp;'+timePart:''); return d; }
// ────────────────────────────────────────────────────────────────

// ════════════════════════════════════════════════════════════════════
// SHARED STATS HELPERS (2026-08) — source unique pour module-depence.js
// ET module-revenue-stats.js. Avant, chaque module réécrivait sa propre
// version de ces fonctions (formatage de mois, filtres par période,
// agrégation daily/monthly/yearly, regroupement par véhicule) — deux
// implémentations qui pouvaient dériver l'une de l'autre au fil des
// correctifs. Tout ce qui est commun aux deux modules vit ici désormais ;
// chaque module ne garde que ce qui lui est spécifique.
// ════════════════════════════════════════════════════════════════════

// ── formatStatsMonth("2026-07") → "Jul 2026" (EN) / mois localisé si
// i18nMonthNames() est disponible (voir i18n.js). Remplace l'ancien
// formatMonth() (module-revenue-stats.js) et depFormatStatsMonth()
// (module-depence.js), qui étaient identiques mais codées en dur en
// anglais dans les deux cas (ne suivaient pas AR/FR). ──
function formatStatsMonth(monthStr) {
  const parts = String(monthStr || '').split('-');
  if (parts.length !== 2) return monthStr;
  const idx = parseInt(parts[1], 10) - 1;
  if (typeof i18nMonthNames === 'function') {
    try {
      const names = i18nMonthNames();
      if (names && names[idx]) return names[idx] + ' ' + parts[0];
    } catch (e) { /* i18n pas encore prêt — fallback ci-dessous */ }
  }
  const fallback = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return (fallback[idx] || monthStr) + ' ' + parts[0];
}
window.formatStatsMonth = formatStatsMonth;

// ── filterByMonth(list, ['date','_date'], "2026-07") — filtre générique
// "un seul mois". `dateFields` est une liste de noms de champs candidats
// testés dans l'ordre (une ligne matche si N'IMPORTE LEQUEL tombe dans le
// mois) — couvre à la fois les alias d'un même champ (date/_date) et les
// cas à deux dates distinctes (dateOut OU dateIn pour une location).
// Remplace filterPaymentsByMonth() et filterRentalsByMonth() (ex.
// module-revenue-stats.js, non utilisées ailleurs — supprimées). ──
function filterByMonth(list, dateFields, monthStr) {
  if (!monthStr || !String(monthStr).includes('-')) return list || [];
  const parts = monthStr.split('-');
  const filterYear = parseInt(parts[0], 10);
  const filterMonth = parseInt(parts[1], 10);
  if (isNaN(filterYear) || isNaN(filterMonth)) return list || [];
  const fields = Array.isArray(dateFields) ? dateFields : [dateFields];
  return (list || []).filter(function(item) {
    for (let i = 0; i < fields.length; i++) {
      const raw = item[fields[i]];
      if (!raw) continue;
      const d = new Date(raw);
      if (isNaN(d.getTime())) continue;
      if (d.getFullYear() === filterYear && (d.getMonth() + 1) === filterMonth) return true;
    }
    return false;
  });
}
window.filterByMonth = filterByMonth;

// ── filterByMonthRange(list, ['dateOut','_dateOut'], "2026-01", "2026-06")
// — filtre générique "plage de mois". Remplace filterPaymentsByMonthRange(),
// filterRentalsByMonthRange() et filterDepenceByMonthRange()
// (module-revenue-stats.js) qui faisaient exactement la même comparaison
// année/mois, une fois par type d'entité. ──
function filterByMonthRange(list, dateFields, monthFrom, monthTo) {
  if (!monthFrom && !monthTo) return list || [];
  let fromYear = 0, fromMonth = 0, toYear = 9999, toMonth = 12;
  if (monthFrom) {
    const p = String(monthFrom).split('-');
    fromYear = parseInt(p[0], 10); fromMonth = parseInt(p[1], 10);
  }
  if (monthTo) {
    const p = String(monthTo).split('-');
    toYear = parseInt(p[0], 10); toMonth = parseInt(p[1], 10);
  }
  const fields = Array.isArray(dateFields) ? dateFields : [dateFields];
  return (list || []).filter(function(item) {
    let d = null;
    for (let i = 0; i < fields.length; i++) {
      const raw = item[fields[i]];
      if (!raw) continue;
      const candidate = new Date(raw);
      if (!isNaN(candidate.getTime())) { d = candidate; break; }
    }
    if (!d) return false;
    const y = d.getFullYear(), m = d.getMonth() + 1;
    if (y < fromYear || (y === fromYear && m < fromMonth)) return false;
    if (y > toYear || (y === toYear && m > toMonth)) return false;
    return true;
  });
}
window.filterByMonthRange = filterByMonthRange;

// ── filterByDateRange(list, 'date', "2026-07-01", "2026-07-15") — filtre
// générique par plage de DATES exactes (pas de mois). ──
function filterByDateRange(list, dateField, dateFrom, dateTo) {
  if (!dateFrom && !dateTo) return list || [];
  const from = dateFrom ? new Date(dateFrom) : null;
  const to = dateTo ? new Date(dateTo) : null;
  return (list || []).filter(function(item) {
    const raw = item[dateField];
    if (!raw) return false;
    const d = new Date(raw);
    if (isNaN(d.getTime())) return false;
    if (from && d < from) return false;
    if (to) {
      const toEnd = new Date(to);
      toEnd.setHours(23, 59, 59, 999);
      if (d > toEnd) return false;
    }
    return true;
  });
}
window.filterByDateRange = filterByDateRange;

// ── aggregateByDate(list, getEntry) — agrégateur générique daily/monthly/
// yearly. `getEntry(item)` doit renvoyer soit null/undefined (ligne
// ignorée), soit { date:'YYYY-MM-DD', amount:Number, extra:{...} }.
// `extra` est additionné dans chaque bucket (jour/mois/année) sous les
// mêmes clés — permet à chaque appelant de garder ses propres sous-totaux
// (ex: cash/cheque pour Dépense, vehicle/general pour Revenue > ROI) sans
// dupliquer la boucle elle-même. Remplace le cœur commun de
// depCalculateStats() (module-depence.js) et calculateExpenseStats()
// (module-revenue-stats.js), qui parcouraient TOUS LES DEUX DB.depence
// pour construire des buckets quasi identiques. ──
function aggregateByDate(list, getEntry) {
  const stats = { total: 0, count: 0, daily: {}, monthly: {}, yearly: {}, avg: 0, max: 0, min: Infinity };
  (list || []).forEach(function(item) {
    const entry = getEntry(item);
    if (!entry || !entry.date || !(entry.amount > 0)) return;
    const amount = entry.amount;
    const date = entry.date;
    const extra = entry.extra || {};

    stats.total += amount;
    stats.count++;
    stats.max = Math.max(stats.max, amount);
    stats.min = Math.min(stats.min, amount);

    function bump(bucket, key, withMonthBreakdown) {
      if (!bucket[key]) {
        bucket[key] = { amount: 0, count: 0 };
        if (withMonthBreakdown) bucket[key].months = {};
      }
      bucket[key].amount += amount;
      bucket[key].count++;
      Object.keys(extra).forEach(function(k) {
        bucket[key][k] = (bucket[key][k] || 0) + extra[k];
      });
      return bucket[key];
    }
    bump(stats.daily, date, false);
    const monthKey = date.substring(0, 7);
    bump(stats.monthly, monthKey, false);
    const yearKey = date.substring(0, 4);
    const yearBucket = bump(stats.yearly, yearKey, true);
    yearBucket.months[monthKey] = (yearBucket.months[monthKey] || 0) + amount;
  });
  stats.avg = stats.count > 0 ? stats.total / stats.count : 0;
  stats.min = stats.min === Infinity ? 0 : stats.min;
  return stats;
}
window.aggregateByDate = aggregateByDate;

// ── calculateDepenceStats(list) — agrégation daily/monthly/yearly de
// DB.depence, avec cash/cheque (utilisé par Dépense > Statistics) ET
// vehicle/general (utilisé par Revenue Stats > ROI/Profit) dans les MÊMES
// buckets — un seul calcul, les deux modules y piochent ce qui les
// concerne. Remplace depCalculateStats() (module-depence.js, gardait
// cash/cheque) et calculateExpenseStats() (module-revenue-stats.js,
// gardait vehicle/general) : même boucle sur DB.depence, réécrite deux fois. ──
function calculateDepenceStats(list) {
  return aggregateByDate(list, function(e) {
    const amount = parseFloat(e.amount) || 0;
    if (amount <= 0 || !e.date) return null;
    const isVehicle = e.kind === 'vehicle' && e.vehicleId;
    const isCash = e.payment === 'Cash';
    return {
      date: e.date,
      amount: amount,
      extra: {
        cash: isCash ? amount : 0,
        cheque: isCash ? 0 : amount,
        vehicleAmount: isVehicle ? amount : 0,
        generalAmount: isVehicle ? 0 : amount
      }
    };
  });
}
window.calculateDepenceStats = calculateDepenceStats;

// ── groupDepenceByPlate(depence, vehicles) — regroupe les dépenses
// véhicule par plaque NORMALISÉE (normalizePlateGlobal), avec répartition
// par catégorie et cash/cheque. Les dépenses générales ou liées à un
// véhicule supprimé vont dans generalTotal (jamais attribuées à une
// voiture au hasard). Remplace le vehicleMap construit à la main dans
// renderDepVehicleStats() (module-depence.js) ET calculateExpensesByPlate()
// (module-revenue-stats.js), qui faisaient le même regroupement avec deux
// structures de données différentes. ──
function groupDepenceByPlate(depence, vehicles) {
  const result = { vehicleTotal: 0, generalTotal: 0, byPlate: {} };
  (depence || []).forEach(function(e) {
    const amount = parseFloat(e.amount) || 0;
    if (amount <= 0) return;

    if (e.kind !== 'vehicle' || !e.vehicleId) {
      result.generalTotal += amount;
      return;
    }
    const vehicle = (vehicles || []).find(function(v) { return v && v.id === Number(e.vehicleId); });
    const rawPlate = vehicle && vehicle.plate ? vehicle.plate : '';
    if (!rawPlate) {
      // vehicleId orphelin (véhicule supprimé) — non-attribuable plutôt que perdu
      result.generalTotal += amount;
      return;
    }
    const key = (typeof normalizePlateGlobal === 'function') ? normalizePlateGlobal(rawPlate) : String(rawPlate).trim().toUpperCase();
    if (!result.byPlate[key]) {
      result.byPlate[key] = {
        plate: key, name: vehicle.name || key,
        expenses: 0, count: 0, cash: 0, cheque: 0, categories: {}
      };
    }
    const bucket = result.byPlate[key];
    bucket.expenses += amount;
    bucket.count++;
    if (e.payment === 'Cash') bucket.cash += amount; else bucket.cheque += amount;
    result.vehicleTotal += amount;

    const cat = e.category || '—';
    bucket.categories[cat] = (bucket.categories[cat] || 0) + amount;
  });
  return result;
}
window.groupDepenceByPlate = groupDepenceByPlate;
// ════════════════════════════════════════════════════════════════════

// ── Table plaque → modèle : déplacée dans js/plate-vehicle-map.js
// (2026-08) — chargée avant ce fichier (voir app.html). Un seul endroit
// à éditer pour ajouter un véhicule, sans toucher à la logique de l'app. ──
// ── getVehicleNameByPlate (orig. line 3461) ──
function getVehicleNameByPlate(plate){
  if(!plate) return null;
  return PLATE_VEHICLE_MAP[plate.trim().replace(/\s+/g,"").toUpperCase()] || null;
}

// ════════════════════════════════════════════════════════════════════
// LANGUAGE SYSTEM — REMOVED (English only)
// ════════════════════════════════════════════════════════════════════
const currentLanguage = 'en'; // conservé tel quel — inutilisé ailleurs, on n'y touche pas
// ── safeRender (orig. line 3482) ──
function safeRender(fn) { if (typeof window[fn] === 'function') window[fn](); }
// ════════════════════════════════════════════════════════════════
// ── I18N (2026-07) : le moteur de traduction (I18N_DICT, translate(),
// applyI18n(), toggleLanguage()) vit maintenant dans js/i18n.js, chargé
// AVANT ce fichier. Rien à dupliquer ici — ces fonctions sont déjà
// disponibles globalement au moment où core.js s'exécute. ──
// _dataLoaded — FIX (2026-07) : reste à false tant que le premier
// chargement (/load) n'est pas terminé. Empêche qu'un clic prématuré
// sur "Save Data" (ou l'auto-save) n'envoie un DB encore vide au
// serveur juste après la connexion, avant que les vraies données
// aient fini d'arriver. Voir saveAll(), initAutoSave() et le bouton
// Save Data plus bas.
// ════════════════════════════════════════════════════════════════
window._dataLoaded = false;

let DB = {
  "vehicles": [],
  "rentals": [],
  "payments": [],
  "logs": [],
  "moves": [],
  "kmHistory": [],
  "gpsLinks": [],
  "depence": [],
  "depenceCategories": [],
  "closedMonths": [],
  "suppliers": [],
  "nextVId": 1,
  "nextRId": 1,
  "nextPId": 1,
  "nextMId": 1,
  "nextGpsId": 1,
  "nextDepId": 1,
  "nextSupId": 1,
  "exportDate": ""
};
// FIX (perf 2026-07) : les modules sont maintenant chargés dynamiquement
// (voir loader dans app.html). module-clients.js référence DB.clients dès
// le tout début du fichier, en dehors de toute fonction — on expose donc
// explicitement DB sur window pour garantir sa visibilité, quel que soit
// l'ordre/mécanisme exact de chargement des <script> injectés.
window.DB = DB;

let fleetSearch='', svcSearch='', paySearch='', activeFleetFilter='all', editingVehicleId=null, editMode=false, editingPaymentId=null, currentPaymentFilter=null;

// ════════════════════════════════════════════════════════════════
// _genId() — générateur d'ID universel unique
//
// Remplace DB.nextRId++ et DB.nextPId++ qui causaient des collisions
// quand deux sessions créaient un enregistrement au même moment :
// les deux lisaient la même valeur du compteur et produisaient le même ID.
//
// Construction : timestamp ms (13 chiffres) + 4 chiffres aléatoires.
// Probabilité de collision : 1 sur 10 000 à la même milliseconde exacte.
// Comparé aux compteurs partagés qui collisionnaient à 100% entre sessions.
//
// L'ID est un Number pour rester compatible avec le code existant
// (comparaisons === avec des ids numériques dans find/filter/findIndex).
// ════════════════════════════════════════════════════════════════
// Compteur interne pour garantir l'unicité même dans la même milliseconde
let _genIdCounter = 0;
let _genIdLastTs  = 0;

function _genId(){
  // Format : 13 chiffres timestamp + 3 chiffres compteur = 16 chiffres
  // ex: 1720483192000 + 007 → 1720483192000007
  // Garanti unique même si 1000 IDs créés à la même milliseconde exacte.
  // Si le compteur dépasse 999 dans la même ms, on avance artificiellement
  // le timestamp de 1ms (impossible en pratique, mais sécurité totale).
  let ts = Date.now();
  if(ts <= _genIdLastTs){
    ts = _genIdLastTs;
    _genIdCounter++;
    if(_genIdCounter > 999){
      ts = _genIdLastTs + 1;
      _genIdCounter = 0;
      _genIdLastTs = ts;
    }
  } else {
    _genIdLastTs  = ts;
    _genIdCounter = 0;
  }
  return parseInt(ts.toString() + String(_genIdCounter).padStart(3, '0'), 10);
}
window._genId = _genId;
// Mis à true juste avant un "Clear all logs" volontaire : dit au serveur de vraiment vider
// la table logs. Dans tous les autres cas, la sauvegarde des logs est additive (aucune perte
// de logs des autres sessions/comptes en cas de sauvegardes concurrentes).
let logsClearFlag = false;

// ── logAction (orig. line 3500) ──
function logAction(type, label, detail, ref){
  let now = new Date();
  let pad = n => String(n).padStart(2,'0');
  let actor = (window.AUTH && window.AUTH.username) ? window.AUTH.username : 'system';
  DB.logs.unshift({id: Date.now() + Math.random(), type: type, label: label, detail: detail, ref: ref || null, ts: now.toISOString(), tsDisplay: `${pad(now.getDate())}/${pad(now.getMonth()+1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`, user: actor});
  if(DB.logs.length > 500) DB.logs.length = 500;
}

let logFilter = 'all', logSearch = '', logUserFilter = 'all';

// ── findOrUseVehicleByPlate (orig. line 3531) ──
function findOrUseVehicleByPlate(plate, name){
  let existing = DB.vehicles.find(v => v.plate === plate);
  if(existing) return existing.id;
  return null;
}

// ── fmtAmt (orig. line 6497) ──
function fmtAmt(v){ let n=Number(v||0); return n%1===0?n.toString():n.toFixed(2).replace(/\.?0+$/,''); }
// ── refreshAll (orig. line 8015) ──
function refreshAll(){ initStatusLabels(); updateTopStats(); buildDashboard(); renderFleet(); renderService(); renderDaily(); renderPayments(); populateSelects(); updateSvcBadge(); if(typeof renderMoves==='function') renderMoves(); if(typeof renderAvailableVehicles==='function') renderAvailableVehicles(); updateLogBadge(); let currentPage = document.querySelector('.page.active'); if(currentPage && currentPage.id === 'page-actlog') renderActivityLog();
  // Fleet Calendar (2026-09) : pas de cache interne comme les autres pages ci-dessus,
  // donc on ne le re-rend que s'il est réellement affiché (page-fleet-calendar.show) —
  // note : on utilise ici la vraie classe posée par goTo() ('.show'), contrairement au
  // '.page.active' ci-dessus qui ne correspond à aucune classe jamais posée sur .page.
  let fcalPage = document.getElementById('page-fleet-calendar');
  if(fcalPage && fcalPage.classList.contains('show') && typeof renderFleetCalendar === 'function') renderFleetCalendar();
}


// ── CASH RECEIPT VERIFICATION ────────────────────────────────────────────────

// ── updateLogBadge (orig. line 8238) ──
function updateLogBadge(){ let b = document.getElementById('log-badge'); if(b) b.textContent = DB.logs.length; }
// ── getVehicleColor (orig. line 8538) ──
function getVehicleColor(name){ 
  let uname = name ? name.toUpperCase() : '';
  let color = VEHICLE_COLORS[uname] || VEHICLE_COLORS[name] || null;
  if(!color){
    let hash = 0;
    for(let i=0;i<(name||'').length;i++) hash = ((hash<<5)-hash)+(name||'').charCodeAt(i);
    const palette=['#2563eb','#16a34a','#dc2626','#7c3aed','#d97706','#0891b2','#ea580c','#db2777','#65a30d','#6366f1','#c2410c','#0d9488','#1d4ed8','#059669','#9333ea'];
    color = palette[Math.abs(hash)%palette.length];
  }
  return color;
}
// ── getVehicleBadgeColors (orig. line 8549) ──
function getVehicleBadgeColors(name){
  let customVehicle = DB.vehicles.find(v => v.name === name && v.customColor);
  if(customVehicle && customVehicle.customColor){
    let c = customVehicle.customColor;
    return {bg:c, color:'#ffffff', border:c};
  }
  let uname = name ? name.toUpperCase() : '';
  if(uname === 'JETOUR X50') return {bg:'#ffffff', color:'#1a1a1a', border:'#cccccc'};
  if(uname === 'MG-5') return {bg:'#16a34a', color:'#ffffff', border:'#15803d'};
  if(uname === 'MG-3') return {bg:'#ca8a04', color:'#ffffff', border:'#a16207'};
  if(['KIA OPTIMA','KIA RIO','CAMRY','MAZDA'].includes(uname)) return {bg:'#1a1a1a', color:'#ffffff', border:'#000'};
  if(['SPARK','CHR','VENUE','ROGUE'].includes(uname)) return {bg:'#2563eb', color:'#ffffff', border:'#1d4ed8'};
  if(['PRADO','FORTUNER','N-PATROL','N-PATHFINDER','OUTLANDER'].includes(uname)) return {bg:'#db2777', color:'#ffffff', border:'#be185d'};
  let c = getVehicleColor(name);
  return {bg:c+'22', color:c, border:c+'44'};
}
// ── getVehicleBadgeStyle (orig. line 8565) ──
function getVehicleBadgeStyle(name){
  let {bg,color,border} = getVehicleBadgeColors(name);
  return `background:${bg};color:${color};border:1.5px solid ${border};font-weight:800;`;
}
// ── formatVehicleDisplay (orig. line 8569) ──
function formatVehicleDisplay(vName, plateRaw){
  // Parse "HONDAM1234-T" or "HONDA M1234-T" → "HONDA 1234-T M"
  // plate format expected: letters+digits+hyphen+letters e.g. M1234-T
  // vName already clean e.g. "HONDA"
  let name = (vName || '').trim();
  let plate = (typeof plateRaw === 'string') ? plateRaw.trim() : plateRaw;
  // If name and plate seem merged (name appears at start of plate), split them
  // e.g. vName="HONDA", plateRaw="HONDAM1234-T" → plate should be "M1234-T"
  if(typeof plate === 'string' && plate.toUpperCase().startsWith(name.toUpperCase()) && plate.length > name.length){
    plate = plate.slice(name.length).trim();
  }
  // Reformat plate: "M1234-T" → "1234-T M"
  // Pattern: leading letters + digits + hyphen + letters → digits+hyphen+letters + space + leading letters
  let plateStr = (typeof plate === 'string') ? plate : String(plate||'');
  let plateFormatted = plateStr.replace(/^([A-Za-z]+)(\d[\dA-Za-z\-]+)$/, '$2 $1').trim();
  if(!plateFormatted) plateFormatted = plateStr;
  return {name, plateFormatted};
}
// ── makeVehiclePill (orig. line 8587) ──
function makeVehiclePill(vName, plateHtml, extraBadge){
  let {bg, border} = getVehicleBadgeColors(vName);
  // plateHtml may be a raw string or contain HTML (e.g. <span> for note link)
  let plateDisplay = plateHtml;
  if(typeof plateHtml === 'string' && !plateHtml.includes('<')){
    let {name, plateFormatted} = formatVehicleDisplay(vName, plateHtml);
    plateDisplay = plateFormatted;
    vName = name;
  }
  // Texte brut (sans HTML) pour le tooltip au survol — utile quand le nom est tronqué
  let plateText = (typeof plateDisplay === 'string') ? plateDisplay.replace(/<[^>]*>/g,'') : String(plateDisplay||'');
  let fullTitle = (vName + ' ' + plateText).trim().replace(/"/g,'&quot;');
  // Badge principal : largeur FIXE pour que tous les badges soient au même niveau, quelle que soit la longueur du nom/plaque.
  // Le nom se tronque avec "..." (tooltip = texte complet), la plaque reste toujours entièrement visible.
  let pill = `<span title="${fullTitle}" style="display:inline-flex;align-items:center;gap:4px;background:${bg};color:#000000;border:1.5px solid ${border};border-radius:5px;padding:2px 7px;font-size:.78rem;font-weight:800;font-family:var(--mono);width:132px;min-width:132px;max-width:132px;box-sizing:border-box"><span style="flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${vName}</span><span style="opacity:.85;font-weight:700;font-size:.72rem;color:#000000;flex:0 0 auto;white-space:nowrap">${plateDisplay}</span></span>`;
  // Badge période séparé après le badge principal
  let periodBadge = extraBadge ? ` ${extraBadge}` : '';
  return `<span style="display:inline-flex;align-items:center;gap:4px;white-space:nowrap">${pill}${periodBadge}</span>`;
}

// ── setFilter (orig. line 8774) ──
function setFilter(f,btn){ activeFleetFilter = f; if(window._fleetPageState) window._fleetPageState.page = 0; document.querySelectorAll('#fleet-filters .filter-chip').forEach(b => b.classList.remove('on')); btn.classList.add('on'); renderFleet(); }
// ── populateSelects (orig. line 9033) ──
function populateSelects(){ let opts = DB.vehicles.map(v => `<option value="${v.id}">${escapeHtml(v.name)} — ${escapeHtml(v.plate)}</option>`).join(''); let kmSel = document.getElementById('km-vehicle'); if(kmSel){ kmSel.innerHTML = '<option value="">— Select vehicle —</option>' + opts; } }


// ── openModal (orig. line 9036) ──
function openModal(id){ document.getElementById(id).classList.add('show'); }
// ── closeModal (orig. line 9037) ──
function closeModal(id){ document.getElementById(id).classList.remove('show'); }
// ── lockKmOutField (orig. line 9205) ──
function lockKmOutField(locked){
  let kmEl = document.getElementById('r-km-out');
  let kmIcon = document.getElementById('kmout-lock-icon');
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

// ── unlockKmOutField (orig. line 9222) ──
function unlockKmOutField(){
  let kmEl = document.getElementById('r-km-out');
  if(!kmEl || !kmEl.readOnly) return;
  securePrompt('🔒 Enter password to edit KM Out:').then(function(pw){
    if(pw === null) return;
    checkPassword(pw, 'Daily Rentals — Unlock KM Out').then(function(ok){
    if(ok){
      kmEl.readOnly = false;
      kmEl.style.cursor = 'text';
      kmEl.style.opacity = '1';
      kmEl.style.borderColor = '#f97316';
      let icon = document.getElementById('kmout-lock-icon');
      if(icon){ icon.innerHTML = '🔓 Unlocked'; icon.style.color = '#f97316'; }
      kmEl.focus();
      toast('🔓 KM OUT field unlocked');
      logAction('km_update', '🔓 New Rental — KM Out field unlocked', 'Plate: '+(document.getElementById('r-plate').value||'—'), '');
      updateLogBadge();
    } else {
      toast('❌ Wrong password');
    }
    }); // end checkPassword
  }); // end securePrompt
}

// ── lockFuelOutField (orig. line 9244) ──
function lockFuelOutField(locked){
  let fuelEl = document.getElementById('r-fuel-out');
  let fuelIcon = document.getElementById('fuelout-lock-icon');
  if(!fuelEl) return;
  if(locked){
    fuelEl.disabled = true;
    fuelEl.style.cursor = 'not-allowed';
    fuelEl.style.opacity = '.7';
    if(fuelIcon){ fuelIcon.innerHTML = '🔒 Auto-filled'; fuelIcon.style.color = '#f59e0b'; fuelIcon.style.cursor='pointer'; }
  } else {
    fuelEl.disabled = false;
    fuelEl.style.cursor = '';
    fuelEl.style.opacity = '1';
    if(fuelIcon){ fuelIcon.innerHTML = ''; }
  }
}

// ── unlockFuelOutField (orig. line 9261) ──
function unlockFuelOutField(){
  let fuelEl = document.getElementById('r-fuel-out');
  if(!fuelEl || !fuelEl.disabled) return;
  securePrompt('🔒 Enter password to edit Fuel Out:').then(function(pw){
    if(pw === null) return;
    checkPassword(pw, 'Daily Rentals — Unlock Fuel Out').then(function(ok){
    if(ok){
      fuelEl.disabled = false;
      fuelEl.style.cursor = '';
      fuelEl.style.opacity = '1';
      fuelEl.style.borderColor = '#f97316';
      let icon = document.getElementById('fuelout-lock-icon');
      if(icon){ icon.innerHTML = '🔓 Unlocked'; icon.style.color = '#f97316'; }
      fuelEl.focus();
      toast('🔓 Fuel OUT field unlocked');
      logAction('km_update', '🔓 New Rental — Fuel Out field unlocked', 'Plate: '+(document.getElementById('r-plate').value||'—'), '');
      updateLogBadge();
    } else {
      toast('❌ Wrong password');
    }
    }); // end checkPassword
  }); // end securePrompt
}

// ── printPage (orig. line 9401) ──
function printPage(pageId){ let pageEl = document.getElementById('page-' + pageId); if(!pageEl){ toast('Page not found'); return; } let titles = {dashboard:'Dashboard — Overview',fleet:'Database — Vehicles',daily:'Daily Rentals',service:'Service & KM Tracking',payments:'Payments & Balance',actlog:'Activity Log — History'}; let title = titles[pageId] || pageId; let company = 'City Rent Car BARKA'; let now = new Date(); let dateStr = now.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) + ' ' + now.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}); let clone = pageEl.cloneNode(true); clone.querySelectorAll('.page-header').forEach(el => el.remove()); clone.querySelectorAll('button').forEach(el => el.remove()); clone.querySelectorAll('input[type="text"],input[type="search"],input[type="month"],input[type="file"]').forEach(el => el.remove()); let css = `*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#111;background:#fff;padding:20px}.ph{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;padding-bottom:10px;border-bottom:2px solid #222}.pc{font-size:17px;font-weight:900}.pc small{display:block;font-size:10px;font-weight:400;color:#555;margin-top:2px}.pm{text-align:right;font-size:10px;color:#555}table{width:100%;border-collapse:collapse;margin-bottom:14px;font-size:11px}th{background:#111;color:#fff;padding:5px 8px;text-align:left;font-weight:700;font-size:10px;text-transform:uppercase}td{padding:5px 8px;border-bottom:1px solid #e5e5e5}.table-wrap{border:1px solid #ddd;border-radius:5px;overflow:hidden;margin-bottom:14px}.table-top h3{font-size:10px;font-weight:700;padding:6px 10px;background:#f5f5f5;border-bottom:1px solid #ddd;text-transform:uppercase}.stats-row{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}.stat-card{border:1px solid #ddd;border-radius:5px;padding:8px 12px;min-width:110px}.stat-val{font-size:16px;font-weight:900}.stat-label{font-size:9px;color:#666;text-transform:uppercase}.log-row{display:flex;gap:8px;padding:5px 0;border-bottom:1px solid #eee}.log-icon{width:22px;height:22px;border-radius:4px;background:#eee;display:flex;align-items:center;justify-content:center;font-size:.75rem;flex-shrink:0}.log-body{flex:1}.log-label{font-weight:700;font-size:11px}.log-detail{font-size:10px;color:#555}.log-ref{font-size:9px;background:#eee;border-radius:3px;padding:1px 5px;display:inline-block;margin-top:2px}.log-time{font-size:9px;color:#888;text-align:right;white-space:nowrap;flex-shrink:0}.log-day-header{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#888;padding:9px 0 3px;border-bottom:1px solid #ddd}.open-contracts-banner{margin-bottom:14px}.open-contracts-header{padding:6px 0;font-weight:700;font-size:11px}.badge{display:none}.oc-btn,.oc-btn-del{display:none!important}tr:nth-child(even) td{background:#f9f9f9}@page{size:A4 landscape;margin:14mm 10mm}`; let body = `<div class="ph"><div><div class="pc">${company}<small>${title}</small></div></div><div class="pm">Printed: ${dateStr}<br>Confidential</div></div>${clone.innerHTML}`; let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>${company} — ${title}</title><style>${css}</style></head><body>${body}<script>window.onload=function(){window.print();}<\/script></html>`;
  let win = window.open('','_blank'); win.document.write(html); win.document.close();
}

// ── migrateRentals (orig. line 9405) ──
function migrateRentals(){ DB.rentals.forEach(r => { if(!r.paidByMonth){ let ym = r.dateOut ? r.dateOut.slice(0,7) : new Date().toISOString().slice(0,7); r.paidByMonth = {}; if(Number(r.paid||0) > 0) r.paidByMonth[ym] = Number(r.paid||0); } }); }
// ── migratePaymentsFromRentals (orig. line 9406) ──
function migratePaymentsFromRentals(){ let toMigrate = DB.rentals.filter(r => r.paymentMethod && r.paymentMethod !== ''); if(!toMigrate.length) return; toMigrate.forEach(r => { let exists = DB.payments.find(p => p.receipt && p.receipt === r.receipt); if(!exists){ DB.payments.push({ id: DB.nextPId++, vehicleId: r.vehicleId, _plate: r._plate, contract: r.contract, receipt: r.receipt || ('R'+Date.now()), paymentMethod: r.paymentMethod, statusLabel: r.statusLabel || (r.paymentMethod==='CASH'?'PAID-CASH':r.paymentMethod==='TRANSFERT'?'TRANSFERT':'PAID'), price: r.price || 0, paid: r.price || 0, dateOut: r.dateOut || '', paymentDone: r.paymentDone || false }); } }); DB.rentals = DB.rentals.filter(r => !r.paymentMethod || r.paymentMethod === ''); }
// ─── Storage Engine (localStorage only) ────────────────────────
// ── idbSet (orig. line 9408) ──
function idbSet(key, value){
  return new Promise((resolve) => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch(e) { console.warn('localStorage set failed', e); }
    resolve();
  });
}
// ── idbGet (orig. line 9414) ──
function idbGet(key){
  return new Promise((resolve) => {
    try {
      let raw = localStorage.getItem(key);
      resolve(raw ? JSON.parse(raw) : undefined);
    } catch(e) { resolve(undefined); }
  });
}
// ── idbDel (orig. line 9422) ──
function idbDel(key){
  return new Promise((resolve) => {
    try { localStorage.removeItem(key); } catch(e) {}
    resolve();
  });
}
// ────────────────────────────────────────────────────────────────

// ── Compact helper: strip null/undefined fields to shrink payload ──
// ── compactObj (orig. line 9431) ──
function compactObj(obj){
  if(Array.isArray(obj)) return obj.map(compactObj);
  if(obj && typeof obj === 'object'){
    let out = {};
    for(let k in obj){
      let v = obj[k];
      if(v === null || v === undefined || v === '') continue;
      if(Array.isArray(v) && v.length === 0) continue;
      out[k] = compactObj(v);
    }
    return out;
  }
  return obj;
}

// ── Storage Engine — Server mode (data.json) + localStorage fallback ──
const _SERVER_MODE = true; // démo : toujours mode serveur (mock)

// ════════════════════════════════════════════════════════════════
// AUTH — connexion multi-comptes (directeur / barka_user / moebela_user)
// ════════════════════════════════════════════════════════════════
window.AUTH = { token: null, username: null, branches: null, isAdmin: false, role: null };

(function restoreAuth(){
  try {
    let raw = localStorage.getItem('fleetpro_auth');
    if(raw){
      let saved = JSON.parse(raw);
      if(saved && saved.token) window.AUTH = saved;
    }
  } catch(e){}
})();

function updateTopbarUser(){
  let label = document.getElementById('topbar-user-label');
  if(label){
    if(window.AUTH && window.AUTH.username){
      label.textContent = window.AUTH.isAdmin ? 'DEMO' : (window.AUTH.role === 'accountant' ? 'COMPTABLE' : (Array.isArray(window.AUTH.branches) ? window.AUTH.branches.join(', ') : ''));
    } else {
      label.textContent = '—';
    }
  }
  applyAdminOnlyNav();
}

// ── applyAdminOnlyNav — affiche/masque les entrées de menu réservées au
// directeur (ex: page Utilisateurs). Appelée depuis updateTopbarUser(),
// donc à chaque login et à chaque restauration de session. Défense en
// profondeur seulement : la vraie barrière est isAdminSession() côté
// serveur sur les routes /api/users. ──
function applyAdminOnlyNav(){
  let section = document.getElementById('nav-admin-section');
  if(!section) return;
  section.style.display = (window.AUTH && window.AUTH.isAdmin) ? '' : 'none';
}

function showLoginGate(errorMsg){
  let gate = document.getElementById('login-gate');
  if(gate) gate.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  let errEl = document.getElementById('login-error');
  if(errEl) errEl.textContent = errorMsg || '';
  let pw = document.getElementById('login-password');
  if(pw) pw.value = '';
}

function hideLoginGate(){
  let gate = document.getElementById('login-gate');
  if(gate) gate.style.display = 'none';
  document.body.style.overflow = '';
}

function doLogin(){
  let username = (document.getElementById('login-username').value || '').trim();
  let password = document.getElementById('login-password').value || '';
  let btn = document.getElementById('login-btn');
  if(!username || !password){
    document.getElementById('login-error').textContent = 'Please fill in both fields.';
    return;
  }
  if(btn){ btn.disabled = true; btn.textContent = 'Signing you in...'; }
  fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  })
  .then(r => r.json())
  .then(r => {
    if(btn){ btn.disabled = false; btn.textContent = 'Sign in to City'; }
    if(r.ok){
      window.AUTH = { token: r.token, username: r.username, branches: r.branches, isAdmin: r.isAdmin, role: r.role || 'staff' };
      try { localStorage.setItem('fleetpro_auth', JSON.stringify(window.AUTH)); } catch(e){}
      hideLoginGate();
      updateTopbarUser();
      chargerSavee();
    } else {
      document.getElementById('login-error').textContent = r.error || 'Invalid credentials.';
    }
  })
  .catch(() => {
    if(btn){ btn.disabled = false; btn.textContent = 'Sign in to City'; }
    document.getElementById('login-error').textContent = '⚠️ Server unreachable.';
  });
}
window.doLogin = doLogin;

function doLogout(){
  if(!confirm('Log out?')) return;
  let token = window.AUTH && window.AUTH.token;
  window.AUTH = { token: null, username: null, branches: null, isAdmin: false };
  try { localStorage.removeItem('fleetpro_auth'); } catch(e){}
  if(token){
    fetch('/api/logout', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ token }) }).catch(()=>{});
  }
  window.location.href = 'login.html';
}
window.doLogout = doLogout;

// Appelé quand une requête serveur renvoie 401 (session expirée/invalide)
function handleAuthExpired(){
  window.AUTH = { token: null, username: null, branches: null, isAdmin: false };
  try { localStorage.removeItem('fleetpro_auth'); } catch(e){}
  // login.html est maintenant une page séparée (extraite de app.html pour
  // alléger le parsing initial) : on redirige au lieu d'afficher un overlay.
  try { sessionStorage.setItem('fleetpro_login_msg', '⏱️ Session expired — please log in again.'); } catch(e){}
  window.location.replace('login.html');
}
window.handleAuthExpired = handleAuthExpired;

function authHeaders(extra){
  return Object.assign({ 'x-auth-token': (window.AUTH && window.AUTH.token) || '' }, extra || {});
}

// ── branchBadgeHtml — badge coloré réutilisable (Payments, Fleet, etc.) ──
function branchBadgeHtml(branchName){
  let raw = (branchName || '').trim();
  if(!raw) return '<span style="color:var(--dim);font-size:.75rem">—</span>';
  let low = raw.toLowerCase();
  let color = '#fff', bg = '#0d9488', border = '#0f766e';
  if(low.includes('barka')){ bg = '#2563eb'; border = '#1d4ed8'; }
  else if(low.includes('moebela') || low.includes('moabela') || low.includes('mabela')){ bg = '#ea580c'; border = '#c2410c'; }
  return `<span style="background:${bg};color:${color};border:1px solid ${border};border-radius:20px;padding:2px 10px;font-size:.72rem;font-weight:700;white-space:nowrap">🏢 ${raw}</span>`;
}
window.branchBadgeHtml = branchBadgeHtml;

// ── _localSave (orig. line 9449) ──
function _localSave(payload){
  try { localStorage.setItem('fleetpro_main', payload); } catch(e){}
  try { localStorage.setItem('fleetpro_backup', payload); } catch(e){}
}

// ════════════════════════════════════════════════════════════════
// INTERNAL MOVEMENTS
// ════════════════════════════════════════════════════════════════
let movesFilter = 'all';
let currentMovesMonth = (()=>{ const n=new Date(); return n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0'); })();

// ════════════════════════════════════════════════════════════════
// SAVE STATUS INDICATOR — indicateur visuel dans la topbar
// ════════════════════════════════════════════════════════════════
(function initSaveStatusBar(){
  // Injecte un petit badge dans le DOM dès que possible
  function _inject(){
    if(document.getElementById('save-status-badge')) return;
    let badge = document.createElement('span');
    badge.id = 'save-status-badge';
    badge.style.cssText = [
      'position:fixed',
      'bottom:12px',
      'right:14px',
      'z-index:99999',
      'font-size:.72rem',
      'font-weight:700',
      'padding:4px 11px',
      'border-radius:20px',
      'letter-spacing:.3px',
      'pointer-events:none',
      'transition:opacity .4s',
      'opacity:0',
      'box-shadow:0 2px 8px rgba(0,0,0,.25)'
    ].join(';');
    document.body.appendChild(badge);
  }
  if(document.body) _inject();
  else document.addEventListener('DOMContentLoaded', _inject);
})();

// _setSaveStatus(state) — 'saving' | 'ok' | 'error' | 'offline'
function _setSaveStatus(state, detail){
  let badge = document.getElementById('save-status-badge');
  if(!badge) return;
  const cfg = {
    saving:  { bg:'#2563eb', color:'#fff', text:'💾 Saving…' },
    ok:      { bg:'#16a34a', color:'#fff', text:'✅ Saved'   },
    error:   { bg:'#dc2626', color:'#fff', text:'❌ Save FAILED — ' + (detail||'error') },
    offline: { bg:'#d97706', color:'#fff', text:'⚠️ Offline — local save' },
  };
  let c = cfg[state] || cfg.error;
  badge.style.background = c.bg;
  badge.style.color       = c.color;
  badge.textContent       = c.text;
  badge.style.opacity     = '1';
  // Masquer après 4s sauf si erreur (erreur reste visible)
  clearTimeout(badge._hideTimer);
  if(state === 'ok' || state === 'saving' || state === 'offline'){
    badge._hideTimer = setTimeout(() => { badge.style.opacity = '0'; }, state === 'saving' ? 30000 : 4000);
  }
}

window._setSaveStatus = _setSaveStatus;

// ════════════════════════════════════════════════════════════════
// VERROU ANTI-DOUBLE ONGLET
// Un seul onglet peut être actif à la fois sur cette app.
// Si un 2e onglet tente de se charger, il est bloqué avec un avertissement.
// Principe : un heartbeat toutes les 2s dans sessionStorage.
// Chaque onglet vérifie si un autre heartbeat récent existe.
// ════════════════════════════════════════════════════════════════
(function initTabLock(){
  const TAB_KEY    = 'cityrent_active_tab';
  const TAB_ID     = 'tab_' + Date.now() + '_' + Math.random().toString(36).slice(2);
  const HEARTBEAT  = 2000;  // mise à jour toutes les 2s
  const TAB_TIMEOUT = 5000; // considéré mort si pas de heartbeat depuis 5s

  function _writeHeartbeat(){
    try { localStorage.setItem(TAB_KEY, JSON.stringify({ id: TAB_ID, ts: Date.now() })); } catch(e){}
  }

  function _checkAndLock(){
    try {
      const raw = localStorage.getItem(TAB_KEY);
      if(!raw){ _writeHeartbeat(); return; }
      const data = JSON.parse(raw);
      const age = Date.now() - (data.ts || 0);
      if(data.id !== TAB_ID && age < TAB_TIMEOUT){
        // Un autre onglet actif récent détecté
        _showTabWarning();
      } else {
        _writeHeartbeat();
      }
    } catch(e){ _writeHeartbeat(); }
  }

  function _showTabWarning(){
    // Overlay rouge bloquant sur TOUTE la page
    let ov = document.getElementById('tab-lock-overlay');
    if(ov) return;
    ov = document.createElement('div');
    ov.id = 'tab-lock-overlay';
    ov.style.cssText = [
      'position:fixed','inset:0','z-index:2147483647',
      'background:rgba(185,28,28,.97)',
      'display:flex','flex-direction:column',
      'align-items:center','justify-content:center',
      'color:#fff','font-family:sans-serif','text-align:center','padding:40px'
    ].join(';');
    ov.innerHTML = [
      '<div style="font-size:3rem;margin-bottom:16px">&#x26A0;&#xFE0F;</div>',
      '<div style="font-size:1.4rem;font-weight:700;margin-bottom:12px">DOUBLE TAB DETECTED</div>',
      '<div style="font-size:1rem;max-width:480px;line-height:1.6;margin-bottom:28px;opacity:.9">',
        'City Rent Car is already open in another tab.<br>',
        '<strong>Opening 2 tabs can erase your data!</strong><br><br>',
        'Go back to <strong>the tab already open</strong> and close this one manually<br>',
        '<span style="opacity:.75;font-size:.9rem">(Ctrl+W or click X on this tab)</span>',
      '</div>',
      // Indicateur de surveillance auto
      '<div id="tab-lock-status" style="font-size:.85rem;opacity:.7;margin-bottom:20px">',
        '⏳ Monitoring the other tab...',
      '</div>',
      '<button data-core-action="tab-lock-override" style="background:transparent;color:rgba(255,255,255,.6);border:1px solid rgba(255,255,255,.3);border-radius:8px;padding:8px 20px;font-size:.85rem;cursor:pointer;margin-top:8px">',
        'The other tab is closed — continue here',
      '</button>'
    ].join('');
    document.body.appendChild(ov);
  }

  // Démarrer le heartbeat et la vérification
  _checkAndLock();
  setInterval(function(){
    if(window._tabLockOverride){ _writeHeartbeat(); return; }
    // Si l'overlay est visible, vérifier si l'autre onglet est mort
    let ov = document.getElementById('tab-lock-overlay');
    if(ov){
      try {
        const raw = localStorage.getItem(TAB_KEY);
        if(!raw){
          // L'autre onglet a libéré le verrou → on reprend automatiquement
          _writeHeartbeat();
          window._tabLockOverride = true;
          ov.remove();
          return;
        }
        const data = JSON.parse(raw);
        const age = Date.now() - (data.ts || 0);
        if(data.id === TAB_ID || age >= TAB_TIMEOUT){
          // Notre tour : l'autre est mort ou c'est nous le propriétaire
          _writeHeartbeat();
          window._tabLockOverride = true;
          ov.remove();
          return;
        }
        // L'autre onglet est toujours actif — mettre à jour le message
        let statusEl = document.getElementById('tab-lock-status');
        if(statusEl) statusEl.textContent = '⏳ Other tab still active — close it to continue here';
      } catch(e){ _writeHeartbeat(); }
    } else {
      _checkAndLock();
    }
  }, HEARTBEAT);

  // Libérer le verrou à la fermeture de cet onglet
  window.addEventListener('beforeunload', function(){
    try {
      const raw = localStorage.getItem(TAB_KEY);
      if(raw){
        const data = JSON.parse(raw);
        if(data.id === TAB_ID) localStorage.removeItem(TAB_KEY);
      }
    } catch(e){}
  });
})();

// ════════════════════════════════════════════════════════════════
// AUTO-SAVE SILENCIEUX — toutes les 5 minutes
// Sauvegarde automatique en arrière-plan, sans toast, sans interruption.
// Élimine la perte de données si l'utilisateur oublie de cliquer Save Data.
// ════════════════════════════════════════════════════════════════
(function initAutoSave(){
  // Poll léger toutes les 20s (au lieu de 5 min) : détecte un changement
  // vite, mais ne sauvegarde QUE si quelque chose a réellement bougé (hash).
  // Un petit "debounce" (POLL_INTERVAL) évite de sauvegarder au milieu
  // d'une saisie en cours : on attend qu'un même hash soit vu 2 fois de
  // suite (donc stable depuis ~20s) avant d'envoyer.
  const POLL_INTERVAL = 20 * 1000; // 20s
  let _lastSeenHash = '';
  let _lastSavedHash = '';

  function _dbHash(){
    // Hash léger : juste les longueurs + dernier ID pour détecter un changement
    try {
      return [
        (DB.rentals||[]).length,
        (DB.payments||[]).length,
        (DB.moves||[]).length,
        (DB.rentals||[]).slice(-1)[0]&&(DB.rentals||[]).slice(-1)[0].id || 0,
        (DB.payments||[]).slice(-1)[0]&&(DB.payments||[]).slice(-1)[0].id || 0,
      ].join('|');
    } catch(e){ return ''; }
  }

  setInterval(function(){
    if(typeof DB === 'undefined' || !DB.rentals) return;
    if(!_SERVER_MODE) return;
    if(window._dataLoaded !== true) return; // FIX (2026-07) : pas encore chargé, on attend
    const h = _dbHash();
    if(h === _lastSavedHash){ _lastSeenHash = h; return; } // déjà sauvegardé, rien à faire
    if(h !== _lastSeenHash){ _lastSeenHash = h; return; } // vient de changer → on attend le prochain poll (debounce)
    // hash stable depuis 2 polls (~20-40s) ET différent du dernier save → on sauvegarde
    _lastSavedHash = h;
    // Auto-save 100% silencieux : pas de toast, pas d'alert, juste le badge en bas à droite
    console.log('[AutoSave] Sauvegarde silencieuse...');
    try {
      typeof saveAll === 'function' && saveAll(true);
    } catch(e){ console.warn('[AutoSave] Erreur:', e.message); }
  }, POLL_INTERVAL);

  // Sauvegarde silencieuse aussi juste avant que l'utilisateur ferme/quitte
  // l'onglet, au cas où le dernier changement n'a pas encore atteint le
  // poll suivant (best-effort — le navigateur peut couper la requête).
  window.addEventListener('beforeunload', function(){
    try {
      if(_SERVER_MODE && typeof DB !== 'undefined' && DB.rentals){
        const h = _dbHash();
        if(h !== _lastSavedHash) saveAll(true);
      }
    } catch(e){}
  });
})();

// ── _fetchWithRetry — fetch avec retry automatique (3 tentatives, délai croissant) ──
// timeoutMs (2026-08) : sans ça, un fetch() dont le serveur ne répond
// JAMAIS (event loop bloqué côté Node par un save anormalement long,
// connexion qui reste ouverte sans 'error' ni 'close'...) ne se résout
// ni ne rejette jamais — la Promise reste bloquée indéfiniment, le retry
// ne se déclenche pas (il attend un .then/.catch qui ne vient pas), et
// _setSaveStatus('saving') reste affiché à l'infini côté UI, sans jamais
// tomber sur le fallback _localSave(). Le même principe est déjà utilisé
// pour /ping (voir _doPing, watchdog) — on l'applique ici aussi.
// Défaut généreux (45s) : un save fait quelques Mo compressés, très loin
// du plafond 30 Mo — 45s laisse une large marge avant de considérer que
// quelque chose d'anormal est en train de bloquer le serveur.
function _fetchWithRetry(url, options, maxRetries, timeoutMs){
  maxRetries = maxRetries || 3;
  timeoutMs = timeoutMs || 45000;
  return new Promise(function(resolve, reject){
    let attempt = 0;
    function tryFetch(){
      attempt++;
      const opts = Object.assign({}, options);
      if(!opts.signal && typeof AbortSignal !== 'undefined' && AbortSignal.timeout){
        opts.signal = AbortSignal.timeout(timeoutMs);
      }
      fetch(url, opts)
        .then(function(r){
          // 500 = erreur serveur → retry si possible
          if(r.status === 500 && attempt < maxRetries){
            let delay = attempt * 1500; // 1.5s, 3s, 4.5s
            console.warn('[SAVE] Tentative ' + attempt + '/' + maxRetries + ' échouée (500) — retry dans ' + delay + 'ms');
            setTimeout(tryFetch, delay);
          } else {
            resolve(r);
          }
        })
        .catch(function(err){
          if(err && err.name === 'TimeoutError'){
            console.warn('[SAVE] Tentative ' + attempt + '/' + maxRetries + ' — pas de réponse serveur après ' + timeoutMs + 'ms (timeout)');
          }
          if(attempt < maxRetries){
            let delay = attempt * 1500;
            console.warn('[SAVE] Tentative ' + attempt + '/' + maxRetries + ' — réseau KO — retry dans ' + delay + 'ms');
            setTimeout(tryFetch, delay);
          } else {
            reject(err);
          }
        });
    }
    tryFetch();
  });
}

// ════════════════════════════════════════════════════════════════
// calculateDataHash() — hash simple (non-crypto) du contenu envoyé dans
// saveAll(), pour que le serveur/autres onglets puissent détecter si 2
// sauvegardes concurrentes portent sur un état différent. Volontairement
// PAS SHA-256 (pas besoin de sécurité crypto ici, juste de détection de
// changement) — un hash 32 bits type djb2 suffit et reste synchrone
// (pas de await crypto.subtle), donc saveAll() garde son flux actuel.
// ════════════════════════════════════════════════════════════════
function calculateDataHash(str){
  let h = 5381;
  for(let i = 0; i < str.length; i++){
    h = ((h << 5) + h + str.charCodeAt(i)) | 0; // h*33 + c
  }
  return (h >>> 0).toString(16);
}
window.calculateDataHash = calculateDataHash;

// ════════════════════════════════════════════════════════════════
// syncCountersFromServer() — resynchronise DB.nextVId/nextRId/... depuis
// GET /api/counters, sans refaire un /load complet. Appelée après le
// /load initial, puis periodiquement (toutes les 60s) pour éviter que
// _genId() ne s'appuie sur des compteurs locaux périmés si un autre poste
// a créé beaucoup d'enregistrements entre-temps.
// ════════════════════════════════════════════════════════════════
function syncCountersFromServer(){
  if(!_SERVER_MODE || window._serverDown || window._dataLoaded !== true) return;
  fetch('/api/counters', { headers: authHeaders({}) })
    .then(r => r.ok ? r.json() : null)
    .then(d => {
      if(!d || d.ok !== true) return;
      // Validation de format : chaque compteur doit être un nombre fini et
      // positif avant d'être appliqué. Un serveur qui renvoie un JSON
      // corrompu, NaN, une string, ou une valeur négative ne doit jamais
      // pousser une valeur invalide dans DB — on ignore silencieusement ce
      // champ précis (les autres restent traités normalement).
      const isValidCounter = v => typeof v === 'number' && Number.isFinite(v) && v > 0;
      if(isValidCounter(d.nextVId)   && d.nextVId   > (DB.nextVId   || 1)) DB.nextVId   = d.nextVId;
      if(isValidCounter(d.nextRId)   && d.nextRId   > (DB.nextRId   || 1)) DB.nextRId   = d.nextRId;
      if(isValidCounter(d.nextPId)   && d.nextPId   > (DB.nextPId   || 1)) DB.nextPId   = d.nextPId;
      if(isValidCounter(d.nextMId)   && d.nextMId   > (DB.nextMId   || 1)) DB.nextMId   = d.nextMId;
      if(isValidCounter(d.nextGpsId) && d.nextGpsId > (DB.nextGpsId || 1)) DB.nextGpsId = d.nextGpsId;
      if(isValidCounter(d.nextCId)   && d.nextCId   > (DB.nextCId   || 1)) DB.nextCId   = d.nextCId;
      if(isValidCounter(d.nextSupId) && d.nextSupId > (DB.nextSupId || 1)) DB.nextSupId = d.nextSupId;
    })
    .catch(() => { /* silencieux — juste une resync opportuniste, pas critique */ });
}
window.syncCountersFromServer = syncCountersFromServer;
setInterval(syncCountersFromServer, 60000);

// ── saveAll (orig. line 10346) ──
// saveAll(silent) — silent=true (autosave en arrière-plan) : seul le badge
// bouge, aucun toast ni alert() ne vient interrompre l'utilisateur. Les
// échecs sont quand même loggés en console et le badge passe en erreur/offline
// pour rester visible si besoin. silent=false/omis (save manuel / clic bouton) :
// comportement inchangé, toasts + alert en cas d'échec.
function saveAll(silent){
  // ── WATCHDOG : serveur connu comme DOWN → refuser tout envoi ──────
  if(window._serverDown){
    console.warn('[Save] Bloqué — serveur DOWN (watchdog)');
    _setSaveStatus('error', 'server is DOWN');
    if(!silent) showToast('❌ Server is down — data NOT saved!');
    return;
  }
  // ── FIX (2026-07) : filet de sécurité — même si quelque chose d'autre
  // que le clic bouton appelle saveAll() (raccourci clavier, autre module,
  // etc.), on refuse d'envoyer un DB qui n'a pas fini de charger. ──
  if(window._dataLoaded !== true){
    console.warn('[Save] Bloqué — chargement des données pas encore terminé.');
    if(!silent) showToast('⏳ Loading in progress — try again in a few seconds');
    return;
  }
  try{
    if(DB.logs && DB.logs.length > 500) DB.logs = DB.logs.slice(0, 500);
    // Persister complaints dans localStorage avant l'envoi serveur
    // (le serveur SQLite n'a pas de table complaints — stockage local uniquement)
    try {
      localStorage.setItem('fleetpro_complaints', JSON.stringify({
        list: DB.complaints || [],
        nextShkId: DB.nextShkId || 1
      }));
    } catch(e){}
    const payloadObj = {
      vehicles: DB.vehicles,
      rentals:  DB.rentals,
      payments: DB.payments,
      logs:     DB.logs || [],
      logsClear: logsClearFlag,
      moves:    DB.moves || [],
      gpsLinks: DB.gpsLinks || [],
      depence:  DB.depence || [],
      bookings: DB.bookings || [],
      // bookingCatalog VOLONTAIREMENT absent d'ici — voir FIX 18/07/2026 ci-dessous.
      // Ce tableau est déjà sauvegardé ligne par ligne (saveOne) à chaque Save/upload
      // de carte dans module-booking.js. Le renvoyer ici (en entier, depuis la mémoire
      // de CE navigateur) écrasait silencieusement les photos/prix sauvegardés entre-temps
      // depuis un AUTRE poste/onglet, dès que cet autre poste faisait un autosave — même
      // pour une raison sans rapport (un changement de location, par exemple).
      nextVId:  DB.nextVId,
      nextRId:  DB.nextRId,
      nextPId:  DB.nextPId,
      nextMId:  DB.nextMId || 1,
      nextGpsId: DB.nextGpsId || 1,
      clients:  DB.clients || [],
      nextCId:  DB.nextCId || 1,
      nextDepId: DB.nextDepId || 1,
      suppliers: DB.suppliers || [],
      nextSupId: DB.nextSupId || 1,
      savedAt:  new Date().toISOString()
    };
    // dataHash calculé sur le contenu AVANT ajout du hash lui-même (sinon
    // le hash s'auto-inclurait dans son propre calcul) — sert au serveur/
    // debug pour détecter 2 sauvegardes concurrentes portant des états
    // différents (voir calculateDataHash() ci-dessus).
    payloadObj.dataHash = calculateDataHash(JSON.stringify(payloadObj));

    // ── ÉVITER LES SAVES INUTILES (autosave silencieux uniquement) ──────
    // Si rien n'a changé depuis le dernier envoi réussi (même dataHash),
    // pas la peine de retaper le réseau/SQLite toutes les 20-40s. On ne
    // fait CE court-circuit QUE pour silent=true : un save manuel (clic
    // bouton) doit TOUJOURS partir, même si rien n'a changé, pour que
    // l'utilisateur ait la confirmation visuelle attendue.
    if(silent && window._lastSavedHash === payloadObj.dataHash){
      _setSaveStatus('ok');
      return;
    }
    const payload = JSON.stringify(payloadObj);
    logsClearFlag = false; // ce flag ne doit s'appliquer qu'à CETTE sauvegarde
    window.__UNDO_BACKUP__ = payload;

    if(_SERVER_MODE){
      _setSaveStatus('saving');
      Promise.resolve({ body: payload, headers: {} })
        .then(bodyInfo => _fetchWithRetry('/save', {
          method: 'POST',
          headers: authHeaders(Object.assign({ 'Content-Type': 'application/json' }, bodyInfo.headers)),
          body: bodyInfo.body
        }, 3, 120000)) // timeout 120s — laisse le temps aux lignes lentes de finir l'upload
        .then(r => {
          if(r.status === 401){ handleAuthExpired(); return null; }
          if(r.status === 413){
            _setSaveStatus('error', 'payload too large');
            console.error('[Save] Payload rejeté — trop volumineux (>30 Mo). Données NON sauvegardées.');
            if(!silent) showToast('❌ Sauvegarde refusée : données trop volumineuses (>30 Mo). Contacte le support avant de continuer à travailler.');
            return null;
          }
          return r.json();
        })
        .then(r => {
          if(!r) return; // session expirée ou payload rejeté, déjà géré ci-dessus
          if(r.ok){
            _setSaveStatus('ok');
            window._lastSavedHash = payloadObj.dataHash;
            if(!silent) showToast('✅ Saved — ' + (r.rentals||0) + ' contracts, ' + (r.vehicles||0) + ' vehicles');
          } else {
            _setSaveStatus('error', r.error || 'unknown');
            console.warn('[AutoSave] Échec serveur:', r.error || 'unknown');
            if(!silent){
              showToast('❌ Save FAILED !');
              alert(t(translate('rental.alertSaveFailed'), (r.error||'Unknown error')));
            }
          }
        })
        .catch(() => {
          _localSave(payload);
          _setSaveStatus('offline');
          console.warn('[AutoSave] Serveur inaccessible — sauvegarde locale de secours effectuée.');
          if(!silent){
            showToast('⚠️ Server unreachable — local save');
            alert(translate('rental.alertServerUnreachable'));
          }
        });
    } else {
      _localSave(payload);
      _setSaveStatus('ok');
      window._lastSavedHash = payloadObj.dataHash;
      if(!silent) showToast('✅ Saved locally');
    }
  }catch(err){
    console.error(err);
    _setSaveStatus('error', err.message);
    if(!silent) alert(t(translate('rental.alertSaveFailedGeneric'), err.message));
  }
}

// ════════════════════════════════════════════════════════════════
// SAVE-ONE — sauvegarde ciblée (1 enregistrement au lieu de tout)
// Utilise les routes /save-one et /delete-one déjà présentes côté serveur
// ════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════
// SAVE QUEUE — file d'attente persistante pour les save-one échoués
// Si réseau KO au moment du save → mis en queue localStorage
// Retenté automatiquement toutes les 30s jusqu'au succès
// ════════════════════════════════════════════════════════════════
(function initSaveQueue(){
  const QUEUE_KEY = 'cityrent_save_queue';

  // Lire la queue depuis localStorage
  function _queueGet(){
    try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch(e){ return []; }
  }
  // Sauvegarder la queue dans localStorage
  function _queueSet(q){
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch(e){}
  }
  // Ajouter un item à la queue
  function _queueAdd(table, record){
    let q = _queueGet();
    // Remplacer si même table+id déjà en queue (version plus récente)
    let idx = q.findIndex(x => x.table === table && x.record && x.record.id === record.id);
    if(idx > -1) q[idx] = { table, record, ts: new Date().toISOString() };
    else q.push({ table, record, ts: new Date().toISOString() });
    _queueSet(q);
    _updateQueueBadge();
  }
  // Retirer un item réussi de la queue
  function _queueRemove(table, recordId){
    let q = _queueGet().filter(x => !(x.table === table && x.record && x.record.id === recordId));
    _queueSet(q);
    _updateQueueBadge();
  }

  // Badge d'alerte queue — affiché en haut à droite si items en attente
  function _updateQueueBadge(){
    let q = _queueGet();
    let badge = document.getElementById('save-queue-badge');
    if(!badge){
      badge = document.createElement('div');
      badge.id = 'save-queue-badge';
      badge.style.cssText = [
        'position:fixed','top:8px','right:60px','z-index:999999',
        'background:#dc2626','color:#fff','font-size:.75rem','font-weight:700',
        'padding:6px 14px','border-radius:20px','letter-spacing:.3px',
        'box-shadow:0 2px 12px rgba(220,38,38,.5)',
        'cursor:pointer','display:none',
        'animation:pulse-red 1.5s infinite'
      ].join(';');
      badge.title = 'Sauvegardes en attente — cliquer pour forcer';
      badge.onclick = function(){ window._flushSaveQueue && window._flushSaveQueue(); };
      // Injecter CSS animation
      if(!document.getElementById('save-queue-css')){
        let style = document.createElement('style');
        style.id = 'save-queue-css';
        style.textContent = '@keyframes pulse-red{0%,100%{box-shadow:0 2px 12px rgba(220,38,38,.5)}50%{box-shadow:0 2px 20px rgba(220,38,38,.9)}}';
        document.head.appendChild(style);
      }
      document.body.appendChild(badge);
    }
    if(q.length === 0){
      badge.style.display = 'none';
    } else {
      badge.style.display = 'block';
      badge.textContent = '⚠️ ' + q.length + ' pending save(s) — click to retry';
    }
  }

  // Flush : envoyer tous les items en queue
  async function _flushSaveQueue(){
    let q = _queueGet();
    if(q.length === 0) return;
    console.log('[SaveQueue] Flush ' + q.length + ' items en attente...');
    let success = 0, fail = 0, conflicts = 0;
    for(let item of q){
      try{
        // Timeout (2026-08) : sans ça, un item bloqué (serveur qui ne répond
        // jamais) fige TOUT le flush — le `for...of await` n'avance plus,
        // les items suivants de la queue n'ont même pas leur chance d'être
        // tentés, et rien ne remonte d'erreur avant longtemps.
        const opts = { method:'POST', headers: authHeaders({'Content-Type':'application/json'}),
                        body: JSON.stringify({ table: item.table, record: item.record }) };
        if(typeof AbortSignal !== 'undefined' && AbortSignal.timeout) opts.signal = AbortSignal.timeout(45000);
        let r = await fetch('/save-one', opts);
        let data = await r.json();
        if(data && data.ok){
          _queueRemove(item.table, item.record.id);
          success++;
          console.log('[SaveQueue] ✅ ' + item.table + ' id=' + item.record.id + ' sauvegardé');
        } else if(data && data.code === 'VEHICLE_CONFLICT'){
          // FIX 06/08/2026 : même traitement que dans saveOne() — erreur DÉFINITIVE
          // (pas un problème réseau/serveur passager), donc on NE LA REMET JAMAIS EN
          // QUEUE, sinon elle boucle en silence toutes les 30s pour toujours. On alerte
          // l'utilisateur, on retire l'item de la queue, et on retire l'enregistrement
          // optimiste de la mémoire locale pour ne pas l'afficher comme "sauvegardé"
          // alors qu'il n'existe pas côté serveur.
          conflicts++;
          _queueRemove(item.table, item.record.id);
          console.error('❌ [SaveQueue] VEHICLE CONFLICT:', item.table, item.record.id, data.conflict);
          let c = data.conflict || {};
          alert(t(translate('rental.alertVehicleConflictQueue'), item.table, item.record.id, (c.contract||'?'), (c.dateOut||'?'),
                (c.dateIn ? t(translate('rental.alertVehicleConflictReturned'), c.dateIn) : translate('rental.alertVehicleConflictNotReturned'))));
          if(item.table === 'rentals' && window.DB && Array.isArray(DB.rentals)){
            let idx = DB.rentals.findIndex(x => x.id === item.record.id);
            if(idx !== -1) DB.rentals.splice(idx, 1);
            if(window.refreshAll) refreshAll();
          }
        } else {
          fail++;
        }
      } catch(e){
        fail++;
        console.warn('[SaveQueue] ❌ ' + item.table + ' id=' + item.record.id + ' encore KO');
      }
    }
    _updateQueueBadge();
    if(conflicts > 0){
      _setSaveStatus('error', 'vehicle conflict');
    } else if(success > 0 && fail === 0){
      _setSaveStatus('ok');
      showToast('✅ ' + success + ' pending save(s) sent successfully!');
    } else if(success > 0){
      showToast('⚠️ ' + success + ' saved, ' + fail + ' still pending');
    }
  }

  // Retry automatique toutes les 30s
  setInterval(function(){
    let q = _queueGet();
    if(q.length > 0) _flushSaveQueue();
  }, 30000);

  // Retry au retour de la connexion réseau
  window.addEventListener('online', function(){
    let q = _queueGet();
    if(q.length > 0){
      console.log('[SaveQueue] Réseau revenu — flush queue (' + q.length + ' items)');
      setTimeout(_flushSaveQueue, 1000);
    }
  });

  // Avertir avant de fermer/recharger l'onglet si des sauvegardes sont
  // encore en attente : tant qu'elles ne sont pas envoyées au serveur,
  // elles ne vivent que dans le localStorage de CE navigateur. Fermer
  // l'onglet est sans risque (la queue reste stockée), mais vider le
  // cache ou changer de navigateur/PC avant qu'elle ne soit envoyée
  // ferait perdre ces données.
  window.addEventListener('beforeunload', function(e){
    let q = _queueGet();
    if(q.length > 0){
      e.preventDefault();
      e.returnValue = '';
      return '';
    }
  });

  // Exposer les fonctions globalement
  window._saveQueueAdd    = _queueAdd;
  window._saveQueueRemove = _queueRemove;
  window._flushSaveQueue  = _flushSaveQueue;
  window._saveQueueGet    = _queueGet;

  // Initialiser le badge au chargement
  if(document.body) _updateQueueBadge();
  else document.addEventListener('DOMContentLoaded', _updateQueueBadge);
})();

// ── saveOne — appelle POST /save-one { table, record } ──
function saveOne(table, record, toastMsg){
  // ── WATCHDOG : serveur connu comme DOWN → refuser tout envoi ──────
  if(window._serverDown){
    console.warn('[SaveOne] Bloqué — serveur DOWN (watchdog)');
    _setSaveStatus('error', 'server is DOWN');
    return;
  }
  if(!_SERVER_MODE){
    // Mode local: pas de route dédiée, on garde le fallback saveAll()
    saveAll();
    return;
  }
  _setSaveStatus('saving');
  _fetchWithRetry('/save-one', {
    method: 'POST',
    headers: authHeaders({'Content-Type':'application/json'}),
    body: JSON.stringify({ table: table, record: record })
  }, 3)
  .then(r => {
    if(r.status === 401){ handleAuthExpired(); return null; }
    return r.json();
  })
  .then(r => {
    if(!r) return;
    if(r.ok){
      _setSaveStatus('ok');
      // Si cet item était en queue (retry réussi), le retirer
      if(window._saveQueueRemove) window._saveQueueRemove(table, record.id);
      if(toastMsg) showToast(toastMsg);
    } else if(r.code === 'VEHICLE_CONFLICT'){
      // FIX 04/08/2026 : erreur définitive (pas un problème réseau/serveur passager) —
      // NE JAMAIS mettre en queue de retry, sinon le save échoue en boucle silencieuse
      // pour toujours. On alerte clairement l'utilisateur et on retire l'enregistrement
      // optimiste de la mémoire locale, sinon il reste affiché comme "sauvegardé" dans
      // l'UI alors qu'il n'existe pas côté serveur.
      _setSaveStatus('error', 'conflit véhicule');
      console.error('❌ save-one VEHICLE CONFLICT:', table, record.id, r.conflict);
      let c = r.conflict || {};
      alert(t(translate('rental.alertVehicleConflictSaveOne'), (c.contract||'?'), (c.dateOut||'?'),
            (c.dateIn ? t(translate('rental.alertVehicleConflictReturned'), c.dateIn) : translate('rental.alertVehicleConflictNotReturned'))));
      if(table === 'rentals' && window.DB && Array.isArray(DB.rentals)){
        let idx = DB.rentals.findIndex(x => x.id === record.id);
        if(idx !== -1) DB.rentals.splice(idx, 1);
        if(window.refreshAll) refreshAll();
      }
    } else {
      // Erreur serveur → mettre en queue + alerte visible
      _setSaveStatus('error', r.error || 'unknown');
      if(window._saveQueueAdd) window._saveQueueAdd(table, record);
      showToast('❌ Save failed — queued');
      console.error('❌ save-one erreur serveur:', table, record.id, r.error);
    }
  })
  .catch(err => {
    // Réseau KO → mettre en queue localStorage + badge rouge visible
    console.error('❌ save-one réseau KO après 3 tentatives:', table, record.id, err.message);
    _setSaveStatus('error', 'réseau KO');
    if(window._saveQueueAdd) window._saveQueueAdd(table, record);
    showToast('❌ Network down — save queued ⚠️');
  });
}

// ── deleteOne — appelle POST /delete-one { table, id } ──
function deleteOne(table, id, toastMsg){
  if(!_SERVER_MODE){
    saveAll();
    return;
  }
  _setSaveStatus('saving');
  _fetchWithRetry('/delete-one', {
    method: 'POST',
    headers: authHeaders({'Content-Type':'application/json'}),
    body: JSON.stringify({ table: table, id: id })
  }, 3)
  .then(r => {
    if(r.status === 401){ handleAuthExpired(); return null; }
    return r.json();
  })
  .then(r => {
    if(!r) return;
    if(r.ok){
      _setSaveStatus('ok');
      if(toastMsg) showToast(toastMsg);
    } else {
      _setSaveStatus('error', r.error || 'unknown');
      showToast('❌ Delete error: ' + (r.error || 'unknown'));
      alert(t(translate('rental.alertDeleteFailed'), table, (r.error||'unknown')));
    }
  })
  .catch(err => {
    console.error('❌ delete-one échec après 3 tentatives:', err);
    _setSaveStatus('error', 'réseau KO');
    showToast('❌ DELETE FAILED — network down!');
    alert(translate('rental.alertDeleteFailedRetries'));
  });
}

// ── Fonctions spécialisées (à utiliser à la place de saveAll() dans les modules) ──

function saveVehicle(vehicleId){
  let v = DB.vehicles.find(x => x.id === vehicleId);
  if(!v){ console.warn('Vehicle not found:', vehicleId); return; }
  v.updatedAt = Date.now(); // FIX (2026-08) : permet au serveur de refuser qu'un autre
  // poste (autosave, vieille copie en mémoire) écrase cette modif avec une version périmée.
  saveOne('vehicles', v, '🚗 Vehicle saved');
}

function saveRental(rentalId){
  let r = DB.rentals.find(x => x.id === rentalId);
  if(!r){ console.warn('Rental not found:', rentalId); return; }
  r.updatedAt = Date.now(); // FIX (2026-08) : le garde serveur ne protégeait que dateIn —
  // un prix/km édité ici pouvait être écrasé par l'autosave périmé d'un autre poste.
  // Ce stamp permet au serveur d'ajouter un garde générique (voir server.js dbSave).
  saveOne('rentals', r, '🔑 Contract saved');
}

function savePayment(paymentId){
  let p = DB.payments.find(x => x.id === paymentId);
  if(!p){ console.warn('Payment not found:', paymentId); return; }
  p.updatedAt = Date.now(); // FIX (2026-08) : permet au serveur de refuser qu'un autre
  // poste (autosave, vieille copie en mémoire) écrase cette modif avec une version périmée.
  saveOne('payments', p, '💰 Payment saved');
}

function saveClient(clientId){
  let c = DB.clients.find(x => x.id === clientId);
  if(!c){ console.warn('Client not found:', clientId); return; }
  c.updatedAt = Date.now(); // FIX (2026-08) : même protection que vehicles/payments/gps —
  // sans ça le garde anti-régression serveur pour clients ne bloquait jamais rien
  // (incomingUpdatedAt toujours 0), donc un autosave périmé d'un autre poste pouvait
  // écraser silencieusement une modif client faite entre-temps.
  saveOne('clients', c, '👤 Client saved');
}

function saveMove(moveId){
  let m = DB.moves.find(x => x.id === moveId);
  if(!m){ console.warn('Move not found:', moveId); return; }
  m.updatedAt = Date.now(); // FIX (2026-08) : même principe que rentals — le garde serveur
  // ne protégeait que dateIn, pas les autres champs (dest, notes...).
  saveOne('moves', m, '🔄 Movement saved');
}

function saveGpsLink(gpsId){
  let g = DB.gpsLinks.find(x => x.id === gpsId);
  if(!g){ console.warn('GPS link not found:', gpsId); return; }
  g.updatedAt = Date.now(); // FIX (2026-08) : même protection que vehicles/payments/bookings.
  saveOne('gps_links', g, '🛰️ GPS link saved');
}

function saveExpense(depId){
  let dep = DB.depence.find(x => x.id === depId);
  if(!dep){ console.warn('Expense not found:', depId); return; }
  dep.updatedAt = Date.now(); // même protection que moves/gps_links — évite qu'un autre
  // poste resté ouvert avec une vieille copie en mémoire écrase cette dépense via autosave.
  saveOne('depence', dep, '💸 Expense saved');
}

function deleteExpense(depId){
  let idx = DB.depence.findIndex(x => x.id === depId);
  if(idx === -1){ console.warn('Expense not found:', depId); return; }
  DB.depence.splice(idx, 1);
  deleteOne('depence', depId, '🗑️ Expense deleted');
}

// ── Fournisseurs (roadmap #6) — même pattern que saveExpense/deleteExpense. ──
function saveSupplier(supId){
  let sup = (DB.suppliers||[]).find(x => x.id === supId);
  if(!sup){ console.warn('Supplier not found:', supId); return; }
  sup.updatedAt = Date.now(); // même protection anti-régression que vehicles/depence/clients.
  saveOne('suppliers', sup, '🏷️ Supplier saved');
}
function deleteSupplier(supId){
  let idx = (DB.suppliers||[]).findIndex(x => x.id === supId);
  if(idx === -1){ console.warn('Supplier not found:', supId); return; }
  DB.suppliers.splice(idx, 1);
  deleteOne('suppliers', supId, '🗑️ Supplier deleted');
}
window.saveSupplier = saveSupplier;
window.deleteSupplier = deleteSupplier;

function saveDepenceCategories(){
  if(!_SERVER_MODE){ return; }
  const opts = {
    method: 'POST',
    headers: authHeaders({'Content-Type':'application/json'}),
    body: JSON.stringify({ categories: DB.depenceCategories || [] })
  };
  // Timeout (2026-08) : même protection que le reste des saves — sans ça,
  // un serveur qui ne répond jamais laisse cet appel bloqué indéfiniment
  // sans jamais logger d'erreur ni prévenir l'utilisateur.
  if(typeof AbortSignal !== 'undefined' && AbortSignal.timeout) opts.signal = AbortSignal.timeout(45000);
  fetch('/save-depence-categories', opts)
  .then(r => { if(r.status === 401){ handleAuthExpired(); return null; } return r.json(); })
  .then(r => { if(r && !r.ok) console.error('❌ save categories error:', r.error); })
  .catch(err => {
    console.error('❌ save-depence-categories réseau KO:', err.message);
    showToast('⚠️ Categories not saved — server unreachable');
  });
}
window.saveExpense = saveExpense;
window.deleteExpense = deleteExpense;
window.saveDepenceCategories = saveDepenceCategories;

window.saveOne = saveOne;

// ── backupNow — force un backup immédiat côté serveur ──
function backupNow(){
  if(!_SERVER_MODE){ toast('⚠️ Local mode — no server backup'); return; }
  const opts = { method:'POST', headers: authHeaders({'Content-Type':'application/json'}) };
  // Timeout (2026-08) : un backup peut légitimement prendre plus de temps
  // qu'un save classique (copie de fichier), donc marge plus large que 45s.
  if(typeof AbortSignal !== 'undefined' && AbortSignal.timeout) opts.signal = AbortSignal.timeout(90000);
  fetch('/backup-now', opts)
    .then(r => r.json())
    .then(r => {
      if(r && r.ok){ showToast('✅ Backup completed successfully!'); }
      else { showToast('❌ Backup failed: ' + (r&&r.error||'unknown')); }
    })
    .catch(() => showToast('❌ Server unreachable — backup not confirmed'));
}
window.backupNow = backupNow;
window.deleteOne = deleteOne;
window.saveVehicle = saveVehicle;
window.saveRental = saveRental;
window.savePayment = savePayment;
window.saveClient = saveClient;
window.saveMove = saveMove;
window._coreSaveMove = saveMove; // alias pour éviter conflit avec saveMove() local dans module-internal-movements.js
window.saveGpsLink = saveGpsLink;

// ════════════════════════════════════════════════════════════════
// CHECK PASSWORD — vérification côté serveur (mot de passe jamais dans le code client)
// ════════════════════════════════════════════════════════════════
/**
 * Vérifie le mot de passe via le serveur.
 * @param {string} pw - Mot de passe saisi par l'utilisateur
 * @returns {Promise<boolean>} true si correct, false sinon
 */
function checkPassword(pw, context) {
  if (!pw) return Promise.resolve(false);
  if (!_SERVER_MODE) {
    showToast('⚠️ Server required for password check');
    return Promise.resolve(false);
  }
  return fetch('/check-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: pw })
  })
  .then(r => r.json())
  .then(r => {
    let ctx = context || 'Unknown action';
    if(r.locked){
      // IP bloquée
      let msg = '🔒 Accès bloqué ' + (r.remainMin||5) + ' min — Trop de tentatives';
      showToast(msg);
      logAction('security', '🔒 IP Bloquée — ' + ctx, '', '');
      updateLogBadge();
      return false;
    }
    let ok = r.ok === true;
    if(ok){
      logAction('security', '🔐 Password OK — ' + ctx, '', '');
    } else {
      let attemptsMsg = r.remaining !== undefined ? ' (' + r.remaining + ' essai(s) restant)' : '';
      logAction('security', '🚨 Wrong Password — ' + ctx + attemptsMsg, '', '');
    }
    updateLogBadge();
    return ok;
  })
  .catch(err => {
    console.error('❌ checkPassword error:', err);
    showToast('⚠️ Network error — cannot verify password');
    return false;
  });
}
window.checkPassword = checkPassword;

// ── chargerSavee (orig. line 10395) ──
function chargerSavee(){
  function applyData(d){
    if(d){
      try{
        // Always apply server data — even empty arrays mean the user deleted everything
        if(d.vehicles !== undefined) DB.vehicles = d.vehicles;
        if(d.rentals  !== undefined) DB.rentals  = d.rentals;
        else if(d.locations !== undefined) DB.rentals = d.locations;
        if(d.payments !== undefined) DB.payments = d.payments;
        if(d.branches !== undefined) DB.branches = d.branches; else DB.branches = ['BARKA','MOEBELA'];
        if(d.currentUser !== undefined) DB.currentUser = d.currentUser;
        if(d.logs     !== undefined) DB.logs     = d.logs;
        if(d.moves    !== undefined) DB.moves    = d.moves; else DB.moves = [];
        // kmHistory — non filtré par branche (voir server.js dbLoad) : permet
        // à Service & KM de calculer le KM correct même en session Barka/Moebela
        if(d.kmHistory !== undefined) DB.kmHistory = d.kmHistory; else DB.kmHistory = [];
        if(d.gpsLinks !== undefined) DB.gpsLinks = d.gpsLinks; else DB.gpsLinks = [];
        if(d.depence !== undefined) DB.depence = d.depence; else DB.depence = [];
        // Catégories par défaut si le serveur n'en a encore aucune (première install).
        if(d.depenceCategories && d.depenceCategories.length) {
          DB.depenceCategories = d.depenceCategories;
        } else {
          DB.depenceCategories = [
            { name: 'Fuel',          scope: 'vehicle' },
            { name: 'Maintenance',   scope: 'vehicle' },
            { name: 'Insurance',     scope: 'vehicle' },
            { name: 'Traffic Fine',  scope: 'vehicle' },
            { name: 'Rent',          scope: 'general' },
            { name: 'Salaries',      scope: 'general' },
            { name: 'Utilities',     scope: 'general' },
            { name: 'Other',         scope: 'both' }
          ];
        }
        if(d.closedMonths !== undefined) DB.closedMonths = d.closedMonths; else DB.closedMonths = [];
        if(d.bookings !== undefined) DB.bookings = d.bookings; else DB.bookings = [];
        if(d.bookingCatalog !== undefined) DB.bookingCatalog = d.bookingCatalog; else DB.bookingCatalog = [];
        DB.nextVId = d.nextVId || (DB.vehicles.length ? Math.max(0,...DB.vehicles.map(v=>v.id))+1 : 1);
        DB.nextRId = d.nextRId || (DB.rentals.length  ? Math.max(0,...DB.rentals.map(r=>r.id))+1  : 1);
        DB.nextPId = d.nextPId || (DB.payments.length ? Math.max(0,...DB.payments.map(p=>p.id))+1 : 1);
        DB.nextMId = d.nextMId || (DB.moves && DB.moves.length ? Math.max(0,...DB.moves.map(m=>m.id))+1 : 1);
        DB.nextGpsId = d.nextGpsId || (DB.gpsLinks.length ? Math.max(0,...DB.gpsLinks.map(g=>g.id))+1 : 1);
        DB.nextDepId = d.nextDepId || (DB.depence && DB.depence.length ? Math.max(0,...DB.depence.map(x=>x.id))+1 : 1);
        if(d.clients  !== undefined) DB.clients  = d.clients; else DB.clients = [];
        DB.nextCId = d.nextCId || (DB.clients.length ? Math.max(0,...DB.clients.map(c=>c.id))+1 : 1);
        // Fournisseurs (roadmap #6) — même pattern additif que depence/clients.
        if(d.suppliers !== undefined) DB.suppliers = d.suppliers; else DB.suppliers = [];
        DB.nextSupId = d.nextSupId || (DB.suppliers.length ? Math.max(0,...DB.suppliers.map(s=>s.id))+1 : 1);
        // ── Complaints — stockage localStorage uniquement (pas de table SQLite) ──
        DB.complaints = [];
        DB.nextShkId = 1;
        try {
          const lsRaw = localStorage.getItem('fleetpro_complaints');
          if(lsRaw) { const ls = JSON.parse(lsRaw); DB.complaints = ls.list || []; DB.nextShkId = ls.nextShkId || 1; }
        } catch(e){}
        if(typeof migratePaymentsFromRentals==='function') migratePaymentsFromRentals();
        // _balManual is preserved as saved — do NOT reset here.
        // Migration : reconstruire paymentLog de chaque rental depuis DB.payments (élimine les doublons)
        DB.rentals.forEach(function(r){
          // FIX (2026-08) : scopé par branche (+ véhicule en sécu supplémentaire) —
          // sinon un contrat "4499" BARKA récupère les paiements du contrat "4499"
          // MOEBELA en session Directeur (les 2 branches ont chacune leur propre
          // séquence de numéros de contrat indépendante).
          let dbPays = DB.payments.filter(p => {
            if(String(p.contract) !== String(r.contract) || String(p.contract) === '') return false;
            if(r.branch && p.branch && String(p.branch).toUpperCase() !== String(r.branch).toUpperCase()) return false;
            if(r.vehicleId && p.vehicleId && p.vehicleId !== r.vehicleId) return false;
            return true;
          });
          if(dbPays.length > 0){
            r.paymentLog = dbPays.map(p => ({ amount: Number(p.paid || p.price||0), date: p.dateOut||'', method: p.paymentMethod||'', receipt: p.receipt||'', id: p.id, _quickAdd: p._quickAdd||false }));
            r.paid = dbPays.reduce((s,p) => s + Number(p.paid || p.price||0), 0);
          }
        });
      }catch(e){ console.warn('Load error',e); }
    }
    if(typeof migrateRentals==='function') migrateRentals();
    let now = new Date();
    let ym = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0'); // local (toISOString = UTC → mauvais mois entre 00h et 04h à Oman le 1er)
    window._currentYm = ym;
    let mp = document.getElementById('month-picker');
    if(mp) mp.value = ym;
    let pm = document.getElementById('pay-month');
    if(pm) pm.value = ym;
    if(typeof refreshMonthCalendarLabels === 'function') refreshMonthCalendarLabels();
    // ── FIX (2026-07) : Dashboard est maintenant la page d'accueil par
    // défaut (au lieu de Daily Rentals). Comme elle est chargée en lazy
    // (template <tpl-page-dashboard>), il faut l'hydrater ici avant que
    // refreshAll() (qui appelle buildDashboard()) ne s'exécute. ──
    if(typeof ensurePageLoaded==='function'){ ensurePageLoaded('dashboard'); _lastRenderedPage = 'dashboard'; }
    if(typeof refreshAll==='function') refreshAll();
    if(typeof updateLogBadge==='function') updateLogBadge();
    setTimeout(function(){ if(typeof updateUndoBtn==='function') updateUndoBtn(); }, 100);
    setTimeout(function(){ if(typeof shk_renderSavedList==='function') shk_renderSavedList(); }, 300);

    // ── FIX (2026-07) : les données réelles sont maintenant en mémoire ──
    // On autorise enfin les sauvegardes (bouton + auto-save).
    window._dataLoaded = true;
    if(typeof _setSaveButtonEnabled === 'function') _setSaveButtonEnabled(true);

    // ── FIX (2026-07) : le skeleton de démarrage restait affiché jusqu'à
    // ce que les modules JS finissent de charger (event 'cityrent:modules-
    // ready'), mais PAS jusqu'à ce que les vraies données serveur (/load)
    // soient arrivées et rendues. Résultat : l'utilisateur voyait un flash
    // de données vides/périmées pendant 1-2s avant que refreshAll() ne
    // rafraîchisse tout. Le skeleton est maintenant masqué ICI, une fois
    // que refreshAll() a fini de peindre les vraies données. ──
    (function _hideStartupSkeleton(){
      let sk = document.getElementById('app-loading-skeleton');
      if(!sk) return;
      sk.style.transition = 'opacity .25s ease';
      sk.style.opacity = '0';
      setTimeout(function(){ if(sk && sk.parentNode) sk.remove(); }, 260);
    })();
  }

  if(_SERVER_MODE){
    // Load from server first
    // Timeout (2026-08) : sans ça, un serveur qui ne répond jamais laisse
    // l'app bloquée sur le skeleton de démarrage indéfiniment, au lieu de
    // basculer sur le fallback localStorage déjà prévu dans le .catch().
    const _loadOpts = { headers: authHeaders() };
    if(typeof AbortSignal !== 'undefined' && AbortSignal.timeout) _loadOpts.signal = AbortSignal.timeout(45000);
    fetch('/load', _loadOpts).then(r => {
      if(r.status === 401){ handleAuthExpired(); return; }
      if(r.status === 204) { applyData(null); loadAttachmentsIndex(); return; }
      return r.json().then(d => {
        applyData(d); loadAttachmentsIndex(); updateTopbarUser();
        // ✅ VIDER LA QUEUE APRÈS LE CHARGEMENT — si des saves étaient restés
        // en attente (serveur KO au moment où ils ont été faits), on tente de
        // les renvoyer maintenant que le serveur répond de nouveau.
        setTimeout(function(){
          if(window._flushSaveQueue) window._flushSaveQueue();
        }, 1500);
      });
    }).catch(() => {
      // Server unreachable — try localStorage fallback
      let d = null;
      try { let raw = localStorage.getItem('fleetpro_main') || localStorage.getItem('fleetpro_backup'); if(raw) d = JSON.parse(raw); } catch(e){}
      applyData(d);
      loadAttachmentsIndex();
    });
  } else {
    let d = null;
    try {
      let raw = localStorage.getItem('fleetpro_main') || localStorage.getItem('fleetpro_backup');
      if(raw) d = JSON.parse(raw);
    } catch(e){}
    applyData(d);
    loadAttachmentsIndex();
  }
}


// ── updateThemeIcon (orig. line 10473) ──
function updateThemeIcon(isDark){
  let icon = document.getElementById('theme-icon');
  if(!icon) return;
  if(isDark){
    icon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke="currentColor" stroke-width="2" fill="none"/>';
  } else {
    icon.innerHTML = '<circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="2"></circle><line x1="12" y1="2" x2="12" y2="5" stroke="currentColor" stroke-width="2" stroke-linecap="round"></line><line x1="12" y1="19" x2="12" y2="22" stroke="currentColor" stroke-width="2" stroke-linecap="round"></line><line x1="2" y1="12" x2="5" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"></line><line x1="19" y1="12" x2="22" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"></line><line x1="4.93" y1="4.93" x2="7.05" y2="7.05" stroke="currentColor" stroke-width="2" stroke-linecap="round"></line><line x1="16.95" y1="16.95" x2="19.07" y2="19.07" stroke="currentColor" stroke-width="2" stroke-linecap="round"></line><line x1="4.93" y1="19.07" x2="7.05" y2="16.95" stroke="currentColor" stroke-width="2" stroke-linecap="round"></line><line x1="16.95" y1="7.05" x2="19.07" y2="4.93" stroke="currentColor" stroke-width="2" stroke-linecap="round"></line>';
  }
}
// ── goToContract: navigate to Daily Rentals and highlight contract ──
// ── toggleTheme (orig. line 10518) ──
function toggleTheme(){
  let isDark = document.body.classList.toggle('dark');
  localStorage.setItem('fleetpro_theme', isDark ? 'dark' : 'light');
  updateThemeIcon(isDark);
}
// ── Toggle Table "Show more" ──────────────────────────────────────
// ── toggleTable (orig. line 10524) ──
function toggleTable(containerId, btn) {
  var container = document.getElementById(containerId);
  if (!container) return;
  
  var isExpanded = container.classList.toggle('expanded');
  var span = btn.querySelector('span:first-child');
  var chevron = btn.querySelector('.chevron');
  
  if (isExpanded) {
    span.textContent = 'Show less';
    if (chevron) chevron.classList.add('rotated');
  } else {
    span.textContent = 'Show more';
    if (chevron) chevron.classList.remove('rotated');
  }
}
document.querySelectorAll('.overlay').forEach(o => o.addEventListener('click', e => { if(e.target === o){
  if(o.id === 'modal-video' && typeof closeVideoModal === 'function'){
    closeVideoModal();
  } else {
    o.classList.remove('show');
  }
} }));
// Coordinates for weather/prayer widgets (Barka, Oman) — must be declared before the init IIFE below uses them
const WEATHER_LAT = 23.7128, WEATHER_LON = 57.8892;
// Sync init (theme, sidebar, date) then async DB load
(function(){
  let savedTheme = localStorage.getItem('fleetpro_theme');
  if(savedTheme === 'dark') document.body.classList.add('dark');
  updateThemeIcon(document.body.classList.contains('dark'));
  if(typeof initSidebar === 'function') initSidebar();
  // Restore sidebar collapsed state
  try {
    if(localStorage.getItem('fleetpro_sidebar') === '0'){
      var shell = document.querySelector('.shell');
      var tab   = document.querySelector('.sidebar-reopen-tab');
      if(shell){ shell.classList.add('sidebar-collapsed'); if(tab) tab.classList.add('visible'); }
    }
  } catch(e){}
  let now = new Date();
  let topDate = document.getElementById('top-date');
  if(topDate) topDate.innerHTML = now.toLocaleDateString('en-GB',{weekday:'short',day:'2-digit',month:'short',year:'numeric'});
  loadTopbarWeather();
  loadTopbarPrayer();
})();

// ── Weather widget (Open-Meteo — free, no API key) — Barka, Oman ───────────
const WEATHER_CODES = {
  0:'☀️', 1:'🌤️', 2:'⛅', 3:'☁️',
  45:'🌫️', 48:'🌫️',
  51:'🌦️', 53:'🌦️', 55:'🌦️',
  61:'🌧️', 63:'🌧️', 65:'🌧️',
  71:'🌨️', 73:'🌨️', 75:'🌨️',
  80:'🌦️', 81:'🌧️', 82:'⛈️',
  95:'⛈️', 96:'⛈️', 99:'⛈️'
};
async function loadTopbarWeather(){
  let iconEl = document.getElementById('weather-icon');
  let valEl  = document.getElementById('weather-val');
  if(!valEl) return;
  try {
    // Use cache for 30 min to avoid hammering the API on every page load
    let cached = JSON.parse(localStorage.getItem('fleetpro_weather_cache') || 'null');
    let now = Date.now();
    if(cached && (now - cached.ts) < 30*60*1000){
      if(iconEl) iconEl.textContent = cached.icon;
      valEl.textContent = cached.temp + '°C';
      return;
    }
    let res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${WEATHER_LAT}&longitude=${WEATHER_LON}&current=temperature_2m,weather_code&timezone=auto`);
    let data = await res.json();
    let temp = Math.round(data.current.temperature_2m);
    let code = data.current.weather_code;
    let icon = WEATHER_CODES[code] || '🌤️';
    if(iconEl) iconEl.textContent = icon;
    valEl.textContent = temp + '°C';
    localStorage.setItem('fleetpro_weather_cache', JSON.stringify({ts: now, temp, icon}));
  } catch(e){
    console.log('Weather fetch failed:', e.message);
    if(valEl) valEl.textContent = '—';
  }
}

// ── Prayer time widget (Aladhan API — free, no API key) — Barka, Oman ──────
async function loadTopbarPrayer(){
  let valEl = document.getElementById('prayer-val');
  if(!valEl) return;
  try {
    let today = new Date().toISOString().slice(0,10).split('-').reverse().join('-'); // DD-MM-YYYY
    let cached = JSON.parse(localStorage.getItem('fleetpro_prayer_cache') || 'null');
    let now = new Date();
    let cacheKey = now.toISOString().slice(0,10);
    let timings = null;
    if(cached && cached.date === cacheKey && cached.timings && cached.timings.Fajr){
      timings = cached.timings;
    } else {
      let res = await fetch(`https://api.aladhan.com/v1/timings/${today}?latitude=${WEATHER_LAT}&longitude=${WEATHER_LON}&method=8`);
      let data = await res.json();
      if(!data || !data.data || !data.data.timings) throw new Error('Invalid API response');
      timings = data.data.timings;
      localStorage.setItem('fleetpro_prayer_cache', JSON.stringify({date: cacheKey, timings}));
    }
    let order = ['Fajr','Dhuhr','Asr','Maghrib','Isha'];
    let nowMin = now.getHours()*60 + now.getMinutes();
    let next = null, nextName = null;
    for(let name of order){
      let [h,m] = timings[name].split(':').map(Number);
      let mins = h*60 + m;
      if(mins > nowMin){ next = mins; nextName = name; break; }
    }
    if(!next){ // after Isha — next is tomorrow's Fajr
      nextName = 'Fajr';
      valEl.textContent = timings['Fajr'] + ' (Fajr)';
      return;
    }
    let h = String(Math.floor(next/60)).padStart(2,'0');
    let m = String(next%60).padStart(2,'0');
    valEl.textContent = `${h}:${m} (${nextName})`;
  } catch(e){
    console.log('Prayer time fetch failed:', e.message);
    localStorage.removeItem('fleetpro_prayer_cache');
    if(valEl) valEl.textContent = '—';
  }
}
// Refresh prayer time display every minute (so the "next prayer" advances without refetching)
setInterval(loadTopbarPrayer, 60*1000);
// ── Gate : on ne charge les données que si une session valide existe déjà.
// login.html est désormais une page séparée (extraite de app.html) : plus
// d'overlay in-page à afficher/masquer, on redirige simplement. ──
// FIX (perf 2026-07) : les 13 modules JS (module-daily-rentals.js etc.)
// sont maintenant chargés dynamiquement par app.html APRÈS core.js, en
// arrière-plan, pour ne plus bloquer le premier rendu (voir loader dans
// app.html). Du coup on ne peut plus appeler chargerSavee()/refreshAll()
// ici tout de suite : ces fonctions (renderDaily, etc.) vivent dans des
// modules pas encore chargés à ce stade précis. On attend le signal
// 'cityrent:modules-ready' envoyé par le loader une fois tout chargé.
window._appDataGate = function(){
  if(_SERVER_MODE){
    if(window.AUTH && window.AUTH.token){
      updateTopbarUser();
      chargerSavee(); // async — refreshes UI after IDB load
    } else {
      window.location.replace('login.html');
    }
  } else {
    chargerSavee(); // mode local (file://) — pas de login requis
  }
};
if(window.__modulesReady){
  // Modules déjà chargés (cas rare, timing) → démarrer tout de suite.
  window._appDataGate();
} else {
  window.addEventListener('cityrent:modules-ready', window._appDataGate, {once:true});
}

// ── Polling léger des nouvelles demandes de booking ──────────────────────
// Problème résolu : DB.bookings n'était chargé qu'au démarrage (chargerSavee).
// Une nouvelle demande publique (POST /booking-submit, page booking.html)
// était bien enregistrée côté serveur (log "📩 NOUVELLE DEMANDE BOOKING"),
// mais n'apparaissait dans le menu Booking de l'app QUE si on rechargeait
// toute la page. Ce polling revérifie juste la table bookings toutes les
// 25s — léger (pas un /load complet avec vehicles/rentals/payments/logs),
// et met à jour DB.bookings + le badge + la vue si le menu Booking est ouvert.
let _lastBookingsHash = null;
function _bookingsHash(list){
  return (list||[]).map(function(b){ return b.id + ':' + b.status; }).sort().join('|');
}
function pollBookingRequests(){
  if(!_SERVER_MODE || !window.AUTH || !window.AUTH.token || !window._dataLoaded) return;
  fetch('/booking-requests', { headers: authHeaders() }).then(function(r){
    if(!r.ok) return null; // 401/500 → on réessaiera au prochain tick, silencieux
    return r.json();
  }).then(function(d){
    if(!d || !d.ok || !Array.isArray(d.bookings)) return;
    let newHash = _bookingsHash(d.bookings);
    if(_lastBookingsHash === null){ _lastBookingsHash = newHash; DB.bookings = d.bookings; if(typeof updateBookingBadge==='function') updateBookingBadge(); return; }
    if(newHash === _lastBookingsHash) return; // rien de nouveau depuis le dernier passage

    let previousPending = (DB.bookings||[]).filter(function(b){ return b.status==='pending'; }).length;
    DB.bookings = d.bookings;
    _lastBookingsHash = newHash;
    if(typeof updateBookingBadge === 'function') updateBookingBadge();

    let bookingPage = document.getElementById('page-booking');
    if(bookingPage && bookingPage.classList.contains('active') && typeof renderBookingTabBody === 'function'){
      renderBookingTabBody();
    }
    // Refresh the Dashboard's "New Booking Requests" alert box live, whether or not the Dashboard is the active page
    if(typeof buildDashboard === 'function') buildDashboard();
    let newPending = (DB.bookings||[]).filter(function(b){ return b.status==='pending'; }).length;
    if(newPending > previousPending && typeof showToast === 'function'){
      showToast('📩 New booking request received!');
    }
  }).catch(function(){ /* silencieux — polling best-effort, ne bloque jamais l'app */ });
}
setInterval(pollBookingRequests, 25 * 1000);

// ── toast (orig. line 10646) ──
function toast(msg){ showToast(msg); }

// ── toggleSidebar (orig. line 10648) ──
function toggleSidebar(){
  var shell = document.querySelector('.shell');
  var tab   = document.querySelector('.sidebar-reopen-tab');
  if(!shell) return;
  var collapsed = shell.classList.toggle('sidebar-collapsed');
  if(tab) tab.classList.toggle('visible', collapsed);
  try { localStorage.setItem('fleetpro_sidebar', collapsed ? '0' : '1'); } catch(e){}
}

// ── toggleToolsExtra (orig. line 10657) ──
function toggleToolsExtra(){
  var panel = document.getElementById('tools-extra');
  var btn   = document.getElementById('tools-toggle-btn');
  if(!panel || !btn) return;
  var open = panel.classList.toggle('open');
  btn.classList.toggle('open', open);
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  try { localStorage.setItem('fleetpro_tools_open', open ? '1' : '0'); } catch(e){}
}

(function initToolsExtra(){
  try {
    if (localStorage.getItem('fleetpro_tools_open') === '1') {
      document.addEventListener('DOMContentLoaded', function(){
        var panel = document.getElementById('tools-extra');
        var btn   = document.getElementById('tools-toggle-btn');
        if(panel) panel.classList.add('open');
        if(btn){ btn.classList.add('open'); btn.setAttribute('aria-expanded','true'); }
      });
    }
  } catch(e){}
})();

// ── Undo stack ────────────────────────────────────────────────
window.__UNDO_STACK__ = [];

// ── pushUndo (orig. line 10683) ──
function pushUndo(){
  try{
    window.__UNDO_STACK__.push(JSON.stringify({
      vehicles: DB.vehicles,
      rentals:  DB.rentals,
      payments: DB.payments,
      logs:     DB.logs,
      nextVId:  DB.nextVId,
      nextRId:  DB.nextRId,
      nextPId:  DB.nextPId
    }));
    if(window.__UNDO_STACK__.length > 30) window.__UNDO_STACK__.shift();
    updateUndoBtn();
  }catch(e){ console.warn('pushUndo error', e); }
}

// ── undoChanges (orig. line 10699) ──
function undoChanges(){
  if(!window.__UNDO_STACK__ || window.__UNDO_STACK__.length === 0){
    showToast('Rien a cancel');
    return;
  }
  try{
    const snap = JSON.parse(window.__UNDO_STACK__.pop());
    if(snap.vehicles) DB.vehicles = snap.vehicles;
    if(snap.locations)  DB.rentals  = snap.locations;
    if(snap.payments) DB.payments = snap.payments;
    if(snap.logs)     DB.logs     = snap.logs;
    if(snap.moves)    DB.moves    = snap.moves; else DB.moves = DB.moves || [];
    if(snap.nextVId)  DB.nextVId  = snap.nextVId;
    if(snap.nextRId)  DB.nextRId  = snap.nextRId;
    if(snap.nextPId)  DB.nextPId  = snap.nextPId;
    if(snap.nextMId)  DB.nextMId  = snap.nextMId;
    if(typeof refreshAll==='function') refreshAll();
    if(typeof updateLogBadge==='function') updateLogBadge();
    updateUndoBtn();
    showToast('Undo effectue');
  }catch(e){ alert(t(translate('rental.alertUndoFailed'), e.message)); }
}

// ── updateUndoBtn (orig. line 10722) ──
function updateUndoBtn(){
  const btn = document.getElementById('ctrl-undo-btn');
  if(!btn) return;
  const hasUndo = window.__UNDO_STACK__ && window.__UNDO_STACK__.length > 0;
  btn.disabled = !hasUndo;
  const pill = btn.querySelector('.undo-pill');
  if(pill){
    const n = window.__UNDO_STACK__ ? window.__UNDO_STACK__.length : 0;
    pill.textContent = n;
    pill.className = 'undo-pill' + (n === 0 ? ' empty' : '');
  }
}

// ── showUndoToast (orig. line 10735) ──
function showUndoToast(htmlMsg){
  let t = document.getElementById('undoToast');
  if(!t){
    t = document.createElement('div');
    t.id = 'undoToast';
    t.style.cssText = 'position:fixed;bottom:60px;left:50%;transform:translateX(-50%);background:#1e293b;color:#f1f5f9;padding:10px 18px;border-radius:8px;z-index:99999;font-size:13px;font-weight:500;box-shadow:0 4px 12px rgba(0,0,0,.3);opacity:0;transition:opacity .25s;pointer-events:auto';
    document.body.appendChild(t);
  }
  t.innerHTML = htmlMsg;
  t.style.opacity = '1';
  clearTimeout(t._timer);
  t._timer = setTimeout(()=>{ t.style.opacity='0'; }, 4000);
}

// ── Délégation d'événements (2026-08) — remplace l'onclick="undoAction()"
// jadis codé en dur dans les chaînes de traduction (i18n.js), et le bouton
// "continuer ici" de l'écran anti double-onglet ci-dessus. Comportement
// strictement identique.
document.addEventListener('click', function(e){
  if(e.target.closest('[data-i18n-action="undo"]')) undoAction();
  if(e.target.closest('[data-core-action="tab-lock-override"]')){
    document.getElementById('tab-lock-overlay')?.remove();
    window._tabLockOverride = true;
  }
  
  // ── app-level handlers (2026-08) ──
  let appBtn = e.target.closest('[data-app-action]');
  if(!appBtn) return;
  let appAction = appBtn.dataset.appAction;
  
  if(appAction === 'refresh-available-vehicles'){
    if(typeof chargerSavee === 'function'){
      chargerSavee();
    } else if(typeof renderAvailableVehicles === 'function'){
      renderAvailableVehicles();
    }
  }
  else if(appAction === 'close-rental-modal'){
    if(typeof lockBalField === 'function') lockBalField();
    if(typeof lockPriceField === 'function') lockPriceField();
    if(typeof lockKmInField === 'function') lockKmInField();
    if(typeof closeModal === 'function') closeModal('modal-rental');
  }
  else if(appAction === 'view-client-profile'){
    let cid = window._currentRentalClientId;
    if(!cid){
      if(typeof toast === 'function') toast('⚠️ No client linked');
      return;
    }
    if(typeof goToClientProfile === 'function') goToClientProfile(cid);
  }
  else if(appAction === 'clear-client-scan'){
    let scanType = appBtn.dataset.appScanType || 'id';
    if(typeof clearClientScan === 'function') clearClientScan(scanType);
  }
  // ── FIX (2026-08) : le reste des ~70 data-app-action de app.html n'était
  // jamais géré ici — seuls les 4 ci-dessus l'étaient. Résultat : menu de
  // gauche (goto), déconnexion, bouton son dashboard, et la quasi-totalité
  // des boutons statiques (headers, modals, filtres) ne faisaient RIEN.
  // Les lignes générées dynamiquement (Daily Rentals, Payments, GPS, Moves,
  // Service&KM, Activity Log, Month Picker) ont chacune LEUR PROPRE
  // délégation (data-dr-action, data-pay-action, data-gps-action, etc.) et
  // ne sont pas concernées ici — ne pas dupliquer leur logique. ──
  else if(appAction === 'goto'){ goTo(appBtn.dataset.navPage, appBtn); }
  else if(appAction === 'logout'){ doLogout(); }
  else if(appAction === 'toggle-sidebar'){ toggleSidebar(); }
  else if(appAction === 'toggle-theme'){ toggleTheme(); }
  else if(appAction === 'toggle-language'){ toggleLanguage(); }
  else if(appAction === 'toggle-tools-extra'){ toggleToolsExtra(); }
  else if(appAction === 'toggle-dash-alarm'){ if(typeof toggleDashAlarm === 'function') toggleDashAlarm(); }
  else if(appAction === 'dash-alert-click'){ if(typeof toggleDashAlertDetail === 'function') toggleDashAlertDetail(appBtn.dataset.alertType); }
  else if(appAction === 'dash-alert-close'){ if(typeof closeDashAlertDetail === 'function') closeDashAlertDetail(); }
  else if(appAction === 'open-add-vehicle'){ openAddVehicle(); }
  else if(appAction === 'open-add-rental'){ openAddRental(); }
  else if(appAction === 'open-payment-modal'){ openPaymentModal(); }
  else if(appAction === 'open-move-modal'){ openMoveModal(); }
  else if(appAction === 'open-client-modal'){ openClientModal(); }
  else if(appAction === 'open-gps-modal'){ if(typeof openGpsModal === 'function') openGpsModal(); }
  else if(appAction === 'gps-set-view'){ if(typeof setGpsView === 'function') setGpsView(appBtn.dataset.view); }
  else if(appAction === 'fcal-set-view'){ if(typeof fcalSetView === 'function') fcalSetView(appBtn.dataset.view); }
  else if(appAction === 'fcal-nav'){ if(typeof fcalNav === 'function') fcalNav(appBtn.dataset.dir); }
  else if(appAction === 'fcal-set-status-filter'){ if(typeof fcalSetStatusFilter === 'function') fcalSetStatusFilter(appBtn.dataset.appValue); }
  else if(appAction === 'fcal-set-branch-filter'){ if(typeof fcalSetBranchFilter === 'function') fcalSetBranchFilter(appBtn.dataset.appValue); }
  else if(appAction === 'open-update-km'){ if(typeof openUpdateKm === 'function') openUpdateKm(Number(appBtn.dataset.appId)); }
  else if(appAction === 'open-template-modal'){ if(typeof window.openTemplateModal === 'function') window.openTemplateModal(); }
  else if(appAction === 'close-template-modal'){ if(typeof window.closeTemplateModal === 'function') window.closeTemplateModal(); }
  else if(appAction === 'open-month-calendar'){ if(typeof openMonthCalendar === 'function') openMonthCalendar(appBtn.dataset.appInput, appBtn); }
  else if(appAction === 'close-modal'){ closeModal(appBtn.dataset.appModal); }
  else if(appAction === 'close-move-modal'){ if(typeof closeMoveModal === 'function') closeMoveModal(); }
  else if(appAction === 'close-video-modal'){ if(typeof closeVideoModal === 'function') closeVideoModal(); }
  else if(appAction === 'print-page'){ printPage(appBtn.dataset.appValue); }
  else if(appAction === 'print-rev-stats'){ if(typeof printRevStats === 'function') printRevStats(); }
  else if(appAction === 'print-client-scan'){ if(typeof printClientScan === 'function') printClientScan(); }
  else if(appAction === 'upload-mulkiya-batch'){ if(typeof uploadMulkiyaBatch === 'function') uploadMulkiyaBatch(); }
  else if(appAction === 'oc-set-filter'){ if(typeof ocSetFilter === 'function') ocSetFilter(appBtn.dataset.appValue); }
  else if(appAction === 'avail-set-branch-filter'){ if(typeof _availSetPubBranchFilter === 'function') _availSetPubBranchFilter(appBtn.dataset.appValue); }
  else if(appAction === 'toggle-payment-filter'){ if(typeof togglePaymentFilter === 'function') togglePaymentFilter(appBtn.dataset.method || appBtn.dataset.appValue); }
  else if(appAction === 'render-revenue-stats'){ if(typeof renderRevenueStats === 'function') renderRevenueStats(); }
  else if(appAction === 'switch-revenue-tab'){ if(typeof switchRevenueTab === 'function') switchRevenueTab(appBtn.dataset.appValue); }
  else if(appAction === 'clear-daily-filters'){ if(typeof clearDailyFilters === 'function') clearDailyFilters(); }
  else if(appAction === 'clear-monthly-filters'){ if(typeof clearMonthlyFilters === 'function') clearMonthlyFilters(); }
  else if(appAction === 'clear-yearly-filters'){ if(typeof clearYearlyFilters === 'function') clearYearlyFilters(); }
  else if(appAction === 'clear-vehicle-filters'){ if(typeof clearVehicleFilters === 'function') clearVehicleFilters(); }
  else if(appAction === 'clear-profit-filters'){ if(typeof clearProfitFilters === 'function') clearProfitFilters(); }
  else if(appAction === 'clear-category-filters'){ if(typeof clearCategoryFilters === 'function') clearCategoryFilters(); }
  else if(appAction === 'toggle-category-filter'){ if(typeof toggleCategoryFilter === 'function') toggleCategoryFilter(appBtn.dataset.appValue); }
  else if(appAction === 'open-vehicle-drilldown'){ if(typeof openVehicleDrilldown === 'function') openVehicleDrilldown(appBtn.dataset.plate, appBtn.dataset.from||'', appBtn.dataset.to||'', appBtn.dataset.label||''); }
  else if(appAction === 'export-roi-csv'){ if(typeof exportRoiCSV === 'function') exportRoiCSV(); }
  else if(appAction === 'export-category-csv'){ if(typeof exportCategoryCSV === 'function') exportCategoryCSV(); }
  else if(appAction === 'clear-overview-filters'){ if(typeof clearOverviewFilters === 'function') clearOverviewFilters(); }
  else if(appAction === 'export-overview-csv'){ if(typeof exportOverviewCSV === 'function') exportOverviewCSV(); }
  else if(appAction === 'prev-moves-month'){ if(typeof prevMovesMonth === 'function') prevMovesMonth(); }
  else if(appAction === 'next-moves-month'){ if(typeof nextMovesMonth === 'function') nextMovesMonth(); }
  else if(appAction === 'set-move-dir'){ if(typeof setMoveDir === 'function') setMoveDir(appBtn.dataset.appValue); }
  else if(appAction === 'unlock-move-km-out'){ if(typeof unlockMoveKmOutField === 'function') unlockMoveKmOutField(); }
  else if(appAction === 'unlock-move-fuel-out'){ if(typeof unlockMoveFuelOutField === 'function') unlockMoveFuelOutField(e); }
  else if(appAction === 'save-move'){ if(typeof saveMove === 'function') saveMove(); }
  else if(appAction === 'save-gps-link-modal'){ if(typeof saveGpsLinkModal === 'function') saveGpsLinkModal(); }
  else if(appAction === 'save-vehicle-modal'){ if(typeof saveVehicleModal === 'function') saveVehicleModal(); }
  else if(appAction === 'save-rental-modal'){ if(typeof saveRentalModal === 'function') saveRentalModal(); }
  else if(appAction === 'save-km'){ if(typeof saveKm === 'function') saveKm(); }
  else if(appAction === 'save-payment-modal'){ if(typeof savePaymentModal === 'function') savePaymentModal(); }
  else if(appAction === 'save-note-only'){ if(typeof saveNoteOnly === 'function') saveNoteOnly(); }
  else if(appAction === 'save-client-modal'){ if(typeof saveClientModal === 'function') saveClientModal(); }
  else if(appAction === 'save-attachment-and-verify'){ if(typeof saveAttachmentAndVerify === 'function') saveAttachmentAndVerify(); }
  else if(appAction === 'delete-current-attachment'){ if(typeof deleteCurrentAttachmentFromModal === 'function') deleteCurrentAttachmentFromModal(); }
  else if(appAction === 'download-current-pdf'){ if(typeof downloadCurrentPdf === 'function') downloadCurrentPdf(); }
  else if(appAction === 'remove-contract-video'){ if(typeof removeContractVideo === 'function') removeContractVideo(); }
  else if(appAction === 'prompt-add-branch'){ if(typeof promptAddBranch === 'function') promptAddBranch(); }
  else if(appAction === 'show-blacklist-modal'){ if(typeof showBlacklistModal === 'function') showBlacklistModal(); }
  else if(appAction === 'select-car-type'){ if(typeof selectCarType === 'function') selectCarType(appBtn.dataset.appValue); }
  else if(appAction === 'apply-small'){ if(typeof applySmall === 'function') applySmall(appBtn.dataset.appValue); }
  else if(appAction === 'apply-4x4'){ if(typeof apply4x4 === 'function') apply4x4(appBtn.dataset.appValue); }
  else if(appAction === 'unlock-all-new-rental-fields'){ if(typeof unlockAllNewRentalFields === 'function') unlockAllNewRentalFields(); }
  else if(appAction === 'unlock-all-payment-fields'){ if(typeof unlockAllPaymentFields === 'function') unlockAllPaymentFields(); }
  else if(appAction === 'preview-bal-from-modal'){ if(typeof previewBalFromModal === 'function') previewBalFromModal(); }
  else if(appAction === 'add-payment-entry'){ if(typeof addPaymentEntry === 'function') addPaymentEntry(); }
  else if(appAction === 'clear-logs-with-password'){ if(typeof clearLogsWithPassword === 'function') clearLogsWithPassword(); }
  else if(appAction === 'save-user'){ if(typeof saveNewUser === 'function') saveNewUser(); }
  else if(appAction === 'delete-user'){ if(typeof deleteUserAccount === 'function') deleteUserAccount(appBtn.dataset.username); }
  else if(appAction === 'reset-user-password'){ if(typeof promptChangeUserPassword === 'function') promptChangeUserPassword(appBtn.dataset.username); }
  else if(appAction === 'secure-pw-cancel'){ if(typeof window.securePwCancel === 'function') window.securePwCancel(); }
  else if(appAction === 'secure-pw-submit'){ if(typeof window.securePwSubmit === 'function') window.securePwSubmit(); }
  else if(appAction === 'click-target'){ document.getElementById(appBtn.dataset.appTarget)?.click(); }
  else if(appAction === 'makh-reset-all'){ if(typeof window.makh_resetAll === 'function') window.makh_resetAll(); }
  else if(appAction === 'makh-preview'){ if(typeof window.makh_preview === 'function') window.makh_preview(); }
  else if(appAction === 'makh-select-all-matched'){ if(typeof window.makh_selectAllMatched === 'function') window.makh_selectAllMatched(); }
  else if(appAction === 'makh-clear-selection'){ if(typeof window.makh_clearSelection === 'function') window.makh_clearSelection(); }
  else if(appAction === 'makh-generate-word'){ if(typeof window.makh_generateWord === 'function') window.makh_generateWord(); }
  else if(appAction === 'makh-select-template'){ if(typeof window.makh_selectTemplate === 'function') window.makh_selectTemplate(appBtn.dataset.appValue); }
  else if(appAction === 'makh-switch-tab'){ if(typeof window.makhSwitchTab === 'function') window.makhSwitchTab(appBtn.dataset.appValue); }
  else if(appAction === 'makh-switch-category'){ if(typeof window.makh_switchCategory === 'function') window.makh_switchCategory(appBtn.dataset.appValue); }
  else if(appAction === 'shk-preview'){ if(typeof window.shk_preview === 'function') window.shk_preview(); }
  // ── Filtres à variable simple (pas de fonction dédiée existante avant) :
  // on reproduit ici le même style que les autres modules (déplacer la
  // classe "on"/"selected" + re-render). ──
  else if(appAction === 'set-client-filter'){
    let val = appBtn.dataset.appValue;
    if(typeof clientFilter !== 'undefined'){ clientFilter = val; }
    appBtn.parentElement?.querySelectorAll('.mod-pill').forEach(function(c){ c.classList.remove('on','active'); });
    appBtn.classList.add('on');
    if(typeof renderClients === 'function') renderClients();
  }
  else if(appAction === 'set-moves-filter'){
    let val = appBtn.dataset.appValue;
    if(typeof movesFilter !== 'undefined'){ movesFilter = val; }
    appBtn.parentElement?.querySelectorAll('.mod-pill').forEach(function(c){ c.classList.remove('on','active'); });
    appBtn.classList.add('on');
    if(typeof renderMoves === 'function') renderMoves();
  }
});

// ── showToast (orig. line 10749) ──
function showToast(msg){
  let t = document.getElementById('editNotif');
  if(!t){
    t = document.createElement('div');
    t.id = 'editNotif';
    t.style.position='fixed';
    t.style.bottom='20px';
    t.style.left='50%';
    t.style.transform='translateX(-50%)';
    t.style.background='#16a34a';
    t.style.color='white';
    t.style.padding='10px 18px';
    t.style.borderRadius='8px';
    t.style.zIndex='99999';
    document.body.appendChild(t);
  }

  t.innerText = msg;
  t.style.opacity = '1';

  setTimeout(()=>{
    t.style.opacity = '0';
  },2000);
}

// ── uploadProgressToast — barre de progression pour les uploads lourds ──
// Sans feedback visuel, un upload de pièce jointe/scan volumineux laisse
// l'écran figé ; l'utilisateur croit à un plantage et re-clique, ce qui
// déclenche un doublon. Appeler uploadProgressToast(pct) pendant l'envoi
// (pct 0-100), puis uploadProgressToast(null) pour la retirer une fois
// terminé (succès ou erreur).
function uploadProgressToast(pct){
  let t = document.getElementById('uploadProgressToast');
  if(pct === null || pct === undefined){
    if(t) t.remove();
    return;
  }
  if(!t){
    t = document.createElement('div');
    t.id = 'uploadProgressToast';
    t.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#1e293b;color:#f1f5f9;padding:10px 16px;border-radius:8px;z-index:99999;font-size:13px;font-weight:500;box-shadow:0 4px 12px rgba(0,0,0,.3);min-width:220px';
    t.innerHTML = '<div id="uploadProgressLabel" style="margin-bottom:6px">⬆️ Uploading… 0%</div><div style="background:rgba(255,255,255,.15);border-radius:4px;height:6px;overflow:hidden"><div id="uploadProgressBar" style="background:#38bdf8;height:100%;width:0%;transition:width .15s"></div></div>';
    document.body.appendChild(t);
  }
  let clamped = Math.max(0, Math.min(100, pct));
  let label = document.getElementById('uploadProgressLabel');
  let bar = document.getElementById('uploadProgressBar');
  if(label) label.textContent = '⬆️ Uploading… ' + clamped + '%';
  if(bar) bar.style.width = clamped + '%';
}
window.uploadProgressToast = uploadProgressToast;


document.addEventListener('DOMContentLoaded', function(){
  // ── i18n Étape 1 (2026-07) : applique la langue sauvegardée au menu
  // dès que possible, avant même que les données serveur n'arrivent —
  // évite un flash "menu en anglais" avant bascule en arabe. ──
  if(typeof applyI18n === 'function') applyI18n();

  // NOTE: sound-loop alarms (oil/doc re-trigger scheduler) were removed —
  // all alerts are now organized as static, categorized boxes on the
  // Dashboard only (Oil Change, Mulkiya & Ministry of Transport,
  // Customer Return Overdue, New Booking Requests). Nothing to schedule here.
  const exportBtn = document.getElementById('export-data-btn');
  if(exportBtn){
    exportBtn.onclick = exportData;
  }

  const saveBtn = document.getElementById('save-all-btn');
  if(saveBtn){
    // FIX (2026-08) : flushNoteAndSave n'existe pas dans ce fichier — c'est
    // saveAll() qui fait le travail (définie plus haut, exposée via
    // window.saveAll). On force silent=false pour qu'un clic manuel affiche
    // bien le toast "Saved" (sinon l'objet event passé en 1er arg rend
    // silent truthy et saveAll() traite ça comme un autosave silencieux).
    saveBtn.onclick = function(){ saveAll(false); };
  }
  // ── FIX (2026-07) : bouton grisé tant que le premier chargement
  // (/load) n'est pas terminé — empêche d'envoyer un DB encore vide
  // au serveur si on clique juste après la connexion. ──
  _setSaveButtonEnabled(window._dataLoaded === true);

  const undoBtn = document.getElementById('ctrl-undo-btn');
  if(undoBtn){
    undoBtn.onclick = undoChanges;
  }

});

// ── _setSaveButtonEnabled (FIX 2026-07) ──────────────────────────
// Grise/dégrise le bouton "Save Data" selon que les vraies données
// ont fini de charger (window._dataLoaded). Tant que c'est faux, le
// bouton reste visuellement désactivé avec une bulle d'aide expliquant
// pourquoi, au lieu de laisser l'utilisateur sauvegarder du vide.
function _setSaveButtonEnabled(enabled){
  const saveBtn = document.getElementById('save-all-btn');
  if(!saveBtn) return;
  saveBtn.disabled = !enabled;
  saveBtn.style.opacity = enabled ? '' : '0.5';
  saveBtn.style.cursor  = enabled ? '' : 'not-allowed';
  saveBtn.title = enabled ? '' : 'Chargement des données en cours — patiente quelques secondes avant de sauvegarder.';
}
window._setSaveButtonEnabled = _setSaveButtonEnabled;


// ── exportData (orig. line 10796) ──
function exportData(){
  try{
    const now = new Date();
    const pad = n => String(n).padStart(2,'0');
    const ts = now.getFullYear()+'-'+pad(now.getMonth()+1)+'-'+pad(now.getDate())+'_'+pad(now.getHours())+'-'+pad(now.getMinutes())+'-'+pad(now.getSeconds());
    const filename = 'fleetpro_backup_'+ts+'.json';
    const payload = JSON.stringify(DB, null, 2);
    const blob = new Blob([payload], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 1000);
    // Log the export
    if(typeof DB !== 'undefined' && DB.logs){
      DB.logs.unshift({
        type:'system',
        label:'Data Exported',
        details:['Full backup exported on '+now.toLocaleString()],
        ref:'—',
        ts: now.toISOString()
      });
      if(typeof updateLogBadge==='function') updateLogBadge();
      if(typeof renderLog==='function') renderLog();
    }
    showToast('✅ Export downloaded: '+filename);
  }catch(err){
    console.error('Export error:', err);
    alert(t(translate('rental.alertExportFailed'), err.message));
  }
}

window.exportData = exportData;
window.exportAllData = exportData;

// ── importAllData ─────────────────────────────────────────────
// ── importAllData (orig. line 10834) ──
function importAllData(event){
  const file = event.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = function(e){
    try{
      const d = JSON.parse(e.target.result);
      if(d.vehicles && d.locations){
        if(!confirm('Import this file? Current data will be replaced.')) return;
        if(d.vehicles && d.vehicles.length) DB.vehicles = d.vehicles;
        if(d.locations) DB.rentals = d.locations;
        if(d.payments) DB.payments = d.payments;
        if(d.logs) DB.logs = d.logs;
        DB.nextVId = d.nextVId || (Math.max(0,...DB.vehicles.map(v=>v.id))+1);
        DB.nextRId = d.nextRId || (Math.max(0,...DB.rentals.map(r=>r.id))+1);
        DB.nextPId = d.nextPId || (DB.payments && DB.payments.length ? Math.max(0,...DB.payments.map(p=>p.id))+1 : 1);
        if(typeof migratePaymentsFromRentals==='function') migratePaymentsFromRentals();
        if(typeof migrateRentals==='function') migrateRentals();
        if(typeof refreshAll==='function') refreshAll();
        if(typeof updateLogBadge==='function') updateLogBadge();
        logAction('system','Data Imported','Loaded '+DB.vehicles.length+' vehicles, '+DB.rentals.length+' rentals from file: '+file.name,'—');
        showToast('✅ Import successful: '+file.name);
      } else {
        alert(translate('rental.alertInvalidFile'));
      }
    }catch(err){
      alert(t(translate('rental.alertImportError'), err.message));
    }
    event.target.value = '';
  };
  reader.readAsText(file);
}
window.importAllData = importAllData;

// ── undoAction ────────────────────────────────────────────────
// ── undoAction (orig. line 10869) ──
function undoAction(){
  if(typeof undoChanges === 'function'){
    undoChanges();
  } else if(window.__UNDO_BACKUP__){
    try{
      const d = JSON.parse(window.__UNDO_BACKUP__);
      if(d.vehicles) DB.vehicles = d.vehicles;
      if(d.locations)  DB.rentals  = d.locations;
      if(d.payments) DB.payments = d.payments;
      if(d.logs)     DB.logs     = d.logs;
      if(typeof refreshAll==='function') refreshAll();
      showToast('↩️ Undo done');
    }catch(e){ alert(t(translate('rental.alertUndoFailed'), e.message)); }
  } else {
    showToast('⚠️ Nothing to cancel');
  }
}
window.undoAction = undoAction;
window.saveAll = saveAll;
window.undoChanges = undoChanges;

// ════════════════════════════════════════════════════════════════
// WATCHDOG SERVEUR — détection panne + overlay de blocage
// ════════════════════════════════════════════════════════════════
// Principe :
//   • Un ping /ping toutes les 10s (léger, pas de données métier).
//   • Si 2 pings consécutifs échouent (20s sans réponse) → le serveur
//     est considéré DOWN.
//   • Un overlay plein-écran rouge s'affiche instantanément sur TOUS
//     les postes connectés, bloquant toute saisie.
//   • Quand le serveur revient → l'overlay disparaît, un reload
//     automatique synchronise les données.
// ════════════════════════════════════════════════════════════════
(function initServerWatchdog(){
  if(!_SERVER_MODE) return; // mode fichier local → pas de watchdog

  const PING_INTERVAL  = 10 * 1000;  // ping toutes les 10 secondes
  const FAIL_THRESHOLD = 1;           // 1 echec → DOWN immediatement
  const OVERLAY_ID     = 'server-down-overlay';

  let _failCount   = 0;
  let _isDown      = false;
  let _wasDown     = false;

  // Creer l'overlay DOM (cache au depart)
  function _createOverlay(){
    if(document.getElementById(OVERLAY_ID)) return;
    const el = document.createElement('div');
    el.id = OVERLAY_ID;
    el.setAttribute('aria-live', 'assertive');
    el.style.cssText = 'display:none;position:fixed;inset:0;z-index:999999;background:rgba(10,0,0,.92);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:32px;text-align:center;font-family:Inter,system-ui,sans-serif;cursor:not-allowed;user-select:none;-webkit-user-select:none';
    el.innerHTML = '<div style="font-size:3rem" id="srv-pulse-icon">🔴</div>'
      + '<div style="font-size:1.35rem;font-weight:800;color:#fff;letter-spacing:-.3px;max-width:480px">⚠️ Server is down — Stop all data entry!</div>'
      + '<div style="font-size:.95rem;color:#fca5a5;max-width:420px;line-height:1.6">The City Rent server is not responding.<br><strong style="color:#fff">Do not save anything</strong> — data will NOT be saved.<br>Contact the administrator to restart <strong style="color:#fbbf24">LANCER.bat</strong>.</div>'
      + '<div id="srv-retry-msg" style="font-size:.78rem;color:#9ca3af;margin-top:4px">Checking connection…</div>'
      + '<div style="display:inline-block;background:rgba(239,68,68,.18);border:1px solid rgba(239,68,68,.4);border-radius:10px;padding:10px 20px"><span style="font-size:.82rem;color:#fca5a5;font-family:monospace" id="srv-down-since"></span></div>';
    if(!document.getElementById('srv-watchdog-style')){
      const st = document.createElement('style');
      st.id = 'srv-watchdog-style';
      st.textContent = '@keyframes srvPulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.3);opacity:.5}}'
        + '@keyframes srvFadeIn{from{opacity:0;transform:translateY(-14px)}to{opacity:1;transform:none}}';
      document.head.appendChild(st);
    }
    document.body.appendChild(el);
  }

  function _showOverlay(){
    const el = document.getElementById(OVERLAY_ID);
    if(!el) return;
    const since = document.getElementById('srv-down-since');
    if(since) since.textContent = 'Offline since ' + new Date().toLocaleTimeString('en-GB');
    const icon = document.getElementById('srv-pulse-icon');
    if(icon) icon.style.animation = 'srvPulse 1.2s ease-in-out infinite';
    el.style.display = 'flex';
    el.style.animation = 'srvFadeIn .35s ease';
    document.body.style.pointerEvents = 'none';
    el.style.pointerEvents = 'auto';
  }

  function _hideOverlay(){
    const el = document.getElementById(OVERLAY_ID);
    if(el) el.style.display = 'none';
    document.body.style.pointerEvents = '';
    setTimeout(function(){ window.location.reload(); }, 600);
  }

  function _setRetryMsg(txt){
    const el = document.getElementById('srv-retry-msg');
    if(el) el.textContent = txt;
  }

  function _doPing(){
    const opts = { method:'GET', cache:'no-store' };
    if(typeof AbortSignal !== 'undefined' && AbortSignal.timeout) opts.signal = AbortSignal.timeout(5000);
    return fetch('/ping', opts).then(function(r){ return r.ok; }).catch(function(){ return false; });
  }

  function _watchdogTick(){
    if(!window.AUTH || !window.AUTH.token) return;
    _doPing().then(function(ok){
      if(ok){
        if(_isDown){
          _isDown = false;
          _wasDown = true;
          window._serverDown = false;
          _failCount = 0;
          _hideOverlay();
        } else {
          _failCount = 0;
        }
      } else {
        _failCount++;
        if(!_isDown){
          if(_failCount >= FAIL_THRESHOLD){
            _isDown = true;
            window._serverDown = true;
            _createOverlay();
            _showOverlay();
            console.error('[Watchdog] Serveur DOWN apres ' + _failCount + ' pings rates');
          } else {
            _setSaveStatus('offline', 'server unreachable');
            console.warn('[Watchdog] Ping rate (' + _failCount + '/' + FAIL_THRESHOLD + ')');
          }
        } else {
          _setRetryMsg('Retrying in ' + Math.round(PING_INTERVAL/1000) + 's… (' + _failCount + ' failure' + (_failCount>1?'s':'') + ')');
        }
      }
    });
  }

  // DOMContentLoaded est déjà passé quand ce module est chargé dynamiquement.
  // On démarre directement sans attendre l'événement.
  _createOverlay();
  setInterval(_watchdogTick, PING_INTERVAL);
  // Premier ping après 8s — laisser le temps à l'auth de s'établir
  setTimeout(_watchdogTick, 8000);

  window._serverDown = false; // mis à true par le watchdog quand serveur KO
  window._serverWatchdog = { getState: function(){ return { isDown: _isDown, failCount: _failCount }; } };
})();


// ==== AUDIO PATCH ====


// ==== FILTER PATCH ====
// ── initAudioSafe (orig. line 10951) ──
function initAudioSafe(){

    if(window.__audioInitialized) return;

    try{

        window.audioCtx = window.audioCtx ||
            new (window.AudioContext || window.webkitAudioContext)();

        if(window.audioCtx.state === 'suspended'){
            window.audioCtx.resume();
        }

        window.__audioInitialized = true;

    }catch(e){
        console.log('Audio disabled safely');
    }
}

document.addEventListener('click', initAudioSafe, {once:true});

// ── Dashboard alert buttons — double-clic ferme le panneau (2026-08) ──
// Un double-clic sur un des 4 boutons d'alerte (Oil/Mulkiya/Overdue/Booking)
// referme le panneau de détail partagé, comme demandé par Hicham.
// (Ancien listener dblclick supprime — le simple clic sur un bouton actif
// ferme desormais le panneau directement, voir toggleDashAlertDetail)


// ==== SAFE BAL PATCH ====
// ── securePrompt (orig. line 12531) ──
/* ===== SECURE PASSWORD MODAL LOGIC ===== */
(function(){
  let _resolve = null;

  window.securePrompt = function(title){
    return new Promise(function(resolve){
      _resolve = resolve;
      document.getElementById('secure-pw-title').textContent = title || '🔒 Password required';
      document.getElementById('secure-pw-input').value = '';
      document.getElementById('secure-pw-error').textContent = '';
      document.getElementById('secure-pw-overlay').classList.add('active');
      setTimeout(function(){ document.getElementById('secure-pw-input').focus(); }, 80);
    });
  };

// ── securePwSubmit (orig. line 12546) ──
  window.securePwSubmit = function(){
    let val = document.getElementById('secure-pw-input').value;
    document.getElementById('secure-pw-overlay').classList.remove('active');
    if(_resolve){ _resolve(val); _resolve = null; }
  };

// ── securePwCancel (orig. line 12552) ──
  window.securePwCancel = function(){
    document.getElementById('secure-pw-overlay').classList.remove('active');
    if(_resolve){ _resolve(null); _resolve = null; }
  };

  // Allow Enter key to submit
  document.getElementById('secure-pw-input').addEventListener('keydown', function(e){
    if(e.key === 'Enter'){ e.preventDefault(); window.securePwSubmit(); }
    if(e.key === 'Escape'){ e.preventDefault(); window.securePwCancel(); }
  });
})();

// ══════════════════════════════════════════════════════════════
// ── Template selection ──────────────────────────────────────────────────
let makh_selectedTemplate = 'local-closed';
let makh_modelHeight = '5.5cm'; // ← Model height for printing on header A4 (adjustable: '5.5cm', '6cm', '7cm', etc.)
let makh_pageLayout = 'portrait'; // ← Orientation: 'portrait' or 'landscape'

