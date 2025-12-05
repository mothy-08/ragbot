// Config
const API_BASE = "https://mothy-08-ragbot.hf.space";
// const API_BASE = "http://127.0.0.1:8000";

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
  deleteBtn: document.getElementById("delete-btn"),
  retrainBtn: document.getElementById("retrain-btn"), // <--- NEW
};

// State
let currentUrl = "";
let isTraining = false;

// --- Initialization ---

document.addEventListener("DOMContentLoaded", () => updateContext());
chrome.tabs.onActivated.addListener(() => updateContext());
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.active) updateContext();
});

// --- Core Logic ---

async function updateContext() {
  if (isTraining) return;

  try {
    const tab = await getCurrentTab();

    // 1. Basic Validation
    if (!tab.url || !tab.url.startsWith("http")) {
      currentUrl = "";
      els.domainBadge.textContent = "Restricted";
      showView("loading");
      document.querySelector("#loading-view p").textContent =
        "Please open a valid website.";
      return;
    }

    const urlObj = new URL(tab.url);
    const origin = urlObj.origin;

    if (origin === currentUrl) return;

    currentUrl = origin;
    els.domainBadge.textContent = urlObj.hostname;

    await loadChatHistory(currentUrl);
    await checkIndexStatus(currentUrl);
  } catch (err) {
    console.error(err);
    els.domainBadge.textContent = "Error";
  }
}

async function checkIndexStatus(url) {
  const hasHistory = els.messages.childElementCount > 1;
  if (hasHistory) {
    showView("chat");
    return;
  }

  // Show "Connecting..." only if we are truly changing domains
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
      els.trainBtn.classList.remove("hidden");
      els.trainStatus.classList.add("hidden");

      showView("train");
    }
  } catch (err) {
    showError("Backend Offline. Is the Space running?");
  }
}

async function startTraining() {
  isTraining = true;
  els.trainBtn.classList.add("hidden");
  els.trainStatus.classList.remove("hidden");

  const statusText = els.trainStatus.querySelector("span").nextSibling;
  if (statusText) statusText.textContent = " Reading website...";

  try {
    const res = await fetch(`${API_BASE}/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: currentUrl }),
    });

    if (!res.ok) throw new Error("Ingest failed");

    if (statusText)
      statusText.textContent = " Building brain (this may take a few mins)...";

    // Wait up to 5 mins
    const isReady = await pollForIndex(currentUrl);

    if (!isReady) {
      throw new Error("Training timed out. Try refreshing the page.");
    }

    // Success: Clear old history so we start fresh
    await clearHistory(false);

    showView("chat");
    addMessage("bot", "I've finished reading! You can ask me questions now.");
  } catch (err) {
    alert("Training failed: " + err.message);
    // Reset UI
    els.trainBtn.classList.remove("hidden");
    els.trainStatus.classList.add("hidden");
  } finally {
    isTraining = false;
  }
}

// --- NEW FUNCTION: Manual Retrain Trigger ---
async function handleRetrain() {
  const confirmAction = confirm(
    "Are you sure? This will wipe the brain for this website and start over.",
  );
  if (!confirmAction) return;

  // 1. Show loading state
  els.retrainBtn.classList.add("hidden");

  try {
    // 2. Call the Nuke Endpoint (The Wiring!)
    const res = await fetch(`${API_BASE}/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: currentUrl }),
    });

    if (!res.ok) throw new Error("Failed to reset brain");

    // 3. Wipe local history
    await clearHistory(false);

    // 4. Force UI to Train View
    showView("train");
  } catch (err) {
    alert("Error resetting: " + err.message);
    els.retrainBtn.classList.remove("hidden");
  }
}

async function pollForIndex(url) {
  const maxAttempts = 100; // 5 mins
  let attempts = 0;

  while (attempts < maxAttempts) {
    try {
      const res = await fetch(`${API_BASE}/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url }),
      });
      const data = await res.json();
      if (data.exists && data.vector_count > 0) {
        return true;
      }
    } catch (e) {
      console.log("Polling error...");
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
    attempts++;
  }
  return false;
}

async function sendMessage() {
  const text = els.input.value.trim();
  if (!text) return;

  addMessage("user", text);

  els.input.value = "";
  els.input.disabled = true;
  els.sendBtn.disabled = true;

  const loadingBubble = addLoadingBubble();

  try {
    const res = await fetch(`${API_BASE}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: currentUrl,
        message: text,
      }),
    });

    if (!res.ok) throw new Error("API Error");

    const data = await res.json();

    loadingBubble.remove();
    addMessage("bot", data.answer);
  } catch (err) {
    loadingBubble.remove();
    addMessage("error", "Failed to get response. Try again.");
  } finally {
    els.input.disabled = false;
    els.sendBtn.disabled = false;
    els.input.focus();
  }
}

async function loadChatHistory(url) {
  els.messages.innerHTML = ""; // Clear current view

  const key = `chat_${url}`;
  const result = await chrome.storage.local.get(key);
  const history = result[key] || [];

  if (history.length === 0) {
    const text = "Hello! Ask me anything about this page.";
    addMessageUI("bot", text);
    saveMessageToStorage(url, "bot", text);
  } else {
    history.forEach((msg) => {
      addMessageUI(msg.type, msg.text);
    });
    scrollToBottom();
  }
}

function addMessageUI(type, text) {
  const div = document.createElement("div");
  div.className = `msg ${type}`;
  div.innerText = text;
  els.messages.appendChild(div);
  scrollToBottom();
}

async function saveMessageToStorage(url, type, text) {
  if (type === "error") return;

  const key = `chat_${url}`;
  const result = await chrome.storage.local.get(key);
  const history = result[key] || [];

  history.push({ type, text, timestamp: Date.now() });

  if (history.length > 50) history.shift();

  await chrome.storage.local.set({ [key]: history });
}

async function clearHistory(reloadDefault = true) {
  if (!currentUrl) return;
  const key = `chat_${currentUrl}`;

  await chrome.storage.local.remove(key);
  els.messages.innerHTML = "";

  if (reloadDefault) {
    await loadChatHistory(currentUrl);
  }
}

// --- Utilities ---

function getCurrentTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      if (tabs && tabs[0]) resolve(tabs[0]);
      else resolve({});
    });
  });
}

function showView(name) {
  Object.values(views).forEach((el) => el.classList.add("hidden"));
  views[name].classList.remove("hidden");

  // Show/Hide Header Buttons based on View
  if (name === "chat") {
    els.deleteBtn.classList.remove("hidden");
    els.retrainBtn.classList.remove("hidden"); // Show Retrain
  } else {
    els.deleteBtn.classList.add("hidden");
    els.retrainBtn.classList.add("hidden"); // Hide Retrain
  }
}

function addMessage(type, text) {
  addMessageUI(type, text);
  saveMessageToStorage(currentUrl, type, text);
}

function addLoadingBubble() {
  const div = document.createElement("div");
  div.className = "msg bot loading";
  div.innerHTML = `
    <div class="dot"></div>
    <div class="dot"></div>
    <div class="dot"></div>
  `;
  els.messages.appendChild(div);
  scrollToBottom();
  return div;
}

function scrollToBottom() {
  els.messages.scrollTo({
    top: els.messages.scrollHeight,
    behavior: "smooth",
  });
}

function showError(msg) {
  document.querySelector("main").innerHTML = `
    <div class="view">
      <div class="error" style="max-width: 80%">${msg}</div>
    </div>
  `;
}

// --- Event Listeners ---

els.trainBtn.addEventListener("click", startTraining);
els.sendBtn.addEventListener("click", sendMessage);
els.deleteBtn.addEventListener("click", () => clearHistory(true));
els.retrainBtn.addEventListener("click", handleRetrain); // <--- NEW LISTENER
els.input.addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendMessage();
});
