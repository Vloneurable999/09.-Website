/**
 * ============================================================================
 * js/signup.js — MEMBER SIGN UP, LOG IN, PASS CARD & PAGE NAVIGATION
 * Handles /api/signup, /api/login, stacked badges, join percentile stats,
 * localStorage persistence, and dedicated page switching via the top hotbar.
 * ============================================================================
 */
import { SIGNUP_API_URL, LOGIN_API_URL, getMemberBadges } from "./config.js";
import { showToast } from "./ui.js";

const STORAGE_KEY = "raveyns_club_member";
const OG_PROMO_CUTOFF = new Date("2026-12-01T23:59:59-06:00");

let currentMember = null;
let totalRegisteredMembers = null;

/**
 * Safely escapes HTML entities before rendering into innerHTML.
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
 * Saves the active member pass to localStorage and shares it globally.
 */
function saveMember(member) {
  window.__raveynsCurrentMember = member || null;
  try {
    if (member) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(member));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch (err) {
    console.warn("Unable to persist member session:", err);
  }
}

/**
 * Clears the saved member pass from localStorage and global state.
 */
function clearSavedMember() {
  window.__raveynsCurrentMember = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage errors in private browsing
  }
}

/**
 * Loads the saved member pass from localStorage, automatically upgrading
 * legacy sessions to the stacked badges format and stripping deprecated fields.
 */
function loadSavedMember() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !parsed.handle || (!parsed.memberId && !parsed.email)) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    let upgraded = false;

    // Strip deprecated optInDrops field if present on old sessions
    if (Object.prototype.hasOwnProperty.call(parsed, "optInDrops")) {
      delete parsed.optInDrops;
      upgraded = true;
    }

    // Upgrade old sessions missing the stacked badges array
    if (!Array.isArray(parsed.badges) || parsed.badges.length === 0) {
      const seedBadges = [];
      if (parsed.role) seedBadges.push(parsed.role);
      if (new Date() <= OG_PROMO_CUTOFF) seedBadges.push("og");
      const resolved = getMemberBadges(parsed.memberId, seedBadges, parsed.role, parsed.handle);
      parsed.badges = resolved.map((b) => b.key);
      parsed.role = parsed.badges[0] || "member";
      upgraded = true;
    }

    if (upgraded) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    }

    window.__raveynsCurrentMember = parsed;
    return parsed;
  } catch {
    clearSavedMember();
    return null;
  }
}

/**
 * Shows or hides an inline error alert inside the Sign Up or Log In form.
 */
function showAuthError(elementId, message = "") {
  const el = document.getElementById(elementId);
  if (!el) return;

  if (message) {
    el.textContent = message;
    el.classList.remove("hidden");
  } else {
    el.textContent = "";
    el.classList.add("hidden");
  }
}

/**
 * Toggles between the "Join Club" (signup) and "Log In" (login) form tabs.
 */
function setAuthMode(mode) {
  const isLogin = mode === "login";
  const signupFormView = document.getElementById("signupFormView");
  const loginFormView = document.getElementById("loginFormView");
  const tabSignupBtn = document.getElementById("tabSignupBtn");
  const tabLoginBtn = document.getElementById("tabLoginBtn");

  showAuthError("signupError", "");
  showAuthError("loginError", "");

  signupFormView?.classList.toggle("hidden", isLogin);
  loginFormView?.classList.toggle("hidden", !isLogin);

  if (tabSignupBtn && tabLoginBtn) {
    const activeClasses = ["text-white", "bg-fuchsia-500/25", "border-fuchsia-400/40", "font-semibold"];
    const inactiveClasses = ["text-zinc-400", "border-transparent", "font-medium"];

    if (isLogin) {
      tabLoginBtn.classList.add(...activeClasses);
      tabLoginBtn.classList.remove(...inactiveClasses);
      tabSignupBtn.classList.remove(...activeClasses);
      tabSignupBtn.classList.add(...inactiveClasses);
    } else {
      tabSignupBtn.classList.add(...activeClasses);
      tabSignupBtn.classList.remove(...inactiveClasses);
      tabLoginBtn.classList.remove(...activeClasses);
      tabLoginBtn.classList.add(...inactiveClasses);
    }
  }
}

/**
 * Parses the numeric join rank from a Member ID like "#RV-0004" -> 4.
 */
function parseMemberRank(memberId) {
  const match = String(memberId || "").trim().match(/(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Updates the total registered members count and the logged-in user's
 * "Joined after X% of users" progress bar on both the Home Hero and Member Pass.
 */
function updateClubStatsUI() {
  const totalEl = document.getElementById("clubTotalMembersCount");
  const percentileRow = document.getElementById("clubUserPercentileRow");
  const joinedAfterText = document.getElementById("clubUserJoinedAfterText");
  const percentileBar = document.getElementById("clubUserPercentileBar");

  const passTotalEl = document.getElementById("memberPassTotalUsers");
  const passJoinedAfterEl = document.getElementById("memberPassJoinedAfter");

  const rank = currentMember ? parseMemberRank(currentMember.memberId) : 0;
  const knownTotal =
    typeof totalRegisteredMembers === "number" && totalRegisteredMembers > 0
      ? Math.max(totalRegisteredMembers, rank)
      : rank > 0
      ? rank
      : null;

  if (totalEl) {
    totalEl.textContent = knownTotal !== null ? `${knownTotal.toLocaleString()} registered` : "—";
  }
  if (passTotalEl) {
    passTotalEl.textContent = knownTotal !== null ? knownTotal.toLocaleString() : "—";
  }

  if (currentMember && rank > 0 && knownTotal !== null) {
    // Compare against all other members: #1 of 4 => 0%, #4 of 4 => 100%
    const pct =
      knownTotal <= 1
        ? 0
        : Math.min(100, Math.max(0, Math.round(((rank - 1) / (knownTotal - 1)) * 100)));

    percentileRow?.classList.remove("hidden");
    if (joinedAfterText) {
      joinedAfterText.textContent = `${pct}% of users (#${rank} of ${knownTotal})`;
    }
    if (percentileBar) {
      percentileBar.style.width = `${pct}%`;
    }
    if (passJoinedAfterEl) {
      passJoinedAfterEl.textContent = `${pct}% of users`;
    }
  } else {
    percentileRow?.classList.add("hidden");
    if (passJoinedAfterEl) {
      passJoinedAfterEl.textContent = "—";
    }
  }
}

/**
 * Syncs the header buttons, OG promo banner, Member Pass card, Club Chat bar,
 * and broadcasts auth changes to other modules (chat.js, vault.js).
 */
function updateMemberUI() {
  window.__raveynsCurrentMember = currentMember || null;

  const navLoginBtn = document.getElementById("navLoginBtn");
  const navSignupLabel = document.getElementById("navSignupLabel");
  const ogPromoBanner = document.getElementById("ogPromoBanner");

  const authTabs = document.getElementById("authTabs");
  const signupFormView = document.getElementById("signupFormView");
  const loginFormView = document.getElementById("loginFormView");
  const memberPassView = document.getElementById("memberPassView");

  const chatForm = document.getElementById("chatForm");
  const chatLockedPrompt = document.getElementById("chatLockedPrompt");
  const chatActiveUser = document.getElementById("chatActiveUser");

  const isPromoActive = new Date() <= OG_PROMO_CUTOFF;

  if (currentMember) {
    navLoginBtn?.classList.add("hidden");
    if (navSignupLabel) navSignupLabel.textContent = "Member Pass";
    ogPromoBanner?.classList.add("hidden");

    // Show Digital Member Pass inside #signupPage
    authTabs?.classList.add("hidden");
    signupFormView?.classList.add("hidden");
    loginFormView?.classList.add("hidden");
    memberPassView?.classList.remove("hidden");

    const passIdEl = document.getElementById("memberPassId");
    const passHandleEl = document.getElementById("memberPassHandle");
    const passEmailEl = document.getElementById("memberPassEmail");
    const passBadgesEl = document.getElementById("memberPassBadges");

    if (passIdEl) passIdEl.textContent = currentMember.memberId || "#RV-0001";
    if (passHandleEl) passHandleEl.textContent = currentMember.handle || "@member";
    if (passEmailEl) {
      if (currentMember.email) {
        passEmailEl.textContent = currentMember.email;
        passEmailEl.classList.remove("hidden");
      } else {
        passEmailEl.textContent = "";
        passEmailEl.classList.add("hidden");
      }
    }

    if (passBadgesEl) {
      const badges = getMemberBadges(
        currentMember.memberId,
        currentMember.badges,
        currentMember.role,
        currentMember.handle
      );
      passBadgesEl.innerHTML = badges
        .map(
          (b) =>
            `<span class="px-2 py-0.5 rounded-md text-[10px] font-mono uppercase tracking-wider border ${b.badgeClass}">${escapeHtml(b.label)}</span>`
        )
        .join("");
    }

    // Immediately unlock Club Chat composer & hide Log In / Join Club buttons
    chatForm?.classList.remove("hidden");
    chatLockedPrompt?.classList.add("hidden");
    if (chatActiveUser) {
      const idSuffix = currentMember.memberId ? ` (${currentMember.memberId})` : "";
      chatActiveUser.textContent = `Posting as ${currentMember.handle}${idSuffix}`;
    }
  } else {
    navLoginBtn?.classList.remove("hidden");
    if (navSignupLabel) navSignupLabel.textContent = "Join Club";
    ogPromoBanner?.classList.toggle("hidden", !isPromoActive);

    // Show Auth Tabs + Form inside #signupPage
    authTabs?.classList.remove("hidden");
    memberPassView?.classList.add("hidden");

    // Show Log In / Join Club prompt in Club Chat
    chatForm?.classList.add("hidden");
    chatLockedPrompt?.classList.remove("hidden");
  }

  updateClubStatsUI();

  window.dispatchEvent(
    new CustomEvent("raveyns:auth-changed", { detail: { member: currentMember } })
  );
}

/**
 * Switches between dedicated pages: Home ("hub"), Socials ("socials"),
 * Club Archive ("archive"), Club Chat ("chat"), and Sign Up / Log In ("signup"/"login").
 */
function showView(view) {
  const pages = {
    hub: document.getElementById("top"),
    socials: document.getElementById("socialsPage"),
    archive: document.getElementById("vaultPage"),
    chat: document.getElementById("chatPage"),
    signup: document.getElementById("signupPage"),
  };

  const normalizedView = view === "vault" ? "archive" : view;
  const targetKey =
    normalizedView === "login" ? "signup" : pages[normalizedView] ? normalizedView : "hub";

  Object.entries(pages).forEach(([key, el]) => {
    if (!el) return;
    el.classList.toggle("hidden", key !== targetKey);
  });

  // Highlight active tab in the top hotbar (desktop & mobile)
  document.querySelectorAll("[data-nav-view]").forEach((link) => {
    const isActive = link.getAttribute("data-nav-view") === targetKey;
    link.classList.toggle("text-white", isActive);
    link.classList.toggle("bg-fuchsia-500/20", isActive);
    link.classList.toggle("border-fuchsia-400/40", isActive);
    link.classList.toggle("shadow-neon-purple", isActive);
    link.classList.toggle("border-transparent", !isActive);
    link.classList.toggle("text-zinc-400", !isActive);
  });

  if (view === "signup" || view === "login") {
    updateMemberUI();
    if (!currentMember) {
      setAuthMode(view);
    }
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
  window.dispatchEvent(
    new CustomEvent("raveyns:view-changed", { detail: { view: targetKey } })
  );
}

/**
 * Handles POST /api/signup form submission.
 */
async function handleSignupSubmit(event) {
  event.preventDefault();
  showAuthError("signupError", "");

  const handle = document.getElementById("signupHandle")?.value.trim() || "";
  const password = document.getElementById("signupPassword")?.value || "";
  const submitBtn = document.getElementById("signupSubmitBtn");

  if (!handle) {
    showAuthError("signupError", "Please enter a username.");
    return;
  }
  if (password.length < 6) {
    showAuthError("signupError", "Password must be at least 6 characters long.");
    return;
  }

  const originalText = submitBtn ? submitBtn.textContent : "Create Member Pass ✦";
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Creating Pass...";
  }

  try {
    const response = await fetch(SIGNUP_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle, password }),
    });

    const rawText = await response.text();
    let data = {};
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      console.error("Non-JSON response from /api/signup:", response.status, rawText);
    }

    if (!response.ok) {
      const fallbackMsg =
        response.status === 404
          ? "Signup API (/api/signup) not found. Make sure api/signup.js is deployed on Vercel."
          : `Unable to complete signup (Error ${response.status}). Please try again.`;
      throw new Error(data.error || fallbackMsg);
    }

    if (!data.member) {
      throw new Error("Unexpected server response. Please try again.");
    }

    currentMember = data.member;
    if (typeof data.totalMembers === "number") {
      totalRegisteredMembers = data.totalMembers;
      window.__raveynsTotalMembers = data.totalMembers;
    }
    saveMember(currentMember);

    document.getElementById("signupForm")?.reset();
    updateMemberUI();
    showToast(`Welcome to raveyn's club, ${currentMember.handle}!`);
  } catch (err) {
    showAuthError("signupError", err.message || "Something went wrong. Please try again.");
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  }
}

/**
 * Handles POST /api/login form submission (supports email or username).
 */
async function handleLoginSubmit(event) {
  event.preventDefault();
  showAuthError("loginError", "");

  const identifier = document.getElementById("loginIdentifier")?.value.trim() || "";
  const password = document.getElementById("loginPassword")?.value || "";
  const submitBtn = document.getElementById("loginSubmitBtn");

  if (!identifier) {
    showAuthError("loginError", "Please enter your username.");
    return;
  }
  if (!password) {
    showAuthError("loginError", "Please enter your password.");
    return;
  }

  const originalText = submitBtn ? submitBtn.textContent : "Log In ✦";
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Logging In...";
  }

  try {
    const response = await fetch(LOGIN_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, password }),
    });

    const rawText = await response.text();
    let data = {};
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      console.error("Non-JSON response from /api/login:", response.status, rawText);
    }

    if (!response.ok) {
      const fallbackMsg =
        response.status === 404
          ? "Login API (/api/login) not found. Make sure api/login.js is deployed on Vercel."
          : `Unable to log in (Error ${response.status}). Please try again.`;
      throw new Error(data.error || fallbackMsg);
    }

    if (!data.member) {
      throw new Error("Unexpected server response. Please try again.");
    }

    currentMember = data.member;
    if (typeof data.totalMembers === "number") {
      totalRegisteredMembers = data.totalMembers;
      window.__raveynsTotalMembers = data.totalMembers;
    }
    saveMember(currentMember);

    document.getElementById("loginForm")?.reset();
    updateMemberUI();
    showToast(`Welcome back, ${currentMember.handle}!`);
  } catch (err) {
    showAuthError("loginError", err.message || "Invalid email/username or password.");
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  }
}

/**
 * Attaches show/hide toggle behavior to a password input + button pair.
 */
function bindPasswordToggle(inputId, btnId) {
  const input = document.getElementById(inputId);
  const btn = document.getElementById(btnId);
  if (!input || !btn) return;

  btn.addEventListener("click", () => {
    const isPassword = input.type === "password";
    input.type = isPassword ? "text" : "password";
    btn.textContent = isPassword ? "Hide" : "Show";
  });
}

/**
 * Initializes navigation, form listeners, and hash routing.
 */
export function initSignup() {
  currentMember = loadSavedMember();
  if (typeof window.__raveynsTotalMembers === "number") {
    totalRegisteredMembers = window.__raveynsTotalMembers;
  }
  updateMemberUI();

  // Keep total registered count & join percentile in sync when Club Chat loads/polls
  window.addEventListener("raveyns:stats-updated", (event) => {
    const count = event.detail?.totalMembers;
    if (typeof count === "number") {
      totalRegisteredMembers = count;
      updateClubStatsUI();
    }
  });

  // Header & navigation buttons
  document.getElementById("navSignupBtn")?.addEventListener("click", () => {
    window.location.hash = "#signup";
    showView("signup");
  });

  document.getElementById("navLoginBtn")?.addEventListener("click", () => {
    window.location.hash = "#login";
    showView("login");
  });

  document.getElementById("chatLoginBtn")?.addEventListener("click", () => {
    window.location.hash = "#login";
    showView("login");
  });

  document.getElementById("chatSignupBtn")?.addEventListener("click", () => {
    window.location.hash = "#signup";
    showView("signup");
  });

  document.getElementById("ogBannerSignupBtn")?.addEventListener("click", () => {
    window.location.hash = "#signup";
    showView("signup");
  });

  document.getElementById("vaultLoginBtn")?.addEventListener("click", () => {
    window.location.hash = "#login";
    showView("login");
  });

  document.getElementById("vaultSignupBtn")?.addEventListener("click", () => {
    window.location.hash = "#signup";
    showView("signup");
  });

  const goHome = (e) => {
    if (e) e.preventDefault();
    if (window.location.hash) {
      history.pushState("", document.title, window.location.pathname + window.location.search);
    }
    showView("hub");
  };

  document.getElementById("brandHomeLink")?.addEventListener("click", goHome);
  document.getElementById("backToHubBtn")?.addEventListener("click", goHome);
  document.getElementById("passBackBtn")?.addEventListener("click", goHome);
  document.querySelectorAll("[data-back-home]").forEach((btn) => {
    btn.addEventListener("click", goHome);
  });

  // Top & mobile hotbar page switcher links
  document.querySelectorAll("[data-nav-view]").forEach((link) => {
    link.addEventListener("click", (e) => {
      const targetView = link.getAttribute("data-nav-view") || "hub";
      if (targetView === "hub") {
        goHome(e);
      } else {
        e.preventDefault();
        window.location.hash = `#${targetView}`;
        showView(targetView);
      }
    });
  });

  // Auth tab switchers
  document.getElementById("tabSignupBtn")?.addEventListener("click", () => {
    setAuthMode("signup");
    if (window.location.hash !== "#signup") {
      history.replaceState(null, "", "#signup");
    }
  });

  document.getElementById("tabLoginBtn")?.addEventListener("click", () => {
    setAuthMode("login");
    if (window.location.hash !== "#login") {
      history.replaceState(null, "", "#login");
    }
  });

  // Sign Out button
  document.getElementById("signOutBtn")?.addEventListener("click", () => {
    currentMember = null;
    clearSavedMember();
    updateMemberUI();
    setAuthMode("login");
    showToast("Signed out of raveyn's club.");
  });

  // Form submissions & password toggles
  document.getElementById("signupForm")?.addEventListener("submit", handleSignupSubmit);
  document.getElementById("loginForm")?.addEventListener("submit", handleLoginSubmit);
  bindPasswordToggle("signupPassword", "togglePasswordBtn");
  bindPasswordToggle("loginPassword", "toggleLoginPasswordBtn");

  // Support direct links to #socials, #archive, #chat, #signup, #login, and browser Back button
  const syncRouteFromHash = () => {
    const hash = window.location.hash.replace(/^#/, "").toLowerCase();
    if (
      hash === "signup" ||
      hash === "login" ||
      hash === "socials" ||
      hash === "archive" ||
      hash === "vault" ||
      hash === "chat"
    ) {
      showView(hash === "vault" ? "archive" : hash);
    } else {
      showView("hub");
    }
  };

  window.addEventListener("hashchange", syncRouteFromHash);
  syncRouteFromHash();

  // Ensure Club Chat is booted so logged-in members can send messages immediately
  if (!window.__raveynsChatReady && document.getElementById("chat")) {
    import("./chat.js")
      .then((mod) => mod.initChat?.())
      .catch((err) => console.error("Failed to boot Club Chat from signup.js:", err));
  }
}