// ════════════════════════════════════════════════════════════════════
// module-gps-map.js — Vue "Map" du module GPS Tracking (carte live).
//
// Vient EN PLUS de renderGpsTracking() (vue Liste, module-gps-tracking.js,
// INCHANGÉE) — un toggle "📋 List / 🗺️ Map" dans la toolbar bascule entre
// les deux (voir tpl-page-gps dans app.html + setGpsView() ci-dessous).
//
// Source des positions : GET /api/gps-live → table gps_status
// (gps-alerts-lib.js), indexée par IMEI, synchronisée depuis MadarTech
// toutes les 5 min par le setInterval déjà actif dans server.js.
//
// Isolation : ce module ne lit et n'écrit JAMAIS DB.vehicles ni aucun id
// véhicule — même principe que gps-alerts-lib.js / gps-device-map.js. Le
// rapprochement plaque → nom/modèle/statut loué se fait ICI, côté
// frontend, par plaque normalisée (_normPlate, module-gps-tracking.js),
// exactement comme getGpsLink() et getGpsDeviceInfo() le font déjà.
//
// Statuts affichés (couleur des pins) — split réel du mockup d'origine :
// Overdue (rouge) / Due today (orange) / Active (bleu) / Movement (indigo,
// mouvement interne, inchangé) / Idle (vert, dispo au dépôt). Calculé dans
// _gpsMapStatusFor() sur r.expectedReturn (champ optionnel, <input
// type="date" id="r-exp-return">, module-daily-rentals.js) : pas de date
// saisie → 'active' par défaut (on ne peut pas savoir si en retard).
// ════════════════════════════════════════════════════════════════════

// ── Styles injectés une seule fois (carte, pins, panneaux flottants).
// Utilise les variables CSS de l'app (--s1/--border/--muted/--green…) pour
// suivre automatiquement le thème clair/sombre, comme le reste de l'app. ──
(function(){
  var css = ''
    + '#gps-leaflet-map{height:560px;border-radius:12px;border:1px solid var(--border);overflow:hidden;background:var(--s2)}'
    + '.gps-map-empty{padding:60px 20px;text-align:center;color:var(--dim);font-size:.85rem}'
    + '.gps-pin{width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 2px 6px rgba(0,0,0,.35);border:2px solid #fff;position:relative;color:#fff}'
    + '.gps-pin-overdue{background:#dc2626}'
    + '.gps-pin-duetoday{background:#d97706}'
    + '.gps-pin-active{background:#0ea5e9}'
    + '.gps-pin-movement{background:#6366f1}'
    + '.gps-pin-idle{background:var(--green,#16a34a)}'
    + '.gps-pin-offline{opacity:.55;filter:grayscale(.5);border-style:dashed}'
    + '.gps-pin-pulse::after{content:"";position:absolute;inset:-8px;border-radius:50%;border:2px solid currentColor;animation:gpsPulse 1.8s ease-out infinite}'
    + '@keyframes gpsPulse{0%{transform:scale(.6);opacity:.8}100%{transform:scale(1.9);opacity:0}}'
    + '.gps-map-panel{background:var(--s1);border:1px solid var(--border);border-radius:10px;padding:10px 14px;font-size:.78rem;color:var(--text);box-shadow:0 2px 10px rgba(0,0,0,.15);min-width:150px;margin:10px}'
    + '.gps-map-panel h4{margin:0 0 6px;font-size:.7rem;letter-spacing:.04em;color:var(--muted);text-transform:uppercase}'
    + '.gps-map-panel-row{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:2px 0;white-space:nowrap}'
    + '.gps-map-legend-dot{width:9px;height:9px;border-radius:50%;display:inline-block;margin-right:6px}'
    + '.gps-popup{font-size:.78rem;line-height:1.55}'
    + '.gps-popup b{font-size:.86rem}'
    + '.gps-popup-warn{color:#dc2626;font-weight:700}'
    + '#gps-view-list-btn.active-view,#gps-view-map-btn.active-view{background:rgba(14,165,233,.15);color:#0ea5e9}';
  var styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);
})();

// ── _loadLeaflet — lazy loader, même principe que _loadChartJs() (core.js) :
// Leaflet n'est injecté qu'au premier clic sur "Map", mis en cache ensuite.
// CDN unpkg déjà whitelisté en script-src (CSP, server.js) ; style-src a été
// élargi à unpkg.com pour permettre le <link> officiel de leaflet.css. ──
window._leafletLoadPromise = null;
function _loadLeaflet(){
  if(window.L) return Promise.resolve();
  if(window._leafletLoadPromise) return window._leafletLoadPromise;
  window._leafletLoadPromise = new Promise(function(resolve, reject){
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
    link.crossOrigin = '';
    document.head.appendChild(link);
    var s = document.createElement('script');
    s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    s.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
    s.crossOrigin = '';
    s.onload = function(){ resolve(); };
    s.onerror = function(){
      window._leafletLoadPromise = null; // permet de réessayer au prochain appel
      reject(new Error((typeof translate === 'function') ? translate('gpsmap.leafletError') : 'Could not load the map (CDN unreachable?)'));
    };
    document.head.appendChild(s);
  });
  return window._leafletLoadPromise;
}

// ── setGpsView('list'|'map') — bascule entre les 2 vues de la page GPS.
// Appelé par le toggle data-app-action="gps-set-view" (voir core.js). ──
window._gpsView = 'list';
var _gpsMapPollTimer = null;
function setGpsView(view){
  window._gpsView = view;
  var listBtn  = document.getElementById('gps-view-list-btn');
  var mapBtn   = document.getElementById('gps-view-map-btn');
  var listWrap = document.getElementById('gps-list-wrap');
  var mapWrap  = document.getElementById('gps-map-wrap');
  if(!listWrap || !mapWrap) return;

  if(view === 'map'){
    listWrap.style.display = 'none';
    mapWrap.style.display = '';
    if(listBtn) listBtn.classList.remove('active-view');
    if(mapBtn) mapBtn.classList.add('active-view');
    renderGpsMap();
    if(!_gpsMapPollTimer) _gpsMapPollTimer = setInterval(renderGpsMap, 30000);
  } else {
    mapWrap.style.display = 'none';
    listWrap.style.display = '';
    if(mapBtn) mapBtn.classList.remove('active-view');
    if(listBtn) listBtn.classList.add('active-view');
    if(_gpsMapPollTimer){ clearInterval(_gpsMapPollTimer); _gpsMapPollTimer = null; }
  }
}
window.setGpsView = setGpsView;

// ── _gpsTodayStr / _gpsDaysBetween — dates locales (pas UTC, pour matcher
// le fuseau Oman) en "YYYY-MM-DD", même format que r.expectedReturn
// (<input type="date">). ──
function _gpsTodayStr(){
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function _gpsDaysBetween(fromStr, toStr){
  var a = new Date(fromStr + 'T00:00:00');
  var b = new Date(toStr + 'T00:00:00');
  return Math.max(1, Math.round((b - a) / 86400000));
}

// ── _gpsRentalPlate(r) — plaque réelle d'un contrat, MÊME logique que
// partout ailleurs dans module-daily-rentals.js (ex: `v.plate || r._plate`,
// buildLigne/renderOpenContracts...) : `r._plate` n'est rempli QUE pour un
// véhicule externe (loué en texte libre, sans fiche DB.vehicles) —
// `_plate: vehicleId ? undefined : plate` à la sauvegarde. Pour un
// contrat sur un véhicule de flotte connu (r.vehicleId défini, le cas
// quasi général), la plaque vit sur DB.vehicles, pas sur le rental.
// Comparer directement r._plate ratait donc presque tous les contrats
// (tout retombait en 'idle' silencieusement). ──
function _gpsRentalPlate(r){
  if(r.vehicleId){
    var v = (DB.vehicles || []).find(function(x){ return x.id === r.vehicleId; });
    if(v && v.plate) return v.plate;
  }
  return r._plate || '';
}

// ── _gpsMapStatusFor(plate) — MÊME recherche de location/mouvement ouvert
// que renderGpsTracking() (module-gps-tracking.js), copie volontaire (pas
// d'extraction commune) pour ne prendre aucun risque de casser la vue
// Liste existante en la touchant. Matching par plaque NORMALISÉE
// (_normPlate, même fonction que _gpsMapDisplayName) sur _gpsRentalPlate(r)
// (voir ci-dessus) — dev.plate vient brut de MadarTech (espace/tiret/casse
// variables). Statut d'une location ouverte splité sur r.expectedReturn —
// pas de date saisie → 'active' (on ne peut pas savoir si en retard,
// comme 'ON TRACK' dans module-daily-rentals.js) ; expectedReturn dépassée
// → 'overdue' ; expectedReturn = aujourd'hui → 'duetoday' ; sinon 'active'.
// Un mouvement interne ouvert → 'movement' (inchangé). Sinon 'idle'
// (dispo au dépôt). clientName/bal ajoutés pour le popup (_clientName déjà
// snapshoté sur le contrat, indépendant du véhicule ; bal via
// ocContractBal(), module-daily-rentals.js, même calcul que la vue Open
// Contracts — pas de logique dupliquée). ──
function _gpsMapStatusFor(plate){
  var vPlate = (typeof _normPlate === 'function') ? _normPlate(plate || '') : (plate || '').toLowerCase();
  var openRental = _gpsMapOpenRentalByPlate ? _gpsMapOpenRentalByPlate.get(vPlate) : undefined;
  if(openRental){
    var exp = openRental.expectedReturn || '';
    var status = 'active', daysLate = 0;
    if(exp){
      var today = _gpsTodayStr();
      if(exp < today){ status = 'overdue'; daysLate = _gpsDaysBetween(exp, today); }
      else if(exp === today){ status = 'duetoday'; }
    }
    var bal = (typeof ocContractBal === 'function') ? ocContractBal(openRental) : Number(openRental.bal || 0);
    // Nom client — MÊME priorité que renderOpenContracts() (module-daily-
    // rentals.js ~L2895) : _clientName (snapshot figé au save) en premier,
    // sinon fallback sur la fiche DB.clients via _clientId (utile si le
    // contrat est ancien, d'avant l'ajout du snapshot). Tel : toujours
    // sur le rental lui-même (r.tel), jamais sur la fiche client. ──
    var client = openRental._clientId ? (DB.clients || []).find(function(c){ return c.id === openRental._clientId; }) : null;
    var clientName = openRental._clientName || (client ? (client.firstname || '') : '');
    return {
      status: status,
      contract: openRental.contract || '',
      expectedReturn: exp,
      daysLate: daysLate,
      clientName: clientName,
      tel: openRental.tel || '',
      bal: bal
    };
  }

  var moveOut = _gpsMapOpenMoveByPlate ? _gpsMapOpenMoveByPlate.get(extractPlateNum(vPlate)) : undefined;
  if(moveOut) return { status: 'movement', dest: moveOut.dest || '' };

  return { status: 'idle' };
}

// ── _gpsMapDisplayName(plate) — nom affiché sur le pin/popup. Priorité :
// 1) DB.gpsLinks.name (fiche déjà saisie dans GPS Tracking, même source que
//    la vue Liste → cohérence garantie) ; 2) PLATE_VEHICLE_MAP (modèle) —
// recherche normalisée (_normPlate) plutôt que via getVehicleNameByPlate()
// (core.js), qui suppose une plaque déjà au format "1234-TA" : la plaque
// MadarTech (gps_status.plate) peut arriver dans un format différent
// (espace, sans séparateur…), donc on tolère les deux comme le fait déjà
// getGpsDeviceInfo() pour l'IMEI. ──
function _gpsMapDisplayName(plate){
  var norm = _normPlate(plate);
  var g = (DB.gpsLinks || []).find(function(x){ return _normPlate(x.plate) === norm; });
  if(g && g.name) return g.name;
  if(typeof PLATE_VEHICLE_MAP !== 'undefined'){
    for(var k in PLATE_VEHICLE_MAP){
      if(_normPlate(k) === norm) return PLATE_VEHICLE_MAP[k];
    }
  }
  return '';
}

// ── _gpsRelTime(unixSeconds) → "3m ago" / "2h ago" / "5d ago" ──
function _gpsRelTime(ts){
  if(!ts) return '—';
  var diff = Math.floor(Date.now() / 1000) - ts;
  if(diff < 0) diff = 0;
  if(diff < 60) return 'just now';
  if(diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if(diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  return Math.floor(diff / 86400) + 'd ago';
}

var _gpsLeafletMap = null;
var _gpsMarkersLayer = null;
var _gpsSidebarControl = null;
var _gpsLegendControl = null;
var _gpsMapDidFitBounds = false;
var _gpsMapEmptyEl = null;

// ── Perf : caches reconstruits UNE FOIS par cycle de dessin (_drawGpsLive)
// au lieu d'un scan complet de DB.rentals/DB.moves dans _gpsMapStatusFor()
// pour CHAQUE véhicule affiché (100+ véhicules × scan complet toutes les
// 30s). Logique de correspondance strictement identique à l'originale. ──
var _gpsMapOpenRentalByPlate = null;
var _gpsMapOpenMoveByPlate = null;
function _gpsMapRebuildCaches(){
  _gpsMapOpenRentalByPlate = new Map();
  (DB.rentals || []).forEach(function(r){
    if(r.dateIn && r.dateIn !== '') return;
    var key = (typeof _normPlate === 'function') ? _normPlate(_gpsRentalPlate(r)) : _gpsRentalPlate(r).toLowerCase();
    if(key && !_gpsMapOpenRentalByPlate.has(key)) _gpsMapOpenRentalByPlate.set(key, r);
  });
  _gpsMapOpenMoveByPlate = new Map();
  (DB.moves || []).forEach(function(m){
    if(m.dateIn || typeof extractPlateNum !== 'function') return;
    var key = extractPlateNum(m.plate);
    if(key && !_gpsMapOpenMoveByPlate.has(key)) _gpsMapOpenMoveByPlate.set(key, m);
  });
}

// ── renderGpsMap — point d'entrée. Appelé à l'ouverture de l'onglet Map,
// puis toutes les 30s tant qu'il reste ouvert (voir setGpsView). Ne fait
// rien si l'onglet Map n'est pas affiché (évite un polling inutile en
// arrière-plan quand l'utilisateur est resté sur la vue Liste). ──
function renderGpsMap(){
  var wrap = document.getElementById('gps-map-wrap');
  if(!wrap || wrap.style.display === 'none') return;

  _loadLeaflet().then(function(){
    var mapEl = document.getElementById('gps-leaflet-map');
    if(!mapEl) return;
    if(!_gpsLeafletMap){
      _gpsLeafletMap = L.map(mapEl).setView([23.65, 57.95], 10); // Muscat/Barka
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(_gpsLeafletMap);
      _gpsMarkersLayer = L.layerGroup().addTo(_gpsLeafletMap);
    } else {
      _gpsLeafletMap.invalidateSize(); // conteneur ré-affiché après display:none
    }
    _fetchAndDrawGpsLive();
  }).catch(function(err){
    var mapEl = document.getElementById('gps-leaflet-map');
    if(mapEl) mapEl.innerHTML = '<div class="gps-map-empty">⚠️ ' + escapeHtml(err.message || 'Map unavailable') + '</div>';
  });
}
window.renderGpsMap = renderGpsMap;

function _fetchAndDrawGpsLive(){
  fetch('/api/gps-live', { headers: authHeaders({}) })
    .then(function(r){ return r.ok ? r.json() : null; })
    .then(function(d){
      if(!d || d.ok !== true) return;
      _drawGpsLive(d.devices || []);
    })
    .catch(function(){ /* silencieux — juste un cycle de polling raté, on retente au suivant */ });
}

function _drawGpsLive(devices){
  if(!_gpsMarkersLayer) return;
  _gpsMarkersLayer.clearLayers();
  _gpsMapRebuildCaches();

  var located = devices.filter(function(d){ return d.lat != null && d.lng != null; });

  if(!located.length){
    if(!_gpsMapEmptyEl){
      var mapEl = document.getElementById('gps-leaflet-map');
      if(mapEl){
        _gpsMapEmptyEl = document.createElement('div');
        _gpsMapEmptyEl.className = 'gps-map-empty';
        _gpsMapEmptyEl.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--s1);border:1px solid var(--border);border-radius:10px;z-index:1000';
        mapEl.style.position = 'relative';
        mapEl.appendChild(_gpsMapEmptyEl);
      }
      // textContent mis à jour à chaque appel (pas que la 1ère fois) pour
      // rester dans la bonne langue si l'utilisateur bascule EN/AR pendant
      // que la flotte reste vide (aucune position GPS reçue). ──
      _gpsMapEmptyEl.textContent = translate('gpsmap.noPositionsYet');
    }
    return;
  }
  if(_gpsMapEmptyEl){ _gpsMapEmptyEl.remove(); _gpsMapEmptyEl = null; }

  var counts = { overdue: 0, duetoday: 0, active: 0, movement: 0, idle: 0, offline: 0, noMovement: 0 };
  var bounds = [];

  located.forEach(function(dev){
    var st = _gpsMapStatusFor(dev.plate);
    counts[st.status] = (counts[st.status] || 0) + 1;
    if(dev.is_offline) counts.offline++;
    if(dev.no_movement) counts.noMovement++;

    var colorClass  = 'gps-pin-' + st.status;
    var pulseClass  = (st.status !== 'idle') && !dev.is_offline ? 'gps-pin-pulse' : '';
    var offlineCls  = dev.is_offline ? 'gps-pin-offline' : '';
    var icon = L.divIcon({
      className: '',
      html: '<div class="gps-pin ' + colorClass + ' ' + pulseClass + ' ' + offlineCls + '">🚗</div>',
      iconSize: [30, 30],
      iconAnchor: [15, 15],
      popupAnchor: [0, -15]
    });

    var displayName = _gpsMapDisplayName(dev.plate) || dev.name || '';
    var link = (typeof getGpsLink === 'function') ? getGpsLink(dev.plate) : null;

    // Libellé Movement : réutilise moves.dest.* (déjà traduit EN/AR dans
    // i18n.js pour module-internal-movements.js, emoji spécifique par
    // destination inclus) plutôt que de dupliquer un dictionnaire local —
    // fallback sur translate('gpsmap.movement') si dest absent/inconnu. ──
    var movementLabel = (function(){
      var key = 'moves.dest.' + (st.dest || '');
      var tr = translate(key);
      return (tr !== key) ? tr : ('🔄 ' + translate('gpsmap.movement'));
    })();

    var statusLabel = st.status === 'overdue'
      ? '🔴 ' + translate('gpsmap.overdue') + (st.daysLate ? ' · ' + t(translate('gpsmap.daysLate'), st.daysLate) : '') + (st.contract ? ' · #' + escapeHtml(st.contract) : '')
      : st.status === 'duetoday'
      ? '🟠 ' + translate('gpsmap.dueToday') + (st.contract ? ' · #' + escapeHtml(st.contract) : '')
      : st.status === 'active'
      ? '🚗 ' + translate('gpsmap.active') + (st.contract ? ' · #' + escapeHtml(st.contract) : '')
      : st.status === 'movement'
      ? movementLabel
      : '🅿️ ' + translate('gpsmap.idle');

    var expReturnLine = (st.expectedReturn && (st.status === 'overdue' || st.status === 'duetoday' || st.status === 'active'))
      ? '📆 ' + translate('gpsmap.expected') + ': ' + escapeHtml(st.expectedReturn) + '<br>' : '';

    // Client + solde — seulement sur une location ouverte (rien à devoir
    // en Movement/Idle). bal > 0 en rouge (doit encore), <= 0 en muted
    // (soldé ou en avoir). Même seuil de couleur que ocStatus() (BALANCE
    // DUE / ON TRACK) dans module-daily-rentals.js. ──
    var clientLine = '';
    if(st.status === 'overdue' || st.status === 'duetoday' || st.status === 'active'){
      if(st.clientName) clientLine += '👤 ' + escapeHtml(st.clientName) + '<br>';
      if(st.tel) clientLine += '📞 <a href="tel:' + escapeHtml(st.tel) + '" style="color:var(--text);text-decoration:none">' + escapeHtml(st.tel) + '</a><br>';
      if(typeof st.bal === 'number'){
        var balColor = st.bal > 0 ? '#dc2626' : 'var(--muted)';
        clientLine += '💰 <span style="color:' + balColor + ';font-weight:700">' + Number(st.bal).toFixed(3) + ' OMR</span>' + (st.bal > 0 ? ' ' + translate('gpsmap.due') : '') + '<br>';
      }
    }

    var safePlate = String(dev.plate || '').replace(/'/g, "\\'");
    var popupHtml = '<div class="gps-popup">'
      + '<b>' + escapeHtml(displayName || translate('gpsmap.vehicle')) + ' · ' + escapeHtml(dev.plate || '—') + '</b><br>'
      + statusLabel + '<br>'
      + clientLine
      + expReturnLine
      + '📍 ' + translate('gpsmap.lastUpdate') + ': ' + _gpsRelTime(dev.last_update_ts) + '<br>'
      + '🚀 ' + (dev.speed ? Math.round(dev.speed) + ' km/h' : translate('gpsmap.stopped')) + '<br>'
      + (dev.is_offline ? '<span class="gps-popup-warn">⚠️ ' + translate('gpsmap.offline') + '</span><br>' : '')
      + (dev.no_movement ? '<span class="gps-popup-warn">💤 ' + translate('gpsmap.noMovement48') + '</span><br>' : '')
      + '<span style="color:var(--muted)">📶 IMEI ' + escapeHtml(dev.imei || '—') + '</span>'
      + (link ? '<br><button type="button" style="margin-top:6px;width:100%;padding:5px;border-radius:6px;border:1px solid rgba(14,165,233,.4);background:rgba(14,165,233,.1);color:#0ea5e9;font-size:.75rem;font-weight:600;cursor:pointer" onclick="openVehicleGps(\'' + safePlate + '\')">' + translate('gpsmap.openLiveTracker') + '</button>' : '')
      + '</div>';

    L.marker([dev.lat, dev.lng], { icon: icon }).bindPopup(popupHtml).addTo(_gpsMarkersLayer);
    bounds.push([dev.lat, dev.lng]);
  });

  if(!_gpsMapDidFitBounds && bounds.length){
    _gpsLeafletMap.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
    _gpsMapDidFitBounds = true;
  }

  _updateGpsMapPanels(counts);
}

// ── Panneaux flottants (Live Fleet + légende), en contrôles Leaflet natifs
// (comme le mockup) — créés une fois, contenu rafraîchi à chaque cycle. ──
function _updateGpsMapPanels(counts){
  var sidebarHtml = '<div class="gps-map-panel">'
    + '<h4>' + translate('gpsmap.liveFleet') + '</h4>'
    + '<div class="gps-map-panel-row"><span style="color:#dc2626">🔴 ' + translate('gpsmap.overdue') + '</span><b>' + counts.overdue + '</b></div>'
    + '<div class="gps-map-panel-row"><span style="color:#d97706">🟠 ' + translate('gpsmap.dueToday') + '</span><b>' + counts.duetoday + '</b></div>'
    + '<div class="gps-map-panel-row"><span>🚗 ' + translate('gpsmap.active') + '</span><b>' + counts.active + '</b></div>'
    + '<div class="gps-map-panel-row"><span>🔄 ' + translate('gpsmap.movement') + '</span><b>' + counts.movement + '</b></div>'
    + '<div class="gps-map-panel-row"><span>🅿️ ' + translate('gpsmap.idle') + '</span><b>' + counts.idle + '</b></div>'
    + '<div class="gps-map-panel-row"><span style="color:#dc2626">📡 ' + translate('gpsmap.offline') + '</span><b>' + counts.offline + '</b></div>'
    + '<div class="gps-map-panel-row"><span style="color:#d97706">💤 ' + translate('gpsmap.noMovement48') + '</span><b>' + counts.noMovement + '</b></div>'
    + '</div>';

  var legendHtml = '<div class="gps-map-panel">'
    + '<h4>' + translate('gpsmap.status') + '</h4>'
    + '<div class="gps-map-panel-row"><span><span class="gps-map-legend-dot" style="background:#dc2626"></span>' + translate('gpsmap.overdue') + '</span></div>'
    + '<div class="gps-map-panel-row"><span><span class="gps-map-legend-dot" style="background:#d97706"></span>' + translate('gpsmap.dueToday') + '</span></div>'
    + '<div class="gps-map-panel-row"><span><span class="gps-map-legend-dot" style="background:#0ea5e9"></span>' + translate('gpsmap.active') + '</span></div>'
    + '<div class="gps-map-panel-row"><span><span class="gps-map-legend-dot" style="background:#6366f1"></span>' + translate('gpsmap.movement') + '</span></div>'
    + '<div class="gps-map-panel-row"><span><span class="gps-map-legend-dot" style="background:var(--green,#16a34a)"></span>' + translate('gpsmap.idle') + '</span></div>'
    + '</div>';

  if(!_gpsSidebarControl){
    var SidebarControl = L.Control.extend({
      options: { position: 'topright' },
      onAdd: function(){
        var div = L.DomUtil.create('div');
        div.id = 'gps-map-sidebar-inner';
        L.DomEvent.disableClickPropagation(div);
        return div;
      }
    });
    _gpsSidebarControl = new SidebarControl();
    _gpsSidebarControl.addTo(_gpsLeafletMap);
  }
  var sidebarEl = document.getElementById('gps-map-sidebar-inner');
  if(sidebarEl) sidebarEl.innerHTML = sidebarHtml;

  if(!_gpsLegendControl){
    var LegendControl = L.Control.extend({
      options: { position: 'bottomleft' },
      onAdd: function(){
        var div = L.DomUtil.create('div');
        div.id = 'gps-map-legend-inner';
        L.DomEvent.disableClickPropagation(div);
        return div;
      }
    });
    _gpsLegendControl = new LegendControl();
    _gpsLegendControl.addTo(_gpsLeafletMap);
  }
  var legendEl = document.getElementById('gps-map-legend-inner');
  if(legendEl) legendEl.innerHTML = legendHtml;
}
