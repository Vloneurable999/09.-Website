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
const CLIENT_COOLDOWN_MS = 3000;
const ARTIST_HANDLES = new Set(["@raveyn", "@itsraveyn"]);

let pollTimer = null;
let lastRenderedKey = "";
let isSending = false;
let lastSentAt = 0;
let lastSentText = "";
let cachedMember = null;
let chatInitialized = false;

/**
 * Checks if the logged-in member has Artist, Admin, or Mod privileges.
 */
function isStaffMember(member) {
  if (!member) return false;
  if (typeof config.getMemberBadges === "function") {
    const badges = config.getMemberBadges(
      member.memberId,
      member.badges,
      member.role,
      member.handle
    );
    return badges.some((b) => b.key === "artist" || b.key === "admin" || b.key === "mod");
  }
  return ARTIST_HANDLES.has(String(member.handle || "").toLowerCase());
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
  const canModerate = isStaffMember(member);
  const renderKey = JSON.stringify({
    me: member?.memberId || member?.handle || "",
    mod: canModerate,
    items: messages.map((m) => `${m.id}:${m.role || ""}:${(m.badges || []).join(",")}`),
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
      const badges =
        typeof config.getMemberBadges === "function"
          ? config.getMemberBadges(msg.memberId, msg.badges, msg.role, msg.handle)
          : [
              ARTIST_HANDLES.has(String(msg.handle || "").toLowerCase())
                ? {
                    key: "artist",
                    label: "ARTIST ✦",
                    badgeClass: "bg-pink-500/20 text-pink-200 border-pink-400/40",
                  }
                : {
                    key: "member",
                    label: "MEMBER",
                    badgeClass: "bg-white/[0.06] text-zinc-300 border-white/15",
                  },
            ];

      const safeHandle = escapeHtml(msg.handle);
      const safeId = escapeHtml(msg.memberId);
      const safeText = escapeHtml(msg.text);
      const timeLabel = formatTimestamp(msg.createdAt);

      const stackedBadgesHtml = badges
        .map(
          (b) =>
            `<span class="px-1.5 py-0.5 rounded-md text-[9px] font-mono uppercase tracking-wider border ${b.badgeClass}">${escapeHtml(b.label)}</span>`
        )
        .join("");

      const targetIsStaff = badges.some(
        (b) => b.key === "artist" || b.key === "admin" || b.key === "mod"
      );
      const modActionsHtml = canModerate
        ? `
          <span class="inline-flex items-center gap-1 ml-1">
            <button
              type="button"
              data-chat-delete="${escapeHtml(msg.id)}"
              class="px-1.5 py-0.5 rounded text-[9px] font-mono text-zinc-400 hover:text-rose-300 bg-white/[0.04] border border-white/10 hover:border-rose-400/40 cursor-pointer"
              title="Delete message"
            >Del</button>
            ${
              !isMine && !targetIsStaff && msg.memberId
                ? `<button
                    type="button"
                    data-chat-mute="${escapeHtml(msg.memberId)}"
                    data-chat-mute-handle="${safeHandle}"
                    class="px-1.5 py-0.5 rounded text-[9px] font-mono text-zinc-400 hover:text-amber-300 bg-white/[0.04] border border-white/10 hover:border-amber-400/40 cursor-pointer"
                    title="Mute user and clear their messages"
                  >Mute</button>`
                : ""
            }
          </span>
        `
        : "";

      return `
        <div class="flex flex-col ${isMine ? "items-end" : "items-start"}">
          <div class="flex items-center gap-1.5 mb-1 px-1 flex-wrap ${isMine ? "justify-end" : "justify-start"}">
            <span class="text-xs font-semibold ${isMine ? "text-fuchsia-200" : "text-zinc-200"}">${safeHandle}</span>
            ${stackedBadgesHtml}
            <span class="font-mono text-[10px] text-zinc-500">${safeId}</span>
            <span class="font-mono text-[10px] text-zinc-600">· ${timeLabel}</span>
            ${modActionsHtml}
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
    if (typeof data.totalMembers === "number") {
      window.__raveynsTotalMembers = data.totalMembers;
      window.dispatchEvent(
        new CustomEvent("raveyns:stats-updated", {
          detail: { totalMembers: data.totalMembers },
        })
      );
    }
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

  // Client-side instant spam & cooldown guard (staff bypass)
  if (!isStaffMember(member)) {
    const now = Date.now();
    if (now - lastSentAt < CLIENT_COOLDOWN_MS) {
      const waitSec = Math.ceil((CLIENT_COOLDOWN_MS - (now - lastSentAt)) / 1000);
      setChatError(`Slow down! Wait ${waitSec}s before sending another message.`);
      return;
    }
    if (text.toLowerCase() === lastSentText && now - lastSentAt < 60 * 1000) {
      setChatError("Duplicate message blocked. Say something new!");
      return;
    }
    if (/(https?:\/\/|www\.|[a-z0-9-]+\.(com|net|org|io|gg|xyz|co|me|tk|link|click)\b)/i.test(text)) {
      setChatError("External links are blocked in Club Chat to keep members safe.");
      return;
    }
    if (/(.)\1{11,}/u.test(text)) {
      setChatError("Please avoid spamming repeated characters.");
      return;
    }
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
    lastSentAt = Date.now();
    lastSentText = text.toLowerCase();
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
 * Handles staff moderation clicks (Delete message or Mute spammer).
 */
async function handleModAction(action, payload) {
  const member = getCurrentMember();
  if (!member || !isStaffMember(member)) return;

  try {
    const response = await fetch(CHAT_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        memberId: member.memberId || "",
        email: member.email || "",
        ...payload,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Moderation action failed.");
    }

    if (action === "delete") {
      showToast("Message removed.");
    } else if (action === "mute") {
      showToast(
        data.chatBanned
          ? `Muted ${payload.handle || payload.targetMemberId} and cleared spam.`
          : `Unmuted ${payload.handle || payload.targetMemberId}.`
      );
    }

    lastRenderedKey = "";
    await fetchMessages({ silent: true, forceScroll: false });
  } catch (err) {
    showToast(err.message || "Could not complete action.");
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

  // Staff moderation click delegation (Delete / Mute)
  document.getElementById("chatMessages")?.addEventListener("click", (e) => {
    const delBtn = e.target.closest("[data-chat-delete]");
    if (delBtn) {
      const messageId = delBtn.getAttribute("data-chat-delete");
      if (messageId) handleModAction("delete", { messageId });
      return;
    }

    const muteBtn = e.target.closest("[data-chat-mute]");
    if (muteBtn) {
      const targetMemberId = muteBtn.getAttribute("data-chat-mute");
      const handle = muteBtn.getAttribute("data-chat-mute-handle") || "";
      if (targetMemberId) handleModAction("mute", { targetMemberId, handle });
    }
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