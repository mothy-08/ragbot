// Config
const API_BASE = "https://mothy-08-ragbot.hf.space";

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
};

// State
let currentUrl = "";

// --- Initialization ---

document.addEventListener("DOMContentLoaded", () => {
  updateContext();
});

chrome.tabs.onActivated.addListener(() => {
  updateContext();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.active) {
    updateContext();
  }
});

// --- Core Logic ---

async function updateContext() {
  try {
    const tab = await getCurrentTab();

    if (!tab.url || !tab.url.startsWith("http")) {
      currentUrl = "";
      els.domainBadge.textContent = "Restricted";
      showView("loading");
      document.querySelector("#loading-view p").textContent =
        "Please open a valid website.";
      return;
    }

    if (tab.url === currentUrl) return;

    currentUrl = tab.url;
    const urlObj = new URL(currentUrl);
    els.domainBadge.textContent = urlObj.hostname;

    // 1. Load History
    await loadChatHistory(currentUrl);

    // 2. Check Status
    await checkIndexStatus(currentUrl);
  } catch (err) {
    console.error(err);
    els.domainBadge.textContent = "Error";
  }
}

async function checkIndexStatus(url) {
  // CRITICAL FIX:
  // If we already have a conversation history, TRUST IT.
  // Don't show loading screens or re-check the backend.
  // This prevents the "Stuck on Loading" bug when switching tabs.
  const hasHistory = els.messages.childElementCount > 1;
  if (hasHistory) {
    showView("chat");
    return;
  }

  // Only show "Connecting..." if we are starting fresh
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
    showError("Backend Offline. Is the Space running?");
  }
}

async function startTraining() {
  els.trainBtn.disabled = true;
  els.trainStatus.classList.remove("hidden");

  // Update text to show we are working
  const statusText = els.trainStatus.querySelector("span").nextSibling;
  if (statusText) statusText.textContent = " Reading website...";

  try {
    // 1. Trigger Ingest
    const res = await fetch(`${API_BASE}/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: currentUrl }),
    });

    if (!res.ok) throw new Error("Ingest failed");

    // 2. POLL until ready (The "Wait" Logic)
    if (statusText) statusText.textContent = " Building brain...";

    const isReady = await pollForIndex(currentUrl);

    if (!isReady) {
      throw new Error("Training timed out. Try again.");
    }

    // 3. Success! Wipe old history and start fresh
    await clearHistory(false);

    showView("chat");
    addMessage("bot", "I've finished reading! You can ask me questions now.");
  } catch (err) {
    alert("Training failed: " + err.message);
  } finally {
    // Reset UI state
    els.trainBtn.disabled = false;
    els.trainStatus.classList.add("hidden");
    if (statusText) statusText.textContent = " Processing...";
  }
}

// Helper: Polls the backend every 2s to see if index is ready
async function pollForIndex(url) {
  const maxAttempts = 30; // Wait up to 60 seconds
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
        return true; // Success!
      }
    } catch (e) {
      console.log("Polling error, retrying...");
    }

    // Wait 2 seconds
    await new Promise((resolve) => setTimeout(resolve, 2000));
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
        message: text,
        url: currentUrl,
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

// --- Storage & History Logic ---

async function loadChatHistory(url) {
  els.messages.innerHTML = ""; // Clear current view

  const key = `chat_${url}`;
  const result = await chrome.storage.local.get(key);
  const history = result[key] || [];

  if (history.length === 0) {
    const text = "Hello! Ask me anything about this page.";
    const div = document.createElement("div");
    div.className = "msg bot";
    div.innerText = text;
    els.messages.appendChild(div);
    saveMessageToStorage(url, "bot", text);
  } else {
    history.forEach((msg) => {
      const div = document.createElement("div");
      div.className = `msg ${msg.type}`;
      div.innerText = msg.text;
      els.messages.appendChild(div);
    });
    scrollToBottom();
  }
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

  if (name === "chat") {
    els.deleteBtn.classList.remove("hidden");
  } else {
    els.deleteBtn.classList.add("hidden");
  }
}

function addMessage(type, text) {
  const div = document.createElement("div");
  div.className = `msg ${type}`;
  div.innerText = text;
  els.messages.appendChild(div);
  scrollToBottom();

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
els.input.addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendMessage();
});
