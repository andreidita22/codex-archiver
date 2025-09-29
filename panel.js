// panel.js
(() => {
  const $ = (selector) => document.querySelector(selector);

  const versionEl = $('#ca-version');
  const taskEl = $('#ca-task');
  const statusEl = $('#ca-status');
  const sectionsInputs = () => Array.from(document.querySelectorAll('input[type="checkbox"]'));

  const DEFAULTS = {
    defaultFormat: 'json',
    includeLogsByDefault: false
  };

  const setStatus = (text, isError = false) => {
    statusEl.textContent = text || '';
    statusEl.classList.toggle('error', !!isError);
  };

  const applyDefaults = () => {
    try {
      chrome.storage.sync.get(DEFAULTS, (settings) => {
        const logsCheckbox = sectionsInputs().find((input) => input.value === 'logs');
        if (logsCheckbox) logsCheckbox.checked = !!settings.includeLogsByDefault;
        const defaultFormat = settings.defaultFormat === 'markdown' ? 'markdown' : 'json';
        document.querySelectorAll('.ca-actions button').forEach((btn) => btn.classList.remove('primary'));
        const primary = defaultFormat === 'markdown' ? $('#ca-export-md') : $('#ca-export-json');
        if (primary) primary.classList.add('primary');
      });
    } catch {
      // ignore
    }
  };

  const selectedSections = () => {
    const picked = sectionsInputs().filter((i) => i.checked).map((i) => i.value);
    return picked.length ? picked : ['diffs', 'report'];
  };

  const requestExport = (format) => {
    setStatus('Preparing export.');
    const sections = selectedSections();
    parent.postMessage({ type: 'CA_EXPORT', payload: { sections, format } }, '*');
  };

  // Wire buttons
  $('#ca-close')?.addEventListener('click', () => {
    setStatus('');
    parent.postMessage({ type: 'CA_CLOSE_PANEL' }, '*');
  });
  $('#ca-export-json')?.addEventListener('click', () => requestExport('json'));
  $('#ca-export-md')?.addEventListener('click', () => requestExport('markdown'));

  // Incoming messages
  window.addEventListener('message', (event) => {
    const { type, payload } = event.data || {};
    if (!type) return;
    if (type === 'CA_STATE') {
      if (payload?.version !== undefined) versionEl.textContent = payload.version || 'current';
      if (payload?.taskId) taskEl.textContent = payload.taskId;
    }
    if (type === 'CA_EXPORT_PROGRESS') {
      setStatus('Exporting.');
    }
    if (type === 'CA_EXPORT_RESULT') {
      setStatus(payload?.message || '', !payload?.ok);
    }
  });

  // Dragging from header only; convert to global coords
  const header = document.querySelector('.ca-header');
  let dragging = false, raf = null;
  const toGlobal = (e) => {
    const r = (window.frameElement?.getBoundingClientRect?.() || { left: 0, top: 0 });
    return { x: e.clientX + r.left, y: e.clientY + r.top };
  };

  header?.addEventListener('mousedown', (event) => {
    if (event.target === document.getElementById('ca-close')) return;
    dragging = true;
    parent.postMessage({ type: 'CA_DRAG_START', payload: toGlobal(event) }, '*');
    event.preventDefault();
  });

  window.addEventListener('mousemove', (event) => {
    if (!dragging) return;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = null;
      parent.postMessage({ type: 'CA_DRAG_MOVE', payload: toGlobal(event) }, '*');
    });
  });

  window.addEventListener('mouseup', (event) => {
    if (!dragging) return;
    dragging = false;
    parent.postMessage({ type: 'CA_DRAG_END', payload: toGlobal(event) }, '*');
  });

  // Init
  applyDefaults();
  setStatus('');
  parent.postMessage({ type: 'CA_PANEL_READY' }, '*');
})();
