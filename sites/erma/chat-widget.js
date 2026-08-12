/* Chat embed para la landing ERMA — botón flotante + panel con el chat del
 * tenant en un iframe. Vanilla JS a propósito: la landing es un build
 * compilado sin fuente (sites/erma/), así que este script se inyecta desde
 * index.html sin tocar el bundle.
 *
 * El iframe apunta al mismo origen (location.origin) para que funcione igual
 * en prod (https://erma.com.ar) y en local (*.test) — el X-Frame-Options del
 * nginx del tenant es SAMEORIGIN, así que el chat solo puede embeberse desde
 * el propio dominio. Un botón flotante abre el panel; la X lo cierra.
 */
(function () {
  'use strict';

  var CHAT_PATH = '/chat/c/channel_3728c7f54d80';
  var DEFAULT_ORIGIN = 'https://erma.com.ar';

  // Override para entornos distintos (ej. dev local contra el VPS):
  //   <script>window.__ERMA_CHAT__ = { url: 'https://erma.com.ar/chat/c/...' }</script>
  var CONFIG = window.__ERMA_CHAT__ || {};
  var chatUrl = CONFIG.url || location.origin + CHAT_PATH;

  // Color de marca de la landing (style-DsA80jQ7.css)
  var PRIMARY = '#4a6741';

  var STYLE_ID = 'erma-chat-widget-styles';
  if (!document.getElementById(STYLE_ID)) {
    var css = document.createElement('style');
    css.id = STYLE_ID;
    css.textContent = [
      '#erma-chat-fab{position:fixed;bottom:24px;right:24px;z-index:9990;width:60px;height:60px;border-radius:9999px;background:' + PRIMARY + ';color:#fff;border:none;box-shadow:0 8px 24px rgba(0,0,0,.28);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:transform .15s ease;}',
      '#erma-chat-fab:hover{transform:scale(1.06);}',
      '#erma-chat-fab svg{width:28px;height:28px;fill:currentColor;}',
      // El panel ya no lleva cabecera propia: la barra del chat la marca el
      // propio ChatHeader del SPA (color + logo del tenant). La X de cierre
      // va como overlay en la esquina superior derecha.
      '#erma-chat-panel{position:fixed;bottom:24px;right:24px;z-index:9991;width:380px;max-width:calc(100vw - 32px);height:min(620px,calc(100vh - 96px));background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 16px 48px rgba(0,0,0,.3);display:none;font-family:Inter,system-ui,-apple-system,sans-serif;}',
      '#erma-chat-panel.open{display:block;}',
      '#erma-chat-close{position:absolute;top:10px;right:10px;z-index:9;width:30px;height:30px;border-radius:9999px;background:rgba(0,0,0,.28);border:none;color:#fff;cursor:pointer;font-size:17px;line-height:1;display:flex;align-items:center;justify-content:center;opacity:.92;}',
      '#erma-chat-close:hover{opacity:1;background:rgba(0,0,0,.42);}',
      '#erma-chat-frame{border:none;width:100%;height:100%;background:#fff;}',
      '@media (max-width:480px){#erma-chat-panel{bottom:0;right:0;width:100%;max-width:100%;height:100%;max-height:none;border-radius:0;}#erma-chat-fab{bottom:16px;right:16px;}}'
    ].join('\n');
    document.head.appendChild(css);
  }

  function iconSvg() {
    var d = document.createElement('div');
    d.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3C6.48 3 2 6.94 2 11.79c0 2.44 1.16 4.67 3.05 6.22-.09.83-.5 2.06-1.22 3.16-.2.3-.03.72.33.82.65.17 1.9-.14 3.16-.82.36.08.74.14 1.14.18.96 1.3 2.4 2.09 4 2.15V22c-.39 0-.67-.32-.67-.67v-.58c2.98-.15 5.67-1.96 6.78-4.78.36-.93.55-1.93.55-2.97C25.33 6.94 20.86 3 12 3zm-4 9.16a1.16 1.16 0 1 1 0-2.32 1.16 1.16 0 0 1 0 2.32zm4 0a1.16 1.16 0 1 1 0-2.32 1.16 1.16 0 0 1 0 2.32zm4 0a1.16 1.16 0 1 1 0-2.32 1.16 1.16 0 0 1 0 2.32z"/></svg>';
    return d.firstChild;
  }

  var fab = document.createElement('button');
  fab.id = 'erma-chat-fab';
  fab.type = 'button';
  fab.setAttribute('aria-label', 'Abrir chat');
  fab.appendChild(iconSvg());
  document.body.appendChild(fab);

  var panel = document.createElement('div');
  panel.id = 'erma-chat-panel';
  // Sin cabecera: la barra del chat la marca el propio ChatHeader del SPA
  // (color + logo del tenant, ver frontend-tenant ChatHeader.tsx). La X
  // cierra el panel como overlay sobre esa barra.
  panel.innerHTML =
    '<iframe id="erma-chat-frame" src="' + chatUrl + '" title="Chat ERMA" loading="lazy" allow="microphone"></iframe>' +
    '<button id="erma-chat-close" type="button" aria-label="Cerrar chat">&times;</button>';
  document.body.appendChild(panel);

  var frame = panel.querySelector('#erma-chat-frame');
  var closeBtn = panel.querySelector('#erma-chat-close');

  fab.addEventListener('click', function () {
    panel.classList.add('open');
    fab.style.display = 'none';
    // Recargar el chat al abrir (el iframe vive siempre montado, así se
    // re-inicia la conversación y no queda una sesión vieja colgada).
    frame.src = chatUrl;
  });

  closeBtn.addEventListener('click', function () {
    // Quitar el src al cerrar: corta WS y push del chat en background.
    frame.src = 'about:blank';
    panel.classList.remove('open');
    fab.style.display = '';
  });
})();