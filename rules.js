// rules.js  (add near the top)
const walk = (root) => {
  const stack = [root || document], out = [];
  while (stack.length) {
    const n = stack.pop();
    if (!n) continue;
    if (n.nodeType === 1) out.push(n);
    if (n.shadowRoot) stack.push(n.shadowRoot);
    if (n.children) for (let i = n.children.length - 1; i >= 0; i--) stack.push(n.children[i]);
  }
  return out;
};
const visible = (el) => {
  if (!el || el.hidden) return false;
  if (el.getAttribute && el.getAttribute('aria-hidden') === 'true') return false;
  const cs = getComputedStyle(el);
  if (cs.visibility === 'hidden' || cs.display === 'none') return false;
  if (el.offsetParent === null && cs.position !== 'fixed') return false;
  return true;
};

// Clickable "Version N" tabs; prefer header bar, then fallback to walker
const versionTabs = () => {
  const tabs = [];
  const header = document.querySelector('div.border-token-border-default.flex.items-center.justify-between.border-b');
  if (header) {
    const btns = Array.from(header.querySelectorAll('span > button'));
    for (const el of btns) {
      const t = (el.textContent || '').trim();
      if (visible(el) && /^version\s*\d+$/i.test(t)) tabs.push({ el, label: t });
    }
    if (tabs.length) return tabs;
  }
  for (const el of walk(document)) {
    if (!(el.getAttribute && (el.getAttribute('role') === 'tab' ||
                              el.getAttribute('role') === 'option' ||
                              el.tagName === 'BUTTON'))) continue;
    const t = (el.textContent || '').trim();
    if (visible(el) && /^version\s*\d+$/i.test(t)) tabs.push({ el, label: t });
  }
  return tabs;
};

// Find a section by heading text, then grab the nearest content block
const findSectionByHeadings = (labels) => {
  const rx = new RegExp(`^\\s*(?:${labels.map(s=>s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\s*$`, 'i');
  let heading = null;
  for (const el of walk(document)) {
    if (!visible(el)) continue;
    const isHeading = /(H1|H2|H3|H4|H5)/.test(el.tagName) || el.getAttribute('role') === 'heading';
    if (!isHeading) continue;
    const t = (el.textContent || '').trim();
    if (rx.test(t)) { heading = el; break; }
  }
  if (!heading) return null;
  // heuristic: prefer the next block after the heading
  let cur = heading.nextElementSibling;
  while (cur && !visible(cur)) cur = cur.nextElementSibling;
  return cur || heading.parentElement;
};

// Export the rules object
window.RULES = {
  // Used elsewhere by your script
  versionLocator: () => {
    const active = document.querySelector('[aria-selected="true"][role="tab"], [aria-current="true"][role="option"]');
    return active ? active.textContent.trim() : '';
  },
  versionTabs, // <— now uses walker

  sections: [
    {
      key: 'diffs',
      label: 'Diffs',
      activate: () => {/* if you have a toggle, click it; else no-op */},
      container: () => (
        findSectionByHeadings(['Diffs','Changes','Diff Logs','Patch']) // robust headings
      )
    },
    {
      key: 'report',
      label: 'Report',
      activate: () => {/* toggle if available */},
      container: () => (
        findSectionByHeadings(['Report','Summary','Run Report','Task Report'])
      )
    }
  ],

  taskIdFromUrl: (href) => (href.match(/task_[a-z0-9_]+/i) || ['task'])[0]
};
