/**
 * ============================================================================
 * js/signup.js — CLUB SIGN UP & MEMBER PASS MODULE
 * Manages view switching (Hub <-> Sign Up), validation, MongoDB API POST, and Member Pass UI.
 * ============================================================================
 */
import { SIGNUP_API_URL, LOGIN_API_URL } from "./config.js";
import { showToast } from "./ui.js";

const MEMBER_STORAGE_KEY = "raveyn_club_member";

/**
 * Loads the saved member pass from localStorage (if any).
 */
function loadSavedMember() {
  try {
    const raw = localStorage.getItem(MEMBER_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Persists or clears the member pass in localStorage.
 */
function saveMember(member) {
  try {
    if (member) {
      localStorage.setItem(MEMBER_STORAGE_KEY, JSON.stringify(member));
    } else {
      localStorage.removeItem(MEMBER_STORAGE_KEY);
    }
  } catch (err) {
    console.warn("Could not access localStorage:", err);
  }
}

let currentMember = loadSavedMember();
let authMode = "signup"; // "signup" | "login"

/**
 * Switches between the Sign Up and Log In tabs inside the auth card.
 */
function setAuthMode(mode) {
  authMode = mode === "login" ? "login" : "signup";

  const tabSignupBtn = document.getElementById("tabSignupBtn");
  const tabLoginBtn = document.getElementById("tabLoginBtn");
  const signupError = document.getElementById("signupError");
  const loginError = document.getElementById("loginError");

  if (signupError) signupError.classList.add("hidden");
  if (loginError) loginError.classList.add("hidden");

  const activeClasses = ["text-white", "font-semibold", "bg-fuchsia-500/25", "border-fuchsia-400/40"];
  const inactiveClasses = ["text-zinc-400", "font-medium", "border-transparent", "hover:text-zinc-200"];

  if (tabSignupBtn && tabLoginBtn) {
    if (authMode === "signup") {
      tabSignupBtn.classList.add(...activeClasses);
      tabSignupBtn.classList.remove(...inactiveClasses);
      tabLoginBtn.classList.remove(...activeClasses);
      tabLoginBtn.classList.add(...inactiveClasses);
    } else {
      tabLoginBtn.classList.add(...activeClasses);
      tabLoginBtn.classList.remove(...inactiveClasses);
      tabSignupBtn.classList.remove(...activeClasses);
      tabSignupBtn.classList.add(...inactiveClasses);
    }
  }

  updateMemberUI();
}

/**
 * Switches between the main Artist Hub view and the dedicated Auth/Pass page.
 */
export function showView(view) {
  const hubMain = document.getElementById("top");
  const signupPage = document.getElementById("signupPage");
  if (!hubMain || !signupPage) return;

  if (view === "signup" || view === "login") {
    if (!currentMember) setAuthMode(view);
    hubMain.classList.add("hidden");
    signupPage.classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  } else {
    signupPage.classList.add("hidden");
    hubMain.classList.remove("hidden");
  }
}

/**
 * Updates the Header, Auth forms, and Member Pass UI based on session state.
 */
function updateMemberUI() {
  const navLoginBtn = document.getElementById("navLoginBtn");
  const navLabel = document.getElementById("navSignupLabel");
  const authTabs = document.getElementById("authTabs");
  const formView = document.getElementById("signupFormView");
  const loginView = document.getElementById("loginFormView");
  const passView = document.getElementById("memberPassView");

  if (currentMember) {
    if (navLoginBtn) navLoginBtn.classList.add("hidden");
    if (navLabel) navLabel.textContent = currentMember.handle;
    if (authTabs) authTabs.classList.add("hidden");
    if (formView) formView.classList.add("hidden");
    if (loginView) loginView.classList.add("hidden");
    if (passView) passView.classList.remove("hidden");

    const idEl = document.getElementById("memberPassId");
    const handleEl = document.getElementById("memberPassHandle");
    const emailEl = document.getElementById("memberPassEmail");
    const alertsEl = document.getElementById("memberPassAlerts");

    if (idEl) idEl.textContent = currentMember.memberId;
    if (handleEl) handleEl.textContent = currentMember.handle;
    if (emailEl) emailEl.textContent = currentMember.email;
    if (alertsEl) alertsEl.textContent = currentMember.optInDrops ? "Drops: Enabled" : "Drops: Paused";
  } else {
    if (navLoginBtn) navLoginBtn.classList.remove("hidden");
    if (navLabel) navLabel.textContent = "Join Club";
    if (passView) passView.classList.add("hidden");
    if (authTabs) authTabs.classList.remove("hidden");

    if (authMode === "login") {
      if (formView) formView.classList.add("hidden");
      if (loginView) loginView.classList.remove("hidden");
    } else {
      if (loginView) loginView.classList.add("hidden");
      if (formView) formView.classList.remove("hidden");
    }
  }
}

/**
 * Handles club signup form validation, MongoDB API POST, and member pass creation.
 */
async function handleSignupSubmit(event) {
  event.preventDefault();

  const errorBox = document.getElementById("signupError");
  const submitBtn = document.getElementById("signupSubmitBtn");
  const rawHandle = (document.getElementById("signupHandle")?.value || "").trim();
  const email = (document.getElementById("signupEmail")?.value || "").trim();
  const password = document.getElementById("signupPassword")?.value || "";
  const optInDrops = Boolean(document.getElementById("signupOptIn")?.checked);

  const showError = (msg) => {
    if (!errorBox) return;
    errorBox.textContent = msg;
    errorBox.classList.remove("hidden");
  };

  if (errorBox) errorBox.classList.add("hidden");

  if (!rawHandle) return showError("Please enter a username or handle.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showError("Please enter a valid email address.");
  if (password.length < 6) return showError("Password must be at least 6 characters long.");

  const formattedHandle = rawHandle.startsWith("@") ? rawHandle : `@${rawHandle}`;

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Creating Member Pass...";
  }

  try {
    // Submit signup to the Vercel serverless function connected to MongoDB Atlas
    const response = await fetch(SIGNUP_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle: formattedHandle, email, password, optInDrops }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || "Could not complete signup right now.");
    }

    currentMember = data.member;
    saveMember(currentMember);

    document.getElementById("signupForm")?.reset();
    updateMemberUI();
    showToast(`Welcome to raveyn's club, ${currentMember.handle}!`);
  } catch (err) {
    showError(err.message || "Something went wrong. Please try again.");
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Create Member Pass ✦";
    }
  }
}

/**
 * Handles returning member login against /api/login (MongoDB Atlas).
 */
async function handleLoginSubmit(event) {
  event.preventDefault();

  const errorBox = document.getElementById("loginError");
  const submitBtn = document.getElementById("loginSubmitBtn");
  const email = (document.getElementById("loginEmail")?.value || "").trim();
  const password = document.getElementById("loginPassword")?.value || "";

  const showError = (msg) => {
    if (!errorBox) return;
    errorBox.textContent = msg;
    errorBox.classList.remove("hidden");
  };

  if (errorBox) errorBox.classList.add("hidden");

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showError("Please enter a valid email address.");
  if (!password) return showError("Please enter your password.");

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Logging In...";
  }

  try {
    const response = await fetch(LOGIN_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || "Invalid email or password.");
    }

    currentMember = data.member;
    saveMember(currentMember);

    document.getElementById("loginForm")?.reset();
    updateMemberUI();
    showToast(`Welcome back, ${currentMember.handle}!`);
  } catch (err) {
    showError(err.message || "Could not log in right now. Please try again.");
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Log In ✦";
    }
  }
}

/**
 * Wires up all navigation, hash routing, and form listeners for Sign Up & Log In.
 */
export function initSignup() {
  const navLoginBtn = document.getElementById("navLoginBtn");
  const navSignupBtn = document.getElementById("navSignupBtn");
  const tabSignupBtn = document.getElementById("tabSignupBtn");
  const tabLoginBtn = document.getElementById("tabLoginBtn");
  const backToHubBtn = document.getElementById("backToHubBtn");
  const passBackBtn = document.getElementById("passBackBtn");
  const signOutBtn = document.getElementById("signOutBtn");
  const signupForm = document.getElementById("signupForm");
  const loginForm = document.getElementById("loginForm");
  const togglePasswordBtn = document.getElementById("togglePasswordBtn");
  const toggleLoginPasswordBtn = document.getElementById("toggleLoginPasswordBtn");

  if (navLoginBtn) {
    navLoginBtn.addEventListener("click", () => {
      window.location.hash = "login";
      showView("login");
    });
  }

  if (navSignupBtn) {
    navSignupBtn.addEventListener("click", () => {
      window.location.hash = "signup";
      showView("signup");
    });
  }

  if (tabSignupBtn) {
    tabSignupBtn.addEventListener("click", () => {
      window.location.hash = "signup";
      setAuthMode("signup");
    });
  }

  if (tabLoginBtn) {
    tabLoginBtn.addEventListener("click", () => {
      window.location.hash = "login";
      setAuthMode("login");
    });
  }

  const returnToHub = () => {
    history.replaceState(null, "", window.location.pathname);
    showView("hub");
  };

  if (backToHubBtn) backToHubBtn.addEventListener("click", returnToHub);
  if (passBackBtn) passBackBtn.addEventListener("click", returnToHub);

  // Clicking Music/Socials/Uploads in the header returns to the hub first
  document.querySelectorAll("[data-hub-link]").forEach((link) => {
    link.addEventListener("click", () => showView("hub"));
  });

  if (signupForm) signupForm.addEventListener("submit", handleSignupSubmit);
  if (loginForm) loginForm.addEventListener("submit", handleLoginSubmit);

  if (togglePasswordBtn) {
    togglePasswordBtn.addEventListener("click", () => {
      const pwInput = document.getElementById("signupPassword");
      if (!pwInput) return;
      const isHidden = pwInput.type === "password";
      pwInput.type = isHidden ? "text" : "password";
      togglePasswordBtn.textContent = isHidden ? "Hide" : "Show";
    });
  }

  if (toggleLoginPasswordBtn) {
    toggleLoginPasswordBtn.addEventListener("click", () => {
      const pwInput = document.getElementById("loginPassword");
      if (!pwInput) return;
      const isHidden = pwInput.type === "password";
      pwInput.type = isHidden ? "text" : "password";
      toggleLoginPasswordBtn.textContent = isHidden ? "Hide" : "Show";
    });
  }

  if (signOutBtn) {
    signOutBtn.addEventListener("click", () => {
      currentMember = null;
      saveMember(null);
      setAuthMode("login");
      showToast("Signed out of raveyn's club.");
    });
  }

  // Restore saved Member Pass UI on page load
  updateMemberUI();

  // Support direct links to /#signup and /#login
  const syncRouteFromHash = () => {
    if (window.location.hash === "#signup") {
      showView("signup");
    } else if (window.location.hash === "#login") {
      showView("login");
    }
  };
  window.addEventListener("hashchange", syncRouteFromHash);
  syncRouteFromHash();
}