/**
 * ============================================================================
 * js/chat.js — CLUB CHAT MODULE
 * Loads, polls, renders, and submits messages to /api/chat (MongoDB Atlas).
 * Syncs live with member login/signup state via localStorage & custom events.
 * ============================================================================
 */
import * as config from "./config.js";
import { showToast } from "./ui.js";

const CHAT_API_URL = config.CHAT_API_URL || "/api/chat";
const STORAGE_KEY = "raveyns_club_member";
const POLL_INTERVAL_MS = 4500;
const ARTIST_HANDLES = new Set(["@raveyn", "@itsraveyn"]);

let pollTimer = null;
let lastRenderedKey = "";
let isSending = false;
let cachedMember = null;
let chatInitialized = false;

/**
 * Safely escapes HTML entities to prevent XSS in chat messages.
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Reads the currently signed-in member pass from memory or localStorage.
 * Matches signup.js validation (handle + email or memberId) so an already
 * logged-in viewer is never asked to log in again.
 */
function getCurrentMember() {
  if (cachedMember && cachedMember.handle && (cachedMember.memberId || cachedMember.email)) {
    return cachedMember;
  }

  const shared = window.__raveynsCurrentMember;
  if (shared && shared.handle && (shared.memberId || shared.email)) {
    cachedMember = shared;
    return cachedMember;
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !parsed.handle || (!parsed.memberId && !parsed.email)) {
      return null;
    }
    cachedMember = parsed;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Formats an ISO timestamp into a clean relative or short time string.
 */
function formatTimestamp(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "";

  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 15) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Displays or clears an inline error banner inside the chat card.
 */
function setChatError(message = "") {
  const errorBox = document.getElementById("chatError");
  if (!errorBox) return;

  if (message) {
    errorBox.textContent = message;
    errorBox.classList.remove("hidden");
  } else {
    errorBox.textContent = "";
    errorBox.classList.add("hidden");
  }
}

/**
 * Toggles between the active message composer and the logged-out prompt.
 */
function syncChatAuthUI(explicitMember) {
  if (explicitMember !== undefined) {
    cachedMember = explicitMember || null;
  }

  const member = getCurrentMember();
  const form = document.getElementById("chatForm");
  const lockedPrompt = document.getElementById("chatLockedPrompt");
  const activeUserLabel = document.getElementById("chatActiveUser");

  if (member) {
    form?.classList.remove("hidden");
    lockedPrompt?.classList.add("hidden");
    if (activeUserLabel) {
      const idSuffix = member.memberId ? ` (${member.memberId})` : "";
      activeUserLabel.textContent = `Posting as ${member.handle}${idSuffix}`;
    }
  } else {
    form?.classList.add("hidden");
    lockedPrompt?.classList.remove("hidden");
  }
}

/**
 * Renders the list of chat messages inside #chatMessages.
 */
function renderMessages(messages, forceScroll = false) {
  const container = document.getElementById("chatMessages");
  if (!container) return;

  const member = getCurrentMember();
  const renderKey = JSON.stringify({
    me: member?.memberId || member?.handle || "",
    ids: messages.map((m) => m.id),
  });

  if (!forceScroll && renderKey === lastRenderedKey) return;
  lastRenderedKey = renderKey;

  // Check if user is currently scrolled near the bottom before updating
  const isNearBottom =
    container.scrollHeight - container.scrollTop - container.clientHeight < 80;

  if (!messages.length) {
    container.innerHTML = `
      <div class="h-full flex flex-col items-center justify-center text-center py-10 px-4">
        <span class="text-2xl mb-2 text-fuchsia-400/80">✦</span>
        <p class="text-sm font-medium text-zinc-300">No messages yet</p>
        <p class="text-xs text-zinc-500 mt-1">Be the first member to drop a message in raveyn's club.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = messages
    .map((msg) => {
      const isMine =
        member &&
        ((member.memberId && msg.memberId === member.memberId) ||
          String(msg.handle || "").toLowerCase() === String(member.handle || "").toLowerCase());
      const isArtist = ARTIST_HANDLES.has(String(msg.handle || "").toLowerCase());
      const safeHandle = escapeHtml(msg.handle);
      const safeId = escapeHtml(msg.memberId);
      const safeText = escapeHtml(msg.text);
      const timeLabel = formatTimestamp(msg.createdAt);

      const artistBadge = isArtist
        ? `<span class="px-1.5 py-0.5 rounded-md text-[9px] font-mono uppercase tracking-wider bg-pink-500/20 text-pink-200 border border-pink-400/40">ARTIST ✦</span>`
        : "";

      return `
        <div class="flex flex-col ${isMine ? "items-end" : "items-start"}">
          <div class="flex items-center gap-1.5 mb-1 px-1 flex-wrap ${isMine ? "justify-end" : "justify-start"}">
            <span class="text-xs font-semibold ${isMine ? "text-fuchsia-200" : "text-zinc-200"}">${safeHandle}</span>
            ${artistBadge}
            <span class="font-mono text-[10px] text-zinc-500">${safeId}</span>
            <span class="font-mono text-[10px] text-zinc-600">· ${timeLabel}</span>
          </div>
          <div class="max-w-[85%] sm:max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed break-words whitespace-pre-wrap ${
            isMine
              ? "bg-gradient-to-r from-purple-600/85 via-fuchsia-600/85 to-pink-600/85 text-white border border-fuchsia-400/40 rounded-br-md shadow-neon-purple"
              : "bg-white/[0.05] text-zinc-100 border border-white/10 rounded-bl-md"
          }">${safeText}</div>
        </div>
      `;
    })
    .join("");

  if (forceScroll || isNearBottom) {
    container.scrollTop = container.scrollHeight;
  }
}

/**
 * Fetches latest messages from /api/chat.
 */
async function fetchMessages({ silent = false, forceScroll = false } = {}) {
  const container = document.getElementById("chatMessages");
  if (!container) return;

  try {
    const response = await fetch(CHAT_API_URL, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    const rawText = await response.text();
    let data = {};
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      if (!silent) console.error("Non-JSON response from /api/chat:", response.status);
    }

    if (!response.ok) {
      const fallbackMsg =
        response.status === 404
          ? "Chat API (/api/chat) not found. Make sure api/chat.js is pushed and deployed on Vercel."
          : `Unable to load chat (Error ${response.status}).`;
      throw new Error(data.error || fallbackMsg);
    }

    setChatError("");
    renderMessages(Array.isArray(data.messages) ? data.messages : [], forceScroll);
  } catch (error) {
    if (!silent) {
      const msg = error.message || "Could not connect to club chat.";
      setChatError(msg);
      if (!lastRenderedKey) {
        container.innerHTML = `
          <div class="h-full flex flex-col items-center justify-center text-center py-10 px-4">
            <p class="text-xs font-mono text-rose-300">Unable to load club chat.</p>
          </div>
        `;
      }
    }
  }
}

/**
 * Handles submitting a new message to /api/chat.
 */
async function handleChatSubmit(event) {
  event.preventDefault();
  if (isSending) return;

  const member = getCurrentMember();
  if (!member) {
    syncChatAuthUI();
    setChatError("Please log in to send messages.");
    return;
  }

  const input = document.getElementById("chatInput");
  const sendBtn = document.getElementById("chatSendBtn");
  const charCount = document.getElementById("chatCharCount");
  if (!input) return;

  const text = input.value.trim();
  if (!text) return;

  if (text.length > 400) {
    setChatError("Messages must be 400 characters or less.");
    return;
  }

  setChatError("");
  isSending = true;

  const originalBtnText = sendBtn ? sendBtn.textContent : "Send";
  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.textContent = "Sending...";
  }

  try {
    const response = await fetch(CHAT_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        memberId: member.memberId || "",
        handle: member.handle,
        email: member.email || "",
        text,
      }),
    });

    const rawText = await response.text();
    let data = {};
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      console.error("Non-JSON response from POST /api/chat:", response.status);
    }

    if (!response.ok) {
      const fallbackMsg =
        response.status === 404
          ? "Chat API (/api/chat) not found. Make sure api/chat.js is pushed and deployed on Vercel."
          : `Could not send message (Error ${response.status}).`;
      throw new Error(data.error || fallbackMsg);
    }

    input.value = "";
    if (charCount) charCount.textContent = "0 / 400";
    await fetchMessages({ silent: true, forceScroll: true });
  } catch (error) {
    setChatError(error.message || "Failed to send message.");
  } finally {
    isSending = false;
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.textContent = originalBtnText;
    }
  }
}

/**
 * Starts background polling while the tab is visible.
 */
function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    if (document.visibilityState === "visible") {
      fetchMessages({ silent: true, forceScroll: false });
    }
  }, POLL_INTERVAL_MS);
}

/**
 * Initializes the Club Chat UI, listeners, and live polling.
 */
export function initChat() {
  if (chatInitialized) return;

  const chatSection = document.getElementById("chat");
  if (!chatSection) return;

  chatInitialized = true;
  window.__raveynsChatReady = true;
  syncChatAuthUI();
  fetchMessages({ silent: false, forceScroll: true });
  startPolling();

  // Form submission
  const chatForm = document.getElementById("chatForm");
  chatForm?.addEventListener("submit", handleChatSubmit);

  // Live character counter
  const chatInput = document.getElementById("chatInput");
  const charCount = document.getElementById("chatCharCount");
  chatInput?.addEventListener("input", () => {
    if (charCount) {
      charCount.textContent = `${chatInput.value.length} / 400`;
    }
  });

  // Manual refresh button
  const refreshBtn = document.getElementById("chatRefreshBtn");
  refreshBtn?.addEventListener("click", async () => {
    await fetchMessages({ silent: false, forceScroll: true });
    showToast("Club chat refreshed!");
  });

  // Locked prompt buttons -> route to #login or #signup
  document.getElementById("chatLoginBtn")?.addEventListener("click", () => {
    window.location.hash = "#login";
  });
  document.getElementById("chatSignupBtn")?.addEventListener("click", () => {
    window.location.hash = "#signup";
  });

  // Re-sync chat UI whenever the user logs in, signs up, or signs out
  window.addEventListener("raveyns:auth-changed", (event) => {
    syncChatAuthUI(event.detail?.member ?? null);
    lastRenderedKey = "";
    fetchMessages({ silent: true, forceScroll: false });
  });

  // Also sync automatically if the user logs in/out in another browser tab
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) {
      cachedMember = null;
      syncChatAuthUI();
      lastRenderedKey = "";
      fetchMessages({ silent: true, forceScroll: false });
    }
  });
}

// Auto-boot Club Chat when loaded directly via <script type="module" src="./js/chat.js">
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initChat);
} else {
  initChat();
}