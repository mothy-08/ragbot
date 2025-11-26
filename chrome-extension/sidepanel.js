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

    // 2. IMMEDIATE UI SWITCH:
    // If we have more than 1 message (meaning real conversation + default hello),
    // force the view to Chat immediately. Don't wait for the backend.
    if (els.messages.childElementCount > 1) {
      showView("chat");
    }

    // 3. Check Backend (Verification)
    await checkIndexStatus(currentUrl);
  } catch (err) {
    console.error(err);
    els.domainBadge.textContent = "Error";
  }
}

async function checkIndexStatus(url) {
  // Check if we are ALREADY looking at a chat history
  const hasHistory = els.messages.childElementCount > 1;

  // Only show "Connecting..." if we don't have a history to look at
  if (!hasHistory) {
    showView("loading");
    document.querySelector("#loading-view p").textContent =
      "Connecting to Brain...";
  }

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
      // Only switch to Train view if we really don't have history
      // (Prevents weird edge cases where index is rebuilding but we have local chat)
      if (!hasHistory) {
        showView("train");
      }
    }
  } catch (err) {
    if (!hasHistory) {
      showError("Backend Offline. Is the Space running?");
    }
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

    // UX: Clear the "Hello" message so we don't have double messages
    await clearHistory(false);

    setTimeout(() => {
      showView("chat");
      addMessage(
        "bot",
        "I've started reading this site! You can ask me questions now.",
      );
    }, 1500);
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
