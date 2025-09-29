// Injected into the page (MAIN world). Hooks clipboard writes and copy events.
(() => {
  if (window.__CA_PATCH_HOOKED) return;
  window.__CA_PATCH_HOOKED = true;

  const post = (text) => {
    try {
      window.postMessage({ type: 'CA_PATCH_CAPTURE', text: String(text || '') }, window.location.origin);
    } catch {}
  };

  try {
    const nc = navigator.clipboard;
    if (nc && typeof nc.writeText === 'function') {
      const orig = nc.writeText.bind(nc);
      navigator.clipboard.writeText = async (text) => {
        try { post(text); } catch {}
        return orig(text);
      };
    }
    // Also hook Clipboard API write() to catch ClipboardItem writes
    if (nc && typeof nc.write === 'function') {
      const origWrite = nc.write.bind(nc);
      navigator.clipboard.write = async (items) => {
        try {
          // Attempt to extract text/plain from ClipboardItem array
          let combined = '';
          const arr = Array.isArray(items) ? items : [items];
          for (const it of arr) {
            try {
              if (it && typeof it.getType === 'function') {
                const blob = await it.getType('text/plain').catch(() => null);
                if (blob && typeof blob.text === 'function') {
                  combined += (await blob.text());
                }
              }
            } catch {}
          }
          if (combined) post(combined);
        } catch {}
        return origWrite(items);
      };
    }
  } catch {}

  try {
    window.addEventListener('copy', (e) => {
      try {
        const dt = e.clipboardData;
        const t = dt?.getData('text/plain') || dt?.getData('text') || '';
        if (t) post(t);
      } catch {}
    }, true);
  } catch {}
})();
