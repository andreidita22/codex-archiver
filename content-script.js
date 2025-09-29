// content-script.js  (helpers)
const normalizeDiffText = (raw) => {
  if (!raw) return '';
  const lines = String(raw).replace(/\r/g, '').split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const a = lines[i];
    if (/^\s*\d+\s*$/.test(a)) {
      let j = i + 1;
      while (j < lines.length && /^\s*$/.test(lines[j])) j++;
      if (j < lines.length) {
        const t = lines[j];
        const first = t.trim().charAt(0);
        if (first === '+' || first === '-' || first === ' ') {
          out.push(a.trim() + '   ' + t.replace(/^\s+/, ''));
          i = j;
          continue;
        }
      }
    }
    out.push(a);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
};

// Patch capture helpers (for diffs via "Copy patch")
const __patchWaiters = [];
const __nextPatch = (timeout = 8000) => new Promise((resolve) => {
  const timer = setTimeout(() => resolve(null), timeout);
  __patchWaiters.push((text) => { clearTimeout(timer); resolve(text || null); });
});

const __isVisible = (el) => {
  if (!el) return false;
  if (el.hidden || el.getAttribute?.('aria-hidden') === 'true') return false;
  const cs = getComputedStyle(el);
  if (cs.visibility === 'hidden' || cs.display === 'none') return false;
  if (el.offsetParent === null && cs.position !== 'fixed') return false;
  return true;
};

const __findCopyPatchButton = () => {
  const nodes = Array.from(document.querySelectorAll('button, [role="menuitem"], [role="button"], [aria-label], [title], a'));
  for (const el of nodes) {
    if (!__isVisible(el)) continue;
    const text = (el.textContent || el.getAttribute('aria-label') || el.getAttribute('title') || '').trim();
    if (/copy\s*patch/i.test(text)) return el;
  }
  return null;
};

const __findHeaderBar = () => document.querySelector('div.border-token-border-default.flex.items-center.justify-between.border-b');

// Clean, strict path: open top Create PR split menu and click "Copy patch" within its menu only
const __findTopBarTrigger = () => {
  // Prefer a visible split-trigger next to a "Create PR" label
  const triggers = Array.from(document.querySelectorAll('button[aria-label="Open git action menu"]')).filter(__isVisible);
  if (!triggers.length) return null;
  const score = (btn) => {
    let n = btn;
    for (let i = 0; i < 5 && n; i++, n = n.parentElement) {
      const txt = (n.textContent || '').trim();
      if (/\bcreate\s*pr\b/i.test(txt)) return 2; // inside the split group that shows Create PR
      if (/btn-primary/.test(n.className || '')) return 1; // in the rounded split group
    }
    return 0;
  };
  triggers.sort((a,b)=> score(b)-score(a));
  return triggers[0] || null;
};

const __openTopBarMenuCopyPatch = async () => {
  const trigger = __findTopBarTrigger() || document.querySelector('button[aria-label="Open git action menu"]');
  if (!trigger || !__isVisible(trigger)) return false;
  const trRect = trigger.getBoundingClientRect?.() || { top: 0, left: 0, bottom: 0 };

  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const findCopyInCreateMenu = () => {
    const allCp = Array.from(document.querySelectorAll('[role="menuitem"][aria-label="Copy patch"], [role="menuitem"]'))
      .filter(__isVisible)
      .filter(el => el.getAttribute('aria-label') === 'Copy patch' || norm(el.textContent).includes('copy patch'));
    if (!allCp.length) return null;
    const candidates = [];
    for (const el of allCp) {
      const wrap = el.closest('div[data-radix-popper-content-wrapper]');
      if (!wrap || !__isVisible(wrap)) continue;
      const texts = Array.from(wrap.querySelectorAll('[role="menuitem"],button,a,div'))
        .filter(__isVisible)
        .map(i => norm(i.textContent));
      const hasCreate = texts.some(t => t === 'create draft pr' || t === 'create pr');
      if (!hasCreate) continue;
      const wr = wrap.getBoundingClientRect?.() || { top: 0, left: 0 };
      const dist = Math.abs(wr.top - trRect.bottom) + Math.abs(wr.left - trRect.left);
      candidates.push({ el, dist });
    }
    if (!candidates.length) return null;
    candidates.sort((a, b) => a.dist - b.dist);
    return candidates[0].el;
  };

  for (let attempt = 0; attempt < 5; attempt++) {
    try { trigger.click(); } catch {}
    await new Promise(r => setTimeout(r, 240));
    const hit = findCopyInCreateMenu();
    if (hit) { try { hit.scrollIntoView({ block: 'center' }); } catch {}; try { hit.click(); } catch {}; return true; }
  }
  return false;
};

const __openHeaderMenuAndClickCopyPatch = async () => {
  const bar = __findHeaderBar();
  if (bar) {
    // Try obvious menu togglers within the header bar first
    const togglersInBar = Array.from(bar.querySelectorAll('button[aria-haspopup="menu"], [aria-haspopup="menu"], button[aria-label], [role="button"][aria-label], button[title]')).filter(__isVisible);
    const looksLikeMenu = (el) => {
      const label = (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '').trim();
      if (!label) return false;
      if (/\b(more|menu|options|actions|overflow)\b/i.test(label)) return true;
      if (label.includes('…') || label.includes('⋯') || label.includes('...')) return true;
      return false;
    };
    const candidates = togglersInBar.filter(looksLikeMenu).slice(0, 6);
    for (const el of candidates) {
      try { el.click(); } catch {}
      await new Promise((r) => setTimeout(r, 160));
      const btn = __findCopyPatchButton();
      if (btn) { try { btn.click(); } catch {} return true; }
    }
  }
  return false;
};

const __openMenuAndClickCopyPatch = async () => {
  let btn = __findCopyPatchButton();
  if (btn) { try { btn.click(); } catch {} return true; }
  const togglers = Array.from(document.querySelectorAll('button[aria-haspopup="menu"], [aria-haspopup="menu"], button[aria-label], [role="button"][aria-label], button[title]')).filter(__isVisible);
  const looksLikeMenu = (el) => {
    const label = (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '').trim();
    if (!label) return false;
    if (/\b(more|menu|options|actions|overflow)\b/i.test(label)) return true;
    if (label.includes('…') || label.includes('⋯') || label.includes('...')) return true;
    return false;
  };
  const candidates = togglers.filter(looksLikeMenu).slice(0, 6);
  for (const el of candidates) {
    try { el.click(); } catch {}
    await new Promise((r) => setTimeout(r, 180));
    btn = __findCopyPatchButton();
    if (btn) { try { btn.click(); } catch {} return true; }
  }
  await new Promise((r) => setTimeout(r, 120));
  btn = __findCopyPatchButton();
  if (btn) { try { btn.click(); } catch {} return true; }
  return false;
};

// --- Title + section helpers ---
const getTaskTitle = () => {
  const heads = Array.from(document.querySelectorAll('h1, [role="heading"][aria-level="1"], [role="heading"]'))
    .filter(__isVisible)
    .map(el => (el.textContent || '').trim())
    .filter(Boolean);
  if (heads.length) return heads[0];
  const t = (document.title || '').trim();
  const idx = t.indexOf(' - ');
  return idx > 0 ? t.slice(0, idx) : (t || 'Task');
};

const slug = (s) => String(s || '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9._ -]+/gi, '_')
  .replace(/\s+/g, '_')
  .replace(/_+/g, '_')
  .replace(/^_+|_+$/g, '')
  .slice(0, 120);

const findReportBlock = () => {
  // Prefer the exact report container: markdown + prose + markdown-new-styling and starting with Summary
  const isSummaryStart = (el) => {
    try {
      const first = el.querySelector('p, strong, h1, h2');
      const t = ((first?.textContent) || (el.innerText || '')).trim();
      return /^summary\b/i.test(t);
    } catch { return false; }
  };
  const specific = Array.from(document.querySelectorAll('div.markdown.prose.markdown-new-styling'))
    .filter(__isVisible)
    .filter(isSummaryStart);
  if (specific.length) {
    specific.sort((a,b)=> (b.innerText?.length||0) - (a.innerText?.length||0));
    return specific[0];
  }
  // Fallback: any visible markdown+prose block that begins with Summary
  const cands = Array.from(document.querySelectorAll('.markdown.prose, .prose.markdown'))
    .filter(__isVisible)
    .filter(isSummaryStart);
  if (cands.length) {
    cands.sort((a,b)=> (b.innerText?.length||0) - (a.innerText?.length||0));
    return cands[0];
  }
  // Final fallback: largest visible markdown/prose region
  const any = Array.from(document.querySelectorAll('.markdown, .prose, div, section, article'))
    .filter(__isVisible)
    .map(el => ({ el, len: (el.innerText || el.textContent || '').length }))
    .sort((a,b)=> b.len - a.len);
  return any[0]?.el || null;
};

const findLogsTabAndContainer = async () => {
  const norm = (s) => String(s||'').replace(/\s+/g,' ').trim().toLowerCase();
  let logsBtn = Array.from(document.querySelectorAll('button,[role="tab"],a'))
    .filter(__isVisible)
    .find(el => norm(el.textContent).startsWith('logs'));
  if (logsBtn) {
    const sel = logsBtn.getAttribute('aria-selected') === 'true';
    if (!sel) { try { logsBtn.click(); } catch {} await new Promise(r=>setTimeout(r,350)); }
  }

  // Try to find a structured container whose first 3 children look like header/setup/prompt
  const textOf = (el) => (typeof el?.innerText === 'string' ? el.innerText : el?.textContent) || '';
  const looksLikeHeaderBlock = (s) => {
    const t = s.trim(); if (!t) return false;
    return (
      /^implement\b/i.test(t) ||
      /^(ask|code|diff|logs|internet on|copy|archive|share|create pr|view pr)\b/i.test(t) ||
      /^version\s+\d+$/i.test(t) ||
      /^environment setup$/i.test(t) ||
      /\[setup\]/i.test(t) ||
      /Configuring language runtimes/i.test(t)
    );
  };
  const findStructured = () => {
    const nodes = Array.from(document.querySelectorAll('div,section,article')).filter(__isVisible);
    for (const el of nodes) {
      const kids = Array.from(el.children || []).filter(__isVisible);
      if (kids.length >= 3) {
        const first3 = kids.slice(0,3).map(textOf).join('\n');
        const tailLen = kids.slice(3).reduce((acc, ch) => acc + textOf(ch).length, 0);
        if (looksLikeHeaderBlock(first3) && tailLen > 200) return el;
      }
    }
    return null;
  };
  let structured = findStructured();
  for (let i=0; i<10 && !structured; i++) { await new Promise(r=>setTimeout(r,200)); structured = findStructured(); }
  if (structured) return structured;

  // Fallback: active tabpanel with longest content
  const panels = Array.from(document.querySelectorAll('[role="tabpanel"], .tabpanel, .tab-panel')).filter(__isVisible);
  if (panels.length) {
    panels.sort((a,b)=> (b.innerText?.length||0) - (a.innerText?.length||0));
    return panels[0];
  }
  // Fallback 2: largest visible block
  const blocks = Array.from(document.querySelectorAll('pre, code, div'))
    .filter(__isVisible)
    .map(el => ({ el, len: (el.innerText || el.textContent || '').length }))
    .sort((a,b)=> b.len - a.len);
  return blocks[0]?.el || null;
};

// Prefer structural extraction: drop first 3 child blocks inside the main logs container
const extractLogsRaw = (root) => {
  if (!root) return '';
  let raw = (typeof root.innerText === 'string' ? root.innerText : root.textContent) || '';

  const textOf = (el) => (typeof el?.innerText === 'string' ? el.innerText : el?.textContent) || '';
  const looksLikeHeaderBlock = (s) => {
    const t = s.trim();
    if (!t) return false;
    return (
      /^implement\b/i.test(t) ||
      /^(ask|code|diff|logs|internet on|copy|archive|share|create pr|view pr)\b/i.test(t) ||
      /^version\s+\d+$/i.test(t) ||
      /^environment setup$/i.test(t) ||
      /\[setup\]/i.test(t) ||
      /Configuring language runtimes/i.test(t)
    );
  };

  const bfsPickContainer = (node) => {
    const q = [node];
    while (q.length) {
      const el = q.shift();
      if (!__isVisible(el)) continue;
      const kids = Array.from(el.children || []).filter(__isVisible);
      if (kids.length >= 3) {
        const first3 = kids.slice(0, 3).map(textOf).join('\n');
        if (looksLikeHeaderBlock(first3)) return el;
      }
      for (const k of kids) q.push(k);
    }
    return null;
  };

  try {
    // Prefer a container whose first 3 children match header/setup/prompt patterns
    let inner = bfsPickContainer(root);
    // Fallback to any stacked block with >=4 children
    if (!inner) {
      const q = [root];
      while (q.length && !inner) {
        const el = q.shift();
        if (!__isVisible(el)) continue;
        const kids = Array.from(el.children || []).filter(__isVisible);
        if (kids.length >= 4) inner = el; else for (const k of kids) q.push(k);
      }
    }
    if (inner) {
      const kids = Array.from(inner.children || []).filter(__isVisible);
      if (kids.length >= 3) {
        const kept = kids.slice(3).map((ch) => textOf(ch)).join('\n');
        if ((kept || '').length > 200) raw = kept; // require reasonable tail content
      }
    }
  } catch {}

  return raw;
};

// Split report preface (Summary..Files) from logs and clean logs
const splitReportFromLogs = (raw) => {
  if (!raw) return { report: '', logs: '' };
  const stripCtl = (s) => s.replace(/[\u0000-\u0009\u000B-\u001F\u007F\uFFFD]/g, '');
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const lines = stripCtl(String(raw).replace(/\r/g, '')).split('\n');

  const isCrumb = (l) => /^(ask|code|diff|logs|internet on|copy|archive|share|create pr|view pr)$/i.test(l.trim()) || /^version\s+\d+$/i.test(l.trim());
  const isShellMarker = (l) => /^root@.+#\s/.test(l) || /^shell\s*$/i.test(l);
  const isUsefulCmd = (l) => /\b(node|git|bash|pnpm|npm|yarn)\b/.test(l) && !/^(Ask|Code|Diff|Logs)\b/.test(l);

  // Locate report segment
  let iSummary = lines.findIndex((l) => /^\s*Summary\s*$/i.test(l));
  if (iSummary === -1) return { report: '', logs: cleanLogs(lines.join('\n')) };

  // Find end near Files (N)
  const iFiles = lines.findIndex((l, i) => i > iSummary && /^\s*Files\s*\(\d+\)\s*$/i.test(l));
  let end = -1;
  if (iFiles !== -1) {
    // Consume after Files block, stop as soon as we hit UI crumbs/shell/env markers
    end = iFiles + 1;
    for (let k = end; k < lines.length; k++) {
      const ln = lines[k];
      const t = ln.trim();
      const isCount = /^\d+x$/i.test(t);
      const isWorked = /^worked\s+for\b/i.test(t);
      const isImplement = /^implement\b/i.test(t);
      const isEnv = /^environment setup$/i.test(t) || /^\[setup\]/i.test(t) || /Configuring language runtimes/i.test(ln);
      if (!t) { end = k; continue; }
      if (isCrumb(ln) || isShellMarker(ln) || isEnv || isCount || isWorked || isImplement) { end = k; break; }
      end = k + 1;
    }
  } else {
    // Fallback: end at first crumb/shell after Summary
    for (let k = iSummary + 1; k < lines.length; k++) {
      if (isCrumb(lines[k]) || isShellMarker(lines[k])) { end = k; break; }
    }
    if (end === -1) end = lines.length;
  }

  const report = lines.slice(iSummary, end).join('\n').trim();

  // Build cleaned logs: remove preface and UI crumbs/setup
  let rest = lines.slice(end);
  // Drop leading crumbs and blanks
  while (rest.length && (!rest[0].trim() || isCrumb(rest[0]) || /^Implement\b/i.test(rest[0]))) rest.shift();
  // Prefer to start at the first assistant step line (e.g., AGENTS.md guidance)
  const isAgentStart = (l) => {
    const t = l.trim(); if (!t) return false; const low = t.toLowerCase();
    const starts = /^(i need to|i'll|i will|let me|i\'ll|we need to|i should|first,|first step|step 1)/i.test(t);
    const mentionsAgents = /agents\.md|\bagents\b/i.test(t);
    return starts && (mentionsAgents || /instructions|guide|locate|search|check/.test(low));
  };
  let idxAgent = rest.findIndex(isAgentStart);
  if (idxAgent > 0 && idxAgent < 120) {
    rest = rest.slice(idxAgent);
  } else {
    // Trim initial environment/setup up to first useful command (if present)
    let firstUseful = rest.findIndex((l) => isUsefulCmd(l));
    if (firstUseful > 0 && firstUseful < 50) rest = rest.slice(firstUseful);
  }

  const logs = cleanLogs(rest.join('\n'));
  return { report, logs };

  function cleanLogs(s) {
    const ls = s.split('\n').filter((l) => !isCrumb(l));
    // Collapse 3+ blank lines
    return ls.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }
};

  // Listen for patch capture messages from page hook
  window.addEventListener('message', (event) => {
  const t = event.data?.type;
  if (t !== 'CA_PATCH_CAPTURE') return;
  const text = String(event.data?.text ?? event.data?.payload?.text ?? '');
  const waiter = __patchWaiters.shift();
  if (waiter) waiter(text);
});

async function captureSection(key){
  // Logs: independent of RULES
  if (key === 'logs') {
    const node = await findLogsTabAndContainer();
    if (!node) return null;
    const raw = extractLogsRaw(node);
    const { report, logs } = splitReportFromLogs(raw);
    // If both report and logs were requested, report will be picked by report-capture too.
    return { key, label: 'Logs', text: logs || String(raw).trim() };
  }
  const def = RULES.sections.find(s=>s.key===key);
  if (!def && key !== 'diffs' && key !== 'report') return null;
  // Special handling: diffs via "Copy patch"
  if (key === 'diffs') {
    await new Promise((res) => { chrome.runtime.sendMessage({ type: 'INJECT_PATCH_HOOK' }, () => res()); });
    // Use CDP via background to perform trusted clicks and capture patch
    const patch = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'CDP_COPY_PATCH' }, (resp) => {
        if (chrome.runtime.lastError) return resolve('');
        if (!resp?.ok) return resolve('');
        return resolve(String(resp.text || ''));
      });
    });
    if (!patch) return null;
    return { key, label: def?.label || 'Diffs', text: String(patch) };
  }
  if (key === 'report') {
    // Prefer the actual report section in the page (markdown + prose + markdown-new-styling)
    const node = findReportBlock();
    if (node) {
      const raw = (typeof node.innerText==='string' ? node.innerText : node.textContent) || '';
      const text = String(raw).trim();
      if (text && text.length > 50) return { key, label: def?.label || 'Report', text };
    }
    // Fallback: derive from Logs preface if the report block is unavailable
    const logsNode = await findLogsTabAndContainer();
    if (logsNode) {
      const rawLogs = extractLogsRaw(logsNode);
      const { report } = splitReportFromLogs(rawLogs);
      if (report && report.length > 50) return { key, label: def?.label || 'Report', text: report };
    }
    return null;
  }
  def.activate?.();
  const node = def.container?.();
  if (!node) return null;
  const raw = (typeof node.innerText==='string' ? node.innerText : node.textContent) || '';
  const text = String(raw).trim();
  return { key, label: def.label, text };
}

async function performExport({ sections, format }){
  // ... existing guards ...
  const tabs = (RULES.versionTabs?.() || []);
  let captured=[];
  const active = (RULES.versionLocator?.() || '').trim();

  if (tabs.length>1){
    for (const t of tabs){
      try { t.el?.scrollIntoView?.({ block: 'center', inline: 'center' }); } catch {}
      try { t.el?.click?.(); } catch {}
      await new Promise(r=>setTimeout(r,300));
      const parts = [];
      for (const k of sections) {
        const s = await captureSection(k);
        if (s) parts.push({ ...s, label: `${s.label} (${t.label})` });
      }
      captured.push(...parts);
    }
    // try restore
    const back=tabs.find(x=>x.label===active);
    try { back?.el?.click?.(); } catch {}
  } else {
    for (const k of sections) {
      const s=await captureSection(k); if (s) captured.push(s);
    }
  }

  // De-dupe by (key,label,first512)
  const seen = new Set();
  captured = captured.filter(s=>{
    const k = `${s.key}::${s.label}::${s.text.slice(0,512)}`;
    if (seen.has(k)) return false; seen.add(k); return true;
  });

  // ... build markdown / zip as you do today ...
}

// --- Panel wiring and export bridge (non-extraction logic) ---
(() => {
  // Panel constants and state
  const PANEL_ID = 'ca-panel-frame';
  const PANEL_URL = chrome.runtime.getURL('panel.html');
  const PANEL_ORIGIN = new URL(PANEL_URL).origin;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const state = {
    active: false,
    panelFrame: null,
    lastVersion: '',
    versionTimer: null,
    exporting: false,
    snoozeUntil: 0,
    drag: null,
    savedPosition: null
  };

  // Utils for export and messaging
  const encodeBase64 = (input) => {
    try {
      return btoa(unescape(encodeURIComponent(input)));
    } catch (_err) {
      return btoa(input);
    }
  };

  const sanitizeSegment = (value, fallback) => {
    if (!value) return fallback;
    return String(value).replace(/[^a-z0-9._-]+/gi, '_');
  };

  const sendToPanel = (type, payload) => {
    if (!state.panelFrame?.contentWindow) return;
    try {
      // Use '*' to avoid transient origin mismatch while the iframe initializes
      state.panelFrame.contentWindow.postMessage({ type, payload }, '*');
    } catch (err) {
      console.warn('[Codex Archiver] postMessage failed', err);
    }
  };

  const updatePanelState = () => {
    if (!state.panelFrame) return;
    const version = (window.RULES?.versionLocator?.() || '').trim();
    const taskId = window.RULES?.taskIdFromUrl?.(location.href) || 'task';
    if (version !== state.lastVersion) state.lastVersion = version;
    sendToPanel('CA_STATE', { taskId, version, url: location.href });
  };

  const startVersionTicker = () => {
    if (state.versionTimer) return;
    state.versionTimer = setInterval(updatePanelState, 1000);
  };
  const stopVersionTicker = () => {
    if (state.versionTimer) clearInterval(state.versionTimer);
    state.versionTimer = null;
  };

  // Inject the panel iframe
  const ensurePanel = () => {
    if (state.panelFrame) return;
    if (state.snoozeUntil && Date.now() < state.snoozeUntil) return;

    const frame = document.createElement('iframe');
    frame.id = PANEL_ID;
    frame.src = PANEL_URL;
    frame.style.position = 'fixed';
    frame.style.width = '360px';
    frame.style.height = '380px';
    frame.style.border = '1px solid rgba(0,0,0,0.1)';
    frame.style.borderRadius = '12px';
    frame.style.boxShadow = '0 12px 32px rgba(0,0,0,0.2)';
    frame.style.zIndex = '2147483000';
    frame.style.background = 'transparent';
    frame.style.top = '';
    frame.style.left = '';
    frame.style.right = '';
    frame.style.bottom = '';

    if (state.savedPosition && Number.isFinite(state.savedPosition.top) && Number.isFinite(state.savedPosition.left)) {
      frame.style.top = `${state.savedPosition.top}px`;
      frame.style.left = `${state.savedPosition.left}px`;
    } else {
      frame.style.bottom = '16px';
      frame.style.right = '16px';
    }

    (document.body || document.documentElement).appendChild(frame);
    state.panelFrame = frame;
    startVersionTicker();
    updatePanelState();
  };

  const removePanel = () => {
    stopVersionTicker();
    if (state.panelFrame) {
      state.panelFrame.remove();
      state.panelFrame = null;
    }
  };

  // Detection: on matched host, keep the panel up
  const isTargetPage = () => true; // content script only runs on allowed hosts per manifest

  const applyDetection = () => {
    const shouldBeActive = isTargetPage();
    if (shouldBeActive && !state.active) {
      state.active = true;
      ensurePanel();
    } else if (!shouldBeActive && state.active) {
      state.active = false;
      removePanel();
    } else if (shouldBeActive) {
      if (!state.panelFrame && (!state.snoozeUntil || Date.now() >= state.snoozeUntil)) ensurePanel();
      updatePanelState();
    }
  };

  // Build payloads for export
  const buildJsonPayload = ({ taskId, version, sections, taskTitle }) => ({
    exportedAt: new Date().toISOString(),
    taskId,
    version,
    url: location.href,
    taskTitle,
    sections
  });

  const buildMarkdown = ({ taskId, version, sections }) => {
    const lines = [];
    lines.push('# Codex Task Export');
    lines.push(`Task: ${taskId}`);
    lines.push(`Version: ${version || 'current'}`);
    lines.push(`URL: ${location.href}`);
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push('');
    if (!sections.length) {
      lines.push('_No sections were captured._');
      lines.push('');
      return lines.join('\n');
    }
    const grouped = sections.reduce((acc, s) => {
      (acc[s.key] ||= []).push(s);
      return acc;
    }, {});
    const order = ['report', 'diffs', 'logs'];
    for (const key of order) {
      const items = grouped[key];
      if (!items?.length) continue;
      const label = items[0].label || key;
      lines.push(`## ${label}`);
      lines.push('');
      let idx = 0;
      for (const item of items) {
        idx += 1;
        const heading = items.length > 1 ? `${label} ${idx}` : label;
        lines.push(`### ${heading}`);
        const fence = key === 'diffs' ? '```diff' : key === 'report' ? '```json' : '```text';
        lines.push(fence);
        lines.push(item.text || '');
        lines.push('```');
        lines.push('');
      }
    }
    return lines.join('\n');
  };

  // Bridge: receive panel messages
  window.addEventListener('message', async (event) => {
    if (event.origin !== PANEL_ORIGIN) return;
    const { type, payload } = event.data || {};
    if (!type) return;
    if (type === 'CA_PANEL_READY') {
      updatePanelState();
    }
    if (type === 'CA_EXPORT') {
      const sections = Array.isArray(payload?.sections) && payload.sections.length ? payload.sections : ['diffs', 'report'];
      const format = payload?.format === 'markdown' ? 'markdown' : 'json';
      if (state.exporting) return;
      state.exporting = true;
      sendToPanel('CA_EXPORT_PROGRESS', { status: 'running' });

      const taskIdRaw = window.RULES?.taskIdFromUrl?.(location.href) || 'task';
      const versionRaw = (window.RULES?.versionLocator?.() || '').trim() || 'current';
      const taskId = sanitizeSegment(taskIdRaw, 'task');
      const version = sanitizeSegment(versionRaw, 'current');

      try {
        // Use the existing extraction logic you updated
        const capturedBefore = await (async () => {
          // Reuse performExport's extraction up to dedupe, then return captured
          // We temporarily wrap performExport's extraction by duplicating its steps minimally
          // But to avoid touching it, we call it indirectly by cloning logic: leverage captureSection + RULES.versionTabs
          const tabs = (window.RULES?.versionTabs?.() || []);
          let captured = [];
          const active = (window.RULES?.versionLocator?.() || '').trim();
          if (tabs.length > 1) {
            for (const t of tabs) {
              try { t.el?.click?.(); } catch {}
              await sleep(120);
              const parts = [];
              for (const k of sections) {
                const s = await captureSection(k);
                if (s) parts.push({ ...s, label: `${s.label} (${t.label})` });
              }
              captured.push(...parts);
            }
            const back = tabs.find((x) => x.label === active);
            try { back?.el?.click?.(); } catch {}
          } else {
            for (const k of sections) {
              const s = await captureSection(k);
              if (s) captured.push(s);
            }
          }
          const seen = new Set();
          captured = captured.filter((s) => {
            const k = `${s.key}::${s.label}::${(s.text || '').slice(0, 512)}`;
            if (seen.has(k)) return false; seen.add(k); return true;
          });
          return captured;
        })();

        const captured = capturedBefore;
        if (!captured.length) {
          sendToPanel('CA_EXPORT_RESULT', { ok: false, message: 'No sections found to export.' });
          state.exporting = false;
          return;
        }

        const taskTitle = getTaskTitle();
        const titleSlug = slug(taskTitle);
        // Encode which section types were exported in the filename
        const typeOrder = ['report','diffs','logs'];
        const capturedTypes = (() => {
          const set = new Set(captured.map(s => s.key));
          return typeOrder.filter(t => set.has(t));
        })();
        const typesSuffix = capturedTypes.length ? `__${capturedTypes.join('+')}` : '';
        if (format === 'markdown') {
          const markdown = buildMarkdown({ taskId, version: versionRaw || 'current', sections: captured });
          const base64 = encodeBase64(markdown);
          // Save directly under base folder (no per-task subfolders)
          const filename = `${titleSlug || 'task'}__${version}${typesSuffix}.md`;
          chrome.runtime.sendMessage(
            { type: 'EXPORT_SINGLE', path: filename, base64, mime: 'text/markdown' },
            (res) => {
              const ok = res?.ok;
              sendToPanel('CA_EXPORT_RESULT', {
                ok,
                message: ok ? `Saved markdown to ${filename}` : res?.error || chrome.runtime.lastError?.message || 'Export failed.'
              });
            }
          );
        } else {
          const json = JSON.stringify(buildJsonPayload({ taskId, version: versionRaw || 'current', sections: captured, taskTitle }), null, 2);
          const base64 = encodeBase64(json);
          // Save directly under base folder (no per-task subfolders)
          const filename = `${titleSlug || 'task'}__${version}${typesSuffix}.json`;
          chrome.runtime.sendMessage(
            { type: 'EXPORT_SINGLE', path: filename, base64, mime: 'application/json' },
            (res) => {
              const ok = res?.ok;
              sendToPanel('CA_EXPORT_RESULT', {
                ok,
                message: ok ? `Saved JSON to ${filename}` : res?.error || chrome.runtime.lastError?.message || 'Export failed.'
              });
            }
          );
        }
      } catch (err) {
        console.error('[Codex Archiver] export error', err);
        sendToPanel('CA_EXPORT_RESULT', { ok: false, message: err?.message || 'Export failed.' });
      } finally {
        state.exporting = false;
      }
    }
    if (type === 'CA_CLOSE_PANEL') {
      state.snoozeUntil = Date.now() + 60_000;
      removePanel();
      setTimeout(applyDetection, 61_000);
    }
    if (type === 'CA_DRAG_START' && state.panelFrame) {
      const rect = state.panelFrame.getBoundingClientRect();
      state.panelFrame.style.bottom = '';
      state.panelFrame.style.right = '';
      state.panelFrame.style.top = `${rect.top}px`;
      state.panelFrame.style.left = `${rect.left}px`;
      state.drag = {
        offsetX: (payload?.x ?? 0) - rect.left,
        offsetY: (payload?.y ?? 0) - rect.top,
        width: rect.width,
        height: rect.height
      };
    }
    if (type === 'CA_DRAG_MOVE' && state.drag && state.panelFrame) {
      const pointerX = payload?.x ?? 0;
      const pointerY = payload?.y ?? 0;
      const left = pointerX - state.drag.offsetX;
      const top = pointerY - state.drag.offsetY;
      const maxLeft = Math.max(0, window.innerWidth - state.drag.width - 8);
      const maxTop = Math.max(0, window.innerHeight - state.drag.height - 8);
      const clampedLeft = Math.min(Math.max(left, 8), maxLeft);
      const clampedTop = Math.min(Math.max(top, 8), maxTop);
      state.panelFrame.style.left = `${clampedLeft}px`;
      state.panelFrame.style.top = `${clampedTop}px`;
    }
    if (type === 'CA_DRAG_END' && state.panelFrame) {
      if (state.drag) {
        const top = parseFloat(state.panelFrame.style.top || '0');
        const left = parseFloat(state.panelFrame.style.left || '0');
        state.savedPosition = { top, left };
      }
      state.drag = null;
    }
  });

  // Observe DOM changes to re-ensure panel presence
  const observer = new MutationObserver(() => applyDetection());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('popstate', applyDetection);
  window.addEventListener('hashchange', applyDetection);

  // Initial activation
  applyDetection();
})();
