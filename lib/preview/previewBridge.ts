/**
 * Preview-to-Source Bridge
 *
 * Injects a script into the preview iframe that:
 *   1. On click, captures the clicked element
 *   2. Finds data-component and data-source attributes
 *   3. Posts message to parent with component info
 *   4. Parent opens the file in editor and pre-fills chat
 */

export const PREVIEW_BRIDGE_SCRIPT = `
<script>
(function() {
  var overlay = null;
  var active = false;

  // Listen for activation from parent
  window.addEventListener('message', function(e) {
    if (e.data.type === 'pablo:inspect:start') {
      active = true;
      document.body.style.cursor = 'crosshair';
    }
    if (e.data.type === 'pablo:inspect:stop') {
      active = false;
      document.body.style.cursor = '';
      if (overlay) overlay.remove();
    }
  });

  document.addEventListener('mouseover', function(e) {
    if (!active) return;
    var el = e.target;

    // Create highlight overlay
    if (overlay) overlay.remove();
    overlay = document.createElement('div');
    var rect = el.getBoundingClientRect();
    Object.assign(overlay.style, {
      position: 'fixed',
      left: rect.left + 'px',
      top: rect.top + 'px',
      width: rect.width + 'px',
      height: rect.height + 'px',
      background: 'rgba(212, 168, 67, 0.2)',
      border: '2px solid rgba(212, 168, 67, 0.8)',
      pointerEvents: 'none',
      zIndex: 99999,
      borderRadius: '4px',
    });
    document.body.appendChild(overlay);
  });

  document.addEventListener('click', function(e) {
    if (!active) return;
    e.preventDefault();
    e.stopPropagation();

    var el = e.target;
    var info = {
      tagName: el.tagName.toLowerCase(),
      className: el.className,
      id: el.id,
      textContent: (el.textContent || '').slice(0, 100),
      componentName: findReactComponent(el),
      selector: buildSelector(el),
    };

    window.parent.postMessage({ type: 'pablo:element:selected', element: info }, '*');
    active = false;
    document.body.style.cursor = '';
    if (overlay) overlay.remove();
  }, true);

  function findReactComponent(el) {
    // React 18 fiber
    var keys = Object.keys(el);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].indexOf('__reactFiber$') === 0 || keys[i].indexOf('__reactInternalInstance$') === 0) {
        var fiber = el[keys[i]];
        while (fiber) {
          if (fiber.type && typeof fiber.type === 'function') {
            return fiber.type.displayName || fiber.type.name || null;
          }
          fiber = fiber.return;
        }
      }
    }
    // data attribute fallback
    if (el.dataset && el.dataset.component) return el.dataset.component;
    var closest = el.closest && el.closest('[data-component]');
    return closest ? closest.dataset.component : null;
  }

  function buildSelector(el) {
    if (el.id) return '#' + el.id;
    var parts = [];
    while (el && el !== document.body) {
      var selector = el.tagName.toLowerCase();
      if (el.className && typeof el.className === 'string') {
        selector += '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.');
      }
      parts.unshift(selector);
      el = el.parentElement;
    }
    return parts.join(' > ');
  }
})();
<\/script>`;

export interface SelectedElement {
  tagName: string;
  className: string;
  id: string;
  textContent: string;
  componentName: string | null;
  selector: string;
}
