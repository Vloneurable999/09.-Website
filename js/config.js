/**
 * ============================================================================
 * js/config.js — ARTIST CONFIGURATION
 * Edit your profile photo, share URL, API endpoints, and links here.
 * ============================================================================
 */
export const ARTIST_AVATAR_URL = "/assets/PFP_v1.png";
export const SHARE_URL = "https://www.raveyns.com";

/**
 * VERCEL + MONGODB AUTH API ENDPOINTS
 * Point to the serverless functions at /api/signup.js and /api/login.js
 */
export const SIGNUP_API_URL = "/api/signup";
export const LOGIN_API_URL = "/api/login";
export const CHAT_API_URL = "/api/chat";
export const VAULT_API_URL = "/api/vault";

/**
 * MEMBER ID ROLES & BADGE STYLES
 * Assign custom roles to specific Member IDs in MEMBER_ID_ROLES below.
 */
export const MEMBER_ROLES = {
  artist: {
    label: "raveyn",
    badgeClass: "bg-pink-500/20 text-pink-200 border-pink-400/40",
  },

  florian: {
    label: "florian",
    badgeClass: "bg-pink-500/20 text-pink-200 border-pink-400/40",
  },

  admin: {
    label: "ADMIN",
    badgeClass: "bg-rose-500/20 text-rose-200 border-rose-400/40",
  },

  mod: {
    label: "MOD",
    badgeClass: "bg-cyan-500/20 text-cyan-200 border-cyan-400/40",
  },

  vip: {
    label: "VIP",
    badgeClass: "bg-amber-500/20 text-amber-200 border-amber-400/40",
  },

  og: {
    label: "OG",
    badgeClass: "bg-purple-500/20 text-purple-200 border-purple-400/40",
  },

  member: {
    label: "CLUB MEMBER",
    badgeClass: "bg-white/[0.06] text-zinc-300 border-white/15",
  },
};

/**
 * Display priority order when stacking multiple badges.
 */
export const BADGE_PRIORITY = ["artist", "admin", "mod", "vip", "og", "member"];

/**
 * Map specific Member IDs to one or more stacked badges here.
 * Accepts a single badge key or an array of badge keys.
 * Example: "#RV-0002": ["mod", "og"], "#RV-0003": ["vip", "og"]
 */

export const MEMBER_ID_ROLES = {
  "#RV-0000": ["artist", "og", "member"],
};

/**
 * Resolves ALL collected badges for a member (stacking config overrides,
 * MongoDB badges array, legacy single role, and artist handle checks).
 */
export function getMemberBadges(memberId = "", dbBadges = [], handle = "") {
  const normalizedId = String(memberId || "").trim().toUpperCase();
  const normalizedHandle = String(handle || "").trim().toLowerCase();
  const badgeSet = new Set();

  // 1. Add badges assigned to this Member ID in MEMBER_ID_ROLES
  const idOverride = MEMBER_ID_ROLES[normalizedId];
  if (Array.isArray(idOverride)) {
    idOverride.forEach((b) => {
      const key = String(b || "").trim().toLowerCase();
      if (MEMBER_ROLES[key]) badgeSet.add(key);
    });
  } else if (typeof idOverride === "string" && MEMBER_ROLES[idOverride.toLowerCase()]) {
    badgeSet.add(idOverride.toLowerCase());
  }

  // 2. Add Artist badge automatically for raveyn's official handles or #RV-0001
  const numMatch = normalizedId.match(/^#RV-(\d+)$/);
  const passNumber = numMatch ? parseInt(numMatch[1], 10) : 0;
  
  if (
    passNumber === 1 ||
    normalizedHandle === "@raveyn" ||
    normalizedHandle === "@itsraveyn"
  ) {
    badgeSet.add("artist");
    badgeSet.add("member");
  }

  if (
    normalizedHandle === "@florian"
  ) {
    badgeSet.add("florian");
    badgeSet.add("member");
  }

  // 3. Add all collected badges stored in MongoDB (badges array)
  if (Array.isArray(dbBadges)) {
    dbBadges.forEach((b) => {
      const key = String(b || "").trim().toLowerCase();
      if (MEMBER_ROLES[key]) badgeSet.add(key);
    });
  }

  if (!user.badges.includes("member")) {
    badgeSet.add("member"); 
  }

  // Sort badges by priority so higher-tier badges always appear first
  const sortedKeys = [...badgeSet].sort((a, b) => {
    const idxA = BADGE_PRIORITY.indexOf(a);
    const idxB = BADGE_PRIORITY.indexOf(b);
    return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
  });

  return sortedKeys.map((key) => ({ key, ...MEMBER_ROLES[key] }));
}

/**
 * Returns the primary (highest-priority) badge for backwards compatibility.
 */
export function getMemberRole(memberId = "", handle = "", dbBadges = []) {
  return getMemberBadges(memberId, dbBadges, handle)[0];
}

/**
 * STREAMING PLATFORMS & SOCIAL CHANNELS
 */
export const ARTIST_CONFIG = {
  musicPlatforms: [
    {
      name: "Spotify",
      subtitle: "@raveyn",
      url: "https://open.spotify.com/artist/4TQ0jOKwGZFjmSnqR27MvF",
      accent: "hover:border-purple-400/50 hover:shadow-neon-purple",
      iconBg: "from-purple-500/25 to-fuchsia-500/20 text-purple-300",
      icon: `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.72 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>`,
    },
    {
      name: "SoundCloud",
      subtitle: "@itsraveyn",
      url: "https://soundcloud.com/itsraveyn",
      accent: "hover:border-pink-400/50 hover:shadow-neon-pink",
      iconBg: "from-pink-500/25 to-fuchsia-500/20 text-pink-300",
      icon: `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M1.175 12.225c-.051 0-.094.046-.101.1l-.233 2.154.233 2.105c.007.058.05.098.101.098.05 0 .09-.04.099-.098l.255-2.105-.27-2.154c-.009-.06-.052-.1-.084-.1zm-.899.828c-.06 0-.091.037-.104.094L0 14.479l.165 1.308c.014.057.045.094.09.094s.089-.037.099-.094l.19-1.308-.19-1.334c-.01-.057-.054-.094-.078-.094zm1.83-1.229c-.061 0-.12.045-.12.104l-.21 2.563.225 2.458c0 .06.045.104.106.104.061 0 .12-.044.12-.104l.24-2.458-.24-2.563c0-.06-.06-.104-.12-.104zm.945-.089c-.075 0-.135.06-.15.135l-.193 2.64.21 2.544c.016.077.075.138.149.138.075 0 .135-.061.15-.15l.24-2.532-.24-2.623c0-.075-.06-.152-.166-.152zm1.155-.36c-.005-.09-.075-.149-.159-.149-.09 0-.158.06-.164.149l-.217 2.992.2 2.563c.014.09.075.15.164.15.084 0 .154-.06.159-.15l.24-2.563-.223-2.992zm1.066-.42c-.015-.09-.09-.164-.18-.164-.09 0-.165.074-.18.164l-.195 3.412.195 2.563c.015.09.09.165.18.165.09 0 .165-.075.18-.165l.225-2.563-.225-3.412zm1.08-.465c-.015-.105-.09-.18-.195-.18-.105 0-.18.075-.195.18l-.18 3.877.18 2.563c.015.105.09.18.195.18.105 0 .18-.075.195-.18l.21-2.563-.21-3.877zm1.095-.42c-.015-.105-.105-.195-.21-.195-.105 0-.195.09-.21.195l-.165 4.297.165 2.563c.015.105.105.195.21.195.105 0 .195-.09.21-.195l.195-2.563-.195-4.297zm1.11-.255c-.015-.12-.105-.21-.225-.21-.12 0-.21.09-.225.21l-.15 4.552.15 2.563c.015.12.105.21.225.21.12 0 .21-.09.225-.21l.18-2.563-.18-4.552zm1.125-.12c-.015-.12-.12-.225-.24-.225-.12 0-.225.105-.24.225l-.135 4.672.135 2.563c.015.12.12.225.24.225.12 0 .225-.105.24-.225l.165-2.563-.165-4.672zm1.14-.06c-.015-.135-.12-.24-.255-.24-.135 0-.24.105-.255.24l-.12 4.732.12 2.563c.015.135.12.24.255.24.135 0 .24-.105.255-.24l.15-2.563-.15-4.732zm1.56-1.44c-.54 0-1.05.12-1.515.33-.15.06-.225.195-.225.345v6.84c0 .165.135.3.3.3h9.66c1.695 0 3.075-1.38 3.075-3.075 0-1.695-1.38-3.075-3.075-3.075-.42 0-.81.09-1.17.24-.345-2.205-2.25-3.9-4.545-3.9h-.505z"/></svg>`,
    },
    {
      name: "Apple Music",
      subtitle: "@Raveyn",
      url: "https://music.apple.com/us/artist/raveyn/1851112747",
      accent: "hover:border-fuchsia-400/50 hover:shadow-neon-pink",
      iconBg: "from-fuchsia-500/25 to-pink-500/20 text-fuchsia-300",
      icon: `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M23.994 6.124a9.23 9.23 0 00-.24-2.19c-.317-1.31-1.062-2.31-2.18-3.043a5.022 5.022 0 00-1.877-.726 10.496 10.496 0 00-1.564-.15c-.04-.003-.083-.01-.124-.013H5.986c-.152.01-.303.017-.455.026-.747.043-1.49.123-2.193.4-1.336.53-2.3 1.452-2.865 2.78-.192.448-.292.925-.363 1.408-.056.392-.088.785-.1 1.18 0 .032-.007.062-.01.093v12.223c.01.14.017.283.027.424.05.815.154 1.624.497 2.373.65 1.42 1.738 2.353 3.234 2.801.42.127.856.187 1.293.228.555.053 1.11.06 1.667.06h11.03a12.5 12.5 0 001.57-.1c.822-.106 1.596-.35 2.295-.81a5.046 5.046 0 001.88-2.207c.186-.42.293-.87.37-1.324.113-.675.138-1.358.137-2.04-.002-3.8 0-7.595-.003-11.393zm-6.423 3.99v5.712c0 .417-.058.827-.244 1.206-.29.59-.76.962-1.388 1.14-.35.1-.706.157-1.07.173-.95.045-1.773-.6-1.943-1.536a1.88 1.88 0 011.038-2.022c.323-.16.67-.25 1.018-.324.378-.082.758-.153 1.134-.24.274-.063.457-.23.51-.516a.904.904 0 00.02-.193c0-1.815 0-3.63-.002-5.443a.725.725 0 00-.026-.185c-.04-.15-.15-.243-.304-.234-.16.01-.318.035-.475.066-.76.15-1.52.303-2.28.456l-2.325.47-1.374.278c-.016.003-.032.01-.048.013-.277.077-.377.203-.39.49-.002.042 0 .086 0 .13-.002 2.602 0 5.204-.003 7.805 0 .42-.047.836-.215 1.227-.278.64-.77 1.04-1.434 1.233-.35.1-.71.16-1.075.172-.96.036-1.755-.6-1.92-1.544-.14-.812.23-1.685 1.154-2.075.357-.15.73-.232 1.108-.31.287-.06.575-.116.86-.177.383-.083.583-.323.6-.714v-.15c0-2.96 0-5.922.002-8.882 0-.123.013-.25.042-.37.07-.285.273-.448.558-.508.288-.06.577-.118.867-.175l2.337-.47 2.38-.48c.507-.102 1.015-.203 1.524-.304.22-.044.442-.08.665-.067.35.02.596.26.628.613.01.105.012.21.012.315v1.696z"/></svg>`,
    },
  ],
  socials: [
     {
      name: "YouTube",
      handle: "@raveyn",
      url: "https://www.youtube.com/@raveyn",
      accent: "hover:border-pink-400/50 hover:shadow-neon-pink",
      iconBg: "from-pink-500/25 to-rose-500/20 text-pink-300",
      icon: `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`,
    },

    {
      name: "Instagram",
      handle: "@itsraveyn",
      url: "https://www.instagram.com/itsraveyn",
      accent: "hover:border-pink-400/50 hover:shadow-neon-pink",
      iconBg: "from-pink-500/25 to-purple-500/20 text-pink-300",
      icon: `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>`,
    },

    {
      name: "TikTok",
      handle: "@itsraveyn",
      url: "https://www.tiktok.com/@itsraveyn",
      accent: "hover:border-fuchsia-400/50 hover:shadow-neon-purple",
      iconBg: "from-fuchsia-500/25 to-purple-500/20 text-fuchsia-300",
      icon: `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/></svg>`,
    },

    {
      name: "Threads",
      handle: "@itsraveyn",
      url: "https://www.threads.com/@itsraveyn",
      accent: "hover:border-purple-400/50 hover:shadow-neon-purple",
      iconBg: "from-purple-500/25 to-indigo-500/20 text-purple-300",
      icon: `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"></path></svg>`,
    }
  ],
};