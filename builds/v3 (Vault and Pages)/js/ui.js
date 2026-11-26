/**
 * ============================================================================
 * js/ui.js — SHARED UI UTILITIES
 * Handles toast notifications, clipboard sharing, and the hero profile photo.
 * ============================================================================
 */
import { ARTIST_AVATAR_URL, SHARE_URL } from "./config.js";

let toastTimeout = null;

/**
 * Displays a temporary toast message at the bottom of the screen.
 */
export function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;

  toast.textContent = message;
  toast.classList.remove("opacity-0", "translate-y-3", "pointer-events-none");
  toast.classList.add("opacity-100", "translate-y-0");

  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.add("opacity-0", "translate-y-3", "pointer-events-none");
    toast.classList.remove("opacity-100", "translate-y-0");
  }, 2400);
}

/**
 * Copies the official artist hub URL to the clipboard using a hidden textarea
 * for reliable cross-browser and iframe support.
 */
export function handleShareClick() {
  const tempInput = document.createElement("textarea");
  tempInput.value = SHARE_URL;
  tempInput.setAttribute("readonly", "");
  tempInput.style.position = "fixed";
  tempInput.style.opacity = "0";
  document.body.appendChild(tempInput);
  tempInput.select();

  try {
    document.execCommand("copy");
    showToast("Copied www.raveyns.com to clipboard!");
  } catch (err) {
    showToast("Unable to copy link automatically.");
  } finally {
    document.body.removeChild(tempInput);
  }
}

/**
 * Renders the artist profile photo if ARTIST_AVATAR_URL is configured,
 * falling back cleanly to the default "rv" emblem if empty or broken.
 */
export function renderArtistAvatar() {
  const container = document.getElementById("artistAvatarContainer");
  if (!container || !ARTIST_AVATAR_URL) return;

  const img = new Image();
  img.alt = "raveyn profile photo";
  img.className = "w-full h-full object-cover";
  img.onload = () => {
    container.innerHTML = "";
    container.appendChild(img);
  };
  img.src = ARTIST_AVATAR_URL;
}