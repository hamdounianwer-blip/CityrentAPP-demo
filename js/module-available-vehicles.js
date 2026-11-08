// ════════════════════════════════════════════════════════════════════
// MODULE : AVAILABLE VEHICLES  (position 1 dans le menu principal)
// ────────────────────────────────────────────────────────────────────
// • Affiche TOUS les vehicules disponibles, TOUTES branches (Barka
//   + Moebela ensembles).  La branche est indiquee sur chaque carte
//   par un badge couleur (bleu = Barka, violet = Moebela).
// • Detection "disponible" : meme logique que Fleet Database :
//     - OUT  si DB.rentals  a un enregistrement sans dateIn
//            (par vehicleId ou par plate)
//     - OUT  si DB.moves    a un mouvement sans dateIn
//     - sinon AVAILABLE
// • Mulkiya  => v.mulkiya      (meme champ que Fleet / Dashboard)
// • Ministry => v.ministryExp  (meme champ que Fleet / Dashboard)
// • Aucune modification de donnees (module lecture seule).
// ════════════════════════════════════════════════════════════════════

// ── Event delegation for data-avail-action buttons ──
(function() {
  document.addEventListener('click', function(e) {
    const btn = e.target.closest('[data-avail-action]');
    if (!btn) return;
    e.preventDefault();
    const action = btn.dataset.availAction;
    if (action === 'setPubBranch') {
      const plate = btn.dataset.plate;
      const location = btn.dataset.location;
      _availSetPubBranch(plate, location);
    }
  });
})();

/* ── helpers internes ─────────────────────────────────────────── */

function _availIsOut(v) {
  var vPlate = (v.plate || '').toLowerCase();
  // Utilise DB.kmHistory (TOUJOURS toutes branches, voir server.js dbLoad) au
  // lieu de DB.rentals (filtré par branche pour les comptes Barka/Moebela).
  // Sinon une voiture sortie via un contrat de l'AUTRE agence apparaît
  // "disponible" à tort en session de branche.
  var rentalSource = (DB.kmHistory && DB.kmHistory.length) ? DB.kmHistory : DB.rentals;
  var rented = rentalSource.some(function(r) {
    if (r.dateIn && r.dateIn !== '') return false;
    if (r.vehicleId === v.id) return true;
    var rp = (r._plate || r.plate || '').toLowerCase();
    return rp && rp === vPlate;
  });
  if (rented) return true;
  var moved = (DB.moves || []).some(function(m) {
    return !m.dateIn && extractPlateNum(m.plate) === extractPlateNum(vPlate);
  });
  return moved;
}

// Voiture retenue par une demande de booking en attente/confirmée mais pas
// encore convertie en contrat (statut 'pending' ou 'confirmed' dans
// DB.bookings). MÊME logique que heldByBookingPlates côté serveur
// (/booking-catalog) — sans ce check, une voiture réservée sur le site
// public restait comptée "disponible" ici alors qu'elle avait disparu de
// la page booking, d'où l'écart de nombre entre les deux menus.
//
// EXPIRATION 48H : une demande 'pending' (en attente de paiement) non
// traitée depuis plus de 48h ne bloque plus la voiture — elle redevient
// disponible partout, mais reste visible dans Booking → Demandes pour que
// l'admin la traite/supprime. Une demande 'confirmed' (déjà payée) bloque
// toujours, sans limite de temps, jusqu'à conversion ou annulation.
var AVAIL_BOOKING_HOLD_EXPIRY_MS = 48 * 60 * 60 * 1000; // 48h

function _availIsBooked(v) {
  var vPlate = extractPlateNum(v.plate || '');
  var now = Date.now();
  return (DB.bookings || []).some(function(b) {
    if (extractPlateNum(b.plate || '') !== vPlate) return false;
    if (b.status === 'confirmed') return true;
    if (b.status !== 'pending') return false;
    var created = Date.parse(b.createdAt || '');
    if (isNaN(created)) return true; // pas de date → on garde le blocage par sécurité
    return (now - created) < AVAIL_BOOKING_HOLD_EXPIRY_MS;
  });
}

function _availFmt(str) {
  if (!str) return null;
  var m = String(str).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? (m[3] + '/' + m[2] + '/' + m[1]) : str;
}

function _availDays(dateStr) {
  if (!dateStr) return null;
  return Math.round((new Date(dateStr) - new Date()) / 86400000);
}

function _availBranch(raw) {
  var b = (raw || '').toLowerCase();
  if (b.indexOf('moebela') !== -1 || b.indexOf('moabela') !== -1 || b.indexOf('mabela') !== -1) {
    return { label: raw || 'Moebela', color: '#7c3aed', bg: 'rgba(124,58,237,.07)', border: 'rgba(124,58,237,.4)', pill: 'rgba(124,58,237,.15)' };
  }
  if (b.indexOf('barka') !== -1) {
    return { label: raw || 'Barka',   color: '#2563eb', bg: 'rgba(37,99,235,.07)',  border: 'rgba(37,99,235,.4)',  pill: 'rgba(37,99,235,.15)'  };
  }
  return { label: raw || 'Unknown',   color: '#64748b', bg: 'rgba(100,116,139,.07)', border: 'rgba(100,116,139,.35)', pill: 'rgba(100,116,139,.12)' };
}

// ── Toggle BARKA/MOEBELA — spécifique à Available Vehicles ─────────────
// Écrit dans DB.bookingCatalog (cat.pubBranch), la MÊME donnée que le
// toggle du Catalogue Booking (répartition d'affichage sur le site public,
// n'affecte JAMAIS v.branch — la vraie branche opérationnelle). Fonction
// volontairement dédiée (pas d'appel à setCatalogPubBranch) pour ne
// toucher à rien côté Booking : elle rafraîchit uniquement cette page.
function _availSetPubBranch(plate, loc) {
  var p = plate.toUpperCase();
  if (!DB.bookingCatalog) DB.bookingCatalog = [];
  var existing = DB.bookingCatalog.find(function(c){ return (c.plate||'').toUpperCase() === p; });
  if (existing) {
    existing.pubBranch = (existing.pubBranch === loc) ? '' : loc;
    if (!existing.id) existing.id = (typeof _genId === 'function') ? _genId() : Date.now();
  } else {
    existing = { id: (typeof _genId === 'function') ? _genId() : Date.now(), plate: p, publicPrice: 0, photoUrl: '', visible: false, model: '', type: 'Sedan', pubBranch: loc };
    DB.bookingCatalog.push(existing);
  }
  if (typeof saveOne === 'function') saveOne('booking_catalog', existing, '📍 ' + p + ' → ' + (existing.pubBranch || 'unassigned'));
  renderAvailableVehicles();
}

// ── Filtre BARKA/MOEBELA (boutons du header) ────────────────────────
// Filtre les cartes affichées selon le pubBranch assigné via le toggle
// _availSetPubBranch (même donnée que DB.bookingCatalog, PAS v.branch).
// Cliquer à nouveau sur le même bouton retire le filtre (toggle on/off).
var _availPubBranchFilter = '';

function _availSetPubBranchFilter(loc) {
  _availPubBranchFilter = (_availPubBranchFilter === loc) ? '' : loc;
  renderAvailableVehicles();
}

// ── Recherche texte (nom / plaque) ──────────────────────────────────
var _availSearchQuery = '';

function _availSetSearchQuery(q) {
  _availSearchQuery = (q || '').trim().toLowerCase();
  renderAvailableVehicles();
}

function _updateAvailFilterBtns() {
  var bA = document.getElementById('avail-filter-all');
  var bB = document.getElementById('avail-filter-barka');
  var bM = document.getElementById('avail-filter-moebela');
  if (bA) {
    var onA = !_availPubBranchFilter;
    bA.style.background = onA ? 'var(--s1)' : 'transparent';
    bA.style.color      = onA ? 'var(--text)' : 'var(--muted)';
    bA.style.boxShadow  = onA ? '0 1px 3px rgba(0,0,0,.12)' : 'none';
  }
  if (bB) {
    var onB = _availPubBranchFilter === 'BARKA';
    bB.style.background = onB ? '#2563eb' : 'transparent';
    bB.style.color      = onB ? '#fff' : '#2563eb';
    bB.style.boxShadow  = onB ? '0 1px 3px rgba(37,99,235,.4)' : 'none';
  }
  if (bM) {
    var onM = _availPubBranchFilter === 'MOEBELA';
    bM.style.background = onM ? '#7c3aed' : 'transparent';
    bM.style.color      = onM ? '#fff' : '#7c3aed';
    bM.style.boxShadow  = onM ? '0 1px 3px rgba(124,58,237,.4)' : 'none';
  }
}

/* Badge document : meme code-couleur que Fleet Database */
function _availDocBadge(dateStr, label, icon) {
  var days = _availDays(dateStr);
  var fmt  = _availFmt(dateStr);

  var cellOpen = '<div style="background:var(--s2);border-radius:7px;padding:7px 9px;flex:1;min-width:0">'
               + '<div style="font-size:.63rem;text-transform:uppercase;letter-spacing:.4px;color:var(--muted);font-weight:700;margin-bottom:3px">'
               + icon + ' ' + label + '</div>';

  if (days === null) {
    return cellOpen + '<span style="font-size:.72rem;color:var(--muted);font-weight:600">\u2014</span></div>';
  }

  var s, txt;
  if (days <= 0) {
    s   = 'background:rgba(239,68,68,.18);color:#dc2626;border:1px solid rgba(239,68,68,.4)';
    txt = '\u26a0\ufe0f ' + fmt + ' ' + translate('avail.expired');
  } else if (days <= 30) {
    s   = 'background:rgba(239,68,68,.13);color:#dc2626;border:1px solid rgba(239,68,68,.35)';
    txt = '\u26a0\ufe0f ' + fmt + ' (' + days + 'd)';
  } else if (days <= 90) {
    s   = 'background:rgba(234,179,8,.13);color:#b45309;border:1px solid rgba(234,179,8,.4)';
    txt = '\ud83d\udfe1 ' + fmt;
  } else {
    s   = 'background:rgba(22,163,74,.12);color:#15803d;border:1px solid rgba(22,163,74,.35)';
    txt = '\u2713 ' + fmt;
  }

  return cellOpen
    + '<span style="font-size:.68rem;font-weight:700;border-radius:8px;padding:2px 7px;'
    + 'display:inline-block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'
    + s + '">' + txt + '</span></div>';
}

/* ── Rendu principal ──────────────────────────────────────────── */

function renderAvailableVehicles() {
  ensurePageLoaded('available');

  /* Toutes les branches — pas de filtre de disponibilité.
     Une voiture retenue par une demande de booking (pending/confirmed) reste
     affichée ici (elle n'est ni louée ni en mouvement) mais est marquée
     "🔒 BOOKED" et exclue du compteur, pour que le total concorde avec le
     nombre affiché sur la page booking publique. */
  var available = (DB.vehicles || []).filter(function(v) { return !_availIsOut(v); });
  var freeCount = available.filter(function(v) { return !_availIsBooked(v); }).length;

  /* Filtre BARKA/MOEBELA (boutons du header) — compare au pubBranch
     assigné via le toggle de chaque carte (DB.bookingCatalog), PAS v.branch */
  if (_availPubBranchFilter) {
    available = available.filter(function(v) {
      var p   = (v.plate || '').toUpperCase();
      var cat = (DB.bookingCatalog || []).find(function(c) { return (c.plate || '').toUpperCase() === p; });
      return cat && cat.pubBranch === _availPubBranchFilter;
    });
  }

  /* Filtre recherche texte (nom ou plaque) */
  if (_availSearchQuery) {
    available = available.filter(function(v) {
      var name  = (v.name  || '').toLowerCase();
      var plate = (v.plate || '').toLowerCase();
      return name.indexOf(_availSearchQuery) !== -1 || plate.indexOf(_availSearchQuery) !== -1;
    });
  }

  /* Tri : Barka d'abord, puis Moebela, puis nom vehicule */
  available = available.slice().sort(function(a, b) {
    var ba = _availBranch(a.branch).label.toLowerCase();
    var bb = _availBranch(b.branch).label.toLowerCase();
    if (ba !== bb) return ba.localeCompare(bb);
    return (a.name || '').localeCompare(b.name || '');
  });

  /* Badge dans la sidebar */
  var navBadge = document.getElementById('avail-nav-badge');
  if (navBadge) {
    navBadge.textContent    = freeCount;
    navBadge.style.display  = freeCount > 0 ? '' : 'none';
  }

  var countEl = document.getElementById('avail-count');
  if (countEl) countEl.textContent = freeCount + ' ' + (freeCount === 1 ? translate('avail.vehicle') : translate('avail.vehicles'))
    + (freeCount !== available.length ? ' (' + (available.length - freeCount) + ' ' + translate('avail.booked') + ')' : '');

  _updateAvailFilterBtns();

  var grid = document.getElementById('avail-grid');
  if (!grid) return;

  if (available.length === 0) {
    var emptyMsg = _availSearchQuery
      ? translate('avail.noMatch') + ' "' + _availSearchQuery + '"'
      : _availPubBranchFilter
      ? translate('avail.noneAssigned') + ' ' + _availPubBranchFilter + ' ' + translate('avail.onPublicSite')
      : translate('avail.noAvailable');
    var emptySub = _availSearchQuery
      ? translate('avail.tryDifferent')
      : _availPubBranchFilter
      ? translate('avail.useToggle') + ' ' + _availPubBranchFilter
      : translate('avail.allRentedOrMoving');
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--muted)">'
      + '<div style="font-size:3rem;margin-bottom:12px">\ud83c\udd7f\ufe0f</div>'
      + '<div style="font-size:1.1rem;font-weight:600;margin-bottom:6px">' + emptyMsg + '</div>'
      + '<div style="font-size:.85rem">' + emptySub + '</div></div>';
    return;
  }

  // PERF (2026-09) : index construit UNE FOIS (O(historique)) au lieu de
  // rescanner tout l'historique à chaque véhicule affiché — voir
  // _buildKmIndex() dans module-service-km.js.
  var _kmIdx = (typeof _buildKmIndex === 'function') ? _buildKmIndex() : null;

  grid.innerHTML = available.map(function(v) {

    var vBadge = getVehicleBadgeStyle(v.name);
    var br     = _availBranch(v.branch);
    var isBooked = _availIsBooked(v);

    /* Toggle BARKA/MOEBELA — répartition site public (voir _availSetPubBranch) */
    var _plateUp = (v.plate||'').toUpperCase();
    var _cat = (DB.bookingCatalog||[]).find(function(c){ return (c.plate||'').toUpperCase() === _plateUp; });
    var _pubBranch = _cat ? (_cat.pubBranch || '') : '';
    var pubBranchToggle = '<div style="display:flex;gap:4px" title="' + translate('avail.pubDistribution') + '">'
      + '<button type="button" data-avail-action="setPubBranch" data-plate="' + _plateUp + '" data-location="BARKA" style="padding:2px 10px;font-size:.7rem;font-weight:800;border-radius:20px;cursor:pointer;border:1.5px solid #2563eb;background:' + (_pubBranch==='BARKA' ? '#2563eb' : 'transparent') + ';color:' + (_pubBranch==='BARKA' ? '#fff' : '#2563eb') + '">\ud83c\udfe2 BARKA</button>'
      + '<button type="button" data-avail-action="setPubBranch" data-plate="' + _plateUp + '" data-location="MOEBELA" style="padding:2px 10px;font-size:.7rem;font-weight:800;border-radius:20px;cursor:pointer;border:1.5px solid #ea580c;background:' + (_pubBranch==='MOEBELA' ? '#ea580c' : 'transparent') + ';color:' + (_pubBranch==='MOEBELA' ? '#fff' : '#ea580c') + '">\ud83c\udfe2 MOEBELA</button>'
      + '</div>';

    /* KM effectif */
    var todayKm  = (typeof getEffectiveKm === 'function') ? getEffectiveKm(v, _kmIdx) : (v.todayKm || 0);
    var targetKm = v.svcKm || 0;

    /* Barre de progression — MÊME formule que Service & KM (getServiceInterval +
       % restant sur l'intervalle de vidange), pour que la même voiture affiche
       toujours la même couleur sur les deux pages. L'ancien calcul (km actuel /
       km cible) donnait presque toujours ~99% — donc rouge — même quand il
       restait des milliers de km avant la vidange. */
    var svcInterval = (typeof getServiceInterval === 'function') ? getServiceInterval(v) : 8000;
    var kmLeft   = targetKm > 0 ? Math.round(targetKm - todayKm) : 0;
    var pct      = (targetKm > 0 && svcInterval > 0)
      ? Math.max(0, Math.min(100, Math.round(kmLeft / svcInterval * 100)))
      : 0;
    var barColor = pct<=0 ? '#ef4444' : pct<=20 ? '#f97316' : pct<=50 ? '#eab308' : '#22c55e';
    var topColor = targetKm > 0 ? barColor : br.color;

    /* Badge urgence KM */
    var urgBadge;
    if (targetKm <= 0) {
      urgBadge = '<span style="font-size:.67rem;color:var(--muted);font-weight:600">' + translate('avail.noTargetSet') + '</span>';
    } else if (kmLeft <= 0) {
      urgBadge = '<span style="background:#ef4444;color:#fff;font-size:.64rem;font-weight:800;padding:3px 8px;border-radius:20px">' + translate('avail.serviceDue') + '</span>';
    } else if (kmLeft < 1000) {
      urgBadge = '<span style="background:#f97316;color:#fff;font-size:.64rem;font-weight:700;padding:3px 8px;border-radius:20px">' + kmLeft.toLocaleString() + ' ' + translate('avail.kmLeft') + '</span>';
    } else {
      urgBadge = '<span style="background:rgba(22,163,74,.13);color:var(--green);border:1px solid rgba(22,163,74,.35);font-size:.64rem;font-weight:700;padding:3px 8px;border-radius:20px">\u2714 ' + kmLeft.toLocaleString() + ' ' + translate('avail.kmLeft') + '</span>';
    }

    var progBar = targetKm > 0
      ? '<div style="background:var(--border);border-radius:4px;height:5px;overflow:hidden;margin-top:7px">'
        + '<div style="width:' + pct + '%;background:' + barColor + ';height:5px;border-radius:4px;transition:width .3s"></div></div>'
      : '';

    /* Docs */
    var mulkBadge = _availDocBadge(v.mulkiya,     translate('avail.mulkiya'),  '\ud83d\udccb');
    var minBadge  = _availDocBadge(v.ministryExp, translate('avail.ministry'), '\ud83c\udfd7\ufe0f');

    /* Border rouge si doc expire dans moins de 30 j */
    var md = _availDays(v.mulkiya);
    var nd = _availDays(v.ministryExp);
    if ((md !== null && md <= 30) || (nd !== null && nd <= 30)) topColor = '#ef4444';
    if (isBooked) topColor = '#f97316';

    var kmDisp   = todayKm ? Number(todayKm).toLocaleString() : '\u2014';
    var kmSuffix = targetKm > 0 ? ' / ' + targetKm.toLocaleString() + ' ' + translate('avail.target') : '';

    // Badge d'en-tête — reflète maintenant la sélection du toggle BARKA/MOEBELA
    // ci-dessus (au lieu de v.branch, qui pouvait afficher "shared" ou une
    // valeur non désirée à cet endroit).
    var headerBadge = _pubBranch === 'BARKA'
      ? '<span style="margin-left:auto;background:rgba(37,99,235,.15);color:#2563eb;border:1px solid rgba(37,99,235,.4);border-radius:20px;padding:2px 10px;font-size:.72rem;font-weight:700;flex-shrink:0">\ud83c\udfe2 BARKA</span>'
      : _pubBranch === 'MOEBELA'
      ? '<span style="margin-left:auto;background:rgba(124,58,237,.15);color:#7c3aed;border:1px solid rgba(124,58,237,.4);border-radius:20px;padding:2px 10px;font-size:.72rem;font-weight:700;flex-shrink:0">\ud83c\udfe2 MOEBELA</span>'
      : '<span style="margin-left:auto;background:rgba(100,116,139,.12);color:#64748b;border:1px solid rgba(100,116,139,.35);border-radius:20px;padding:2px 10px;font-size:.72rem;font-weight:700;flex-shrink:0">' + translate('avail.unassigned') + '</span>';

    return '<div style="background:var(--s1);border:1.5px solid ' + br.border + ';border-top:3px solid ' + topColor + ';border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.06);transition:box-shadow .2s,transform .15s"'
      + ' onmouseover="this.style.boxShadow=\'0 4px 16px rgba(0,0,0,.12)\';this.style.transform=\'translateY(-1px)\'"'
      + ' onmouseout="this.style.boxShadow=\'0 1px 4px rgba(0,0,0,.06)\';this.style.transform=\'translateY(0)\'">'

      /* ── Toggle répartition site public ── */
      + '<div style="padding:8px 14px 0">' + pubBranchToggle + '</div>'

      /* ── Header ── */
      + '<div style="padding:10px 14px;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--border);flex-wrap:wrap;background:' + br.bg + '">'
      +   '<span class="badge" style="' + vBadge + ';font-size:.82rem;font-weight:700;flex-shrink:0">' + escapeHtml(v.name) + '</span>'
      +   '<span style="font-family:var(--mono);font-weight:700;font-size:.9rem;color:var(--text)">' + escapeHtml(v.plate) + '</span>'
      +   (isBooked ? '<span style="background:#f97316;color:#fff;font-size:.68rem;font-weight:800;padding:2px 9px;border-radius:20px;flex-shrink:0">' + translate('avail.booked2') + '</span>' : '')
      + '</div>'

      /* ── Body ── */
      + '<div style="padding:12px 14px;display:flex;flex-direction:column;gap:9px">'

        /* Odometer */
      +   '<div style="background:var(--s2);border-radius:8px;padding:10px 12px">'
      +     '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px">'
      +       '<span style="font-size:.67rem;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.4px">' + translate('avail.odometer') + '</span>'
      +       urgBadge
      +     '</div>'
      +     '<div style="display:flex;align-items:baseline;gap:4px">'
      +       '<span style="font-family:var(--mono);font-weight:800;font-size:1.05rem;color:var(--text)">' + kmDisp + '</span>'
      +       '<span style="font-size:.72rem;color:var(--muted)">km' + kmSuffix + '</span>'
      +     '</div>'
      +     progBar
      +   '</div>'

        /* Mulkiya + Ministry */
      +   '<div style="display:flex;gap:7px">' + mulkBadge + minBadge + '</div>'

      + '</div>'
      + '</div>';
  }).join('');
}
