// ═══════════════════════════════════════════════════════════════════
// module-daily-rentals-carryforward.js
// CARRY-FORWARD — crédit reporté d'un contrat à un autre
// Extrait automatiquement de module-daily-rentals.js (découpage mécanique,
// aucune ligne modifiée — tout reste en portée globale, comme avant).
// ═══════════════════════════════════════════════════════════════════


// ── _cfPlainDateTime — formatte date+heure en TEXTE BRUT (jamais d'entité HTML type
// &nbsp; ici : le résultat est injecté via .textContent dans une <option>, qui n'interprète
// pas le HTML — contrairement au fmtDate() global utilisé ailleurs avec innerHTML, ce qui
// affichait littéralement "&nbsp;&nbsp;" dans la liste déroulante) ──
function _cfPlainDateTime(dt){
  if(!dt) return '—';
  let d = new Date(dt);
  if(isNaN(d.getTime())) return '—';
  let date = String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear();
  let hh = String(d.getHours()).padStart(2,'0');
  let mm = String(d.getMinutes()).padStart(2,'0');
  return `${date} ${hh}:${mm}`;
}


// ── _cfEnsureClientInfoEl — crée (une seule fois) la ligne d'info client juste au-dessus
// du SELECT, sans dépendre d'un élément ajouté à la main dans app.html ──
function _cfEnsureClientInfoEl(select){
  let el = document.getElementById('r-cf-client-info');
  if(el) return el;
  if(!select || !select.parentElement) return null;
  el = document.createElement('div');
  el.id = 'r-cf-client-info';
  el.style.cssText = 'font-size:.72rem;font-weight:700;margin-bottom:6px;display:flex;align-items:center;gap:6px;flex-wrap:wrap';
  select.parentElement.insertBefore(el, select);
  return el;
}


// ── loadClientContractsForCarryForward — charger les contrats fermés du client ──
function loadClientContractsForCarryForward(clientId){
  let select = document.getElementById('r-cf-source-contract');
  if(!select) return;
  
  let clientInfoEl = _cfEnsureClientInfoEl(select);
  
  // Afficher le nom + l'ID du client concerné, pour confirmer AVANT de choisir un contrat
  // source que la liste ci-dessous appartient bien au bon client (demandé par Hicham).
  if(clientInfoEl){
    let client = clientId ? (DB.clients||[]).find(c => c.id === clientId) : null;
    if(client){
      let cName = escapeHtml(client.firstname || client.name || '—');
      let cIdCard = escapeHtml(client.idcard || '');
      clientInfoEl.innerHTML = `<span style="color:var(--muted);font-weight:600">${translate('cf.forClient')}</span>` +
        `<span style="color:var(--text)">${cName}</span>` +
        (cIdCard ? `<span style="color:var(--muted);font-weight:600">· ${translate('cf.idLabel')}</span><span style="font-family:'IBM Plex Mono',monospace;color:var(--text)">${cIdCard}</span>` : '');
    } else {
      clientInfoEl.innerHTML = `<span style="color:var(--muted)">${translate('cf.noClientYet')}</span>`;
    }
  }
  
  // Chercher tous les contrats du client qui sont fermés (dateIn rempli)
  let clientContracts = clientId ? DB.rentals.filter(r => 
    r._clientId === clientId && 
    r.dateIn && 
    r.dateIn !== '' &&
    !r._cancelled
  ) : [];
  
  // Trier par date, plus récents en premier
  clientContracts.sort((a,b) => (b.dateIn || '').localeCompare(a.dateIn || ''));
  
  // Remplir le SELECT
  select.innerHTML = `<option value="">${translate('cf.selectPlaceholder')}</option>`;
  
  if(clientContracts.length === 0){
    let opt = document.createElement('option');
    opt.value = '';
    opt.textContent = translate('cf.noClosedContracts'); // la clé inclut déjà les parenthèses
    opt.disabled = true;
    select.appendChild(opt);
    return;
  }
  
  clientContracts.forEach(r => {
    let bal = Number(r.bal || 0);
    let v = r.vehicleId ? (DB.vehicles.find(x=>x.id===r.vehicleId)||{}) : {};
    let plate = v.plate || r._plate || '—';
    let name = v.name || r._name || '—';
    
    let opt = document.createElement('option');
    opt.value = r.id;
    opt.textContent = `#${r.contract} | ${name} ${plate} | ${translate('col.bal')}: ${fmtNum(bal)} ${translate('common.omr')} | ${_cfPlainDateTime(r.dateIn)}`;
    select.appendChild(opt);
  });
}


// ── onCarryForwardSourceSelect — quand on choisit un contrat source, calculer le montant auto ──
function onCarryForwardSourceSelect(rentalId){
  let infoDiv = document.getElementById('r-cf-source-info');
  let amountInput = document.getElementById('r-cf-amount');
  
  if(!rentalId){
    if(infoDiv) infoDiv.style.display = 'none';
    if(amountInput) amountInput.value = '';
    return;
  }
  
  let source = DB.rentals.find(r => r.id === Number(rentalId));
  if(!source){
    if(infoDiv) infoDiv.style.display = 'none';
    if(amountInput) amountInput.value = '';
    return;
  }
  
  // Calculer le montant disponible
  // = crédit du contrat source (BAL négative = client a payé plus que dû = crédit en sa faveur)
  //   MOINS ce qui a déjà été reporté ailleurs depuis ce même contrat source.
  // FIX (2026-09) : l'ancien code faisait `sourceBAL - alreadyUsed` puis zérotait dès que le
  // résultat n'était pas strictement positif. Or une BAL de contrat fermé est NÉGATIVE
  // quand le client a un crédit (voir calcRentalBAL : BAL = totalDû - payé) — donc TOUT
  // contrat avec un vrai crédit à reporter (BAL négative) tombait systématiquement à 0.00,
  // ce qui déclenchait ensuite le message "⚠️ Select a source contract." au moment de
  // sauvegarder, alors qu'un contrat source était bel et bien sélectionné.
  // Une BAL positive (client encore débiteur) ne donne aucun crédit à reporter → pool = 0.
  let sourceBAL = Number(source.bal || 0);
  let alreadyUsed = DB.rentals
    .filter(r => r._carryForwardSourceId === source.id)
    .reduce((sum, r) => sum + (Number(r._carryForwardCredit || 0)), 0);
  
  let creditPool = sourceBAL < 0 ? Math.abs(sourceBAL) : 0;
  let available = Math.max(0, creditPool - alreadyUsed);
  
  // Afficher les infos
  let v = source.vehicleId ? (DB.vehicles.find(x=>x.id===source.vehicleId)||{}) : {};
  let plate = v.plate || source._plate || '—';
  let name = v.name || source._name || '—';
  
  if(infoDiv){
    let omr = translate('common.omr');
    infoDiv.style.display = 'block';
    infoDiv.innerHTML = `
      <strong>✅ ${escapeHtml(name)} ${escapeHtml(plate)}</strong><br>
      <span style="font-size:.65rem">${translate('cf.originalBal')}: ${fmtNum(sourceBAL)} ${omr} | ${translate('cf.alreadyUsed')}: ${fmtNum(alreadyUsed)} ${omr} | <strong style="color:#16a34a">${translate('cf.available')}: ${fmtNum(available)} ${omr}</strong> | ${translate('cf.receipt')}: #${source.receipt ? source.receipt.replace(/^R/,'') : '?'}</span>
    `;
  }
  
  // Remplir le montant auto (valeur par défaut = tout le disponible, mais modifiable —
  // voir clampCfAmountInput : l'opérateur doit la réduire si ce contrat ne consomme
  // qu'une partie du crédit, sinon le reliquat sera "avalé" en entier par ce contrat).
  if(amountInput){
    amountInput.max = available.toFixed(2);
    amountInput.value = available > 0 ? available.toFixed(2) : '0.00';
  }
}


// ── clampCfAmountInput — empêche de saisir plus que le crédit dispo pour la source liée ──
// FIX (2026-09) : le champ était en `readonly` et prenait TOUJOURS 100% du pool disponible,
// même si le contrat en cours n'avait besoin que d'une partie de ce crédit. Résultat : le
// premier contrat lié "aspirait" tout le reliquat, laissant 0 OMR pour les contrats suivants
// du même client — alors qu'une partie du crédit aurait dû rester disponible.
// Le champ est maintenant éditable ; ceci empêche seulement de dépasser le max autorisé.
function clampCfAmountInput(el){
  let max = Number(el.max);
  if(!isNaN(max) && max >= 0 && Number(el.value) > max) el.value = max.toFixed(2);
  if(Number(el.value) < 0) el.value = '0.00';
}


// ── applyCarryForwardCredit — fonction globale pour lier un crédit reporté ──
// Utilisation: applyCarryForwardCredit(newRentalId, sourceRentalId, amountRemaining)
function applyCarryForwardCredit(newRentalId, sourceRentalId, amountRemaining){
  let newRental = DB.rentals.find(r => r.id === newRentalId);
  let sourceRental = DB.rentals.find(r => r.id === sourceRentalId);
  
  if(!newRental || !sourceRental){
    console.error('applyCarryForwardCredit: rental not found');
    return false;
  }
  
  // Vérification: même client obligatoire
  if(newRental._clientId !== sourceRental._clientId){
    console.error('applyCarryForwardCredit: client IDs do not match');
    toast(translate('cf.clientMismatch'));
    return false;
  }
  
  // Lier le crédit reporté toujours vers le contrat SOURCE (pas le maillon précédent)
  newRental._carryForwardSourceId = sourceRental.id;
  newRental._carryForwardSourceReceipt = sourceRental.receipt || ('R' + sourceRental.id);
  newRental._carryForwardCredit = Number(amountRemaining) || 0;
  
  // Sauvegarder
  if(typeof saveOne === 'function') saveOne('rentals', newRental.id, newRental);
  toast(t(translate('cf.appliedToast'), fmtNum(amountRemaining), sourceRental.contract));
  
  // Rafraîchir l'affichage
  if(typeof renderDaily === 'function') renderDaily();
  
  return true;
}


// ── carryForwardPanelFor — affiche le crédit reporté (reliquat) du contrat source ──
function carryForwardPanelFor(r){
  if(!r._carryForwardSourceId || !r._carryForwardCredit) return '';
  let source = DB.rentals.find(x => x.id === Number(r._carryForwardSourceId));
  if(!source) return '';
  let remaining = Number(r._carryForwardCredit) || 0;
  let sv = source.vehicleId ? (DB.vehicles.find(x=>x.id===source.vehicleId)||{}) : {};
  let sPlate = sv.plate || source._plate || '—';
  let sName = sv.name || source._name || '—';
  // FIX (2026-09) : afficher le VRAI numéro de reçu (DB.payments) plutôt que l'ID interne
  // de secours stocké sur le rental (source.receipt, souvent un timestamp 'R...').
  let sReceipt = getRealReceiptFor(source) || (source.receipt ? String(source.receipt).replace(/^R/,'') : '?');
  // FIX (2026-09) : layout horizontal — toutes les infos sur UNE seule ligne qui exploite
  // toute la largeur de la carte (avant : 3 lignes empilées avec beaucoup d'espace vide à droite).
  return `<div class="oc-carry-forward-panel" data-dr-action="jump-rental" data-dr-id="${source.id}" style="cursor:pointer;margin:8px 0;padding:9px 13px;border-radius:9px;background:rgba(34,197,94,.08);border:1.5px solid rgba(34,197,94,.3);display:flex;align-items:center;gap:8px;flex-wrap:wrap">
    <span style="font-size:1rem;line-height:1;flex-shrink:0">💰</span>
    <span style="font-size:.62rem;font-weight:800;color:#16a34a;text-transform:uppercase;letter-spacing:.4px;flex-shrink:0">${translate('cf.balanceLabel')}</span>
    <span style="font-size:.84rem;font-weight:700;color:var(--text);white-space:nowrap;flex-shrink:0">${fmtNum(remaining)} ${translate('common.omr')}</span>
    <span style="font-size:.76rem;color:var(--muted);white-space:nowrap;flex-shrink:0">${translate('cf.fromContract')} #${source.contract||'?'}</span>
    <span style="font-size:.76rem;color:var(--muted);white-space:nowrap;flex-shrink:0">· ${translate('cf.receipt')} #${sReceipt}</span>
    <span style="font-size:.76rem;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:60px">· ${escapeHtml(sName)} ${escapeHtml(sPlate)}</span>
    <button type="button" data-dr-action="edit-cf-credit" data-dr-id="${r.id}" title="Adjust linked credit amount" style="flex-shrink:0;background:rgba(255,255,255,.15);border:1px solid rgba(22,163,74,.4);color:#16a34a;border-radius:6px;padding:3px 7px;font-size:.72rem;cursor:pointer">✏️</button>
    <span style="font-size:.68rem;font-weight:700;color:#16a34a;white-space:nowrap;flex-shrink:0">${translate('dash.clickToView')} →</span>
  </div>`;
}


// ── getCarryForwardChain — récupère la chaîne complète de crédits reportés pour un contrat source ──
function getCarryForwardChain(sourceRentalId){
  let chain = [];
  let source = DB.rentals.find(r => r.id === sourceRentalId);
  if(!source) return chain;
  
  // Le contrat source lui-même
  chain.push({
    id: source.id,
    contract: source.contract,
    receipt: source.receipt,
    paid: Number(source.paid || 0),
    isSource: true
  });
  
  // Tous les contrats qui pointent vers ce source
  let linked = DB.rentals.filter(r => r._carryForwardSourceId === sourceRentalId);
  linked.forEach(r => {
    chain.push({
      id: r.id,
      contract: r.contract,
      remaining: Number(r._carryForwardCredit || 0),
      isSource: false
    });
  });
  
  return chain;
}


// ── showCarryForwardDetail — affiche le détail du crédit reporté en popup ──
function showCarryForwardDetail(rentalId){
  let r = DB.rentals.find(x => x.id === rentalId);
  if(!r || !r._carryForwardSourceId) return;
  
  let chain = getCarryForwardChain(r._carryForwardSourceId);
  let source = chain.find(c => c.isSource);
  
  let omr = translate('common.omr');
  let html = `
    <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#16a34a;margin-bottom:10px">
      ${translate('cf.chainTitle')}
    </div>
    <div style="font-size:.78rem;line-height:1.6;color:var(--text)">
  `;
  
  chain.forEach((c, idx) => {
    if(c.isSource){
      html += `<div style="padding:8px;background:rgba(34,197,94,.1);border-radius:6px;margin-bottom:8px">
        <div style="font-weight:700">${translate('cf.source')} #${c.contract}</div>
        <div style="font-size:.7rem;color:var(--muted)">${translate('cf.paid')}: ${fmtNum(c.paid)} ${omr} · ${translate('cf.receipt')}: #${c.receipt ? c.receipt.replace(/^R/,'') : '?'}</div>
      </div>`;
    } else {
      html += `<div style="padding:6px;border-left:2px solid #16a34a;margin-left:8px;padding-left:10px;margin-bottom:6px">
        #${c.contract}: <strong>${fmtNum(c.remaining)} ${omr}</strong>
      </div>`;
    }
  });
  
  html += `</div>`;
  
  let popup = document.createElement('div');
  popup.id = 'cf-detail-popup';
  popup.style.cssText = 'position:fixed;z-index:9999;background:var(--s2);border:1.5px solid #16a34a;border-radius:10px;padding:14px 16px;max-width:380px;min-width:280px;box-shadow:0 8px 32px rgba(0,0,0,.35);font-family:var(--font)';
  popup.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <span style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#16a34a">${translate('cf.chainShortTitle')}</span>
      <button data-dr-action="close-overlay" data-dr-overlay-id="cf-detail-popup" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:1rem;line-height:1">✕</button>
    </div>
    ${html}
  `;
  document.body.appendChild(popup);
  
  // Position
  let x = window.innerWidth / 2 - 190;
  let y = window.innerHeight / 2 - 150;
  popup.style.left = x + 'px';
  popup.style.top = y + 'px';
  
  // Close on outside click
  setTimeout(() => {
    document.addEventListener('click', function closePopup(e){
      if(!popup.contains(e.target)){ popup.remove(); document.removeEventListener('click', closePopup); }
    });
  }, 100);
}


// ── carryForwardBadgeFor — badge pour le crédit reporté ──
function carryForwardBadgeFor(r){
  if(!r._carryForwardSourceId || !r._carryForwardCredit) return '';
  let source = DB.rentals.find(x => x.id === Number(r._carryForwardSourceId));
  if(!source) return '';
  let remaining = Number(r._carryForwardCredit) || 0;
  return `<span style="display:inline-flex;align-items:center;gap:2px;margin-left:4px">
    <span data-dr-action="jump-rental" data-dr-id="${source.id}" style="cursor:pointer;background:#16a34a;color:#fff;font-size:.6rem;font-weight:800;border-radius:20px 0 0 20px;padding:2px 6px 2px 8px;white-space:nowrap" title="${translate('cf.viewSourceContract')}">💰 CF: ${fmtNum(remaining)} ${translate('common.omr')} · #${source.contract||'?'}</span>
    <span data-dr-action="edit-cf-credit" data-dr-id="${r.id}" style="cursor:pointer;background:#15803d;color:#fff;font-size:.6rem;font-weight:800;border-radius:0 20px 20px 0;padding:2px 6px 2px 4px;white-space:nowrap;border-left:1px solid rgba(255,255,255,.3)" title="Adjust linked credit amount">✏️</span>
  </span>`;
}


// ═══════════════════════════════════════════════════════════════════════════════════════════
// 📈 REVENUE STATISTICS — Complete Analytics Module
// ═══════════════════════════════════════════════════════════════════════════════════════════

var g_revenueTab = 'daily';






















// ── Délégation d'événements (2026-08) — remplace les 44 onclick= inline
// jadis codés en dur dans le HTML généré dynamiquement par ce module
// (cartes contrats ouverts, tableaux Daily Rentals, blocs mois/jour
// repliables, popups). Comportement strictement identique, y compris le
// stopPropagation() sur les panneaux "remplacement temporaire".
// ──────────────────────────────────────────────────────────────────────────────────
// UTILITY FUNCTIONS FOR CARRY-FORWARD CREDIT MANAGEMENT
// ──────────────────────────────────────────────────────────────────────────────────

// Diminuer le crédit reporté d'un montant
function decreaseCarryForwardCredit(rentalId, amountToDecrease){
  let r = DB.rentals.find(x => x.id === rentalId);
  if(!r || !r._carryForwardCredit) return false;
  let current = Number(r._carryForwardCredit) || 0;
  let decrease = Number(amountToDecrease) || 0;
  if(decrease <= 0 || decrease > current){ toast('⚠️ Invalid decrease amount'); return false; }
  let newAmount = current - decrease;
  r._carryForwardCredit = newAmount > 0 ? newAmount : undefined;
  // FIX (2026-09) : saveOne(table, record, toastMsg) attend l'OBJET complet en 2e argument,
  // pas son id — l'appel précédent envoyait r.id comme "record" (donc record.id undefined
  // côté serveur) et l'objet r entier comme "toastMsg". Corrigé.
  if(typeof saveOne === 'function') saveOne('rentals', r, null);
  toast(`💰 Carry-forward decreased: ${fmtNum(decrease)} OMR (remaining: ${fmtNum(newAmount)} OMR)`);
  if(typeof renderDaily === 'function') renderDaily();
  return true;
}


// Supprimer complètement le crédit reporté
function clearCarryForwardCredit(rentalId){
  let r = DB.rentals.find(x => x.id === rentalId);
  if(!r) return false;
  if(!confirm('🗑️ Remove carry-forward credit for contract #' + (r.contract || '?') + '?')) return false;
  r._carryForwardSourceId = undefined;
  r._carryForwardSourceReceipt = undefined;
  r._carryForwardCredit = undefined;
  // FIX (2026-09) : recalculer et persister le vrai BAL après nettoyage — sinon r.bal
  // (le champ STOCKÉ, utilisé par les tables/listes) restait figé sur l'ancien solde
  // faussé jusqu'au prochain save complet du contrat depuis Edit Rental.
  if(!r._balManual){
    let freshBal = r.dateIn && r.dateIn !== '' ? calcRentalBAL(r) : calcOpenContractBAL(r);
    if(freshBal !== null) r.bal = freshBal;
  }
  // FIX (2026-09) : même bug de signature saveOne que ci-dessus, corrigé.
  if(typeof saveOne === 'function') saveOne('rentals', r, null);
  toast('💰 Carry-forward credit removed');
  if(typeof renderDaily === 'function') renderDaily();
  return true;
}


// ── setCarryForwardCreditAmount — corrige DIRECTEMENT le montant lié à un contrat ──
// Contrairement à decreaseCarryForwardCredit (qui ne fait que soustraire un delta), celle-ci
// fixe la valeur exacte. Sert à corriger un contrat qui a par erreur "aspiré" tout le pool
// de crédit de la source (cas du bug du 2026-09 : champ readonly qui prenait 100% du dispo).
function setCarryForwardCreditAmount(rentalId, newAmount){
  let r = DB.rentals.find(x => x.id === rentalId);
  if(!r || !r._carryForwardSourceId){ toast('⚠️ This contract has no linked carry-forward credit'); return false; }
  let amount = Number(newAmount);
  if(isNaN(amount) || amount < 0){ toast('⚠️ Invalid amount'); return false; }
  let source = DB.rentals.find(x => x.id === Number(r._carryForwardSourceId));
  if(source){
    let sourceBAL = Number(source.bal || 0);
    let creditPool = sourceBAL < 0 ? Math.abs(sourceBAL) : 0;
    // "déjà utilisé ailleurs" = tout ce qui est lié à cette même source, SAUF ce contrat-ci
    // (puisque c'est précisément sa part qu'on est en train de corriger).
    let usedElsewhere = DB.rentals
      .filter(x => x._carryForwardSourceId === source.id && x.id !== rentalId)
      .reduce((sum, x) => sum + (Number(x._carryForwardCredit || 0)), 0);
    let maxAllowed = Math.max(0, creditPool - usedElsewhere);
    if(amount > maxAllowed + 0.001){
      toast(`⚠️ Max ${fmtNum(maxAllowed)} OMR available for this contract (source pool: ${fmtNum(creditPool)} OMR)`);
      return false;
    }
  }
  let old = Number(r._carryForwardCredit || 0);
  r._carryForwardCredit = amount > 0 ? amount : undefined;
  if(typeof saveOne === 'function') saveOne('rentals', r, null);
  if(typeof logAction === 'function') logAction('edit_rental', `💰 Carry-forward credit adjusted — Cont. ${r.contract||'?'}`, `Linked amount: [${fmtNum(old)} OMR] → [${fmtNum(amount)} OMR]`, `Cont. ${r.contract||'?'}`);
  toast(`💰 Carry-forward credit updated: ${fmtNum(old)} → ${fmtNum(amount)} OMR`);
  if(typeof renderDaily === 'function') renderDaily();
  return true;
}


// ── promptAdjustCarryForwardCredit — petite invite pour corriger le montant depuis l'UI ──
function promptAdjustCarryForwardCredit(rentalId){
  let r = DB.rentals.find(x => x.id === rentalId);
  if(!r || !r._carryForwardSourceId){ toast('⚠️ This contract has no linked carry-forward credit'); return; }
  let current = Number(r._carryForwardCredit || 0);
  let input = prompt(
    `Adjust the carry-forward credit linked to contract #${r.contract||'?'}\nCurrently recorded: ${fmtNum(current)} OMR\n\nEnter the amount this contract should actually use:`,
    current.toFixed(2)
  );
  if(input === null) return; // annulé
  setCarryForwardCreditAmount(rentalId, Number(input));
}


// Total des crédits reportés pour une source
function getCarryForwardTotal(sourceRentalId){
  let linked = DB.rentals.filter(r => r._carryForwardSourceId === sourceRentalId);
  return linked.reduce((sum, r) => sum + (Number(r._carryForwardCredit) || 0), 0);
}


// Rapport complet sur un crédit reporté
function getCarryForwardReport(rentalId){
  let r = DB.rentals.find(x => x.id === rentalId);
  if(!r) return null;
  let source = r._carryForwardSourceId ? DB.rentals.find(x => x.id === r._carryForwardSourceId) : null;
  if(!source) return null;
  let chain = getCarryForwardChain(source.id);
  let totalOriginal = Number(source.paid || 0);
  let totalRemaining = chain.filter(c => !c.isSource).reduce((s, c) => s + (Number(c.remaining) || 0), 0);
  let totalUsed = totalOriginal - totalRemaining;
  return {
    sourceContract: source.contract,
    sourceReceipt: source.receipt,
    originalAmount: totalOriginal,
    totalRemaining: totalRemaining,
    totalUsed: totalUsed,
    linkCount: chain.length - 1,
    chain: chain,
    currentRental: { contract: r.contract, remaining: Number(r._carryForwardCredit || 0) }
  };
}


// Valider l'intégrité du système CF
function validateCarryForwardIntegrity(){
  let issues = [];
  DB.rentals.forEach(r => {
    if(r._carryForwardSourceId){
      let source = DB.rentals.find(x => x.id === r._carryForwardSourceId);
      if(!source) issues.push({ type: 'MISSING_SOURCE', rental: r.contract, message: `#${r.contract} → missing source ${r._carryForwardSourceId}` });
      if(source && r._clientId !== source._clientId) issues.push({ type: 'CLIENT_MISMATCH', rental: r.contract, message: `#${r.contract} (${r._clientId}) ≠ #${source.contract} (${source._clientId})` });
      if(Number(r._carryForwardCredit || 0) <= 0 && r._carryForwardCredit !== undefined) issues.push({ type: 'INVALID_AMOUNT', rental: r.contract, message: `#${r.contract} amount: ${r._carryForwardCredit}` });
    } else if(r._carryForwardCredit){
      // FIX (2026-09) : détecte le cas "crédit fantôme" — un montant enregistré SANS
      // aucun _carryForwardSourceId (le bug corrigé ce jour : #r-cf-amount jamais
      // réinitialisé entre deux contrats). L'ancienne version ne scannait QUE les
      // contrats ayant déjà un sourceId, donc ne pouvait jamais détecter ce cas.
      issues.push({ type: 'CREDIT_WITHOUT_SOURCE', rental: r.contract, message: `#${r.contract} → ${fmtNum(Number(r._carryForwardCredit))} OMR déduits du BAL sans aucune source liée` });
    }
  });
  return { passed: issues.length === 0, issueCount: issues.length, issues: issues };
}


// Exporter données CF pour audit
function exportCarryForwardData(){
  let cfData = [];
  DB.rentals.forEach(r => {
    if(r._carryForwardSourceId || r._carryForwardCredit){
      cfData.push({
        rentalId: r.id,
        rentalContract: r.contract,
        clientId: r._clientId,
        sourceId: r._carryForwardSourceId,
        sourceContract: r._carryForwardSourceId ? (DB.rentals.find(x => x.id === r._carryForwardSourceId)||{}).contract : null,
        sourceReceipt: r._carryForwardSourceReceipt,
        creditAmount: Number(r._carryForwardCredit || 0),
        dateOut: r.dateOut,
        dateIn: r.dateIn || '(open)'
      });
    }
  });
  return cfData;
}
