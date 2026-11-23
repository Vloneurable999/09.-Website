/**
 * ============================================================================
 * js/main.js — APPLICATION ENTRY POINT
 * Boots the Artist Hub, shared UI helpers, and Club Sign Up module on load.
 * ============================================================================
 */
import { handleShareClick, renderArtistAvatar } from "./ui.js";
import { renderMusicPlatforms, renderSocials } from "./hub.js";
import { initSignup } from "./signup.js";

function bootApp() {
  const yearEl = document.getElementById("currentYear");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  const shareBtn = document.getElementById("shareBtn");
  if (shareBtn) shareBtn.addEventListener("click", handleShareClick);

  try {
    renderArtistAvatar();
  } catch (error) {
    console.error("Avatar error:", error);
  }

  try {
    renderMusicPlatforms();
    renderSocials();
  } catch (error) {
    console.error("Hub render error:", error);
  }

  try {
    initSignup();
  } catch (error) {
    console.error("Signup init error:", error);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootApp);
} else {
  bootApp();
}