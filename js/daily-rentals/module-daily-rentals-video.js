// ═══════════════════════════════════════════════════════════════════
// module-daily-rentals-video.js
// VIDEO — vidéo de contrat (upload / lecture / suppression)
// Extrait automatiquement de module-daily-rentals.js (découpage mécanique,
// aucune ligne modifiée — tout reste en portée globale, comme avant).
// ═══════════════════════════════════════════════════════════════════


// ── openContractVideo (orig. line 11103) ──
// ── Per-Contract Video System — Node.js server backend ─────────────────
// Les vidéos sont servies via http://localhost:3456
// Le serveur Node.js stocke les chemins dans videos.json sur le disque

// FIX 09/07/2026 : 'localhost' pointait vers la machine du CLIENT (pas le
// serveur), donc ça marchait uniquement depuis le PC serveur lui-même.
// window.location.origin reprend automatiquement l'adresse réellement
// utilisée pour charger la page (localhost:3000 en local sur le serveur,
// ou l'adresse du serveur depuis un autre poste).
var SERVER = window.location.origin;
window._contractVideos = window._contractVideos || {};
var _currentVideoContract = null;

// Load la liste des vidéos depuis le serveur au démarrage
(function loadVideoIndex(){
  fetch(SERVER + '/videos', { headers: authHeaders() })
    .then(r => r.json())
    .then(data => {
      // data = { "contractKey": { name, path, size }, ... }
      Object.keys(data).forEach(k => {
        window._contractVideos[k] = {
          name: data[k].name,
          url:  SERVER + '/stream/' + encodeURIComponent(k),
          size: data[k].size
        };
      });
    })
    .catch(() => {
      // Serveur non démarré — mode dégradé (session seulement)
      console.warn('[Video] Node.js server unavailable. Start server.js for persistence.');
    });
})();

function openContractVideo(contractKey){
  _currentVideoContract = String(contractKey);
  document.getElementById('video-modal-title').textContent = 'Rental N° ' + contractKey;
  var existing = window._contractVideos[_currentVideoContract];
  if(existing){ _showVideoPlayer(existing.url, existing.name, existing.size); }
  else { _showVideoDropZone(); }
  document.getElementById('modal-video').classList.add('show');
}


// ── openVideoModal (orig. line 11140) ──
function openVideoModal(){
  _currentVideoContract = '__tutorial__';
  document.getElementById('video-modal-title').textContent = 'Video Tutorial';
  var existing = window._contractVideos['__tutorial__'];
  if(existing){ _showVideoPlayer(existing.url, existing.name, existing.size); }
  else { _showVideoDropZone(); }
  document.getElementById('modal-video').classList.add('show');
}


// ── closeVideoModal (orig. line 11149) ──
function closeVideoModal(){
  document.getElementById('tutorial-video').pause();
  document.getElementById('modal-video').classList.remove('show');
}


// ── _showVideoDropZone (orig. line 11154) ──
function _showVideoDropZone(){
  document.getElementById('video-drop-zone').style.display = 'block';
  document.getElementById('video-player-wrap').style.display = 'none';
  document.getElementById('video-toolbar').style.display = 'none';
}


// ── _showVideoPlayer (orig. line 11160) ──
function _showVideoPlayer(url, name, size){
  document.getElementById('video-drop-zone').style.display = 'none';
  document.getElementById('video-player-wrap').style.display = 'block';
  document.getElementById('video-toolbar').style.display = 'flex';
  var vid = document.getElementById('tutorial-video');
  // Remove old error handler
  vid.onerror = null;
  vid.src = url; vid.load();
  // Handle load error (file moved/deleted on disk)
  vid.onerror = function(){
    var key = _currentVideoContract;
    // Remove stale entry
    if(key && window._contractVideos[key]){
      delete window._contractVideos[key];
    }
    // Tell server to clean up stale reference
    fetch(SERVER + '/remove-video', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type':'application/json' }),
      body: JSON.stringify({ contractKey: key })
    }).catch(function(){});
    // Show drop zone with error message
    _showVideoDropZone();
    document.getElementById('video-drop-zone').innerHTML = '<div style="font-size:2rem;margin-bottom:12px">⚠️</div><div style="color:#f87171;font-size:.9rem;font-weight:700;margin-bottom:6px">Video file not found on disk</div><div style="color:#94a3b8;font-size:.8rem;margin-bottom:20px">The file may have been moved or deleted.<br>Please select it again below.</div><label style="display:inline-block;background:rgba(37,99,235,.18);border:1.5px solid #3b82f6;color:#93c5fd;padding:10px 22px;border-radius:8px;cursor:pointer;font-weight:700;font-size:.88rem"><input type="file" id="video-file-input" accept="video/*,.mkv,.avi,.mov,.mp4,.webm,.wmv" style="display:none" onchange="loadContractVideoFile(this)">📁 Choose video file</label>';
    if(key) renderDaily();  // refresh 🎬 button color
  };
  vid.play().catch(function(){});
  var sizeTxt = size ? ' · ' + (size/1048576).toFixed(1) + ' MB' : '';
  document.getElementById('video-info').textContent = name + sizeTxt;
}


// ── loadContractVideoFile (orig. line 11191) ──
function loadContractVideoFile(input){
  var file = input.files && input.files[0];
  if(!file || !_currentVideoContract) return;

  var key = _currentVideoContract;

  // Upload vers le serveur Node.js
  var formData = new FormData();
  formData.append('video', file);
  formData.append('contractKey', key);

  // Afficher le nom pendant l'upload
  _showVideoPlayer(URL.createObjectURL(file), file.name + ' (envoi...)', file.size);

  fetch(SERVER + '/upload', { method: 'POST', headers: authHeaders(), body: formData })
    .then(r => r.json())
    .then(res => {
      if(res.ok){
        var url = SERVER + '/stream/' + encodeURIComponent(key);
        window._contractVideos[key] = { name: file.name, url: url, size: file.size };
        _showVideoPlayer(url, file.name, file.size);
        if(typeof showToast === 'function') showToast('✅ Video saved');
      } else {
        throw new Error(res.error || 'Error upload');
      }
    })
    .catch(err => {
      // Fallback : Object URL en mémoire session
      var url = URL.createObjectURL(file);
      window._contractVideos[key] = { name: file.name, url: url, size: file.size };
      _showVideoPlayer(url, file.name, file.size);
      if(typeof showToast === 'function') showToast('⚠️ Server absent — video in memory only');
    });

  input.value = '';
}


// ── removeContractVideo (orig. line 11228) ──
function removeContractVideo(){
  if(!_currentVideoContract) return;
  var key = _currentVideoContract;

  fetch(SERVER + '/remove-video', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type':'application/json' }),
    body: JSON.stringify({ contractKey: key })
  }).catch(() => {});

  var old = window._contractVideos[key];
  if(old && old.url && old.url.startsWith('blob:')) URL.revokeObjectURL(old.url);
  delete window._contractVideos[key];
  _showVideoDropZone();
  if(typeof showToast === 'function') showToast('🗑️ Video deleted');
}
