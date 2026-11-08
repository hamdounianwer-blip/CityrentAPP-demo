// ═══════════════════════════════════════════════════════════════════════
// MODULE BOOKING — gestion admin des réservations publiques
// ───────────────────────────────────────────────────────────────────────
// Sécurité ID/branche (voir discussion) :
// - DB.bookings est un espace d'ID totalement séparé de DB.rentals/DB.moves.
// - Les branches utilisées sont toujours 'BARKA' / 'MOEBELA' (mêmes valeurs
//   exactes que le reste de l'app — jamais de variante inventée ici).
// - La conversion booking → location réelle N'EST PAS un nouveau bout de
//   code métier : elle appelle openAddRental() (déjà existant, déjà
//   éprouvé, génère déjà le n° de contrat sans collision) et se contente
//   de pré-remplir les champs. Le clic "Save" final reste le vrai bouton
//   Daily Rentals — aucune duplication de logique de création d'ID.
// ═══════════════════════════════════════════════════════════════════════

let _bookingTab = 'requests'; // 'requests' | 'all' | 'catalog'
let _catSearch = '';          // recherche catalogue (nom/plaque)
let _catStatusFilter = 'all'; // 'all' | 'visible' | 'hidden'

// ── Anti-course upload photo / save manuel ─────────────────────────────
// Bug corrigé : si l'utilisateur clique "Save" (ou change Type/Model) PENDANT
// qu'une photo est en train d'uploader pour la même plaque, deux requêtes
// /save-one partent en même temps pour la même plaque — l'une avec photoUrl
// vide (lue avant la fin de l'upload), l'autre avec la bonne photo. Si la
// requête "vide" arrive au serveur APRÈS celle avec la photo, elle écrase la
// bonne photo par du vide en base — alors que le fichier existe bien sur le
// disque. D'où l'effet observé : photo "disparue" côté admin alors qu'elle
// est toujours dans D:\DOSSIER-DEMO\Catalogue Booking.
// Fix : pendant qu'une plaque est en upload, toute tentative de sauvegarde
// pour CETTE plaque est mise en attente (_catPendingResave) au lieu d'être
// envoyée tout de suite, et rejouée automatiquement juste après la fin de
// l'upload (succès ou échec) — donc plus jamais deux requêtes concurrentes.
const _catUploadBusy = new Set();
const _catPendingResave = new Set();

function renderBooking(){
  if(!DB.bookings) DB.bookings = [];
  updateBookingBadge();
  let container = document.getElementById('page-booking');
  if(!container) return;
  let host = container.querySelector('#booking-host');
  if(!host) return; // template pas encore hydraté correctement

  let _pendingCount = (DB.bookings||[]).filter(b => b.status === 'pending' || b.status === 'confirmed').length;
  let _pendingBadge = _pendingCount > 0 ? ` <span style="background:#f59e0b;color:#fff;border-radius:20px;padding:0 7px;font-size:.7rem;font-weight:800;margin-left:3px;vertical-align:middle">${_pendingCount}</span>` : '';

  host.innerHTML = `
    <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap">
      <button class="btn ${_bookingTab==='requests'?'btn-primary':'btn-ghost'}" data-bk-action="set-tab" data-bk-tab="requests">📩 ${translate('bk.requests')}${_pendingBadge}</button>
      <button class="btn ${_bookingTab==='all'?'btn-primary':'btn-ghost'}" data-bk-action="set-tab" data-bk-tab="all">🧾 ${translate('bk.allRequests')}</button>
      <button class="btn ${_bookingTab==='catalog'?'btn-primary':'btn-ghost'}" data-bk-action="set-tab" data-bk-tab="catalog">🖼️ ${translate('bk.catalog')}</button>
      <button class="btn btn-ghost" data-bk-action="show-link" style="margin-left:auto">🔗 ${translate('bk.linkQr')}</button>
    </div>
    <div id="booking-tab-body"></div>
  `;
  renderBookingTabBody();
}

function setBookingTab(tab){ _bookingTab = tab; renderBookingTabBody(); }

// ── Statut réel disponible/sorti pour le Catalogue Booking ────────────
// Source UNIQUE : réutilise _availIsOut() (définie dans
// module-available-vehicles.js, chargé AVANT ce fichier — voir app.html).
// Aucune logique dupliquée ici volontairement : si la détection de
// disponibilité doit évoluer un jour, on la corrige à un seul endroit et
// Booking + Available Vehicles restent garantis synchronisés.
function _bookingIsOut(v){
  if (typeof _availIsOut === 'function') return _availIsOut(v);
  // Filet de sécurité si le module Available Vehicles n'est pas chargé
  console.warn('[Booking] _availIsOut introuvable — module-available-vehicles.js absent ?');
  return false;
}

// Voiture retenue par une demande de booking pending/confirmed (pas encore
// convertie en contrat). Réutilise _availIsBooked (module-available-vehicles.js)
// — même source unique que _bookingIsOut ci-dessus, pour que le chip "Available"
// ici, le compteur du module Available Vehicles, et la page publique
// /booking-catalog affichent TOUJOURS le même nombre.
function _bookingIsHeld(v){
  if (typeof _availIsBooked === 'function') return _availIsBooked(v);
  return false;
}

function renderBookingTabBody(){
  let el = document.getElementById('booking-tab-body');
  if(!el) return;
  if(_bookingTab === 'requests') renderBookingRequests(el);
  else if(_bookingTab === 'all') renderBookingAll(el);
  else renderBookingCatalog(el);
}

function updateBookingBadge(){
  let n = (DB.bookings||[]).filter(b => b.status === 'pending').length;
  let badge = document.getElementById('booking-badge');
  if(badge){ badge.textContent = n; badge.style.display = n>0 ? 'inline-flex' : 'none'; }
}

// ── Onglet Demandes ──────────────────────────────────────────────────
// Présentation en cartes (même langage visuel que le Catalogue public) :
// photo du véhicule (reprise du catalogue via la plaque), badge de statut,
// infos client/véhicule/prix, et bouton Quittance dès que le paiement est reçu.
function renderBookingRequests(el){
  // Seulement les demandes actives à traiter (pending + confirmed non encore converties)
  let list = (DB.bookings||[])
    .filter(b => b.status === 'pending' || b.status === 'confirmed')
    .slice().sort((a,b)=> (b.createdAt||'').localeCompare(a.createdAt||''));
  if(!list.length){
    el.innerHTML = `<div style="padding:50px 20px;text-align:center;color:var(--muted)">
      <div style="font-size:2.5rem;margin-bottom:12px">📭</div>
      <div style="font-size:1rem;font-weight:600;color:var(--text);margin-bottom:6px">${translate('bk.noPending')}</div>
      <div style="font-size:.82rem">${translate('bk.convertedNote')} <b>🧾 ${translate('bk.allRequests')}</b></div>
    </div>`;
    return;
  }
  el.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px">` +
    list.map(b => bookingRequestCardHtml(b)).join('') + `</div>`;
}

// ── Onglet Toutes les demandes — historique complet ──────────────────
function renderBookingAll(el){
  let list = (DB.bookings||[]).slice().sort((a,b)=> (b.createdAt||'').localeCompare(a.createdAt||''));
  if(!list.length){
    el.innerHTML = '<div style="padding:30px;text-align:center;color:var(--muted)">'+translate('bk.noBookingsReceived')+'</div>';
    return;
  }

  // Compteurs par statut pour l'entête
  let counts = { pending:0, confirmed:0, converted:0, cancelled:0 };
  list.forEach(b => {
    if(b.status==='pending') counts.pending++;
    else if(b.status==='confirmed') counts.confirmed++;
    else if(b.status==='converted') counts.converted++;
    else counts.cancelled++;
  });

  el.innerHTML = `
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">
      ${counts.pending   ? `<span style="background:rgba(245,158,11,.12);color:#f59e0b;border:1.5px solid rgba(245,158,11,.35);border-radius:20px;padding:4px 12px;font-size:.78rem;font-weight:700">⏳ ${translate('bk.pendingCount')} : ${counts.pending}</span>` : ''}
      ${counts.confirmed ? `<span style="background:rgba(34,197,94,.12);color:#22c55e;border:1.5px solid rgba(34,197,94,.35);border-radius:20px;padding:4px 12px;font-size:.78rem;font-weight:700">✅ ${translate('bk.confirmedCount')} : ${counts.confirmed}</span>` : ''}
      ${counts.converted ? `<span style="background:rgba(96,165,250,.12);color:#60a5fa;border:1.5px solid rgba(96,165,250,.35);border-radius:20px;padding:4px 12px;font-size:.78rem;font-weight:700">🔑 ${translate('bk.convertedCount')} : ${counts.converted}</span>` : ''}
      ${counts.cancelled ? `<span style="background:var(--s2);color:var(--muted);border:1.5px solid var(--border);border-radius:20px;padding:4px 12px;font-size:.78rem;font-weight:700">🗑️ ${translate('bk.cancelledCount')} : ${counts.cancelled}</span>` : ''}
      <span style="margin-left:auto;color:var(--muted);font-size:.8rem;align-self:center">${list.length} ${translate('bk.total')}</span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px">
      ${list.map(b => bookingRequestCardHtml(b)).join('')}
    </div>`;
}

// ── Total réel d'une réservation ───────────────────────────────────────
// FIX (2026-08) : le total affiché partout ici était recalculé "à la main"
// (days * publicPrice), ce qui IGNORE les extras (addons) choisis par le
// client sur le site public — déjà inclus dans b.total au moment de la
// soumission (voir /booking-submit, server.js). Résultat avant ce fix :
// total sous-évalué sur la carte, le popup de confirmation, le reçu écran/
// imprimé, le log, et le calcul du "reste à payer" en cas de paiement
// partiel. On utilise maintenant b.total en priorité (source unique, déjà
// vérifiée côté serveur), avec un repli sur days*publicPrice uniquement
// pour d'anciennes réservations sauvegardées avant l'ajout de ce champ.
function _bookingRealTotal(b){
  let t = Number(b.total);
  if (t > 0) return t;
  return (Number(b.days)||0) * (Number(b.publicPrice)||0);
}

// Libellé lisible de la liste d'extras (addons) demandés par le client, ou '' si aucun.
function _bookingAddonsLabel(b){
  let list = Array.isArray(b.addons) ? b.addons : [];
  if(!list.length) return '';
  return list.map(a => escBk(String(a))).join(', ');
}

// Retrouve la photo enregistrée dans le catalogue public pour une plaque donnée.
function findBookingVehiclePhoto(plate){
  let p = String(plate||'').toUpperCase();
  if(!p) return '';
  let cat = (DB.bookingCatalog||[]).find(c => (c.plate||'').toUpperCase() === p);
  return (cat && cat.photoUrl) ? cat.photoUrl : '';
}

// Une demande 'pending' de plus de 48h ne bloque plus la voiture côté
// public/Available Vehicles (voir _availIsBooked) — même seuil ici pour
// afficher un badge cohérent dans Demandes.
var BOOKING_HOLD_EXPIRY_MS = 48 * 60 * 60 * 1000;
function _bookingHoldExpired(b){
  if (b.status !== 'pending') return false;
  var created = Date.parse(b.createdAt || '');
  if (isNaN(created)) return false;
  return (Date.now() - created) >= BOOKING_HOLD_EXPIRY_MS;
}

function bookingRequestCardHtml(b){
  let expired = _bookingHoldExpired(b);
  let statusInfo = expired
    ? { label:translate('bk.expiredReleased'), color:'#94a3b8' }
    : b.status === 'pending'
    ? { label:translate('bk.awaitingPayment'), color:'#f59e0b' }
    : b.status === 'confirmed'
    ? { label:translate('bk.paidToConvert'), color:'#22c55e' }
    : { label:translate('bk.convertedToRental'), color:'#60a5fa' };
  let branchColor = b.branch === 'BARKA' ? '#2563eb' : '#ea580c';
  let pickupTxt = b.pickupMode === 'delivery' ? ('🚚 ' + translate('bk.delivery') + ' — ' + escBk(b.deliveryAddress||'—')) : '🏢 ' + translate('bk.officePickup');
  let photo = findBookingVehiclePhoto(b.plate);
  let days = Number(b.days)||0, price = Number(b.publicPrice)||0, total = _bookingRealTotal(b);
  let addonsLabel = _bookingAddonsLabel(b);
  let isPaid = b.status === 'confirmed' || b.status === 'converted';
  let partialAmount = Number(b.partialAmount)||0;
  let remaining = Math.max(0, total - partialAmount);
  let partialHtml = b.partial
    ? `<div style="margin-top:8px;background:rgba(217,119,6,.12);border:1.5px solid rgba(217,119,6,.4);border-radius:8px;padding:7px 10px">
        <div style="font-weight:800;color:#d97706;font-size:.78rem">${translate('bk.partialPayment')}${b.partialMode==='percent' ? ' (' + (Number(b.partialValue)||0) + '%)' : ''}</div>
        <div style="font-size:.78rem;color:var(--text);margin-top:2px">${translate('bk.paidLabel')} : <b>${partialAmount} OMR</b> — ${translate('bk.remaining')} : <b>${remaining} OMR</b></div>
      </div>`
    : '';

  return `<div style="background:var(--s1);border:1px solid var(--border);border-radius:12px;overflow:hidden;border-top:3px solid ${statusInfo.color};box-shadow:0 1px 4px rgba(0,0,0,.06);transition:box-shadow .2s,transform .15s"
    onmouseover="this.style.boxShadow='0 4px 16px rgba(0,0,0,.12)';this.style.transform='translateY(-1px)'"
    onmouseout="this.style.boxShadow='0 1px 4px rgba(0,0,0,.06)';this.style.transform='translateY(0)'">

    <!-- Photo véhicule -->
    <div style="height:140px;background:var(--s2);display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative">
      ${photo ? `<img src="${escBk(photo)}" alt="${escBk(b.vehicleName||'')}" style="width:100%;height:100%;object-fit:cover" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'🚗',style:'font-size:2.4rem'}))">` : `<span style="font-size:2.4rem">🚗</span>`}
      <div style="position:absolute;top:8px;left:8px"><span style="background:rgba(0,0,0,.55);color:#fff;border-radius:20px;padding:3px 10px;font-size:.7rem;font-weight:800;backdrop-filter:blur(2px);font-family:var(--mono)">📋 #${escBk(b.id)}</span></div>
      <div style="position:absolute;top:8px;right:8px"><span style="background:${statusInfo.color}22;color:${statusInfo.color};border:1.5px solid ${statusInfo.color}77;border-radius:20px;padding:3px 10px;font-size:.7rem;font-weight:800;backdrop-filter:blur(2px)">${statusInfo.label}</span></div>
    </div>

    <!-- Client -->
    <div style="padding:12px 14px 2px">
      <div style="font-weight:800;color:var(--text);font-size:1rem">${escBk(b.name)}</div>
      <div style="font-size:.8rem;color:var(--muted);margin-top:1px">📞 ${escBk(b.tel)}</div>
      ${(b.licenseNumber || b.licenseExpiry) ? `
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:6px;padding:5px 9px;background:rgba(37,99,235,.07);border:1px solid rgba(37,99,235,.2);border-radius:7px">
        ${b.licenseNumber ? `<span style="font-size:.76rem;font-weight:700;color:#2563eb;font-family:var(--mono)">🪪 ${escBk(b.licenseNumber)}</span>` : ''}
        ${b.licenseNumber && b.licenseExpiry ? `<span style="color:var(--border2)">·</span>` : ''}
        ${b.licenseExpiry ? (()=>{ let exp=new Date(b.licenseExpiry); let ok=!isNaN(exp)&&exp>=new Date(); return `<span style="font-size:.76rem;font-weight:700;color:${ok?'#16a34a':'#dc2626'}">${ok?'✅':'⚠️'} ${escBk(b.licenseExpiry)}</span>`; })() : ''}
      </div>` : ''}
    </div>

    <!-- Véhicule -->
    <div style="padding:8px 14px 0;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <span class="badge" style="background:var(--s3);color:var(--text);font-weight:700;font-size:.78rem">${escBk(b.vehicleName||'—')}</span>
      <span style="font-family:var(--mono);font-weight:800;font-size:.82rem;color:#fff;background:#0f172a;border-radius:6px;padding:2px 8px;letter-spacing:.4px">🔑 ${escBk(b.plate||'—')}</span>
      <span style="color:${branchColor};font-weight:700;font-size:.76rem;margin-left:auto">🏢 ${escBk(b.branch||'')}</span>
    </div>

    <!-- Détails -->
    <div style="padding:10px 14px 12px;margin-top:6px;border-top:1px dashed var(--border)">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px 10px;font-size:.8rem;margin-top:10px">
        <div style="color:var(--muted)">${translate('bk.duration')}</div><div style="text-align:right;font-weight:700;color:var(--text)">${days} ${translate('bk.day')}</div>
        <div style="color:var(--muted)">${translate('bk.priceDay')}</div><div style="text-align:right;font-weight:700;color:var(--text)">${price} OMR</div>
        <div style="color:var(--muted)">${translate('bk.estimatedTotal')}</div><div style="text-align:right;font-weight:800;color:var(--green)">${total} OMR</div>
      </div>
      ${addonsLabel ? `<div style="font-size:.76rem;color:var(--text);margin-top:6px">➕ ${addonsLabel}</div>` : ''}
      ${partialHtml}
      <div style="font-size:.76rem;color:var(--muted);margin-top:8px">${pickupTxt}</div>
      <div style="font-size:.7rem;color:var(--dim);margin-top:6px">${translate('bk.receivedOn')} ${fmtDate(b.createdAt)}</div>
    </div>

    <!-- Actions -->
    <div style="display:flex;gap:6px;flex-wrap:wrap;padding:10px 14px 14px;border-top:1px solid var(--border)">
      ${b.status === 'pending' ? `<button class="btn btn-primary" style="padding:6px 12px;font-size:.78rem" data-bk-action="confirm-paid" data-bk-id="${b.id}">${translate('bk.markPaid')}</button>` : ''}
      ${b.status === 'confirmed' ? `<button class="btn btn-primary" style="padding:6px 12px;font-size:.78rem" data-bk-action="convert-rental" data-bk-id="${b.id}">${translate('bk.createRental')}</button>` : ''}
      ${isPaid ? `<button class="btn btn-ghost" style="padding:6px 12px;font-size:.78rem" data-bk-action="show-receipt" data-bk-id="${b.id}">${translate('bk.receipt')}</button>` : ''}
      ${b.status !== 'converted' ? `<button class="btn btn-ghost btn-delete" style="padding:6px 12px;font-size:.78rem" data-bk-action="cancel" data-bk-id="${b.id}">${translate('bk.cancel')}</button>` : ''}
    </div>
  </div>`;
}

function confirmBookingPaid(id){
  let b = (DB.bookings||[]).find(x=>x.id===id);
  if(!b) return;
  if(!confirm(t(translate('bk.confirmTransfer'), b.name, _bookingRealTotal(b)))) return;
  b.status = 'confirmed';
  b.confirmedAt = new Date().toISOString();
  b.confirmedBy = (window.AUTH && window.AUTH.username) || '';
  b.updatedAt = Date.now(); // FIX (2026-08) : protège ce changement de statut contre l'écrasement
  // par un autre poste resté ouvert avec une vieille copie (autosave périodique).
  if(typeof saveOne === 'function') saveOne('bookings', b, '✅ Booking confirmed');
  if(typeof logAction === 'function') logAction('booking_confirmed', '✅ Booking Confirmed', `Customer: ${b.name} | Vehicle: ${b.vehicleName} | Plate: ${b.plate} | Price: ${_bookingRealTotal(b)} OMR`, `BK-${String(b.id).padStart(5,'0')}`);
  renderBookingTabBody(); updateBookingBadge();
}

function cancelBooking(id){
  let b = (DB.bookings||[]).find(x=>x.id===id);
  if(!confirm(translate('bk.confirmCancel'))) return;
  DB.bookings = (DB.bookings||[]).filter(x=>x.id!==id);
  if(typeof deleteOne === 'function') deleteOne('bookings', id, '🗑️ Booking deleted');
  if(typeof logAction === 'function' && b) logAction('booking_cancelled', '❌ Booking Cancelled', `Customer: ${b.name} | Vehicle: ${b.vehicleName} | Plate: ${b.plate} | Status: ${b.status}`, `BK-${String(b.id).padStart(5,'0')}`);
  renderBookingTabBody(); updateBookingBadge();
}

// ── Conversion booking → vraie location ──────────────────────────────
// N'appelle QUE des fonctions déjà existantes et éprouvées (openAddRental).
// Aucun nouvel identifiant/contrat/branche n'est inventé ici.
function convertBookingToRental(id){
  let b = (DB.bookings||[]).find(x=>x.id===id);
  if(!b) return;
  if(typeof openAddRental !== 'function'){ alert(translate('bk.rentalModuleMissing')); return; }

  openAddRental(); // reset complet + n° de contrat auto généré + modal ouvert (code existant, inchangé)

  let setVal = (id,val) => { let el=document.getElementById(id); if(el) el.value = val; };
  setVal('r-vname', b.vehicleName || '');
  setVal('r-plate', b.plate || '');
  setVal('r-tel', b.tel || '');
  setVal('r-price', b.publicPrice || '');
  showToast(translate('bk.formPrefilled'));

  b.status = 'converted';
  b.convertedAt = new Date().toISOString();
  b.updatedAt = Date.now(); // FIX (2026-08) : idem confirmBookingPaid — évite qu'une session
  // périmée renvoie ce booking en 'pending' ou 'confirmed' après coup.
  if(typeof saveOne === 'function') saveOne('bookings', b, null);
  if(typeof logAction === 'function') logAction('booking_converted', '🔑 Booking Converted to Rental', `Customer: ${b.name} | Vehicle: ${b.vehicleName} | Plate: ${b.plate} | Days: ${b.days} | Price: ${_bookingRealTotal(b)} OMR`, `BK-${String(b.id).padStart(5,'0')}`);
  renderBookingTabBody(); updateBookingBadge();
}

// ── Quittance (reçu de paiement) ──────────────────────────────────────
// Disponible dès que la réservation est marquée payée (confirmed) ou déjà
// convertie en location. Réutilise la photo du catalogue public + les
// infos déjà stockées sur la demande — aucune nouvelle donnée requise.
function showBookingReceipt(id){
  let b = (DB.bookings||[]).find(x=>x.id===id);
  if(!b) return;
  let days = Number(b.days)||0, price = Number(b.publicPrice)||0, total = _bookingRealTotal(b);
  let addonsLabel = _bookingAddonsLabel(b);
  let subtotal = days*price;
  let addonsCost = Math.max(0, total - subtotal);
  let photo = findBookingVehiclePhoto(b.plate);
  let receiptNo = 'BK-' + String(b.id).padStart(5,'0');
  let dateStr = fmtDate(b.confirmedAt || b.createdAt);
  let pickupTxt = b.pickupMode === 'delivery' ? (translate('bk.delivery') + ' — ' + escBk(b.deliveryAddress||'—')) : translate('bk.officePickup');

  let existing = document.getElementById('booking-receipt-overlay');
  if(existing) existing.remove();
  let overlay = document.createElement('div');
  overlay.id = 'booking-receipt-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px';
  overlay.onclick = (e) => { if(e.target===overlay) overlay.remove(); };
  overlay.innerHTML = `
    <div style="background:var(--s1);border-radius:14px;max-width:420px;width:100%;box-shadow:var(--shadow-lg);overflow:hidden;max-height:92vh;display:flex;flex-direction:column">
      <div style="padding:22px 24px;overflow-y:auto">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid var(--border);padding-bottom:12px;margin-bottom:14px">
          <div>
            <div style="font-weight:900;font-size:1.1rem;color:var(--text)"><img src="${new URL('logo.png', location.href).href}" alt="City Rent Car" style="height:34px;width:auto;vertical-align:middle"></div>
            <div style="font-size:.72rem;color:var(--muted)">${translate('bk.bookingReceipt')}</div>
          </div>
          <div style="text-align:right">
            <div style="font-family:var(--mono);font-weight:800;font-size:.85rem;color:var(--text)">${receiptNo}</div>
            <div style="font-size:.7rem;color:var(--muted)">${dateStr}</div>
          </div>
        </div>

        ${photo ? `<div style="width:100%;height:130px;border-radius:10px;overflow:hidden;margin-bottom:14px;background:var(--s2)"><img src="${escBk(photo)}" style="width:100%;height:100%;object-fit:cover" onerror="this.parentElement.remove()"></div>` : ''}

        <div style="font-size:.85rem;color:var(--text);display:flex;flex-direction:column;gap:5px">
          <div style="display:flex;justify-content:space-between"><span style="color:var(--muted)">${translate('bk.customer')}</span><span style="font-weight:700">${escBk(b.name)}</span></div>
          <div style="display:flex;justify-content:space-between"><span style="color:var(--muted)">${translate('bk.phone')}</span><span style="font-weight:700">${escBk(b.tel)}</span></div>
          ${b.licenseNumber ? `<div style="display:flex;justify-content:space-between"><span style="color:var(--muted)">${translate('bk.licenseNo')}</span><span style="font-weight:700;font-family:var(--mono)">${escBk(b.licenseNumber)}</span></div>` : ''}
          ${b.licenseExpiry ? (()=>{ let exp=new Date(b.licenseExpiry); let ok=!isNaN(exp)&&exp>=new Date(); return `<div style="display:flex;justify-content:space-between"><span style="color:var(--muted)">${translate('bk.expiry')}</span><span style="font-weight:700;color:${ok?'#22c55e':'#ef4444'}">${ok?'✅':'⚠️'} ${escBk(b.licenseExpiry)}</span></div>`; })() : ''}
          <div style="display:flex;justify-content:space-between"><span style="color:var(--muted)">${translate('bk.vehicle')}</span><span style="font-weight:700">${escBk(b.vehicleName||'')}</span></div>
          <div style="display:flex;justify-content:space-between"><span style="color:var(--muted)">${translate('bk.plate')}</span><span style="font-weight:700">${escBk(b.plate||'')}</span></div>
          <div style="display:flex;justify-content:space-between"><span style="color:var(--muted)">${translate('dir.branch')}</span><span style="font-weight:700">${escBk(b.branch||'')}</span></div>
          <div style="display:flex;justify-content:space-between"><span style="color:var(--muted)">${translate('bk.pickup')}</span><span style="font-weight:700;text-align:right">${pickupTxt}</span></div>
        </div>

        <div style="border-top:1px dashed var(--border);margin:14px 0 0;padding-top:12px">
          <div style="display:flex;justify-content:space-between;font-size:.85rem"><span style="color:var(--muted)">${days} ${translate('bk.day')} × ${price} OMR</span><span style="font-weight:700;color:var(--text)">${subtotal} OMR</span></div>
          ${addonsCost > 0 ? `<div style="display:flex;justify-content:space-between;font-size:.85rem;margin-top:4px"><span style="color:var(--muted)">➕ ${addonsLabel || translate('bk.extras')}</span><span style="font-weight:700;color:var(--text)">${addonsCost} OMR</span></div>` : ''}
          <div style="display:flex;justify-content:space-between;margin-top:6px"><span style="font-weight:800;color:var(--text)">${translate('bk.totalPaid')}</span><span style="font-weight:900;font-size:1.05rem;color:var(--green)">${total} OMR</span></div>
        </div>

        <div style="text-align:center;margin-top:14px">
          <span style="background:rgba(34,197,94,.15);color:#22c55e;border:1.5px solid rgba(34,197,94,.4);border-radius:20px;padding:4px 14px;font-size:.75rem;font-weight:800">${translate('bk.paymentReceivedTransfer')}</span>
        </div>
      </div>

      <div style="display:flex;gap:8px;padding:14px 24px;border-top:1px solid var(--border)">
        <button class="btn btn-primary" style="flex:1" data-bk-action="print-receipt" data-bk-id="${b.id}">${translate('bk.print')}</button>
        <button class="btn btn-ghost" style="flex:1" data-bk-action="close-overlay" data-bk-overlay-id="booking-receipt-overlay">${translate('bk.close')}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

function printBookingReceipt(id){
  let b = (DB.bookings||[]).find(x=>x.id===id);
  if(!b) return;
  let days = Number(b.days)||0, price = Number(b.publicPrice)||0, total = _bookingRealTotal(b);
  let addonsLabel = _bookingAddonsLabel(b);
  let subtotal = days*price;
  let addonsCost = Math.max(0, total - subtotal);
  let photo = findBookingVehiclePhoto(b.plate);
  let receiptNo = 'BK-' + String(b.id).padStart(5,'0');
  let dateStr = fmtDate(b.confirmedAt || b.createdAt);
  let pickupTxt = b.pickupMode === 'delivery' ? (translate('bk.delivery') + ' — ' + escBk(b.deliveryAddress||'—')) : translate('bk.officePickup');

  let win = window.open('', '_blank', 'width=480,height=720');
  if(!win){ showToast(translate('bk.popupBlocked')); return; }
  let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${translate('bk.bookingReceipt')} ${receiptNo}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',Arial,sans-serif;color:#111;padding:26px}
    .hd{display:flex;justify-content:space-between;border-bottom:2px solid #111;padding-bottom:12px;margin-bottom:16px}
    .co{font-weight:900;font-size:18px}
    .sub{font-size:11px;color:#666;margin-top:2px}
    .rn{font-family:'Courier New',monospace;font-weight:700;font-size:13px;text-align:right}
    .dt{font-size:11px;color:#666;text-align:right}
    .photo{width:100%;height:150px;object-fit:cover;border-radius:8px;margin-bottom:16px;background:#eee;display:block}
    .row{display:flex;justify-content:space-between;font-size:13px;padding:4px 0}
    .row span:first-child{color:#666}
    .row span:last-child{font-weight:700;text-align:right}
    .tot{border-top:1px dashed #ccc;margin-top:14px;padding-top:12px}
    .tot .row:last-child{font-size:16px;padding-top:6px}
    .stamp{text-align:center;margin-top:18px;font-weight:800;color:#16a34a;border:1.5px solid #16a34a;border-radius:20px;padding:6px 0;font-size:12px}
    @media print{ @page{ size:A5; margin:12mm } }
  </style></head><body>
    <div class="hd"><div><div class="co"><img src="${new URL('logo.png', location.href).href}" alt="City Rent Car" style="height:34px;width:auto;vertical-align:middle"></div><div class="sub">${translate('bk.bookingReceipt')}</div></div><div><div class="rn">${receiptNo}</div><div class="dt">${dateStr}</div></div></div>
    ${photo ? `<img class="photo" src="${escBk(photo)}">` : ''}
    <div class="row"><span>${translate('bk.customer')}</span><span>${escBk(b.name)}</span></div>
    <div class="row"><span>${translate('bk.phone')}</span><span>${escBk(b.tel)}</span></div>
    ${b.licenseNumber ? `<div class="row"><span>${translate('bk.licenseNo')}</span><span style="font-family:'Courier New',monospace">${escBk(b.licenseNumber)}</span></div>` : ''}
    ${b.licenseExpiry ? (()=>{ let exp=new Date(b.licenseExpiry); let ok=!isNaN(exp)&&exp>=new Date(); return `<div class="row"><span>${translate('bk.expiry')}</span><span style="color:${ok?'#16a34a':'#dc2626'}">${ok?'✅':'⚠️'} ${escBk(b.licenseExpiry)}</span></div>`; })() : ''}
    <div class="row"><span>${translate('bk.vehicle')}</span><span>${escBk(b.vehicleName||'')}</span></div>
    <div class="row"><span>${translate('bk.plate')}</span><span>${escBk(b.plate||'')}</span></div>
    <div class="row"><span>${translate('dir.branch')}</span><span>${escBk(b.branch||'')}</span></div>
    <div class="row"><span>${translate('bk.pickup')}</span><span>${pickupTxt}</span></div>
    <div class="tot">
      <div class="row"><span>${days} ${translate('bk.day')} × ${price} OMR</span><span>${subtotal} OMR</span></div>
      ${addonsCost > 0 ? `<div class="row"><span>➕ ${addonsLabel || translate('bk.extras')}</span><span>${addonsCost} OMR</span></div>` : ''}
      <div class="row"><span>${translate('bk.totalPaid')}</span><span>${total} OMR</span></div>
    </div>
    <div class="stamp">${translate('bk.paymentReceivedTransfer')}</div>
    <script>window.onload=function(){window.print();};<\/script>
  </body></html>`;
  win.document.write(html);
  win.document.close();
}

// ── Onglet Catalogue public (prix + photo par véhicule) ──────────────
// Repris dans le même style "carte" que le menu Fleet (module-fleet-database.js) :
// header sticky avec recherche + bouton Add Vehicle, chips de filtre, grille de cartes.
// Le bouton "＋ Add Vehicle" réutilise openAddVehicle() du module Fleet (déjà existant,
// déjà éprouvé) — aucune nouvelle logique de création de véhicule n'est dupliquée ici.
function renderBookingCatalog(el){
  if(!DB.bookingCatalog) DB.bookingCatalog = [];
  if(!(DB.vehicles||[]).length){ el.innerHTML = '<div style="padding:30px;text-align:center;color:var(--muted)">'+translate('bk.noVehiclesInFleet')+'</div>'; return; }

  el.innerHTML = `
    <div style="font-size:.8rem;color:var(--muted);margin-bottom:14px">${translate('bk.checkVisiblePrice')}</div>
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding-bottom:14px">
      <input class="search-input" placeholder="${translate('bk.searchPlaceholder')}" value="${escBk(_catSearch)}" oninput="filterBookingCatalogDebounced(this.value)" style="min-width:200px">
    </div>
    <div class="filters-row" id="cat-filters" style="padding-bottom:14px;gap:8px;display:flex;flex-wrap:wrap;align-items:center"></div>
    <div id="cat-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px"></div>
  `;
  renderCatalogFiltersAndGrid();
}

// Rebuild uniquement les chips + la grille (jamais la barre de recherche elle-même,
// pour ne pas perdre le focus/curseur pendant la frappe — même logique que Fleet).
function renderCatalogFiltersAndGrid(){
  let filtersEl = document.getElementById('cat-filters');
  let gridEl = document.getElementById('cat-grid');
  if(!filtersEl || !gridEl) return;
  if(!DB.bookingCatalog) DB.bookingCatalog = [];

  let vehicles = (DB.vehicles||[]).slice().sort((a,b)=>(a.name||'').localeCompare(b.name||''));
  let rows = vehicles.map(v => {
    let plate = (v.plate||'').toUpperCase();
    let cat = (DB.bookingCatalog||[]).find(c => (c.plate||'').toUpperCase() === plate) || { plate, publicPrice:'', weeklyPrice:'', monthlyPrice:'', photoUrl:'', visible:false };
    return { v, cat, plate, isOut: _bookingIsOut(v), isHeld: _bookingIsHeld(v) };
  });
  let visibleCount = rows.filter(r => r.cat.visible).length;
  // "Available" = ni sorti (loué/mouvement) ni retenu par une demande de booking
  // en cours — même définition que la page publique, pour que ce chiffre
  // concorde partout (Available Vehicles, ce chip, booking.html).
  let availableCount = rows.filter(r => !r.isOut && !r.isHeld).length;

  let filtered = rows.filter(r => {
    if(_catStatusFilter === 'visible' && !r.cat.visible) return false;
    if(_catStatusFilter === 'hidden' && r.cat.visible) return false;
    if(_catStatusFilter === 'available' && (r.isOut || r.isHeld)) return false;
    if(_catSearch){
      let hay = ((r.v.name||'') + ' ' + r.plate).toLowerCase();
      if(!hay.includes(_catSearch)) return false;
    }
    return true;
  });

  filtersEl.innerHTML = ['all','available','visible','hidden'].map(f => {
    let label = f==='all' ? (translate('dir.all').replace('🏢 ','') + ' ' + rows.length)
      : f==='available' ? ('🟢 ' + translate('bk.available') + ' ' + availableCount)
      : f==='visible' ? ('✅ ' + translate('bk.visible') + ' ' + visibleCount)
      : ('🙈 ' + translate('bk.hidden') + ' ' + (rows.length - visibleCount));
    let isActive = _catStatusFilter === f;
    let color = f==='hidden' ? '#6b7280' : f==='available' ? '#16a34a' : '#16a34a';
    return `<button class="filter-chip" style="background:${isActive?color:'transparent'};color:${isActive?'#fff':color};border-color:${color};font-weight:${isActive?'700':'600'}" data-bk-action="set-catalog-filter" data-bk-filter="${f}">${label}</button>`;
  }).join('') + `<span style="margin-left:auto;background:var(--s2);border:1px solid var(--border);border-radius:20px;padding:3px 12px;font-size:.8rem;font-weight:700;color:var(--muted)">${filtered.length} ${translate('bk.shown')}</span>`;

  gridEl.innerHTML = filtered.length
    ? filtered.map(r => catalogCardHtml(r)).join('')
    : '<div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--muted)"><div style="font-size:3rem;margin-bottom:12px">🔍</div><div style="font-size:1.1rem;font-weight:600">'+translate('bk.noVehicleMatches')+'</div></div>';
}

function catalogCardHtml(r){
  let v = r.v, cat = r.cat, plate = r.plate, cid = cssId(plate);

  // Badge branche — même palette de couleurs que le menu Fleet (bleu Barka / violet Moebela)
  let bureauRaw = (v.branch||'').trim();
  let bureauBadge = '';
  if(bureauRaw && bureauRaw.toLowerCase() !== 'shared'){
    let low = bureauRaw.toLowerCase();
    if(low.includes('barka')) bureauBadge = `<span style="background:rgba(37,99,235,.15);color:#2563eb;border:1px solid rgba(37,99,235,.4);border-radius:20px;padding:2px 10px;font-size:.72rem;font-weight:700">🏢 ${escBk(bureauRaw)}</span>`;
    else if(low.includes('moebela')||low.includes('moabela')||low.includes('mabela')) bureauBadge = `<span style="background:rgba(124,58,237,.15);color:#7c3aed;border:1px solid rgba(124,58,237,.4);border-radius:20px;padding:2px 10px;font-size:.72rem;font-weight:700">🏢 ${escBk(bureauRaw)}</span>`;
    else bureauBadge = `<span style="background:rgba(13,148,136,.15);color:#0d9488;border:1px solid rgba(13,148,136,.4);border-radius:20px;padding:2px 10px;font-size:.72rem;font-weight:700">🏢 ${escBk(bureauRaw)}</span>`;
  }

  let vBadgeStyle = (typeof getVehicleBadgeStyle === 'function') ? getVehicleBadgeStyle(v.name) : 'background:var(--s3);color:var(--text)';

  // Statut réel disponible/sorti/réservé — identique quelle que soit la session
  // (voir _bookingIsOut / _bookingIsHeld)
  let isOutNow = _bookingIsOut(v);
  let isHeldNow = _bookingIsHeld(v);
  let liveStatusBadge = isOutNow
    ? '<span style="background:rgba(239,68,68,.15);color:#dc2626;border:1.5px solid rgba(239,68,68,.4);border-radius:20px;padding:2px 10px;font-size:.72rem;font-weight:700">🔴 '+translate('svc.out')+'</span>'
    : isHeldNow
    ? '<span style="background:rgba(249,115,22,.15);color:#ea580c;border:1.5px solid rgba(249,115,22,.4);border-radius:20px;padding:2px 10px;font-size:.72rem;font-weight:700">'+translate('avail.booked2')+'</span>'
    : '<span style="background:rgba(22,163,74,.13);color:var(--green);border:1.5px solid rgba(22,163,74,.35);border-radius:20px;padding:2px 10px;font-size:.72rem;font-weight:700">🟢 '+translate('bk.available')+'</span>';

  // Répartition BARKA/MOEBELA pour le site public de booking UNIQUEMENT — étiquette
  // indépendante, stockée dans booking_catalog (cat.pubBranch). Ne touche jamais
  // v.branch (la vraie branche opérationnelle, utilisée par rentals/payments/comptes).
  let pubBranch = cat.pubBranch || '';
  let pubBranchToggle = `
    <div style="display:flex;gap:4px" title="${translate('avail.pubDistribution')}">
      <button type="button" data-bk-action="set-pub-branch" data-bk-plate="${escBk(plate)}" data-bk-branch="BARKA"
        style="padding:2px 10px;font-size:.7rem;font-weight:800;border-radius:20px;cursor:pointer;border:1.5px solid #2563eb;background:${pubBranch==='BARKA'?'#2563eb':'transparent'};color:${pubBranch==='BARKA'?'#fff':'#2563eb'}">🏢 BARKA</button>
      <button type="button" data-bk-action="set-pub-branch" data-bk-plate="${escBk(plate)}" data-bk-branch="MOEBELA"
        style="padding:2px 10px;font-size:.7rem;font-weight:800;border-radius:20px;cursor:pointer;border:1.5px solid #ea580c;background:${pubBranch==='MOEBELA'?'#ea580c':'transparent'};color:${pubBranch==='MOEBELA'?'#fff':'#ea580c'}">🏢 MOEBELA</button>
    </div>`;

  let isReady = cat.visible && Number(cat.publicPrice) > 0;
  let cardBorderTop = isReady ? '3px solid var(--green)' : cat.visible ? '3px solid #d97706' : '3px solid var(--border2)';
  let statusHtml = isReady
    ? '<span style="background:rgba(22,163,74,.13);color:var(--green);border:1.5px solid rgba(22,163,74,.35);border-radius:20px;padding:3px 12px;font-size:.78rem;font-weight:700">'+translate('bk.online')+'</span>'
    : cat.visible
      ? '<span style="background:rgba(217,119,6,.15);color:#d97706;border:1.5px solid rgba(217,119,6,.4);border-radius:20px;padding:3px 12px;font-size:.78rem;font-weight:700">'+translate('bk.priceMissing')+'</span>'
      : '<span style="background:var(--s2);color:var(--muted);border:1.5px solid var(--border);border-radius:20px;padding:3px 12px;font-size:.78rem;font-weight:700">'+translate('bk.hiddenBadge')+'</span>';

  return `<div data-plate="${escBk(plate)}" style="background:var(--s1);border:1px solid var(--border);border-radius:12px;overflow:hidden;border-top:${cardBorderTop};box-shadow:0 1px 4px rgba(0,0,0,.06);transition:box-shadow .2s,transform .15s;display:flex;flex-direction:column;height:100%"
    onmouseover="this.style.boxShadow='0 4px 16px rgba(0,0,0,.12)';this.style.transform='translateY(-1px)'"
    onmouseout="this.style.boxShadow='0 1px 4px rgba(0,0,0,.06)';this.style.transform='translateY(0)'">

    <!-- Répartition site public (BARKA/MOEBELA) — banneau complet, bien espacé -->
    <div style="padding:12px 14px;background:var(--s2);border-bottom:1px solid var(--border);display:flex;justify-content:center">${pubBranchToggle}</div>

    <!-- Header — structure améliorée, moins condensée -->
    <div style="padding:12px 14px;border-bottom:1px solid var(--border);display:flex;flex-direction:column;gap:10px">
      <!-- Ligne 1: Nom du véhicule + Plaque -->
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <span class="badge" style="${vBadgeStyle};font-size:.82rem;font-weight:700">${escBk(v.name)}</span>
        <span style="font-family:var(--mono);font-weight:700;font-size:.92rem;color:var(--text)">${escBk(plate)}</span>
      </div>
      <!-- Ligne 2: Bureau + Statut réel + Statut catalogue (organisés) -->
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:space-between">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          ${bureauBadge}
          ${liveStatusBadge}
        </div>
        <div>${statusHtml}</div>
      </div>
    </div>

    <!-- Photo — GRANDE, affichée complètement -->
    <div style="flex:1;min-height:240px;background:var(--s2);display:flex;align-items:center;justify-content:center;overflow:hidden">
      ${cat.photoUrl ? `<img src="${escBk(cat.photoUrl)}" alt="${escBk(v.name)}" style="width:100%;height:100%;object-fit:cover" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'🚗',style:'font-size:2rem'}))">` : `<span style="font-size:2rem">🚗</span>`}
    </div>

    <!-- Champs -->
    <div style="padding:12px 14px;display:flex;flex-direction:column;gap:9px;margin-top:auto">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div>
          <div style="font-size:.68rem;text-transform:uppercase;letter-spacing:.4px;color:var(--muted);font-weight:600;margin-bottom:3px">${translate('bk.model')}</div>
          <input type="text" placeholder="Ex: Corolla 2024" value="${escBk(cat.model||'')}" id="cat-model-${cid}" style="width:100%;padding:6px 8px;border-radius:6px;border:1px solid var(--border);background:var(--s2);color:var(--text)">
        </div>
        <div>
          <div style="font-size:.68rem;text-transform:uppercase;letter-spacing:.4px;color:var(--muted);font-weight:600;margin-bottom:3px">${translate('bk.vehicleType')}</div>
          <select id="cat-type-${cid}" onchange="saveBookingCatalogRow('${escBk(plate)}')" style="width:100%;padding:6px 8px;border-radius:6px;border:1px solid var(--border);background:var(--s2);color:var(--text)">
            <option value="Sedan" ${cat.type==='Sedan'?'selected':''}>Sedan</option>
            <option value="4X4" ${cat.type==='4X4'?'selected':''}>4X4</option>
            <option value="SUV" ${cat.type==='SUV'?'selected':''}>SUV</option>
          </select>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div>
          <div style="font-size:.68rem;text-transform:uppercase;letter-spacing:.4px;color:var(--muted);font-weight:600;margin-bottom:3px">${translate('bk.priceDayOmr')}</div>
          <input type="number" placeholder="Prix/jour" value="${cat.publicPrice||''}" id="cat-price-${cid}" style="width:100%;padding:6px 8px;border-radius:6px;border:1px solid var(--border);background:var(--s2);color:var(--text)">
        </div>
        <div style="display:flex;align-items:flex-end">
          <label style="display:flex;align-items:center;gap:6px;font-size:.8rem;width:100%;background:var(--s2);border:1px solid var(--border);border-radius:6px;padding:6px 9px;cursor:pointer">
            <input type="checkbox" id="cat-visible-${cid}" ${cat.visible?'checked':''}> ${translate('bk.visible')}
          </label>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div>
          <div style="font-size:.68rem;text-transform:uppercase;letter-spacing:.4px;color:var(--muted);font-weight:600;margin-bottom:3px">${translate('bk.priceWeekOmr')}</div>
          <input type="number" placeholder="Auto (-10%)" value="${cat.weeklyPrice||''}" id="cat-priceweek-${cid}" style="width:100%;padding:6px 8px;border-radius:6px;border:1px solid var(--border);background:var(--s2);color:var(--text)">
        </div>
        <div>
          <div style="font-size:.68rem;text-transform:uppercase;letter-spacing:.4px;color:var(--muted);font-weight:600;margin-bottom:3px">${translate('bk.priceMonthOmr')}</div>
          <input type="number" placeholder="Auto (-20%)" value="${cat.monthlyPrice||''}" id="cat-pricemonth-${cid}" style="width:100%;padding:6px 8px;border-radius:6px;border:1px solid var(--border);background:var(--s2);color:var(--text)">
        </div>
      </div>
      <div style="font-size:.68rem;color:var(--muted);line-height:1.4">${translate('bk.autoCalcNote')}</div>
      <div>
        <div style="font-size:.68rem;text-transform:uppercase;letter-spacing:.4px;color:var(--muted);font-weight:600;margin-bottom:3px">${translate('bk.vehiclePhoto')}</div>
        <div style="display:flex;gap:6px">
          <input type="text" placeholder="https://... or /photos/xxx.jpg" value="${escBk(cat.photoUrl||'')}" id="cat-photo-${cid}" style="flex:1;min-width:0;padding:6px 8px;border-radius:6px;border:1px solid var(--border);background:var(--s2);color:var(--text)">
          <input type="file" accept="image/*" id="cat-photofile-${cid}" style="display:none" onchange="uploadCatalogPhoto('${escBk(plate)}', this)">
          <button type="button" id="cat-choose-${cid}" class="btn btn-ghost" style="padding:6px 10px;font-size:.78rem;white-space:nowrap" data-bk-action="choose-file" data-bk-target="cat-photofile-${cid}">${translate('bk.choose')}</button>
        </div>
        <div id="cat-photostatus-${cid}" style="font-size:.68rem;color:var(--muted);margin-top:3px"></div>
      </div>
    </div>

    <!-- Actions -->
    <div style="padding:8px 14px 10px;display:flex;gap:6px;justify-content:flex-end;border-top:1px solid var(--border)">
      <button class="btn btn-primary" id="cat-save-${cid}" style="padding:5px 14px;font-size:.82rem" data-bk-action="save-catalog-row" data-bk-plate="${escBk(plate)}">${translate('bk.save')}</button>
    </div>
  </div>`;
}

// ── Import "Modèle" depuis le fichier Excel fourni (modele_dfe_voiture.xlsx) ──
// Clé de correspondance : le numéro de plaque (CAR NO dans le fichier), car les noms de
// véhicule dans l'app peuvent différer des noms/marques du fichier. p = plaque, b = marque,
// y = année (appelée "model" dans le fichier source — c'est l'année du modèle).
const VEHICLE_MODELS_IMPORT = [
  {p:'1037-TD',b:'YARIS',y:'2019'},
  {p:'1074-T',b:'COROLLA',y:'2020'},
  {p:'1111-TA',b:'ACCENT',y:'2021'},
  {p:'1148-T',b:'PICANTO',y:'2022'},
  {p:'1185-TA',b:'SUNNY',y:'2023'},
  {p:'1222-TD',b:'CITY',y:'2024'},
  {p:'1259-TB',b:'SPARK',y:'2019'},
  {p:'1296-TD',b:'ZS',y:'2020'},
  {p:'1333-TA',b:'ECOSPORT',y:'2021'},
  {p:'1370-TA',b:'TUCSON',y:'2022'},
  {p:'1407-T',b:'SPORTAGE',y:'2023'},
  {p:'1444-TA',b:'PATROL',y:'2024'},
  {p:'1481-T',b:'PRADO',y:'2019'},
  {p:'1518-TD',b:'PAJERO',y:'2020'},
  {p:'1555-TD',b:'X50',y:'2021'},
  {p:'1592-T',b:'YARIS',y:'2022'},
  {p:'1629-TA',b:'COROLLA',y:'2023'},
  {p:'1666-TB',b:'ACCENT',y:'2024'},
  {p:'1703-TA',b:'PICANTO',y:'2019'},
  {p:'1740-TA',b:'SUNNY',y:'2020'},
  {p:'1777-T',b:'CITY',y:'2021'},
  {p:'1814-TA',b:'SPARK',y:'2022'},
  {p:'1851-T',b:'ZS',y:'2023'},
  {p:'1888-TD',b:'ECOSPORT',y:'2024'},
  {p:'1925-TD',b:'TUCSON',y:'2019'},
  {p:'1962-T',b:'SPORTAGE',y:'2020'},
  {p:'1999-TB',b:'PATROL',y:'2021'},
  {p:'2036-TA',b:'PRADO',y:'2022'},
  {p:'2073-TA',b:'PAJERO',y:'2023'},
  {p:'2110-TA',b:'X50',y:'2024'},
  {p:'2147-TA',b:'YARIS',y:'2019'},
  {p:'2184-TA',b:'COROLLA',y:'2020'}
];

function importVehicleModels(){
  if(!Array.isArray(VEHICLE_MODELS_IMPORT) || !VEHICLE_MODELS_IMPORT.length) return;
  if(!confirm(t(translate('bk.importConfirm'), VEHICLE_MODELS_IMPORT.length))) return;

  if(!DB.bookingCatalog) DB.bookingCatalog = [];
  const fleetPlates = new Set((DB.vehicles||[]).map(v => (v.plate||'').toUpperCase().replace(/\s+/g,'')));
  let updated = 0;
  const notInFleet = [];

  // FIX 18/07/2026 : chaque ligne touchée est maintenant sauvegardée individuellement
  // via saveOne (comme un Save de carte normal) au lieu d'un saveAll(true) groupé.
  // saveAll() n'envoie plus du tout bookingCatalog (voir plus haut dans core.js) —
  // un envoi groupé ici serait donc silencieusement ignoré côté serveur et l'import
  // semblerait fonctionner (toast de succès) sans jamais être vraiment persisté.
  const touched = [];
  VEHICLE_MODELS_IMPORT.forEach(item => {
    const plate = item.p.toUpperCase().replace(/\s+/g,'');
    if(!fleetPlates.has(plate)){ notInFleet.push(plate); return; }
    const modelText = String(item.y).trim();
    let existing = DB.bookingCatalog.find(c => (c.plate||'').toUpperCase().replace(/\s+/g,'') === plate);
    if(existing){
      existing.model = modelText;
    } else {
      existing = { id: (typeof _genId === 'function') ? _genId() : Date.now(), plate, publicPrice: 0, photoUrl: '', visible: false, model: modelText, type: 'Sedan' };
      DB.bookingCatalog.push(existing);
    }
    touched.push(existing);
    updated++;
  });

  if(typeof saveOne === 'function') touched.forEach(rec => saveOne('booking_catalog', rec));
  renderCatalogFiltersAndGrid();

  let msg = t(translate('bk.modelsImported'), updated);
  if(notInFleet.length) msg += t(translate('bk.platesNotFound'), notInFleet.length);
  showToast(msg);
  if(notInFleet.length) console.warn('[Model import] Plates from the file not found in DB.vehicles:', notInFleet);
}

function cssId(plate){ return String(plate).replace(/[^A-Za-z0-9]/g,'_'); }

// Upload direct de la photo (n'importe quel poste) — plus besoin de déposer
// un fichier manuellement sur le disque du serveur. Remplit le champ URL
// automatiquement puis enregistre + rafraîchit la grille.
function uploadCatalogPhoto(plate, inputEl){
  let file = inputEl.files && inputEl.files[0];
  if(!file) return;
  let p = plate.toUpperCase();
  let cid = cssId(p);
  let statusEl = document.getElementById('cat-photostatus-'+cid);
  if(file.size > 5*1024*1024){ if(statusEl) statusEl.textContent = translate('bk.imageTooLarge'); return; }
  if(statusEl) statusEl.textContent = translate('bk.uploading');

  // Verrou anti-course : bloque tout save concurrent pour cette plaque
  // tant que l'upload + son propre save ne sont pas terminés.
  _catUploadBusy.add(p);
  let saveBtn = document.getElementById('cat-save-'+cid);
  let chooseBtn = document.getElementById('cat-choose-'+cid);
  if(saveBtn) saveBtn.disabled = true;
  if(chooseBtn) chooseBtn.disabled = true;

  let fd = new FormData();
  fd.append('plate', plate);
  fd.append('file', file);

  fetch('/api/upload-catalog-photo', { method:'POST', headers: authHeaders(), body: fd })
    .then(r => r.json())
    .then(data => {
      if(!data || !data.ok){
        if(statusEl) statusEl.textContent = '❌ ' + (data && data.error || translate('bk.uploadFailed'));
        // Échec : on lève le verrou et on rejoue une éventuelle sauvegarde
        // en attente (les champs, eux, n'ont pas changé).
        _catUploadBusy.delete(p);
        if(saveBtn) saveBtn.disabled = false;
        if(chooseBtn) chooseBtn.disabled = false;
        if(_catPendingResave.has(p)){ _catPendingResave.delete(p); saveBookingCatalogRow(plate); }
        return;
      }
      let photoField = document.getElementById('cat-photo-'+cid);
      if(photoField) photoField.value = '/' + data.path;
      if(statusEl) statusEl.textContent = translate('bk.photoUploaded');
      // On lève le verrou AVANT le save autoritaire ci-dessous, sinon ce save
      // se ferait lui-même différer par son propre verrou. Ce save relit tous
      // les champs actuels du DOM (prix/type/modèle/photo), donc il couvre
      // aussi toute modification faite par l'utilisateur pendant l'upload —
      // pas besoin de rejouer _catPendingResave séparément dans ce cas.
      _catUploadBusy.delete(p);
      _catPendingResave.delete(p);
      saveBookingCatalogRow(plate); // enregistre + redessine la grille avec la nouvelle photo
      showToast(translate('bk.photoUpdated'));
    })
    .catch(() => {
      if(statusEl) statusEl.textContent = translate('bk.networkErrorUpload');
      _catUploadBusy.delete(p);
      if(saveBtn) saveBtn.disabled = false;
      if(chooseBtn) chooseBtn.disabled = false;
      if(_catPendingResave.has(p)){ _catPendingResave.delete(p); saveBookingCatalogRow(plate); }
    });
}

// Recherche + filtres — ne redessinent que les chips/la grille, jamais la barre elle-même
function filterBookingCatalog(q){ _catSearch = (q||'').toLowerCase(); renderCatalogFiltersAndGrid(); }
const filterBookingCatalogDebounced = (typeof debounce === 'function') ? debounce(filterBookingCatalog, 150) : filterBookingCatalog;
function setBookingCatalogFilter(f){ _catStatusFilter = f; renderCatalogFiltersAndGrid(); }

// ── Répartition BARKA/MOEBELA pour le site public de réservation uniquement ──
// Champ "pubBranch" dans booking_catalog. Clic sur le même bouton = désactive
// (retour à "non assigné", visible dans "Tous" mais dans aucun des deux filtres).
// N'écrit jamais dans v.branch ni dans les tables rentals/payments.
function setCatalogPubBranch(plate, loc){
  let p = plate.toUpperCase();
  if(!DB.bookingCatalog) DB.bookingCatalog = [];
  let existing = DB.bookingCatalog.find(c => (c.plate||'').toUpperCase() === p);
  if(existing){
    existing.pubBranch = (existing.pubBranch === loc) ? '' : loc;
    if(!existing.id) existing.id = (typeof _genId === 'function') ? _genId() : Date.now();
  } else {
    existing = { id: (typeof _genId === 'function') ? _genId() : Date.now(), plate: p, publicPrice: 0, photoUrl: '', visible: false, model: '', type: 'Sedan', pubBranch: loc };
    DB.bookingCatalog.push(existing);
  }
  if(typeof saveOne === 'function') saveOne('booking_catalog', existing, '📍 ' + p + ' → ' + (existing.pubBranch || translate('bk.unassigned')));
  renderCatalogFiltersAndGrid();
}

function saveBookingCatalogRow(plate){
  let p = plate.toUpperCase();
  // Anti-course : si une photo est encore en cours d'upload pour cette
  // plaque, on ne sauvegarde pas tout de suite (on écraserait potentiellement
  // la photo avec un champ encore vide) — on note juste qu'un re-save est
  // attendu, il sera rejoué automatiquement dès la fin de l'upload.
  if(_catUploadBusy.has(p)){ _catPendingResave.add(p); return; }
  let price = Number(document.getElementById('cat-price-'+cssId(p)).value)||0;
  let weekEl = document.getElementById('cat-priceweek-'+cssId(p));
  let monthEl = document.getElementById('cat-pricemonth-'+cssId(p));
  let weeklyPrice = weekEl ? (Number(weekEl.value)||0) : 0;
  let monthlyPrice = monthEl ? (Number(monthEl.value)||0) : 0;
  let photo = document.getElementById('cat-photo-'+cssId(p)).value.trim();
  let visible = document.getElementById('cat-visible-'+cssId(p)).checked;
  let modelEl = document.getElementById('cat-model-'+cssId(p));
  let typeEl = document.getElementById('cat-type-'+cssId(p));
  let model = modelEl ? modelEl.value.trim() : '';
  let type = typeEl ? typeEl.value : 'Sedan';
  if(!DB.bookingCatalog) DB.bookingCatalog = [];
  let existing = DB.bookingCatalog.find(c => (c.plate||'').toUpperCase() === p);
  let record = { plate: p, publicPrice: price, weeklyPrice, monthlyPrice, photoUrl: photo, visible, model, type };

  // IMPORTANT — même principe _genId() que Daily Rentals / Payments :
  // les lignes du catalogue booking n'avaient AUCUN champ "id", uniquement une
  // "plate". Or la file d'attente de sauvegarde (save-queue dans core.js, utilisée
  // par TOUTES les tables en cas de réseau/serveur KO) identifie chaque item en
  // attente par (table + record.id). Sans id, deux voitures modifiées à la suite
  // (ex: type SUV/4X4 changé sur plusieurs cartes) avaient TOUTES le même id
  // "undefined" → la 2e écrasait la 1ère dans la file, qui perdait alors sa
  // modification en silence (aucune erreur visible). D'où l'effet observé :
  // tu changes plusieurs types, tu fermes/rouvres, et tout redevient "Sedan" —
  // seule la dernière modification (ou aucune) avait vraiment atteint le serveur.
  // Fix : donner un id stable et unique à chaque ligne, généré une seule fois
  // (à la création), puis conservé pour toutes les sauvegardes suivantes.
  if(existing){
    if(!existing.id) existing.id = (typeof _genId === 'function') ? _genId() : Date.now();
    Object.assign(existing, record);
  } else {
    record.id = (typeof _genId === 'function') ? _genId() : Date.now();
    DB.bookingCatalog.push(record);
    existing = record;
  }

  if(typeof saveOne === 'function') saveOne('booking_catalog', existing, translate('bk.catalogUpdated') + p);
  renderCatalogFiltersAndGrid(); // rafraîchit le badge de statut (EN LIGNE / PRIX MANQUANT / MASQUÉ)
}

// ── Lien / QR public ──────────────────────────────────────────────────
function showBookingLink(){
  let url = window.location.origin + '/booking.html';
  let qrImg = 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' + encodeURIComponent(url);
  let existing = document.getElementById('booking-link-overlay');
  if(existing) existing.remove();
  let overlay = document.createElement('div');
  overlay.id = 'booking-link-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999';
  overlay.onclick = (e) => { if(e.target===overlay) overlay.remove(); };
  overlay.innerHTML = `
    <div style="background:var(--s1);border-radius:14px;padding:24px;max-width:340px;text-align:center;box-shadow:var(--shadow-lg)">
      <div style="font-weight:800;margin-bottom:12px;color:var(--text)">${translate('bk.shareWithClients')}</div>
      <img src="${qrImg}" style="border-radius:10px;background:#fff;padding:10px" alt="QR code">
      <div style="margin-top:12px;font-family:var(--mono);font-size:.8rem;word-break:break-all;background:var(--s2);padding:8px;border-radius:8px;color:var(--text)">${url}</div>
      <button class="btn btn-primary" style="margin-top:12px;width:100%" data-bk-action="copy-link" data-bk-url="${escBk(url)}">${translate('bk.copyLink')}</button>
      <button class="btn btn-ghost" style="margin-top:8px;width:100%" data-bk-action="close-overlay" data-bk-overlay-id="booking-link-overlay">${translate('bk.close')}</button>
    </div>`;
  document.body.appendChild(overlay);
}

function escBk(s){ return String(s==null?'':s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

window.renderBooking = renderBooking;
window.setBookingTab = setBookingTab;
window.confirmBookingPaid = confirmBookingPaid;
window.cancelBooking = cancelBooking;
window.convertBookingToRental = convertBookingToRental;
window.showBookingReceipt = showBookingReceipt;
window.printBookingReceipt = printBookingReceipt;
window.saveBookingCatalogRow = saveBookingCatalogRow;
window.setCatalogPubBranch = setCatalogPubBranch;
window.uploadCatalogPhoto = uploadCatalogPhoto;
window.filterBookingCatalog = filterBookingCatalog;
window.filterBookingCatalogDebounced = filterBookingCatalogDebounced;
window.setBookingCatalogFilter = setBookingCatalogFilter;
window.showBookingLink = showBookingLink;

// ── Délégation d'événements (2026-08) — remplace les onclick= inline sur
// tous les boutons générés dynamiquement ci-dessus (onglets, cartes
// réservation, reçu, catalogue public, lien de partage). Comportement
// strictement identique.
document.addEventListener('click', function(e){
  let btn = e.target.closest('[data-bk-action]');
  if(!btn) return;
  let action = btn.dataset.bkAction;
  if(action === 'set-tab'){
    setBookingTab(btn.dataset.bkTab);
  } else if(action === 'show-link'){
    showBookingLink();
  } else if(action === 'confirm-paid'){
    confirmBookingPaid(Number(btn.dataset.bkId));
  } else if(action === 'convert-rental'){
    convertBookingToRental(Number(btn.dataset.bkId));
  } else if(action === 'show-receipt'){
    showBookingReceipt(Number(btn.dataset.bkId));
  } else if(action === 'cancel'){
    cancelBooking(Number(btn.dataset.bkId));
  } else if(action === 'print-receipt'){
    printBookingReceipt(Number(btn.dataset.bkId));
  } else if(action === 'close-overlay'){
    document.getElementById(btn.dataset.bkOverlayId)?.remove();
  } else if(action === 'set-catalog-filter'){
    setBookingCatalogFilter(btn.dataset.bkFilter);
  } else if(action === 'set-pub-branch'){
    setCatalogPubBranch(btn.dataset.bkPlate, btn.dataset.bkBranch);
  } else if(action === 'choose-file'){
    document.getElementById(btn.dataset.bkTarget)?.click();
  } else if(action === 'save-catalog-row'){
    saveBookingCatalogRow(btn.dataset.bkPlate);
  } else if(action === 'copy-link'){
    navigator.clipboard.writeText(btn.dataset.bkUrl);
    showToast(translate('bk.linkCopied'));
  }
});
