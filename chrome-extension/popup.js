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

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const tab = await getCurrentTab();
    currentUrl = tab.url;

    // Update Badge with Domain
    const urlObj = new URL(currentUrl);
    els.domainBadge.textContent = urlObj.hostname;

    // Check Backend
    await checkIndexStatus(currentUrl);
  } catch (err) {
    showError("Error: " + err.message);
  }
});

// --- Core Logic ---

async function checkIndexStatus(url) {
  showView("loading");

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

    const data = await res.json();

    // Since ingestion is background, we wait a bit then switch to chat
    // In a real app, we would poll status. Here we fake a 2s delay.
    setTimeout(() => {
      showView("chat");
      addMessage(
        "bot",
        "I've started reading this site! You can ask me questions now. (Note: It might take a minute to finish reading everything).",
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

  // UI Updates
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
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) resolve(tabs[0]);
      else reject(new Error("No active tab"));
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
  div.innerText = text; // Safe text insertion
  els.messages.appendChild(div);
  els.messages.scrollTop = els.messages.scrollHeight;
}

function showError(msg) {
  document.body.innerHTML = `<div style="padding:20px; color:red; text-align:center;">${msg}</div>`;
}

// --- Event Listeners ---

els.trainBtn.addEventListener("click", startTraining);

els.sendBtn.addEventListener("click", sendMessage);

els.input.addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendMessage();
});
