/**
 * ============================================================================
 * js/signup.js — SIGN UP, LOG IN & MEMBER PASS CONTROLLER
 * Connects to /api/signup and /api/login (MongoDB Atlas), saves the active
 * Member Pass in localStorage, and notifies other modules (like Club Chat)
 * whenever the auth state changes.
 * ============================================================================
 */
import { SIGNUP_API_URL, LOGIN_API_URL, getMemberBadges } from "./config.js";
import { showToast } from "./ui.js";

const STORAGE_KEY = "raveyns_club_member";
const OG_PROMO_CUTOFF = new Date("2026-12-01T23:59:59-06:00");
let currentMember = null;
let totalRegisteredMembers = null;

/**
 * Computes a member's join position and what percent of all registered users
 * they joined after (e.g., #RV-0001 -> 0%, #RV-0004 of 10 -> 30%).
 */
function computeJoinStats(memberId, totalUsers) {
  const numericTotal = Number(totalUsers);
  if (!Number.isFinite(numericTotal) || numericTotal <= 0) return null;

  const match = String(memberId || "").trim().match(/^#RV-(\d+)$/i);
  const rawRank = match ? parseInt(match[1], 10) : numericTotal;
  const safeTotal = Math.max(numericTotal, rawRank);
  const safeRank = Math.min(Math.max(rawRank, 1), safeTotal);
  const joinedAfterPercent = Math.round(((safeRank - 1) / safeTotal) * 100);

  return {
    rank: safeRank,
    total: safeTotal,
    joinedAfterPercent,
  };
}

/**
 * Updates the total registered members counter and the logged-in user's
 * join percentile on both the homepage and the Digital Member Pass.
 */
function updateClubStatsUI() {
  const totalCountEl = document.getElementById("clubTotalMembersCount");
  const percentileRow = document.getElementById("clubUserPercentileRow");
  const joinedAfterText = document.getElementById("clubUserJoinedAfterText");
  const percentileBar = document.getElementById("clubUserPercentileBar");
  const passTotalEl = document.getElementById("memberPassTotalUsers");
  const passJoinedAfterEl = document.getElementById("memberPassJoinedAfter");

  const hasTotal = Number.isFinite(totalRegisteredMembers) && totalRegisteredMembers > 0;
  const formattedTotal = hasTotal ? totalRegisteredMembers.toLocaleString() : "—";

  if (totalCountEl) {
    totalCountEl.textContent = hasTotal ? `${formattedTotal} registered` : "—";
  }
  if (passTotalEl) {
    passTotalEl.textContent = formattedTotal;
  }

  if (currentMember && hasTotal) {
    const stats = computeJoinStats(currentMember.memberId, totalRegisteredMembers);
    if (stats) {
      percentileRow?.classList.remove("hidden");
      if (joinedAfterText) {
        joinedAfterText.textContent = `${stats.joinedAfterPercent}% of users (#${stats.rank} of ${stats.total})`;
      }
      if (percentileBar) {
        percentileBar.style.width = `${stats.joinedAfterPercent}%`;
      }
      if (passJoinedAfterEl) {
        passJoinedAfterEl.textContent = `${stats.joinedAfterPercent}% of users`;
      }
      return;
    }
  }

  percentileRow?.classList.add("hidden");
  if (passJoinedAfterEl) {
    passJoinedAfterEl.textContent = "—";
  }
}

/**
 * Loads the saved member pass from localStorage if valid, and automatically
 * upgrades legacy sessions that predate the stacked badges system.
 */
function loadSavedMember() {
  try {
    // Upgrade old browser sessions that don't have a badges array yet or still carry optInDrops
    let sessionModified = false;
    if ("optInDrops" in parsed) {
      delete parsed.optInDrops;
      sessionModified = true;
    }
    if (!Array.isArray(parsed.badges) || parsed.badges.length === 0) {
      const seedBadges = new Date() <= OG_PROMO_CUTOFF ? ["og"] : [];
      const resolved = getMemberBadges(
        parsed.memberId,
        seedBadges,
        parsed.role,
        parsed.handle
      );
      parsed.badges = resolved.map((b) => b.key);
      parsed.role = parsed.badges[0] || "member";
      sessionModified = true;
    }
    if (sessionModified) {
      saveMember(parsed);
    }

    return parsed;
  } catch (err) {
    console.warn("Unable to read saved member from localStorage:", err);
    return null;
  }
}

/**
 * Persists the active member pass in localStorage.
 */
function saveMember(member) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(member));
  } catch (err) {
    console.warn("Unable to save member to localStorage:", err);
  }
}

/**
 * Clears the active member pass from localStorage.
 */
function clearSavedMember() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.warn("Unable to clear saved member from localStorage:", err);
  }
}

/**
 * Displays or clears an inline error banner for signup or login.
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
 * Switches between the Join Club and Log In form tabs inside #signupPage.
 */
function setAuthMode(mode) {
  const signupFormView = document.getElementById("signupFormView");
  const loginFormView = document.getElementById("loginFormView");
  const tabSignupBtn = document.getElementById("tabSignupBtn");
  const tabLoginBtn = document.getElementById("tabLoginBtn");

  showAuthError("signupError", "");
  showAuthError("loginError", "");

  const activeClasses = ["text-white", "bg-fuchsia-500/25", "border-fuchsia-400/40", "font-semibold"];
  const inactiveClasses = ["text-zinc-400", "border-transparent", "font-medium"];

  if (mode === "login") {
    signupFormView?.classList.add("hidden");
    loginFormView?.classList.remove("hidden");

    tabLoginBtn?.classList.add(...activeClasses);
    tabLoginBtn?.classList.remove(...inactiveClasses);
    tabSignupBtn?.classList.remove(...activeClasses);
    tabSignupBtn?.classList.add(...inactiveClasses);
  } else {
    loginFormView?.classList.add("hidden");
    signupFormView?.classList.remove("hidden");

    tabSignupBtn?.classList.add(...activeClasses);
    tabSignupBtn?.classList.remove(...inactiveClasses);
    tabLoginBtn?.classList.remove(...activeClasses);
    tabLoginBtn?.classList.add(...inactiveClasses);
  }
}

/**
 * Updates header buttons, Member Pass card, and notifies Club Chat.
 */
function updateMemberUI() {
  const navLoginBtn = document.getElementById("navLoginBtn");
  const navSignupLabel = document.getElementById("navSignupLabel");
  const authTabs = document.getElementById("authTabs");
  const signupFormView = document.getElementById("signupFormView");
  const loginFormView = document.getElementById("loginFormView");
  const memberPassView = document.getElementById("memberPassView");
  const chatForm = document.getElementById("chatForm");
  const chatLockedPrompt = document.getElementById("chatLockedPrompt");
  const chatActiveUser = document.getElementById("chatActiveUser");
  const ogPromoBanner = document.getElementById("ogPromoBanner");

  if (ogPromoBanner) {
    const isPromoActive = new Date() <= OG_PROMO_CUTOFF;
    ogPromoBanner.classList.toggle("hidden", Boolean(currentMember) || !isPromoActive);
  }

  if (currentMember) {
    navLoginBtn?.classList.add("hidden");
    if (navSignupLabel) navSignupLabel.textContent = "Member Pass";

    authTabs?.classList.add("hidden");
    signupFormView?.classList.add("hidden");
    loginFormView?.classList.add("hidden");
    memberPassView?.classList.remove("hidden");

    // Hide chat login/signup buttons and unlock the chat composer
    chatLockedPrompt?.classList.add("hidden");
    chatForm?.classList.remove("hidden");
    if (chatActiveUser) {
      const idSuffix = currentMember.memberId ? ` (${currentMember.memberId})` : "";
      chatActiveUser.textContent = `Posting as ${currentMember.handle}${idSuffix}`;
    }

    const idEl = document.getElementById("memberPassId");
    const badgesEl = document.getElementById("memberPassBadges");
    const handleEl = document.getElementById("memberPassHandle");
    const emailEl = document.getElementById("memberPassEmail");

    if (idEl) idEl.textContent = currentMember.memberId || "#RV-0001";
    if (badgesEl) {
      const badges = getMemberBadges(
        currentMember.memberId,
        currentMember.badges,
        currentMember.role,
        currentMember.handle
      );
      badgesEl.innerHTML = "";
      badges.forEach((badge) => {
        const pill = document.createElement("span");
        pill.textContent = badge.label;
        pill.className = `px-2 py-0.5 rounded-md text-[10px] font-mono uppercase tracking-wider border ${badge.badgeClass}`;
        badgesEl.appendChild(pill);
      });
    }
    if (handleEl) handleEl.textContent = currentMember.handle;
    if (emailEl) emailEl.textContent = currentMember.email;
  } else {
    navLoginBtn?.classList.remove("hidden");
    if (navSignupLabel) navSignupLabel.textContent = "Join Club";

    authTabs?.classList.remove("hidden");
    memberPassView?.classList.add("hidden");

    // Show chat login/signup buttons and hide the chat composer
    chatForm?.classList.add("hidden");
    chatLockedPrompt?.classList.remove("hidden");
  }

  // Notify other modules (like js/chat.js) that auth state changed
  window.__raveynsCurrentMember = currentMember;
  window.dispatchEvent(
    new CustomEvent("raveyns:auth-changed", { detail: { member: currentMember } })
  );

  updateClubStatsUI();
}

/**
 * Switches between the main Artist Hub and the Sign Up / Log In / Member Pass view.
 */
function showView(view) {
  const hubMain = document.getElementById("top");
  const signupPage = document.getElementById("signupPage");
  if (!hubMain || !signupPage) return;

  if (view === "signup" || view === "login") {
    hubMain.classList.add("hidden");
    signupPage.classList.remove("hidden");
    updateMemberUI();
    if (!currentMember) {
      setAuthMode(view);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  } else {
    signupPage.classList.add("hidden");
    hubMain.classList.remove("hidden");
  }
}

/**
 * Handles POST /api/signup form submission.
 */
async function handleSignupSubmit(event) {
  event.preventDefault();
  showAuthError("signupError", "");

  const handle = document.getElementById("signupHandle")?.value.trim() || "";
  const email = document.getElementById("signupEmail")?.value.trim() || "";
  const password = document.getElementById("signupPassword")?.value || "";
  const submitBtn = document.getElementById("signupSubmitBtn");

  if (!handle) {
    showAuthError("signupError", "Please enter a username or handle.");
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showAuthError("signupError", "Please enter a valid email address.");
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
      body: JSON.stringify({ handle, email, password }),
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
    showAuthError("loginError", "Please enter your email or username.");
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

  const goHome = (e) => {
    if (e) e.preventDefault();
    if (window.location.hash === "#signup" || window.location.hash === "#login") {
      history.pushState("", document.title, window.location.pathname + window.location.search);
    }
    showView("hub");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  document.getElementById("brandHomeLink")?.addEventListener("click", goHome);
  document.getElementById("backToHubBtn")?.addEventListener("click", goHome);
  document.getElementById("passBackBtn")?.addEventListener("click", goHome);

  // Clicking top nav anchor links (Socials, Uploads, Chat) returns to hub first
  document.querySelectorAll("[data-hub-link]").forEach((link) => {
    link.addEventListener("click", () => {
      showView("hub");
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

  // Password toggles
  bindPasswordToggle("signupPassword", "togglePasswordBtn");
  bindPasswordToggle("loginPassword", "toggleLoginPasswordBtn");

  // Form submissions
  document.getElementById("signupForm")?.addEventListener("submit", handleSignupSubmit);
  document.getElementById("loginForm")?.addEventListener("submit", handleLoginSubmit);

  // Support direct links to /#signup, /#login, and browser Back button
  const syncRouteFromHash = () => {
    if (window.location.hash === "#signup") {
      showView("signup");
    } else if (window.location.hash === "#login") {
      showView("login");
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