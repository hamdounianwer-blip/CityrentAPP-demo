/**
 * ============================================================================
 *  CityRent — Assistant IA interne (aide au staff) — v2
 * ============================================================================
 *
 *  Icône robot flottante et DÉPLAÇABLE (glisser-déposer n'importe où sur
 *  l'écran, position mémorisée). Un clic (sans glisser) ouvre la bulle de
 *  conversation, avec un bouton "réduire" (garde l'historique) et un bouton
 *  "fermer" (réinitialise la conversation).
 *
 *  INSTALLATION : identique à la v1 — voir server-assistant-route.js pour
 *  le endpoint /api/assistant-chat.
 * ============================================================================
 */
(function () {
  const MAX_HISTORY = 12;
  const POS_KEY = 'cr-assistant-pos';
  let history = [];
  let panelOpen = false;
  let isSending = false;

  // ── Auth : le widget ne s'affiche que si un utilisateur est connecté ──
  // (même stockage que le reste de l'app : localStorage 'fleetpro_auth')
  function getAuthToken() {
    try {
      const raw = localStorage.getItem('fleetpro_auth');
      const saved = raw ? JSON.parse(raw) : null;
      return saved && saved.token ? saved.token : null;
    } catch (e) {
      return null;
    }
  }
  if (!getAuthToken() && window.location.protocol !== 'file:') {
    return; // pas connecté → on n'injecte même pas le bouton
  }

  // ── Styles ────────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    #cr-assistant-btn {
      position: fixed;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: linear-gradient(135deg, #0b3d91, #00b4d8);
      border: none;
      cursor: grab;
      box-shadow: 0 4px 14px rgba(0,0,0,0.25);
      z-index: 9998;
      display: flex;
      align-items: center;
      justify-content: center;
      touch-action: none;
      user-select: none;
    }
    #cr-assistant-btn:active { cursor: grabbing; }
    #cr-assistant-btn svg { width: 30px; height: 30px; pointer-events: none; }

    #cr-assistant-panel {
      position: fixed;
      width: 340px;
      max-width: calc(100vw - 32px);
      height: 460px;
      max-height: calc(100vh - 140px);
      background: var(--bg, #fff);
      color: var(--text, #222);
      border: 1px solid var(--border, #ddd);
      border-radius: 14px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.3);
      display: none;
      flex-direction: column;
      overflow: hidden;
      z-index: 9999;
      font-family: inherit;
    }
    #cr-assistant-panel.open { display: flex; }

    #cr-assistant-header {
      background: linear-gradient(135deg, #0b3d91, #00b4d8);
      color: #fff;
      padding: 10px 12px;
      font-weight: 600;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 14px;
      gap: 8px;
    }
    #cr-assistant-header .cr-title { display: flex; align-items: center; gap: 6px; }
    #cr-assistant-header .cr-actions { display: flex; gap: 4px; }
    #cr-assistant-header button {
      background: rgba(255,255,255,0.15);
      border: none;
      color: #fff;
      cursor: pointer;
      font-size: 14px;
      width: 24px;
      height: 24px;
      border-radius: 6px;
      line-height: 1;
    }
    #cr-assistant-header button:hover { background: rgba(255,255,255,0.3); }

    #cr-assistant-messages {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      background: var(--s1, #f7f7f8);
    }
    .cr-msg {
      max-width: 85%;
      padding: 8px 12px;
      border-radius: 10px;
      font-size: 13px;
      line-height: 1.4;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    .cr-msg.user {
      align-self: flex-end;
      background: #0b3d91;
      color: #fff;
      border-bottom-right-radius: 2px;
    }
    .cr-msg.assistant {
      align-self: flex-start;
      background: var(--s2, #fff);
      color: var(--text, #222);
      border: 1px solid var(--border, #ddd);
      border-bottom-left-radius: 2px;
    }
    .cr-msg.error {
      align-self: flex-start;
      background: #fdecea;
      color: #b3261e;
      border: 1px solid #f5c2c0;
    }
    .cr-msg.typing { font-style: italic; color: var(--muted, #888); }

    #cr-assistant-inputbar {
      display: flex;
      border-top: 1px solid var(--border, #ddd);
      background: var(--bg, #fff);
    }
    #cr-assistant-input {
      flex: 1;
      border: none;
      padding: 10px 12px;
      font-size: 13px;
      background: transparent;
      color: var(--text, #222);
      outline: none;
    }
    #cr-assistant-send {
      border: none;
      background: none;
      color: #0b3d91;
      font-weight: 600;
      padding: 0 14px;
      cursor: pointer;
      font-size: 13px;
    }
    #cr-assistant-send:disabled { color: var(--muted, #aaa); cursor: default; }
  `;
  document.head.appendChild(style);

  // ── Icône robot (SVG, pas d'emoji) ──────────────────────────────────────
  const ROBOT_SVG = `
    <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <rect x="14" y="24" width="36" height="28" rx="8" fill="#ffffff"/>
      <rect x="14" y="24" width="36" height="28" rx="8" fill="none" stroke="#0b3d91" stroke-width="2"/>
      <circle cx="25" cy="38" r="4" fill="#0b3d91"/>
      <circle cx="39" cy="38" r="4" fill="#0b3d91"/>
      <rect x="24" y="46" width="16" height="3" rx="1.5" fill="#0b3d91"/>
      <rect x="30" y="12" width="4" height="10" rx="2" fill="#ffffff"/>
      <circle cx="32" cy="10" r="4" fill="#00b4d8"/>
      <rect x="6" y="32" width="6" height="12" rx="3" fill="#ffffff"/>
      <rect x="52" y="32" width="6" height="12" rx="3" fill="#ffffff"/>
    </svg>`;

  // ── Structure HTML ───────────────────────────────────────────────────────
  const btn = document.createElement('button');
  btn.id = 'cr-assistant-btn';
  btn.title = 'Assistant CityRent';
  btn.innerHTML = ROBOT_SVG;

  const panel = document.createElement('div');
  panel.id = 'cr-assistant-panel';
  panel.innerHTML = `
    <div id="cr-assistant-header">
      <div class="cr-title">${ROBOT_SVG.replace('viewBox="0 0 64 64"', 'viewBox="0 0 64 64" width="20" height="20"')}<span>Assistant CityRent</span></div>
      <div class="cr-actions">
        <button id="cr-assistant-minimize" title="Réduire">–</button>
        <button id="cr-assistant-close" title="Fermer">✕</button>
      </div>
    </div>
    <div id="cr-assistant-messages"></div>
    <div id="cr-assistant-inputbar">
      <input id="cr-assistant-input" type="text" placeholder="Pose ta question sur CityRent..." />
      <button id="cr-assistant-send">Envoyer</button>
    </div>
  `;

  document.body.appendChild(btn);
  document.body.appendChild(panel);

  const messagesEl = panel.querySelector('#cr-assistant-messages');
  const inputEl = panel.querySelector('#cr-assistant-input');
  const sendBtn = panel.querySelector('#cr-assistant-send');
  const minimizeBtn = panel.querySelector('#cr-assistant-minimize');
  const closeBtn = panel.querySelector('#cr-assistant-close');

  function greet() {
    messagesEl.innerHTML = '';
    addMessage('assistant', 'Salut ! Je peux t\'aider à utiliser CityRent (ex: "comment je crée une nouvelle location ?"). Je ne peux pas voir tes données ni parler du fonctionnement technique du programme.');
  }
  greet();

  // ── Positionnement (déplaçable, position mémorisée) ─────────────────────
  function applyPosition(x, y) {
    const w = window.innerWidth, h = window.innerHeight;
    x = Math.max(8, Math.min(x, w - 64));
    y = Math.max(8, Math.min(y, h - 64));
    btn.style.left = x + 'px';
    btn.style.top = y + 'px';
    btn.style.right = 'auto';
    btn.style.bottom = 'auto';
    positionPanelNear(x, y);
  }

  function positionPanelNear(x, y) {
    const w = window.innerWidth, h = window.innerHeight;
    const panelW = 340, panelH = 460;
    let px = x + 64 <= w - panelW ? x + 64 : Math.max(8, x - panelW - 8);
    let py = y + panelH <= h - 8 ? y : Math.max(8, h - panelH - 8);
    panel.style.left = px + 'px';
    panel.style.top = py + 'px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  }

  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(POS_KEY)); } catch (e) {}
  if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
    applyPosition(saved.x, saved.y);
  } else {
    applyPosition(window.innerWidth - 80, window.innerHeight - 96);
  }

  // ── Glisser-déposer (souris + tactile) ──────────────────────────────────
  let dragging = false;
  let dragMoved = false;
  let offsetX = 0, offsetY = 0;

  function startDrag(clientX, clientY) {
    dragging = true;
    dragMoved = false;
    const rect = btn.getBoundingClientRect();
    offsetX = clientX - rect.left;
    offsetY = clientY - rect.top;
  }
  function moveDrag(clientX, clientY) {
    if (!dragging) return;
    dragMoved = true;
    applyPosition(clientX - offsetX, clientY - offsetY);
  }
  function endDrag() {
    if (!dragging) return;
    dragging = false;
    if (dragMoved) {
      const rect = btn.getBoundingClientRect();
      try { localStorage.setItem(POS_KEY, JSON.stringify({ x: rect.left, y: rect.top })); } catch (e) {}
    } else {
      togglePanel();
    }
  }

  btn.addEventListener('mousedown', (e) => { e.preventDefault(); startDrag(e.clientX, e.clientY); });
  window.addEventListener('mousemove', (e) => moveDrag(e.clientX, e.clientY));
  window.addEventListener('mouseup', endDrag);

  btn.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    startDrag(t.clientX, t.clientY);
  }, { passive: true });
  window.addEventListener('touchmove', (e) => {
    if (!dragging) return;
    const t = e.touches[0];
    moveDrag(t.clientX, t.clientY);
  }, { passive: true });
  window.addEventListener('touchend', endDrag);

  window.addEventListener('resize', () => {
    const rect = btn.getBoundingClientRect();
    applyPosition(rect.left, rect.top);
  });

  // ── Ouvrir / réduire / fermer ────────────────────────────────────────────
  function togglePanel() {
    panelOpen = !panelOpen;
    panel.classList.toggle('open', panelOpen);
    if (panelOpen) inputEl.focus();
  }
  minimizeBtn.addEventListener('click', () => {
    // Réduire : cache juste la fenêtre, garde l'historique de conversation
    panelOpen = false;
    panel.classList.remove('open');
  });
  closeBtn.addEventListener('click', () => {
    // Fermer : cache la fenêtre ET réinitialise la conversation
    panelOpen = false;
    panel.classList.remove('open');
    history = [];
    greet();
  });

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !isSending) sendMessage();
  });
  sendBtn.addEventListener('click', () => {
    if (!isSending) sendMessage();
  });

  function addMessage(role, text) {
    const div = document.createElement('div');
    div.className = `cr-msg ${role}`;
    div.textContent = text;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return div;
  }

  async function sendMessage() {
    const text = inputEl.value.trim();
    if (!text) return;

    inputEl.value = '';
    addMessage('user', text);
    history.push({ role: 'user', content: text });
    if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY);

    isSending = true;
    sendBtn.disabled = true;
    const typingEl = addMessage('assistant typing', 'Réflexion en cours...');

    try {
      const res = await fetch('/api/assistant-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': getAuthToken() || '',
        },
        body: JSON.stringify({ messages: history }),
      });

      if (res.status === 401) throw new Error('Session expirée — reconnecte-toi.');
      if (!res.ok) throw new Error(`Erreur serveur (${res.status})`);

      const data = await res.json();
      typingEl.remove();

      const reply = data.reply || 'Désolé, je n\'ai pas pu générer de réponse.';
      addMessage('assistant', reply);
      history.push({ role: 'assistant', content: reply });
      if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY);
    } catch (err) {
      typingEl.remove();
      addMessage('error', `Erreur : ${err.message}. Réessaie dans un instant.`);
    } finally {
      isSending = false;
      sendBtn.disabled = false;
      inputEl.focus();
    }
  }
})();
