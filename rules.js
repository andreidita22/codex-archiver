// rules.js
const walk = (root = document) => {
  const scope = root || document;
  const stack = [scope];
  const out = [];
  while (stack.length) {
    const node = stack.pop();
    if (!node) continue;
    if (node.nodeType === 1) out.push(node);
    if (node.shadowRoot) stack.push(node.shadowRoot);
    const children = node.children;
    if (children) {
      for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
    }
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

const collectVersionTabs = (root = document) => {
  const scope = root || document;
  const tabs = [];
  const header = scope.querySelector?.('div.border-token-border-default.flex.items-center.justify-between');
  const consider = (el) => {
    if (!el || !visible(el)) return;
    const label = (el.textContent || '').trim();
    if (!/^version\s*\d+$/i.test(label)) return;
    tabs.push({ el, label });
  };
  if (header) {
    for (const el of header.querySelectorAll('button')) consider(el);
    if (tabs.length) return tabs;
  }
  for (const el of walk(scope)) {
    if (!el.getAttribute) continue;
    const role = el.getAttribute('role');
    if (role !== 'tab' && role !== 'option' && el.tagName !== 'BUTTON') continue;
    consider(el);
  }
  return tabs;
};

const findSectionByHeadings = (labels, root = document) => {
  const scope = root || document;
  const escaped = labels.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const rx = new RegExp(`^\\s*(?:${escaped})\\s*$`, 'i');
  let heading = null;
  for (const el of walk(scope)) {
    if (!visible(el)) continue;
    const isHeading = /(H1|H2|H3|H4|H5)/.test(el.tagName) || el.getAttribute?.('role') === 'heading';
    if (!isHeading) continue;
    const text = (el.textContent || '').trim();
    if (rx.test(text)) {
      heading = el;
      break;
    }
  }
  if (!heading) return null;
  let cur = heading.nextElementSibling;
  while (cur && !visible(cur)) cur = cur.nextElementSibling;
  return cur || heading.parentElement;
};

window.RULES = {
  versionLocator: (root = document) => {
    const scope = root || document;
    const active = scope.querySelector?.('[aria-selected="true"][role="tab"], [aria-current="true"][role="option"]');
    if (active) return active.textContent.trim();
    const tabs = collectVersionTabs(scope);
    if (!tabs.length) return '';
    const highlighted = tabs.find(({ el }) => /text-token-text-primary/.test(el.className || ''));
    return (highlighted || tabs[0]).label;
  },
  versionTabs: (root) => collectVersionTabs(root),
  sections: [
    {
      key: 'diffs',
      label: 'Diffs',
      activate: () => {},
      container: (root) => findSectionByHeadings(['Diffs', 'Changes', 'Diff Logs', 'Patch'], root)
    },
    {
      key: 'report',
      label: 'Report',
      activate: () => {},
      container: (root) => findSectionByHeadings(['Report', 'Summary', 'Run Report', 'Task Report'], root)
    }
  ],
  taskIdFromUrl: (href) => (href.match(/task_[a-z0-9_]+/i) || ['task'])[0]
};
