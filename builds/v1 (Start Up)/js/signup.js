/**
 * ============================================================================
 * js/signup.js — CLUB SIGN UP, LOG IN & DIGITAL MEMBER PASS
 * Manages view switching, MongoDB Atlas signup/login requests, and persistent
 * member sessions stored in localStorage.
 * ============================================================================
 */
import { SIGNUP_API_URL, LOGIN_API_URL } from "./config.js";
import { showToast } from "./ui.js";

const STORAGE_KEY = "raveyns_club_member";

/**
 * Loads the saved member pass from localStorage if present.
 */
function loadSavedMember() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn("Unable to read saved member from localStorage:", err);
    return null;
  }
}

/**
 * Persists or clears the active member pass in localStorage.
 */
function saveMember(member) {
  try {
    if (member) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(member));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch (err) {
    console.warn("Unable to save member to localStorage:", err);
  }
}

let currentMember = loadSavedMember();
let authMode = "signup"; // "signup" | "login"

/**
 * Updates the Join Club / Log In tab styles and visible form panel.
 */
function setAuthMode(mode) {
  authMode = mode === "login" ? "login" : "signup";

  const signupFormView = document.getElementById("signupFormView");
  const loginFormView = document.getElementById("loginFormView");
  const tabSignupBtn = document.getElementById("tabSignupBtn");
  const tabLoginBtn = document.getElementById("tabLoginBtn");
  const signupError = document.getElementById("signupError");
  const loginError = document.getElementById("loginError");

  if (signupError) signupError.classList.add("hidden");
  if (loginError) loginError.classList.add("hidden");

  if (!currentMember) {
    if (signupFormView) signupFormView.classList.toggle("hidden", authMode !== "signup");
    if (loginFormView) loginFormView.classList.toggle("hidden", authMode !== "login");
  }

  const activeClasses = ["font-semibold", "text-white", "bg-fuchsia-500/25", "border-fuchsia-400/40"];
  const inactiveClasses = ["font-medium", "text-zinc-400", "border-transparent", "hover:text-zinc-200"];

  if (tabSignupBtn && tabLoginBtn) {
    if (authMode === "signup") {
      tabSignupBtn.classList.add(...activeClasses);
      tabSignupBtn.classList.remove(...inactiveClasses);
      tabLoginBtn.classList.add(...inactiveClasses);
      tabLoginBtn.classList.remove(...activeClasses);
    } else {
      tabLoginBtn.classList.add(...activeClasses);
      tabLoginBtn.classList.remove(...inactiveClasses);
      tabSignupBtn.classList.add(...inactiveClasses);
      tabSignupBtn.classList.remove(...activeClasses);
    }
  }
}

/**
 * Syncs the header buttons and Member Pass card with the current login state.
 */
function updateMemberUI() {
  const navLoginBtn = document.getElementById("navLoginBtn");
  const navSignupLabel = document.getElementById("navSignupLabel");
  const authTabs = document.getElementById("authTabs");
  const signupFormView = document.getElementById("signupFormView");
  const loginFormView = document.getElementById("loginFormView");
  const memberPassView = document.getElementById("memberPassView");

  if (currentMember) {
    if (navLoginBtn) navLoginBtn.classList.add("hidden");
    if (navSignupLabel) navSignupLabel.textContent = "Member Pass";
    if (authTabs) authTabs.classList.add("hidden");
    if (signupFormView) signupFormView.classList.add("hidden");
    if (loginFormView) loginFormView.classList.add("hidden");
    if (memberPassView) memberPassView.classList.remove("hidden");

    const passIdEl = document.getElementById("memberPassId");
    const passHandleEl = document.getElementById("memberPassHandle");
    const passEmailEl = document.getElementById("memberPassEmail");
    const passAlertsEl = document.getElementById("memberPassAlerts");

    if (passIdEl) passIdEl.textContent = currentMember.memberId || "#RV-0001";
    if (passHandleEl) passHandleEl.textContent = currentMember.handle || "@member";
    if (passEmailEl) passEmailEl.textContent = currentMember.email || "";
    if (passAlertsEl) {
      passAlertsEl.textContent = currentMember.optInDrops ? "Drops: Enabled" : "Drops: Off";
    }
  } else {
    if (navLoginBtn) navLoginBtn.classList.remove("hidden");
    if (navSignupLabel) navSignupLabel.textContent = "Join Club";
    if (authTabs) authTabs.classList.remove("hidden");
    if (memberPassView) memberPassView.classList.add("hidden");
    setAuthMode(authMode);
  }
}

/**
 * Switches between the main Artist Hub and the Sign Up / Log In / Member Pass page.
 */
function showView(view) {
  const hubMain = document.getElementById("top");
  const signupPage = document.getElementById("signupPage");
  if (!hubMain || !signupPage) return;

  if (view === "signup" || view === "login") {
    hubMain.classList.add("hidden");
    signupPage.classList.remove("hidden");
    if (!currentMember) {
      setAuthMode(view);
    } else {
      updateMemberUI();
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  } else {
    signupPage.classList.add("hidden");
    hubMain.classList.remove("hidden");
  }
}

/**
 * Handles new member signup against /api/signup (MongoDB Atlas).
 */
async function handleSignupSubmit(event) {
  event.preventDefault();

  const errorBox = document.getElementById("signupError");
  const submitBtn = document.getElementById("signupSubmitBtn");
  const handle = (document.getElementById("signupHandle")?.value || "").trim();
  const email = (document.getElementById("signupEmail")?.value || "").trim().toLowerCase();
  const password = document.getElementById("signupPassword")?.value || "";
  const optInDrops = Boolean(document.getElementById("signupOptIn")?.checked);

  const showError = (msg) => {
    if (!errorBox) return;
    errorBox.textContent = msg;
    errorBox.classList.remove("hidden");
  };

  if (errorBox) errorBox.classList.add("hidden");

  if (!handle) return showError("Please enter a username or handle.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return showError("Please enter a valid email address.");
  }
  if (password.length < 6) {
    return showError("Password must be at least 6 characters long.");
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Creating Member Pass...";
  }

  try {
    const response = await fetch(SIGNUP_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle, email, password, optInDrops }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || "Unable to complete signup. Please try again.");
    }

    currentMember = data.member;
    saveMember(currentMember);

    document.getElementById("signupForm")?.reset();
    updateMemberUI();
    showToast(`Welcome to raveyn's club, ${currentMember.handle}!`);
  } catch (err) {
    showError(err.message || "Could not create your member pass. Please try again.");
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Create Member Pass ✦";
    }
  }
}

/**
 * Handles returning member login (by email or username) against /api/login (MongoDB Atlas).
 */
async function handleLoginSubmit(event) {
  event.preventDefault();

  const errorBox = document.getElementById("loginError");
  const submitBtn = document.getElementById("loginSubmitBtn");
  const identifier = (document.getElementById("loginIdentifier")?.value || "").trim();
  const password = document.getElementById("loginPassword")?.value || "";

  const showError = (msg) => {
    if (!errorBox) return;
    errorBox.textContent = msg;
    errorBox.classList.remove("hidden");
  };

  if (errorBox) errorBox.classList.add("hidden");

  if (!identifier) return showError("Please enter your email or username.");
  if (!password) return showError("Please enter your password.");

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

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || "Invalid username/email or password.");
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
  const brandHomeLink = document.getElementById("brandHomeLink");
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

  if (brandHomeLink) {
    brandHomeLink.addEventListener("click", (event) => {
      event.preventDefault();
      returnToHub();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  if (backToHubBtn) backToHubBtn.addEventListener("click", returnToHub);
  if (passBackBtn) passBackBtn.addEventListener("click", returnToHub);

  // Clicking Socials/Uploads in the header returns to the hub first
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
      authMode = "login";
      updateMemberUI();
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