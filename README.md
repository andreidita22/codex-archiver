Codex Archiver (Chrome/Edge Extension)

Codex Archiver captures Codex task runs from chatgpt.com and exports them as Markdown or JSON bundles, including full diffs, report text, and cleaned logs for each Version tab.

Features
- Panel UI injected into task pages on chatgpt.com
- Per‑version capture:
  - Diffs: clicks the top‑bar Create PR / View PR split menu and triggers Copy patch (trusted click via DevTools Protocol) to get the full version patch
  - Report: derived from the Logs tab’s preface (Summary, Testing, Files) for consistency; falls back to the page’s markdown/prose area if needed
  - Logs: switches to Logs and removes the report preface, UI crumbs, and early environment setup; starts at the assistant’s first planning line
- File naming uses the task title: `<taskId>/<version>/<slug(taskTitle)>__<version>.{md,json}`

How It Works (high level)
- Content script injects a small page hook and coordinates capture for each Version tab.
- For Diffs, a background service worker uses `chrome.debugger` (CDP) to click the split menu and Copy patch with trusted mouse events, then captures the clipboard text.
- Report and Logs are extracted from the DOM:
  - Logs tab container is located, its top header/setup blocks are dropped, and the remaining text is cleaned
  - Report is split from the top of the Logs content (Summary..Files block)

Permissions
- `downloads` to save files
- `storage` for options
- `scripting` to inject a page‑scope hook when needed
- `debugger` to perform trusted clicks for Copy patch via the DevTools Protocol

Usage
1) Install the unpacked extension in Chrome/Edge (Developer mode → Load unpacked → select this folder).
2) Open a Codex task at `https://chatgpt.com/codex/tasks/...`.
3) Use the panel to choose sections (Diffs/Report/Logs) and format (Markdown/JSON), then export.

Troubleshooting
- If you see “Extension context invalidated”, reload the extension and the page; the background worker may have restarted.
- If Diffs fail on a version with an existing PR, ensure the tab is foregrounded so CDP clicks are not blocked by focus.
- If Logs start with header/setup content, try again on a fully rendered page; the extractor waits for the structured container but can be tightened for new UI variants.

Changelog
- 0.3.0
  - Diffs capture via trusted CDP clicks (Create PR/View PR → Copy patch) with retries and menu qualification (excludes per‑file toolbars)
  - Report derived from the Logs preface (Summary / Testing / Files), with markdown/prose fallback
  - Logs cleaner: drops report preface, UI crumbs, environment setup; starts at the first assistant planning line; structural trim removes the first three header blocks across versions
  - File naming includes task title: `<taskId>/<version>/<slug(taskTitle)>__<version>.{md,json}` and JSON embeds `taskTitle`
  - Fixed transient postMessage origin mismatch during panel bootstrap
  - Repo cleanup: removed non‑extension files, added this README
