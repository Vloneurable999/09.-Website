/**
 * ============================================================================
 * js/main.js — APPLICATION ENTRY POINT
 * Boots the Artist Hub, shared UI helpers, and Club Sign Up module on load.
 * ============================================================================
 */
import { handleShareClick, renderArtistAvatar } from "./ui.js";
import { renderMusicPlatforms, renderSocials } from "./hub.js";
import { initSignup } from "./signup.js";

document.addEventListener("DOMContentLoaded", () => {
  try {
    const yearEl = document.getElementById("currentYear");
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    const shareBtn = document.getElementById("shareBtn");
    if (shareBtn) shareBtn.addEventListener("click", handleShareClick);

    initSignup();
    renderArtistAvatar();
    renderMusicPlatforms();
    renderSocials();
  } catch (error) {
    console.error("Initialization error:", error);
  }
});