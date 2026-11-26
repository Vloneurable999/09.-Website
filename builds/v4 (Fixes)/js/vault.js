/**
 * ============================================================================
 * js/vault.js — MEMBERS-ONLY VAULT & ARTIST STUDIO UPLOADER
 * - Artist-only upload panel (demos, snippets, teasers as video files)
 * - Chunked uploads to stay safely under Vercel's 4.5 MB request limit
 * - Members-only video feed with category filters & toggleable emoji reactions
 * ============================================================================
 */
import * as config from "./config.js";
import { showToast } from "./ui.js";

const VAULT_API_URL = config.VAULT_API_URL || "/api/vault";
const STORAGE_KEY = "raveyns_club_member";
const CHUNK_SIZE_BYTES = 1536 * 1024; // 1.5 MB raw -> ~2 MB base64 per chunk
const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50 MB max
const EMOJI_LIST = ["🔥", "💜", "🤯", "😭", "✨", "🔁"];

const CATEGORY_STYLES = {
  demo: {
    label: "DEMO",
    badgeClass: "bg-purple-500/20 text-purple-200 border-purple-400/40",
  },
  snippet: {
    label: "SNIPPET",
    badgeClass: "bg-fuchsia-500/20 text-fuchsia-200 border-fuchsia-400/40",
  },
  teaser: {
    label: "TEASER",
    badgeClass: "bg-pink-500/20 text-pink-200 border-pink-400/40",
  },
};

let vaultInitialized = false;
let cachedMember = null;
let vaultItems = [];
let activeCategory = "all";
let isUploading = false;
let pendingDeleteId = null;

/**
 * Safely escapes HTML entities.
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
 * Reads the currently signed-in member from shared state or localStorage.
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
 * Determines whether the current member is raveyn (artist/admin) and allowed
 * to see the private Studio Upload Panel.
 */
function isArtistUser(member) {
  if (!member) return false;
  if (typeof config.getMemberBadges === "function") {
    const badges = config.getMemberBadges(
      member.memberId,
      member.badges,
      member.role,
      member.handle
    );
    return badges.some((b) => b.key === "artist" || b.key === "admin");
  }
  const lowerHandle = String(member.handle || "").trim().toLowerCase();
  return (
    String(member.memberId || "").trim().toUpperCase() === "#RV-0001" ||
    lowerHandle === "@raveyn" ||
    lowerHandle === "@itsraveyn"
  );
}

/**
 * Formats byte count into a readable MB string.
 */
function formatFileSize(bytes) {
  if (!bytes) return "";
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

/**
 * Formats a timestamp into a clean short date.
 */
function formatDate(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Converts a Blob chunk into a raw base64 string.
 */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => reject(new Error("Failed to read video file chunk."));
    reader.readAsDataURL(blob);
  });
}

/**
 * Shows or clears an inline error banner inside the Vault section.
 */
function setVaultError(message = "") {
  const box = document.getElementById("vaultError");
  if (!box) return;
  if (message) {
    box.textContent = message;
    box.classList.remove("hidden");
  } else {
    box.textContent = "";
    box.classList.add("hidden");
  }
}

/**
 * Shows or clears an inline error inside the Artist Upload Panel.
 */
function setUploadError(message = "") {
  const box = document.getElementById("vaultUploadError");
  if (!box) return;
  if (message) {
    box.textContent = message;
    box.classList.remove("hidden");
  } else {
    box.textContent = "";
    box.classList.add("hidden");
  }
}

/**
 * Toggles the Locked View, Members Vault View, and Artist-Only Studio Panel.
 */
function syncVaultAuthUI(explicitMember) {
  if (explicitMember !== undefined) {
    cachedMember = explicitMember || null;
  }

  const member = getCurrentMember();
  const lockedCard = document.getElementById("vaultLockedCard");
  const unlockedView = document.getElementById("vaultUnlockedView");
  const artistPanel = document.getElementById("artistStudioPanel");

  if (member) {
    lockedCard?.classList.add("hidden");
    unlockedView?.classList.remove("hidden");

    if (isArtistUser(member)) {
      artistPanel?.classList.remove("hidden");
    } else {
      artistPanel?.classList.add("hidden");
    }
  } else {
    lockedCard?.classList.remove("hidden");
    unlockedView?.classList.add("hidden");
    artistPanel?.classList.add("hidden");
  }
}

/**
 * Updates active styling on the Vault category filter pills.
 */
function updateFilterButtons() {
  document.querySelectorAll("[data-vault-filter]").forEach((btn) => {
    const isSelected = btn.getAttribute("data-vault-filter") === activeCategory;
    if (isSelected) {
      btn.classList.add("bg-fuchsia-500/25", "text-white", "border-fuchsia-400/50");
      btn.classList.remove("bg-white/[0.03]", "text-zinc-400", "border-white/10");
    } else {
      btn.classList.remove("bg-fuchsia-500/25", "text-white", "border-fuchsia-400/50");
      btn.classList.add("bg-white/[0.03]", "text-zinc-400", "border-white/10");
    }
  });
}

/**
 * Builds the authenticated video stream URL for a vault item.
 */
function buildStreamUrl(vaultId, member) {
  const params = new URLSearchParams({
    stream: vaultId,
    memberId: member.memberId || "",
    email: member.email || "",
  });
  return `${VAULT_API_URL}?${params.toString()}`;
}

/**
 * Generates the inner HTML for an item's emoji reaction bar.
 */
function buildReactionsHtml(item) {
  return EMOJI_LIST.map((emoji) => {
    const info = item.reactions?.[emoji] || { count: 0, reacted: false };
    const activeStyle = info.reacted
      ? "bg-fuchsia-500/25 border-fuchsia-400/60 text-white shadow-neon-purple"
      : "bg-white/[0.04] border-white/10 text-zinc-300 hover:bg-white/[0.09] hover:border-fuchsia-400/35";
    return `
      <button
        type="button"
        data-react-id="${item.id}"
        data-react-emoji="${emoji}"
        class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-mono border active:scale-95 transition-all cursor-pointer ${activeStyle}"
        aria-label="React with ${emoji}"
      >
        <span>${emoji}</span>
        <span class="${info.count > 0 ? "text-zinc-100" : "text-zinc-500"}">${info.count}</span>
      </button>
    `;
  }).join("");
}

/**
 * Updates only the reaction buttons on a single card so the <video> element
 * is never re-rendered, paused, or reloaded when reacting.
 */
function updateCardReactionsInPlace(updatedItem) {
  const bar = document.querySelector(`[data-reactions-bar="${updatedItem.id}"]`);
  if (bar) {
    bar.innerHTML = buildReactionsHtml(updatedItem);
  } else {
    renderVaultItems();
  }
}

/**
 * Renders the list of vault video cards and their emoji reaction bars.
 */
function renderVaultItems() {
  const grid = document.getElementById("vaultGrid");
  if (!grid) return;

  const member = getCurrentMember();
  if (!member) {
    grid.innerHTML = "";
    return;
  }

  const canManage = isArtistUser(member);
  const filtered =
    activeCategory === "all"
      ? vaultItems
      : vaultItems.filter((item) => item.category === activeCategory);

  if (!filtered.length) {
    grid.innerHTML = `
      <div class="col-span-full rounded-3xl bg-white/[0.02] border border-white/10 py-12 px-6 text-center">
        <span class="text-2xl text-fuchsia-400/80">✦</span>
        <p class="mt-2 text-sm font-medium text-zinc-200">
          ${activeCategory === "all" ? "The archive is quiet right now" : `No ${activeCategory}s uploaded yet`}
        </p>
        <p class="mt-1 text-xs text-zinc-500">
          ${canManage ? "Use your Artist Studio panel above to drop a new demo, snippet, or teaser." : "Check back soon for unreleased demos, snippets, and teasers from raveyn."}
        </p>
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered
    .map((item) => {
      const cat = CATEGORY_STYLES[item.category] || CATEGORY_STYLES.demo;
      const streamUrl = buildStreamUrl(item.id, member);
      const safeTitle = escapeHtml(item.title);
      const safeCaption = escapeHtml(item.caption);
      const dateLabel = formatDate(item.createdAt);
      const sizeLabel = formatFileSize(item.fileSize);
      const isConfirmingDelete = pendingDeleteId === item.id;
      const reactionsHtml = buildReactionsHtml(item);

      const deleteBtnHtml = canManage
        ? `
          <button
            type="button"
            data-delete-vault="${item.id}"
            class="px-2.5 py-1 rounded-lg text-[10px] font-mono border transition-colors cursor-pointer ${
              isConfirmingDelete
                ? "bg-rose-500/30 border-rose-400/70 text-rose-100"
                : "bg-white/[0.03] border-white/10 text-zinc-400 hover:text-rose-300 hover:border-rose-400/40"
            }"
          >
            ${isConfirmingDelete ? "Confirm Delete?" : "Delete"}
          </button>
        `
        : "";

      return `
        <article class="relative overflow-hidden rounded-3xl bg-white/[0.03] backdrop-blur-xl border border-white/10 hover:border-fuchsia-400/35 transition-colors flex flex-col">
          <div class="p-4 pb-3 flex items-start justify-between gap-2">
            <div class="min-w-0">
              <div class="flex items-center gap-2 flex-wrap mb-1.5">
                <span class="px-2 py-0.5 rounded-md text-[10px] font-mono uppercase tracking-wider border ${cat.badgeClass}">${cat.label}</span>
                <span class="font-mono text-[10px] text-zinc-500">${dateLabel}${sizeLabel ? ` · ${sizeLabel}` : ""}</span>
              </div>
              <h3 class="text-base font-bold text-white truncate">${safeTitle}</h3>
              ${safeCaption ? `<p class="mt-1 text-xs text-zinc-400 leading-relaxed">${safeCaption}</p>` : ""}
            </div>
            ${deleteBtnHtml}
          </div>

          <!-- Video Player -->
          <div class="px-4">
            <div class="rounded-2xl overflow-hidden bg-black/80 border border-white/10">
              <video
                controls
                playsinline
                preload="metadata"
                class="w-full max-h-80 object-contain bg-black"
                src="${streamUrl}"
              ></video>
            </div>
          </div>

          <!-- Emoji Reactions Bar -->
          <div data-reactions-bar="${item.id}" class="p-4 pt-3 flex items-center flex-wrap gap-1.5">
            ${reactionsHtml}
          </div>
        </article>
      `;
    })
    .join("");
}

/**
 * Fetches all vault items from /api/vault for the logged-in member.
 */
async function fetchVaultItems() {
  const member = getCurrentMember();
  const grid = document.getElementById("vaultGrid");
  if (!member || !grid) return;

  setVaultError("");
  try {
    const params = new URLSearchParams({
      memberId: member.memberId || "",
      email: member.email || "",
    });
    const response = await fetch(`${VAULT_API_URL}?${params.toString()}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    const rawText = await response.text();
    let data = {};
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      console.error("Non-JSON response from /api/vault:", response.status);
    }

    if (!response.ok) {
      const fallbackMsg =
        response.status === 404
          ? "Archive API (/api/vault) not found. Make sure api/vault.js is pushed and deployed on Vercel."
          : `Unable to load Club Archive (Error ${response.status}).`;
      const errDetail = typeof data.error === "string" ? data.error : fallbackMsg;
      throw new Error(errDetail);
    }

    vaultItems = Array.isArray(data.items) ? data.items : [];
    renderVaultItems();
  } catch (err) {
    const errorMsg = typeof err.message === "string" ? err.message : "Could not load Club Archive.";
    setVaultError(errorMsg);
    grid.innerHTML = `
      <div class="col-span-full py-10 text-center text-xs font-mono text-rose-300">
        ${escapeHtml(errorMsg)}
      </div>
    `;
  }
}

/**
 * Handles toggling an emoji reaction on a vault item.
 */
async function handleReactionClick(vaultId, emoji) {
  const member = getCurrentMember();
  if (!member) return;

  try {
    const response = await fetch(VAULT_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "react",
        memberId: member.memberId || "",
        email: member.email || "",
        vaultId,
        emoji,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Could not update reaction.");
    }

    if (data.item) {
      vaultItems = vaultItems.map((it) => (it.id === data.item.id ? data.item : it));
      updateCardReactionsInPlace(data.item);
    }
  } catch (err) {
    showToast(err.message || "Could not save reaction.");
  }
}

/**
 * Handles deleting a vault video (artist only, with two-click inline confirmation).
 */
async function handleDeleteClick(vaultId) {
  if (pendingDeleteId !== vaultId) {
    pendingDeleteId = vaultId;
    renderVaultItems();
    return;
  }

  const member = getCurrentMember();
  if (!member) return;

  pendingDeleteId = null;
  try {
    const response = await fetch(VAULT_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "delete",
        memberId: member.memberId || "",
        email: member.email || "",
        vaultId,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Could not delete video.");
    }

    vaultItems = vaultItems.filter((it) => it.id !== vaultId);
    renderVaultItems();
    showToast("Removed from Club Archive.");
  } catch (err) {
    showToast(err.message || "Delete failed.");
  }
}

/**
 * Handles chunked video file upload from the Artist-Only Studio Panel.
 */
async function handleVaultUpload(event) {
  event.preventDefault();
  if (isUploading) return;

  const member = getCurrentMember();
  if (!member || !isArtistUser(member)) {
    setUploadError("Only raveyn can upload to the Club Archive.");
    return;
  }

  const titleInput = document.getElementById("vaultTitleInput");
  const categorySelect = document.getElementById("vaultCategoryInput");
  const captionInput = document.getElementById("vaultCaptionInput");
  const fileInput = document.getElementById("vaultFileInput");
  const uploadBtn = document.getElementById("vaultUploadBtn");
  const progressWrap = document.getElementById("vaultUploadProgressWrap");
  const progressBar = document.getElementById("vaultUploadProgressBar");
  const progressText = document.getElementById("vaultUploadProgressText");

  const title = titleInput?.value.trim() || "";
  const category = categorySelect?.value || "demo";
  const caption = captionInput?.value.trim() || "";
  const file = fileInput?.files?.[0];

  setUploadError("");

  if (!title) {
    setUploadError("Please enter a title for your drop.");
    return;
  }
  if (!file) {
    setUploadError("Please select a video file (MP4, WebM, or MOV).");
    return;
  }
  if (!file.type || !file.type.startsWith("video/")) {
    setUploadError("Selected file must be a video (MP4, WebM, or MOV).");
    return;
  }
  if (file.size > MAX_VIDEO_BYTES) {
    setUploadError("Video must be 50 MB or smaller.");
    return;
  }

  isUploading = true;
  const originalBtnText = uploadBtn ? uploadBtn.textContent : "Upload to Archive ✦";
  if (uploadBtn) {
    uploadBtn.disabled = true;
    uploadBtn.textContent = "Uploading...";
  }
  progressWrap?.classList.remove("hidden");
  if (progressBar) progressBar.style.width = "5%";
  if (progressText) progressText.textContent = "Preparing upload...";

  try {
    const chunkCount = Math.ceil(file.size / CHUNK_SIZE_BYTES);

    // Step 1: Initialize upload session
    const initRes = await fetch(VAULT_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "init",
        memberId: member.memberId || "",
        email: member.email || "",
        title,
        category,
        caption,
        mimeType: file.type,
        fileSize: file.size,
        chunkCount,
        chunkSize: CHUNK_SIZE_BYTES,
      }),
    });

    const initData = await initRes.json();
    if (!initRes.ok || !initData.vaultId) {
      throw new Error(initData.error || `Upload failed to start (Error ${initRes.status}).`);
    }

    const { vaultId } = initData;

    // Step 2: Upload chunks sequentially
    for (let i = 0; i < chunkCount; i++) {
      const start = i * CHUNK_SIZE_BYTES;
      const end = Math.min(file.size, start + CHUNK_SIZE_BYTES);
      const chunkBlob = file.slice(start, end);
      const dataBase64 = await blobToBase64(chunkBlob);

      const chunkRes = await fetch(VAULT_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "chunk",
          memberId: member.memberId || "",
          email: member.email || "",
          vaultId,
          index: i,
          dataBase64,
        }),
      });

      const chunkData = await chunkRes.json();
      if (!chunkRes.ok) {
        throw new Error(chunkData.error || `Chunk ${i + 1} failed to upload.`);
      }

      const pct = Math.round(((i + 1) / chunkCount) * 90) + 5;
      if (progressBar) progressBar.style.width = `${pct}%`;
      if (progressText) {
        progressText.textContent = `Uploading chunk ${i + 1} of ${chunkCount} (${pct}%)...`;
      }
    }

    // Step 3: Finalize upload
    const completeRes = await fetch(VAULT_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "complete",
        memberId: member.memberId || "",
        email: member.email || "",
        vaultId,
      }),
    });

    const completeData = await completeRes.json();
    if (!completeRes.ok || !completeData.item) {
      throw new Error(completeData.error || "Failed to finalize video upload.");
    }

    if (progressBar) progressBar.style.width = "100%";
    if (progressText) progressText.textContent = "Published to Club Archive!";

    document.getElementById("vaultUploadForm")?.reset();
    const fileLabel = document.getElementById("vaultSelectedFileName");
    if (fileLabel) fileLabel.textContent = "MP4, WebM, or MOV · up to 50 MB";

    vaultItems = [completeData.item, ...vaultItems];
    activeCategory = "all";
    updateFilterButtons();
    renderVaultItems();
    showToast(`Uploaded "${completeData.item.title}" to Club Archive!`);
  } catch (err) {
    setUploadError(err.message || "Upload failed. Please try again.");
  } finally {
    isUploading = false;
    if (uploadBtn) {
      uploadBtn.disabled = false;
      uploadBtn.textContent = originalBtnText;
    }
    setTimeout(() => {
      progressWrap?.classList.add("hidden");
      if (progressBar) progressBar.style.width = "0%";
    }, 1500);
  }
}

/**
 * Initializes the Members-Only Vault & Artist Studio Upload Panel.
 */
export function initVault() {
  if (vaultInitialized) return;
  const section = document.getElementById("vault");
  if (!section) return;

  vaultInitialized = true;
  syncVaultAuthUI();
  updateFilterButtons();

  if (getCurrentMember()) {
    fetchVaultItems();
  }

  // Artist upload form
  document.getElementById("vaultUploadForm")?.addEventListener("submit", handleVaultUpload);

  // Show selected file name & size
  document.getElementById("vaultFileInput")?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    const label = document.getElementById("vaultSelectedFileName");
    if (label) {
      label.textContent = file
        ? `${file.name} (${formatFileSize(file.size)})`
        : "MP4, WebM, or MOV · up to 50 MB";
    }
  });

  // Category filter buttons
  document.querySelectorAll("[data-vault-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeCategory = btn.getAttribute("data-vault-filter") || "all";
      updateFilterButtons();
      renderVaultItems();
    });
  });

  // Event delegation for emoji reactions & artist delete buttons
  document.getElementById("vaultGrid")?.addEventListener("click", (e) => {
    const reactBtn = e.target.closest("[data-react-id]");
    if (reactBtn) {
      e.preventDefault();
      e.stopPropagation();
      const vaultId = reactBtn.getAttribute("data-react-id");
      const emoji = reactBtn.getAttribute("data-react-emoji");
      if (vaultId && emoji) handleReactionClick(vaultId, emoji);
      return;
    }

    const deleteBtn = e.target.closest("[data-delete-vault]");
    if (deleteBtn) {
      e.preventDefault();
      e.stopPropagation();
      const vaultId = deleteBtn.getAttribute("data-delete-vault");
      if (vaultId) handleDeleteClick(vaultId);
    }
  });

  // Refresh button
  document.getElementById("vaultRefreshBtn")?.addEventListener("click", async () => {
    await fetchVaultItems();
    showToast("Club Archive refreshed!");
  });

  // Sync automatically whenever auth state changes
  window.addEventListener("raveyns:auth-changed", (event) => {
    syncVaultAuthUI(event.detail?.member ?? null);
    if (getCurrentMember()) {
      fetchVaultItems();
    } else {
      vaultItems = [];
      renderVaultItems();
    }
  });

  // Refresh archive when navigating onto the dedicated Archive page
  window.addEventListener("raveyns:view-changed", (event) => {
    if (event.detail?.view === "archive" || event.detail?.view === "vault") {
      syncVaultAuthUI();
      if (getCurrentMember()) {
        fetchVaultItems();
      }
    }
  });

  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) {
      cachedMember = null;
      syncVaultAuthUI();
      if (getCurrentMember()) fetchVaultItems();
    }
  });
}

// Auto-boot Vault when loaded directly via <script type="module" src="./js/vault.js">
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initVault);
} else {
  initVault();
}