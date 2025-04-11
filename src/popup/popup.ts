/**
 * Knugget AI Popup Script
 * Manages the extension popup UI and interactions
 */

// Define user info interface
interface UserInfo {
  id: string;
  email: string;
  name: string;
  token: string;
  expiresAt: number;
  plan: string;
}

document.addEventListener("DOMContentLoaded", function () {
  // Get elements
  const loginPrompt = document.getElementById("login-prompt");
  const userInfo = document.getElementById("user-info");
  const userName = document.getElementById("user-name");
  const userPlan = document.getElementById("user-plan");
  const statusMessage = document.getElementById("status-message");
  const statusIcon = document.getElementById("status-icon");

  // Get buttons
  const loginBtn = document.getElementById("login-btn");
  const signupBtn = document.getElementById("signup-btn");
  const accountBtn = document.getElementById("account-btn");
  const logoutBtn = document.getElementById("logout-btn");
  const savedBtn = document.getElementById("saved-btn");
  const settingsBtn = document.getElementById("settings-btn");
  const feedbackBtn = document.getElementById("feedback-btn");
  const helpBtn = document.getElementById("help-btn");

  // Update manifest version
  const versionElement = document.querySelector(".version");
  if (versionElement) {
    versionElement.textContent = `v${chrome.runtime.getManifest().version}`;
  }

  // Check if we're on a YouTube page
  checkCurrentTab();

  // Check authentication status
  checkAuthStatus();

  // Add button event listeners
  loginBtn?.addEventListener("click", () => {
    openUrl("https://app.knugget.ai/login?source=extension");
  });

  signupBtn?.addEventListener("click", () => {
    openUrl("https://app.knugget.ai/signup?source=extension");
  });

  accountBtn?.addEventListener("click", () => {
    openUrl("https://app.knugget.ai/account?source=extension");
  });

  logoutBtn?.addEventListener("click", () => {
    logout();
  });

  savedBtn?.addEventListener("click", () => {
    openUrl("https://app.knugget.ai/summaries?source=extension");
  });

  settingsBtn?.addEventListener("click", () => {
    openUrl("https://app.knugget.ai/settings?source=extension");
  });

  feedbackBtn?.addEventListener("click", () => {
    openUrl("https://app.knugget.ai/feedback?source=extension");
  });

  helpBtn?.addEventListener("click", () => {
    openUrl("https://app.knugget.ai/help?source=extension");
  });

  /**
   * Check if we're on a YouTube page
   */
  function checkCurrentTab() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const currentTab = tabs[0];

      if (currentTab && currentTab.url) {
        const url = new URL(currentTab.url);

        if (url.hostname.includes("youtube.com")) {
          if (url.pathname.includes("/watch")) {
            if (statusMessage)
              statusMessage.textContent = "Active on this YouTube video";
            if (statusIcon) statusIcon.className = "status-active";
          } else {
            if (statusMessage)
              statusMessage.textContent = "Navigate to a YouTube video";
            if (statusIcon) statusIcon.className = "status-inactive";
          }
        } else {
          if (statusMessage)
            statusMessage.textContent = "Only works on YouTube videos";
          if (statusIcon) statusIcon.className = "status-inactive";
        }
      }
    });
  }

  /**
   * Check user authentication status
   */
  function checkAuthStatus() {
    chrome.storage.local.get(["knuggetUserInfo"], (result) => {
      if (result.knuggetUserInfo) {
        const userInfo = result.knuggetUserInfo as UserInfo;

        // Check if token is expired
        if (userInfo.expiresAt < Date.now()) {
          showLoginPrompt();
          return;
        }

        // Show user info
        showUserInfo(userInfo);
      } else {
        showLoginPrompt();
      }
    });
  }

  /**
   * Show login prompt
   */
  function showLoginPrompt() {
    loginPrompt?.classList.remove("hidden");
    userInfo?.classList.add("hidden");
  }

  /**
   * Show user info
   * @param {UserInfo} user User info object
   */
  function showUserInfo(user: UserInfo) {
    // Update user name
    if (userName) userName.textContent = user.name || user.email || "User";

    // Update user plan
    if (userPlan) {
      userPlan.textContent = user.plan || "Free";
      if (user.plan && user.plan.toLowerCase() === "premium") {
        userPlan.style.backgroundColor = "#8950fc";
      } else {
        userPlan.style.backgroundColor = "#00b894";
      }
    }

    // Show user info section
    loginPrompt?.classList.add("hidden");
    userInfo?.classList.remove("hidden");
  }

  /**
   * Open URL in new tab
   * @param {string} url URL to open
   */
  function openUrl(url: string) {
    chrome.tabs.create({ url });
  }

  /**
   * Log out user
   */
  function logout() {
    chrome.storage.local.remove(["knuggetUserInfo"], () => {
      // Notify content scripts and background
      chrome.runtime.sendMessage({
        type: "AUTH_STATE_CHANGED",
        payload: { isLoggedIn: false },
      });

      // Update UI
      showLoginPrompt();
    });
  }
});
