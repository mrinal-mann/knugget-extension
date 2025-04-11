/**
 * Knugget AI Background Script
 * Handles events from content scripts and manages authentication state
 */

// Import types from API file if needed
// import { UserInfo } from './api';

// Base URL for the Knugget website/app
const WEBSITE_BASE_URL = "https://app.knugget.ai";

// Record of open tabs that have the Knugget extension active
const activeTabsMap: Record<number, boolean> = {};

/**
 * Handle extension installation or update
 */
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    // Open onboarding page on install
    chrome.tabs.create({ url: `${WEBSITE_BASE_URL}/welcome?source=extension` });

    // Set default settings
    chrome.storage.local.set({
      knuggetSettings: {
        autoShowTranscript: true,
        darkMode: true,
        analyticsEnabled: true,
        version: chrome.runtime.getManifest().version,
      },
    });
  } else if (details.reason === "update") {
    // Check if it's a major update that needs attention
    const currentVersion = chrome.runtime.getManifest().version;
    const previousVersion = details.previousVersion || "";

    if (shouldShowUpdateNotice(currentVersion, previousVersion)) {
      // Show update notification
      chrome.notifications.create("update-notification", {
        type: "basic",
        iconUrl: "icons/icon128.png",
        title: "Knugget AI Updated",
        message: `Updated to version ${currentVersion} with new features and improvements!`,
        buttons: [{ title: "See What's New" }],
        priority: 2,
      });
    }

    // Update version in settings
    chrome.storage.local.get(["knuggetSettings"], (result) => {
      if (result.knuggetSettings) {
        chrome.storage.local.set({
          knuggetSettings: {
            ...result.knuggetSettings,
            version: currentVersion,
          },
        });
      }
    });
  }
});

/**
 * Handle notification clicks
 */
chrome.notifications.onButtonClicked.addListener(
  (notificationId, buttonIndex) => {
    if (notificationId === "update-notification" && buttonIndex === 0) {
      // Open changelog/what's new page
      chrome.tabs.create({
        url: `${WEBSITE_BASE_URL}/whats-new?version=${
          chrome.runtime.getManifest().version
        }`,
      });
    }
  }
);

/**
 * Handle messages from content scripts
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!sender.tab) {
    return false;
  }

  const tabId = sender.tab.id;

  switch (message.type) {
    case "PAGE_LOADED":
      if (tabId) {
        activeTabsMap[tabId] = true;
      }
      break;

    case "OPEN_LOGIN_PAGE":
      // Open login page in a new tab
      chrome.tabs.create({ url: `${WEBSITE_BASE_URL}/login?source=extension` });
      break;

    case "OPEN_SETTINGS":
      // Open settings page in a new tab
      chrome.tabs.create({
        url: `${WEBSITE_BASE_URL}/settings?source=extension`,
      });
      break;

    case "OPEN_FEEDBACK":
      // Open feedback page in a new tab
      chrome.tabs.create({
        url: `${WEBSITE_BASE_URL}/feedback?source=extension&url=${encodeURIComponent(
          message.payload?.url || ""
        )}`,
      });
      break;

    case "AUTH_STATE_CHANGED":
      // Broadcast auth state change to all active tabs
      Object.keys(activeTabsMap).forEach((id) => {
        const numId = parseInt(id, 10);
        if (activeTabsMap[numId]) {
          chrome.tabs
            .sendMessage(numId, {
              type: "AUTH_STATE_CHANGED",
              payload: message.payload,
            })
            .catch(() => {
              // Tab might be closed or not available anymore
              delete activeTabsMap[numId];
            });
        }
      });
      break;
  }

  return true;
});

/**
 * Handle tab close to clean up active tabs map
 */
chrome.tabs.onRemoved.addListener((tabId) => {
  if (activeTabsMap[tabId]) {
    delete activeTabsMap[tabId];
  }
});

/**
 * Check if we should show an update notice
 * @param currentVersion Current extension version
 * @param previousVersion Previous extension version
 * @returns Boolean indicating if update notice should be shown
 */
function shouldShowUpdateNotice(
  currentVersion: string,
  previousVersion: string
): boolean {
  if (!previousVersion) return false;

  // Parse versions
  const current = parseVersion(currentVersion);
  const previous = parseVersion(previousVersion);

  // Show notice for major or minor version changes
  return (
    current.major > previous.major ||
    (current.major === previous.major && current.minor > previous.minor)
  );
}

/**
 * Parse version string into components
 * @param version Version string (e.g., "1.2.3")
 * @returns Object with major, minor, and patch components
 */
function parseVersion(version: string): {
  major: number;
  minor: number;
  patch: number;
} {
  const parts = version.split(".").map((part) => parseInt(part, 10));

  return {
    major: parts[0] || 0,
    minor: parts[1] || 0,
    patch: parts[2] || 0,
  };
}

/**
 * Check for token refresh on startup
 */
chrome.runtime.onStartup.addListener(() => {
  // Check if token needs refresh
  chrome.storage.local.get(["knuggetUserInfo"], (result) => {
    if (result.knuggetUserInfo) {
      const userInfo = result.knuggetUserInfo;

      // Check if token is expired or about to expire
      if (userInfo.expiresAt < Date.now() + 300000) {
        // 5 minutes buffer
        // Refresh token
        fetch(`${WEBSITE_BASE_URL}/api/auth/refresh`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${userInfo.token}`,
          },
        })
          .then((response) => {
            if (response.ok) {
              return response.json();
            }
            throw new Error("Token refresh failed");
          })
          .then((data) => {
            // Update stored user info
            chrome.storage.local.set({ knuggetUserInfo: data });
          })
          .catch((error) => {
            console.error("Error refreshing token:", error);
            // If refresh fails, don't clear the token as it might still be valid
            // The API requests will handle authentication errors
          });
      }
    }
  });
});
