const apiBaseInput = document.getElementById("apiBase");
const apiKeyInput = document.getElementById("apiKey");
const saveBtn = document.getElementById("save");
const statusEl = document.getElementById("status");

chrome.storage.sync.get(["apiBase", "apiKey"], (stored) => {
  apiBaseInput.value = stored.apiBase || "https://app.contractsintel.com";
  apiKeyInput.value = stored.apiKey || "";
});

saveBtn.addEventListener("click", async () => {
  const apiBase = apiBaseInput.value.trim().replace(/\/$/, "");
  const apiKey = apiKeyInput.value.trim();
  if (!apiBase || !apiKey) {
    statusEl.textContent = "API base and key are required";
    statusEl.dataset.tone = "error";
    return;
  }
  try {
    await chrome.storage.sync.set({ apiBase, apiKey });
    statusEl.textContent = "Saved. Re-open a SAM.gov page to save opportunities.";
    statusEl.dataset.tone = "success";
  } catch (err) {
    statusEl.textContent = "Failed to save settings";
    statusEl.dataset.tone = "error";
    console.error(err);
  }
});
