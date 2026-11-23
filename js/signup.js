/**
 * ============================================================================
 * js/signup.js — SIGN UP, LOG IN & MEMBER PASS CONTROLLER
 * Connects to /api/signup and /api/login (MongoDB Atlas), saves the active
 * Member Pass in localStorage, and notifies other modules (like Club Chat)
 * whenever the auth state changes.
 * ============================================================================
 */
import { SIGNUP_API_URL, LOGIN_API_URL } from "./config.js";
import { showToast } from "./ui.js";

const STORAGE_KEY = "raveyns_club_member";
let currentMember = null;

/**
 * Loads the saved member pass from localStorage if valid.
 */
function loadSavedMember() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !parsed.handle || !parsed.email) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
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

  if (currentMember) {
    navLoginBtn?.classList.add("hidden");
    if (navSignupLabel) navSignupLabel.textContent = "Member Pass";

    authTabs?.classList.add("hidden");
    signupFormView?.classList.add("hidden");
    loginFormView?.classList.add("hidden");
    memberPassView?.classList.remove("hidden");

    const idEl = document.getElementById("memberPassId");
    const handleEl = document.getElementById("memberPassHandle");
    const emailEl = document.getElementById("memberPassEmail");
    const alertsEl = document.getElementById("memberPassAlerts");

    if (idEl) idEl.textContent = currentMember.memberId || "#RV-0001";
    if (handleEl) handleEl.textContent = currentMember.handle;
    if (emailEl) emailEl.textContent = currentMember.email;
    if (alertsEl) {
      alertsEl.textContent = currentMember.optInDrops ? "Drops: Enabled" : "Drops: Paused";
    }
  } else {
    navLoginBtn?.classList.remove("hidden");
    if (navSignupLabel) navSignupLabel.textContent = "Join Club";

    authTabs?.classList.remove("hidden");
    memberPassView?.classList.add("hidden");
  }

  // Notify other modules (like js/chat.js) that auth state changed
  window.__raveynsCurrentMember = currentMember;
  window.dispatchEvent(
    new CustomEvent("raveyns:auth-changed", { detail: { member: currentMember } })
  );
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
  const optInDrops = Boolean(document.getElementById("signupOptIn")?.checked);
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
      body: JSON.stringify({ handle, email, password, optInDrops }),
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
  updateMemberUI();

  // Header & navigation buttons
  document.getElementById("navSignupBtn")?.addEventListener("click", () => {
    window.location.hash = "#signup";
  });

  document.getElementById("navLoginBtn")?.addEventListener("click", () => {
    window.location.hash = "#login";
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
}