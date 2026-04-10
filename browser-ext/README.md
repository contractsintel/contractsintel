# ContractsIntel Browser Extension

A Manifest V3 Chrome / Edge extension that adds a **Save to ContractsIntel**
button to SAM.gov opportunity pages. One click scrapes the solicitation
metadata and pushes it into the user's ContractsIntel pipeline via the
public REST API.

## Install (development)

1. In the ContractsIntel dashboard go to **Settings → API keys**, click
   **Issue key**, name it (e.g. `sam.gov extension`), and copy the raw key
   that is shown once.
2. Open `chrome://extensions` (or `edge://extensions`).
3. Enable **Developer mode** and click **Load unpacked**.
4. Pick this `browser-ext/` directory.
5. Click the extension's toolbar icon. Paste your API key and, if you're
   running the app locally, replace the API base URL (default:
   `https://app.contractsintel.com`) with e.g. `http://localhost:3100`.
6. Visit any SAM.gov page under `https://sam.gov/opp/…`. A floating blue
   **Save to ContractsIntel** button appears in the lower-right corner.
7. Click it. The opportunity is upserted on the server (deduped by
   `sam_url`) and pinned to your pipeline at stage `identified`.

## Files

| File | Purpose |
|---|---|
| `manifest.json` | MV3 manifest. Declares host permissions for `sam.gov/*` and a content script on `/opp/*` pages. |
| `content.js` | Injects the floating button, scrapes the page, calls `POST /api/opportunities/quick-save` with `Authorization: Bearer <key>`. |
| `content.css` | Button styling (pinned bottom-right, blue pill). |
| `popup.html` / `popup.js` | Options popup for pasting the API key and base URL into `chrome.storage.sync`. |
| `background.js` | Stub service worker. |

## API contract

`POST /api/opportunities/quick-save`

Headers:

```
Authorization: Bearer ci_live_…
Content-Type: application/json
```

Body:

```json
{
  "title": "Cyber Vulnerability Assessment",
  "url": "https://sam.gov/opp/abcd",
  "agency": "CISA",
  "solicitation_number": "70RCSA24Q00000001",
  "description": "…",
  "naics": "541512",
  "deadline": "2026-05-30"
}
```

Response:

```json
{ "ok": true, "opportunity_id": "…", "duplicate": false }
```

The endpoint dedupes on `sam_url`. If the row already exists, `duplicate`
is `true` and the opportunity is still (re-)pinned to the user's pipeline.
