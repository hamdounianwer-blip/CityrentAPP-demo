// ── module-users.js (2026-09) — Gestion des utilisateurs : permet au
// directeur de créer des sessions BARKA/MOEBELA depuis l'interface, sans
// éditer server.js. Un compte créé ici a toujours role='staff' et UNE
// seule branche — même logique que barka_user/moebela_user (voir USERS
// dans server.js). Ne touche à rien côté véhicules/flotte : un compte de
// branche continue de voir les ~100 véhicules au complet, seule sa vue
// contrats/paiements/mouvements est filtrée par branche, exactement comme
// aujourd'hui.
//
// Sécurité : les routes /api/users sont protégées côté serveur par
// isAdminSession() (voir server.js). Le masquage du menu (applyAdminOnlyNav,
// js/core.js) n'est qu'une défense en profondeur côté UI, pas la barrière
// réelle.

function renderUsers(){
  let tbody = document.getElementById('usr-body');
  if(!tbody) return;
  populateUserBranchSelect();
  fetch('/api/users', { headers: authHeaders() })
    .then(r => {
      if(r.status === 401){ handleAuthExpired(); throw new Error('401'); }
      return r.json();
    })
    .then(r => {
      if(!r.users){
        tbody.innerHTML = '<tr><td colspan="5" class="empty">' + escapeHtml(r.error || 'Erreur') + '</td></tr>';
        return;
      }
      let count = document.getElementById('usr-count');
      if(count) count.textContent = r.users.length + ' compte(s)';
      tbody.innerHTML = r.users.map(function(u){
        let branchLabel = u.branches === 'ALL' ? 'Toutes' : (Array.isArray(u.branches) ? u.branches.join(', ') : '—');
        let delBtn = u.system
          ? '<span style="color:var(--muted);font-size:.75rem">🔒 Système</span>'
          : '<button class="btn btn-ghost" style="padding:4px 10px" data-app-action="reset-user-password" data-username="' + escapeHtml(u.username) + '">🔑 Mot de passe</button>'
            + ' <button class="btn btn-ghost btn-delete" style="padding:4px 10px" data-app-action="delete-user" data-username="' + escapeHtml(u.username) + '">🗑️ Supprimer</button>';
        return '<tr>'
          + '<td>' + escapeHtml(u.username) + '</td>'
          + '<td>' + branchBadgeHtml(branchLabel) + '</td>'
          + '<td>' + escapeHtml(u.role || 'staff') + '</td>'
          + '<td>' + (u.system ? 'Compte système' : 'Créé le ' + fmtDate(u.createdAt)) + '</td>'
          + '<td>' + delBtn + '</td>'
          + '</tr>';
      }).join('') || '<tr><td colspan="5" class="empty">Aucun compte</td></tr>';
    })
    .catch(function(){
      tbody.innerHTML = '<tr><td colspan="5" class="empty">⚠️ Connexion serveur impossible</td></tr>';
    });
}

// ── populateUserBranchSelect — liste des branches existantes pour le menu
// déroulant de création. Même source que populateBranchSelect() (Fleet) :
// DB.branches, tenu à jour par chargerSavee(). ──
function populateUserBranchSelect(){
  let sel = document.getElementById('usr-new-branch');
  if(!sel) return;
  let list = (window.DB && DB.branches && DB.branches.length) ? DB.branches.slice() : ['BARKA', 'MOEBELA'];
  sel.innerHTML = '<option value="">—</option>' + list.map(function(b){ return '<option value="' + escapeHtml(b) + '">' + escapeHtml(b) + '</option>'; }).join('');
}

function saveNewUser(){
  let username = (document.getElementById('usr-new-username').value || '').trim();
  let password = document.getElementById('usr-new-password').value || '';
  let branch   = document.getElementById('usr-new-branch').value || '';
  let errEl = document.getElementById('usr-form-error');
  if(errEl) errEl.textContent = '';
  if(!username || !password || !branch){
    if(errEl) errEl.textContent = 'Remplis les 3 champs.';
    return;
  }
  // Même porte de sécurité que le changement de mot de passe / la
  // suppression : mot de passe app requis avant toute création de compte.
  securePrompt('🔒 Mot de passe requis — créer "' + username + '"').then(function(pwd){
    if(pwd === null) return;
    checkPassword(pwd, 'Gestion utilisateurs — créer (' + username + ')').then(function(ok){
      if(!ok){ toast('❌ Mot de passe incorrect'); return; }
      fetch('/api/users', {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
        body: JSON.stringify({ username: username, password: password, branch: branch })
      })
      .then(r => r.json())
      .then(r => {
        if(r.ok){
          document.getElementById('usr-new-username').value = '';
          document.getElementById('usr-new-password').value = '';
          document.getElementById('usr-new-branch').value = '';
          toast('✅ Compte "' + username + '" créé');
          renderUsers();
        } else {
          if(errEl) errEl.textContent = r.error || 'Erreur';
        }
      })
      .catch(function(){
        if(errEl) errEl.textContent = '⚠️ Connexion serveur impossible';
      });
    });
  });
}

// ── promptChangeUserPassword — changer le mot de passe d'un compte créé.
// Même porte de sécurité que clearLogsWithPassword() (module-activity-log.js) :
// mot de passe app (securePrompt + checkPassword, /check-password côté
// serveur) requis AVANT de pouvoir saisir le nouveau mot de passe — même si
// on est déjà connecté en tant que directeur. ──
function promptChangeUserPassword(username){
  if(!username) return;
  securePrompt('🔒 Mot de passe requis — modifier "' + username + '"').then(function(pwd){
    if(pwd === null) return;
    checkPassword(pwd, 'Gestion utilisateurs — changer mot de passe (' + username + ')').then(function(ok){
      if(!ok){ toast('❌ Mot de passe incorrect'); return; }
      let newPw = prompt('Nouveau mot de passe pour "' + username + '" (6 caractères min.) :');
      if(!newPw) return;
      if(newPw.length < 6){ toast('Mot de passe trop court (6 caractères min.)'); return; }
      fetch('/api/users/' + encodeURIComponent(username), {
        method: 'PATCH',
        headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
        body: JSON.stringify({ password: newPw })
      })
      .then(r => r.json())
      .then(r => {
        if(r.ok){ toast('✅ Mot de passe de "' + username + '" mis à jour'); renderUsers(); }
        else toast('❌ ' + (r.error || 'Erreur'));
      })
      .catch(function(){ toast('⚠️ Connexion serveur impossible'); });
    });
  });
}

function deleteUserAccount(username){
  if(!username) return;
  securePrompt('🔒 Mot de passe requis — supprimer "' + username + '"').then(function(pwd){
    if(pwd === null) return;
    checkPassword(pwd, 'Gestion utilisateurs — supprimer (' + username + ')').then(function(ok){
      if(!ok){ toast('❌ Mot de passe incorrect'); return; }
      if(!confirm('Supprimer le compte "' + username + '" ? Sa session en cours sera immédiatement déconnectée.')) return;
      fetch('/api/users/' + encodeURIComponent(username), { method: 'DELETE', headers: authHeaders() })
        .then(r => r.json())
        .then(r => {
          if(r.ok){ toast('🗑️ Compte supprimé'); renderUsers(); }
          else toast('❌ ' + (r.error || 'Erreur'));
        })
        .catch(function(){ toast('⚠️ Connexion serveur impossible'); });
    });
  });
}

window.renderUsers = renderUsers;
window.saveNewUser = saveNewUser;
window.deleteUserAccount = deleteUserAccount;
window.promptChangeUserPassword = promptChangeUserPassword;
