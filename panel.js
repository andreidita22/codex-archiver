// panel.js
(() => {
  const $ = (selector) => document.querySelector(selector);

  const versionEl = $('#ca-version');
  const taskEl = $('#ca-task');
  const statusEl = $('#ca-status');
  const turnToggle = $('#ca-turn-dropdown-toggle');
  const turnDropdown = $('#ca-turn-dropdown');
  const turnOptionsEl = $('#ca-turn-options');
  const turnAllCheckbox = $('#ca-turn-all');
  const turnSummaryEl = $('#ca-turn-summary');

  const sectionsInputs = () => Array.from(document.querySelectorAll('[data-section-checkbox]'));

  const DEFAULTS = {
    defaultFormat: 'json',
    includeLogsByDefault: false
  };

  const turnState = {
    options: [],
    selected: new Set(),
    allSelected: false,
    open: false,
    activeKey: null,
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

  const updateTurnSummary = () => {
    if (!turnSummaryEl) return;
    let text = 'Active only';
    if (!turnState.options.length) {
      text = 'Active only';
    } else if (turnState.allSelected) {
      text = 'All turns';
    } else if (turnState.selected.size) {
      text = `${turnState.selected.size} selected`;
    }
    turnSummaryEl.textContent = text;
  };

  const renderTurnOptions = () => {
    if (!turnOptionsEl) return;
    turnOptionsEl.innerHTML = '';
    if (!turnState.options.length) {
      const empty = document.createElement('div');
      empty.className = 'ca-turn-empty';
      empty.textContent = 'No other turns detected.';
      turnOptionsEl.appendChild(empty);
      if (turnAllCheckbox) {
        turnAllCheckbox.checked = false;
        turnAllCheckbox.disabled = true;
      }
      if (turnToggle) {
        turnToggle.disabled = true;
      }
      updateTurnSummary();
      return;
    }

    if (turnAllCheckbox) {
      turnAllCheckbox.disabled = false;
      turnAllCheckbox.checked = turnState.allSelected;
    }
    if (turnToggle) {
      turnToggle.disabled = false;
      turnToggle.setAttribute('aria-expanded', String(turnState.open));
    }

    const selectedKeys = turnState.allSelected
      ? new Set(turnState.options.map((opt) => opt.key))
      : turnState.selected;

    turnState.options.forEach((option) => {
      const label = document.createElement('label');
      label.className = 'ca-turn-option';
      if (option.key === turnState.activeKey || (option.isActiveTurn && option.isActiveVersion)) {
        label.classList.add('active');
      }

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = selectedKeys.has(option.key);
      checkbox.addEventListener('change', (event) => {
        if (event.target.checked) {
          turnState.selected.add(option.key);
        } else {
          turnState.selected.delete(option.key);
          turnState.allSelected = false;
        }
        if (!turnState.allSelected && turnState.selected.size === turnState.options.length) {
          turnState.allSelected = true;
        }
        syncSelectionWithOptions();
      });

      label.appendChild(checkbox);
      const text = document.createElement('span');
      text.textContent = `${option.turnLabel} - ${option.versionLabel}`;
      label.appendChild(text);

      turnOptionsEl.appendChild(label);
    });

    updateTurnSummary();
  };

  const syncSelectionWithOptions = () => {
    if (!turnState.options.length) {
      closeDropdown();
    }
    const validKeys = new Set(turnState.options.map((opt) => opt.key));
    turnState.selected = new Set([...turnState.selected].filter((key) => validKeys.has(key)));
    if (turnState.allSelected) {
      turnState.selected = new Set(validKeys);
    }
    if (turnAllCheckbox) {
      turnAllCheckbox.checked = turnState.allSelected && turnState.options.length > 0;
      turnAllCheckbox.disabled = !turnState.options.length;
    }
    if (turnToggle) {
      turnToggle.disabled = !turnState.options.length;
    }
    renderTurnOptions();
  };

  const closeDropdown = () => {
    if (!turnState.open) return;
    turnState.open = false;
    if (turnDropdown) turnDropdown.classList.add('hidden');
    if (turnToggle) turnToggle.setAttribute('aria-expanded', 'false');
  };

  const openDropdown = () => {
    if (!turnState.options.length) return;
    turnState.open = true;
    if (turnDropdown) turnDropdown.classList.remove('hidden');
    if (turnToggle) turnToggle.setAttribute('aria-expanded', 'true');
  };

  const toggleDropdown = () => {
    if (turnState.open) closeDropdown();
    else openDropdown();
  };

  const selectedSections = () => {
    const picked = sectionsInputs().filter((i) => i.checked).map((i) => i.value);
    return picked.length ? picked : ['diffs', 'report'];
  };

  const requestExport = (format) => {
    setStatus('Preparing export.');
    const sections = selectedSections();
    const payload = {
      sections,
      format,
      selectedKeys: Array.from(turnState.selected),
      selectAll: turnState.allSelected,
    };
    parent.postMessage({ type: 'CA_EXPORT', payload }, '*');
  };

  // Wire buttons
  $('#ca-close')?.addEventListener('click', () => {
    setStatus('');
    parent.postMessage({ type: 'CA_CLOSE_PANEL' }, '*');
  });
  $('#ca-export-json')?.addEventListener('click', () => requestExport('json'));
  $('#ca-export-md')?.addEventListener('click', () => requestExport('markdown'));

  turnToggle?.addEventListener('click', () => {
    if (turnToggle.disabled) return;
    toggleDropdown();
  });

  turnAllCheckbox?.addEventListener('change', (event) => {
    turnState.allSelected = !!event.target.checked;
    syncSelectionWithOptions();
  });

  document.addEventListener('mousedown', (event) => {
    if (!turnState.open) return;
    if (turnDropdown?.contains(event.target) || turnToggle?.contains(event.target)) return;
    closeDropdown();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeDropdown();
  });

  // Incoming messages
  window.addEventListener('message', (event) => {
    const { type, payload } = event.data || {};
    if (!type) return;
    if (type === 'CA_STATE') {
      if (payload?.version !== undefined) versionEl.textContent = payload.version || 'current';
      if (payload?.taskId) taskEl.textContent = payload.taskId;
      if (Array.isArray(payload?.turnOptions)) {
        turnState.options = payload.turnOptions;
        turnState.activeKey = payload?.activeKey || null;
        if (turnState.allSelected) {
          turnState.selected = new Set(turnState.options.map((opt) => opt.key));
        }
        syncSelectionWithOptions();
      }
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
  updateTurnSummary();
  setStatus('');
  parent.postMessage({ type: 'CA_PANEL_READY' }, '*');
})();
