// ═══════════════════════════════════════════════════════════════════════════
// module-director-filter.js — Filtre branche pour le Directeur
// Ajoute un sélecteur BARKA / MOEBELA / TOUTES dans Daily Rentals et Payments
// Actif UNIQUEMENT quand window.AUTH.isAdmin === true
// ═══════════════════════════════════════════════════════════════════════════

(function() {

  // ── État du filtre directeur ──────────────────────────────────────────
  window._directorBranchFilter = 'ALL'; // 'ALL' | 'BARKA' | 'MOEBELA'

  // ── Helper : est-ce que le login courant a le droit de voir le sélecteur
  // de branche (directeur OU comptable) ? Étendu (2026-09) : le comptable
  // voit déjà les deux branches (branches:['BARKA','MOEBELA']) mais n'avait
  // jusqu'ici aucun moyen de les regarder séparément — même filtre que le
  // directeur, en lecture seule (le rôle comptable ne peut de toute façon
  // plus écrire nulle part, voir la garde globale côté server.js). Le nom
  // de la fonction (isDirector) n'a pas été renommé pour limiter la portée
  // du changement — tous les appels existants en profitent tels quels. ──
  function isDirector() {
    return window.AUTH && (window.AUTH.isAdmin === true || window.AUTH.role === 'accountant');
  }

  // ── Helper : un rental/payment correspond-il au filtre actif ? ───────
  function matchesBranchFilter(item) {
    if (window._directorBranchFilter === 'ALL') return true;
    let b = (item.branch || '').trim().toUpperCase();
    return b.includes(window._directorBranchFilter);
  }

  // ── Injection HTML du sélecteur de branche ───────────────────────────
  function injectBranchSelector(containerId, refreshFn) {
    if (document.getElementById(containerId)) return; // déjà injecté
    let wrapper = document.createElement('div');
    wrapper.id = containerId;
    wrapper.style.cssText = 'display:inline-flex;align-items:center;gap:6px;margin-left:12px;vertical-align:middle;';
    wrapper.innerHTML = `
      <span style="font-size:.75rem;color:var(--muted);font-weight:600;letter-spacing:.5px;text-transform:uppercase;">${translate('dir.branch')}</span>
      <button id="${containerId}-all" data-dir-action="filter" data-branch="ALL" data-refresh="${refreshFn}"
        style="padding:3px 11px;border-radius:20px;border:1.5px solid rgba(255,255,255,.2);background:rgba(255,255,255,.12);color:#fff;font-size:.73rem;font-weight:700;cursor:pointer;transition:.15s">
        ${translate('dir.all')}
      </button>
      <button id="${containerId}-barka" data-dir-action="filter" data-branch="BARKA" data-refresh="${refreshFn}"
        style="padding:3px 11px;border-radius:20px;border:1.5px solid #2563eb;background:transparent;color:#2563eb;font-size:.73rem;font-weight:700;cursor:pointer;transition:.15s">
        ${translate('dir.barka')}
      </button>
      <button id="${containerId}-moebela" data-dir-action="filter" data-branch="MOEBELA" data-refresh="${refreshFn}"
        style="padding:3px 11px;border-radius:20px;border:1.5px solid #ea580c;background:transparent;color:#ea580c;font-size:.73rem;font-weight:700;cursor:pointer;transition:.15s">
        ${translate('dir.moebela')}
      </button>
    `;
    return wrapper;
  }

  // ── Mise à jour visuelle des boutons selon filtre actif ───────────────
  function updateBranchBtns(prefix) {
    let f = window._directorBranchFilter;
    let styles = {
      ALL:     { bg:'rgba(255,255,255,.18)', color:'#fff', border:'rgba(255,255,255,.4)' },
      BARKA:   { bg:'#2563eb', color:'#fff', border:'#2563eb' },
      MOEBELA: { bg:'#ea580c', color:'#fff', border:'#ea580c' },
    };
    let idleColor = { all:'#fff', barka:'#2563eb', moebela:'#ea580c' };
    ['all','barka','moebela'].forEach(k => {
      let btn = document.getElementById(prefix+'-'+k);
      if(!btn) return;
      let active = (k.toUpperCase() === f) || (k === 'all' && f === 'ALL');
      let s = active ? styles[k.toUpperCase() === 'ALL' ? 'ALL' : (k.toUpperCase())] : null;
      btn.style.background = active ? s.bg : 'transparent';
      btn.style.borderColor = active ? s.border : (k==='barka' ? '#2563eb' : (k==='moebela' ? '#ea580c' : 'rgba(255,255,255,.2)'));
      btn.style.color = active ? s.color : idleColor[k];
      btn.style.boxShadow = active ? '0 0 0 2px ' + s.border : 'none';
    });
  }

  // ── Fonction globale : changement de filtre ───────────────────────────
  window.setDirectorBranchFilter = function(branch, refreshFn) {
    window._directorBranchFilter = branch;
    updateBranchBtns('dir-daily-filter');
    updateBranchBtns('dir-pay-filter');
    if (refreshFn === 'renderDaily') { renderDaily(); }
    else if (refreshFn === 'renderPayments') { renderPayments(); }
    else if (refreshFn === 'both') { renderDaily(); renderPayments(); }
  };

  // ── Event delegation for data-dir-action buttons ──
  document.addEventListener('click', function(e) {
    const btn = e.target.closest('[data-dir-action]');
    if (!btn) return;
    e.preventDefault();
    const action = btn.dataset.dirAction;
    if (action === 'filter') {
      const branch = btn.dataset.branch;
      const refreshFn = btn.dataset.refresh;
      window.setDirectorBranchFilter(branch, refreshFn);
    }
  });

  // ════════════════════════════════════════════════════════════════════
  // PATCH renderDaily — wrap pour injecter le filtre directeur
  // ════════════════════════════════════════════════════════════════════
  const _origRenderDaily = window.renderDaily;
  window.renderDaily = function() {
    // ── Injecter le sélecteur dans l'entête de la page Daily ───────────
    if (isDirector()) {
      // Chercher un endroit dans le header de la page daily pour injecter
      let target = document.getElementById('daily-branch-filter-host');
      if (!target) {
        // Créer un hôte dans le header Daily (après le month-picker)
        let picker = document.getElementById('month-picker');
        if (picker && picker.parentElement) {
          let host = document.createElement('span');
          host.id = 'daily-branch-filter-host';
          picker.parentElement.appendChild(host);
        }
      }
      let host = document.getElementById('daily-branch-filter-host');
      if (host && !document.getElementById('dir-daily-filter')) {
        let sel = injectBranchSelector('dir-daily-filter', 'renderDaily');
        if (sel) host.appendChild(sel);
        updateBranchBtns('dir-daily-filter');
      }
    }

    // ── Sauvegarder les données originales ─────────────────────────────
    let origRentals  = DB.rentals;
    let origPayments = DB.payments;

    // ── Appliquer le filtre si directeur ──────────────────────────────
    if (isDirector() && window._directorBranchFilter !== 'ALL') {
      DB.rentals  = origRentals.filter(matchesBranchFilter);
      DB.payments = origPayments.filter(matchesBranchFilter);
    }

    // ── Appeler le renderDaily original ───────────────────────────────
    _origRenderDaily.apply(this, arguments);

    // ── Restaurer les données ──────────────────────────────────────────
    DB.rentals  = origRentals;
    DB.payments = origPayments;

    // ── Injecter les totaux par branche dans le header Monthly ─────────
    if (isDirector()) {
      _injectBranchTotalsDaily(origRentals, origPayments);
    }
  };

  // ── Calcul et affichage des totaux Barka / Moebela dans Daily ─────────
  function _injectBranchTotalsDaily(rentals, payments) {
    // On calcule les totaux sur les contrats du mois sélectionné
    let picker = document.getElementById('month-picker');
    let ym = (picker && picker.value) ? picker.value : (window._currentYm || new Date().toISOString().slice(0,7));

    let barkaRentals   = rentals.filter(r => (r.branch||'').toUpperCase().includes('BARKA') && (r.dateOut||'').startsWith(ym));
    let moebelaRentals = rentals.filter(r => { let b=(r.branch||'').toUpperCase(); return (b.includes('MOEBELA')||b.includes('MOABELA')||b.includes('MABELA')); } ).filter(r => (r.dateOut||'').startsWith(ym));

    let barkaTotal   = barkaRentals.reduce((s,r)   => s + Number(r.paid||0), 0);
    let moebelaTotal = moebelaRentals.reduce((s,r) => s + Number(r.paid||0), 0);
    let barkaCnt   = barkaRentals.length;
    let moebelaCnt = moebelaRentals.length;

    let existing = document.getElementById('dir-branch-summary-daily');
    if (existing) existing.remove();

    let container = document.getElementById('daily-container');
    if (!container) return;

    let div = document.createElement('div');
    div.id = 'dir-branch-summary-daily';
    div.style.cssText = 'display:flex;gap:10px;margin-bottom:12px;flex-wrap:wrap;';
    div.innerHTML = `
      <div style="flex:1;min-width:160px;background:#2563eb;border:1.5px solid #2563eb;border-radius:10px;padding:10px 16px;display:flex;align-items:center;gap:10px;">
        <span style="font-size:1.4rem">🔵</span>
        <div>
          <div style="font-size:.7rem;color:#fff;font-weight:700;text-transform:uppercase;letter-spacing:.5px">${translate('dir.barka').replace('🔵 ','')}</div>
          <div style="font-family:'IBM Plex Mono',monospace;font-size:1rem;font-weight:800;color:#fff">${fmtNum(barkaTotal)} <span style="font-size:.75rem;opacity:.85">OMR</span></div>
          <div style="font-size:.72rem;color:rgba(255,255,255,.85)">${barkaCnt} ${barkaCnt!==1?translate('dir.rentals'):translate('dir.rental')}</div>
        </div>
      </div>
      <div style="flex:1;min-width:160px;background:#ea580c;border:1.5px solid #ea580c;border-radius:10px;padding:10px 16px;display:flex;align-items:center;gap:10px;">
        <span style="font-size:1.4rem">🟣</span>
        <div>
          <div style="font-size:.7rem;color:#fff;font-weight:700;text-transform:uppercase;letter-spacing:.5px">${translate('dir.moebela').replace('🟣 ','')}</div>
          <div style="font-family:'IBM Plex Mono',monospace;font-size:1rem;font-weight:800;color:#fff">${fmtNum(moebelaTotal)} <span style="font-size:.75rem;opacity:.85">OMR</span></div>
          <div style="font-size:.72rem;color:rgba(255,255,255,.85)">${moebelaCnt} ${moebelaCnt!==1?translate('dir.rentals'):translate('dir.rental')}</div>
        </div>
      </div>
      <div style="flex:1;min-width:160px;background:rgba(163,230,53,.16);border:1.5px solid rgba(163,230,53,.5);border-radius:10px;padding:10px 16px;display:flex;align-items:center;gap:10px;">
        <span style="font-size:1.4rem">📊</span>
        <div>
          <div style="font-size:.7rem;color:#a3e635;font-weight:700;text-transform:uppercase;letter-spacing:.5px">${translate('dir.total')}</div>
          <div style="font-family:'IBM Plex Mono',monospace;font-size:1rem;font-weight:800;color:#fff">${fmtNum(barkaTotal+moebelaTotal)} <span style="font-size:.75rem;opacity:.7">OMR</span></div>
          <div style="font-size:.72rem;color:rgba(190,242,100,.85)">${barkaCnt+moebelaCnt} ${(barkaCnt+moebelaCnt)!==1?translate('dir.rentals'):translate('dir.rental')}</div>
        </div>
      </div>
    `;
    container.insertAdjacentElement('beforebegin', div);
  }

  // ════════════════════════════════════════════════════════════════════
  // PATCH renderPayments — wrap pour injecter le filtre directeur
  // ════════════════════════════════════════════════════════════════════
  const _origRenderPayments = window.renderPayments;
  window.renderPayments = function() {
    ensurePageLoaded('payments'); // avant tout accès DOM (pay-month, payments-container) : la page peut ne pas encore être hydratée si cette fonction est appelée hors navigation (ex: refreshAll())
    // ── Injecter le sélecteur dans Payments ───────────────────────────
    if (isDirector()) {
      let target = document.getElementById('pay-branch-filter-host');
      if (!target) {
        let payMonth = document.getElementById('pay-month');
        if (payMonth && payMonth.parentElement) {
          let host = document.createElement('span');
          host.id = 'pay-branch-filter-host';
          payMonth.parentElement.appendChild(host);
        }
      }
      let host = document.getElementById('pay-branch-filter-host');
      if (host && !document.getElementById('dir-pay-filter')) {
        let sel = injectBranchSelector('dir-pay-filter', 'renderPayments');
        if (sel) host.appendChild(sel);
        updateBranchBtns('dir-pay-filter');
      }
    }

    // ── Sauvegarder les données originales ────────────────────────────
    let origPayments = DB.payments;

    // ── Appliquer le filtre si directeur ─────────────────────────────
    if (isDirector() && window._directorBranchFilter !== 'ALL') {
      DB.payments = origPayments.filter(matchesBranchFilter);
    }

    // ── Appeler le renderPayments original ────────────────────────────
    _origRenderPayments.apply(this, arguments);

    // ── Restaurer les données ─────────────────────────────────────────
    DB.payments = origPayments;

    // ── Injecter les totaux par branche dans Payments ─────────────────
    if (isDirector()) {
      _injectBranchTotalsPayments(origPayments);
    }
  };

  // ── Calcul et affichage des totaux Barka / Moebela dans Payments ──────
  function _injectBranchTotalsPayments(payments) {
    let ym = document.getElementById('pay-month') ? document.getElementById('pay-month').value : '';
    let liste = payments.filter(p => !p._quickAdd);
    if (ym) liste = liste.filter(p => (p.dateOut||'').startsWith(ym));

    let barka   = liste.filter(p => (p.branch||'').toUpperCase().includes('BARKA'));
    let moebela = liste.filter(p => { let b=(p.branch||'').toUpperCase(); return b.includes('MOEBELA')||b.includes('MOABELA')||b.includes('MABELA'); });

    let bTotal = barka.reduce((s,p)   => s + Number(p.price||0), 0);
    let mTotal = moebela.reduce((s,p) => s + Number(p.price||0), 0);

    // Cash / Post / Transfert par branche
    let bCash = barka.filter(p=>(p.paymentMethod||'')  === 'CASH').reduce((s,p)=>s+Number(p.price||0),0);
    let bPost = barka.filter(p=>(p.paymentMethod||'')  === 'POST').reduce((s,p)=>s+Number(p.price||0),0);
    let mCash = moebela.filter(p=>(p.paymentMethod||'')  === 'CASH').reduce((s,p)=>s+Number(p.price||0),0);
    let mPost = moebela.filter(p=>(p.paymentMethod||'')  === 'POST').reduce((s,p)=>s+Number(p.price||0),0);

    let existing = document.getElementById('dir-branch-summary-pay');
    if (existing) existing.remove();

    let container = document.getElementById('payments-container');
    if (!container) return;

    let div = document.createElement('div');
    div.id = 'dir-branch-summary-pay';
    div.style.cssText = 'display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap;';
    div.innerHTML = `
      <div style="flex:1;min-width:180px;background:#2563eb;border:1.5px solid #2563eb;border-radius:10px;padding:10px 16px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <span style="font-size:1.2rem">🔵</span>
          <span style="font-size:.7rem;color:#fff;font-weight:700;text-transform:uppercase;letter-spacing:.5px">${translate('dir.barka').replace('🔵 ','')} — ${barka.length} ${translate('dir.transactions')}</span>
        </div>
        <div style="font-family:'IBM Plex Mono',monospace;font-size:1.05rem;font-weight:800;color:#fff;margin-bottom:4px">${fmtAmt(bTotal)} OMR</div>
        <div style="font-size:.71rem;color:rgba(255,255,255,.85);display:flex;gap:10px;">
          <span>💵 CASH: ${fmtAmt(bCash)}</span>
          <span>🏦 POST: ${fmtAmt(bPost)}</span>
        </div>
      </div>
      <div style="flex:1;min-width:180px;background:#ea580c;border:1.5px solid #ea580c;border-radius:10px;padding:10px 16px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <span style="font-size:1.2rem">🟣</span>
          <span style="font-size:.7rem;color:#fff;font-weight:700;text-transform:uppercase;letter-spacing:.5px">${translate('dir.moebela').replace('🟣 ','')} — ${moebela.length} ${translate('dir.transactions')}</span>
        </div>
        <div style="font-family:'IBM Plex Mono',monospace;font-size:1.05rem;font-weight:800;color:#fff;margin-bottom:4px">${fmtAmt(mTotal)} OMR</div>
        <div style="font-size:.71rem;color:rgba(255,255,255,.85);display:flex;gap:10px;">
          <span>💵 CASH: ${fmtAmt(mCash)}</span>
          <span>🏦 POST: ${fmtAmt(mPost)}</span>
        </div>
      </div>
      <div style="flex:1;min-width:180px;background:rgba(163,230,53,.16);border:1.5px solid rgba(163,230,53,.5);border-radius:10px;padding:10px 16px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <span style="font-size:1.2rem">📊</span>
          <span style="font-size:.7rem;color:#a3e635;font-weight:700;text-transform:uppercase;letter-spacing:.5px">${translate('dir.total')} — ${liste.length} ${translate('dir.transactions')}</span>
        </div>
        <div style="font-family:'IBM Plex Mono',monospace;font-size:1.05rem;font-weight:800;color:#fff;margin-bottom:4px">${fmtAmt(bTotal+mTotal)} OMR</div>
        <div style="font-size:.71rem;color:rgba(190,242,100,.85);display:flex;gap:10px;">
          <span>💵 ${fmtAmt(bCash+mCash)}</span>
          <span>🏦 ${fmtAmt(bPost+mPost)}</span>
        </div>
      </div>
    `;
    container.insertAdjacentElement('beforebegin', div);
  }

  // ════════════════════════════════════════════════════════════════════
  // PATCH renderOpenContracts — totaux par branche dans Open Contracts
  // ════════════════════════════════════════════════════════════════════
  const _origRenderOpenContracts = window.renderOpenContracts;
  window.renderOpenContracts = function(searchQuery) {
    let origRentals = DB.rentals;

    if (isDirector() && window._directorBranchFilter !== 'ALL') {
      DB.rentals = origRentals.filter(matchesBranchFilter);
    }

    _origRenderOpenContracts.apply(this, arguments);

    DB.rentals = origRentals;

    if (isDirector()) {
      _injectBranchTotalsOC(origRentals);
    }
  };

  function _injectBranchTotalsOC(rentals) {
    let picker = document.getElementById('month-picker');
    let ym = (picker && picker.value) ? picker.value : (window._currentYm || new Date().toISOString().slice(0,7));

    let opens = rentals.filter(r => {
      if(!r.dateIn || r.dateIn === '') return true;
      if(typeof isClosedAndSettled === 'function') return !isClosedAndSettled(r);
      return false;
    }).filter(r => (r.dateOut||'').startsWith(ym));

    let barka   = opens.filter(r => (r.branch||'').toUpperCase().includes('BARKA'));
    let moebela = opens.filter(r => { let b=(r.branch||'').toUpperCase(); return b.includes('MOEBELA')||b.includes('MOABELA')||b.includes('MABELA'); });

    let bBAL = barka.reduce((s,r) => {
      let b = typeof calcOpenContractBAL==='function' ? calcOpenContractBAL(r) : Number((r.price||0)-(r.paid||0));
      return s + Math.max(0, Number(b||0));
    }, 0);
    let mBAL = moebela.reduce((s,r) => {
      let b = typeof calcOpenContractBAL==='function' ? calcOpenContractBAL(r) : Number((r.price||0)-(r.paid||0));
      return s + Math.max(0, Number(b||0));
    }, 0);

    let existing = document.getElementById('dir-branch-summary-oc');
    if (existing) existing.remove();

    let ocHeader = document.getElementById('open-contracts-header') || document.getElementById('oc-count-badge');
    if (!ocHeader) return;
    let parent = ocHeader.closest('.table-wrap') || ocHeader.parentElement;
    if (!parent) return;

    let div = document.createElement('div');
    div.id = 'dir-branch-summary-oc';
    div.style.cssText = 'display:flex;gap:8px;margin:8px 0 4px;flex-wrap:wrap;padding:0 4px;';
    div.innerHTML = `
      <span style="background:#2563eb;color:#fff;border:1px solid #2563eb;border-radius:20px;padding:2px 10px;font-size:.72rem;font-weight:700;">
        ${translate('dir.barka')}: ${barka.length} ${translate('dir.open')} · BAL ${fmtNum(bBAL)} OMR
      </span>
      <span style="background:#ea580c;color:#fff;border:1px solid #ea580c;border-radius:20px;padding:2px 10px;font-size:.72rem;font-weight:700;">
        ${translate('dir.moebela')}: ${moebela.length} ${translate('dir.open')} · BAL ${fmtNum(mBAL)} OMR
      </span>
    `;
    parent.insertAdjacentElement('afterbegin', div);
  }

  // ── Re-reset filtre quand on change de mois ────────────────────────
  // Le filtre branche persist entre navigations — c'est voulu.
  // Si tu veux reset : décommente la ligne suivante dans les event listeners
  // du month-picker.

  console.log('[Director Filter] ✅ Module chargé — filtre branche actif pour le directeur');

})();
