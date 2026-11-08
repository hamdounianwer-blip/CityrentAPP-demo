/* ══════════════════════════════════════════════════════════════════════
   demo-mock.js — simule le backend (server.js) dans le navigateur.
   Version DÉMO uniquement (GitHub Pages) : aucune requête n'est envoyée au
   serveur, toutes les données viennent de window.DEMO_SEED (fictives).
   Les modifications restent dans l'onglet (sessionStorage) et sont
   réinitialisées à chaque nouvelle connexion.
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var SEED = window.DEMO_SEED;
  if (!SEED) { console.error('[DEMO] demo-data.js introuvable'); return; }

  var STATE_KEY = 'cityrent_demo_state_v1';
  var DEMO_SECONDARY_PASSWORD = '0000';   // mot de passe des actions sensibles (démo)

  // Comptes de démonstration (affichés sur la page de connexion)
  var DEMO_USERS = {
    demo: { password: '0000', branches: ['DEMO'], role: 'staff', label: 'Compte de démonstration — agence unique' }
  };

  // Tables modifiables (clé = nom de table côté app, arr = clé dans l'état, pk = clé primaire)
  var TABLES = {
    vehicles:        { arr: 'vehicles',       pk: 'id' },
    rentals:         { arr: 'rentals',        pk: 'id' },
    payments:        { arr: 'payments',       pk: 'id' },
    clients:         { arr: 'clients',        pk: 'id' },
    moves:           { arr: 'moves',          pk: 'id' },
    gps_links:       { arr: 'gpsLinks',       pk: 'id' },
    depence:         { arr: 'depence',        pk: 'id' },
    suppliers:       { arr: 'suppliers',      pk: 'id' },
    bookings:        { arr: 'bookings',       pk: 'id' },
    booking_catalog: { arr: 'bookingCatalog', pk: 'plate' },
    logs:            { arr: 'logs',           pk: 'id' }
  };

  // ── État ────────────────────────────────────────────────────────────
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  var S = null;
  function loadState() {
    try {
      var raw = window.sessionStorage.getItem(STATE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* stockage indisponible → état mémoire */ }
    return clone(SEED);
  }
  function saveState() {
    try { window.sessionStorage.setItem(STATE_KEY, JSON.stringify(S)); } catch (e) { /* quota : on continue en mémoire */ }
  }
  S = loadState();

  // Page de connexion = nouvelle session démo → on repart des données fictives d'origine
  if (/login\.html$/.test(window.location.pathname)) {
    try { window.sessionStorage.removeItem(STATE_KEY); } catch (e) {}
    S = clone(SEED);
  }

  // ── Utilitaires ─────────────────────────────────────────────────────
  function up(x) { return String(x || '').toUpperCase(); }

  function currentUser() {
    var name = 'demo';
    try {
      var auth = JSON.parse(window.localStorage.getItem('fleetpro_auth') || 'null');
      if (auth && auth.username && DEMO_USERS[auth.username]) name = auth.username;
    } catch (e) {}
    var u = DEMO_USERS[name];
    return { username: name, branches: u.branches, role: u.role, isAdmin: false };
  }

  function allowedBranches(user) {
    return user.branches === 'ALL' ? null : user.branches.map(up);
  }

  function inBranches(rec, allowed) {
    return !allowed || allowed.indexOf(up(rec.branch)) > -1;
  }

  function jsonResponse(status, body) {
    return Promise.resolve(new Response(JSON.stringify(body), {
      status: status,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
    }));
  }

  function readBody(init) {
    try { return JSON.parse((init && init.body) || '{}'); } catch (e) { return {}; }
  }

  function isAccountant(user) { return user.role === 'accountant'; }

  // ── Routes ──────────────────────────────────────────────────────────
  // Chaque handler reçoit { method, path, body, user, match } et renvoie { status, body }
  function computeKmHistory() {
    return S.rentals.map(function (rd) {
      return {
        vehicleId: rd.vehicleId,
        plate: rd._plate || rd.plate || '',
        kmIn: rd.kmIn,
        kmOut: rd.kmOut,
        dateIn: rd.dateIn,
        dateOut: rd.dateOut
      };
    });
  }

  function buildLoad(user) {
    var allowed = allowedBranches(user);
    var bookingAllowed = allowed ? allowed.concat(['SHARED']) : null;
    var counters = S.counters || {};
    var counter = function (k) { return counters[k] || 1; };
    return {
      vehicles: S.vehicles,                                       // flotte partagée (toujours complète)
      rentals: S.rentals.filter(function (r) { return inBranches(r, allowed); }),
      payments: S.payments.filter(function (p) { return inBranches(p, allowed); }),
      kmHistory: computeKmHistory(),
      branches: S.branches,
      logs: S.logs,
      moves: S.moves,
      gpsLinks: S.gpsLinks,
      clients: S.clients,
      bookings: S.bookings.filter(function (b) { return inBranches(b, bookingAllowed); }),
      bookingCatalog: S.bookingCatalog,
      depence: S.depence,
      depenceCategories: S.depenceCategories,
      closedMonths: S.closedMonths || [],
      suppliers: S.suppliers,
      makhViolations: S.makhViolations || { local: [], municipal: [] },
      nextVId: counter('nextVId'),
      nextRId: counter('nextRId'),
      nextPId: counter('nextPId'),
      nextMId: counter('nextMId'),
      nextGpsId: counter('nextGpsId'),
      nextCId: counter('nextCId'),
      nextDepId: counter('nextDepId'),
      nextSupId: counter('nextSupId'),
      savedAt: S.savedAt,
      currentUser: { username: user.username, branches: user.branches, isAdmin: user.isAdmin, role: user.role }
    };
  }

  function nextCountersFromState() {
    var maxOf = function (arr, k) { return arr.reduce(function (m, x) { return Math.max(m, Number(x[k]) || 0); }, 0); };
    S.counters = S.counters || {};
    S.counters.nextVId = maxOf(S.vehicles, 'id') + 1;
    S.counters.nextRId = maxOf(S.rentals, 'id') + 1;
    S.counters.nextPId = maxOf(S.payments, 'id') + 1;
    S.counters.nextCId = maxOf(S.clients, 'id') + 1;
  }

  function overlapConflict(vehicleId, dateOut, dateIn, excludeId) {
    var a0 = dateOut || '', a1 = dateIn || '\uffff';
    return S.rentals.find(function (r) {
      if (String(r.id) === String(excludeId)) return false;
      if (String(r.vehicleId) !== String(vehicleId) || r._cancelled) return false;
      var b0 = r.dateOut || '', b1 = r.dateIn || '\uffff';
      return a0 < b1 && b0 < a1;
    }) || null;
  }

  var ROUTES = [
    // ── Authentification ─────────────────────────────────────────────
    { m: 'POST', p: /\/api\/login$/, h: function (c) {
      var b = c.body, u = DEMO_USERS[String(b.username || '').trim()];
      if (!u || u.password !== b.password) return { status: 200, body: { ok: false, error: 'Identifiants invalides.' } };
      var name = String(b.username).trim();
      return { status: 200, body: {
        ok: true, token: 'demo-' + Math.random().toString(36).slice(2),
        username: name, branches: u.branches, isAdmin: false, role: u.role
      } };
    } },
    { m: 'POST', p: /\/api\/logout$/, h: function () { return { status: 200, body: { ok: true } }; } },

    // ── Chargement / santé ───────────────────────────────────────────
    { m: 'GET', p: /\/load$/, h: function (c) { return { status: 200, body: buildLoad(c.user) }; } },
    { m: 'GET', p: /\/ping$/, h: function () { return { status: 200, body: { ok: true, server: 'City Rent (démo)', db: 'ok', ts: new Date().toISOString() } }; } },
    { m: 'GET', p: /\/api\/counters$/, h: function () {
      var k = S.counters || {};
      return { status: 200, body: { ok: true, nextVId: k.nextVId || 1, nextRId: k.nextRId || 1, nextPId: k.nextPId || 1,
        nextMId: k.nextMId || 1, nextGpsId: k.nextGpsId || 1, nextCId: k.nextCId || 1, nextSupId: k.nextSupId || 1 } };
    } },

    // ── Écritures (en mémoire) ───────────────────────────────────────
    { m: 'POST', p: /\/save-one$/, h: function (c) {
      if (isAccountant(c.user)) return { status: 403, body: { ok: false, code: 'ACCOUNTANT_ROLE', error: 'Rôle comptable : lecture seule.' } };
      var t = TABLES[c.body.table], rec = c.body.record;
      if (!t || !rec) return { status: 400, body: { ok: false, error: 'Table ou enregistrement invalide' } };
      var list = S[t.arr] = S[t.arr] || [];
      var idx = list.findIndex(function (x) { return String(x[t.pk]) === String(rec[t.pk]); });
      if (idx > -1) list[idx] = rec; else list.push(rec);
      if (c.body.table === 'rentals') nextCountersFromState();
      saveState();
      return { status: 200, body: { ok: true, record: rec } };
    } },
    { m: 'POST', p: /\/delete-one$/, h: function (c) {
      if (isAccountant(c.user)) return { status: 403, body: { ok: false, code: 'ACCOUNTANT_ROLE', error: 'Rôle comptable : lecture seule.' } };
      var t = TABLES[c.body.table];
      if (!t) return { status: 400, body: { ok: false, error: 'Table invalide' } };
      S[t.arr] = (S[t.arr] || []).filter(function (x) { return String(x[t.pk]) !== String(c.body.id); });
      saveState();
      return { status: 200, body: { ok: true } };
    } },
    { m: 'POST', p: /\/save$/, h: function () { return { status: 200, body: { ok: true, demo: true } }; } },
    { m: 'POST', p: /\/restore-one$/, h: function () { return { status: 200, body: { ok: false, error: 'Corbeille désactivée dans la démo.' } }; } },
    { m: 'GET', p: /\/trash$/, h: function () { return { status: 200, body: { items: [] } }; } },
    { m: 'POST', p: /\/save-depence-categories$/, h: function (c) {
      if (isAccountant(c.user)) return { status: 403, body: { ok: false, error: 'Lecture seule.' } };
      S.depenceCategories = c.body.categories || c.body.depenceCategories || S.depenceCategories;
      saveState(); return { status: 200, body: { ok: true } };
    } },
    { m: 'POST', p: /\/save-closed-months$/, h: function (c) {
      if (isAccountant(c.user)) return { status: 403, body: { ok: false, error: 'Rôle comptable : lecture seule.' } };
      S.closedMonths = c.body.months || c.body.closedMonths || S.closedMonths;
      saveState(); return { status: 200, body: { ok: true, closedMonths: S.closedMonths } };
    } },
    { m: 'POST', p: /\/backup-now$/, h: function () { return { status: 200, body: { ok: true, message: 'Démo : pas de sauvegarde serveur.' } }; } },
    { m: 'POST', p: /\/check-password$/, h: function (c) {
      var ok = String(c.body.password || '') === DEMO_SECONDARY_PASSWORD;
      return { status: 200, body: ok ? { ok: true } : { ok: false, remaining: 2, error: 'Mot de passe incorrect.' } };
    } },
    { m: 'POST', p: /\/check-vehicle-conflict$/, h: function (c) {
      var b = c.body || {};
      var conflict = overlapConflict(b.vehicleId, b.dateOut, b.dateIn, b.id);
      return { status: 200, body: { conflict: conflict } };
    } },

    // ── Lectures dérivées ────────────────────────────────────────────
    { m: 'GET', p: /\/api\/client-summaries$/, h: function (c) {
      var summaries = {};
      S.rentals.forEach(function (r) {
        var cid = r._clientId;
        if (cid === undefined || cid === null) return;
        var s = summaries[cid] = summaries[cid] || { activeRental: null, totalBAL: 0, rentalCount: 0 };
        s.rentalCount++;
        s.totalBAL += Number(r.bal) || 0;
        if (r.dateOut && !r.dateIn) s.activeRental = r;
      });
      Object.keys(summaries).forEach(function (k) { summaries[k].totalBAL = Math.round(summaries[k].totalBAL * 1000) / 1000; });
      return { status: 200, body: { ok: true, summaries: summaries } };
    } },
    { m: 'GET', p: /\/api\/client-history\/(\d+)$/, h: function (c) {
      var cid = c.match[1];
      var rentals = S.rentals.filter(function (r) { return String(r._clientId) === cid; });
      var ids = rentals.map(function (r) { return String(r.id); });
      var payments = S.payments.filter(function (p) { return ids.indexOf(String(p.rentalId || '')) > -1 || rentals.some(function (r) { return r.contract === p.contract; }); });
      return { status: 200, body: { ok: true, rentals: rentals, payments: payments } };
    } },
    { m: 'GET', p: /\/api\/fleet-occupancy$/, h: function () { return { status: 200, body: { ok: true, rentals: S.rentals } }; } },
    { m: 'GET', p: /\/api\/gps-live$/, h: function () { return { status: 200, body: { ok: true, devices: [] } }; } },
    { m: 'GET', p: /\/api\/gps-alerts$/, h: function () { return { status: 200, body: { ok: true, alerts: [] } }; } },
    { m: 'GET', p: /\/api\/branches$/, h: function () { return { status: 200, body: { branches: S.branches } }; } },
    { m: 'GET', p: /\/booking-requests$/, h: function (c) {
      var allowed = allowedBranches(c.user);
      var list = S.bookings.filter(function (b) { return inBranches(b, allowed ? allowed.concat(['SHARED']) : null); });
      return { status: 200, body: { ok: true, bookings: list } };
    } },
    { m: 'GET', p: /\/attachments$/, h: function () { return { status: 200, body: {} }; } },
    { m: 'GET', p: /\/videos$/, h: function () { return { status: 200, body: {} }; } },

    // ── Utilisateurs (gestion désactivée en démo) ────────────────────
    { m: 'GET', p: /\/api\/users$/, h: function (c) {
      if (!c.user.isAdmin) return { status: 403, body: { error: 'Réservé au directeur.' } };
      return { status: 200, body: { users: Object.keys(DEMO_USERS).map(function (u) {
        return { username: u, branches: DEMO_USERS[u].branches, role: DEMO_USERS[u].role, system: true };
      }) } };
    } },
    { m: /^(POST|PATCH|DELETE)$/, p: /\/api\/users(\/|$)/, h: function () { return { status: 200, body: { ok: false, error: 'Gestion des comptes désactivée dans la démo.' } }; } },

    // ── Violations (مخالفات) — vide en démo ──────────────────────────
    { m: 'GET', p: /\/api\/makh\/violations$/, h: function () { return { status: 200, body: { local: [], municipal: [] } }; } },
    { m: 'GET', p: /\/api\/makh\/incoming$/, h: function () { return { status: 200, body: { list: [], version: 3, nextId: 1 } }; } },
    { m: 'POST', p: /\/api\/makh\/incoming\/ack$/, h: function () { return { status: 200, body: { success: true } }; } },
    { m: 'GET', p: /\/api\/templates$/, h: function () { return { status: 200, body: [] }; } },

    // ── Fichiers, IA et intégrations : désactivés en démo ────────────
    { m: /^(POST|GET)$/, p: /\/(upload-attachment|upload|remove-attachment|remove-video|upload-video)$/, h: disabled('Envoi de fichiers désactivé dans la démo.') },
    { m: 'POST', p: /\/api\/(upload-mulkiya-photo|upload-client-scan|upload-catalog-photo|templates\/upload|delete-client-scan)$/, h: disabled('Envoi de fichiers désactivé dans la démo.') },
    { m: 'GET', p: /\/api\/attachment-info$/, h: function () { return { status: 200, body: { ok: false } }; } },
    { m: 'POST', p: /\/(api\/assistant-chat|anthropic)$/, h: disabled('Assistant IA désactivé dans la démo.') }
  ];

  function disabled(msg) {
    return function () { return { status: 200, body: { ok: false, error: msg } }; };
  }

  function findRoute(method, path) {
    for (var i = 0; i < ROUTES.length; i++) {
      var r = ROUTES[i];
      var mOk = typeof r.m === 'string' ? r.m === method : r.m.test(method);
      if (!mOk) continue;
      var m = r.p.exec(path);
      if (m) return { route: r, match: m };
    }
    return null;
  }

  // Hôtes externes à bloquer (intégrations réelles)
  var BLOCKED_HOSTS = /madartech\.net|generativelanguage\.googleapis\.com|api\.anthropic\.com/i;

  // ── Interception fetch ───────────────────────────────────────────────
  var _fetch = window.fetch ? window.fetch.bind(window) : null;

  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var u;
    try { u = new URL(url, window.location.href); } catch (e) { return _fetch(input, init); }

    if (u.origin !== window.location.origin) {
      if (BLOCKED_HOSTS.test(u.hostname)) {
        return jsonResponse(503, { ok: false, error: 'Service externe désactivé dans la démo.' });
      }
      return _fetch(input, init);   // météo, calendrier hégirien, CDN… : laissés tels quels
    }

    var method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    var found = findRoute(method, u.pathname);
    if (!found) return _fetch(input, init); // fichiers statiques (js/, css/, img/…)

    var ctx = { method: method, path: u.pathname, body: readBody(init), user: currentUser(), match: found.match };
    var out;
    try { out = found.route.h(ctx); } catch (e) {
      console.error('[DEMO] erreur mock', u.pathname, e);
      out = { status: 500, body: { ok: false, error: 'Erreur dans la démo : ' + e.message } };
    }
    // petit délai réaliste pour que les indicateurs de chargement restent visibles
    return new Promise(function (resolve) {
      setTimeout(function () { resolve(jsonResponse(out.status, out.body)); }, 60);
    });
  };

  // ── Bandeau et panneau « comptes démo » ──────────────────────────────
  function injectStyles() {
    var css = '' +
      '.demo-ribbon{position:fixed;left:50%;bottom:12px;transform:translateX(-50%);z-index:2147483647;' +
      'display:flex;align-items:center;gap:10px;padding:6px 8px 6px 14px;border-radius:999px;' +
      'background:#1a2332;color:#e8f5e9;font:600 12px/1.2 system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.25);}' +
      '.demo-ribbon b{color:#22c55e}' +
      '.demo-ribbon button{border:0;border-radius:999px;padding:5px 10px;background:#22c55e;color:#06210f;font:700 11px system-ui,sans-serif;cursor:pointer}' +
      '.demo-creds{position:fixed;right:18px;bottom:18px;z-index:2147483647;width:270px;padding:14px 14px 12px;border-radius:14px;' +
      'background:#fff;color:#1a2332;font:13px/1.4 system-ui,sans-serif;box-shadow:0 12px 32px rgba(0,0,0,.25);border:1px solid #c8d3dd}' +
      '.demo-creds h4{margin:0 0 6px;font-size:13px;color:#15803d}' +
      '.demo-creds p{margin:0 0 8px;font-size:11px;color:#4a6080}' +
      '.demo-creds button{display:block;width:100%;text-align:left;border:1px solid #c8d3dd;background:#f8fafc;' +
      'border-radius:8px;padding:6px 8px;margin-top:5px;cursor:pointer;font:12px system-ui,sans-serif;color:#1a2332}' +
      '.demo-creds button:hover{border-color:#22c55e;background:#f0fdf4}' +
      '.demo-creds code{font-family:ui-monospace,monospace;font-size:11px}';
    var st = document.createElement('style');
    st.id = 'demo-styles';
    st.textContent = css;
    document.head.appendChild(st);
  }

  function resetDemo() {
    try { window.sessionStorage.removeItem(STATE_KEY); } catch (e) {}
    window.location.reload();
  }

  function addRibbon() {
    if (document.getElementById('demo-ribbon')) return;
    var d = document.createElement('div');
    d.id = 'demo-ribbon';
    d.className = 'demo-ribbon';
    d.innerHTML = '<span>Mode <b>DÉMO</b> · données fictives</span>';
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = 'Réinitialiser';
    b.addEventListener('click', resetDemo);
    d.appendChild(b);
    document.body.appendChild(d);
  }

  function addCredsPanel() {
    if (document.getElementById('demo-creds')) return;
    var box = document.createElement('div');
    box.id = 'demo-creds';
    box.className = 'demo-creds';
    box.innerHTML = '<h4>Compte de démonstration</h4>' +
      '<p>Identifiant : <code>demo</code><br>Mot de passe : <code>0000</code><br>' +
      'Mot de passe des actions sensibles : <code>0000</code></p>';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.innerHTML = '<code>demo</code> / <code>0000</code><br><span style="color:#4a6080">Remplir automatiquement</span>';
    btn.addEventListener('click', function () {
      var uEl = document.getElementById('login-username');
      var pEl = document.getElementById('login-password');
      if (uEl) uEl.value = 'demo';
      if (pEl) pEl.value = '0000';
    });
    box.appendChild(btn);
    document.body.appendChild(box);
  }

  function onReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  onReady(function () {
    injectStyles();
    if (/login\.html$/.test(window.location.pathname)) addCredsPanel();
    else addRibbon();
  });

  // Pour le débogage manuel dans la console
  window.__DEMO__ = { state: function () { return S; }, reset: resetDemo, users: DEMO_USERS };
})();
