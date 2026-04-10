// ContractsIntel content script. Injects a "Save to ContractsIntel" button
// onto SAM.gov opportunity pages and posts scraped metadata to the
// quick-save endpoint authenticated with the user's API key.

(() => {
  const BUTTON_ID = "contractsintel-save-btn";
  if (document.getElementById(BUTTON_ID)) return;

  const btn = document.createElement("button");
  btn.id = BUTTON_ID;
  btn.type = "button";
  btn.className = "contractsintel-save-btn";
  btn.textContent = "Save to ContractsIntel";

  const container = document.createElement("div");
  container.className = "contractsintel-save-container";
  container.appendChild(btn);
  document.body.appendChild(container);

  const toast = (message, tone = "info") => {
    btn.textContent = message;
    btn.dataset.tone = tone;
    setTimeout(() => {
      btn.textContent = "Save to ContractsIntel";
      delete btn.dataset.tone;
    }, 3500);
  };

  const scrape = () => {
    const pickText = (selectors) => {
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        const text = el && (el.textContent || "").trim();
        if (text) return text;
      }
      return null;
    };
    const title =
      pickText([
        "h1.sds-field__title",
        "h1.opp-title",
        "[data-opp-title]",
        "h1",
      ]) || document.title.replace(" | SAM.gov", "").trim();
    const agency = pickText([
      "[data-department]",
      ".department-name",
      ".sds-field[data-name='department'] .sds-field__value",
    ]);
    const solicitation = pickText([
      "[data-solicitation-number]",
      ".sds-field[data-name='solicitation-number'] .sds-field__value",
    ]);
    const description = pickText([
      ".description",
      "[data-description]",
      ".opp-description",
    ]);
    const naics = pickText([
      "[data-naics]",
      ".sds-field[data-name='naics-code'] .sds-field__value",
    ]);
    const deadline = pickText([
      "[data-response-deadline]",
      ".sds-field[data-name='response-deadline'] .sds-field__value",
    ]);
    return { title, url: window.location.href, agency, solicitation_number: solicitation, description, naics, deadline };
  };

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    toast("Saving…");
    try {
      const stored = await chrome.storage.sync.get(["apiKey", "apiBase"]);
      const apiKey = stored.apiKey;
      const apiBase = stored.apiBase || "https://app.contractsintel.com";
      if (!apiKey) {
        toast("Set API key in popup", "warn");
        chrome.runtime.openOptionsPage?.();
        return;
      }
      const payload = scrape();
      const res = await fetch(`${apiBase}/api/opportunities/quick-save`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast(j.error || `Error ${res.status}`, "error");
        return;
      }
      const j = await res.json();
      toast(j.duplicate ? "Already saved ✓" : "Saved ✓", "success");
    } catch (err) {
      toast("Failed — check console", "error");
      console.error("[ContractsIntel]", err);
    } finally {
      btn.disabled = false;
    }
  });
})();
