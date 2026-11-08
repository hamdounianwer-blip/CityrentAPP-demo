// ═══════════════════════════════════════════════════════════════════
// FLEET CALENDAR (Gantt) — module-fleet-calendar.js (2026-09)
//
// Vue calendrier de toute la flotte (une ligne = un véhicule), contrats
// positionnés dans le TEMPS. Complète le GPS Map (qui positionne dans
// l'ESPACE les seuls véhicules avec un device MadarTech actif) : deux
// angles différents, pas redondants.
//
// Ce que ça apporte que rien d'autre dans l'app ne fait aujourd'hui :
//  1) Détection de double-booking en un coup d'œil : 2 contrats sur la
//     même ligne le même jour → case "conflit" distincte (rouge foncé
//     rayée + ⚠️), au lieu de deux lignes/cartes séparées comme dans
//     Daily Rentals où le chevauchement passe inaperçu.
//  2) % Fleet Utilization sur la période affichée — n'existe ni dans
//     Dashboard ni dans Revenue Stats.
//
// Choix de rendu : la flotte réelle fait ~100 véhicules (pas 7 comme
// dans une maquette). Plutôt que des barres continues qui s'écrasent en
// vue Mois (100 lignes × 31 colonnes), CHAQUE JOUR est une case colorée
// ("état du jour") — un seul moteur de rendu pour Semaine ET Mois, seule
// la largeur/le nombre de colonnes change. Le double-booking reste
// détectable (case "conflit" plutôt que barres empilées), et un contrat
// encore ouvert (pas de dateIn) n'est jamais dessiné au-delà
// d'aujourd'hui — on ne prédit pas une date de retour qu'on ne connaît
// pas ; une flèche ▶ indique juste qu'il continue.
//
// Source des contrats : DB.rentals (filtré par branche au /load) COMPLÉTÉ par
// GET /api/fleet-occupancy (server.js), qui renvoie l'occupation de TOUTE la
// flotte, toutes branches confondues. Un véhicule n'appartient pas à une
// branche : il est occupé par les contrats trouvés (Barka ET Moebela) + les
// mouvements internes. Si la route est indisponible, le calendrier retombe sur
// les seuls contrats de la session (comportement d'avant).
//
// ⚠️ Note (2026-09) : DB.kmHistory a été essayé ici pour couvrir le cas
// cross-branch (comme _availIsOut()/getRealFleetAvailability()/
// getLatestKmFromRentals()), puis abandonné — en usage réel, kmHistory a
// produit des libellés "#undefined" (le champ .contract/.id n'y est
// visiblement pas garanti comme sur un vrai objet DB.rentals) et un
// nombre de "Double-booked" totalement irréaliste (chevauchements
// fantômes). C'est visiblement une projection minimale pensée pour le
// calcul de kilométrage (kmIn/kmOut/dateIn/dateOut), pas un objet contrat
// complet — impropre à l'affichage riche qu'il faut ici (contrat, client,
// date de retour prévue). Le vrai cross-branch pour ce module demanderait
// un endpoint dédié côté serveur (sur le modèle de /api/client-summaries
// dans module-clients.js), pas la réutilisation de kmHistory.
// ═══════════════════════════════════════════════════════════════════

// ── État du module (persiste tant que l'onglet reste ouvert) ──
window._fleetCalState = window._fleetCalState || {
  view: 'week',        // 'week' | 'month'
  anchor: new Date(),  // une date quelconque dans la période affichée
  search: '',
  statusFilter: 'all', // all | rented | overdue | due | available | conflict
  branchFilter: 'all'
};

// ── i18n défensif : utilise translate() si la clé fleetcal.* existe déjà
// dans i18n.js, sinon retombe sur le texte EN fourni. Le module reste
// donc pleinement utilisable avant même l'ajout des clés EN/AR. ──
function _fcalT(key, fallback){
  if(typeof translate === 'function'){
    let s = translate(key);
    if(s && s !== key) return s;
  }
  return fallback;
}

// ══════════════════ Helpers dates (jour civil local, sans heure) ══════════════════
function _fcalISO(d){
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function _fcalParseDateOnly(s){
  if(!s) return null;
  let datePart = String(s).split(/[ T]/)[0];
  let m = datePart.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(!m) return null;
  return new Date(Number(m[1]), Number(m[2])-1, Number(m[3]));
}
function _fcalAddDays(d, n){ let dt = new Date(d); dt.setDate(dt.getDate()+n); return dt; }
function _fcalStartOfWeek(d){ // semaine commence le lundi
  let dt = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  let day = dt.getDay(); // 0=dim..6=sam
  let diff = (day === 0 ? -6 : 1 - day);
  return _fcalAddDays(dt, diff);
}
function _fcalGetRange(){
  let st = window._fleetCalState;
  if(st.view === 'month'){
    let y = st.anchor.getFullYear(), m = st.anchor.getMonth();
    let first = new Date(y, m, 1);
    let nbJours = new Date(y, m+1, 0).getDate();
    let days = [];
    for(let i=0;i<nbJours;i++) days.push(_fcalAddDays(first, i));
    return { days: days, startISO: _fcalISO(days[0]), endISO: _fcalISO(days[days.length-1]) };
  }
  let start = _fcalStartOfWeek(st.anchor);
  let days = [];
  for(let i=0;i<7;i++) days.push(_fcalAddDays(start, i));
  return { days: days, startISO: _fcalISO(days[0]), endISO: _fcalISO(days[6]) };
}

// ══════════════════ Navigation / filtres (appelés depuis core.js via data-app-action, même pattern que gps-set-view) ══════════════════
function fcalSetView(v){
  if(v !== 'week' && v !== 'month') return;
  window._fleetCalState.view = v;
  let wb = document.getElementById('fcal-view-week-btn'), mb = document.getElementById('fcal-view-month-btn');
  if(wb) wb.classList.toggle('active-view', v==='week');
  if(mb) mb.classList.toggle('active-view', v==='month');
  renderFleetCalendar();
}
window.fcalSetView = fcalSetView;

function fcalNav(dir){
  let st = window._fleetCalState;
  if(dir === 'today'){ st.anchor = new Date(); }
  else {
    let delta = dir === 'next' ? 1 : -1;
    st.anchor = st.view === 'month'
      ? new Date(st.anchor.getFullYear(), st.anchor.getMonth()+delta, 1)
      : _fcalAddDays(st.anchor, 7*delta);
  }
  renderFleetCalendar();
}
window.fcalNav = fcalNav;

function fcalSetStatusFilter(v){
  window._fleetCalState.statusFilter = v;
  document.querySelectorAll('#fcal-filter-bar [data-fcal-status-chip]').forEach(function(el){
    el.classList.toggle('active', el.dataset.fcalStatusChip === v);
  });
  renderFleetCalendar();
}
window.fcalSetStatusFilter = fcalSetStatusFilter;

function fcalSetBranchFilter(v){
  window._fleetCalState.branchFilter = v;
  document.querySelectorAll('#fcal-branch-chips [data-fcal-branch-chip]').forEach(function(el){
    el.classList.toggle('active', el.dataset.fcalBranchChip === v);
  });
  renderFleetCalendar();
}
window.fcalSetBranchFilter = fcalSetBranchFilter;

let _fcalSearchTimer = null;
function fcalDebouncedSearch(v){
  clearTimeout(_fcalSearchTimer);
  _fcalSearchTimer = setTimeout(function(){
    window._fleetCalState.search = String(v||'').trim().toLowerCase();
    renderFleetCalendar();
  }, 200);
}
window.fcalDebouncedSearch = fcalDebouncedSearch;

// ── "Jump to month" : réutilise le calendrier universel de
// module-month-picker.js (openMonthCalendar/_calPick) plutôt que d'écrire
// un 2e widget de sélection de date. _calPick() écrit la valeur ('YYYY-MM')
// dans #fcal-month-input puis déclenche un 'change' — on l'écoute ici pour
// basculer la vue calendrier sur ce mois précis. ──
document.addEventListener('change', function(e){
  if(e.target && e.target.id === 'fcal-month-input'){
    let parts = String(e.target.value||'').split('-');
    if(parts.length === 2){
      window._fleetCalState.anchor = new Date(Number(parts[0]), Number(parts[1])-1, 1);
      fcalSetView('month'); // fcalSetView() se charge du re-render + du toggle actif Week/Month
    }
  }
});

// ══════════════════ Contrats de TOUTES les branches ══════════════════
// /load ne renvoie à une session Barka/Moebela que les contrats de sa branche :
// une voiture louée par l'autre agence apparaissait libre. On complète avec
// GET /api/fleet-occupancy (contrat, dates, branche — aucune donnée client/prix).
// Les contrats déjà présents dans DB.rentals (objets complets, à jour) restent
// prioritaires ; ceux de l'autre branche sont marqués _remote:true (barre
// visible mais non cliquable : le contrat n'est pas chargé dans cette session).
window._fleetCalRemote = window._fleetCalRemote || { at: 0, rentals: [], loading: false };

function _fcalAllRentals(){
  let own = DB.rentals || [];
  let R = window._fleetCalRemote;
  if(!R.rentals.length) return own;
  let seen = new Set();
  own.forEach(function(r){ seen.add(String(r.id)); });
  let extra = [];
  R.rentals.forEach(function(r){
    if(!seen.has(String(r.id))) extra.push(Object.assign({ _remote: true }, r));
  });
  return own.concat(extra);
}

function _fcalLoadRemote(){
  let R = window._fleetCalRemote;
  if(R.loading || (Date.now() - R.at) < 60000) return; // 1 appel max par minute
  if(typeof authHeaders !== 'function') return;
  R.loading = true;
  let opts = { headers: authHeaders({}) };
  if(typeof AbortSignal !== 'undefined' && AbortSignal.timeout) opts.signal = AbortSignal.timeout(15000);
  let changed = false;
  fetch('/api/fleet-occupancy', opts)
    .then(function(r){ if(!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function(d){
      if(d && d.ok && Array.isArray(d.rentals)){ R.rentals = d.rentals; changed = true; }
    })
    .catch(function(e){
      console.warn('[fleet-calendar] /api/fleet-occupancy indisponible — contrats de la session uniquement', e);
    })
    .then(function(){
      R.loading = false;
      R.at = Date.now(); // pas de nouvelle tentative en boucle, même en cas d'échec
      if(changed) renderFleetCalendar();
    });
}

// ══════════════════ Index véhicule → contrats ══════════════════
// Même fallback que le reste de l'app (r.vehicleId si présent et valide,
// sinon rapprochement par plaque normalisée) — voir dash-out-body /
// getVehicleNameByPlate dans module-fleet-database.js. Construit une
// seule fois par render, pas par cellule.
function _fcalBuildRentalIndex(){
  let plateIndex = new Map();
  (DB.vehicles||[]).forEach(function(v){
    if(v.plate) plateIndex.set(_normPlateForMatch(v.plate), v.id);
  });
  let byVeh = new Map();
  // NB : DB.rentals + /api/fleet-occupancy (voir _fcalAllRentals) — pas
  // DB.kmHistory (voir note en tête de fichier : projection minimale, sans
  // .contract/.id/.expectedReturn ni flag d'annulation).
  _fcalAllRentals().forEach(function(r){
    if(r._cancelled) return; // contrat annulé = n'occupe pas réellement le véhicule (même exclusion que Daily Rentals/Internal Movements)
    let vid = r.vehicleId;
    let vidValid = vid != null && (DB.vehicles||[]).some(function(v){ return v.id === vid; });
    if(!vidValid){
      let pk = _normPlateForMatch(r._plate || r.plate || '');
      vid = pk ? plateIndex.get(pk) : undefined;
    }
    if(vid == null) return;
    let startD = _fcalParseDateOnly(r.dateOut);
    if(!startD) return;
    let endD = r.dateIn ? _fcalParseDateOnly(r.dateIn) : null;
    let entry = {
      rental: r,
      startISO: _fcalISO(startD),
      endISO: endD ? _fcalISO(endD) : null,
      ongoing: !endD
    };
    if(!byVeh.has(vid)) byVeh.set(vid, []);
    byVeh.get(vid).push(entry);
  });
  return byVeh;
}

// Index véhicule → mouvements internes (atelier, lavage, usage perso...).
// Ajouté après lecture de module-internal-movements.js / module-available-
// vehicles.js : un véhicule "en mouvement" (DB.moves, sans dateIn) est
// AUSSI indisponible à la location — exactement le même check que
// _availIsOut() dans Available Vehicles. Sans ça, une voiture au garage
// apparaissait à tort comme "Available" dans le calendrier.
// Pas de vehicleId fiable sur DB.moves (champ jamais renseigné à la
// création, voir module-internal-movements.js) → rapprochement par plaque
// normalisée uniquement, comme _availIsOut()/renderMoves().
function _fcalBuildMoveIndex(){
  let plateIndex = new Map();
  (DB.vehicles||[]).forEach(function(v){
    if(v.plate) plateIndex.set(_normPlateForMatch(v.plate), v.id);
  });
  let byVeh = new Map();
  (DB.moves||[]).forEach(function(m){
    let vid = m.vehicleId != null && (DB.vehicles||[]).some(function(v){ return v.id === m.vehicleId; })
      ? m.vehicleId
      : plateIndex.get(_normPlateForMatch(m.plate || ''));
    if(vid == null) return;
    let startD = _fcalParseDateOnly(m.dateOut);
    if(!startD) return;
    let endD = m.dateIn ? _fcalParseDateOnly(m.dateIn) : null;
    let entry = {
      move: m,
      startISO: _fcalISO(startD),
      endISO: endD ? _fcalISO(endD) : null,
      ongoing: !endD
    };
    if(!byVeh.has(vid)) byVeh.set(vid, []);
    byVeh.get(vid).push(entry);
  });
  return byVeh;
}

// Statut "maintenant" d'un véhicule (indépendant de la période affichée) —
// alimente les puces de filtre Overdue / Due today / Rented / Moved /
// Available. Priorité : un retour en retard prime sur tout le reste.
function _fcalCurrentStatus(entries, moveEntries, todayISO){
  let covering = (entries||[]).filter(function(e){
    return e.startISO <= todayISO && (e.ongoing || e.endISO >= todayISO);
  });
  if(covering.length){
    let anyOverdue = covering.some(function(e){
      if(!e.ongoing || !e.rental.expectedReturn) return false;
      let exp = _fcalParseDateOnly(e.rental.expectedReturn);
      return exp && _fcalISO(exp) < todayISO;
    });
    if(anyOverdue) return 'overdue';
    let anyDue = covering.some(function(e){
      if(!e.ongoing || !e.rental.expectedReturn) return false;
      let exp = _fcalParseDateOnly(e.rental.expectedReturn);
      return exp && _fcalISO(exp) === todayISO;
    });
    if(anyDue) return 'due';
    return 'rented';
  }
  let coveringMoves = (moveEntries||[]).filter(function(e){
    return e.startISO <= todayISO && (e.ongoing || e.endISO >= todayISO);
  });
  if(coveringMoves.length) return 'moved';
  return 'available';
}

// Couverture d'un jour donné par un contrat — un contrat "ongoing" (pas
// de dateIn) est borné à aujourd'hui : on ne dessine jamais un retour
// qu'on ne connaît pas.
function _fcalEntryCoversDay(e, dayISO, todayISO){
  if(dayISO < e.startISO) return false;
  if(e.ongoing){
    let cap = e.startISO > todayISO ? e.startISO : todayISO;
    return dayISO <= cap;
  }
  return dayISO <= e.endISO;
}

// ── Chevauchement RÉEL (heure incluse) ──
// _fcalEntryCoversDay() raisonne en jours civils : un retour à 17:10 suivi
// d'une sortie à 23:50 le même jour "couvrent" tous deux ce jour-là et
// ressortaient à tort en Double-booked (simple relais). Un vrai conflit =
// les intervalles [dateOut, dateIn) se recouvrent vraiment. Contrat ou
// mouvement encore ouvert (pas de dateIn) = occupé jusqu'à maintenant.
// Date sans heure : début = 00:00 pour dateOut, fin = 23:59 pour dateIn.
function _fcalParseDT(s, endOfDay){
  let m = String(s||'').match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if(!m) return null;
  let hasTime = m[4] != null;
  return new Date(Number(m[1]), Number(m[2])-1, Number(m[3]),
    hasTime ? Number(m[4]) : (endOfDay ? 23 : 0),
    hasTime ? Number(m[5]) : (endOfDay ? 59 : 0)).getTime();
}
function _fcalInterval(e, nowMs){
  let raw = e.rental || e.move;
  let s = _fcalParseDT(raw.dateOut, false);
  if(s == null) s = 0;
  let en = e.ongoing ? Math.max(nowMs, s) : _fcalParseDT(raw.dateIn, true);
  if(en == null) en = s;
  return { s: s, e: Math.max(en, s) }; // Date In < Date Out (faute de saisie) => durée nulle, pas d'intervalle négatif
}
function _fcalTrulyOverlap(a, b, nowMs){
  let x = _fcalInterval(a, nowMs), y = _fcalInterval(b, nowMs);
  return x.s < y.e && y.s < x.e;
}

// Occupation d'un jour pour un véhicule : renvoie les contrats/mouvements à
// dessiner + si c'est un vrai conflit. Jour "relais" (2 occupations ce jour
// mais sans recouvrement horaire) => on dessine celle qui continue (la
// dernière sortie) au lieu d'un faux Conflict.
function _fcalDayState(d, dISO, todayISO, nowMs){
  let cr = d.relevant.filter(function(e){ return _fcalEntryCoversDay(e, dISO, todayISO); });
  let cm = d.relevantMoves.filter(function(e){ return _fcalEntryCoversDay(e, dISO, todayISO); });
  let all = cr.concat(cm);
  if(all.length < 2) return { rentals: cr, moves: cm, conflict: false };
  let clash = all.filter(function(a){
    return all.some(function(b){ return b !== a && _fcalTrulyOverlap(a, b, nowMs); });
  });
  if(clash.length){
    return {
      rentals: clash.filter(function(e){ return !!e.rental; }),
      moves: clash.filter(function(e){ return !!e.move; }),
      conflict: true
    };
  }
  let last = all.reduce(function(best, e){
    return _fcalInterval(e, nowMs).s > _fcalInterval(best, nowMs).s ? e : best;
  });
  return { rentals: last.rental ? [last] : [], moves: last.move ? [last] : [], conflict: false };
}

// ══════════════════ Segments (barres continues) ══════════════════
// Au lieu de colorer case par jour, on regroupe les jours consécutifs
// occupés par le MÊME contrat/mouvement (ou le même conflit) en un seul
// segment {start, end}. C'est ce segment qui devient une barre arrondie
// continue sur la grille — exactement le rendu Gantt attendu (cf. photo
// de référence), et ça règle le "tout se chevauche" : une seule forme
// par contrat au lieu d'une mosaïque de cases individuelles.
function _fcalBuildRowSegments(d, days, todayISO){
  let segments = [];
  let cur = null;
  let nowMs = Date.now();
  days.forEach(function(day, i){
    let dISO = _fcalISO(day);
    let ds = _fcalDayState(d, dISO, todayISO, nowMs);
    let coveringRentals = ds.rentals, coveringMoves = ds.moves;
    let key = null, payload = null;
    if(ds.conflict){
      key = 'conflict';
      payload = { kind:'conflict', rentals: coveringRentals, moves: coveringMoves };
    } else if(coveringMoves.length){
      key = 'move-' + coveringMoves[0].move.id;
      payload = { kind:'move', entry: coveringMoves[0] };
    } else if(coveringRentals.length){
      key = 'rental-' + coveringRentals[0].rental.id;
      payload = { kind:'rental', entry: coveringRentals[0] };
    }
    if(cur && cur.key === key && key !== null){
      cur.end = i;
    } else {
      if(cur) segments.push(cur);
      cur = (key === null) ? null : { key: key, start: i, end: i, payload: payload };
    }
  });
  if(cur) segments.push(cur);
  return segments;
}

// Statut visuel d'un contrat en cours (indépendant du jour affiché — un
// contrat garde le même statut sur toute la durée du segment).
function _fcalRentalStatus(e, todayISO){
  let r = e.rental;
  if(!e.ongoing) return 'closed';
  let exp = r.expectedReturn ? _fcalParseDateOnly(r.expectedReturn) : null;
  let expISO = exp ? _fcalISO(exp) : null;
  if(expISO && expISO < todayISO) return 'overdue';
  if(expISO && expISO === todayISO) return 'due';
  return 'active';
}

const FCAL_COLORS = { active:'#16a34a', due:'#f59e0b', overdue:'#ef4444', closed:'#94a3b8', moved:'#6366f1' };

// ══════════════════ Rendu principal ══════════════════
function renderFleetCalendar(){
  ensurePageLoaded('fleet-calendar');
  let wrap = document.getElementById('fcal-grid-wrap');
  if(!wrap) return; // template pas encore injecté (page jamais visitée)
  _fcalLoadRemote(); // asynchrone : le rendu ci-dessous part tout de suite, puis se rafraîchit quand les autres branches arrivent

  let st = window._fleetCalState;
  let range = _fcalGetRange();
  let days = range.days;
  let todayISO = _fcalISO(new Date());
  let rentalsByVeh = _fcalBuildRentalIndex();
  let movesByVeh = _fcalBuildMoveIndex();

  // ── Puces de branche = branche du CONTRAT (pas du véhicule), comme Daily Rentals.
  // "SHARED" n'est jamais la branche d'un contrat (réservé aux véhicules/bookings) → pas de puce. ──
  let branchBar = document.getElementById('fcal-branch-chips');
  if(branchBar){
    let branches = (DB.branches || []).filter(function(b){ return String(b).toUpperCase() !== 'SHARED'; });
    if(branches.length > 1){
      let chips = ['<button data-app-action="fcal-set-branch-filter" data-app-value="all" class="mod-pill' + (st.branchFilter==='all'?' active':'') + '" data-fcal-branch-chip="all">' + escapeHtml(_fcalT('fleetcal.allBranches','All branches')) + '</button>'];
      branches.forEach(function(b){
        chips.push('<button data-app-action="fcal-set-branch-filter" data-app-value="' + escapeHtml(b) + '" class="mod-pill' + (st.branchFilter===b?' active':'') + '" data-fcal-branch-chip="' + escapeHtml(b) + '">' + escapeHtml(b) + '</button>');
      });
      branchBar.innerHTML = chips.join('');
      branchBar.style.display = '';
    } else {
      branchBar.innerHTML = '';
      branchBar.style.display = 'none';
    }
  }

  // ── Liste des véhicules (toute la flotte, quelle que soit la branche du véhicule) + recherche ──
  let searchLc = st.search;
  let vehicles = (DB.vehicles||[]).filter(function(v){
    if(searchLc && !((String(v.name||'')+' '+String(v.plate||'')).toLowerCase().includes(searchLc))) return false;
    return true;
  });

  // Statut courant + contrats pertinents à la période affichée, calculés
  // une fois par véhicule (évite de re-scanner tout l'historique par jour).
  let vehData = vehicles.map(function(v){
    let entries = rentalsByVeh.get(v.id) || [];
    let moveEntries = movesByVeh.get(v.id) || [];
    let relevant = entries.filter(function(e){
      return e.startISO <= range.endISO && (e.ongoing || e.endISO >= range.startISO);
    });
    let relevantMoves = moveEntries.filter(function(e){
      return e.startISO <= range.endISO && (e.ongoing || e.endISO >= range.startISO);
    });
    // Conflit = 2+ occupations (contrat et/ou mouvement) le même jour sur le
    // même véhicule — en théorie déjà bloqué à la saisie (moves.js refuse un
    // mouvement sur une voiture en contrat ouvert et vice-versa), mais une
    // date corrigée à la main après coup peut encore créer un chevauchement.
    // Vrai chevauchement horaire uniquement (un relais le même jour n'en est pas un).
    let nowMs = Date.now();
    let hasConflict = days.some(function(d){
      return _fcalDayState({ relevant: relevant, relevantMoves: relevantMoves }, _fcalISO(d), todayISO, nowMs).conflict;
    });
    return {
      v: v, entries: entries, relevant: relevant, moveEntries: moveEntries, relevantMoves: relevantMoves,
      status: _fcalCurrentStatus(entries, moveEntries, todayISO), hasConflict: hasConflict
    };
  });

  // ── Filtre de branche = branche des CONTRATS ("branch du contrat, pas du véhicule",
  // comme Daily Rentals). On garde les véhicules qui ont au moins un contrat de cette
  // branche sur la période affichée ; leur ligne montre TOUTES les occupations (l'autre
  // branche incluse), sinon la voiture semblerait libre alors qu'elle est sortie. ──
  if(st.branchFilter !== 'all'){
    let bf = String(st.branchFilter).toUpperCase();
    vehData = vehData.filter(function(d){
      return d.relevant.some(function(e){ return String(e.rental.branch||'').toUpperCase() === bf; });
    });
  }

  // ── Compteurs des puces de statut, sur la flotte filtrée (branche +
  // recherche) mais AVANT le filtre de statut lui-même — sinon les
  // compteurs des autres puces retomberaient à 0 dès qu'on en sélectionne une ──
  let counts = { all: vehData.length, rented: 0, overdue: 0, due: 0, moved: 0, available: 0, conflict: 0 };
  vehData.forEach(function(d){
    if(d.status === 'rented' || d.status === 'overdue' || d.status === 'due') counts.rented++;
    if(d.status === 'overdue') counts.overdue++;
    if(d.status === 'due') counts.due++;
    if(d.status === 'moved') counts.moved++;
    if(d.status === 'available') counts.available++;
    if(d.hasConflict) counts.conflict++;
  });
  ['all','rented','overdue','due','moved','available','conflict'].forEach(function(k){
    let el = document.getElementById('fcal-count-' + k);
    if(el) el.textContent = counts[k];
  });

  // ── Application du filtre de statut sélectionné ──
  if(st.statusFilter !== 'all'){
    vehData = vehData.filter(function(d){
      if(st.statusFilter === 'conflict') return d.hasConflict;
      if(st.statusFilter === 'rented') return d.status === 'rented' || d.status === 'overdue' || d.status === 'due';
      return d.status === st.statusFilter;
    });
  }

  // ── KPI % Fleet Utilization sur la période affichée, sur la liste déjà
  // filtrée (s'adapte à la branche/recherche/statut en cours) ──
  let rentedSlots = 0;
  vehData.forEach(function(d){
    days.forEach(function(day){
      let dISO = _fcalISO(day);
      if(d.relevant.some(function(e){ return _fcalEntryCoversDay(e, dISO, todayISO); })) rentedSlots++;
    });
  });
  let totalSlots = vehData.length * days.length;
  let utilPct = totalSlots ? Math.round(rentedSlots / totalSlots * 100) : 0;
  let utilBadge = document.getElementById('fcal-util-badge');
  if(utilBadge) utilBadge.textContent = utilPct + '% ' + _fcalT('fleetcal.utilization','utilization');
  let liveCount = document.getElementById('fcal-live-count');
  if(liveCount) liveCount.textContent = vehData.length + ' ' + _fcalT('fleetcal.vehicles','vehicles');

  // ── Libellé de la période ──
  let rangeLabel = document.getElementById('fcal-range-label');
  if(rangeLabel){
    if(st.view === 'month'){
      rangeLabel.textContent = days[0].toLocaleDateString('en-GB', {month:'long', year:'numeric'});
    } else {
      let f = days[0], l = days[6];
      let sameMonth = f.getMonth() === l.getMonth();
      let opts1 = sameMonth ? {day:'numeric'} : {day:'numeric', month:'short'};
      rangeLabel.textContent = f.toLocaleDateString('en-GB', opts1) + ' \u2013 ' + l.toLocaleDateString('en-GB', {day:'numeric', month:'short', year:'numeric'});
    }
  }

  // ── Grille (CSS Grid : 1 colonne étiquette + N colonnes jour) ──
  // Rendu en BARRES CONTINUES (une par contrat/mouvement/conflit) plutôt
  // qu'en cases indépendantes par jour : chaque segment de _fcalBuildRowSegments
  // devient un seul <div> positionné explicitement sur les lignes de grille
  // qu'il couvre (grid-column: start / end), superposé aux cases de fond
  // (grid-row:1 explicite sur les deux). Rendu identique à un vrai Gantt,
  // et ça règle le chevauchement visuel : un contrat = une forme, pas une
  // mosaïque de cases.
  let colWidth = st.view === 'month' ? '28px' : '108px';
  let labelWidth = 230;
  let gridTemplate = labelWidth + 'px repeat(' + days.length + ', minmax(' + colWidth + ',1fr))';
  let rowHeight = st.view === 'month' ? 26 : 40;

  let headerCells = days.map(function(d){
    let dISO = _fcalISO(d);
    let isToday = dISO === todayISO;
    let isWeekend = d.getDay() === 5 || d.getDay() === 6; // vendredi/samedi = weekend Oman
    let label = st.view === 'month'
      ? String(d.getDate())
      : d.toLocaleDateString('en-GB', {weekday:'short'}) + '<br>' + d.getDate();
    return '<div data-fcal-daycol="' + dISO + '" style="text-align:center;padding:8px 2px;font-size:' + (st.view==='month'?'.68rem':'.72rem') + ';font-weight:700;color:' + (isToday?'#7c3aed':'var(--muted)') + ';background:' + (isToday?'rgba(124,58,237,.08)':(isWeekend?'rgba(100,116,139,.06)':'transparent')) + '">' + label + '</div>';
  }).join('');

  function fmtRange(e, isMove){
    let out = isMove ? e.move.dateOut : e.rental.dateOut;
    let inD = isMove ? e.move.dateIn : e.rental.dateIn;
    return fmtDate(out).replace(/&nbsp;/g,' ') + ' \u2192 ' + (inD ? fmtDate(inD).replace(/&nbsp;/g,' ') : _fcalT('fleetcal.ongoing','ongoing'));
  }

  let rowsHtml = vehData.map(function(d){
    let v = d.v;
    let dotColor = { available:'#94a3b8', rented:'#2563eb', due:'#eab308', overdue:'#ef4444', moved:'#6366f1' }[d.status] || '#94a3b8';
    let labelCell = '<div style="grid-column:1;grid-row:1;position:sticky;left:0;background:var(--card);z-index:2;display:flex;align-items:center;gap:8px;padding:6px 10px;border-right:1px solid var(--border)">' +
      '<span style="width:8px;height:8px;border-radius:50%;flex-shrink:0;background:' + dotColor + (d.status==='overdue'?';animation:fcal-overdue-blink 1.1s ease-in-out infinite':'') + '"></span>' +
      '<div style="min-width:0">' +
        '<div style="font-size:.82rem;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + escapeHtml(v.name||'\u2014') + '</div>' +
        '<div style="font-size:.68rem;color:var(--muted);font-family:\'IBM Plex Mono\',monospace">' + escapeHtml(v.plate||'\u2014') + (d.hasConflict?' <span title="' + escapeHtml(_fcalT('fleetcal.conflictTitle','Overlapping contracts')) + '">\u26a0\ufe0f</span>':'') + '</div>' +
      '</div>' +
    '</div>';

    // ── Cases de fond (une par jour, toujours présentes pour les bordures / weekend) ──
    let bgCells = days.map(function(day, i){
      let isWeekend = day.getDay() === 5 || day.getDay() === 6;
      let dISO = _fcalISO(day);
      let baseBg = dISO === todayISO ? 'rgba(124,58,237,.05)' : (isWeekend ? 'rgba(100,116,139,.05)' : 'transparent');
      return '<div style="grid-column:' + (i+2) + ';grid-row:1;background:' + baseBg + ';border-right:1px solid rgba(100,116,139,.08)"></div>';
    }).join('');

    // ── Barres continues (une par segment) ──
    let segments = _fcalBuildRowSegments(d, days, todayISO);
    let barsHtml = segments.map(function(seg){
      let colStart = seg.start + 2, colEnd = seg.end + 3;
      let span = seg.end - seg.start + 1;
      let showLabel = st.view === 'week' ? true : span >= 2; // 1 jour = trop étroit pour un texte, reste lisible au survol (title)
      let base = 'grid-column:' + colStart + ' / ' + colEnd + ';grid-row:1;align-self:center;height:' + (st.view==='month'?'16px':'26px') + ';margin:0 1px;border-radius:6px;display:flex;align-items:center;overflow:hidden;cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,.18);';
      let lbl = function(txt, extra){ return showLabel ? '<span style="font-size:.68rem;font-weight:700;color:' + (extra||'#fff') + ';padding:0 8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + escapeHtml(txt) + '</span>' : ''; };

      if(seg.payload.kind === 'conflict'){
        let labels = seg.payload.rentals.map(function(e){ return 'Contract ' + (e.rental.contract || e.rental.id || '\u2014'); })
          .concat(seg.payload.moves.map(function(e){ return ((typeof getDestLabels==='function'?getDestLabels()[e.move.dest]:null) || e.move.dest) + ' (' + e.move.plate + ')'; }));
        let firstOwn = seg.payload.rentals.filter(function(e){ return !e.rental._remote; })[0];
        let clickTarget = firstOwn
          ? 'data-fcal-action="goto-rental" data-fcal-id="' + firstOwn.rental.id + '"'
          : (seg.payload.moves.length ? 'data-fcal-action="goto-move"' : '');
        return '<div ' + clickTarget + ' title="' + escapeHtml(_fcalT('fleetcal.conflictTitle','Overlapping contracts') + ': ' + labels.join(' / ')) + '" style="' + base + 'background:repeating-linear-gradient(45deg,#9333ea,#9333ea 5px,#7e22ce 5px,#7e22ce 10px);justify-content:center;color:#fff">\u26a0\ufe0f ' + lbl(_fcalT('fleetcal.conflictShort','Conflict')) + '</div>';
      }

      if(seg.payload.kind === 'move'){
        let e = seg.payload.entry, m = e.move;
        let destLabel = (typeof getDestLabels === 'function' ? getDestLabels()[m.dest] : null) || m.dest || 'Move';
        let driver = m.direction === 'received' ? (m.userIn || '') : (m.user || '');
        let tip = destLabel + (driver ? ' \u2014 ' + driver : '') + '\n' + fmtRange(e, true);
        let tail = (e.ongoing && seg.end === days.length-1 && _fcalISO(days[seg.end])===todayISO) ? '<span style="color:#fff;font-size:.7rem;margin-left:auto;padding-right:6px">\u25b6</span>' : '';
        return '<div data-fcal-action="goto-move" title="' + escapeHtml(tip) + '" style="' + base + 'background:' + FCAL_COLORS.moved + '">' + lbl('\ud83d\udd27 ' + destLabel) + tail + '</div>';
      }

      // kind === 'rental'
      let e = seg.payload.entry, r = e.rental;
      let status = _fcalRentalStatus(e, todayISO); // active | due | overdue | closed
      let color = FCAL_COLORS[status];
      let anim = status === 'overdue' ? ';animation:fcal-overdue-blink 1.1s ease-in-out infinite' : '';
      let clientName = r._clientName || ((r._clientId && (DB.clients||[]).find(function(c){ return c.id === r._clientId; })||{}).firstname) || '';
      let tip = (r.contract ? 'Contract ' + r.contract : 'Rental') + (r.branch ? ' (' + r.branch + ')' : '') + (clientName ? ' \u2014 ' + clientName : '') + '\n' + fmtRange(e, false);
      let contractLabel = (r.contract || r.id) ? ('#' + (r.contract || r.id)) : '#\u2014';
      let text;
      if(status === 'overdue'){
        let exp = _fcalParseDateOnly(r.expectedReturn);
        let daysLate = exp ? Math.max(1, Math.round((new Date(new Date().toDateString()) - exp) / 86400000)) : null;
        text = contractLabel + ' ' + _fcalT('fleetcal.overdueShort','Overdue') + (daysLate ? ' ' + daysLate + 'd' : '');
      } else {
        text = contractLabel;
      }
      let textColor = status === 'closed' ? '#1e293b' : '#fff';
      let tail = (e.ongoing && seg.end === days.length-1 && _fcalISO(days[seg.end])===todayISO) ? '<span style="color:' + textColor + ';font-size:.7rem;margin-left:auto;padding-right:6px">\u25b6</span>' : '';
      // Contrat d'une autre branche (via /api/fleet-occupancy) : visible, non cliquable
      // (il n'est pas dans DB.rentals de cette session).
      let openAttr = r._remote ? '' : 'data-fcal-action="goto-rental" data-fcal-id="' + r.id + '" ';
      let curs = r._remote ? 'cursor:default;' : '';
      return '<div ' + openAttr + 'title="' + escapeHtml(tip) + '" style="' + base + curs + 'background:' + color + anim + '">' + lbl(text, textColor) + tail + '</div>';
    }).join('');

    return '<div style="display:grid;grid-template-columns:' + gridTemplate + ';position:relative;min-height:' + rowHeight + 'px;border-bottom:1px solid rgba(100,116,139,.1)">' + labelCell + bgCells + barsHtml + '</div>';
  }).join('');

  let headerRow = '<div style="display:grid;grid-template-columns:' + gridTemplate + ';position:sticky;top:0;z-index:3;background:var(--s1);border-bottom:1px solid var(--border)">' +
    '<div style="position:sticky;left:0;background:var(--s1);z-index:4;padding:6px 10px;font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);border-right:1px solid var(--border);display:flex;align-items:center">' + vehData.length + ' ' + escapeHtml(_fcalT('fleetcal.vehicles','vehicles')) + '</div>' +
    headerCells + '</div>';

  wrap.style.maxHeight = '68vh';
  wrap.style.overflow = 'auto';
  wrap.style.position = 'relative';
  wrap.innerHTML = vehData.length
    ? (headerRow + rowsHtml)
    : (headerRow + '<div style="padding:40px;text-align:center;color:var(--muted)">' + escapeHtml(_fcalT('fleetcal.noVehicles','No vehicles match this filter.')) + '</div>');

  // ── Ligne verticale "Now" (uniquement si aujourd'hui est dans la période affichée) ──
  let oldNow = wrap.querySelector('[data-fcal-nowline]');
  if(oldNow) oldNow.remove();
  let todayColEl = wrap.querySelector('[data-fcal-daycol="' + todayISO + '"]');
  if(todayColEl){
    let now = new Date();
    let frac = (now.getHours()*60 + now.getMinutes()) / 1440;
    let leftPx = todayColEl.offsetLeft + todayColEl.offsetWidth * frac;
    let nowWrap = document.createElement('div');
    nowWrap.setAttribute('data-fcal-nowline','1');
    nowWrap.style.cssText = 'position:absolute;top:0;left:' + leftPx + 'px;height:' + wrap.scrollHeight + 'px;width:0;z-index:5;pointer-events:none';
    nowWrap.innerHTML = '<div style="position:absolute;top:32px;bottom:0;left:0;width:2px;background:#7c3aed;opacity:.55"></div>' +
      '<div style="position:absolute;top:8px;left:0;transform:translateX(-50%);background:#7c3aed;color:#fff;font-size:.62rem;font-weight:800;padding:2px 7px;border-radius:20px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.3)">' + escapeHtml(_fcalT('fleetcal.now','Now')) + '</div>';
    wrap.appendChild(nowWrap);
  }

  // ── Légende (bas de carte, comme la maquette) ──
  let legend = document.getElementById('fcal-legend');
  if(legend){
    let items = [
      ['#ef4444', _fcalT('fleetcal.legendOverdue','Overdue'), true],
      ['#f59e0b', _fcalT('fleetcal.legendDue','Due today')],
      ['#16a34a', _fcalT('fleetcal.legendActive','Active')],
      ['#94a3b8', _fcalT('fleetcal.legendCompleted','Closed')],
      ['#6366f1', _fcalT('fleetcal.legendMoved','Internal move')],
      ['#9333ea', _fcalT('fleetcal.legendConflict','Double-booked')]
    ];
    legend.innerHTML = items.map(function(it){
      let shape = it[2] ? 'border-radius:50%' : 'border-radius:3px';
      return '<span style="display:inline-flex;align-items:center;gap:5px"><span style="width:9px;height:9px;' + shape + ';display:inline-block;background:' + it[0] + '"></span>' + escapeHtml(it[1]) + '</span>';
    }).join('') + '<span style="margin-left:auto;opacity:.7">' + escapeHtml(_fcalT('fleetcal.clickHint','Click any bar to open the contract')) + '</span>';
  }
}
window.renderFleetCalendar = renderFleetCalendar;

// ── Délégation d'événements locale (même pattern que data-fleet-action
// dans module-fleet-database.js) — clic sur une case colorée → ouvre le
// contrat dans Daily Rentals. ──
document.addEventListener('click', function(e){
  let btn = e.target.closest('[data-fcal-action]');
  if(!btn) return;
  let action = btn.dataset.fcalAction;
  if(action === 'goto-rental'){
    let id = Number(btn.dataset.fcalId);
    if(typeof goToContract === 'function') goToContract(id);
    else if(typeof goTo === 'function') goTo('daily', document.querySelector('.nav-item[data-nav-page="daily"]'));
  } else if(action === 'goto-move'){
    // Pas d'équivalent à goToContract() pour les mouvements internes (pas de
    // scroll-to-row dédié dans module-internal-movements.js) — on se contente
    // d'ouvrir la page Moves, l'utilisateur retrouve la ligne via sa plaque.
    if(typeof goTo === 'function') goTo('moves', document.querySelector('.nav-item[data-nav-page="moves"]'));
  }
});
