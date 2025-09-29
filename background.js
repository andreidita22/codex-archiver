// background.js (MV3 service worker)

const DEFAULT_SETTINGS = {
  baseFolder: "Documents/codex_archive",
  defaultFormat: "json",
  includeLogsByDefault: false
};

function guessMime(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  if (ext === 'md') return 'text/markdown';
  if (ext === 'json') return 'application/json';
  if (ext === 'html' || ext === 'htm') return 'text/html';
  if (ext === 'diff' || ext === 'patch') return 'text/x-diff';
  if (ext === 'txt' || ext === 'log') return 'text/plain';
  return 'application/octet-stream';
}

async function downloadOne({ path, base64, mime }) {
  const url = `data:${mime || guessMime(path)};base64,${base64}`;
  return new Promise((resolve, reject) => {
    chrome.downloads.download(
      {
        url,
        filename: path.replace(/^\/+/, ""),
        saveAs: false,
        conflictAction: "uniquify"
      },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(downloadId);
        }
      }
    );
  });
}

async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (res) => {
      const merged = { ...DEFAULT_SETTINGS, ...res };
      if (!('defaultFormat' in res) && typeof res.exportMode === 'string') {
        merged.defaultFormat = res.exportMode === 'markdown' ? 'markdown' : 'json';
      }
      return resolve(merged);
    });
  });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg?.type === "CDP_COPY_PATCH") {
      const tabId = _sender?.tab?.id;
      if (!tabId) { sendResponse({ ok: false, error: 'No tab id' }); return; }

      const dbg = { tabId };
      const v = '1.3';

      const send = (method, params) => new Promise((resolve, reject) => {
        try { chrome.debugger.sendCommand(dbg, method, params, (res) => {
          const err = chrome.runtime.lastError?.message;
          if (err) reject(new Error(err)); else resolve(res);
        }); } catch (e) { reject(e); }
      });

      const attach = () => new Promise((resolve, reject) => {
        try { chrome.debugger.attach(dbg, v, () => {
          const err = chrome.runtime.lastError?.message; if (err) reject(new Error(err)); else resolve();
        }); } catch (e) { reject(e); }
      });

      const detach = () => new Promise((resolve) => {
        try { chrome.debugger.detach(dbg, () => resolve()); } catch { resolve(); }
      });

      try {
        await attach();
        await send('Runtime.enable');
        await send('Page.enable');

        // Install capture hook in page (separate from content-script hook)
        await send('Runtime.evaluate', { expression: `(() => { try {
          if (!window.__CA_LAST_PATCH) window.__CA_LAST_PATCH='';
          const set=(t)=>{ try{ window.__CA_LAST_PATCH=String(t||''); }catch{} };
          const nc=navigator.clipboard;
          if (nc && typeof nc.writeText==='function' && !window.__CA_WRAP_WT) {
            window.__CA_WRAP_WT=true; const _w=nc.writeText.bind(nc); nc.writeText=async(t)=>{ try{set(t)}catch{}; return _w(t); };
          }
          if (nc && typeof nc.write==='function' && !window.__CA_WRAP_W) {
            window.__CA_WRAP_W=true; const _W=nc.write.bind(nc); nc.write=async(items)=>{ try{ const arr=Array.isArray(items)?items:[items]; let out=''; for (const it of arr){ const b=await it.getType?.('text/plain').catch(()=>null); if(b?.text) out+=await b.text(); } if(out) set(out);}catch{} return _W(items); };
          }
          window.addEventListener('copy',(e)=>{ try{ const dt=e.clipboardData; const t=dt?.getData('text/plain')||dt?.getData('text')||''; if(t) set(t); }catch{} }, true);
          return true; } catch(e){ return String(e); } })()`, returnByValue: true });

        // Helper to eval and return by value
        const evalRV = async (expr) => {
          const out = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
          return out?.result?.value;
        };

        // Find trigger center
        const getCenter = async (sel) => evalRV(`(() => { const el=document.querySelector(${JSON.stringify(sel)}); if(!el) return null; const r=el.getBoundingClientRect(); return {x:Math.round(r.left+r.width/2), y:Math.round(r.top+r.height/2)}; })()`);
        const pos = await getCenter('button[aria-label="Open git action menu"]');
        if (!pos) { sendResponse({ ok:false, error:'Trigger not found' }); return; }

        // Try multiple attempts: open menu, locate qualified popper, click Copy patch
        let target = null;
        for (let i = 0; i < 6 && !target; i++) {
          // Click trigger
          await send('Input.dispatchMouseEvent', { type:'mouseMoved', x:pos.x, y:pos.y, button:'none' });
          await send('Input.dispatchMouseEvent', { type:'mousePressed', x:pos.x, y:pos.y, button:'left', clickCount:1 });
          await send('Input.dispatchMouseEvent', { type:'mouseReleased', x:pos.x, y:pos.y, button:'left', clickCount:1 });
          await new Promise(r=>setTimeout(r,300));

          // Find Copy patch inside the correct popper
          target = await evalRV(`(() => {
            const vis=(el)=>{ const cs=getComputedStyle(el); return cs.visibility!=='hidden' && cs.display!=='none' && (el.offsetParent!==null || cs.position==='fixed'); };
            const norm=(s)=>String(s||'').replace(/\s+/g,' ').trim().toLowerCase();
            const trigger=document.querySelector('button[aria-label="Open git action menu"]'); if(!trigger) return null; const tr=trigger.getBoundingClientRect();
            const allCp=Array.from(document.querySelectorAll('[role="menuitem"][aria-label="Copy patch"],[role="menuitem"]'))
              .filter(vis)
              .filter(el=> el.getAttribute('aria-label')==='Copy patch' || norm(el.textContent).includes('copy patch'));
            if(!allCp.length) return null; const pairs=[];
            for(const el of allCp){
              const wrap=el.closest('div[data-radix-popper-content-wrapper]'); if(!wrap||!vis(wrap)) continue;
              const items=Array.from(wrap.querySelectorAll('[role="menuitem"],button,a,div')).filter(vis);
              const texts=items.map(i=>norm(i.textContent));
              const good = texts.some(t=> t==='create draft pr' || t==='create pr' || t==='view pr' || t.includes('copy git apply'));
              const bad = texts.some(t=> t.includes('split diff') || t.includes('unified diff'));
              if(!good || bad) continue;
              const r=el.getBoundingClientRect(); const wr=wrap.getBoundingClientRect();
              const dist=Math.abs(wr.top-tr.bottom)+Math.abs(wr.left-tr.left);
              pairs.push({x:Math.round(r.left+r.width/2), y:Math.round(r.top+r.height/2), dist});
            }
            if(!pairs.length) return null; pairs.sort((a,b)=>a.dist-b.dist); return pairs[0];
          })()`);

          if (!target) {
            // Press Escape to close any open popper and retry
            await send('Input.dispatchKeyEvent', { type:'keyDown', windowsVirtualKeyCode:27, nativeVirtualKeyCode:27, key:'Escape', code:'Escape' }).catch(()=>{});
            await send('Input.dispatchKeyEvent', { type:'keyUp', windowsVirtualKeyCode:27, nativeVirtualKeyCode:27, key:'Escape', code:'Escape' }).catch(()=>{});
            await new Promise(r=>setTimeout(r,120));
          }
        }
        if (!target) { sendResponse({ ok:false, error:'Copy patch not found' }); return; }

        await send('Input.dispatchMouseEvent', { type:'mouseMoved', x:target.x, y:target.y, button:'none' });
        await send('Input.dispatchMouseEvent', { type:'mousePressed', x:target.x, y:target.y, button:'left', clickCount:1 });
        await send('Input.dispatchMouseEvent', { type:'mouseReleased', x:target.x, y:target.y, button:'left', clickCount:1 });

        // Wait for captured text
        const start = Date.now(); let text = '';
        while (Date.now()-start < 8000) {
          text = await evalRV('window.__CA_LAST_PATCH || ""');
          if (text && text.length > 10) break; await new Promise(r=>setTimeout(r,150));
        }
        sendResponse({ ok: !!text, text });
      } catch (e) {
        sendResponse({ ok:false, error: String(e) });
      } finally {
        await detach();
      }
      return;
    }
    if (msg?.type === "INJECT_PATCH_HOOK") {
      const tabId = _sender?.tab?.id;
      if (!tabId) {
        sendResponse({ ok: false, error: "No tab id" });
        return;
      }
      await chrome.scripting.executeScript({
        target: { tabId },
        world: "MAIN",
        files: ["page-hook.js"]
      });
      sendResponse({ ok: true });
      return;
    }
    if (msg?.type === "EXPORT_FILES") {
      const settings = await getSettings();
      const baseFolder = settings.baseFolder || DEFAULT_SETTINGS.baseFolder;
      const files = msg.files.map((f) => ({
        ...f,
        path: `${baseFolder}/${f.path}`.replace(/\/+/g, "/")
      }));
      for (const f of files) await downloadOne(f);
      sendResponse({ ok: true, count: files.length });
      return;
    }
    if (msg?.type === "EXPORT_SINGLE") {
      const settings = await getSettings();
      const baseFolder = settings.baseFolder || DEFAULT_SETTINGS.baseFolder;
      const path = `${baseFolder}/${msg.path}`.replace(/\/+/g, "/");
      await downloadOne({ path, base64: msg.base64, mime: msg.mime });
      sendResponse({ ok: true, count: 1 });
      return;
    }
  })().catch((err) => {
    console.error("[Codex Archiver] background error:", err);
    sendResponse({ ok: false, error: String(err) });
  });
  return true;
});
