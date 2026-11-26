/**
 * ============================================================================
 * js/main.js — APPLICATION ENTRY POINT
 * Boots each module independently so an error in one file never blocks others.
 * ============================================================================
 */
async function bootApp() {
  const yearEl = document.getElementById("currentYear");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // 1. Load Music & Socials cards first so they always render
  try {
    const { renderMusicPlatforms, renderSocials } = await import("./hub.js");
    renderMusicPlatforms();
    renderSocials();
  } catch (error) {
    console.error("Failed to load hub.js (Music & Socials):", error);
  }

  // 2. Load Avatar & Share button
  try {
    const { handleShareClick, renderArtistAvatar } = await import("./ui.js");
    const shareBtn = document.getElementById("shareBtn");
    if (shareBtn) shareBtn.addEventListener("click", handleShareClick);
    renderArtistAvatar();
  } catch (error) {
    console.error("Failed to load ui.js:", error);
  }

  // 3. Load Sign Up / Log In module independently
  try {
    const { initSignup } = await import("./signup.js");
    initSignup();
  } catch (error) {
    console.error("Failed to load signup.js:", error);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootApp);
} else {
  bootApp();
}