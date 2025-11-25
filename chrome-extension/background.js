// background.js

// Enables clicking the extension icon to toggle the side panel
// This is specific to Chrome 114+
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));
