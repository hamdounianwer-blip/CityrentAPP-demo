// ── showMonthPaymentDetail (orig. line 6470) ──
function showMonthPaymentDetail(){
  let payments = window._monthPaymentsCache || [];
  let label = window._monthPaymentLabel || '—';
  let grandTotal = payments.reduce((s,p) => s + p.amount, 0);
  let html = `<div class="ph-contract-title">💰 ${translate('nav.payments')} — <strong>${label}</strong><br>
    <span style="font-size:.75rem;color:var(--muted);font-weight:400">${payments.length} ${payments.length!==1?translate('pay.transactions'):translate('pay.transaction')}</span></div>`;
  if(!payments.length){
    html += `<div class="ph-empty">${translate('pay.noPaymentsMonth')}</div>`;
  } else {
    payments.forEach((p,i) => {
      let d = (p.date||'').split('-');
      let dFmt = d.length===3 ? d[2]+'/'+d[1]+'/'+d[0] : (p.date||'—');
      html += `<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:1px solid var(--border);${i%2===0?'background:var(--s2)':''}">
        <span style="font-size:.85rem">💳</span>
        <span style="font-family:var(--mono);font-weight:700;color:var(--green);min-width:72px">${fmtNum(p.amount)} OMR</span>
        <span style="font-size:.78rem;color:var(--muted);min-width:80px">📅 ${dFmt}</span>
        <span style="font-size:.78rem;color:var(--muted)">${translate('col.contract')} <strong>${p.contract||'—'}</strong> · ${escapeHtml(p.name)} · ${escapeHtml(p.plate)}</span>
      </div>`;
    });
    html += `<div class="ph-total-row"><span class="ph-total-label">${translate('pay.total')} ${label}</span><span class="ph-total-amount">${fmtNum(grandTotal)} OMR</span></div>`;
  }
  document.getElementById('pay-history-content').innerHTML = html;
  openModal('modal-pay-history');
}
// ── toggleMonthBlock (orig. line 6494) ──
function toggleMonthBlock(id){ let block = document.getElementById(id); if(block) block.classList.toggle('collapsed'); }
// ── toggleDay (orig. line 6495) ──
function toggleDay(id){ document.getElementById(id)?.classList.toggle('collapsed'); }

// ── renderPayments (orig. line 6498) ──
function renderPayments(){
  ensurePageLoaded('payments');
  let container = document.getElementById('payments-container'); if(!container) return;
  let ym = document.getElementById('pay-month')?.value || '';
  // JAMAIS afficher les quickAdd dans le menu Payments
  let liste = DB.payments.filter(p => !p._quickAdd);
  if(ym){ liste = liste.filter(p => { let outYm = p.dateOut ? p.dateOut.slice(0,7) : ''; return outYm === ym; }); }
  if(currentPaymentFilter){ liste = liste.filter(p => (p.paymentMethod || 'POST') === currentPaymentFilter); }
  document.querySelectorAll('.payment-method-card').forEach(card => { card.classList.toggle('selected', currentPaymentFilter !== null && card.dataset.method === currentPaymentFilter); });
  // Sort globally by receipt number
  liste.sort((a,b)=>{ let ra=parseInt((a.receipt||'0').toString().replace(/[^0-9]/g,''),10)||0; let rb=parseInt((b.receipt||'0').toString().replace(/[^0-9]/g,''),10)||0; return rb-ra; });
  let grouped = {}; liste.forEach(p => { let date = p.dateOut ? p.dateOut.slice(0,10) : 'No Date'; if(!grouped[date]) grouped[date] = []; grouped[date].push(p); });
  let dates = Object.keys(grouped).sort((a,b) => b.localeCompare(a)); // DESC: Most recent first ✅
  // ── Pagination : par groupe de jour (15 jours/page) — évite de générer
  // des dizaines de tableaux complets d'un coup quand l'historique grossit ──
  if(typeof window._paymentsPageState === 'undefined') window._paymentsPageState = { page: 0, pageSize: 15 };
  let _payPg = renderPaginationBar(container, window._paymentsPageState, dates.length, renderPayments);
  let datesPage = dates.slice(_payPg.pageStart, _payPg.pageStart + window._paymentsPageState.pageSize);
  if(dates.length === 0){ container.innerHTML = '<div class="empty">'+translate('pay.empty')+'</div>'; } else { container.innerHTML = datesPage.map(date => { let Transactions = grouped[date]; let totalDay = fmtAmt(Transactions.reduce((s,p) => s + (p.price||0), 0)); return `<div class="day-block" id="pay-day-${date.replace(/-/g,'')}"><div class="day-header" data-pay-action="toggle-day" data-pay-day-id="pay-day-${date.replace(/-/g,'')}"><span class="day-label">📅 ${date}</span><span class="day-count">${Transactions.length} ${Transactions.length>1?translate('pay.transactions'):translate('pay.transaction')} &nbsp;·&nbsp; <strong style="color:var(--green)">${totalDay} OMR</strong></span><span class="day-chevron">▼</span></div><div class="day-table"><table><thead><tr><th>${translate('pay.invoiceNo')}</th><th>${translate('pay.receiptNo')}</th><th>${translate('pay.contNo')}</th><th>${translate('pay.plateNumber')}</th><th>${translate('pay.branch')}</th><th>${translate('pay.amount')}</th><th>${translate('pay.method')}</th><th>${translate('pay.status')}</th><th>${translate('pay.actions')}</th></tr></thead><tbody>${Transactions.map(p => { let v = p.vehicleId ? (DB.vehicles.find(x => x.id === p.vehicleId) || {}) : {}; let vPlate = v.plate || p._plate || '—'; let method = p.paymentMethod || 'POST'; let statusLabel = p.statusLabel || 'UNPAID'; let isCash = (statusLabel==='PAID-CASH'||statusLabel==='UNPAID-CASH'); let isTransfert = (statusLabel==='TRANSFERT' || statusLabel==='TRANSFERT-CONFIRMED'); let statusClass = statusLabel==='PAID' ? 'badge-green' : statusLabel==='PAID-CASH' ? 'badge-green' : statusLabel==='UNPAID-CASH' ? 'badge-red' : statusLabel==='UNPAID' ? 'badge-red' : statusLabel==='TRANSFERT-CONFIRMED' ? 'badge-green' : 'badge-blue'; let statusDisplay = statusLabel==='PAID-CASH' ? '💵 PAID-CASH' : statusLabel==='UNPAID-CASH' ? '💵 UNPAID-CASH' : statusLabel==='TRANSFERT-CONFIRMED' ? '🏦 CONFIRMED' : statusLabel==='TRANSFERT' ? '🏦 TRANSFERT' : statusLabel; let statusCell = isCash ? '<span class="badge '+statusClass+'" data-pay-action="toggle-cash" data-pay-id="'+p.id+'" style="cursor:pointer;text-decoration:underline dotted" title="Click to toggle">'+statusDisplay+'</span>' : isTransfert ? '<span class="badge '+statusClass+'" data-pay-action="toggle-transfert" data-pay-id="'+p.id+'" style="cursor:pointer;text-decoration:underline dotted" title="Click to verify and confirm">'+statusDisplay+'</span>' : '<span class="badge '+statusClass+'">'+statusDisplay+'</span>';
    let attachIcon = '';
    let isSameAmountDuplicate = false;
    let isDoublon = false;
    if(p.receipt) {
      let hasPdf2 = getPdfFromStorage(p.receipt);
      // Détecter si ce paiement fait partie d'un doublon CASH+POST
      // 🔴 DOUBLON = Montant identique + Méthodes opposées (CASH ↔ POST) + MÊME JOUR
      let pDate = (p.dateOut||'').slice(0,10);
      let pAmt = Number(p.price||0);
      let pMeth = (p.paymentMethod||'').toUpperCase();
      let oppMeth = pMeth==='CASH' ? 'POST' : (pMeth==='POST' ? 'CASH' : null);
      isDoublon = oppMeth ? DB.payments.some(q => {
        return (q.paymentMethod||'').toUpperCase()===oppMeth
          && (q.dateOut||'').slice(0,10)===pDate
          && Number(q.price||0)===pAmt
          && !q._quickAdd && q.id!==p.id;
      }) : false;
      // NEW: Detect same-amount duplicates (same day, same method, same amount - different receipt)
      isSameAmountDuplicate = DB.payments.some(q => {
          return q.id !== p.id
          && !q._quickAdd
          && (q.dateOut||'').slice(0,10) === pDate
          && Number(q.price||0) === pAmt
          && (q.paymentMethod||'POST').toUpperCase() === pMeth;
      });

      if(hasPdf2){
        // PJ présente — verte+✅ si vérifié, bleue sinon
        let iconColor = p._auditFlag ? '#22c55e' : '#60a5fa';
        let checkmark = p._auditFlag ? '✅' : '';
        let iconTitle = p._auditFlag ? 'Attachment verified ✅ — Payment confirmed' : 'View attachment';
        attachIcon = `<span style="cursor:pointer;color:${iconColor};text-decoration:underline dotted;margin-left:4px;font-weight:${p._auditFlag?'700':'400'}" data-pay-action="open-attachment" data-pay-id="${p.id}" title="${iconTitle}">📎${checkmark}</span>`;

      } else if(isDoublon) {
        // Doublon sans PJ → icône rouge urgente pour CASH et POST
        attachIcon = `<span style="cursor:pointer;color:#dc2626;text-decoration:underline dotted;margin-left:4px;font-weight:700" data-pay-action="open-attachment" data-pay-id="${p.id}" title="⚠️ ATTACHMENT REQUIRED — Duplicate ${pMeth}+${oppMeth} detected !">📎❗</span>`;
      } else if(p.paymentMethod==='CASH' || p.paymentMethod==='TRANSFERT') {
        // CASH/TRANSFERT sans doublon — demande PJ optionnelle
        attachIcon = `<span style="cursor:pointer;color:#f59e0b;text-decoration:underline dotted;margin-left:4px" data-pay-action="open-attachment" data-pay-id="${p.id}" title="Add attachment">📎?</span>`;
      }
      // POST seul sans doublon : pas d'icône PJ (normal)
    }
    let auditBadge = (p._auditFlag || isSameAmountDuplicate) ? `<span title="${p._auditReason || (isSameAmountDuplicate ? 'Identical amount detected' : 'Duplicate suspected')}" style="cursor:help;margin-right:4px;font-size:.8rem">⚠️</span>` : '';
    // ✅ DOUBLON CASH+POST → style ORANGE CLIGNOTANT sur les 2 lignes
    let rowStyle = '';
    // ── Doublon : clignotement arrêté seulement si LES DEUX sont validés OCR ──────
    if(isDoublon) {
      let _doublonPartner = DB.payments.find(q => {
        let qMeth = (q.paymentMethod||'').toUpperCase();
        let pMeth2 = (p.paymentMethod||'').toUpperCase();
        let oppMeth2 = pMeth2==='CASH'?'POST':(pMeth2==='POST'?'CASH':null);
        return q.id !== p.id && !q._quickAdd
          && qMeth === oppMeth2
          && (q.dateOut||'').slice(0,10) === (p.dateOut||'').slice(0,10)
          && Number(q.price||0) === Number(p.price||0);
      });
      let _bothValidated = p._auditFlag && _doublonPartner && _doublonPartner._auditFlag;
      if(_bothValidated) {
        // Les deux validés OCR → fond blanc normal, texte normal, pas de clignotement
        isDoublon = false;
        rowStyle = '';
      } else {
        // Au moins un non validé → clignotement orange maintenu
        rowStyle = 'background:rgba(249,115,22,.10);border-left:3px solid #f97316;animation:doublonBlink 1.2s ease-in-out infinite;';
      }
    }
    return `<tr style="${rowStyle}"><td><span style="font-family:var(--mono);font-weight:800;color:#9333ea;font-size:1.05rem;letter-spacing:.5px">${(p.bankReceipt || '')}</span></td><td><span style="font-family:var(--mono);font-weight:800;${isDoublon?'color:#f97316;':'color:#1e40af;'}font-size:1.05rem;letter-spacing:.5px">${(p.receipt || '—')}</span>${attachIcon}${auditBadge}</td><td>${p.contract || '—'}</td><td><span style="${isDoublon?'color:#f97316;font-weight:700;':''}">${vPlate}</span></td><td>${branchBadgeHtml(p.branch || v.branch || v.bureau)}</td><td><span style="${isDoublon?'color:#f97316;':'color:var(--green);'}font-weight:700;font-size:.95rem">${fmtAmt(p.price)} OMR</span></td><td>${method==='CASH'?'<span class="badge badge-red">':method==='TRANSFERT'?'<span class="badge badge-blue">':`<span class="badge badge-green">`}${method}</span></td><td>${statusCell}</td><td style="display:flex;gap:6px;"><button class="btn btn-ghost" style="padding:4px 10px" data-pay-action="edit" data-pay-id="${p.id}">✏️</button><button class="btn btn-ghost btn-delete" style="padding:4px 10px" data-pay-action="delete" data-pay-id="${p.id}">🗑️</button></td></tr>`;
  }).join('')}</tbody></table></div></div>`; }).join(''); }
  let totalPaye = fmtAmt(liste.reduce((s,p) => s + (p.price||0), 0)); document.getElementById('pay-summary').innerHTML = `<div class="pay-card"><h4 style="font-size:.8rem;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);font-weight:700;margin-bottom:12px">${translate("pay.monthlySummary")}</h4><div class="pay-row"><span>${translate("pay.totalTransactions")}</span><span style="font-weight:700;font-size:1rem;color:var(--text)">${liste.length}</span></div><div class="pay-row total"><span style="font-weight:600">${translate("pay.totalCollected")}</span><span style="color:var(--green);font-weight:800;font-size:1.1rem">${totalPaye} OMR</span></div></div>`; updatePaymentMethodsStats(); buildDashboard(); }
// ── togglePayDay (orig. line 6580) ──
function togglePayDay(id){ let el = document.getElementById(id); if(el) el.classList.toggle('collapsed'); }
// ── togglePaymentFilter (orig. line 6581) ──
function togglePaymentFilter(method){ if(currentPaymentFilter === method){ currentPaymentFilter = null; } else { currentPaymentFilter = method; } if(window._paymentsPageState) window._paymentsPageState.page = 0; document.querySelectorAll('.payment-method-card').forEach(card => { card.classList.remove('selected'); if(card.dataset.method === currentPaymentFilter){ card.classList.add('selected'); } }); renderPayments(); }
// ── updatePaymentMethodsStats (orig. line 6582) ──
function updatePaymentMethodsStats(){ ensurePageLoaded('payments'); let ym = document.getElementById('pay-month')?.value || ''; let liste = DB.payments.filter(p => !p._quickAdd); if(ym){ liste = liste.filter(p => { let outYm = p.dateOut ? p.dateOut.slice(0,7) : ''; return outYm === ym; }); } let postTotal=0, cashTotal=0, transfertTotal=0; let postCount=0, cashCount=0, transfertCount=0; liste.forEach(p => { let amount = Number(p.price || 0); if(p.paymentMethod === 'POST'){ postTotal += amount; postCount++; } else if(p.paymentMethod === 'CASH'){ cashTotal += amount; cashCount++; } else if(p.paymentMethod === 'TRANSFERT'){ transfertTotal += amount; transfertCount++; } }); let txWord = translate('pay.transactions'); let postEl = document.getElementById('post-count'); if(postEl) postEl.innerHTML = '<strong style="font-size:15px">'+postCount+' '+txWord+'</strong>'; let postTotalEl = document.getElementById('post-total'); if(postTotalEl) postTotalEl.innerHTML = '<strong style="font-size:15px">'+fmtAmt(postTotal)+' OMR</strong>'; let cashEl = document.getElementById('cash-count'); if(cashEl) cashEl.innerHTML = '<strong style="font-size:15px">'+cashCount+' '+txWord+'</strong>'; let cashTotalEl = document.getElementById('cash-total'); if(cashTotalEl) cashTotalEl.innerHTML = '<strong style="font-size:15px">'+fmtAmt(cashTotal)+' OMR</strong>'; let transfertEl = document.getElementById('transfert-count'); if(transfertEl) transfertEl.innerHTML = '<strong style="font-size:15px">'+transfertCount+' '+txWord+'</strong>'; let transfertTotalEl = document.getElementById('transfert-total'); if(transfertTotalEl) transfertTotalEl.innerHTML = '<strong style="font-size:15px">'+fmtAmt(transfertTotal)+' OMR</strong>'; }

let currentPdfData = null;
// ── togglePdfUpload (orig. line 6585) ──
function togglePdfUpload(method, forceShow=false){
  let grp = document.getElementById('pdf-upload-group');
  let lbl = document.getElementById('pdf-upload-label');
  if(!grp) return;
  if(method === 'TRANSFERT'){
    grp.style.display = 'block';
    if(lbl){ lbl.textContent = '📎 TRANSFERT Attachment (required)'; lbl.style.color = '#2563eb'; }
    grp.style.borderColor = '';
  } else if(method === 'CASH'){
    // Toujours afficher pour CASH
    grp.style.display = 'block';
    if(lbl){ lbl.textContent = '📎 CASH Receipt (photo/scan)'; lbl.style.color = '#d97706'; }
  } else if(method === 'POST'){
    // Toujours afficher pour POST aussi
    grp.style.display = 'block';
    if(lbl){ lbl.textContent = '📎 POST Receipt (photo/scan)'; lbl.style.color = '#16a34a'; }
  } else {
    grp.style.display = 'none';
  }
  // Reset duplicate warning
  let warn = document.getElementById('pdf-duplicate-warning');
  if(warn) warn.style.display = 'none';
}

// ── computeSimpleHash (orig. line 6609) ──
function computeSimpleHash(dataUrl){
  // Simple hash basé sur les 500 premiers + 500 derniers caractères + longueur
  if(!dataUrl) return '';
  let len = dataUrl.length;
  let sample = dataUrl.slice(0, 500) + '|' + len + '|' + dataUrl.slice(-500);
  let hash = 0;
  for(let i=0;i<sample.length;i++){ hash = ((hash<<5)-hash)+sample.charCodeAt(i); hash|=0; }
  return hash.toString();
}

// ── checkPdfDuplicate (orig. line 6619) ──
function checkPdfDuplicate(){
  // Vérifie en temps réel si le fichier uploadé est identique à l'autre paiement du doublon
  let warn = document.getElementById('pdf-duplicate-warning');
  if(!warn || !window._doublonSuspectReceiptKey) return;
  if(!currentPdfData) { warn.style.display='none'; return; }
  let otherPdf = getPdfFromStorage(window._doublonSuspectReceiptKey);
  if(!otherPdf) { warn.style.display='none'; return; }
  let hashNew = computeSimpleHash(currentPdfData.data);
  let hashOther = computeSimpleHash(otherPdf.data);
  if(hashNew === hashOther && hashNew !== ''){
    warn.style.display = 'block';
  } else {
    warn.style.display = 'none';
  }
}
async function handlePdfUpload(input){
  let file = input.files[0];
  if(!file) return;
  let grp = document.getElementById('pdf-upload-group');
  if(grp){ grp.style.border=''; grp.style.padding=''; }
  if(file.size > 5 * 1024 * 1024){ toast('❌ File too large — max 5MB'); input.value = ''; return; }

  let reader = new FileReader();
  reader.onload = async function(e){
    currentPdfData = { name: file.name, data: e.target.result };
    let info = document.getElementById('pdf-preview-info');
    if(info) info.innerHTML = '<span style="color:#d97706">⏳ Reading receipt in progress...</span>';

    // ── VÉRIF 1 : Hash — fichier already used pour un autre paiement ? ──────────
    let currentHash = computeSimpleHash(currentPdfData.data);
    window._currentPdfHash = currentHash;
    let allPaymentsWithPdf = DB.payments.filter(p => p.receipt && !p._quickAdd);
    let foundHashDup = null;
    for(let p of allPaymentsWithPdf){
      let stored = getPdfFromStorage(p.receipt);
      if(stored && computeSimpleHash(stored.data) === currentHash && currentHash !== ''){
        foundHashDup = p; break;
      }
    }
    if(foundHashDup){
      let warn = document.getElementById('pdf-duplicate-warning');
      let dupInvoice = foundHashDup.bankReceipt || foundHashDup.receipt;
      if(warn){ warn.style.display='block'; warn.innerHTML='🚫 This file is <strong>identical</strong> to the attachment of Invoice N°' + dupInvoice + ' (' + (foundHashDup.paymentMethod||'?') + ') !'; }
      if(grp){ grp.style.border='2px solid #dc2626'; grp.style.borderRadius='8px'; grp.style.padding='8px'; }
      if(info) info.innerHTML = '<span style="color:#dc2626">🚫 File rejected — already used</span>';
      toast('🚫 This file is already used as Invoice N°' + dupInvoice + '!');
      window._pdfOcrReceiptOk = false;
      return;
    }

    // ── VÉRIF 2 : OCR — le numéro d'invoice est-il visible dans le fichier ? ────
    // Récupérer le numéro d'invoice du champ in progress de saisie
    // ✅ Priorité: pay-bank-receipt (N° Banque) puis pay-receipt (N° interne)
    let expectedInvoice = (document.getElementById('pay-bank-receipt') || {}).value || '';
    if(!expectedInvoice) expectedInvoice = (document.getElementById('pay-receipt') || {}).value || '';
    expectedInvoice = expectedInvoice.toString().trim();
    window._pdfOcrReceiptOk = false; // reset

    if(expectedInvoice && expectedInvoice !== '') {
      try {
        if(info) info.innerHTML = '<span style="color:#d97706">🔍 OCR — reading invoice number...</span>';
        await loadTesseract();
        let base64Only = e.target.result.split(',')[1];
        let byteChars = atob(base64Only);
        let byteArr = new Uint8Array(byteChars.length);
        for(let i=0;i<byteChars.length;i++) byteArr[i]=byteChars.charCodeAt(i);
        let blob = new Blob([byteArr], {type: file.type});
        let result = await Tesseract.recognize(blob, 'eng+fra', Object.assign({
          logger: function(m){ if(m.status==='recognizing text' && info) info.innerHTML = '<span style="color:#d97706">🔍 OCR ' + Math.round(m.progress*100) + '%...</span>'; }
        }, ocrPaths()));
        let ocrText = result.data.text || '';
        console.log('[OCR PJ]', ocrText);

        // Chercher "INVOICE:" suivi du numéro dans le texte OCR
        let invoiceClean = expectedInvoice.replace(/[^0-9]/g, '');
        // ✅ AMÉLIORATION OCR MAXIMALE : Accepter toutes les variations possibles
        // INVOICE:003286 | VOICE:003286 | INV:003286 | inv 003286 | inv:003286
        // INVOICE 003286 | INVOICE=003286 | INVOIC:003286 | NVOICE:003286
        let invoiceMatch = ocrText.match(/(?:INVOICE[S]?|INVOIC|NVOICE|VOICE|INV)[\s:=\-#]+([0-9]+)/i);
        let found = false;
        if(invoiceMatch){
          let foundInvoiceNum = invoiceMatch[1].replace(/^0+/,''); // retirer les zéros initiaux
          let invoiceCleanNoZero = invoiceClean.replace(/^0+/,'');
          // Vérifier que le numéro trouvé correspond (sans zéros initiaux)
          if(foundInvoiceNum === invoiceCleanNoZero || foundInvoiceNum.includes(invoiceCleanNoZero) || invoiceCleanNoZero.includes(foundInvoiceNum)){
            found = true;
          }
        }
        // ✅ FIX FALLBACK : Si la regex n'a rien trouvé, chercher le numéro directement dans tout le texte OCR
        if(!found && invoiceClean){
          let invoiceCleanNoZero2 = invoiceClean.replace(/^0+/,'');
          // Chercher le numéro exact (avec ou sans zéros) n'importe où dans le texte
          if(ocrText.replace(/\s/g,'').includes(invoiceClean) || ocrText.replace(/\s/g,'').includes(invoiceCleanNoZero2)){
            found = true;
          }
        }

        // ── VÉRIF 3 (BONUS) : Vérifier le montant dans le reçu ────
        // ✅ FIX : Le montant discordant est un AVERTISSEMENT seulement — ne bloque plus la validation
        let expectedAmount = parseFloat(document.getElementById('pay-amount').value) || 0;
        let amountMatch = null;
        let amountWarning = '';
        
        if(expectedAmount > 0){
          // Regex pour extraire les montants : chercher "AMOUNT", "TOTAL", "OMR", "=", ":", suivi de chiffres
          let amountPatterns = [
            /(?:AMOUNT|TOTAL|PRICE)[\s:=]+([0-9]+[.,][0-9]+)/i,  // AMOUNT: 165.000
            /(?:AMOUNT|TOTAL|PRICE)[\s:=]+([0-9.]+)/i,            // AMOUNT: 165
            /([0-9]+[.,][0-9]+)\s*OMR/i,                          // 165.000 OMR
            /([0-9]+)\s*OMR/i,                                     // 165 OMR
            /(?:OMR|OM\s|O\s)[\s:=]*([0-9]+[.,][0-9]+)/i,        // OMR 165.000 | OM 165.000 | O 165.000
            /(?:OMR|OM\s|O\s)[\s:=]*([0-9]+)/i,                  // OMR 165 | OM 165 | O 165
            /:[^0-9]*([0-9]+[.,][0-9]+)\s*$/im,                   // : 165.000 en fin de ligne
            /([0-9]{2,6}[.,][0-9]{1,3})/,                         // n'importe quel nombre décimal dans le texte
          ];
          
          for(let pattern of amountPatterns){
            let match = ocrText.match(pattern);
            if(match){
              // Normaliser la virgule en point pour les montants comme "6,000" vs "6.000"
              let rawVal = (match[1] || match[2] || '0').replace(',','.');
              let extracted = parseFloat(rawVal);
              // Ignorer les grands nombres qui ressemblent à des numéros de série (ex: 100000...)
              if(extracted > 0 && extracted < 100000){
                amountMatch = extracted;
                break;
              }
            }
          }
          
          if(amountMatch !== null){
            let diff = Math.abs(expectedAmount - amountMatch);
            let tolerance = 0.5; // Tolérance de 0.5 OMR pour les arrondis OCR
            
            if(diff > tolerance){
              // ✅ FIX : Avertissement SEULEMENT — ne bloque plus la validation invoice
              amountWarning = '⚠️ <strong style="color:#f59e0b">WARNING — Mismatched Amount:</strong> You entered <strong>' + expectedAmount.toFixed(2) + ' OMR</strong> but the receipt shows <strong>' + amountMatch.toFixed(3) + ' OMR</strong>';
              // NE PAS faire found = false ici — c'est un avertissement, pas un blocage
            }
          }
        }

        // ── VÉRIF 4 : Vérifier la date du reçu vs date de paiement saisie ────
        // ✅ NOUVEAU : Vérification de cohérence des dates
        let dateWarning = '';
        let expectedDate = document.getElementById('pay-date') ? document.getElementById('pay-date').value : '';
        if(expectedDate){
          // Chercher une date dans l'OCR au format DD-MM-YYYY, DD/MM/YYYY, YYYY-MM-DD
          let datePatterns = [
            /(\d{2})[-\/](\d{2})[-\/](\d{4})/,  // DD-MM-YYYY ou DD/MM/YYYY
            /(\d{4})[-\/](\d{2})[-\/](\d{2})/,  // YYYY-MM-DD
          ];
          let ocrDateStr = null;
          for(let dp of datePatterns){
            let dm = ocrText.match(dp);
            if(dm){
              // Essayer d'interpréter comme DD-MM-YYYY d'abord
              let y, m, d;
              if(dm[3] && dm[3].length === 4){ y = parseInt(dm[3]); m = parseInt(dm[2]); d = parseInt(dm[1]); }
              else { y = parseInt(dm[1]); m = parseInt(dm[2]); d = parseInt(dm[3]); }
              if(y >= 2020 && y <= 2030 && m >= 1 && m <= 12 && d >= 1 && d <= 31){
                ocrDateStr = y + '-' + String(m).padStart(2,'0') + '-' + String(d).padStart(2,'0');
                break;
              }
            }
          }
          if(ocrDateStr && ocrDateStr !== expectedDate){
            dateWarning = '⚠️ <strong style="color:#f59e0b">Mismatched Date:</strong> Date entered <strong>' + expectedDate + '</strong> but the receipt shows <strong>' + ocrDateStr + '</strong>';
          }
        }

        if(found){
          window._pdfOcrReceiptOk = true;
          let msg = '✅ <strong>' + file.name + '</strong> — Invoice N°' + expectedInvoice + ' detected ✅';
          if(amountWarning) msg += '<br>' + amountWarning;
          if(dateWarning) msg += '<br>' + dateWarning;
          if(info) info.innerHTML = msg;
          // Si avertissements, border orange au lieu de vert
          let hasBorderWarning = amountWarning || dateWarning;
          if(grp){ grp.style.border='2px solid ' + (hasBorderWarning ? '#f59e0b' : '#16a34a'); grp.style.borderRadius='8px'; grp.style.padding='8px'; }
          let warn = document.getElementById('pdf-duplicate-warning');
          if(hasBorderWarning){
            if(warn){ warn.style.display='block'; warn.innerHTML = (amountWarning ? amountWarning : '') + (dateWarning ? '<br>' + dateWarning : ''); }
          } else {
            if(warn) warn.style.display='none';
          }
          toast('✅ Invoice N°' + expectedInvoice + ' confirmed by OCR!' + (hasBorderWarning ? ' (check warnings)' : ''));
        } else {
          window._pdfOcrReceiptOk = false;
          let warn = document.getElementById('pdf-duplicate-warning');
          let warnMsg = '⚠️ Invoice number <strong>' + expectedInvoice + '</strong> was not found';
          if(amountWarning) warnMsg += '<br><br>' + amountWarning;
          if(dateWarning) warnMsg += '<br><br>' + dateWarning;
          if(warn){ warn.style.display='block'; warn.innerHTML = warnMsg; }
          if(grp){ grp.style.border='2px solid #f59e0b'; grp.style.borderRadius='8px'; grp.style.padding='8px'; }
          if(info) info.innerHTML = '<span style="color:#f59e0b">⚠️ ' + file.name + ' — Verify invoice + amount + date</span>';
          toast('⚠️ Verify that the invoice number and amount match');
        }
      } catch(err){
        console.warn('OCR PJ error:', err);
        window._pdfOcrReceiptOk = null; // null = OCR échoué, on laisse passer avec warning
        if(info) info.innerHTML = '<span style="color:#d97706">⚠️ ' + file.name + ' loaded (OCR unavailable)</span>';
        toast('📎 File loaded (OCR unavailable)');
      }
    } else {
      // Pas de numéro d'invoice saisi encore — OK provisoire
      window._pdfOcrReceiptOk = null;
      if(info) info.innerHTML = '✅ <strong>' + file.name + '</strong> — enter the Invoice N° for OCR verification';
      toast('📎 File loaded — enter Invoice N° to verify');
    }

    checkPdfDuplicate();
  };
  reader.readAsDataURL(file);
}
// ── Gestion des pièces jointes via le serveur (persistance disque) ──────
let window_attachmentsIndex = {};

async function loadAttachmentsIndex(){
  try {
    const res = await fetch('/attachments', { headers: authHeaders() });
    if(res.ok) window_attachmentsIndex = await res.json();
  } catch(e) { console.log('Could not load attachments index:', e.message); }
}

// ── savePdfToStorage (orig. line 6844) ──
// Convertit fetch → XMLHttpRequest pour exposer la progression réelle de
// l'upload (fetch ne le permet pas nativement). onProgress(pct) optionnel :
// appelé pendant l'envoi avec un pourcentage 0-100. Sans ça, un upload de
// pièce jointe volumineuse (scan/PDF lourd) laissait l'écran figé sans
// retour visuel — l'utilisateur pouvait croire à un plantage et re-cliquer,
// doublonnant l'upload.
function savePdfToStorage(receiptKey, pdfData, onProgress){
  if(!receiptKey || !pdfData) return Promise.reject('Missing data');
  // Créer un FormData et envoyer au serveur
  const formData = new FormData();
  // Décoder le base64 en binaire correctement
  let binaryData;
  if(pdfData.data && pdfData.data.includes(',')) {
    const base64Str = pdfData.data.split(',')[1];
    const byteChars = atob(base64Str);
    const byteNums = new Uint8Array(byteChars.length);
    for(let i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i);
    binaryData = byteNums;
  } else {
    binaryData = pdfData.data;
  }
  const blob = new Blob([binaryData], { type: 'application/octet-stream' });
  formData.append('contractKey', receiptKey);
  formData.append('video', blob, pdfData.name);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/upload-attachment');
    // ⚠️ Bug préexistant : contrairement à deletePdfFromStorage() (fetch + authHeaders()),
    // cet appel XHR n'envoyait jamais le token d'authentification → le serveur répondait
    // 401 "Non authentifié" même avec une session valide et un OCR réussi.
    xhr.setRequestHeader('x-auth-token', (window.AUTH && window.AUTH.token) || '');
    if(xhr.upload && typeof onProgress === 'function'){
      xhr.upload.onprogress = function(e){
        if(e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
    }
    xhr.onload = function(){
      let d;
      try { d = JSON.parse(xhr.responseText); } catch(e){ return reject(new Error('Réponse serveur invalide')); }
      if(xhr.status >= 200 && xhr.status < 300 && d.ok){
        window_attachmentsIndex[receiptKey] = { name: d.name, size: d.size };
        resolve(d);
      } else {
        reject(new Error(d.error || 'Unknown error'));
      }
    };
    xhr.onerror = function(){ reject(new Error('Connexion interrompue pendant l\'envoi')); };
    xhr.send(formData);
  });
}

// ── deletePdfFromStorage (orig. line 6875) ──
function deletePdfFromStorage(receiptKey){
  if(!receiptKey) return;
  fetch('/remove-attachment', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ receiptKey })
  })
    .then(r => r.json())
    .then(d => {
      if(d.ok) {
        delete window_attachmentsIndex[receiptKey];
        toast('🗑️ Attachment deleted');
        refreshAll();
      }
    })
    .catch(e => console.log('Delete error:', e));
}

// ── getPdfFromStorage (orig. line 6893) ──
function getPdfFromStorage(receiptKey){
  if(!receiptKey || !window_attachmentsIndex[receiptKey]) return null;
  // Retourner un objet qui contient l'URL pour streaming
  // ⚠️ Cette URL est chargée directement dans une <iframe> (voir Download/View modal) —
  // une iframe ne peut pas envoyer de header x-auth-token comme fetch()/XHR. Le serveur
  // (getSession) accepte donc aussi le token en query string ?token=... pour ce cas précis.
  const token = (window.AUTH && window.AUTH.token) || '';
  return {
    name: window_attachmentsIndex[receiptKey].name,
    data: '/stream-attachment/' + encodeURIComponent(receiptKey) + '?token=' + encodeURIComponent(token),
    isStreamed: true
  };
}
// ═══════════════════════════════════════════════════════════════════════════════
// GESTION DES PIÈCES JOINTES AVEC VÉRIFICATION OCR
// ═══════════════════════════════════════════════════════════════════════════════
let currentAttachmentPaymentId = null;
let currentAttachmentPdfData = null;

// ── openAttachmentModal (orig. line 6908) ──
function openAttachmentModal(paymentId){
  currentAttachmentPaymentId = paymentId;
  currentAttachmentPdfData = null;
  // Récupérer les infos du paiement
  let payment = DB.payments.find(p => p.id === paymentId);
  if(!payment) return;
  // Reload existing attachment if any
  let existingPdf = getPdfFromStorage(payment.receipt);
  if(existingPdf){
    currentAttachmentPdfData = existingPdf;
    document.getElementById('attachment-preview-info').textContent = existingPdf.name + ' — Click to view';
    document.getElementById('attachment-preview-info').style.cursor = 'pointer';
    document.getElementById('attachment-preview-info').onclick = function(){ openPdfViewer(payment.receipt, 'Receipt N°' + payment.receipt); };
  }
  
  
  // Réinitialiser le formulaire (SEULEMENT si pas de pièce jointe existante)
  document.getElementById('attachment-file-input').value = '';
  if(!existingPdf) {
    document.getElementById('attachment-preview-info').textContent = 'No file selected';
  }
  document.getElementById('attachment-ocr-results').style.display = 'none';
  document.getElementById('attachment-doublon-warning').style.display = 'none';
  document.getElementById('attachment-modal-title').textContent = `Receipt N°${payment.receipt || '—'} (${payment.paymentMethod || 'POST'} · ${payment.price} OMR)`;
  
  // Afficher/cacher le bouton Delete si un attachment existe
  let hasPdf = getPdfFromStorage(payment.receipt);
  let deleteBtn = document.getElementById('attachment-delete-btn');
  if(deleteBtn){
    deleteBtn.style.display = hasPdf ? 'inline-flex' : 'none';
  }
  
  openModal('modal-attachment-verify');
}

// ── deleteCurrentAttachmentFromModal (orig. line 6943) ──
function deleteCurrentAttachmentFromModal(){
  if(!currentAttachmentPaymentId) return;
  let payment = DB.payments.find(p => p.id === currentAttachmentPaymentId);
  if(!payment) return;
  
  let receiptKey = payment.receipt;
  if(!confirm(`Delete attachment for Receipt N°${receiptKey}?`)) return;
  
  deletePdfFromStorage(receiptKey);
  toast('✅ Attachment deleted');
  document.getElementById('attachment-delete-btn').style.display = 'none';
  document.getElementById('attachment-preview-info').textContent = 'No file selected';
  document.getElementById('attachment-ocr-results').style.display = 'none';
  renderPayments();
  refreshAll();
}

async function handleAttachmentUpload(input){
  let file = input.files[0];
  if(!file) return;
  
  if(file.size > 5 * 1024 * 1024){
    toast('❌ File too large — max 5MB');
    return;
  }
  
  let reader = new FileReader();
  reader.onload = async function(e){
    currentAttachmentPdfData = { name: file.name, data: e.target.result };
    let info = document.getElementById('attachment-preview-info');
    let resultsDiv = document.getElementById('attachment-ocr-results');
    let messageDiv = document.getElementById('attachment-ocr-message');
    
    info.innerHTML = '<span style="color:#d97706">⏳ Analyzing file...</span>';
    resultsDiv.style.display = 'none';
    
    // Récupérer le paiement
    let payment = DB.payments.find(p => p.id === currentAttachmentPaymentId);
    if(!payment) return;
    
    let receiptNum = payment.receipt || '';
    // ✅ Priorité: bankReceipt (Invoice N° Bank) puis receipt (N° interne) — même logique que l'ajout de paiement
    let invoiceNum = payment.bankReceipt || payment.receipt || '';
    let paymentDate = (payment.dateOut || '').slice(0,10);
    let paymentAmount = Number(payment.price || 0);
    let paymentMethod = (payment.paymentMethod || '').toUpperCase();
    
    try {
      if(invoiceNum){
        info.innerHTML = '<span style="color:#d97706">🔍 OCR — Extracting receipt number...</span>';
        
        await loadTesseract();
        let base64Only = e.target.result.split(',')[1];
        let byteChars = atob(base64Only);
        let byteArr = new Uint8Array(byteChars.length);
        for(let i=0;i<byteChars.length;i++) byteArr[i]=byteChars.charCodeAt(i);
        let blob = new Blob([byteArr], {type: file.type});
        
        let result = await Tesseract.recognize(blob, 'eng+fra', Object.assign({
          logger: function(m){ 
            if(m.status==='recognizing text') 
              info.innerHTML = '<span style="color:#d97706">🔍 OCR ' + Math.round(m.progress*100) + '%...</span>'; 
          }
        }, ocrPaths()));
        
        let ocrText = result.data.text || '';
        console.log('[ATTACHMENT OCR]', ocrText);
        
        // ── VÉRIF 1 : N° Invoice (STRICT sur chiffres, FLEXIBLE sur texte) ──
        let receiptClean = invoiceNum.replace(/[^0-9]/g, '');
        let found = false;
        
        if(receiptClean){
          let patterns = [
            new RegExp('(?:INVOICE|INVOIC|NVOICE|VOICE|INV)[\\s:=#\\-]*' + receiptClean, 'i'),
            new RegExp('(?:INVOICE|INVOIC|NVOICE|VOICE|INV)[\\s:=#\\-]*' + receiptClean.replace(/^0+/, ''), 'i'),
            new RegExp(receiptClean, 'i'),
          ];
          for(let p of patterns){
            if(p.test(ocrText.replace(/\s/g, ''))){
              found = true;
              break;
            }
          }
        }

        // ── VÉRIF 2 : MONTANT (STRICT chiffres exact, FLEXIBLE texte) ───────
        // Format accepté: OMR 165.000 ou O 165 ou OM 165.0 — l'important c'est le montant
        let amountWarning = '';
        if(paymentAmount > 0){
          let amountPatterns = [
            // Patterns prioritaires : OMR/OM/O suivi du montant
            /(?:OMR|OM|O)[\s:=#\-]*([0-9]+[.,][0-9]+)/i,
            /(?:OMR|OM|O)[\s:=#\-]*([0-9]+)/i,
            // Patterns alternatifs : AMOUNT/TOTAL/PRICE suivi du montant
            /(?:AMOUNT|TOTAL|PRICE|MONTANT)[\s:=#\-]*([0-9]+[.,][0-9]+)/i,
            /(?:AMOUNT|TOTAL|PRICE|MONTANT)[\s:=#\-]*([0-9]+)/i,
            // Fallback : montant suivi de OMR/OM/O
            /([0-9]+[.,][0-9]+)\s*(?:OMR|OM|O)/i,
            /([0-9]+)\s*(?:OMR|OM|O)/i,
            // Derniers recours : chercher juste les nombres
            /([0-9]+[.,][0-9]+)/,
            /([0-9]+)/,
          ];
          let amountMatch = null;
          for(let pat of amountPatterns){
            let m = ocrText.match(pat);
            if(m){
              let raw = (m[1]||'0').replace(',','.');
              let val = parseFloat(raw);
              if(val > 0 && val < 100000){ amountMatch = val; break; }
            }
          }
          if(amountMatch !== null){
            // STRICT: les montants doivent être EXACTEMENT identiques (tolérance minimal)
            let diff = Math.abs(paymentAmount - amountMatch);
            if(diff > 0.001){
              amountWarning = '⚠️ <strong style="color:#f59e0b">Mismatched Amount:</strong> Entered <strong>' + paymentAmount.toFixed(3) + ' OMR</strong> — Receipt shows <strong>' + amountMatch.toFixed(3) + ' OMR</strong>';
            }
          }
        }

        // ── VÉRIF 3 : DATE (STRICT chiffres exact, FLEXIBLE texte) ─────────
        let dateWarning = '';
        if(paymentDate){
          let datePatterns = [/(\d{2})[-\/](\d{2})[-\/](\d{4})/, /(\d{4})[-\/](\d{2})[-\/](\d{2})/];
          let ocrDateStr = null;
          for(let dp of datePatterns){
            let dm = ocrText.match(dp);
            if(dm){
              let y,m,d;
              if(dm[3] && dm[3].length===4){ y=parseInt(dm[3]); m=parseInt(dm[2]); d=parseInt(dm[1]); }
              else { y=parseInt(dm[1]); m=parseInt(dm[2]); d=parseInt(dm[3]); }
              if(y>=2020&&y<=2030&&m>=1&&m<=12&&d>=1&&d<=31){
                ocrDateStr = y+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');
                break;
              }
            }
          }
          // STRICT: la date doit être EXACTEMENT identique
          if(ocrDateStr && ocrDateStr !== paymentDate){
            dateWarning = '⚠️ <strong style="color:#f59e0b">Mismatched Date:</strong> Entered <strong>' + paymentDate + '</strong> — Receipt shows <strong>' + ocrDateStr + '</strong>';
          }
        }

        // Vérifier les doublons CASH+POST
        let oppositeMethod = paymentMethod === 'CASH' ? 'POST' : (paymentMethod === 'POST' ? 'CASH' : null);
        let hasDoubblon = false;
        let doublonPayment = null;
        
        if(oppositeMethod){
          doublonPayment = DB.payments.find(p => {
            let pMethod = (p.paymentMethod || '').toUpperCase();
            let pDate = (p.dateOut || '').slice(0,10);
            let pAmount = Number(p.price || 0);
            return pMethod === oppositeMethod && pDate === paymentDate && Math.abs(pAmount - paymentAmount) < 0.01 && p.id !== currentAttachmentPaymentId;
          });
          hasDoubblon = !!doublonPayment;
        }
        
        // Afficher les résultats
        resultsDiv.style.display = 'block';
        
        // Construire le message — afficher chaque vérification individuellement
        let msgs = [];
        
        // ── AFFICHAGE INVOICE ──────────────────────────────────────────────
        if(found){
          msgs.push('✅ <strong style="color:#16a34a">Invoice N°' + invoiceNum + ' detected ✅</strong>');
        } else {
          msgs.push('⚠️ <strong style="color:#f59e0b">Invoice N°' + invoiceNum + ' NOT FOUND in file!</strong>');
        }
        
        // ── AFFICHAGE MONTANT ──────────────────────────────────────────────
        if(paymentAmount > 0){
          let amountPatterns = [
            /(?:OMR|OM|O)[\s:=#\-]*([0-9]+[.,][0-9]+)/i,
            /(?:OMR|OM|O)[\s:=#\-]*([0-9]+)/i,
            /(?:AMOUNT|TOTAL|PRICE|MONTANT)[\s:=#\-]*([0-9]+[.,][0-9]+)/i,
            /(?:AMOUNT|TOTAL|PRICE|MONTANT)[\s:=#\-]*([0-9]+)/i,
            /([0-9]+[.,][0-9]+)\s*(?:OMR|OM|O)/i,
            /([0-9]+)\s*(?:OMR|OM|O)/i,
            /([0-9]+[.,][0-9]+)/,
            /([0-9]+)/,
          ];
          let foundAmount = null;
          for(let pat of amountPatterns){
            let m = ocrText.match(pat);
            if(m){
              let raw = (m[1]||'0').replace(',','.');
              let val = parseFloat(raw);
              if(val > 0 && val < 100000){ foundAmount = val; break; }
            }
          }
          if(foundAmount !== null){
            let diff = Math.abs(paymentAmount - foundAmount);
            if(diff <= 0.001){
              msgs.push('✅ <strong style="color:#16a34a">Amount ' + foundAmount.toFixed(3) + ' OMR found ✅</strong>');
            } else {
              msgs.push('⚠️ <strong style="color:#f59e0b">Mismatched Amount:</strong> Entered <strong>' + paymentAmount.toFixed(3) + ' OMR</strong> — Receipt shows <strong>' + foundAmount.toFixed(3) + ' OMR</strong>');
            }
          } else {
            msgs.push('⚠️ <strong style="color:#f59e0b">Amount NOT FOUND in file!</strong>');
          }
        }
        
        // ── AFFICHAGE DATE ─────────────────────────────────────────────────
        if(paymentDate){
          let datePatterns = [/(\d{2})[-\/](\d{2})[-\/](\d{4})/, /(\d{4})[-\/](\d{2})[-\/](\d{2})/];
          let ocrDateStr = null;
          for(let dp of datePatterns){
            let dm = ocrText.match(dp);
            if(dm){
              let y,m,d;
              if(dm[3] && dm[3].length===4){ y=parseInt(dm[3]); m=parseInt(dm[2]); d=parseInt(dm[1]); }
              else { y=parseInt(dm[1]); m=parseInt(dm[2]); d=parseInt(dm[3]); }
              if(y>=2020&&y<=2030&&m>=1&&m<=12&&d>=1&&d<=31){
                ocrDateStr = y+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');
                break;
              }
            }
          }
          if(ocrDateStr){
            if(ocrDateStr === paymentDate){
              msgs.push('✅ <strong style="color:#16a34a">Date ' + ocrDateStr + ' found ✅</strong>');
            } else {
              msgs.push('⚠️ <strong style="color:#f59e0b">Mismatched Date:</strong> Entered <strong>' + paymentDate + '</strong> — Receipt shows <strong>' + ocrDateStr + '</strong>');
            }
          } else {
            msgs.push('⚠️ <strong style="color:#f59e0b">Date NOT FOUND in file!</strong>');
          }
        }
        
        if(hasDoubblon && doublonPayment){
          let doublonInvoice = doublonPayment.bankReceipt || doublonPayment.receipt || '—';
          let doublonMethod = doublonPayment.paymentMethod || '?';
          if(doublonInvoice === invoiceNum){
            msgs.push('<strong style="color:#dc2626">🚫 ERROR: Same Invoice N° as ' + doublonMethod + ' ' + doublonPayment.price + ' OMR (' + paymentDate + ') !</strong>');
            document.getElementById('attachment-save-btn').disabled = true;
          } else {
            msgs.push('<span style="color:#16a34a;font-weight:700">✅ CASH+POST differentiated:</span> N°<strong>' + invoiceNum + '</strong> vs N°<strong>' + doublonInvoice + '</strong>');
          }
        }

        // ── DÉCISION FINALE : 3 conditions OBLIGATOIRES (Invoice + Montant + Date) ──
        let sameNumDoublon = hasDoubblon && doublonPayment && (doublonPayment.bankReceipt || doublonPayment.receipt || '') === invoiceNum;
        let isBlocked = !found || !!amountWarning || !!dateWarning || sameNumDoublon;

        messageDiv.innerHTML = msgs.join('<br>');
        resultsDiv.style.borderRadius = '8px';
        if(isBlocked){
          resultsDiv.style.background = 'rgba(220,38,38,.10)';
          resultsDiv.style.border = '2px solid #dc2626';
          messageDiv.innerHTML += '<br><br><span style="display:block;margin-top:8px;padding:8px 12px;background:#dc2626;color:#fff;border-radius:6px;font-weight:700;font-size:.88rem">🚫 SAVE BLOCKED — Invoice No., Amount and Date must match EXACTLY.</span>';
          document.getElementById('attachment-save-btn').disabled = true;
        } else {
          resultsDiv.style.background = 'rgba(34,197,94,.10)';
          resultsDiv.style.border = '2px solid #16a34a';
          messageDiv.innerHTML += '<br><span style="display:block;margin-top:8px;padding:6px 12px;background:#16a34a;color:#fff;border-radius:6px;font-weight:700;font-size:.88rem">✅ 3/3 VERIFIED — Invoice N° + Amount + Date MATCH. Save OK.</span>';
          document.getElementById('attachment-save-btn').disabled = false;
        }

        info.innerHTML = '✅ <strong>' + file.name + '</strong> — OCR analysis complete';
        
      } else {
        info.innerHTML = '<span style="color:#dc2626">🚫 No Invoice N° entered !</span>';
        resultsDiv.style.display = 'block';
        resultsDiv.style.background = 'rgba(220,38,38,.10)';
        resultsDiv.style.border = '2px solid #dc2626';
        resultsDiv.style.borderRadius = '8px';
        messageDiv.innerHTML = '<strong style="color:#dc2626">🚫 BLOCKED — Enter the Invoice N° in Add Payment before attaching the receipt.</strong>';
        document.getElementById('attachment-save-btn').disabled = true;
      }
    } catch(err){
      console.warn('OCR error:', err);
      info.innerHTML = '<span style="color:#dc2626">🚫 OCR unavailable — cannot verify the document.</span>';
      resultsDiv.style.display = 'block';
      resultsDiv.style.background = 'rgba(220,38,38,.10)';
      resultsDiv.style.border = '2px solid #dc2626';
      resultsDiv.style.borderRadius = '8px';
      messageDiv.innerHTML = '<strong style="color:#dc2626">🚫 OCR failed — Verification impossible. Try again with a clearer image.</strong>';
      document.getElementById('attachment-save-btn').disabled = true;
    }
  };
  reader.readAsDataURL(file);
}

async function saveAttachmentAndVerify(){
  if(!currentAttachmentPaymentId || !currentAttachmentPdfData) {
    toast('❌ No file selected');
    return;
  }
  
  let payment = DB.payments.find(p => p.id === currentAttachmentPaymentId);
  if(!payment) return;
  
  let receiptNum = payment.receipt || '';
  if(!receiptNum){
    toast('❌ Receipt number is required!');
    return;
  }

  // Désactiver le bouton pendant l'upload
  let saveBtn = document.getElementById('attachment-save-btn');
  if(saveBtn){ saveBtn.disabled = true; saveBtn.textContent = '⏳ Saving...'; }

  try {
    // Attendre que la pièce jointe soit bien sauvegardée AVANT de fermer la modal
    await savePdfToStorage(receiptNum, currentAttachmentPdfData, function(pct){ if(typeof uploadProgressToast === 'function') uploadProgressToast(pct); }).finally(function(){ if(typeof uploadProgressToast === 'function') uploadProgressToast(null); });
    
    // Marquer comme vérifiée
    payment._auditFlag = true;
    payment._auditReason = 'Attachment verified via OCR ✅';
    
    // Si CASH — marquer PAID-CASH (pièce jointe acceptée = paiement confirmé)
    if(payment.statusLabel === 'UNPAID-CASH'){
      payment.statusLabel = 'PAID-CASH';
      toast('✅ Attachment verified — Status → 💵 PAID-CASH');
    } else {
      toast('✅ Attachment saved and verified!');
    }
    
    closeModal('modal-attachment-verify');
    renderPayments();
    refreshAll();
  } catch(e) {
    toast('❌ Save error: ' + e.message);
    if(saveBtn){ saveBtn.disabled = false; saveBtn.textContent = '💾 Save'; }
  }
}

// ── openPdfViewer (orig. line 7274) ──
function openPdfViewer(receiptKey, title){
  let pdf = getPdfFromStorage(receiptKey);
  if(!pdf){
    let inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'application/pdf,image/*';
    inp.onchange = async function(){
      let file = inp.files[0];
      if(!file) return;
      if(file.size > 5 * 1024 * 1024){
        toast('❌ File too large — max 5MB');
        return;
      }
      let reader = new FileReader();
      reader.onload = async function(e){
        let pdfData = { name: file.name, data: e.target.result };
        try {
          await savePdfToStorage(receiptKey, pdfData, function(pct){ if(typeof uploadProgressToast === 'function') uploadProgressToast(pct); }).finally(function(){ if(typeof uploadProgressToast === 'function') uploadProgressToast(null); });
        } catch(err){
          toast('❌ Upload failed: ' + err.message);
          return; // ne pas ouvrir le viewer sur un fichier qui n'a pas été sauvegardé
        }
        let pdf = getPdfFromStorage(receiptKey);
        if(pdf){
          document.getElementById('pdf-viewer-title').textContent = title || file.name;
          let frame = document.getElementById('pdf-viewer-frame');
          frame.src = pdf.isStreamed ? pdf.data : pdf.data;
          window._currentPdfDownload = pdf;
          openModal('modal-pdf-viewer');
        }
      };
      reader.readAsDataURL(file);
    };
    inp.click();
    return;
  }
  document.getElementById('pdf-viewer-title').textContent = title || pdf.name;
  let frame = document.getElementById('pdf-viewer-frame');
  frame.src = pdf.data;
  window._currentPdfDownload = pdf;
  openModal('modal-pdf-viewer');
}

// ── downloadCurrentPdf (orig. line 7314) ──
function downloadCurrentPdf(){
  let pdf = window._currentPdfDownload;
  if(!pdf) return;
  if(pdf.isStreamed){
    let a = document.createElement('a');
    a.href = pdf.data;
    a.download = pdf.name || 'attachment.pdf';
    a.target = '_blank';
    a.click();
  } else {
    let a = document.createElement('a');
    a.href = pdf.data;
    a.download = pdf.name || 'attachment.pdf';
    a.click();
  }
}
// ── updatePayStatusPreview (orig. line 7330) ──
function updatePayStatusPreview(method){ let el = document.getElementById('pay-status-preview'); if(!el) return; if(method === 'POST') el.innerHTML = '→ Status: <span style="color:#4ade80">PAID</span>'; else if(method === 'CASH') el.innerHTML = '→ Status: <span style="color:#f87171;font-weight:700">💵 UNPAID-CASH</span> <span style="color:var(--muted);font-size:.72rem">(click badge to mark paid)</span>'; else if(method === 'TRANSFERT') el.innerHTML = '→ Status: <span style="color:#60a5fa">TRANSFERT</span>'; }

// ── Verrouillage générique des champs du modal Add Payment (mot de passe vérifié côté serveur) ──
const PAY_LOCK_FIELDS = [
  { id:'pay-date',         icon:'paydate-lock-icon',         type:'input',  alwaysLock:true  },
  { id:'pay-contract',     icon:'paycontract-lock-icon',     type:'input',  alwaysLock:true  },
  { id:'pay-plate',        icon:'payplate-lock-icon',        type:'input',  alwaysLock:true  },
  { id:'pay-amount',       icon:'payamount-lock-icon',       type:'input',  alwaysLock:true  },
  { id:'pay-receipt',      icon:'payreceipt-lock-icon',      type:'input',  alwaysLock:true  },
  { id:'pay-method',       icon:'paymethod-lock-icon',       type:'select', alwaysLock:true  },
  { id:'pay-bank-receipt', icon:'paybankreceipt-lock-icon',  type:'input',  alwaysLock:false }
];

// ── unlockAllPaymentFields (orig. line 7343) ──
function unlockAllPaymentFields(){
  securePrompt('🔐 Enter password to unlock all fields:').then(function(pw){
    if(pw === null) return;
    checkPassword(pw, 'Payments — Unlock All Fields').then(function(ok){
    if(!ok){ toast('❌ Wrong password'); return; }
    
    // 1. Date
    let dateEl = document.getElementById('pay-date');
    if(dateEl){ 
      dateEl.readOnly = false; 
      dateEl.removeAttribute('readonly');
      dateEl.style.cursor = 'text'; 
      dateEl.style.opacity = '1'; 
      dateEl.style.pointerEvents = 'auto';
      dateEl.style.backgroundColor = 'var(--s1)';
      dateEl.style.color = 'var(--text)';
    }
    
    // 2. Cont.N°
    let contractEl = document.getElementById('pay-contract');
    if(contractEl){ 
      contractEl.readOnly = false; 
      contractEl.removeAttribute('readonly');
      contractEl.style.cursor = 'text'; 
      contractEl.style.opacity = '1'; 
      contractEl.style.pointerEvents = 'auto';
      contractEl.style.backgroundColor = 'var(--s1)';
      contractEl.style.color = 'var(--text)';
    }
    
    // 3. Plate Number
    let plateEl = document.getElementById('pay-plate');
    if(plateEl){ 
      plateEl.readOnly = false; 
      plateEl.removeAttribute('readonly');
      plateEl.style.cursor = 'text'; 
      plateEl.style.opacity = '1'; 
      plateEl.style.pointerEvents = 'auto';
      plateEl.style.backgroundColor = 'var(--s1)';
      plateEl.style.color = 'var(--text)';
    }
    
    // 4. Amount (OMR)
    let amountEl = document.getElementById('pay-amount');
    if(amountEl){ 
      amountEl.readOnly = false; 
      amountEl.removeAttribute('readonly');
      amountEl.style.cursor = 'text'; 
      amountEl.style.opacity = '1'; 
      amountEl.style.pointerEvents = 'auto';
      amountEl.style.backgroundColor = 'var(--s1)';
      amountEl.style.color = 'var(--text)';
    }
    
    // 5. Receipt N°
    let receiptEl = document.getElementById('pay-receipt');
    if(receiptEl){ 
      receiptEl.readOnly = false; 
      receiptEl.removeAttribute('readonly');
      receiptEl.style.cursor = 'text'; 
      receiptEl.style.opacity = '1'; 
      receiptEl.style.pointerEvents = 'auto';
      receiptEl.style.backgroundColor = 'var(--s1)';
      receiptEl.style.color = 'var(--text)';
    }
    
    // 6. Method (SELECT)
    let methodEl = document.getElementById('pay-method');
    if(methodEl){ 
      methodEl.disabled = false; 
      methodEl.removeAttribute('disabled');
      methodEl.style.cursor = ''; 
      methodEl.style.opacity = '1'; 
      methodEl.style.pointerEvents = 'auto';
      methodEl.style.backgroundColor = 'var(--s1)';
      methodEl.style.color = 'var(--text)';
    }
    
    // Update button
    let btn = document.getElementById('unlock-all-payment-btn');
    if(btn){ 
      btn.textContent = '🔓 All Unlocked'; 
      btn.style.borderColor = '#4ade80'; 
      btn.style.color = '#4ade80'; 
      btn.style.background = 'rgba(74,222,128,.12)'; 
    }
    
    toast('🔓 All payment fields unlocked (Invoice N° remains editable)');
    }); // end checkPassword
  }); // end securePrompt
}

// ── unlockPayField (orig. line 7433) ──
function unlockPayField(fieldId, iconId){
  let el = document.getElementById(fieldId);
  if(!el) return;
  let isLocked = (el.tagName === 'SELECT') ? el.disabled : el.readOnly;
  if(!isLocked) return;
  securePrompt('🔒 Enter password to edit this field:').then(function(pw){
    if(pw === null) return;
    checkPassword(pw, 'Payments — Unlock Field: ' + fieldId).then(function(ok){
    if(ok){
      if(el.tagName === 'SELECT'){ el.disabled = false; } else { el.readOnly = false; }
      el.style.cursor = '';
      el.style.opacity = '1';
      el.style.borderColor = '#f97316';
      let icon = document.getElementById(iconId);
      if(icon){ icon.innerHTML = '🔓 Unlocked'; icon.style.color = '#f97316'; }
      
      // Masquer le bouton unlock si c'est le SELECT Method
      if(fieldId === 'pay-method'){
        let unlockBtn = document.getElementById('pay-method-unlock-btn');
        if(unlockBtn) unlockBtn.style.display = 'none';
      }
      
      el.focus();
      toast('🔓 Field unlocked');
    } else {
      toast('❌ Wrong password');
    }
    }); // end checkPassword
  }); // end securePrompt
}

// ⚠️ DOUBLON DÉTECTÉ : lockAllPayFields est défini DEUX FOIS dans ce fichier.
// La 2e définition ci-dessous écrase silencieusement la 1ère (comportement IDENTIQUE
// à l'original app.html — rien n'a changé fonctionnellement). À nettoyer : demande à
// Hicham laquelle des deux est la version voulue avant de supprimer l'autre.
// ── lockAllPayFields (orig. line 7462) — 1ère définition ──
// ── lockAllPayFields (orig. line 7482) ──
function lockAllPayFields(){
  PAY_LOCK_FIELDS.forEach(f=>{
    let el = document.getElementById(f.id);
    if(!el) return;
    let hasValue = (el.value !== '' && el.value !== null && el.value !== undefined);
    if(!f.alwaysLock && !hasValue) return; // Invoice N° (Bank): stays open if left empty
    if(el.tagName === 'SELECT'){ el.disabled = true; } else { el.readOnly = true; }
    el.style.cursor = 'not-allowed';
    el.style.opacity = '.7';
    let icon = document.getElementById(f.icon);
    if(icon) icon.innerHTML = '🔒 Locked once set';
    
    // Afficher le bouton unlock pour le SELECT Method
    if(f.id === 'pay-method'){
      let unlockBtn = document.getElementById('pay-method-unlock-btn');
      if(unlockBtn) unlockBtn.style.display = 'block';
    }
  });
}

// ── lockAllPaymentFieldsAfterSave (orig. line 7502) ──
function lockAllPaymentFieldsAfterSave(){
  // Lock all payment fields EXCEPT Invoice N° (Bank) which stays editable
  
  // 1. Date
  let dateEl = document.getElementById('pay-date');
  if(dateEl){ 
    dateEl.readOnly = true; 
    dateEl.setAttribute('readonly', 'readonly');
    dateEl.style.cursor = 'not-allowed'; 
    dateEl.style.opacity = '0.65'; 
    dateEl.style.pointerEvents = 'none';
    dateEl.style.backgroundColor = '#e8edf2';
    dateEl.style.color = '#666';
  }
  
  // 2. Cont.N°
  let contractEl = document.getElementById('pay-contract');
  if(contractEl){ 
    contractEl.readOnly = true; 
    contractEl.setAttribute('readonly', 'readonly');
    contractEl.style.cursor = 'not-allowed'; 
    contractEl.style.opacity = '0.65'; 
    contractEl.style.pointerEvents = 'none';
    contractEl.style.backgroundColor = '#e8edf2';
    contractEl.style.color = '#666';
  }
  
  // 3. Plate Number
  let plateEl = document.getElementById('pay-plate');
  if(plateEl){ 
    plateEl.readOnly = true; 
    plateEl.setAttribute('readonly', 'readonly');
    plateEl.style.cursor = 'not-allowed'; 
    plateEl.style.opacity = '0.65'; 
    plateEl.style.pointerEvents = 'none';
    plateEl.style.backgroundColor = '#e8edf2';
    plateEl.style.color = '#666';
  }
  
  // 4. Amount (OMR)
  let amountEl = document.getElementById('pay-amount');
  if(amountEl){ 
    amountEl.readOnly = true; 
    amountEl.setAttribute('readonly', 'readonly');
    amountEl.style.cursor = 'not-allowed'; 
    amountEl.style.opacity = '0.65'; 
    amountEl.style.pointerEvents = 'none';
    amountEl.style.backgroundColor = '#e8edf2';
    amountEl.style.color = '#666';
  }
  
  // 5. Receipt N°
  let receiptEl = document.getElementById('pay-receipt');
  if(receiptEl){ 
    receiptEl.readOnly = true; 
    receiptEl.setAttribute('readonly', 'readonly');
    receiptEl.style.cursor = 'not-allowed'; 
    receiptEl.style.opacity = '0.65'; 
    receiptEl.style.pointerEvents = 'none';
    receiptEl.style.backgroundColor = '#e8edf2';
    receiptEl.style.color = '#666';
  }
  
  // 6. Method (SELECT)
  let methodEl = document.getElementById('pay-method');
  if(methodEl){ 
    methodEl.disabled = true; 
    methodEl.setAttribute('disabled', 'disabled');
    methodEl.style.cursor = 'not-allowed'; 
    methodEl.style.opacity = '0.65'; 
    methodEl.style.pointerEvents = 'none';
    methodEl.style.backgroundColor = '#e8edf2';
    methodEl.style.color = '#666';
  }
  
  // Reset unlock button
  let btn = document.getElementById('unlock-all-payment-btn');
  if(btn){ 
    btn.textContent = '🔐 Unlock All'; 
    btn.style.borderColor = '#f97316'; 
    btn.style.color = '#f97316'; 
    btn.style.background = 'rgba(249,115,22,.2)'; 
  }
}

// ── unlockAllPayFields (orig. line 7587) ──
function unlockAllPayFields(){
  PAY_LOCK_FIELDS.forEach(f=>{
    let el = document.getElementById(f.id);
    if(!el) return;
    if(el.tagName === 'SELECT'){ el.disabled = false; } else { el.readOnly = false; }
    el.style.cursor = '';
    el.style.opacity = '1';
    el.style.borderColor = '';
    let icon = document.getElementById(f.icon);
    if(icon) icon.innerHTML = '';
    
    // Masquer le bouton unlock pour le SELECT Method
    if(f.id === 'pay-method'){
      let unlockBtn = document.getElementById('pay-method-unlock-btn');
      if(unlockBtn) unlockBtn.style.display = 'none';
    }
  });
}

// ── openPaymentModal (orig. line 7606) ──
// ── quickAddPaymentFor : ouvre le modal Add Payment pré-rempli (Cont.N° + Plate) ──
// depuis le bouton 💰 d'une carte Daily Rentals. Amount reste vide (saisie manuelle),
// Method reste par défaut (choix manuel), Receipt N° auto-généré comme d'habitude.
// Les champs sont verrouillés (comme après un save) car pré-remplis par le système.
function quickAddPaymentFor(contract, plate){
  openPaymentModal(null);
  let cEl = document.getElementById('pay-contract');
  let pEl = document.getElementById('pay-plate');
  if(cEl) cEl.value = contract || '';
  if(pEl) pEl.value = plate || '';

  // Amount et Method doivent rester éditables tant que le paiement n'est pas
  // sauvegardé (Cont.N° et Plate restent verrouillés car auto-remplis).
  let amountEl = document.getElementById('pay-amount');
  if(amountEl){
    amountEl.readOnly = false;
    amountEl.removeAttribute('readonly');
    amountEl.style.cursor = 'text';
    amountEl.style.opacity = '1';
    amountEl.style.pointerEvents = 'auto';
    amountEl.style.backgroundColor = 'var(--s1)';
    amountEl.style.color = 'var(--text)';
  }
  let methodEl = document.getElementById('pay-method');
  if(methodEl){
    methodEl.disabled = false;
    methodEl.removeAttribute('disabled');
    methodEl.style.cursor = '';
    methodEl.style.opacity = '1';
    methodEl.style.pointerEvents = 'auto';
    methodEl.style.backgroundColor = 'var(--s1)';
    methodEl.style.color = 'var(--text)';
  }
  let unlockBtn = document.getElementById('pay-method-unlock-btn');
  if(unlockBtn) unlockBtn.style.display = 'none';

  if(amountEl) amountEl.focus();
}

function openPaymentModal(id=null){ 
  editingPaymentId = id; 
  
  // TOUJOURS verrouiller les champs au départ
  // Que ce soit NEW ou EDIT, les champs sont fermés
  // L'utilisateur doit cliquer "Unlock All" pour modifier
  
  document.getElementById('pay-plate').value = ''; 
  document.getElementById('pay-receipt').value = ''; 
  if(document.getElementById('pay-bank-receipt')) document.getElementById('pay-bank-receipt').value = ''; 
  document.getElementById('pay-contract').value = ''; 
  document.getElementById('pay-method').value = 'POST'; 
  currentPdfData = null; 
  window._doublonSuspectReceiptKey = null; 
  window._flagNextPaymentAudit = null; 
  updatePayStatusPreview('POST'); 
  document.getElementById('pay-amount').value = ''; 
  document.getElementById('pay-date').value = new Date().toISOString().slice(0,10); 
  
  if(!id){ 
    let maxR=0; 
    DB.payments.forEach(function(p){ 
      let n=parseInt((p.receipt||'').toString().replace(/[^0-9]/g,''),10); 
      if(!isNaN(n)&&n>maxR) maxR=n; 
    }); 
    // Suffixe de branche (B/M) — même logique que pour le numéro de contrat,
    // évite le recoupement entre les séquences BARKA et MOEBELA.
    let branchLetter = (Array.isArray(window.AUTH.branches) && window.AUTH.branches.length === 1)
      ? window.AUTH.branches[0].charAt(0).toUpperCase() : '';
    if(maxR>0) document.getElementById('pay-receipt').value=(maxR+1).toString() + branchLetter; 
  } 
  
  if(id){ 
    let p = DB.payments.find(x => x.id === id); 
    if(p){ 
      let v = DB.vehicles.find(x => x.id === p.vehicleId) || {}; 
      document.getElementById('pay-plate').value = v.plate || p._plate || ''; 
      document.getElementById('pay-receipt').value = p.receipt || ''; 
      if(document.getElementById('pay-bank-receipt')) document.getElementById('pay-bank-receipt').value = p.bankReceipt || ''; 
      document.getElementById('pay-contract').value = p.contract || ''; 
      document.getElementById('pay-method').value = p.paymentMethod || 'POST'; 
      updatePayStatusPreview(p.paymentMethod || 'POST'); 
      document.getElementById('pay-amount').value = p.price || 0; 
      document.getElementById('pay-date').value = p.dateOut ? p.dateOut.slice(0,10) : new Date().toISOString().slice(0,10); 
    } 
  } 
  
  // Lock all fields when opening modal (new or edit)
  lockAllPaymentFieldsAfterSave();
  
  openModal('payment-modal'); 
}

async function savePaymentModal(){
  let plate = document.getElementById('pay-plate').value; let receipt = document.getElementById('pay-receipt').value.trim(); let bankReceipt = (document.getElementById('pay-bank-receipt')||{value:''}).value.trim(); let contract = document.getElementById('pay-contract').value; let method = document.getElementById('pay-method').value; let amount = parseFloat(document.getElementById('pay-amount').value) || 0; let payDate = document.getElementById('pay-date').value;
  if(receipt){ let dupReceipt = DB.payments.find(p => p.receipt && p.receipt.toString().trim() === receipt && p.id !== editingPaymentId); if(dupReceipt){ toast('🚫 Receipt N° "' + receipt + '" already exists! Use a unique receipt number.'); return; } }

  // ── Résolution véhicule/rental AVANT tout matching par contrat ────────────
  // IMPORTANT : un numéro de contrat n'est unique QUE dans sa branche (BARKA
  // et MOEBELA ont chacune leur propre séquence, qui se recoupe légitimement).
  // Chercher un rental par "contract" seul peut donc tomber sur le MAUVAIS
  // contrat d'une autre branche. On utilise la plaque/véhicule pour lever
  // toute ambiguïté (bug réel corrigé le 03/08/2026).
  let vehicleIdPay = null; if(plate){ let found = DB.vehicles.find(v => v.plate === plate); if(found) vehicleIdPay = found.id; }
  let findRentalByContract = function(ct){
    let candidates = DB.rentals.filter(r => String(r.contract).trim() === String(ct).trim());
    if(candidates.length <= 1) return candidates[0];
    // Plusieurs contrats portent ce numéro (branches différentes) → désambiguïser par véhicule
    if(vehicleIdPay){ let byVeh = candidates.find(r => r.vehicleId === vehicleIdPay); if(byVeh) return byVeh; }
    return candidates[0]; // dernier recours : comportement historique
  };

  // ── CHRONOLOGIE REÇUS : Bloquer si date antérieure au dernier reçu enregistré ────
  if(!editingPaymentId && payDate && receipt) {
    let _allPay = DB.payments.filter(p => !p._quickAdd && p.dateOut && p.receipt);
    if(_allPay.length > 0) {
      _allPay.sort((a,b) => {
        let ra = parseInt((a.receipt||'0').toString().replace(/[^0-9]/g,''),10)||0;
        let rb = parseInt((b.receipt||'0').toString().replace(/[^0-9]/g,''),10)||0;
        return rb - ra;
      });
      let _lastPay = _allPay[0];
      let _lastDate = (_lastPay.dateOut||'').slice(0,10);
      if(_lastDate && payDate < _lastDate) {
        const _bypassPw = await securePrompt(
          '⚠️ Old receipt detected\n\nReceipt N° ' + (_lastPay.receipt||'?') + ' is dated ' + _lastDate + '.\nRequested date (' + payDate + ') is earlier.\n\nTo force entry of an old receipt, enter the password:'
        );
        if (_bypassPw === null) { toast('❌ Save cancelled.'); return; }
        const _bypassOk = await checkPassword(_bypassPw, 'Payments — Bypass Chronology');
        if (!_bypassOk) {
          toast('❌ Wrong password. Save cancelled.');
          return;
        }
        toast('🔓 Past receipt authorised — chronology bypassed.');
      }
    }
  }
  // ── FIN CHRONOLOGIE REÇUS ────────────────────────────────────────────────────────

  // ── Bloquer une date de reçu antérieure à la date de début du contrat ────────────
  if(contract && payDate){
    let _linkedRental = findRentalByContract(contract);
    if(_linkedRental && _linkedRental.dateOut){
      let _contractOutDay = _linkedRental.dateOut.slice(0,10);
      if(payDate < _contractOutDay){
        alert('❌ Receipt date (' + payDate + ') cannot be before the contract start date ' + contract + ' (' + _contractOutDay + ')!');
        return;
      }
    }
  }

  // ── BLOCAGE IMMÉDIAT si fichier already used comme PJ d'un autre paiement ──────────
  // (garde la vérification de hash uniquement si currentPdfData existe encore — cas legacy)
  // ── FIN BLOCAGE FICHIER DUPLIQUÉ ─────────────────────────────────────────────────────
  // ── BLOCAGE OCR supprimé — la vérification OCR se fait via le modal Attachment (📎) ──
  // ── FIN NOUVELLE VÉRIF ───────────────────────────────────────────────────────────────

  // ── Détermination de la branche du paiement ───────────────────────────
  let payBranch = (function(){
    // Priorité 1 : session utilisateur (BARKA/MOEBELA) — ignorer 'shared' du véhicule
    if(window.AUTH && !window.AUTH.isAdmin && Array.isArray(window.AUTH.branches) && window.AUTH.branches.length) return window.AUTH.branches[0];
    // Priorité 2 : branche du contrat lié
    let linkedR = contract ? findRentalByContract(contract) : null;
    if(linkedR && linkedR.branch && linkedR.branch.toLowerCase() !== 'shared') return linkedR.branch;
    // Priorité 3 : branche du véhicule (seulement si pas 'shared')
    let veh = vehicleIdPay ? DB.vehicles.find(v => v.id === vehicleIdPay) : DB.vehicles.find(v => v.plate === plate);
    let vb = veh && (veh.branch || veh.bureau);
    if(vb && vb.toLowerCase() !== 'shared') return vb;
    return undefined;
  })();

  // ── VÉRIFICATION DOUBLON CASH+POST : même jour, même montant ──────────────────────
  if(!editingPaymentId && amount > 0 && payDate) {
    const methodUp = method.toUpperCase();
    const oppositeMethod = methodUp === 'CASH' ? 'POST' : (methodUp === 'POST' ? 'CASH' : null);
    if(oppositeMethod) {
      const doublon = DB.payments.find(p => {
        const pMethod = (p.paymentMethod || '').toUpperCase();
        const pDate = (p.dateOut || '').slice(0,10);
        const pAmount = Number(p.price || 0);
        return pMethod === oppositeMethod && pDate === payDate && pAmount === amount && !p._quickAdd;
      });
      if(doublon) {
        // ⚠️ NE PAS marquer _auditFlag=true ici ! Ce flag signifie "vérifié par OCR/PJ".
        // Un doublon détecté n'est PAS encore vérifié — il doit continuer à clignoter en orange
        // jusqu'à ce qu'une pièce jointe soit réellement ajoutée et validée via saveAttachmentAndVerify().
        toast('⚠️ Duplicate ' + methodUp + '+' + oppositeMethod + ' detected! Attach a document via 📎 after saving.');
      }
    }
  }
  // ── FIN VÉRIFICATION DOUBLON ────────────────────────────────────────────────────────

  // ── VÉRIFICATION DOUBLON EN MODE ÉDITION ──────────────────────────────────────────
  if(editingPaymentId && amount > 0 && payDate) {
    const methodUp = method.toUpperCase();
    const oppMeth = methodUp==='CASH' ? 'POST' : (methodUp==='POST' ? 'CASH' : null);
    if(oppMeth) {
      const doublonEdit = DB.payments.find(p => {
        return (p.paymentMethod||'').toUpperCase()===oppMeth
          && (p.dateOut||'').slice(0,10)===payDate
          && Number(p.price||0)===amount
          && !p._quickAdd
          && p.id !== Number(editingPaymentId);
      });
      if(doublonEdit) {
        // ⚠️ Idem en édition : ne pas marquer comme vérifié tant qu'aucune PJ n'a été validée.
        toast('⚠️ Duplicate ' + methodUp + '+' + oppMeth + ' detected! Attach a document via 📎 to verify.');
      }
    }
  }
  // ── FIN VÉRIFICATION ÉDITION ──────────────────────────────────────────────────────────

  if(editingPaymentId){ let p = DB.payments.find(x => x.id === Number(editingPaymentId)); if(p){ pushUndo(); let _po = {plate:(DB.vehicles.find(v=>v.id===p.vehicleId)||{}).plate||p._plate||'—', receipt:p.receipt, contract:p.contract, method:p.paymentMethod, amount:p.price, date:p.dateOut}; p.vehicleId = vehicleIdPay; p._plate = vehicleIdPay ? undefined : plate; p.receipt = receipt; p.bankReceipt = bankReceipt; p.contract = contract; p.paymentMethod = method; p.price = amount; p.dateOut = payDate; p.branch = payBranch || p.branch; if(method === 'POST') p.statusLabel = 'PAID'; else if(method === 'CASH') p.statusLabel = (p.statusLabel==='PAID-CASH'||p.statusLabel==='UNPAID-CASH') ? p.statusLabel : 'UNPAID-CASH'; else if(method === 'TRANSFERT') p.statusLabel = 'TRANSFERT'; let _pFields = {plate:'Plate', receipt:'Receipt N°', contract:'Contract', method:'Method', amount:'Amount (OMR)', date:'Date'}; let _pNew = {plate, receipt, contract, method, amount, date:payDate}; let _pDiffs = []; Object.keys(_pFields).forEach(k=>{ let ov = String(_po[k]!==undefined&&_po[k]!==null?_po[k]:'—'); let nv = String(_pNew[k]!==undefined&&_pNew[k]!==null&&_pNew[k]!==''?_pNew[k]:'—'); if(ov !== nv) _pDiffs.push(_pFields[k]+': ['+ov+'] → ['+nv+']'); }); let _pDetail = _pDiffs.length ? _pDiffs.join(' | ') : 'Nonee modification detectede'; logAction('payment', '✏️ Payments — Edit Payment Cont. '+contract+' ('+plate+')', _pDetail, 'Cont. '+contract+' · '+plate); updateLogBadge(); } } else { pushUndo(); let initStatus = method === 'POST' ? 'PAID' : method === 'TRANSFERT' ? 'TRANSFERT' : 'UNPAID-CASH'; let _newPay = { id: _genId(), vehicleId: vehicleIdPay, _plate: vehicleIdPay ? undefined : plate, contract: contract, branch: payBranch, receipt: receipt || ('R'+Date.now()), bankReceipt: bankReceipt || '', paymentMethod: method, statusLabel: initStatus, price: amount, paid: amount, paymentDone: initStatus === 'PAID', dateOut: payDate }; DB.payments.push(_newPay); let _payDetail = 'Plate: '+plate+' | Method: '+method+' | Amount: '+amount+' OMR | Date: '+payDate+' | Receipt: '+(receipt||'—') + (bankReceipt ? ' | Bank Rcpt: '+bankReceipt : '') + (_newPay._auditFlag ? ' | ⚠️ AUDIT FLAG' : ''); logAction('payment', '➕ Payments — New Payment Cont. '+contract+' ('+plate+')', _payDetail, 'Cont. '+contract+' · '+plate); updateLogBadge(); }
  if(currentPdfData && receipt){
    let _pdfToSave = currentPdfData;
    currentPdfData = null;
    try {
      await savePdfToStorage(receipt, _pdfToSave, function(pct){ if(typeof uploadProgressToast === 'function') uploadProgressToast(pct); }).finally(function(){ if(typeof uploadProgressToast === 'function') uploadProgressToast(null); });
    } catch(err){
      toast('⚠️ Payment saved, but attachment upload failed: ' + err.message);
    }
  }

  // ── Cas 1 : déclenché depuis le modal Rental ──────────────────
  if(window._pendingPaymentFromRental && !editingPaymentId){
    let targetRental = findRentalByContract(contract);
    if(targetRental){
      // Sync r.paid et paymentLog depuis DB.payments (source unique — ne pas pusher dans paymentLog directement)
      targetRental.paid = paymentsForContract(contract, targetRental.branch, targetRental.vehicleId)
        .reduce((s,p) => s + Number(p.price||0), 0);
      targetRental.paymentLog = paymentsForContract(contract, targetRental.branch, targetRental.vehicleId)
        .map(p => ({ amount: Number(p.price||0), date: p.dateOut||'', method: p.paymentMethod||'', receipt: p.receipt||'', id: p.id, _quickAdd: p._quickAdd||false }));
      targetRental._balManual = false;
      if(targetRental.dateIn && targetRental.dateIn !== '') targetRental.bal = calcRentalBAL(targetRental);
      else targetRental.bal = calcOpenContractBAL(targetRental);
      // Recharger _editingRentalPayments depuis DB.payments (sans doublons)
      window._editingRentalPayments = paymentsForContract(contract, targetRental.branch, targetRental.vehicleId)
        .map(p => ({ amount: Number(p.price||0), date: p.dateOut||'', method: p.paymentMethod||'CASH', receipt: p.receipt||'', id: p.id, _quickAdd: p._quickAdd||false }));
      // ── FIX (2026-08) : persister le rental synchronisé côté serveur —
      // avant, seul le paiement était sauvegardé (saveOne('payments')), le
      // rental restait à jour SEULEMENT en mémoire locale de cet onglet.
      // Résultat : Daily Rentals et Payments affichaient 2 montants
      // différents pour le même contract dès qu'on rechargeait la page ou
      // qu'on ouvrait un autre poste/session. ──
      if(typeof saveRental === 'function') saveRental(targetRental.id);
    } else {
      if(!window._editingRentalPayments) window._editingRentalPayments = [];
      window._editingRentalPayments.push({ amount, date: payDate, method, receipt: receipt||'', id: Date.now() });
    }
    renderPaymentHistory();
    window._pendingPaymentFromRental = null;

  // ── Cas 2 : payment direct ou édition depuis l'onglet Payments ──
  } else if(contract){

    let syncRental = findRentalByContract(contract);

    if(syncRental){

      // recalcul total payé
      let totalPaid = paymentsForContract(contract, syncRental.branch, syncRental.vehicleId)
        .reduce((s,p) => s + Number(p.price || 0), 0);

      syncRental.paid = totalPaid;

      // synchroniser paymentLog
      syncRental.paymentLog = paymentsForContract(contract, syncRental.branch, syncRental.vehicleId)
        .map(p => ({
          amount: Number(p.price || 0),
          date: p.dateOut || '',
          method: p.paymentMethod || 'CASH',
          receipt: p.receipt || '',
          id: p.id
        }));

      // recalcul automatique BAL (always recalc after payment change)
      syncRental._balManual = false;
      if(syncRental.dateIn && syncRental.dateIn !== ''){
        syncRental.bal = calcRentalBAL(syncRental);
      } else {
        syncRental.bal = calcOpenContractBAL(syncRental);
      }
      // ── FIX (2026-08) : idem — pousser le rental synchronisé au serveur,
      // sinon l'édition d'un paiement (10 → 9 OMR) depuis l'onglet Payments
      // ne se voyait jamais dans Daily Rentals après un reload : le montant
      // restait "10" côté serveur car seul le paiement était persisté. ──
      if(typeof saveRental === 'function') saveRental(syncRental.id);
    }
  }

  lockAllPaymentFieldsAfterSave();
  // saveOne: sauvegarder uniquement le payment modifié
  (function(){
    let _p = editingPaymentId ? DB.payments.find(x => x.id === Number(editingPaymentId)) : DB.payments[DB.payments.length-1];
    if(_p) savePayment(_p.id);
  })();
  closeModal('payment-modal'); refreshAll(); toast('✅ Payment saved');
}

// ── editPayment (orig. line 7818) ──
function editPayment(id){ openPaymentModal(id); }
// ── deletePayment (orig. line 7819) ──
function deletePayment(id){
  securePrompt('🗑️ Enter password to delete payment').then(password => {
    if(password === null) return;
    checkPassword(password, 'Delete Payment #' + id).then(function(ok){
    if(ok){
      pushUndo();
      let p = DB.payments.find(x => x.id === id);
      if(p){
        let _dp = (DB.vehicles.find(v=>v.id===p.vehicleId)||{});
        logAction('delete', '🗑️ Payments — Deleted Payment Cont. '+(p.contract||'?')+' ('+(_dp.plate||p._plate||'?')+')', 'Plate: '+(_dp.plate||p._plate||'?')+' | Amount: '+p.price+' OMR | Method: '+(p.paymentMethod||'—')+' | Receipt: '+(p.receipt||'—')+' | Date: '+(p.dateOut||'—'), 'Cont. '+(p.contract||'?')+' · '+(_dp.plate||p._plate||'?'));
        let delContract = p.contract;
        let delBranch = p.branch;
        let delVehicleId = p.vehicleId;
        DB.payments = DB.payments.filter(x => x.id !== id);
        // Sync r.paid on the rental
        // FIX (2026-08) : scopé par branche + véhicule (via paymentsForContract) —
        // sinon supprimer un paiement BARKA "4499" recalculait aussi le solde du
        // rental MOEBELA "4499" en session Directeur.
        if(delContract){
          let syncR = DB.rentals.find(r =>
            String(r.contract) === String(delContract) &&
            (!delBranch || !r.branch || String(r.branch).toUpperCase() === String(delBranch).toUpperCase())
          ) || DB.rentals.find(r => String(r.contract) === String(delContract));
          if(syncR){
            syncR.paid = paymentsForContract(delContract, syncR.branch || delBranch, syncR.vehicleId || delVehicleId).reduce((s,x)=>s+Number(x.paid||x.price||0),0);
            if(syncR.paymentLog) syncR.paymentLog = syncR.paymentLog.filter(pl => pl.receipt !== p.receipt);
            // recalcul automatique BAL (comme dans savePaymentModal)
            syncR._balManual = false;
            if(syncR.dateIn && syncR.dateIn !== ''){
              syncR.bal = calcRentalBAL(syncR);
            } else {
              syncR.bal = calcOpenContractBAL(syncR);
            }
            // ── FIX (2026-08) : pousser le rental synchronisé au serveur —
            // sinon la suppression d'un paiement dans Payments ne se
            // répercutait jamais sur le montant "paid" du contrat vu dans
            // Daily Rentals après un reload (le paiement disparaissait
            // bien de la base, mais le total du rental restait périmé). ──
            if(typeof saveRental === 'function') saveRental(syncR.id);
          }
        }
      } else {
        DB.payments = DB.payments.filter(x => x.id !== id);
      }
      // ── FIX (2026-07) : notifier le serveur EXPLICITEMENT — /save (complète)
      // ne supprime plus rien par déduction, donc sans ceci le paiement
      // réapparaîtrait tout seul au prochain chargement (chez toi ou un collègue).
      if(typeof deleteOne === 'function') deleteOne('payments', id, null);
      updateLogBadge();
      renderPayments();
      refreshAll();
      showUndoToast('🗑️ Deleted — <strong style="cursor:pointer;text-decoration:underline" data-i18n-action="undo">UNDO</strong> &nbsp;|&nbsp; Press Save to confirm');
    } else {
      toast('❌ Wrong password!');
    }
    }); // end checkPassword
  }); // end securePrompt
}

// ── showVerifOverlay (orig. line 8020) ──
function showVerifOverlay(msg) {
  var ov = document.getElementById('ai-verif-overlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'ai-verif-overlay';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9999;display:flex;align-items:center;justify-content:center;';
    ov.innerHTML = '<div style="background:var(--s1);border:1.5px solid var(--green);border-radius:14px;padding:28px 36px;text-align:center;max-width:380px"><div style="font-size:2rem;margin-bottom:10px">&#x1F916;</div><div id="ai-verif-msg" style="font-size:.95rem;font-weight:700;color:var(--text);margin-bottom:8px"></div><div style="width:100%;height:4px;background:var(--s3);border-radius:2px;overflow:hidden"><div style="height:100%;width:40%;background:linear-gradient(90deg,var(--green),#60a5fa);border-radius:2px;animation:vbar 1.5s linear infinite"></div></div></div><style>@keyframes vbar{0%{transform:translateX(-250%)}100%{transform:translateX(600%)}}</style>';
    document.body.appendChild(ov);
  }
  var msgEl = document.getElementById('ai-verif-msg');
  if (msgEl) msgEl.textContent = msg;
  ov.style.display = 'flex';
}

// ── hideVerifOverlay (orig. line 8034) ──
function hideVerifOverlay() {
  var ov = document.getElementById('ai-verif-overlay');
  if (ov) ov.style.display = 'none';
}

// ── showVerifResult (orig. line 8039) ──
function showVerifResult(ok, details, onConfirm) {
  var existing = document.getElementById('ai-verif-result');
  if (existing) existing.remove();
  var ov = document.createElement('div');
  ov.id = 'ai-verif-result';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
  var confirmHtml = ok ? '<button id="avc-btn" style="background:var(--green3);color:#fff;border:none;border-radius:8px;padding:10px 24px;font-weight:700;cursor:pointer;font-size:.9rem">&#x2705; Confirm payment</button>' : '';
  var ml = ok ? '8px' : '0';
  ov.innerHTML = '<div style="background:var(--s1);border:2px solid ' + (ok ? 'var(--green)' : 'var(--red2)') + ';border-radius:14px;padding:24px 28px;max-width:420px;width:100%;text-align:center">'
    + '<div style="font-size:2.5rem;margin-bottom:10px">' + (ok ? '&#x2705;' : '&#x274C;') + '</div>'
    + '<div style="font-size:1.05rem;font-weight:800;color:' + (ok ? 'var(--green)' : 'var(--red2)') + ';margin-bottom:10px">' + (ok ? 'V\u00e9rification r\u00e9ussie !' : 'V\u00e9rification \u00e9chou\u00e9e') + '</div>'
    + '<div style="font-size:.82rem;color:var(--muted);background:var(--s2);border-radius:8px;padding:10px 14px;margin-bottom:16px;line-height:1.6;text-align:left">' + details + '</div>'
    + '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">' + confirmHtml
    + '<button id="avc-close" style="background:var(--s3);color:var(--text);border:1px solid var(--border2);border-radius:8px;padding:10px 24px;font-weight:600;cursor:pointer;font-size:.9rem;margin-left:' + ml + '">Close</button>'
    + '</div></div>';
  document.body.appendChild(ov);
  document.getElementById('avc-close').onclick = function() { ov.remove(); };
  if (ok) { document.getElementById('avc-btn').onclick = function() { ov.remove(); onConfirm(); }; }
}

// ── loadTesseract (orig. line 8059) ──
// ⚠️ Auto-hébergé depuis /vendor/tesseract/ (plus de dépendance à cdn.jsdelivr.net,
// qui échouait de façon répétée avec "Loading failed for the <script>" côté client
// → OCR toujours indisponible). Voir aussi ocrPaths() ci-dessous, utilisé par
// chaque appel Tesseract.recognize() pour pointer worker/core/langues en local.
function loadTesseract() {
  return new Promise(function(resolve, reject) {
    if (window.Tesseract) { resolve(); return; }
    var s = document.createElement('script');
    // ⚠️ tesseract.min.js = le bundle "thread principal" qui expose window.Tesseract.
    // worker.min.js (utilisé dans ocrPaths() ci-dessous) est un fichier différent :
    // il tourne à l'intérieur du Web Worker créé par Tesseract, pas dans la page.
    s.src = '/vendor/tesseract/tesseract.min.js';
    s.onload = resolve;
    s.onerror = function() { reject(new Error('Impossible de charger Tesseract.js (fichier local /vendor/tesseract/tesseract.min.js introuvable)')); };
    document.head.appendChild(s);
  });
}

// Chemins locaux passés à chaque Tesseract.recognize() pour éviter tout appel
// réseau vers cdn.jsdelivr.net (core wasm + données de langue eng/fra).
function ocrPaths() {
  return {
    workerPath: '/vendor/tesseract/worker.min.js',
    corePath:   '/vendor/tesseract/tesseract-core-simd-lstm.wasm.js',
    langPath:   '/vendor/tesseract/lang-data',
    gzip: true
  };
}

async function verifyReceiptWithAI(base64Data, mediaType, expectedAmount, expectedDate) {
  showVerifOverlay('Chargement OCR...');
  try {
    await loadTesseract();

    // Convert base64 to blob for Tesseract
    var byteChars = atob(base64Data);
    var byteArr = new Uint8Array(byteChars.length);
    for (var i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
    var blob = new Blob([byteArr], { type: mediaType });

    showVerifOverlay('Reading receipt in progress...');
    var result = await Tesseract.recognize(blob, 'eng+fra', Object.assign({
      logger: function(m) {
        if (m.status === 'recognizing text') {
          showVerifOverlay('OCR : ' + Math.round(m.progress * 100) + '%');
        }
      }
    }, ocrPaths()));

    showVerifOverlay('Verifying...');
    var text = result.data.text;
    console.log('[OCR Receipt]', text);

    // Extract amount — matches patterns like 38.000 / 38,000 / 38.500 OMR
    var foundAmount = null;
    var amMatches = text.match(/([0-9]+[.,][0-9]{3})/g);
    if (amMatches) {
      var expAmt = parseFloat(expectedAmount);
      for (var i = 0; i < amMatches.length; i++) {
        var candidate = parseFloat(amMatches[i].replace(',', '.'));
        if (Math.abs(candidate - expAmt) < 0.01) { foundAmount = candidate; break; }
      }
      if (foundAmount === null) foundAmount = parseFloat(amMatches[0].replace(',', '.'));
    }

    // Extract date — matches DD/MM/YYYY or DD-MM-YYYY
    var foundDate = null;
    var dtMatch = text.match(/([0-9]{1,2})[\/\-]([0-9]{1,2})[\/\-]([0-9]{4})/);
    if (dtMatch) {
      foundDate = ('0'+dtMatch[1]).slice(-2) + '/' + ('0'+dtMatch[2]).slice(-2) + '/' + dtMatch[3];
    }

    var expAmtF  = parseFloat(expectedAmount);
    var amountOk = foundAmount !== null && Math.abs(foundAmount - expAmtF) < 0.01;
    var dateOk   = foundDate   !== null && foundDate === expectedDate;
    var ok = amountOk && dateOk;
    var raison = ok
      ? 'Amount and date verified.'
      : ((amountOk ? '' : 'Amount incorrect. ') + (dateOk ? '' : 'Date incorrect.'));

    hideVerifOverlay();
    return { ok: ok, montant_trouve: foundAmount, date_trouvee: foundDate, raison: raison };
  } catch(err) {
    hideVerifOverlay();
    return { ok: false, raison: 'OCR Error: ' + err.message };
  }
}
// ── END VERIFICATION ──────────────────────────────────────────────────────────

// ── toggleCashStatus (orig. line 8130) ──
function toggleCashStatus(id){
  var p = DB.payments.find(function(x){ return x.id === id; });
  if(!p) return;

  if(p.statusLabel === 'UNPAID-CASH'){
    var existingPdf = getPdfFromStorage(p.receipt || '');
    if(!existingPdf){
      toast('Piece attached required pour marquer PAID-CASH');
      var inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'application/pdf,image/*';
      inp.onchange = async function(){
        var file = inp.files[0]; if(!file) return;
        if(file.size > 5*1024*1024){ toast('❌ File too large — max 5MB'); return; }
        var base64Data = await new Promise(function(res, rej){
          var r = new FileReader();
          r.onload = function(){ res(r.result.split(',')[1]); };
          r.onerror = function(){ rej(new Error('Lecture fichier echouee')); };
          r.readAsDataURL(file);
        });
        var expectedAmount = p.price || 0;
        var rawDate = p.dateOut ? p.dateOut.slice(0,10) : '';
        var expectedDate = rawDate ? rawDate.split('-').reverse().join('/') : '';
        var result = await verifyReceiptWithAI(base64Data, file.type, expectedAmount, expectedDate);
        var detailsHtml = 'Amount attendu : <strong>' + expectedAmount + ' OMR</strong><br>'
          + 'Date attendue : <strong>' + expectedDate + '</strong><br><br>'
          + 'Amount found : <strong>' + (result.montant_trouve !== null && result.montant_trouve !== undefined ? result.montant_trouve + ' OMR' : '—') + '</strong><br>'
          + 'Date found : <strong>' + (result.date_trouvee || '—') + '</strong><br><br>'
          + '<em>' + (result.raison || '') + '</em>';
        showVerifResult(result.ok, detailsHtml, async function(){
          var key = p.receipt || ('cash_'+p.id);
          var fullData = 'data:'+file.type+';base64,'+base64Data;
          try {
            await savePdfToStorage(key, {name: file.name, data: fullData}, function(pct){ if(typeof uploadProgressToast === 'function') uploadProgressToast(pct); }).finally(function(){ if(typeof uploadProgressToast === 'function') uploadProgressToast(null); });
          } catch(err){
            toast('❌ Upload failed, payment NOT marked as paid: ' + err.message);
            return; // ne pas marquer PAID-CASH si le justificatif n'a pas pu être sauvegardé
          }
          p.statusLabel = 'PAID-CASH';
          pushUndo();
          renderPayments();
          savePayment(p.id);
          toast('✅ Attachment verified — Marked PAID-CASH');
        });
      };
      inp.click();
      return;
    }
    pushUndo();
    p.statusLabel = 'PAID-CASH';
  } else if(p.statusLabel === 'PAID-CASH'){
    pushUndo();
    p.statusLabel = 'UNPAID-CASH';
  }
  renderPayments();
  savePayment(p.id);
  toast(p.statusLabel === 'PAID-CASH' ? '✅ Marked PAID-CASH' : '↩️ Marked UNPAID-CASH');
}
// ── initStatusLabels (orig. line 8182) ──
function initStatusLabels(){ DB.payments.forEach(p => { if(!p.statusLabel){ let m = p.paymentMethod || 'POST'; p.statusLabel = m === 'CASH' ? 'UNPAID-CASH' : m === 'TRANSFERT' ? 'TRANSFERT' : 'PAID'; } }); }

// ── toggleTransfertStatus — OCR requis uniquement au moment de confirmer ────────────────
// ── toggleTransfertStatus (orig. line 8185) ──
function toggleTransfertStatus(id){
  var p = DB.payments.find(function(x){ return x.id === id; });
  if(!p) return;

  if(p.statusLabel === 'TRANSFERT'){
    // Demander pièce attached + vérification OCR au moment de confirmer
    var inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'application/pdf,image/*';
    inp.onchange = async function(){
      var file = inp.files[0]; if(!file) return;
      if(file.size > 5*1024*1024){ toast('❌ File too large — max 5MB'); return; }
      var base64Data = await new Promise(function(res, rej){
        var r = new FileReader();
        r.onload = function(){ res(r.result.split(',')[1]); };
        r.onerror = function(){ rej(new Error('Lecture fichier echouee')); };
        r.readAsDataURL(file);
      });
      var expectedAmount = p.price || 0;
      var rawDate = p.dateOut ? p.dateOut.slice(0,10) : '';
      var expectedDate = rawDate ? rawDate.split('-').reverse().join('/') : '';
      var result = await verifyReceiptWithAI(base64Data, file.type, expectedAmount, expectedDate);
      var detailsHtml = 'Amount attendu : <strong>' + expectedAmount + ' OMR</strong><br>'
        + 'Date attendue : <strong>' + expectedDate + '</strong><br><br>'
        + 'Amount found: <strong>' + (result.montant_trouve !== null && result.montant_trouve !== undefined ? result.montant_trouve + ' OMR' : '—') + '</strong><br>'
        + 'Date found: <strong>' + (result.date_trouvee || '—') + '</strong><br><br>'
        + '<em>' + (result.raison || '') + '</em>';
      showVerifResult(result.ok, detailsHtml, async function(){
        var key = p.receipt || ('transfert_'+p.id);
        var fullData = 'data:'+file.type+';base64,'+base64Data;
        try {
          await savePdfToStorage(key, {name: file.name, data: fullData}, function(pct){ if(typeof uploadProgressToast === 'function') uploadProgressToast(pct); }).finally(function(){ if(typeof uploadProgressToast === 'function') uploadProgressToast(null); });
        } catch(err){
          toast('❌ Upload failed, transfer NOT confirmed: ' + err.message);
          return; // ne pas confirmer le virement si le justificatif n'a pas pu être sauvegardé
        }
        pushUndo();
        p.statusLabel = 'TRANSFERT-CONFIRMED';
        renderPayments();
        savePayment(p.id);
        toast('🏦 Transfer verified and confirmed');
        if(p.contract && document.getElementById('modal-pay-history') && document.getElementById('modal-pay-history').style.display !== 'none'){
          showPaymentHistory(p.contract, p.branch);
        }
      });
    };
    inp.click();
  } else if(p.statusLabel === 'TRANSFERT-CONFIRMED'){
    // Permettre de revenir à non-confirmé sans OCR
    pushUndo();
    p.statusLabel = 'TRANSFERT';
    renderPayments();
    savePayment(p.id);
    toast('↩️ Transfer unconfirmed');
    if(p.contract && document.getElementById('modal-pay-history') && document.getElementById('modal-pay-history').style.display !== 'none'){
      showPaymentHistory(p.contract, p.branch);
    }
  }
}

// ── Délégation d'événements (2026-08) — remplace les onclick= inline sur
// les boutons/badges générés dynamiquement ci-dessus (en-tête de jour,
// statut cash/transfert, icône pièce jointe, modifier/supprimer).
// Comportement strictement identique.
document.addEventListener('click', function(e){
  let btn = e.target.closest('[data-pay-action]');
  if(!btn) return;
  let action = btn.dataset.payAction;
  if(action === 'toggle-day'){
    togglePayDay(btn.dataset.payDayId);
  } else if(action === 'toggle-cash'){
    toggleCashStatus(Number(btn.dataset.payId));
  } else if(action === 'toggle-transfert'){
    toggleTransfertStatus(Number(btn.dataset.payId));
  } else if(action === 'open-attachment'){
    openAttachmentModal(Number(btn.dataset.payId));
  } else if(action === 'edit'){
    editPayment(Number(btn.dataset.payId));
  } else if(action === 'delete'){
    deletePayment(Number(btn.dataset.payId));
  }
});
