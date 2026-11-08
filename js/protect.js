(function () {
  'use strict';
  function block(e) { e.preventDefault(); e.stopPropagation(); return false; }
  window.addEventListener('keydown', function (e) {
    var k = (e.key || '').toLowerCase();
    var c = e.ctrlKey || e.metaKey;
    if (e.key === 'F12' || e.keyCode === 123) return block(e);                 // F12
    if (c && k === 's') return block(e);                                       // Ctrl+S
    if (c && e.shiftKey && (k === 'i' || k === 'j' || k === 'c')) return block(e); // DevTools
    if (c && k === 'u') return block(e);                                       // Voir source
  }, true);
  document.addEventListener('contextmenu', function (e) { e.preventDefault(); }, true);
})();
