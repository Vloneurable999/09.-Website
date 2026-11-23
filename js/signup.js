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