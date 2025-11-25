// Config
const API_BASE = "http://localhost:8000";

// DOM Elements
const views = {
  loading: document.getElementById("loading-view"),
  train: document.getElementById("train-view"),
  chat: document.getElementById("chat-view"),
};
const els = {
  domainBadge: document.getElementById("domain-badge"),
  trainBtn: document.getElementById("train-btn"),
  trainStatus: document.getElementById("train-status"),
  messages: document.getElementById("messages"),
  input: document.getElementById("user-input"),
  sendBtn: document.getElementById("send-btn"),
};

// State
let currentUrl = "";

// --- Initialization ---

// Side Panels stay open, so we need to listen for tab changes
document.addEventListener("DOMContentLoaded", () => {
  updateContext(); // Run once on load
});

// Listen for when user switches tabs
chrome.tabs.onActivated.addListener(() => {
  updateContext();
});

// Listen for when user navigates within a tab
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.active) {
    updateContext();
  }
});

// --- Core Logic ---

async function updateContext() {
  try {
    const tab = await getCurrentTab();

    // 1. Safety Check: If no URL or not a web page, stop here
    if (!tab.url || !tab.url.startsWith("http")) {
      currentUrl = "";
      els.domainBadge.textContent = "Restricted";
      showView("loading"); // Or a specific "error" view
      document.querySelector("#loading-view p").textContent =
        "Please open a valid website.";
      return;
    }

    // 2. Only reload if URL actually changed
    if (tab.url === currentUrl) return;

    currentUrl = tab.url;

    // 3. Update Badge
    const urlObj = new URL(currentUrl);
    els.domainBadge.textContent = urlObj.hostname;

    // 4. Reset UI & Check Backend
    els.messages.innerHTML =
      '<div class="msg bot">Hello! Ask me anything about this page.</div>';
    await checkIndexStatus(currentUrl);
  } catch (err) {
    console.error(err);
    els.domainBadge.textContent = "Error";
  }
}

async function checkIndexStatus(url) {
  showView("loading");
  document.querySelector("#loading-view p").textContent =
    "Connecting to Brain...";

  try {
    const res = await fetch(`${API_BASE}/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: url }),
    });

    const data = await res.json();

    if (data.exists) {
      showView("chat");
    } else {
      showView("train");
    }
  } catch (err) {
    showError("Backend Offline. Is server.py running?");
  }
}

async function startTraining() {
  els.trainBtn.disabled = true;
  els.trainStatus.classList.remove("hidden");

  try {
    const res = await fetch(`${API_BASE}/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: currentUrl }),
    });

    await res.json();

    // Fake delay for UX
    setTimeout(() => {
      showView("chat");
      addMessage(
        "bot",
        "I've started reading this site! You can ask me questions now.",
      );
    }, 2000);
  } catch (err) {
    els.trainBtn.disabled = false;
    els.trainStatus.classList.add("hidden");
    alert("Training failed: " + err.message);
  }
}

async function sendMessage() {
  const text = els.input.value.trim();
  if (!text) return;

  addMessage("user", text);
  els.input.value = "";
  els.input.disabled = true;
  els.sendBtn.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        url: currentUrl,
      }),
    });

    if (!res.ok) throw new Error("API Error");

    const data = await res.json();
    addMessage("bot", data.answer);
  } catch (err) {
    addMessage("error", "Failed to get response. Try again.");
  } finally {
    els.input.disabled = false;
    els.sendBtn.disabled = false;
    els.input.focus();
  }
}

// --- Utilities ---

function getCurrentTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      if (tabs && tabs[0]) resolve(tabs[0]);
      else resolve({}); // Return empty object instead of crashing
    });
  });
}

function showView(name) {
  Object.values(views).forEach((el) => el.classList.add("hidden"));
  views[name].classList.remove("hidden");
}

function addMessage(type, text) {
  const div = document.createElement("div");
  div.className = `msg ${type}`;
  div.innerText = text;
  els.messages.appendChild(div);
  els.messages.scrollTop = els.messages.scrollHeight;
}

function showError(msg) {
  // Overwrite main content for critical errors
  document.querySelector("main").innerHTML =
    `<div style="padding:20px; color:red; text-align:center;">${msg}</div>`;
}

// --- Event Listeners ---

els.trainBtn.addEventListener("click", startTraining);
els.sendBtn.addEventListener("click", sendMessage);
els.input.addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendMessage();
});
