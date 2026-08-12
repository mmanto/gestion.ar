/* Neutraliza el smooth-scroll de Lenis en la landing ERMA.
 *
 * El bundle de la landing (assets/bundle.js, build compilado sin fuente)
 * inicializa Lenis con un easing largo que amortigua el wheel: un giro de la
 * rueda casi no desplaza la página y el scroll se siente "pegado"/feo (además
 * el HTML queda con class="lenis lenis-smooth" sin su wrapper esperado).
 * Como la instancia de Lenis no queda expuesta en window (no se puede llamar
 * .stop()/destroy()), lo desactivamos desde afuera con dos pasos:
 *
 *   1. Quitar las clases `lenis lenis-smooth` del <html> (el CSS de Lenis que
 *      ajusta overflow/height deja de aplicar).
 *   2. Bloquear en fase de captura el listener de `wheel` de Lenis, SIN
 *      preventDefault: el navegador hace el scroll nativo, fluido y exacto.
 *
 * Vanilla a propósito — igual que chat-widget.js, se inyecta desde index.html
 * sin tocar el bundle. Espera a DOMContentLoaded para no pisar la inicialización
 * de Lenis (que corre con defer antes que este script).
 */
(function () {
  'use strict';

  function init() {
    var html = document.documentElement;

    // 1) Quitar la clase de smooth-scroll (Lenis la aplica en <html>).
    html.classList.remove('lenis', 'lenis-smooth', 'lenis-scrolling', 'lenis-stopped', 'lenis-locked');

    // 2) Bloquear el wheel que Lenis captura. En captura sobre window se
    //    ejecuta ANTES que el listener de Lenis (montado en document), y al no
    //    llamar preventDefault el browser hace scroll nativo. stopImmediatePropagation
    //    evita que cualquier listener posterior (incluido el de Lenis) lo manipule.
    window.addEventListener(
      'wheel',
      function (e) {
        e.stopImmediatePropagation();
      },
      { capture: true, passive: true }
    );

    // Lenis puede volver a aplicar la clase en resize/reinit; mantenerla fuera.
    // Barato y repetitivo, evita depender del momento exacto del init de Lenis.
    var observer = new MutationObserver(function () {
      if (html.classList.contains('lenis-smooth')) {
        html.classList.remove('lenis-smooth', 'lenis');
      }
    });
    observer.observe(html, { attributes: true, attributeFilter: ['class'] });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();