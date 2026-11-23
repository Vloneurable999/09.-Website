/**
 * ============================================================================
 * js/signup.js — CLUB SIGN UP & MEMBER PASS MODULE
 * Manages view switching (Hub <-> Sign Up), validation, Railway POST, and Member Pass UI.
 * ============================================================================
 */
import { RAILWAY_SIGNUP_API_URL } from "./config.js";
import { showToast } from "./ui.js";

let currentMember = null;

/**
 * Switches between the main Artist Hub view and the dedicated Sign Up page.
 */
export function showView(view) {
  const hubMain = document.getElementById("top");
  const signupPage = document.getElementById("signupPage");
  if (!hubMain || !signupPage) return;

  if (view === "signup") {
    hubMain.classList.add("hidden");
    signupPage.classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  } else {
    signupPage.classList.add("hidden");
    hubMain.classList.remove("hidden");
  }
}

/**
 * Updates the Sign Up / Member Pass UI based on current in-memory session state.
 */
function updateMemberUI() {
  const navLabel = document.getElementById("navSignupLabel");
  const formView = document.getElementById("signupFormView");
  const passView = document.getElementById("memberPassView");

  if (currentMember) {
    if (navLabel) navLabel.textContent = currentMember.handle;
    if (formView) formView.classList.add("hidden");
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
    if (navLabel) navLabel.textContent = "Join Club";
    if (passView) passView.classList.add("hidden");
    if (formView) formView.classList.remove("hidden");
  }
}

/**
 * Handles club signup form validation, optional Railway POST, and member pass creation.
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
    // If a Railway backend endpoint is configured, submit the signup there
    if (RAILWAY_SIGNUP_API_URL) {
      const response = await fetch(RAILWAY_SIGNUP_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: formattedHandle, email, password, optInDrops }),
      });
      if (!response.ok) throw new Error("Could not complete signup right now.");
    }

    const randomNum = String(Math.floor(1000 + Math.random() * 9000));
    currentMember = {
      memberId: `#RV-${randomNum}`,
      handle: formattedHandle,
      email,
      optInDrops,
    };

    document.getElementById("signupForm")?.reset();
    updateMemberUI();
    showToast(`Welcome to raveyn's club, ${formattedHandle}!`);
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
 * Wires up all navigation, hash routing, and form listeners for the Sign Up page.
 */
export function initSignup() {
  const navSignupBtn = document.getElementById("navSignupBtn");
  const backToHubBtn = document.getElementById("backToHubBtn");
  const passBackBtn = document.getElementById("passBackBtn");
  const signOutBtn = document.getElementById("signOutBtn");
  const signupForm = document.getElementById("signupForm");
  const togglePasswordBtn = document.getElementById("togglePasswordBtn");

  if (navSignupBtn) {
    navSignupBtn.addEventListener("click", () => {
      window.location.hash = "signup";
      showView("signup");
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

  if (togglePasswordBtn) {
    togglePasswordBtn.addEventListener("click", () => {
      const pwInput = document.getElementById("signupPassword");
      if (!pwInput) return;
      const isHidden = pwInput.type === "password";
      pwInput.type = isHidden ? "text" : "password";
      togglePasswordBtn.textContent = isHidden ? "Hide" : "Show";
    });
  }

  if (signOutBtn) {
    signOutBtn.addEventListener("click", () => {
      currentMember = null;
      updateMemberUI();
      showToast("Signed out of raveyn's club.");
    });
  }

  // Support direct links to /#signup
  const syncRouteFromHash = () => {
    if (window.location.hash === "#signup") {
      showView("signup");
    }
  };
  window.addEventListener("hashchange", syncRouteFromHash);
  syncRouteFromHash();
}