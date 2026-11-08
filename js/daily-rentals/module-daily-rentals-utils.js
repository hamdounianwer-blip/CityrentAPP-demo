// ═══════════════════════════════════════════════════════════════════
// module-daily-rentals-utils.js
// UTILS — notes, jours facturés, petits patches (AUDIO PATCH, etc.)
// Extrait automatiquement de module-daily-rentals.js (découpage mécanique,
// aucune ligne modifiée — tout reste en portée globale, comme avant).
// ═══════════════════════════════════════════════════════════════════

// ── showNotePopup (orig. line 10208) ──
function showNotePopup(event, rentalId){
  let r = DB.rentals.find(x => x.id === rentalId);
  if(!r || !r.notes) return;
  // Remove existing popup
  let existing = document.getElementById('note-popup');
  if(existing) existing.remove();
  // Create popup
  let popup = document.createElement('div');
  popup.id = 'note-popup';
  popup.style.cssText = 'position:fixed;z-index:9999;background:var(--s2);border:1.5px solid #60a5fa;border-radius:10px;padding:14px 16px;max-width:320px;min-width:200px;box-shadow:0 8px 32px rgba(0,0,0,.35);font-family:var(--font)';
  let v = r.vehicleId ? (DB.vehicles.find(x=>x.id===r.vehicleId)||{}) : {};
  let plate = v.plate || r._plate || '—';
  popup.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <span style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#60a5fa">📝 Note — ${plate}</span>
      <button data-dr-action="close-overlay" data-dr-overlay-id="note-popup" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:1rem;line-height:1">✕</button>
    </div>
    <div style="font-size:.88rem;color:var(--text);line-height:1.5;white-space:pre-wrap">${escapeHtml(r.notes)}</div>
  `;
  document.body.appendChild(popup);
  // Position near click
  let x = event.clientX + 10, y = event.clientY + 10;
  if(x + 330 > window.innerWidth) x = window.innerWidth - 340;
  if(y + 150 > window.innerHeight) y = event.clientY - 140;
  popup.style.left = x + 'px';
  popup.style.top  = y + 'px';
  // Close on outside click
  setTimeout(() => {
    document.addEventListener('click', function closePopup(e){
      if(!popup.contains(e.target)){ popup.remove(); document.removeEventListener('click', closePopup); }
    });
  }, 100);
  event.stopPropagation();
}



// ── extractPlateNum (orig. line 10244) ──
function extractPlateNum(str){
  if(!str) return '';
  // Match pattern like 1234-T, 1234-TA, 1234-TB etc.
  let m = (str||'').match(/\d{3,6}-[A-Z]{1,3}/i);
  return m ? m[0].toUpperCase() : (str||'').trim().toUpperCase();
}


// ── onNoteInput (orig. line 10251) ──
function onNoteInput(val){
  // Write note directly into DB.rentals on every keystroke — no Save button needed
  let editId = document.getElementById('modal-rental').getAttribute('data-edit-id');
  if(editId && editId !== ''){
    let r = DB.rentals.find(x => x.id === Number(editId));
    if(r) r.notes = val;
  }
}


// ── saveNoteOnly (orig. line 10260) ──
function saveNoteOnly(){
  let editId = document.getElementById('modal-rental').getAttribute('data-edit-id');
  if(!editId || editId === '') return;
  let noteVal = document.getElementById('r-notes').value;
  let r = DB.rentals.find(x => x.id === Number(editId));
  if(!r){ console.warn('saveNoteOnly: rental not found', editId); return; }
  r.notes = noteVal;
  saveRental(r.id);
  let nb = document.getElementById('note-save-btn');
  if(nb){ nb.style.display='none'; }
  let btn = document.querySelector('#modal-rental .modal-footer .btn-primary');
  if(btn){ btn.style.background=''; btn.style.boxShadow=''; btn.innerHTML='💾 Save'; }
  toast('📝 Note saved — ' + (r.contract||''));
}



// ── flushNoteAndSave (orig. line 10276) ──
function flushNoteAndSave(){
  // If rental modal is open, write the note textarea value into DB before saving
  let modal = document.getElementById('modal-rental');
  let isOpen = modal && (modal.classList.contains('show') || modal.style.display === 'flex' || modal.style.display === 'block');
  if(isOpen){
    let editId = modal.getAttribute('data-edit-id');
    let notesEl = document.getElementById('r-notes');
    if(editId && notesEl){
      let r = DB.rentals.find(x => x.id === Number(editId));
      if(r){ r.notes = notesEl.value; }
    }
  }
  saveAll();
}



// ── goToContract (orig. line 10483) ──
function goToContract(rentalId){
  let navBtn = document.querySelector('.nav-item[onclick*="daily"]');
  goTo('daily', navBtn);
  setTimeout(()=>{
    let row = document.getElementById('oc-row-'+rentalId);
    if(row){
      row.scrollIntoView({behavior:'smooth',block:'center'});
      row.classList.add('row-blink');
      setTimeout(()=> row.classList.remove('row-blink'), 3500);
    }
  }, 450);
}



// ==== SAFE AUDIO CONTEXT PATCH ====
window.__audioInitialized = false;

// ── calculateExtraHours (orig. line 10975) ──
function calculateExtraHours(dateOut,dateIn){

    try{

        if(!dateOut || !dateIn) return 0;

        let out = new Date(dateOut);
        let inn = new Date(dateIn);

        let diffMs = inn - out;

        let totalHours = diffMs / (1000*60*60);

        let days = Math.floor(totalHours / 24);

        let remainder = totalHours - (days * 24);

        return remainder;

    }catch(e){
        return 0;
    }
}



// ==== EXTRA DAY + KM FIX ====
// ── getFacturedDaysWithGrace (orig. line 11030) ──
function getFacturedDaysWithGrace(dateOut,dateIn){

    try{

        let out = new Date(dateOut);
        let inn = new Date(dateIn);

        let diffMs = inn - out;

        let totalHours = diffMs / (1000*60*60);

        let days = Math.floor(totalHours / 24);

        let extraHours = totalHours - (days * 24);

        if(extraHours >= 7){
            days += 1;
        }

        if(days <= 0) days = 1;

        return days;

    }catch(e){

        return 1;
    }
}
