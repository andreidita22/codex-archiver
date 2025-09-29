const DEFAULTS = {
  baseFolder: "Documents/codex_archive",
  defaultFormat: "json",
  includeLogsByDefault: false
};

function applyDefaultsToForm(settings) {
  document.getElementById("baseFolder").value = settings.baseFolder;
  const format = settings.defaultFormat === "markdown" ? "markdown" : "json";
  const radio = document.querySelector(`input[name="format"][value="${format}"]`);
  if (radio) radio.checked = true;
  document.getElementById("includeLogs").checked = !!settings.includeLogsByDefault;
}

function load() {
  chrome.storage.sync.get(DEFAULTS, (values) => {
    applyDefaultsToForm({ ...DEFAULTS, ...values });
  });
}

function save() {
  const baseFolder = document.getElementById("baseFolder").value || DEFAULTS.baseFolder;
  const defaultFormat = document.querySelector('input[name="format"]:checked')?.value || DEFAULTS.defaultFormat;
  const includeLogsByDefault = document.getElementById("includeLogs").checked;
  chrome.storage.sync.set({ baseFolder, defaultFormat, includeLogsByDefault }, () => {
    const status = document.getElementById("status");
    status.textContent = "Saved.";
    setTimeout(() => (status.textContent = ""), 1200);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("save").addEventListener("click", save);
  load();
});
