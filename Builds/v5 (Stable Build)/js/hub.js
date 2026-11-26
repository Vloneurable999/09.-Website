/**
 * ============================================================================
 * js/hub.js — ARTIST HUB RENDERER
 * Builds the Stream Music and Socials grids from ARTIST_CONFIG.
 * ============================================================================
 */
import { ARTIST_CONFIG } from "./config.js";

/**
 * Renders the Music Platforms cards from ARTIST_CONFIG.musicPlatforms.
 */
export function renderMusicPlatforms() {
  const container = document.getElementById("musicGrid");
  if (!container) return;

  container.innerHTML = ARTIST_CONFIG.musicPlatforms
    .map(
      (platform) => `
        <a
          href="${platform.url}"
          target="_blank"
          rel="noopener noreferrer"
          class="group flex items-center justify-between gap-3 p-4 rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/10 hover:bg-white/[0.06] ${platform.accent} transition-all duration-300"
        >
          <div class="flex items-center gap-3.5 min-w-0">
            <span class="flex-shrink-0 w-11 h-11 rounded-xl bg-gradient-to-br ${platform.iconBg} border border-white/10 flex items-center justify-center group-hover:scale-105 transition-transform">
              ${platform.icon}
            </span>
            <div class="min-w-0">
              <h3 class="text-sm font-semibold text-white truncate group-hover:text-fuchsia-200 transition-colors">
                ${platform.name}
              </h3>
              <p class="text-xs font-mono text-zinc-400 truncate">${platform.subtitle}</p>
            </div>
          </div>
          <svg class="w-4 h-4 flex-shrink-0 text-zinc-500 group-hover:text-fuchsia-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="7" y1="17" x2="17" y2="7"></line>
            <polyline points="7 7 17 7 17 17"></polyline>
          </svg>
        </a>
      `
    )
    .join("");
}

/**
 * Renders the Socials cards from ARTIST_CONFIG.socials.
 */
export function renderSocials() {
  const container = document.getElementById("socialsGrid");
  if (!container) return;

  container.innerHTML = ARTIST_CONFIG.socials
    .map(
      (social) => `
        <a
          href="${social.url}"
          target="_blank"
          rel="noopener noreferrer"
          class="group flex items-center justify-between gap-3 p-4 rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/10 hover:bg-white/[0.06] ${social.accent} transition-all duration-300"
        >
          <div class="flex items-center gap-3.5 min-w-0">
            <span class="flex-shrink-0 w-11 h-11 rounded-xl bg-gradient-to-br ${social.iconBg} border border-white/10 flex items-center justify-center group-hover:scale-105 transition-transform">
              ${social.icon}
            </span>
            <div class="min-w-0">
              <h3 class="text-sm font-semibold text-white truncate group-hover:text-fuchsia-200 transition-colors">
                ${social.name}
              </h3>
              <p class="text-xs font-mono text-zinc-400 truncate">${social.handle}</p>
            </div>
          </div>
          <svg class="w-4 h-4 flex-shrink-0 text-zinc-500 group-hover:text-pink-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="7" y1="17" x2="17" y2="7"></line>
            <polyline points="7 7 17 7 17 17"></polyline>
          </svg>
        </a>
      `
    )
    .join("");
}