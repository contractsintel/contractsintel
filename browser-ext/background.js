// Minimal service worker — the extension is stateless apart from
// chrome.storage.sync which the content script + popup read directly.
// Reserved for future features (context-menu item, badge counts).

chrome.runtime.onInstalled.addListener(() => {
  // no-op
});
