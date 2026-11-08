// ── setMakhModelHeight (orig. line 12570) ──
window.setMakhModelHeight = function(heightCm){
  makh_modelHeight = heightCm + 'cm';
  const unitsEl = document.getElementById('makh-height-unit');
  if(unitsEl) unitsEl.textContent = translate('makh.topMargin') + makh_modelHeight;
  console.log('📏 Height changed to:', makh_modelHeight);
};

// ── makh_selectTemplate (orig. line 12577) ──
window.makh_selectTemplate = function(template){
  makh_selectedTemplate = template;
  
  // Update button styles
  ['local-closed', 'local-open', 'municipal-closed', 'municipal-open'].forEach(t => {
    const btn = document.getElementById('btn-'+t);
    if(t === template){
      btn.style.borderColor = 'var(--green)';
      btn.style.borderWidth = '2.5px';
      btn.style.background = 'rgba(34,197,94,.08)';
      btn.style.color = 'var(--green)';
    } else {
      btn.style.borderColor = 'var(--border)';
      btn.style.borderWidth = '2px';
      btn.style.background = 'var(--s1)';
      btn.style.color = 'var(--text)';
    }
  });
  
  // Show confirmation
  const names = {
    'local-closed': '📍 المخالفات المحلية - عقود مغلقة',
    'local-open': '📍 المخالفات المحلية - عقود مفتوحة',
    'municipal-closed': '🏛️ المخالفات البلدية - عقود مغلقة',
    'municipal-open': '🏛️ المخالفات البلدية - عقود مفتوحة'
  };
  
  const msgEl = document.getElementById('makh-selected-template');
  msgEl.textContent = '✅ تم اختيار: ' + names[template];
  msgEl.style.display = 'block';
  
  console.log('Template selected:', template);
};

// ── Template Management ──────────────────────────────────────────────────
let uploadedTemplates = {};

// ── openTemplateModal (orig. line 12614) ──
window.openTemplateModal = function(){
  document.getElementById('template-upload-modal').style.display = 'flex';
  checkTemplateStatus();
};

// ── closeTemplateModal (orig. line 12619) ──
window.closeTemplateModal = function(){
  document.getElementById('template-upload-modal').style.display = 'none';
};

// ── uploadTemplate (orig. line 12623) ──
window.uploadTemplate = function(type, file){
  if(!file) return;
  
  const formData = new FormData();
  formData.append('file', file);
  formData.append('templateType', type);
  
  console.log('📤 Uploading template:', type, file.name);
  
  fetch('/api/templates/upload', {
    method: 'POST',
    headers: authHeaders(),
    body: formData
  })
  .then(r => r.json())
  .then(data => {
    if(data.success){
      console.log('✅ Template uploaded:', type);
      uploadedTemplates[type] = true;
      document.getElementById('upload-' + type).style.borderColor = 'var(--green)';
      document.getElementById('upload-' + type).style.background = 'rgba(34,197,94,.1)';
      const label = document.getElementById('upload-' + type).querySelector('div:first-child');
      label.innerHTML = '✅ ' + label.innerHTML;
      checkTemplateStatus();
    } else {
      toast(translate('makh.templateError') + data.error);
    }
  })
  .catch(err => {
    console.error('Upload error:', err);
    toast('❌ خطأ في الرفع: ' + err.message);
  });
};

// ── checkTemplateStatus (orig. line 12656) ──
window.checkTemplateStatus = function(){
  fetch('/api/templates', { headers: authHeaders() })
    .then(r => {
      if(!r.ok || (r.headers.get('content-type')||'').indexOf('application/json') === -1) return null;
      return r.json();
    })
    .then(templates => {
      if(!templates) return;
      uploadedTemplates = Object.keys(templates);
      const statusEl = document.getElementById('templates-status');
      const count = uploadedTemplates.length;
      if(count === 4){
        statusEl.innerHTML = '✅ تم تحميل جميع النماذج (4/4)';
        statusEl.style.background = 'rgba(34,197,94,.1)';
        statusEl.style.color = 'var(--green)';
        statusEl.style.display = 'block';
      } else if(count > 0){
        statusEl.innerHTML = '⚠️ تم تحميل ' + count + ' من 4 نماذج';
        statusEl.style.background = 'rgba(217,119,6,.1)';
        statusEl.style.color = 'var(--yellow)';
        statusEl.style.display = 'block';
      } else {
        statusEl.style.display = 'none';
      }
    })
    .catch(() => {});
};

// Check templates on load
checkTemplateStatus();
// ══════════════════════════════════════════════════════════════
(function(){
  // ── Séparation محلية / بلدية (2026-09) ────────────────────────────────
  // Deux casiers indépendants en mémoire. makh_violations / makh_results
  // restent, dans tout le reste du fichier, "les données de la catégorie
  // actuellement affichée" — on les fait pointer vers le bon casier à
  // chaque changement d'onglet, et on les re-synchronise dans le casier
  // dès qu'ils sont réassignés (parse / matching). Aucune autre fonction
  // plus bas dans ce fichier n'a besoin d'être modifiée. ──
  let makh_dataByCategory = {
    local:      { violations: [], results: [] },
    municipal:  { violations: [], results: [] }
  };
  let makh_activeCategory = 'local';
  let makh_violations = makh_dataByCategory.local.violations;
  let makh_results    = makh_dataByCategory.local.results;

  // ── Persistance locale (2026-09) ────────────────────────────────────
  // makh_dataByCategory ne vivait qu'en mémoire JS : un simple F5 vidait
  // tout (retour à 0/0), même juste après un import réussi, car rien
  // n'était jamais écrit nulle part — l'import automatique ne rejouait
  // les fichiers qu'UNE fois (ack côté serveur), donc au rechargement
  // suivant il n'y avait plus rien à réimporter. Comme pour les bulletins
  // de plainte (shk_*, plus bas dans ce fichier), cette table n'a pas
  // d'équivalent côté serveur (VALID_TABLES) — on la persiste donc dans
  // le localStorage de CE navigateur. On ne sauvegarde que les violations
  // brutes ; les "results" du matching sont recalculés au chargement à
  // partir des contrats actuels (un contrat modifié entre-temps doit se
  // refléter, pas rester figé sur un ancien statut).
  const MAKH_STORAGE_KEY = 'fleetpro_makh_violations';
  // ── Garde-fou anti-écrasement (2026-09) ─────────────────────────────
  // Le poller _makhPollIncoming() (setInterval 8s, tout en bas de ce
  // fichier) démarre dès le chargement du script, indépendamment de la
  // page affichée — donc AVANT que makh_init() (déclenché seulement en
  // cliquant sur "Traffic Violations") ait pu appeler _makhLoadPersisted()
  // pour recharger l'état réel depuis le localStorage. Si le poller
  // traite un fichier entrant à ce moment-là, il ne met à jour qu'UNE
  // catégorie en mémoire (l'autre reste à son état vide par défaut du
  // script), puis _makhPersist() réécrivait les DEUX catégories — donc
  // écrasait silencieusement la catégorie non concernée avec [] alors
  // qu'elle avait de vraies données persistées. _makhPersistReady bloque
  // toute écriture tant que le chargement initial n'a pas eu lieu au
  // moins une fois dans cette session de page.
  let _makhPersistReady = false;
  // Le serveur est la source de vérité : tant qu'on n'a pas lu son état au moins
  // une fois (après chaque entrée dans le module), on ne lui POUSSE rien et on
  // n'importe pas de fichier — sinon un localStorage périmé l'écrase.
  let _makhServerReady = false;
  function _makhPersist(){
    if(!_makhPersistReady){
      console.warn('⏭️ [MAKH] Sauvegarde ignorée — état pas encore synchronisé avec le localStorage (évite d\'écraser des données existantes).');
      return;
    }
    try{
      localStorage.setItem(MAKH_STORAGE_KEY, JSON.stringify({
        local: { violations: makh_dataByCategory.local.violations },
        municipal: { violations: makh_dataByCategory.municipal.violations }
      }));
    } catch(e){ console.error('❌ Échec sauvegarde localStorage makh_violations:', e); }
    // ── Sync serveur (2026-09) ────────────────────────────────────────
    // Le localStorage seul faisait diverger le compte de مخالفات entre
    // postes : chaque navigateur ne voyait que ce qu'IL avait traité/ack
    // via /api/makh/incoming. On pousse maintenant vers cityrent.db
    // (table makh_violations) pour que tous les postes convergent vers
    // la même donnée. Fire-and-forget, même logique que l'ack de
    // _makhResolveIncoming plus bas — un échec réseau ponctuel ne doit
    // pas bloquer l'UI ; le localStorage reste le filet de secours local.
    if(!_makhServerReady) return;
    fetch('/api/makh/violations', {
      method: 'POST',
      headers: Object.assign({'Content-Type':'application/json'}, authHeaders()),
      body: JSON.stringify({
        local: makh_dataByCategory.local.violations,
        municipal: makh_dataByCategory.municipal.violations
      })
    }).catch(()=>{});
  }
  function _makhLoadPersisted(){
    try{
      const raw = localStorage.getItem(MAKH_STORAGE_KEY);
      if(!raw) return;
      const d = JSON.parse(raw);
      ['local','municipal'].forEach(cat => {
        const violations = (d[cat] && Array.isArray(d[cat].violations)) ? d[cat].violations : [];
        makh_dataByCategory[cat].violations = violations;
        makh_dataByCategory[cat].results = violations.length ? _computeMatchResults(violations, false) : [];
      });
      makh_violations = makh_dataByCategory[makh_activeCategory].violations;
      makh_results = makh_dataByCategory[makh_activeCategory].results;
    } catch(e){ console.error('❌ Échec lecture localStorage makh_violations:', e); }
    finally {
      // Que le parsing ait réussi ou échoué, on considère l'état mémoire
      // synchronisé avec ce qui existe réellement dans le localStorage —
      // ça débloque _makhPersist() pour les sauvegardes futures.
      _makhPersistReady = true;
    }
  }

  // ── Sync serveur (2026-09, corrigé) ──────────────────────────────────────
  // Va chercher l'état réel dans cityrent.db (table makh_violations).
  // RÈGLE D'OR : ne JAMAIS écraser silencieusement des données locales
  // non-vides. Un serveur vide juste après la migration ne veut pas dire
  // "il n'y a rien", ça veut dire "ce poste n'a encore rien poussé" :
  //   - serveur vide + local non-vide  → on POUSSE le local vers le serveur
  //     (migration), on ne touche pas à l'état local.
  //   - serveur non-vide + local vide  → on adopte le serveur (aucune perte
  //     possible, le local n'avait rien).
  //   - les deux non-vides et différents → FUSION par violationNum (union),
  //     jamais un écrasement pur — le prochain vrai import ROP refera un
  //     remplacement complet normal des deux côtés.
  // Asynchrone : appelée juste après _makhLoadPersisted() pour un premier
  // rendu instantané depuis le cache local pendant que la requête part.
  function _makhMergeKey(v){ return v.violationNum || (v.plate+'|'+v.date+'|'+v.time); }

  async function _makhSyncFromServer(){
    try{
      const r = await fetch('/api/makh/violations', { headers: authHeaders() });
      if(!r.ok) return;
      const d = await r.json();
      _makhServerReady = true;
      let changed = false;
      ['local','municipal'].forEach(cat => {
        const serverViolations = Array.isArray(d[cat]) ? d[cat] : [];
        const localViolations  = makh_dataByCategory[cat].violations;
        if(JSON.stringify(serverViolations) === JSON.stringify(localViolations)) return;

        if(!serverViolations.length && localViolations.length){
          // Serveur pas encore alimenté pour cette catégorie mais ce poste
          // a des données → on ne touche à RIEN ici ; changed=true déclenche
          // juste _updateCategoryCounts() plus bas, qui repoussera le local
          // vers le serveur via _makhPersist().
          changed = true;
          return;
        }

        if(serverViolations.length){
          // Le serveur fait foi (import = remplacement complet, jamais d'union :
          // une union ressuscitait les anciennes مخالفات déjà absentes du dernier Excel).
          makh_dataByCategory[cat].violations = serverViolations;
        }
        makh_dataByCategory[cat].results = makh_dataByCategory[cat].violations.length
          ? _computeMatchResults(makh_dataByCategory[cat].violations, false) : [];
        changed = true;
      });
      if(!changed) return;
      makh_violations = makh_dataByCategory[makh_activeCategory].violations;
      makh_results = makh_dataByCategory[makh_activeCategory].results;
      _updateCategoryCounts(); // persiste (localStorage + push serveur) via _saveActiveCategory()/_makhPersist()
      _renderActiveCategoryUI();
    } catch(e){
      // silencieux — même logique que _makhPollIncoming, le watchdog de core.js gère "serveur down"
    }
  }

  // ── Chargement immédiat au parsing du script (2026-09) ────────────────
  // AVANT, _makhLoadPersisted() n'était appelé que depuis makh_init(),
  // lui-même déclenché uniquement en cliquant sur "Traffic Violations".
  // Mais le poller _makhPollIncoming() (plus bas, setInterval 8s) démarre
  // dès le chargement du script, quelle que soit la page affichée — s'il
  // traitait un fichier entrant avant que l'utilisateur ait visité la
  // page, il sauvegardait un état où une seule catégorie était à jour et
  // l'autre encore vide par défaut, écrasant ses vraies données
  // persistées. En chargeant ici, tout de suite, makh_dataByCategory est
  // correct dès la première milliseconde du script, peu importe quand/si
  // l'utilisateur visite la page.
  _makhLoadPersisted();
  _makhSyncFromServer();

  function _saveActiveCategory(){
    makh_dataByCategory[makh_activeCategory].violations = makh_violations;
    makh_dataByCategory[makh_activeCategory].results = makh_results;
    _makhPersist();
  }

  function _updateCategoryCounts(){
    _saveActiveCategory();
    const lc = document.getElementById('makh-cat-count-local');
    const mc = document.getElementById('makh-cat-count-municipal');
    if(lc) lc.textContent = makh_dataByCategory.local.results.length;
    if(mc) mc.textContent = makh_dataByCategory.municipal.results.length;
  }

  // Réaffiche l'UI (stats + tableau + zone d'infos fichier) pour la
  // catégorie actuellement chargée dans makh_violations/makh_results.
  function _renderActiveCategoryUI(){
    const infoEl = document.getElementById('makh-file-info');
    if(makh_violations.length){
      infoEl.style.display = 'block';
      infoEl.innerHTML = '📂 <span style="color:var(--green);font-weight:700">' + makh_violations.length + ' مخالفة</span> (محفوظة لهذه الفئة)';
    } else {
      infoEl.style.display = 'none';
    }

    if(makh_results.length){
      const total = makh_results.length;
      const match = makh_results.filter(r=>r.matchStatus==='match').length;
      const nomatch = makh_results.filter(r=>r.matchStatus==='nomatch').length;
      const out = makh_results.filter(r=>r.matchStatus==='outofdate').length;
      document.getElementById('makh-st-total').textContent = total;
      document.getElementById('makh-st-match').textContent = match;
      document.getElementById('makh-st-nomatch').textContent = nomatch;
      document.getElementById('makh-st-out').textContent = out;
      document.getElementById('makh-stats').style.display = 'grid';
      document.getElementById('makh-step2').style.display = 'block';
      document.getElementById('makh-step3').style.display = 'block';
      makh_renderTable();
    } else {
      document.getElementById('makh-stats').style.display = 'none';
      document.getElementById('makh-step2').style.display = 'none';
      document.getElementById('makh-step3').style.display = 'none';
      document.getElementById('makh-tbody').innerHTML = '';
      document.getElementById('makh-sel-count').textContent = '0';
    }
  }

  // ── makh_switchCategory: bascule entre محلية et بلدية ─────────────────
  window.makh_switchCategory = function(cat){
    if(cat !== 'local' && cat !== 'municipal') return;
    if(cat === makh_activeCategory){ _renderActiveCategoryUI(); return; }

    _saveActiveCategory();
    makh_activeCategory = cat;
    makh_violations = makh_dataByCategory[cat].violations;
    makh_results = makh_dataByCategory[cat].results;

    ['local','municipal'].forEach(c => {
      const btn = document.getElementById('makh-cat-btn-' + c);
      if(!btn) return;
      if(c === cat){
        btn.style.background = 'var(--blue)';
        btn.style.color = '#fff';
        btn.classList.add('active');
      } else {
        btn.style.background = 'var(--s2)';
        btn.style.color = 'var(--muted)';
        btn.classList.remove('active');
      }
    });

    _renderActiveCategoryUI();
    _updateCategoryCounts();
    _makhFilterTemplateButtons(cat);
  };

  // ── N'affiche que les 2 modèles pertinents pour la catégorie active
  // (محلية → عقود مغلقة/مفتوحة محلية seulement, بلدية → idem بلدية) au lieu
  // des 4 en permanence. Si l'un des 2 modèles cachés était sélectionné,
  // on retombe sur le modèle "عقود مغلقة" de la catégorie active. ──
  function _makhFilterTemplateButtons(cat){
    document.querySelectorAll('[data-makh-cat]').forEach(btn => {
      btn.style.display = (btn.getAttribute('data-makh-cat') === cat) ? '' : 'none';
    });
    // Si le modèle actuellement sélectionné appartient à l'autre catégorie
    // (désormais cachée), on retombe sur "عقود مغلقة" de la catégorie active.
    if(!makh_selectedTemplate || !makh_selectedTemplate.startsWith(cat + '-')){
      window.makh_selectTemplate(cat + '-closed');
    }
  }

  // Init date when page loads
// ── makh_init (orig. line 12692) ──
  window.makh_init = function(){
    ensurePageLoaded('makhalatat');
    const d = document.getElementById('makh-doc-date');
    if(d && !d.value) d.value = new Date().toISOString().slice(0,10);
    // Recharge depuis localStorage à chaque entrée dans le module (pas une
    // seule fois au chargement du script) : à ce moment DB.rentals est déjà
    // chargé, donc le matching recalculé ici reflète les contrats actuels
    // — pas figé sur l'état des contrats au moment de l'import initial.
    _makhLoadPersisted();
    _makhServerReady = false; // bloque tout push jusqu'à la fin de la sync
    _makhSyncFromServer();
    _updateCategoryCounts();
    _makhFilterTemplateButtons(makh_activeCategory);
    if(makh_results.length) _renderActiveCategoryUI();
  };

// ── makh_resetAll (orig. line 12697) ── ne vide que la catégorie active
  window.makh_resetAll = function(){
    makh_violations = [];
    makh_results = [];
    _saveActiveCategory();
    document.getElementById('makh-step2').style.display = 'none';
    document.getElementById('makh-step3').style.display = 'none';
    document.getElementById('makh-stats').style.display = 'none';
    document.getElementById('makh-file-info').style.display = 'none';
    document.getElementById('makh-excel-input').value = '';
    document.getElementById('makh-tbody').innerHTML = '';
    document.getElementById('makh-sel-count').textContent = '0';
    _updateCategoryCounts();
  };

// ── makh_handleDrop (orig. line 12709) ──
  window.makh_handleDrop = function(e){
    e.preventDefault();
    document.getElementById('makh-dropzone').style.borderColor = '';
    const f = e.dataTransfer.files[0];
    if(f) makh_handleFile(f);
  };

// ── makh_handleFile (updated 2026-09: format sniffing) ──────────────────
// Le bouton "تنزيل بصيغة Excel" du site ROP ne génère PAS un vrai binaire
// xlsx/xls : il exporte le GridView ASP.NET tel quel en HTML, encodé en
// UTF-16LE, avec une extension .xls. On sniffe donc le contenu réel du
// fichier (peu importe son extension) avant de choisir comment le lire :
//   - PK.....................  → vrai .xlsx (zip/OOXML)      → SheetJS binaire
//   - D0 CF 11 E0............  → vrai .xls  (OLE compound)   → SheetJS binaire
//   - BOM FF FE / FE FF + <table>  → export ROP (HTML/UTF-16) → parseur HTML
//   - sinon, si le texte contient <table> (UTF-8 sans BOM)   → parseur HTML
  window.makh_handleFile = function(file){
    if(!file) return;
    const infoEl = document.getElementById('makh-file-info');
    infoEl.style.display = 'block';
    infoEl.innerHTML = '📂 <strong>' + file.name + '</strong> — جاري القراءة...';

    const sniff = new FileReader();
    sniff.onload = function(e){
      const buf = e.target.result;
      const b = new Uint8Array(buf);

      const isZip = b[0] === 0x50 && b[1] === 0x4B;                                   // "PK"
      const isOle = b[0] === 0xD0 && b[1] === 0xCF && b[2] === 0x11 && b[3] === 0xE0;  // OLE compound
      const isUtf16LE = b[0] === 0xFF && b[1] === 0xFE;
      const isUtf16BE = b[0] === 0xFE && b[1] === 0xFF;

      if(isZip || isOle){
        _loadXlsxThen(() => _readExcelBinary(file, infoEl));
        return;
      }

      // Pas un binaire Excel reconnu → on tente de le décoder comme texte/HTML
      let text;
      try{
        if(isUtf16LE) text = new TextDecoder('utf-16le').decode(buf);
        else if(isUtf16BE) text = new TextDecoder('utf-16be').decode(buf);
        else text = new TextDecoder('utf-8').decode(buf);
      } catch(err){
        console.error('❌ Erreur de décodage:', err);
        toast('❌ تعذر قراءة الملف: ترميز غير مدعوم');
        return;
      }

      if(/<table/i.test(text)){
        console.log('📊 Fichier HTML détecté (export ROP), décodage en cours...');
        try{
          const raw = _htmlTableToRows(text);
          console.log('Total rows:', raw.length);
          for(let i = 0; i < Math.min(3, raw.length); i++) console.log(`  Row ${i}:`, raw[i]);

          makh_parseViolations(raw);
          console.log('✅ Violations parsed:', makh_violations.length);
          infoEl.innerHTML = '📂 <strong>' + file.name + '</strong> — <span style="color:var(--green);font-weight:700">' + makh_violations.length + ' مخالفة</span> تم استيرادها';
          makh_runMatching();
        } catch(err){
          console.error('❌ HTML parse error:', err);
          toast('❌ خطأ في قراءة الملف: ' + err.message);
        }
      } else {
        // Dernier recours : peut-être un vrai binaire que le sniffing n'a pas reconnu
        _loadXlsxThen(() => _readExcelBinary(file, infoEl));
      }
    };
    sniff.readAsArrayBuffer(file);
  };

  function _loadXlsxThen(cb){
    if(typeof XLSX !== 'undefined'){ cb(); return; }
    const xlsxCdnUrls = [
      'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
      'https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js'
    ];
    let idx = 0;
    const loadXlsx = () => {
      if(idx >= xlsxCdnUrls.length){
        console.error('❌ Impossible de charger XLSX depuis tous les CDN');
        toast('❌ Impossible de charger la bibliothèque Excel (vérifiez la connexion)');
        return;
      }
      const s = document.createElement('script');
      s.src = xlsxCdnUrls[idx];
      s.onload = cb;
      s.onerror = () => { idx++; loadXlsx(); };
      document.head.appendChild(s);
    };
    loadXlsx();
  }

  // ── Parseur pour l'export "faux Excel" de ROP : convertit le <table>
  // HTML en le même format array-of-arrays que XLSX.utils.sheet_to_json
  // produirait, pour que makh_parseViolations() n'ait besoin d'aucun
  // changement (elle détecte déjà les colonnes par en-tête arabe). ──
  function _htmlTableToRows(html){
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const table = doc.querySelector('table');
    if(!table) return [];
    const rows = [];
    table.querySelectorAll('tr').forEach(tr => {
      const cells = Array.from(tr.querySelectorAll('th,td')).map(cell => cell.textContent.replace(/\s+/g,' ').trim());
      rows.push(cells);
    });
    return rows;
  }

  function _readExcelBinary(file, infoEl){
    const r = new FileReader();
    r.onload = function(e){
      try{
        const wb = XLSX.read(e.target.result, {type:'binary', cellDates:true});
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(ws, {header:1, raw:false, dateNF:'yyyy-mm-dd'});
        
        console.log('📊 Excel file loaded:');
        console.log('Sheet name:', wb.SheetNames[0]);
        console.log('Total rows:', raw.length);
        console.log('First 3 rows:');
        for(let i = 0; i < Math.min(3, raw.length); i++){
          console.log(`  Row ${i}:`, raw[i]);
        }
        
        makh_parseViolations(raw);
        console.log('✅ Violations parsed:', makh_violations.length);
        if(makh_violations.length > 0){
          console.log('First violation:', makh_violations[0]);
        }
        
        infoEl.innerHTML = '📂 <strong>' + file.name + '</strong> — <span style="color:var(--green);font-weight:700">' + makh_violations.length + ' مخالفة</span> تم استيرادها';
        makh_runMatching();
      } catch(err){
        console.error('❌ Excel read error:', err);
        toast('❌ خطأ في قراءة Excel: ' + err.message);
      }
    };
    r.readAsBinaryString(file);
  }

  // ── _extractViolationsFromRows (2026-09) : logique de parsing pure,
  // extraite de makh_parseViolations pour être réutilisable par
  // l'import automatique (Downloads) SANS écraser makh_violations —
  // celui-ci fait juste rows → tableau d'objets vio, aucun effet de bord. ──
  function _extractViolationsFromRows(rows, verbose){
    const log = verbose === false ? function(){} : console.log.bind(console);
    // Diagnostic (2026-09) : toujours actif, même en mode silencieux
    // (import auto), pour comprendre pourquoi une extraction ressort à 0
    // sans avoir à relancer manuellement avec verbose:true.
    const diag = console.log.bind(console, '%c[MAKH DIAG]', 'color:#f59e0b;font-weight:700');
    const out = [];
    if(rows.length < 2) {
      log('❌ Not enough rows:', rows.length);
      diag('rows insuffisantes:', rows.length, '— contenu:', rows);
      return out;
    }

    let headerIdx = 0;
    let headerFound = false;
    log('🔍 Searching for header row...');
    for(let i=0;i<Math.min(5,rows.length);i++){
      const row = rows[i].join(' ');
      log(`  Row ${i}:`, rows[i]);
      if(row.includes('اللوحة') || row.includes('المخالفة') || row.includes('التسجيل')){
        headerIdx=i;
        headerFound = true;
        log(`✅ Header found at row ${i}`);
        break;
      }
    }
    if(!headerFound){
      diag('⚠️ Aucune ligne d\'en-tête reconnue (اللوحة/المخالفة/التسجيل absents) — on utilise la ligne 0 par défaut. Lignes examinées:', rows.slice(0, 5));
    }

    const headers = rows[headerIdx];
    log('Headers:', headers);

    const colMap = {};
    headers.forEach((h,i)=>{
      if(!h) return;
      const ht = String(h).trim();
      if(ht.includes('المخالفة') && ht.includes('رقم')) { colMap.violationNum = i; log(`  Column ${i}: violationNum`); }
      else if(ht.includes('اللوحة')) { colMap.plate = i; log(`  Column ${i}: plate`); }
      else if(ht.includes('التسجيل')) { colMap.date = i; log(`  Column ${i}: date`); }
      else if(ht.includes('الوقت')) { colMap.time = i; log(`  Column ${i}: time`); }
      else if(ht.includes('وصف')) { colMap.desc = i; log(`  Column ${i}: desc`); }
      else if(ht.includes('المكان')) { colMap.location = i; log(`  Column ${i}: location`); }
    });

    log('Column mapping:', colMap);
    diag('headerIdx=' + headerIdx, '| headers bruts=', headers, '| colMap=', colMap);
    if(colMap.date === undefined || colMap.plate === undefined){
      diag('⚠️ Colonne date ou plaque introuvable dans les en-têtes ci-dessus — TOUTES les lignes seront rejetées. Vérifie le libellé exact des colonnes du fichier reçu.');
    }

    let skippedNoDate = 0, skippedNoPlate = 0, skippedBothMissing = 0, skippedEmptyRow = 0;
    const skippedSamples = [];

    for(let i=headerIdx+1;i<rows.length;i++){
      const row = rows[i];
      if(!row || row.every(c=>!c)) { skippedEmptyRow++; continue; }

      // Parse date - can be in format: D/M/YY or DD/MM/YYYY
      let dateRaw = String(row[colMap.date] || '').trim();
      let timeRaw = String(row[colMap.time] || '').trim() || '';
      let dateStr = '';

      // Normalize the date
      if(dateRaw){
        // If date includes time (e.g., "6/6/26 9:47"), extract time
        const dateTimeMatch = dateRaw.match(/^(.+?)\s+(\d{1,2}:\d{2})$/);
        if(dateTimeMatch){
          dateRaw = dateTimeMatch[1];
          if(!timeRaw) timeRaw = dateTimeMatch[2];
        }
        dateStr = makh_normDate(dateRaw);
      }

      let plateRaw = String(row[colMap.plate]||'').trim().replace(/^'/,'');

      const vio = {
        seq: out.length+1,
        violationNum: String(row[colMap.violationNum]||'').trim().replace(/^'/,''),
        plate: plateRaw,
        date: dateStr,
        time: timeRaw,
        desc: String(row[colMap.desc]||'').trim(),
        location: String(row[colMap.location]||'').trim(),
        name:'', nationality:'', license:'',
        selected:false, matchStatus:'pending', contract:'', contractStatus:''
      };

      if(dateStr && plateRaw) { // Only add if has date and plate
        out.push(vio);
        if(out.length <= 3) log(`  Violation ${out.length}:`, vio);
      } else {
        if(!dateStr && !plateRaw) skippedBothMissing++;
        else if(!dateStr) skippedNoDate++;
        else skippedNoPlate++;
        if(skippedSamples.length < 5) skippedSamples.push({ rowIndex:i, raw:row, dateRaw, dateStr, plateRaw });
      }
    }

    log(`✅ Total violations parsed: ${out.length}`);
    diag(`Résultat: ${out.length} ajoutées | rejetées → sans date+plaque:${skippedBothMissing} sans date seule:${skippedNoDate} sans plaque seule:${skippedNoPlate} lignes vides:${skippedEmptyRow}`);
    if(skippedSamples.length){
      diag('Échantillon de lignes rejetées (max 5):', skippedSamples);
    }
    return out;
  }

  function makh_parseViolations(rows){
    makh_violations = _extractViolationsFromRows(rows);
  }

  function makh_normDate(s){
    if(!s) return '';
    s = s.trim();
    
    // Format: with slashes - can be D/M/YY or M/D/YY (6/15/26 vs 6/6/26)
    const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if(m1){
      let p1 = parseInt(m1[1]);
      let p2 = parseInt(m1[2]);
      let p3 = m1[3];
      let day, month;
      
      // If p2 > 12, it must be day (so format is M/D/YY)
      if(p2 > 12) {
        month = p1;
        day = p2;
      } 
      // If p1 > 12, it must be day (so format is D/M/YY)
      else if(p1 > 12) {
        day = p1;
        month = p2;
      }
      // Ambiguous - assume M/D/YY (American format)
      else {
        month = p1;
        day = p2;
      }
      
      let year = p3;
      if(year.length === 2) year = '20' + year;
      
      day = String(day).padStart(2, '0');
      month = String(month).padStart(2, '0');
      
      return year + '-' + month + '-' + day;
    }
    
    // Format: DD-MM-YYYY or DD-MM-YY or D-M-YY (07-06-2026 or 7-6-26)
    const m2 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
    if(m2){
      let day = m2[1].padStart(2, '0');
      let month = m2[2].padStart(2, '0');
      let year = m2[3];
      if(year.length === 2) year = '20' + year;
      return year + '-' + month + '-' + day;
    }
    
    // Format: YYYY-MM-DD (already correct)
    const m3 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if(m3) return m3[1] + '-' + m3[2].padStart(2, '0') + '-' + m3[3].padStart(2, '0');
    
    return s;
  }

  // Normalize Arabic characters in plates to English (Omani standard)
  // Handles both: ط ح - 001234 and 1234-TH formats
  function makh_normalizeArabicPlate(plate){
    if(!plate) return '';
    
    // Map all Arabic character variants to English equivalents
    const arabicMap = {
      'ا':'A', 'أ':'A', 'إ':'A', 'آ':'A', 'ى':'A',
      'ب':'B', 'ط':'T', 'ت':'T', 'د':'D', 'و':'D',
      'ح':'H', 'ه':'H', 'ز':'Z', 'س':'S', 'ص':'S',
      'ش':'SH', 'ع':'A', 'غ':'GH', 'ف':'F', 'ق':'Q',
      'ك':'K', 'ل':'L', 'م':'M', 'ن':'N', 'ي':'Y'
    };
    
    let normalized = plate.toUpperCase().trim();
    
    // Replace Arabic characters with English equivalents
    Object.keys(arabicMap).forEach(ar => {
      normalized = normalized.replace(new RegExp(ar, 'g'), arabicMap[ar]);
    });
    
    // Remove spaces and hyphens temporarily to parse
    let clean = normalized.replace(/[\s\-]/g, '');
    
    // Extract letters and numbers
    let letters = '', numbers = '';
    for(let i = 0; i < clean.length; i++){
      const ch = clean[i];
      if(/[A-Z]/.test(ch)) letters += ch;
      else if(/[0-9]/.test(ch)) numbers += ch;
    }
    
    // Remove leading zeros from numbers
    numbers = numbers.replace(/^0+/, '') || '0';
    
    // Return standardized format: NUMBERS-LETTERS (e.g., 4868TH)
    return (numbers + letters).replace(/\s+/g, '');
  }

  function makh_getPlate(r){
    const v = r.vehicleId ? (DB.vehicles.find(x=>x.id===r.vehicleId)||{}) : {};
    const plateRaw = (v.plate || r._plate || r.plate || '').toUpperCase().replace(/\s+/g,'');
    return makh_normalizeArabicPlate(plateRaw);
  }

  // ── _computeMatchResults (2026-09) : logique de matching pure, extraite
  // de makh_runMatching pour être réutilisable sur une catégorie qui n'est
  // PAS celle affichée à l'écran (import auto en arrière-plan) — aucune
  // manipulation du DOM ici, juste violations[] → results[]. ──
  function _computeMatchResults(violations, verbose){
    const log = verbose === false ? function(){} : console.log.bind(console);
    const today = new Date().toISOString().slice(0,10);
    // Garde-fou (2026-09) : DB.rentals peut ne pas être encore chargé si ce
    // module s'initialise tôt (ex: page d'accueil) — sans ça, tout accès à
    // DB.rentals plantait ici en une exception synchrone qui coupait le
    // script entier (donc aussi le poll d'import auto, même à la toute
    // première ouverture).
    const rentals = (window.DB && Array.isArray(DB.rentals)) ? DB.rentals : [];
    log('🔍 DEBUG matching START — total:', violations.length, '— rentals DB:', rentals.length);

    return violations.map((v, idx) => {
      const vPlate = makh_normalizeArabicPlate(v.plate);
      const vDate  = v.date;
      log(`\n--- Violation ${idx+1} ---`);
      log('Raw plate:', v.plate, '→ Normalized:', vPlate);
      log('Violation date:', vDate);

      if(!vPlate || !vDate) {
        log('❌ Missing plate or date');
        return {...v, matchStatus:'nomatch', contract:'', contractStatus:''};
      }

      const plateRentals = rentals.filter(r => {
        const rPlate = makh_getPlate(r);
        const match = rPlate === vPlate;
        if(rPlate) log(`  Checking rental plate: ${rPlate} === ${vPlate}? ${match}`);
        return match;
      });

      log(`Found ${plateRentals.length} rentals with matching plate`);
      if(plateRentals.length === 0){
        log(`❌ No matches for plate ${vPlate}. All vehicle plates in DB:`, rentals.map(r => makh_getPlate(r)).filter((v,i,a)=>a.indexOf(v)===i).join(', '));
      }

      if(!plateRentals.length) {
        log('❌ No matching plates found');
        return {...v, matchStatus:'nomatch', contract:'', contractStatus:''};
      }

      const matched = plateRentals.find(r => {
        const dOut = r.dateOut ? r.dateOut.slice(0,10) : null;
        const dIn  = r.dateIn  ? r.dateIn.slice(0,10)  : today;
        const isDateMatch = vDate >= dOut && vDate <= dIn;
        log(`  Date check: ${vDate} between ${dOut} and ${dIn}? ${isDateMatch}`);
        if(!dOut) return false;
        return isDateMatch;
      });

      if(matched){
        log('✅ MATCH FOUND! Contract:', matched.contract);
        const isOpen = !matched.dateIn || matched.dateIn === '';
        let clientData = null;
        if(matched._clientId) clientData = (DB.clients||[]).find(c => c.id === matched._clientId);
        if(!clientData && matched.tel) clientData = (DB.clients||[]).find(c => c.tel === matched.tel);
        const autoName        = clientData ? (clientData.firstname||clientData.name||'') : (matched._clientName||matched.name||'');
        const autoNationality = clientData ? (clientData.nationality||'') : '';
        const autoLicense     = clientData ? (clientData.licence||'')     : '';
        return {...v, matchStatus:'match', contract:matched.contract||'', contractStatus:isOpen?'open':'closed',
          dateOut:matched.dateOut?matched.dateOut.slice(0,10):'', dateIn:matched.dateIn?matched.dateIn.slice(0,10):'OUT', tel:matched.tel||'',
          name: v.name || autoName,
          nationality: v.nationality || autoNationality,
          license: v.license || autoLicense
        };
      }
      log('⚠️ No date match (violation outside rental period)');
      return {...v, matchStatus:'outofdate', contract:'', contractStatus:'', message:'⚠️ تاريخ خارج الم'};
    });
  }

  function makh_runMatching(){
    makh_results = _computeMatchResults(makh_violations);

    console.log(`\n✅ Matching complete. Results:`);
    console.log(`  - Match: ${makh_results.filter(r=>r.matchStatus==='match').length}`);
    console.log(`  - Out of date: ${makh_results.filter(r=>r.matchStatus==='outofdate').length}`);
    console.log(`  - No plate: ${makh_results.filter(r=>r.matchStatus==='nomatch').length}`);

    // Stats
    const total = makh_results.length;
    const match = makh_results.filter(r=>r.matchStatus==='match').length;
    const nomatch = makh_results.filter(r=>r.matchStatus==='nomatch').length;
    const out = makh_results.filter(r=>r.matchStatus==='outofdate').length;
    document.getElementById('makh-st-total').textContent = total;
    document.getElementById('makh-st-match').textContent = match;
    document.getElementById('makh-st-nomatch').textContent = nomatch;
    document.getElementById('makh-st-out').textContent = out;
    document.getElementById('makh-stats').style.display = 'grid';
    document.getElementById('makh-step2').style.display = 'block';
    document.getElementById('makh-step3').style.display = 'block';
    makh_renderTable();
    _updateCategoryCounts();
  }

  // ══════════════════════════════════════════════════════════════
  // ── Import automatique depuis Downloads (2026-09) ──────────────────────
  // Le serveur (server.js) surveille C:\Users\Admin\Downloads en tâche de
  // fond, sniffe/parse les fichiers d'export ROP (.xls/.xlsx) qui y
  // atterrissent, et les met en file d'attente via /api/makh/incoming.
  // Ici on interroge cette file toutes les 8s.
  // Chaque export ROP est un instantané COMPLET (pas un delta) : il n'y a
  // qu'un seul fichier محلية et un seul بلدية à la fois, jamais plusieurs
  // à fusionner. Donc pour une catégorie donnée, le nouveau fichier
  // REMPLACE entièrement le casier — on ne fait plus d'union/dédoublonnage
  // qui accumulerait indéfiniment d'anciennes lignes. On garde quand même,
  // pour les violations toujours présentes dans le nouveau fichier
  // (même n° de contravention), les champs saisis à la main (nom,
  // nationalité, permis, sélection) — seule la liste change, pas le
  // travail déjà fait dessus. On accuse réception pour que le serveur
  // retire l'entrée. Si la catégorie n'a pas pu être déterminée côté
  // serveur (contenu ambigu), on affiche une petite invite pour que
  // l'utilisateur choisisse — jamais de classement automatique "à
  // l'aveugle" qui pourrait polluer le mauvais casier. ──
  function _replaceViolationsInCategory(cat, newViolations){
    const bucket = makh_dataByCategory[cat];
    if(!bucket) return 0;
    const oldByKey = new Map();
    bucket.violations.forEach(v => {
      oldByKey.set(v.violationNum || (v.plate+'|'+v.date+'|'+v.time), v);
    });
    bucket.violations = newViolations.map((v, i) => {
      const old = oldByKey.get(v.violationNum || (v.plate+'|'+v.date+'|'+v.time));
      if(old){
        v.name = old.name;
        v.nationality = old.nationality;
        v.license = old.license;
        v.selected = old.selected;
      }
      v.seq = i + 1;
      return v;
    });
    bucket.results = _computeMatchResults(bucket.violations, false);
    return bucket.violations.length;
  }

  function _makhResolveIncoming(entry, cat){
    console.log('%c[MAKH DIAG] Import auto —', 'color:#f59e0b;font-weight:700', entry.filename, '| catégorie choisie:', cat, '| lignes brutes reçues du serveur:', entry.rows ? entry.rows.length : 0, entry.rows);
    const extracted = _extractViolationsFromRows(entry.rows, false);
    const total = _replaceViolationsInCategory(cat, extracted);

    // Si la catégorie ingérée est celle actuellement affichée à l'écran,
    // on resynchronise les pointeurs actifs pour un rendu immédiat.
    if(cat === makh_activeCategory){
      makh_violations = makh_dataByCategory[cat].violations;
      makh_results = makh_dataByCategory[cat].results;
      _renderActiveCategoryUI();
    }
    _updateCategoryCounts();

    if(typeof toast === 'function'){
      const catName = cat === 'municipal' ? '🏛️ البلدية' : '📍 المحلية';
      toast('📥 ' + catName + ' — تم التحديث بآخر ملف (' + total + ' مخالفة) من ' + entry.filename);
    }

    fetch('/api/makh/incoming/ack', {
      method: 'POST',
      headers: Object.assign({'Content-Type':'application/json'}, authHeaders()),
      body: JSON.stringify({ id: entry.id })
    }).catch(()=>{});
  }

  function _makhPromptOffset(){
    return document.querySelectorAll('[id^="makh-cat-prompt-"]').length * 56;
  }

  function _makhShowCategoryPrompt(entry){
    if(document.getElementById('makh-cat-prompt-'+entry.id)) return; // déjà affiché
    const box = document.createElement('div');
    box.id = 'makh-cat-prompt-'+entry.id;
    box.style.cssText = 'position:fixed;bottom:'+(24+_makhPromptOffset())+'px;left:50%;transform:translateX(-50%);background:var(--s1);border:1.5px solid var(--border);border-radius:10px;padding:12px 16px;box-shadow:0 4px 16px rgba(0,0,0,.25);z-index:9999;display:flex;align-items:center;gap:10px;font-size:.82rem;color:var(--text)';
    box.innerHTML = '<span>📥 ' + escapeHtml(entry.filename) + ' — نوع المخالفة؟</span>';
    const mkBtn = (label, cat) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = 'background:var(--blue);color:#fff;border:none;border-radius:6px;padding:6px 12px;cursor:pointer;font-size:.78rem;font-weight:700';
      b.onclick = () => { _makhResolveIncoming(entry, cat); box.remove(); };
      return b;
    };
    box.appendChild(mkBtn('📍 محلية','local'));
    box.appendChild(mkBtn('🏛️ بلدية','municipal'));
    document.body.appendChild(box);
  }

  async function _makhPollIncoming(){
    if(!_makhServerReady) return; // on attend la lecture du serveur avant d'importer
    try{
      const r = await fetch('/api/makh/incoming', { headers: authHeaders() });
      if(!r.ok) return;
      const list = await r.json();
      if(!Array.isArray(list) || !list.length) return;
      list.forEach(entry => {
        if(entry.category === 'local' || entry.category === 'municipal'){
          _makhResolveIncoming(entry, entry.category);
        } else {
          _makhShowCategoryPrompt(entry);
        }
      });
    } catch(e){
      // silencieux — le watchdog de core.js gère déjà l'affichage "serveur down"
    }
  }

  setInterval(_makhPollIncoming, 8000);
  setTimeout(_makhPollIncoming, 5000);

// ── makh_filterTable (orig. line 13027) ──
  window.makh_filterTable = function(){
    makh_renderTable(
      document.getElementById('makh-search').value,
      document.getElementById('makh-filter-status').value
    );
  };

  function makh_renderTable(filter='', statusFilter='all'){
    const tbody = document.getElementById('makh-tbody');
    let data = makh_results.filter(r => {
      if(filter){
        const q = filter.toLowerCase();
        if(!r.violationNum.toLowerCase().includes(q) && !r.plate.toLowerCase().includes(q)) return false;
      }
      if(statusFilter==='match') return r.matchStatus==='match';
      if(statusFilter==='open') return r.matchStatus==='match' && r.contractStatus==='open';
      if(statusFilter==='closed') return r.matchStatus==='match' && r.contractStatus==='closed';
      if(statusFilter==='nomatch') return r.matchStatus==='nomatch' || r.matchStatus==='outofdate';
      return true;
    });

    tbody.innerHTML = data.map(r => {
      const idx = makh_results.indexOf(r);
      const bgStyle = r.matchStatus==='match'
        ? (r.contractStatus==='open' ? 'background:rgba(34,197,94,.22)' : 'background:rgba(34,197,94,.12)')
        : (r.matchStatus==='nomatch' ? 'background:rgba(220,38,38,.04)' : '');

      const statusBadge = r.matchStatus==='match'
        ? (r.contractStatus==='open'
           ? '<span style="display:inline-block;padding:2px 7px;border-radius:20px;font-size:.7rem;font-weight:700;background:rgba(217,119,6,.1);color:var(--yellow);border:1px solid rgba(217,119,6,.2)">🔓 عقد مفتوح</span>'
           : '<span style="display:inline-block;padding:2px 7px;border-radius:20px;font-size:.7rem;font-weight:700;background:rgba(22,163,74,.12);color:var(--green);border:1px solid rgba(22,163,74,.2)">✅ عقد مغلق</span>')
        : (r.matchStatus==='outofdate'
           ? '<span style="display:inline-block;padding:2px 7px;border-radius:20px;font-size:.7rem;font-weight:700;background:rgba(217,119,6,.1);color:var(--yellow);border:1px solid rgba(217,119,6,.2)">⚠️ تاريخ خارج المدة</span>'
           : '<span style="display:inline-block;padding:2px 7px;border-radius:20px;font-size:.7rem;font-weight:700;background:rgba(220,38,38,.1);color:var(--red);border:1px solid rgba(220,38,38,.2)">❌ لا يوجد</span>');

      const contractInfo = r.matchStatus==='match'
        ? '<div style="font-size:.7rem;color:var(--muted);margin-top:2px">'+(r.dateOut||'')+'←'+(r.dateIn==='OUT'?'<span style="color:var(--yellow)">OUT</span>':r.dateIn)+'</div>' : '';

      const inputStyle = 'background:var(--s2);border:1.5px solid #3b82f6;border-radius:5px;padding:4px 7px;font-size:.78rem;color:var(--text);outline:none;width:100%;min-width:110px;font-family:var(--font)';

      return '<tr style="'+bgStyle+'" data-idx="'+idx+'">'
        +'<td style="padding:7px 6px;border-bottom:1px solid var(--border);text-align:center"><input type="checkbox"'+(r.selected?' checked':'')+' onchange="makh_toggleRow('+idx+',this.checked)"></td>'
        +'<td style="padding:7px 6px;border-bottom:1px solid var(--border);font-family:var(--mono);color:var(--dim);font-size:.75rem">'+r.seq+'</td>'
        +'<td style="padding:7px 6px;border-bottom:1px solid var(--border)"><span style="font-family:var(--mono);font-weight:700;background:var(--s2);border:1px solid var(--border);border-radius:4px;padding:2px 6px;font-size:.78rem">'+r.violationNum+'</span></td>'
        +'<td style="padding:7px 6px;border-bottom:1px solid var(--border)"><span style="font-family:var(--mono);font-weight:700;background:var(--s2);border:1px solid var(--border);border-radius:4px;padding:2px 6px;font-size:.78rem">'+r.plate+'</span></td>'
        +'<td style="padding:7px 6px;border-bottom:1px solid var(--border);font-family:var(--mono);white-space:nowrap;font-size:.78rem">'+makh_dispDate(r.date)+'</td>'
        +'<td style="padding:7px 6px;border-bottom:1px solid var(--border);font-family:var(--mono);font-weight:700;font-size:.78rem">'+(r.time||'—')+'</td>'
        +'<td style="padding:7px 6px;border-bottom:1px solid var(--border);font-size:.73rem;max-width:140px;overflow:hidden">'+escapeHtml(r.desc)+'</td>'
        +'<td style="padding:7px 6px;border-bottom:1px solid var(--border)">'+statusBadge+contractInfo+'</td>'
        +'<td style="padding:7px 6px;border-bottom:1px solid var(--border);font-family:var(--mono);font-size:.78rem">'+(r.contract||'—')+'</td>'
        +`<td style="padding:7px 6px;border-bottom:1px solid var(--border)"><input style="${inputStyle}" placeholder="الاسم الكامل" value="${escapeHtml(r.name||'')}" onchange="makh_updateField(${idx},'name',this.value)"></td>`
        +`<td style="padding:7px 6px;border-bottom:1px solid var(--border)"><input style="${inputStyle};min-width:85px" placeholder="الجنسية" value="${escapeHtml(r.nationality||'')}" onchange="makh_updateField(${idx},'nationality',this.value)"></td>`
        +`<td style="padding:7px 6px;border-bottom:1px solid var(--border)"><input style="${inputStyle}" placeholder="رقم الرخصة" value="${escapeHtml(r.license||'')}" onchange="makh_updateField(${idx},'license',this.value)"></td>`
        +'</tr>';
    }).join('');

    makh_updateCount();
  }

  function makh_dispDate(d){
    if(!d) return '—';
    const p = d.split('-');
    return p.length===3 ? p[2]+'-'+p[1]+'-'+p[0] : d;
  }

// ── makh_updateField (orig. line 13092) ──
  window.makh_updateField = function(idx, field, val){
    makh_results[idx][field]=val;
    // Garde aussi la valeur sur l'objet "violation" source (bucket.violations)
    // — c'est lui qui sert de référence pour fusionner un futur import et
    // pour la persistance ; sans ça, une édition manuelle ne survivrait ni
    // à un nouvel import ROP ni à un simple F5.
    if(makh_violations[idx]) makh_violations[idx][field] = val;
    makh_updateCount();
    _saveActiveCategory();
  };
  window.makh_toggleRow   = function(idx, checked){
    makh_results[idx].selected=checked;
    if(makh_violations[idx]) makh_violations[idx].selected = checked;
    makh_updateCount();
    _saveActiveCategory();
  };
  window.makh_toggleAll   = function(checked){
    document.querySelectorAll('#makh-tbody input[type=checkbox]').forEach(cb => {
      const idx = parseInt(cb.closest('tr').dataset.idx);
      makh_results[idx].selected = checked; cb.checked = checked;
    });
    makh_updateCount();
  };
// ── makh_selectAllMatched (orig. line 13101) ──
  window.makh_selectAllMatched = function(){
    makh_results.forEach(r => { if(r.matchStatus==='match') r.selected=true; });
    makh_filterTable();
  };
// ── makh_clearSelection (orig. line 13105) ──
  window.makh_clearSelection = function(){
    makh_results.forEach(r => r.selected=false);
    makh_filterTable();
  };
  function makh_updateCount(){
    document.getElementById('makh-sel-count').textContent = makh_results.filter(r=>r.selected).length;
  }

  // ── Word generation (natif HTML→.doc, AUCUN CDN requis) ─────────────────
// ── makh_generateWord (orig. line 13114) ──
  window.makh_generateWord = function(){
    const selected = makh_results.filter(r=>r.selected);
    console.log('📄 Generate Word: Selected violations:', selected.length);

    if(!selected.length){
      toast('⚠️ حدد مخالفة واحدة على الأقل');
      console.warn('No violations selected');
      return;
    }

    // Check for required fields
    const incomplete = selected.filter(r => !r.name || !r.nationality || !r.license);
    if(incomplete.length){
      toast('⚠️ يجب ملء: الاسم والجنسية ورقم الرخصة لـ '+incomplete.length+' مخالفة');
      console.warn('Missing required fields in', incomplete.length, 'violations');
      return;
    }

    _buildWord(selected);
  };

  // ── Fallback: Excel export when Word fails ─────────────────────────────
// ── makh_generateExcel (orig. line 13174) ──
  window.makh_generateExcel = function(selected){
    console.log('📊 Generating Excel file for template:', makh_selectedTemplate);
    try{
      const templateConfigs = {
        'local-closed': {
          title: 'المخالفات المحلية - عقود مغلقة',
          subtitle: 'تحويل المخالفات المحلية والعقود المغلقة',
          icon: '📍'
        },
        'local-open': {
          title: 'المخالفات المحلية - عقود مفتوحة',
          subtitle: 'تحويل المخالفات المحلية والعقود المفتوحة',
          icon: '📍'
        },
        'municipal-closed': {
          title: 'المخالفات البلدية - عقود مغلقة',
          subtitle: 'تحويل المخالفات البلدية والعقود المغلقة',
          icon: '🏛️'
        },
        'municipal-open': {
          title: 'المخالفات البلدية - عقود مفتوحة',
          subtitle: 'تحويل المخالفات البلدية والعقود المفتوحة',
          icon: '🏛️'
        }
      };
      
      const config = templateConfigs[makh_selectedTemplate];
      
      // Create header row with template info
      const headerRows = [
        [config.icon + ' ' + config.title],
        [config.subtitle],
        [],
        ['م', 'الاسم', 'الجنسية', 'رقم رخصة القيادة', 'رقم المخالفة', 'رقم اللوحة', 'التاريخ', 'الوقت']
      ];
      
      const dataRows = selected.map((r, i) => [
        i + 1,
        r.name || '—',
        r.nationality || '—',
        r.license || '—',
        r.violationNum,
        r.plate,
        makh_dispDate(r.date),
        r.time || '—'
      ]);
      
      const allRows = [...headerRows, ...dataRows];
      const ws = XLSX.utils.aoa_to_sheet(allRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, config.title);
      
      // Set column widths
      ws['!cols'] = [
        {wch: 4},   // م
        {wch: 20},  // الاسم
        {wch: 15},  // الجنسية
        {wch: 18},  // رقم رخصة
        {wch: 15},  // رقم المخالفة
        {wch: 15},  // رقم اللوحة
        {wch: 15},  // التاريخ
        {wch: 10}   // الوقت
      ];
      
      const today = new Date().toISOString().slice(0,10).replace(/-/g,'');
      const filename = config.icon + '_' + makh_selectedTemplate.replace('-', '_') + '_' + today + '.xlsx';
      XLSX.writeFile(wb, filename);
      
      toast('✅ ملف Excel - '+config.title+' بـ '+selected.length+' مخالفة');
      console.log('✅ Excel file generated:', filename);
    } catch(err){
      console.error('Excel generation error:', err);
      toast('❌ خطأ في إنشاء الملف: '+err.message);
    }
  };

  function _buildWord(selected){
    try{
      console.log('🔨 Building Word document (native HTML, no CDN) for', selected.length, 'violations');
      console.log('📏 Model height:', makh_modelHeight);

      const dateVal = document.getElementById('makh-doc-date').value;
      const heightCmValue = parseFloat(makh_modelHeight) || 5.5;

      // Textes selon le modèle sélectionné (mêmes textes que la preview/impression)
      const tplTexts = {
        'local-closed':    { subject: 'الموضوع تحويل المخالفات المحلية',              note: '',                                    body: 'يرجي التفضل بالموافقة على تحويل المخالفات المحلية علي الفاضل المذكور اسمه ومعلوماته ادناه وحسب المتبع لديكم ونرفق لكم نسخه من عقد الايجار وملكيه السيارة واوراق المعني مختومة بختم الشركة وسوف تتحمل الشركة كامل المسؤولية في حال عدم صحة البيانات.' },
        'local-open':      { subject: 'الموضوع تحويل المخالفات المحلية',              note: 'ملاحظة : نُحيطكم علماً بأن العقود لا تزال سارية المفعول',       body: 'يرجي التفضل بالموافقة على تحويل المخالفات المحلية علي الفاضل المذكور اسمه ومعلوماته ادناه وحسب المتبع لديكم ونرفق لكم نسخه من عقد الايجار وملكيه السيارة واوراق المعني مختومة بختم الشركة وسوف تتحمل الشركة كامل المسؤولية في حال عدم صحة البيانات.' },
        'municipal-closed':{ subject: 'الموضوع تحويل مخالفات البلدية',               note: '',                                    body: 'يرجي التفضل بالموافقة على تحويل المخالفات المحلية علي الفاضل المذكور اسمه ومعلوماته ادناه وحسب المتبع لديكم ونرفق لكم نسخه من عقد الايجار وملكيه السيارة واوراق المعني مختومة بختم الشركة وسوف تتحمل الشركة كامل المسؤولية في حال عدم صحة البيانات.' },
        'municipal-open':  { subject: 'الموضوع تحويل مخالفات البلدية',               note: 'ملاحظة : نُحيطكم علماً بأن العقود لا تزال سارية المفعول',       body: 'يرجي التفضل بالموافقة على تحويل المخالفات المحلية علي الفاضل المذكور اسمه ومعلوماته ادناه وحسب المتبع لديكم ونرفق لكم نسخه من عقد الايجار وملكيه السيارة واوراق المعني مختومة بختم الشركة وسوف تتحمل الشركة كامل المسؤولية في حال عدم صحة البيانات.' }
      };
      const tpl = tplTexts[makh_selectedTemplate] || tplTexts['local-closed'];

      const rows = selected.map((r, i) => {
        return '<tr>'
          +'<td style="border:1px solid #2E75B6;padding:6px 8px;text-align:center;font-size:11pt">'+(i+1)+'</td>'
          +'<td style="border:1px solid #2E75B6;padding:6px 8px;text-align:center;font-size:11pt">'+(r.name?escapeHtml(r.name):'—')+'</td>'
          +'<td style="border:1px solid #2E75B6;padding:6px 8px;text-align:center;font-size:11pt">'+(r.nationality?escapeHtml(r.nationality):'—')+'</td>'
          +'<td style="border:1px solid #2E75B6;padding:6px 8px;text-align:center;font-size:11pt">'+(r.license?escapeHtml(r.license):'—')+'</td>'
          +'<td style="border:1px solid #2E75B6;padding:6px 8px;text-align:center;font-size:11pt">'+r.violationNum+'</td>'
          +'<td style="border:1px solid #2E75B6;padding:6px 8px;text-align:center;font-size:11pt">'+r.plate+'</td>'
          +'<td style="border:1px solid #2E75B6;padding:6px 8px;text-align:center;font-size:11pt">'+makh_dispDate(r.date)+'</td>'
          +'<td style="border:1px solid #2E75B6;padding:6px 8px;text-align:center;font-size:11pt">'+(r.time||'—')+'</td>'
          +'</tr>';
      }).join('');

      // Document Word natif au format HTML (aucune librairie/CDN nécessaire — Word l'ouvre directement)
      const html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">'
        +'<head><meta charset="UTF-8"><!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View>'
        +'<w:Zoom>100</w:Zoom><w:DoNotOptimizeForBrowser/></w:WordDocument></xml><![endif]-->'
        +'<style>'
        +'@page{size:21cm 29.7cm;margin:'+heightCmValue+'cm 2cm 1.5cm 2cm;}'
        +'body{font-family:Arial,Tahoma,sans-serif;font-size:11pt;direction:rtl;color:#000}'
        +'h3{text-align:center;font-size:12pt;margin-bottom:14px}'
        +'.hrow{margin:10px 0;font-size:11pt}'
        +'.subject{text-align:center;font-weight:bold;text-decoration:underline;margin:18px 0;font-size:11pt}'
        +'p{margin-bottom:14px;line-height:1.7;font-size:11pt;text-align:justify}'
        +'table{width:100%;border-collapse:collapse;margin:14px 0;mso-table-lspace:0pt;mso-table-rspace:0pt}'
        +'th{border:1px solid #2E75B6;padding:6px 8px;text-align:center;font-size:11pt;background:#D5E8F0;font-weight:bold}'
        +'.note{font-weight:bold;margin-top:12px;font-size:11pt;text-align:right}'
        +'.regards{text-align:center;margin-top:24px;font-size:11pt}'
        +'.sig{text-align:right;margin-top:36px;font-weight:bold;font-size:11pt}'
        +'</style></head><body dir="rtl">'
        +'<h3>الي الفاضل / مدير ادارة المخالفات المرورية المحترم</h3>'
        +'<table style="border:none;margin:0"><tr>'
        +'<td style="border:none;text-align:right;font-weight:bold">تحيه طيبه وبعد</td>'
        +'<td style="border:none;text-align:left;font-weight:bold">التاريخ: '+dateVal+'</td>'
        +'</tr></table>'
        +'<div class="subject">'+tpl.subject+'</div>'
        +'<p>'+tpl.body+'</p>'
        +'<table><tr><th>م</th><th>الاسم</th><th>الجنسية</th><th>رقم رخصه القيادة</th><th>رقم المخالفة</th><th>رقم اللوحة</th><th>تاريخ التسجيل</th><th>الوقت</th></tr>'
        +rows+'</table>'
        +(tpl.note ? '<div class="note">'+tpl.note+'</div>' : '')
        +'<div class="regards">وتفضلوا بقبول وافر الاحترام والتقدير</div>'
        +'<div class="sig">الأمضاء</div>'
        +'</body></html>';

      const blob = new Blob(['\ufeff'+html], {type:'application/msword'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const today = new Date().toISOString().slice(0,10).replace(/-/g,'');
      a.download = 'مخالفات_'+today+'.doc';
      console.log('📥 Starting download:', a.download);
      a.click();
      URL.revokeObjectURL(url);
      toast('✅ وثيقة Word بـ '+selected.length+' مخالفة — جاري التحميل');
    } catch(err){
      console.error('❌ Word generation error:', err);
      toast('❌ خطأ: '+err.message);
    }
  }

// ── makh_preview (orig. line 13384) ──
  window.makh_preview = function(){
    const selected = makh_results.filter(r=>r.selected);
    if(!selected.length){ toast('⚠️ حدد مخالفة واحدة على الأقل'); return; }
    const dateVal = document.getElementById('makh-doc-date').value;
    const docDate = makh_dispDate(dateVal);
    const headerCm = parseFloat(makh_modelHeight) || 5.5;

    // Textes selon le modèle sélectionné
    const tplTexts = {
      'local-closed':    { subject: 'الموضوع تحويل المخالفات المحلية',              note: '',                                    body: 'يرجي التفضل بالموافقة على تحويل المخالفات المحلية علي الفاضل المذكور اسمه ومعلوماته ادناه وحسب المتبع لديكم ونرفق لكم نسخه من عقد الايجار وملكيه السيارة واوراق المعني مختومة بختم الشركة وسوف تتحمل الشركة كامل المسؤولية في حال عدم صحة البيانات.' },
      'local-open':      { subject: 'الموضوع تحويل المخالفات المحلية',              note: 'ملاحظة : نُحيطكم علماً بأن العقود لا تزال سارية المفعول',       body: 'يرجي التفضل بالموافقة على تحويل المخالفات المحلية علي الفاضل المذكور اسمه ومعلوماته ادناه وحسب المتبع لديكم ونرفق لكم نسخه من عقد الايجار وملكيه السيارة واوراق المعني مختومة بختم الشركة وسوف تتحمل الشركة كامل المسؤولية في حال عدم صحة البيانات.' },
      'municipal-closed':{ subject: 'الموضوع تحويل مخالفات البلدية',               note: '',                                    body: 'يرجي التفضل بالموافقة على تحويل المخالفات المحلية علي الفاضل المذكور اسمه ومعلوماته ادناه وحسب المتبع لديكم ونرفق لكم نسخه من عقد الايجار وملكيه السيارة واوراق المعني مختومة بختم الشركة وسوف تتحمل الشركة كامل المسؤولية في حال عدم صحة البيانات.' },
      'municipal-open':  { subject: 'الموضوع تحويل مخالفات البلدية',               note: 'ملاحظة : نُحيطكم علماً بأن العقود لا تزال سارية المفعول',       body: 'يرجي التفضل بالموافقة على تحويل المخالفات المحلية علي الفاضل المذكور اسمه ومعلوماته ادناه وحسب المتبع لديكم ونرفق لكم نسخه من عقد الايجار وملكيه السيارة واوراق المعني مختومة بختم الشركة وسوف تتحمل الشركة كامل المسؤولية في حال عدم صحة البيانات.' }
    };
    const tpl = tplTexts[makh_selectedTemplate] || tplTexts['local-closed'];

    // Toutes les violations sélectionnées dans UNE seule page (un seul tableau, une ligne par violation)
    const rows = selected.map((r, i) => {
      return '<tr><td>'+(i+1)+'</td><td>'+(r.name?escapeHtml(r.name):'<span style="color:red">—</span>')+'</td>'
        +'<td>'+(r.nationality?escapeHtml(r.nationality):'<span style="color:red">—</span>')+'</td>'
        +'<td>'+(r.license?escapeHtml(r.license):'<span style="color:red">—</span>')+'</td>'
        +'<td>'+r.violationNum+'</td><td>'+r.plate+'</td>'
        +'<td>'+makh_dispDate(r.date)+'</td><td>'+(r.time||'—')+'</td></tr>';
    }).join('');

    const pages = '<div class="makh-page">'
      +'<h3>الي الفاضل / مدير ادارة المخالفات المرورية المحترم</h3>'
      +'<div class="makh-hrow"><span>تحيه طيبه وبعد</span><span>التاريخ: '+docDate+'</span></div>'
      +'<div class="makh-subject">'+tpl.subject+'</div>'
      +'<p>'+tpl.body+'</p>'
      +'<table><tr><th>م</th><th>الاسم</th><th>الجنسية</th><th>رقم رخصه القيادة</th><th>رقم المخالفة</th><th>رقم اللوحة</th><th>تاريخ التسجيل</th><th>الوقت</th></tr>'
      +rows+'</table>'
      +(tpl.note ? '<div class="makh-note">'+tpl.note+'</div>' : '')
      +'<div class="makh-regards">وتفضلوا بقبول وافر الاحترام والتقدير</div>'
      +'<div class="makh-sig">الأمضاء</div>'
      +'</div>';

    const win = window.open('','_blank','width=900,height=750');
    win.document.write('<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><style>'
      +'@page{size:A4;margin:0}'
      +'*{box-sizing:border-box;margin:0;padding:0}'
      +'body{font-family:Arial;font-size:15px;direction:rtl;background:#fff;color:#000}'
      +'.makh-page{'
      +'  padding-top:'+headerCm+'cm;'
      +'  padding-left:2cm;padding-right:2cm;padding-bottom:1.5cm;'
      +'  min-height:29.7cm;'
      +'  page-break-after:always;'
      +'}'
      +'.makh-page:last-child{page-break-after:auto}'
      +'h3{text-align:center;font-size:16px;margin-bottom:14px}'
      +'.makh-hrow{display:flex;justify-content:space-between;margin:10px 0;font-size:15px}'
      +'.makh-subject{text-align:center;font-weight:bold;text-decoration:underline;margin:18px 0;font-size:15px}'
      +'p{margin-bottom:14px;line-height:1.7;font-size:15px;text-align:justify}'
      +'table{width:100%;border-collapse:collapse;margin:14px 0}'
      +'th,td{border:1px solid #2E75B6;padding:6px 8px;text-align:center;font-size:14px}'
      +'th{background:#D5E8F0;font-weight:bold}'
      +'.makh-note{font-weight:bold;margin-top:12px;font-size:15px;text-align:right}'
      +'.makh-regards{text-align:center;margin-top:24px;font-size:15px}'
      +'.makh-sig{text-align:right;margin-top:36px;font-weight:bold;font-size:15px}'
      +'</style></head><body>'
      +pages
      +'<script>window.onload=function(){window.print();}<\/script></body></html>');
    win.document.close();
  };


  // ── Tab switching ─────────────────────────────────────────────
// ── makhSwitchTab (orig. line 13450) ──
  window.makhSwitchTab = function(tab) {
    const isViolations = tab === 'violations';
    document.getElementById('makh-tab-violations').style.display = isViolations ? '' : 'none';
    document.getElementById('makh-tab-complaint').style.display  = isViolations ? 'none' : '';
    document.getElementById('makh-tab-actions-violations').style.display = isViolations ? '' : 'none';
    document.getElementById('makh-tab-actions-complaint').style.display  = isViolations ? 'none' : '';
    const btnV = document.getElementById('makh-tab-btn-violations');
    const btnC = document.getElementById('makh-tab-btn-complaint');
    if(btnV){ btnV.style.background = isViolations ? 'var(--blue)' : 'var(--s2)'; btnV.style.color = isViolations ? '#fff' : 'var(--muted)'; }
    if(btnC){ btnC.style.background = isViolations ? 'var(--s2)' : 'var(--blue)'; btnC.style.color = isViolations ? 'var(--muted)' : '#fff'; }
    // Init complaint textarea on first open
    if(!isViolations) shk_initBody();
  };

  // ── Complaint / شكوى module ───────────────────────────────────
  let shk_headerCm = 5.5;
  let shk_bodyInited = false;

// ── shk_setHeight (orig. line 13468) ──
  window.shk_setHeight = function(val) {
    shk_headerCm = parseFloat(val) || 5.5;
    const lbl = document.getElementById('shk-height-label');
    if(lbl) lbl.textContent = 'Top margin: ' + shk_headerCm + 'cm';
  };

// ── shk_initBody (orig. line 13474) ──
  window.shk_initBody = function() {
    if(shk_bodyInited) return;
    shk_bodyInited = true;
    const ta = document.getElementById('shk-body');
    if(ta) ta.value = `إلى: [الجهة المختصة]

أتقدم أنا، [اسم المالك]، بصفتي مالكاً ممثلاً لمؤسسة [اسم المؤسسة] بتقديم هذا البلاغ ضد أحد المستأجرين، وذلك لمخالفته الجسيمة للالتزامات التعاقدية، على النحو التالي:

[تفاصيل الواقعة]

مقدم البلاغ:
[الاسم]
[المؤسسة]
رقم الهاتف: [الرقم]

التوقيع والختم:`;
  };

  // Format date for display: YYYY-MM-DD → YYYY/MM/DD
  function shk_fmtDate(val) {
    if(!val) return '............';
    return val.replace(/-/g, '/');
  }

  // ── Shared: gather form data ──────────────────────────────────
  function shk_getFormData() {
    return {
      name:        (document.getElementById('shk-name')?.value||'').trim() || '(غير مدوّن)',
      civil:       (document.getElementById('shk-civil')?.value||'').trim() || '—',
      nationality: (document.getElementById('shk-nationality')?.value||'').trim() || 'عُماني',
      phone:       (document.getElementById('shk-phone')?.value||'').trim() || '—',
      plate:       (document.getElementById('shk-plate')?.value||'').trim() || '—',
      cartype:     (document.getElementById('shk-cartype')?.value||'').trim() || '—',
      color:       (document.getElementById('shk-color')?.value||'').trim() || '—',
      year:        (document.getElementById('shk-year')?.value||'').trim() || '—',
      dateFrom:    document.getElementById('shk-date-from')?.value || '',
      dateTo:      document.getElementById('shk-date-to')?.value || '',
      body:        (document.getElementById('shk-body')?.value||'').trim(),
    };
  }

  // ── Shared: populate form from saved data ─────────────────────
  function shk_fillForm(d) {
    const setVal = (id, v) => { const el = document.getElementById(id); if(el) el.value = v||''; };
    setVal('shk-name', d.name === '(غير مدوّن)' ? '' : d.name);
    setVal('shk-civil', d.civil === '—' ? '' : d.civil);
    setVal('shk-nationality', d.nationality === '—' ? '' : d.nationality);
    setVal('shk-phone', d.phone === '—' ? '' : d.phone);
    setVal('shk-plate', d.plate === '—' ? '' : d.plate);
    setVal('shk-cartype', d.cartype === '—' ? '' : d.cartype);
    setVal('shk-color', d.color === '—' ? '' : d.color);
    setVal('shk-year', d.year === '—' ? '' : d.year);
    setVal('shk-date-from', d.dateFrom||'');
    setVal('shk-date-to', d.dateTo||'');
    setVal('shk-body', d.body||'');
    shk_bodyInited = true;
  }

  // ── Build print HTML from data ────────────────────────────────
  function shk_buildPrintHtml(d, headerCm) {
    const dateFrom = shk_fmtDate(d.dateFrom);
    const dateTo   = shk_fmtDate(d.dateTo);
    let bodyText = (d.body||'').replace('[تاريخ البداية]', dateFrom).replace('[تاريخ النهاية]', dateTo);
    const today = new Date();
    const docDate = today.getFullYear() + '/' + String(today.getMonth()+1).padStart(2,'0') + '/' + String(today.getDate()).padStart(2,'0');

    const tableRows = [
      ['الاسم الكامل',  d.name],
      ['الرقم المدني',  d.civil],
      ['الجنسية',       d.nationality],
      ['رقم اللوحة',    d.plate],
      ['نوع المركبة',   d.cartype],
      ['اللون',         d.color],
      ['الموديل',       d.year],
      ['رقم الهاتف',    d.phone],
    ].map(([k,v]) => `<tr>
      <td style="padding:5px 12px;border:1px solid #2E75B6;font-weight:700;background:#f0f6fb;width:42%;text-align:right">${k}</td>
      <td style="padding:5px 12px;border:1px solid #2E75B6;text-align:right">${v}</td>
    </tr>`).join('');

    // Split body into main paragraphs and footer block
    const footerKeywords = ['مقدم البلاغ', 'اسم المالك', 'مالك / اسم المؤسسة', 'رقم الهاتف: 95', 'التوقيع والختم'];
    const lines = bodyText.split('\n').map(l => l.trim());
    let footerStartIdx = -1;
    for(let i = 0; i < lines.length; i++) {
      if(footerKeywords.some(k => lines[i].startsWith(k))) { footerStartIdx = i; break; }
    }
    const mainLines  = footerStartIdx >= 0 ? lines.slice(0, footerStartIdx) : lines;
    const footerLines = footerStartIdx >= 0 ? lines.slice(footerStartIdx) : [];

    const mainHtml = mainLines.map(line => {
      if(!line) return '<div style="height:5px"></div>';
      return `<p style="margin:0 0 6px;line-height:1.75;text-align:justify">${line}</p>`;
    }).join('');

    const footerHtml = footerLines.map(line => {
      if(!line) return '<div style="height:4px"></div>';
      const isBold = ['مقدم البلاغ','اسم المالك','مالك /','رقم الهاتف','التوقيع والختم'].some(b => line.startsWith(b));
      return `<p style="margin:0 0 3px;line-height:1.7;${isBold?'font-weight:700':''}">${line}</p>`;
    }).join('');

    return `<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><style>
      @page{size:A4;margin:0}
      *{box-sizing:border-box;margin:0;padding:0}
      html,body{width:21cm;height:29.7cm;overflow:hidden;background:#fff}
      body{font-family:'Arial','Tahoma',sans-serif;color:#000}
      #shk-scaler{
        width:21cm;
        transform-origin:top right;
      }
      .shk-page{
        padding-top:${headerCm}cm;
        padding-right:2cm;padding-left:2cm;padding-bottom:1.2cm;
      }
      .shk-date{text-align:left;font-weight:700;margin-bottom:12px;font-size:13.5px}
      .shk-subject{font-weight:700;font-size:14px;margin:0 0 10px;line-height:1.7;text-align:right}
      .shk-to{font-size:13.5px;margin-bottom:8px;line-height:1.7}
      .shk-greeting{font-size:13.5px;margin-bottom:10px;line-height:1.7}
      .shk-intro{font-size:13.5px;margin-bottom:10px;line-height:1.8}
      .shk-tbl-title{font-weight:700;font-size:14px;text-decoration:underline;margin-bottom:8px}
      table.shk-tbl{width:100%;border-collapse:collapse;margin:0 0 12px;font-size:13px}
      table.shk-tbl th{padding:6px 14px;border:1.5px solid #2E75B6;background:#D5E8F0;text-align:right;font-weight:700;font-size:13.5px}
      table.shk-tbl td{padding:6px 14px;border:1px solid #2E75B6;font-size:13px}
      .shk-body{font-size:13.5px}
      .shk-footer{font-size:13.5px;margin-top:14px;text-align:left;direction:rtl}
      @media print{html,body{overflow:hidden}#shk-scaler{transform-origin:top right}}
    </style></head><body>
      <div id="shk-scaler">
        <div class="shk-page">
          <div class="shk-date">${docDate}</div>
          <div class="shk-subject"><strong>الموضوع:</strong> بلاغ شكوى ضد مستأجر لتأخير إعادة المركبة وعدم سداد المستحقات المالية</div>
          <div class="shk-to"><strong>إلى:</strong> سعادة الضابط المكلّف / مركز شرطة بركاء – المحترم</div>
          <div class="shk-greeting">تحية طيبة وبعد،</div>
          <div class="shk-intro">أتقدم أنا، <strong>اسم المالك</strong>، بصفتي مالك وممثل مؤسسة <strong>اسم المؤسسة</strong>، بتقديم هذا البلاغ الرسمي ضد أحد المستأجرين، وذلك لمخالفته الجسيمة لالتزاماته التعاقدية، على النحو التالي:</div>
          <div class="shk-tbl-title">بيانات المستأجر :</div>
          <table class="shk-tbl">
            <tr><th>البـيـان</th><th>التفاصـيـل</th></tr>
            ${tableRows}
          </table>
          <div class="shk-body">${mainHtml}</div>
          ${footerHtml ? `<div class="shk-footer">${footerHtml}</div>` : ''}
        </div>
      </div>
      <script>
        window.onload = function(){
          var scaler = document.getElementById('shk-scaler');
          var pageH = 29.7 * 37.795; // cm to px at 96dpi
          var contentH = scaler.scrollHeight;
          if(contentH > pageH){
            var ratio = pageH / contentH;
            scaler.style.transform = 'scale(' + ratio + ')';
          }
          window.print();
        };
      <\/script>
    </body></html>`;
  }

// ── shk_preview (orig. line 13639) ──
  window.shk_preview = function() {
    const d = shk_getFormData();
    const win = window.open('','_blank','width=900,height=750');
    win.document.write(shk_buildPrintHtml(d, shk_headerCm));
    win.document.close();
  };

  // ── Save complaint to DB ──────────────────────────────────────
// ── shk_save (orig. line 13647) ──
  window.shk_save = function(editId) {
    const d = shk_getFormData();
    if(!DB.complaints) DB.complaints = [];
    if(!DB.nextShkId) DB.nextShkId = 1;
    let _savedComplaint;
    if(editId !== undefined) {
      const idx = DB.complaints.findIndex(c => c.id === editId);
      if(idx !== -1) { DB.complaints[idx] = { ...DB.complaints[idx], ...d, updatedAt: new Date().toISOString() }; _savedComplaint = DB.complaints[idx]; }
    } else {
      _savedComplaint = { id: DB.nextShkId++, ...d, createdAt: new Date().toISOString() };
      DB.complaints.push(_savedComplaint);
    }
    // ── Persist: complaints n'ont PAS de table serveur — stockage localStorage uniquement.
    // (saveOne('complaints', ...) échouerait silencieusement — la table n'existe pas dans server.js) ──
    try {
      localStorage.setItem('fleetpro_complaints', JSON.stringify({ list: DB.complaints, nextShkId: DB.nextShkId }));
    } catch(e){
      console.error('❌ Échec sauvegarde localStorage complaints:', e);
      alert(translate('makh.saveFailed'));
    }
    shk_renderSavedList();
    // Clear form for new entry
    if(editId === undefined) {
      ['shk-name','shk-civil','shk-nationality','shk-phone','shk-plate','shk-cartype','shk-color','shk-year','shk-date-from','shk-date-to'].forEach(id => {
        const el = document.getElementById(id); if(el) el.value = '';
      });
      shk_bodyInited = false;
      shk_initBody();
    }
    // Show toast
    const t = document.createElement('div');
    t.textContent = editId !== undefined ? '✅ تم تحديث البلاغ' : '✅ تم حفظ البلاغ';
    Object.assign(t.style, {position:'fixed',bottom:'24px',left:'50%',transform:'translateX(-50%)',background:'#16a34a',color:'#fff',padding:'10px 22px',borderRadius:'8px',fontWeight:'700',fontSize:'.9rem',zIndex:'9999',boxShadow:'0 4px 16px rgba(0,0,0,.2)'});
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2400);
  };

  // ── Delete complaint ──────────────────────────────────────────
// ── shk_delete (orig. line 13678) ──
  window.shk_delete = function(id) {
    if(!confirm('حذف هذا البلاغ نهائياً؟')) return;
    DB.complaints = (DB.complaints||[]).filter(c => c.id !== id);
    // ── complaints n'a pas de table serveur : ne PAS appeler deleteOne('complaints', id) (échouerait) ──
    try {
      localStorage.setItem('fleetpro_complaints', JSON.stringify({ list: DB.complaints, nextShkId: DB.nextShkId }));
    } catch(e){
      console.error('❌ Échec suppression localStorage complaints:', e);
      alert(translate('makh.deleteFailed'));
    }
    shk_renderSavedList();
  };

  // ── Edit: load complaint into form ────────────────────────────
// ── shk_edit (orig. line 13687) ──
  window.shk_edit = function(id) {
    const c = (DB.complaints||[]).find(c => c.id === id);
    if(!c) return;
    shk_fillForm(c);
    // Scroll to top of form
    document.getElementById('makh-tab-complaint')?.scrollIntoView({behavior:'smooth'});
    // Change save button to update mode
    const saveBtn = document.getElementById('shk-save-btn');
    if(saveBtn) {
      saveBtn.textContent = '💾 تحديث البلاغ';
      saveBtn.onclick = () => { window.shk_save(id); saveBtn.textContent = '💾 حفظ البلاغ'; saveBtn.onclick = () => window.shk_save(); };
    }
  };

  // ── Render saved complaints list ──────────────────────────────
  function shk_renderSavedList() {
    const section = document.getElementById('shk-saved-list-section');
    const listEl  = document.getElementById('shk-saved-list');
    const countEl = document.getElementById('shk-saved-count');
    if(!section || !listEl) return;
    const list = DB.complaints || [];
    section.style.display = 'block';
    if(countEl) countEl.textContent = list.length;
    if(list.length === 0) {
      listEl.innerHTML = '<div style="text-align:center;padding:24px;color:var(--muted);font-size:.85rem">لا توجد بلاغات محفوظة</div>';
      return;
    }
    listEl.innerHTML = list.slice().reverse().map(c => {
      const fmtD = v => v ? v.replace(/-/g,'/') : '—';
      return `<div style="background:var(--s1);border:1px solid var(--border);border-radius:10px;padding:14px 16px;display:flex;align-items:center;gap:14px">
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:.9rem;margin-bottom:4px">📋 ${escapeHtml(c.name)||'—'} <span style="font-size:.72rem;color:var(--muted);font-weight:400;margin-right:8px">🪪 ${escapeHtml(c.civil)||'—'}</span></div>
          <div style="font-size:.75rem;color:var(--muted)">🚗 ${escapeHtml(c.plate)||'—'} · ${escapeHtml(c.cartype)||'—'} · 📅 ${fmtD(c.dateFrom)} → ${fmtD(c.dateTo)}</div>
          <div style="font-size:.68rem;color:var(--dim);margin-top:3px">${c.createdAt ? 'حُفظ: ' + c.createdAt.slice(0,10) : ''}</div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0">
          <button data-shk-action="preview" data-shk-id="${c.id}" title="طباعة" style="background:rgba(245,158,11,.1);border:1.5px solid #f59e0b;color:#f59e0b;border-radius:7px;width:34px;height:34px;cursor:pointer;font-size:1rem;display:flex;align-items:center;justify-content:center">🖨️</button>
          <button data-shk-action="edit" data-shk-id="${c.id}" title="تعديل" style="background:rgba(37,99,235,.1);border:1.5px solid var(--blue);color:var(--blue);border-radius:7px;width:34px;height:34px;cursor:pointer;font-size:1rem;display:flex;align-items:center;justify-content:center">✏️</button>
          <button data-shk-action="delete" data-shk-id="${c.id}" title="حذف" style="background:rgba(220,38,38,.08);border:1.5px solid var(--red);color:var(--red);border-radius:7px;width:34px;height:34px;cursor:pointer;font-size:1rem;display:flex;align-items:center;justify-content:center">🗑️</button>
        </div>
      </div>`;
    }).join('');
  }

  // ── Print a saved complaint directly ─────────────────────────
// ── shk_preview_saved (orig. line 13732) ──
  window.shk_preview_saved = function(id) {
    const c = (DB.complaints||[]).find(c => c.id === id);
    if(!c) return;
    const win = window.open('','_blank','width=900,height=750');
    win.document.write(shk_buildPrintHtml(c, shk_headerCm));
    win.document.close();
  };

  // ── Auto-render saved list when tab is shown ──────────────────
  const _origMakhSwitchTab = window.makhSwitchTab;
  if(_origMakhSwitchTab) {
    window.makhSwitchTab = function(tab) {
      _origMakhSwitchTab(tab);
      if(tab === 'complaint') { setTimeout(shk_renderSavedList, 80); }
    };
  }

    // Inject init into goTo
  const _origGoTo = window.goTo;
  if(_origGoTo){
    window.goTo = function(page, btn){
      _origGoTo(page, btn);
      if(page === 'makhalatat') window.makh_init();
    };
  }
})();

// ── Délégation d'événements (2026-08) — remplace les onclick= inline sur
// les 3 boutons de la liste des bulletins enregistrés, générés
// dynamiquement ci-dessus. Comportement strictement identique.
document.addEventListener('click', function(e){
  let btn = e.target.closest('[data-shk-action]');
  if(!btn) return;
  let id = Number(btn.dataset.shkId);
  let action = btn.dataset.shkAction;
  if(action === 'preview') window.shk_preview_saved(id);
  else if(action === 'edit') window.shk_edit(id);
  else if(action === 'delete') window.shk_delete(id);
});

// ── Initialisation du bouton "حفظ البلاغ" (2026-08) — ce bouton n'a
// jamais été câblé qu'en JS pur (saveBtn.onclick = ...), jamais en
// délégation, y compris dans le code d'origine (voir shk_edit ci-dessus
// qui réassigne .onclick pour repasser en mode "Update"). Il lui fallait
// donc un handler par défaut posé une fois au chargement — avant ça,
// c'était l'attribut onclick="shk_save()" du bouton dans app.html qui
// jouait ce rôle. Le HTML est déjà présent dans app.html (pas généré
// dynamiquement), donc pas besoin d'attendre un évènement : le bouton
// existe déjà au moment où ce module s'exécute. Comportement strictement
// identique.
(function(){
  let saveBtn = document.getElementById('shk-save-btn');
  if(saveBtn && !saveBtn.onclick) saveBtn.onclick = () => window.shk_save();
})();


