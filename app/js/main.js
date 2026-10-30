/*
 * Sisu TV - entry point.
 */
(function (root) {
  'use strict';

  function start() {
    if (!root.SisuUI) {
      return;
    }
    root.SisuUI.boot();
  }

  if (root.document && root.document.readyState === 'loading') {
    root.document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})(typeof window !== 'undefined' ? window : this);
