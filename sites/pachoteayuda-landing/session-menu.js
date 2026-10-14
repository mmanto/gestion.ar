/* Menú de sesión de la landing pachoteayuda — el nombre del usuario y "Salir"
 * a la derecha del menú superior (.site-header). Vanilla JS a propósito: la
 * landing es estática (sites/pachoteayuda-landing/), así que este script se
 * inyecta desde las páginas sin tocar la app.
 *
 * La landing y el SPA del tenant comparten origen (pachoteayuda.ar), así que
 * acá se lee la misma sesión que guarda el SPA en localStorage
 * (frontend-tenant/src/services/tokenStorage.ts: 'token' y 'user') y se valida
 * contra GET /api/auth/me — el mismo endpoint que usa AuthContext.checkAuth.
 * Sin token no se dibuja nada: un vecino sin cuenta no ve el menú.
 *
 * "Salir" hace lo mismo que el logout del SPA (authService.clearAuth): borra
 * token y usuario del navegador. El backend no tiene endpoint de logout (el JWT
 * no se revoca), así que después recarga la página, que es lo que hace
 * desaparecer el menú.
 *
 * Estilos incluidos (injectStyles): no van en landing/seo.css porque el service
 * worker del SPA los cachearía para siempre (ver el comentario de la función).
 */
(function () {
  'use strict';

  var TOKEN_KEY = 'token';
  var USER_KEY = 'user';
  var ME_PATH = '/api/auth/me';

  // Páginas sin menú superior (la home tiene sólo el logo): nada que hacer.
  var header = document.querySelector('.site-header');
  if (!header) return;

  var storage;
  try {
    storage = window.localStorage;
  } catch (e) {
    return; // localStorage bloqueado (modo privado): no hay sesión que leer
  }
  var token = storage.getItem(TOKEN_KEY);
  if (!token) return;

  var mount = null; // contenedor del menú, dentro del header
  var trigger, panel, avatar, nameEl, accountName, accountId;

  // Los estilos van inyectados desde acá —igual que chat-widget.js— y no en
  // landing/seo.css: el service worker del SPA del tenant
  // (frontend-tenant/public/sw.js, scope '/') cachea para siempre los assets de
  // nombre fijo de este origen (seo.css incluido), así que un cambio ahí no
  // llegaría a los navegadores que ya entraron al panel hasta que cambie
  // CACHE_NAME. Este archivo es nuevo, así que se pide una sola vez y fresco.
  function injectStyles() {
    var STYLE_ID = 'ipa-session-menu-styles';
    if (document.getElementById(STYLE_ID)) return;
    var css = document.createElement('style');
    css.id = STYLE_ID;
    css.textContent = [
      // El nav se corre a la derecha para que el menú (el último hijo del
      // header) quede contra el borde. Sin sesión la regla no existe y el nav
      // ya era el último elemento, así que el header se ve igual que antes.
      '.site-header nav{margin-left:auto;}',
      '.site-user{position:relative;display:flex;align-items:center;}',
      '.site-user-trigger{display:flex;align-items:center;gap:8px;max-width:240px;font-family:inherit;font-size:14.5px;font-weight:600;color:rgba(255,255,255,.82);background:none;border:0;border-radius:10px;padding:5px 10px 5px 6px;cursor:pointer;}',
      '.site-user-trigger:hover,.site-user[data-open="true"] .site-user-trigger{background:rgba(255,255,255,.1);color:#fff;}',
      '.site-user-avatar{width:26px;height:26px;flex:0 0 auto;display:flex;align-items:center;justify-content:center;border-radius:50%;background:#441e7d;color:#fff;font-size:12.5px;font-weight:800;}',
      '.site-user-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.site-user-chevron{width:12px;height:12px;flex:0 0 auto;transition:transform .15s ease;}',
      '.site-user[data-open="true"] .site-user-chevron{transform:rotate(180deg);}',
      '.site-user-menu{position:absolute;right:0;top:calc(100% + 10px);min-width:220px;background:#fff;border:1px solid #e4dff5;border-radius:14px;box-shadow:0 16px 34px rgba(19,10,33,.22);padding:6px;z-index:60;}',
      '.site-user-menu[hidden]{display:none;}',
      '.site-user-account{display:flex;flex-direction:column;gap:2px;padding:10px 12px 9px;border-bottom:1px solid #e4dff5;margin-bottom:4px;}',
      '.site-user-account-name{font-size:14.5px;font-weight:700;color:#1f1034;overflow:hidden;text-overflow:ellipsis;}',
      '.site-user-account-id{font-family:"JetBrains Mono",Consolas,monospace;font-size:12px;color:#655e78;overflow:hidden;text-overflow:ellipsis;}',
      '.site-user-logout{display:flex;align-items:center;gap:10px;width:100%;font-family:inherit;font-size:14.5px;font-weight:600;color:#1b1330;background:none;border:0;border-radius:10px;padding:10px 12px;text-align:left;cursor:pointer;}',
      '.site-user-logout:hover{background:#f5f3fb;}',
      '.site-user-logout svg{width:15px;height:15px;flex:0 0 auto;color:#441e7d;}',
      // En pantallas chicas el menú se acomoda al lado del logo y el nav se
      // queda con su fila completa (antes ya no entraba en la primera).
      '@media (max-width:620px){.site-header nav{order:2;flex-basis:100%;margin-left:0;}.site-user{order:1;}.site-user-trigger{max-width:150px;}}'
    ].join('\n');
    document.head.appendChild(css);
  }

  function userFromStorage() {
    var raw = storage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      var user = JSON.parse(raw);
      return user && typeof user === 'object' ? user : null;
    } catch (e) {
      return null; // usuario ilegible: lo repone /api/auth/me
    }
  }

  function fullName(user) {
    var nombre = ((user.nombre || '') + ' ' + (user.apellido || '')).trim();
    return nombre || user.username || '';
  }

  function clearSession() {
    try {
      storage.removeItem(TOKEN_KEY);
      storage.removeItem(USER_KEY);
    } catch (e) {
      // localStorage no disponible: igual se recarga la página abajo
    }
  }

  function close() {
    if (!mount) return; // el menú ya se sacó (token vencido)
    panel.hidden = true;
    mount.setAttribute('data-open', 'false');
    trigger.setAttribute('aria-expanded', 'false');
  }

  function build() {
    injectStyles(); // antes de montar: el menú no se pinta sin estilos
    mount = document.createElement('div');
    mount.className = 'site-user';
    mount.setAttribute('data-open', 'false');
    // Todo estático: el nombre entra después por textContent (nunca por
    // innerHTML) para no depender del contenido que cargue administración.
    mount.innerHTML =
      '<button type="button" class="site-user-trigger" aria-haspopup="true" aria-expanded="false">' +
        '<span class="site-user-avatar" aria-hidden="true"></span>' +
        '<span class="site-user-name"></span>' +
        '<svg class="site-user-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>' +
      '</button>' +
      '<div class="site-user-menu" hidden>' +
        '<p class="site-user-account">' +
          '<span class="site-user-account-name"></span>' +
          '<span class="site-user-account-id"></span>' +
        '</p>' +
        '<button type="button" class="site-user-logout">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>' +
          '<span>Salir</span>' +
        '</button>' +
      '</div>';

    trigger = mount.querySelector('.site-user-trigger');
    panel = mount.querySelector('.site-user-menu');
    avatar = mount.querySelector('.site-user-avatar');
    nameEl = mount.querySelector('.site-user-name');
    accountName = mount.querySelector('.site-user-account-name');
    accountId = mount.querySelector('.site-user-account-id');

    trigger.addEventListener('click', function () {
      panel.hidden ? paintOpen() : close();
    });
    mount.querySelector('.site-user-logout').addEventListener('click', function () {
      clearSession();
      window.location.reload();
    });
    document.addEventListener('click', function (event) {
      if (mount && !mount.contains(event.target)) close();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') close();
    });

    header.appendChild(mount);
  }

  function paintOpen() {
    panel.hidden = false;
    mount.setAttribute('data-open', 'true');
    trigger.setAttribute('aria-expanded', 'true');
  }

  function paint(user) {
    if (!mount) build();
    var nombre = fullName(user);
    nameEl.textContent = nombre;
    avatar.textContent = (user.nombre || user.username || '?').charAt(0).toUpperCase();
    accountName.textContent = nombre;
    accountId.textContent = user.email || user.username || '';
  }

  function remove() {
    if (mount && mount.parentNode) mount.parentNode.removeChild(mount);
    mount = null;
  }

  function verify() {
    if (!window.fetch) return; // sin fetch queda la sesión cacheada
    fetch(ME_PATH, {
      headers: { Authorization: 'Bearer ' + token },
      credentials: 'same-origin'
    }).then(function (res) {
      if (res.status === 401 || res.status === 403) {
        // Token vencido o revocado: se limpia la sesión como hace el SPA y el
        // menú se saca del header.
        clearSession();
        remove();
        return;
      }
      if (!res.ok) return; // 5xx: se deja lo que haya en localStorage
      return res.json().then(function (user) {
        // Refresca el usuario cacheado: el SPA también lo lee al arrancar
        // (AuthContext.checkAuth) y así el nombre queda al día.
        try {
          storage.setItem(USER_KEY, JSON.stringify(user));
        } catch (e) {
          // sin cuota: el menú igual queda pintado
        }
        paint(user);
      });
    }).catch(function () {
      // Sin red: se deja el menú con la sesión cacheada.
    });
  }

  var cached = userFromStorage();
  if (cached) paint(cached); // pintado inmediato, sin esperar el round-trip
  verify();
})();
