/* ============================================================
   CentraLu Xbox – Controle de Acesso (Login)
   Credenciais armazenadas apenas como hash SHA-256 (com salt).
   Sessão persiste por dispositivo via localStorage; em outro
   dispositivo/navegador a senha é exigida novamente.
   ============================================================ */
(function () {
  'use strict';

  var SALT = 'cxb2026';
  // SHA-256 de: SALT|email|senha
  var AUTH_HASH = '0268df741c5dfbf5fa161d4282b6ca78224c877aa72a2380c27e1cea7e4d3ba0';
  var STORAGE_KEY = 'cxb_auth_token';

  function sha256Hex(text) {
    var data = new TextEncoder().encode(text);
    return crypto.subtle.digest('SHA-256', data).then(function (buf) {
      return Array.prototype.map
        .call(new Uint8Array(buf), function (b) {
          return b.toString(16).padStart(2, '0');
        })
        .join('');
    });
  }

  function unlock() {
    document.body.classList.remove('cxb-locked');
    var overlay = document.getElementById('loginOverlay');
    if (overlay) overlay.remove();
  }

  function lock() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    location.reload();
  }

  function showError(msg) {
    var el = document.getElementById('loginError');
    if (el) {
      el.textContent = msg;
      el.classList.add('visible');
    }
  }

  function init() {
    // Sessão já autenticada neste dispositivo?
    var saved = null;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    if (saved === AUTH_HASH) {
      unlock();
      bindLogout();
      return;
    }

    var form = document.getElementById('loginForm');
    if (!form) return;

    if (!window.crypto || !crypto.subtle) {
      showError('Navegador sem suporte a criptografia. Use HTTPS ou localhost.');
      return;
    }

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var email = (document.getElementById('loginEmail').value || '').trim().toLowerCase();
      var pass = document.getElementById('loginPassword').value || '';
      var btn = document.getElementById('loginBtn');
      btn.disabled = true;

      sha256Hex(SALT + '|' + email + '|' + pass).then(function (hash) {
        if (hash === AUTH_HASH) {
          try { localStorage.setItem(STORAGE_KEY, hash); } catch (e) {}
          unlock();
          bindLogout();
        } else {
          btn.disabled = false;
          showError('E-mail ou senha incorretos.');
          document.getElementById('loginPassword').value = '';
          document.getElementById('loginPassword').focus();
        }
      }).catch(function () {
        btn.disabled = false;
        showError('Erro ao verificar credenciais. Tente novamente.');
      });
    });
  }

  function bindLogout() {
    var btn = document.getElementById('logoutBtn');
    if (btn) {
      btn.hidden = false;
      btn.addEventListener('click', lock);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
