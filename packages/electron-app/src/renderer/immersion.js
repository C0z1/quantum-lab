/* immersion.js — comportamiento de la capa inmersiva. No toca la lógica de la
   app (ui.js / scene.js): solo escucha el mouse y alterna clases para:
     · atenuar el chrome tras 4 s de inactividad (idle fade) y ocultar el cursor,
     · autoocultar el panel Guía, que reaparece con el mouse en los últimos 80 px.
   El lienzo 3D nunca se atenúa. */
(function () {
  'use strict';

  var IDLE_MS = 4000;
  var EDGE_PX = 80;
  var body = document.body;

  // -------- Idle fade global --------
  var idleTimer = null;
  function goIdle() {
    body.classList.add('idle');
  }
  function wake() {
    if (body.classList.contains('idle')) body.classList.remove('idle');
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(goIdle, IDLE_MS);
  }

  // -------- Autohide del panel Guía --------
  var panel = document.querySelector('.insp-col');
  var panelTimer = null;
  function showPanel() {
    if (!panel) return;
    panel.classList.remove('autohide');
    if (panelTimer) clearTimeout(panelTimer);
    panelTimer = setTimeout(function () {
      panel.classList.add('autohide');
    }, IDLE_MS);
  }

  window.addEventListener(
    'mousemove',
    function (e) {
      wake();
      // Reaparece al acercarse al borde derecho.
      if (window.innerWidth - e.clientX <= EDGE_PX) showPanel();
    },
    { passive: true }
  );

  // Mientras el mouse esté sobre el panel, mantenlo visible.
  if (panel) {
    panel.addEventListener(
      'mousemove',
      function (e) {
        e.stopPropagation();
        showPanel();
      },
      { passive: true }
    );
    panel.addEventListener('mouseenter', showPanel, { passive: true });
  }

  // Cualquier tecla o clic también "despierta" la interfaz.
  window.addEventListener('keydown', wake, { passive: true });
  window.addEventListener('mousedown', wake, { passive: true });

  // Estado inicial: interfaz visible, temporizadores armados.
  wake();
  panelTimer = setTimeout(function () {
    if (panel) panel.classList.add('autohide');
  }, IDLE_MS);
})();
