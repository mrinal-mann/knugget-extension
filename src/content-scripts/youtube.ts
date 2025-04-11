// Define our UI elements' class and ID names
const UI_ELEMENTS = {
  SECONDARY_COLUMN: "secondary",
  CONTAINER_ID: "knugget-container",
  CONTAINER_CLASS: "knugget-extension knugget-summary-widget",
  DIAMOND_ICON_COLOR: "#00b894",
};

// Interface definitions for transcript data
interface TranscriptSegment {
  timestamp: string;
  text: string;
}

interface TranscriptResponse {
  success: boolean;
  data?: TranscriptSegment[];
  error?: string;
}

interface Summary {
  title: string;
  keyPoints: string[];
  fullSummary: string;
}

// Track the current video ID to detect changes
let currentVideoId: string | null = null;
let transcriptData: TranscriptSegment[] | null = null;
let summaryData: Summary | null = null;

// Base URL for the Knugget API - Update this to point to your backend
const API_BASE_URL = "http://localhost:3000/api"; // Changed to include /api path

// API endpoints - Make sure these match your backend routes
const ENDPOINTS = {
  LOGIN: "/auth/login",
  REGISTER: "/auth/register",
  REFRESH_TOKEN: "/auth/refresh",
  USER_PROFILE: "/auth/me", // Changed to match your route
  SUMMARIZE: "/summary/generate",
  SAVED_SUMMARIES: "/summary",
  SAVE_SUMMARY: "/summary/save",
};

// Waits for a DOM element to appear
const waitForElement = (
  selector: string,
  timeout = 10000
): Promise<Element> => {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);
      if (Date.now() - start >= timeout) return reject(`Timeout: ${selector}`);
      requestAnimationFrame(check);
    };
    check();
  });
};

// Clicks an element programmatically (invisible click)
const invisibleClick = (element: Element) => {
  element.dispatchEvent(
    new MouseEvent("click", { bubbles: true, cancelable: true })
  );
};

// Check if "No transcript" message is visible
function hasNoTranscriptMessage(): boolean {
  const noTranscriptSelectors = [
    "ytd-transcript-renderer yt-formatted-string",
    "ytd-transcript-body-renderer yt-formatted-string",
    "ytd-transcript-segment-list-renderer yt-formatted-string",
  ];

  for (const selector of noTranscriptSelectors) {
    const element = document.querySelector(selector);
    if (element?.textContent?.toLowerCase().includes("no transcript")) {
      return true;
    }
  }
  return false;
}

// Extracts the transcript from the engagement panel
async function extractTranscript(): Promise<TranscriptResponse> {
  try {
    // First check for "No transcript" message
    if (hasNoTranscriptMessage()) {
      throw new Error("No transcript available for this video");
    }

    // Check if transcript is already open and has segments
    const existingTranscript = document.querySelector(
      "ytd-transcript-segment-renderer"
    );
    if (existingTranscript) {
      const segments = Array.from(
        document.querySelectorAll("ytd-transcript-segment-renderer")
      );

      if (segments.length > 0) {
        const transcript = segments.map((seg) => {
          const timestampElement = seg.querySelector(".segment-timestamp");
          const textElement = seg.querySelector(".segment-text");

          const timestamp = timestampElement?.textContent?.trim() ?? "";
          const text = textElement?.textContent?.trim() ?? "";

          return { timestamp, text };
        });

        if (transcript.length > 0) {
          return { success: true, data: transcript };
        }
      }
    }

    // If we get here, we need to try opening the transcript
    // 1. Click the "...more" (expand) button to reveal transcript
    const expandButton = document.querySelector("tp-yt-paper-button#expand");
    if (expandButton) {
      invisibleClick(expandButton);
      await new Promise((res) => setTimeout(res, 500));
    }

    // 2. Wait and find the "Show transcript" button
    const transcriptButton = await waitForElement(
      'ytd-button-renderer button[aria-label="Show transcript"]'
    );
    if (!transcriptButton) throw new Error("Transcript button not found");

    invisibleClick(transcriptButton);
    await new Promise((res) => setTimeout(res, 1000));

    // Check again for "No transcript" message after opening
    if (hasNoTranscriptMessage()) {
      throw new Error("No transcript available for this video");
    }

    // 3. Wait for transcript segments to load
    await waitForElement("ytd-transcript-segment-renderer");
    await new Promise((res) => setTimeout(res, 1000));

    // 4. Extract transcript
    const segments = Array.from(
      document.querySelectorAll("ytd-transcript-segment-renderer")
    );

    if (segments.length === 0) {
      throw new Error("No transcript segments found");
    }

    const transcript = segments.map((seg) => {
      const timestampElement = seg.querySelector(".segment-timestamp");
      const textElement = seg.querySelector(".segment-text");

      const timestamp = timestampElement?.textContent?.trim() ?? "";
      const text = textElement?.textContent?.trim() ?? "";

      return { timestamp, text };
    });

    return { success: true, data: transcript };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    return { success: false, error: errorMessage };
  }
}

// Function to create transcript segment HTML
function createTranscriptSegmentHTML(segments: TranscriptSegment[]): string {
  if (!segments || segments.length === 0) {
    return `
      <div class="p-4 text-center">
        <p class="text-gray-400">No transcript segments found.</p>
      </div>
    `;
  }

  return segments
    .map(
      (segment) => `
      <div class="transcript-segment mb-3">
        <div class="flex">
          <span class="segment-timestamp text-teal-400 font-mono text-xs mr-2">${segment.timestamp}</span>
          <p class="segment-text text-gray-200 whitespace-pre-wrap">${segment.text}</p>
        </div>
      </div>
    `
    )
    .join("");
}

//Get authentication token from storage
async function getAuthToken(): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get(["knuggetUserInfo"], (result) => {
      if (result.knuggetUserInfo) {
        const userInfo = result.knuggetUserInfo;

        // Check if token is expired
        if (userInfo.expiresAt < Date.now()) {
          resolve(null);
        } else {
          resolve(userInfo.token);
        }
      } else {
        resolve(null);
      }
    });
  });
}

// Check if user is logged in
async function isUserLoggedIn(): Promise<boolean> {
  const token = await getAuthToken();
  return !!token;
}

// Generic API request function
async function apiRequest<T>(
  endpoint: string,
  method: string = "GET",
  data?: any,
  requiresAuth: boolean = true
): Promise<{
  success: boolean;
  data?: T;
  error?: string;
}> {
  try {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    // Add auth token if required
    if (requiresAuth) {
      const token = await getAuthToken();
      if (!token) {
        return {
          success: false,
          error: "Authentication required",
        };
      }
      headers["Authorization"] = `Bearer ${token}`;
    }

    // Make the request
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
    });

    // Handle network errors
    if (!response.ok) {
      // Try to get error from response
      let errorMessage: string;
      try {
        const errorResponse = await response.json();
        errorMessage =
          errorResponse.error ||
          `Request failed with status ${response.status}`;
      } catch (jsonError) {
        errorMessage = `Request failed with status ${response.status}`;
      }

      return {
        success: false,
        error: errorMessage,
      };
    }

    // Parse the JSON response
    const result = await response.json();

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

// Function to generate summary from transcript
async function generateSummary(
  transcript: TranscriptSegment[]
): Promise<Summary | null> {
  try {
    // Check if user is logged in
    const isLoggedIn = await isUserLoggedIn();
    if (!isLoggedIn) {
      return null;
    }

    // Get video metadata
    const videoUrl = window.location.href;
    const videoId = new URLSearchParams(window.location.search).get("v") || "";
    const videoTitle = document.querySelector("h1.title")?.textContent || "";

    // Format transcript for API
    const transcriptText = transcript.map((segment) => segment.text).join(" ");

    // Call the summarize API with the format your backend expects
    const response = await apiRequest<Summary>(ENDPOINTS.SUMMARIZE, "POST", {
      videoUrl,
      transcript: transcriptText,
      title: videoTitle,
    });

    if (!response.success || !response.data) {
      throw new Error(response.error || "Failed to generate summary");
    }

    return response.data;
  } catch (error) {
    console.error("Summary generation error:", error);
    return null;
  }
}

// Function to save a summary
async function saveSummary(summary: Summary): Promise<boolean> {
  try {
    // Get video metadata
    const videoUrl = window.location.href;
    const videoId = new URLSearchParams(window.location.search).get("v") || "";

    // Format data for API
    const saveData = {
      videoUrl,
      videoId,
      title: summary.title,
      keyPoints: summary.keyPoints,
      fullSummary: summary.fullSummary,
    };

    const response = await apiRequest(ENDPOINTS.SAVE_SUMMARY, "POST", saveData);
    return response.success;
  } catch (error) {
    console.error("Error saving summary:", error);
    return false;
  }
}

// Function to show loading state in transcript/summary container
function showLoading(
  contentElement: HTMLElement,
  message: string = "Loading"
): void {
  contentElement.innerHTML = `
    <div class="flex flex-col items-center justify-center p-6 text-center">
      <div class="knugget-spinner mb-4 w-8 h-8 border-2 border-t-2 border-teal-400 border-t-transparent rounded-full animate-spin"></div>
      <p class="text-base font-medium text-gray-200 mb-1">${message}</p>
      <p class="text-sm text-gray-400">Please wait...</p>
    </div>
  `;
}

// Function to show error state in container
function showError(
  contentElement: HTMLElement,
  errorMessage: string,
  retryFunction?: () => void
): void {
  contentElement.innerHTML = `
    <div class="flex flex-col items-center justify-center p-6 text-center">
      <div class="mb-4 text-red-400">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5"/>
          <path d="M12 7V13M12 16V16.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </div>
      <p class="text-base font-medium text-gray-200 mb-1">Error</p>
      <p class="text-sm text-gray-400 mb-4">${errorMessage}</p>
      ${
        retryFunction
          ? `
        <button id="retry-btn" class="bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-5 py-2 rounded-md inline-flex items-center">
          Try Again
        </button>
      `
          : ""
      }
    </div>
  `;

  // Add retry button event listener if function provided
  if (retryFunction) {
    const retryButton = document.getElementById("retry-btn");
    if (retryButton) {
      retryButton.addEventListener("click", retryFunction);
    }
  }
}

// Function to show login required state for summary tab
// Function to show login required state for summary tab
function showLoginRequired(summaryContentElement: HTMLElement): void {
  summaryContentElement.innerHTML = `
    <div class="flex flex-col items-center justify-center p-6 text-center">
      <div class="mb-4 text-teal-400">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5"/>
          <path d="M8 12H16M12 8V16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </div>
      <p class="text-base font-medium text-gray-200 mb-1">Log in Required</p>
      <p class="text-sm text-gray-400 mb-4">Please log in to access the summary feature.</p>
      <button id="knugget-login-btn" class="bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-5 py-2 rounded-md inline-flex items-center">
        <svg class="mr-2" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12Z" stroke="white" stroke-width="2"/>
          <path d="M12 8V16M8 12H16" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Log in Now
      </button>
    </div>
  `;

  // Add login button event listener
  const loginButton = document.getElementById("knugget-login-btn");
  if (loginButton) {
    loginButton.addEventListener("click", () => {
      // Open login page or show login modal
      chrome.runtime.sendMessage({ type: "OPEN_LOGIN_PAGE" });
    });
  }
}

// Function to display summary
function displaySummary(
  summaryContentElement: HTMLElement,
  summary: Summary
): void {
  // Create HTML for key points
  const keyPointsHTML = summary.keyPoints
    .map(
      (point) => `<li class="mb-2 flex items-start">
                     <span class="inline-block mr-2 text-teal-400">•</span>
                     <span>${point}</span>
                   </li>`
    )
    .join("");

  summaryContentElement.innerHTML = `
    <div class="p-4">
      <h3 class="text-lg font-medium text-gray-200 mb-3">${
        summary.title || "Summary"
      }</h3>
      
      <div class="mb-4">
        <h4 class="text-md font-medium text-gray-300 mb-2">Key Points</h4>
        <ul class="list-none pl-1 text-gray-200">
          ${keyPointsHTML}
        </ul>
      </div>
      
      <div>
        <h4 class="text-md font-medium text-gray-300 mb-2">Summary</h4>
        <p class="text-gray-200 whitespace-pre-wrap">${summary.fullSummary}</p>
      </div>

      <div class="mt-4 flex justify-end">
        <button id="save-summary-btn" class="bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium px-3 py-1 rounded-md inline-flex items-center">
          <svg class="mr-1" width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 18.8V5.2C4 4.0799 4 3.51984 4.21799 3.09202C4.40973 2.71569 4.71569 2.40973 5.09202 2.21799C5.51984 2 6.0799 2 7.2 2H16.8C17.9201 2 18.4802 2 18.908 2.21799C19.2843 2.40973 19.5903 2.71569 19.782 3.09202C20 3.51984 20 4.0799 20 5.2V18.8C20 19.9201 20 20.4802 19.782 20.908C19.5903 21.2843 19.2843 21.5903 18.908 21.782C18.4802 22 17.9201 22 16.8 22H7.2C6.0799 22 5.51984 22 5.09202 21.782C4.71569 21.5903 4.40973 21.2843 4.21799 20.908C4 20.4802 4 19.9201 4 18.8Z" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M8 2V7.2C8 7.48132 8 7.62196 8.01636 7.73828C8.08962 8.23314 8.46686 8.61038 8.96172 8.68364C9.07804 8.7 9.21869 8.7 9.5 8.7H14.5C14.7814 8.7 14.922 8.7 15.0383 8.68364C15.5332 8.61038 15.9103 8.23314 15.9836 7.73828C16 7.62196 16 7.48132 16 7.2V2" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Save Summary
        </button>
      </div>
    </div>
  `;

  // Add save button event listener
  const saveButton = document.getElementById("save-summary-btn");
  if (saveButton) {
    saveButton.addEventListener("click", async () => {
      try {
        (saveButton as HTMLButtonElement).disabled = true;
        saveButton.innerHTML = `
          <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Saving...
        `;

        // Call API to save summary
        const response = await apiRequest(
          ENDPOINTS.SAVE_SUMMARY,
          "POST",
          summary
        );

        if (response.success) {
          saveButton.innerHTML = `
            <svg class="mr-1" width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Saved
          `;
        } else {
          saveButton.innerHTML = `
            <svg class="mr-1" width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 18.8V5.2C4 4.0799 4 3.51984 4.21799 3.09202C4.40973 2.71569 4.71569 2.40973 5.09202 2.21799C5.51984 2 6.0799 2 7.2 2H16.8C17.9201 2 18.4802 2 18.908 2.21799C19.2843 2.40973 19.5903 2.71569 19.782 3.09202C20 3.51984 20 4.0799 20 5.2V18.8C20 19.9201 20 20.4802 19.782 20.908C19.5903 21.2843 19.2843 21.5903 18.908 21.782C18.4802 22 17.9201 22 16.8 22H7.2C6.0799 22 5.51984 22 5.09202 21.782C4.71569 21.5903 4.40973 21.2843 4.21799 20.908C4 20.4802 4 19.9201 4 18.8Z" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M8 2V7.2C8 7.48132 8 7.62196 8.01636 7.73828C8.08962 8.23314 8.46686 8.61038 8.96172 8.68364C9.07804 8.7 9.21869 8.7 9.5 8.7H14.5C14.7814 8.7 14.922 8.7 15.0383 8.68364C15.5332 8.61038 15.9103 8.23314 15.9836 7.73828C16 7.62196 16 7.48132 16 7.2V2" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Save Summary
          `;
          (saveButton as HTMLButtonElement).disabled = false;

          // Show error notification
          const notification = document.createElement("div");
          notification.className =
            "fixed top-4 right-4 bg-red-500 text-white px-4 py-2 rounded shadow-lg z-50";
          notification.textContent = response.error || "Failed to save summary";
          document.body.appendChild(notification);

          setTimeout(() => {
            notification.remove();
          }, 3000);
        }
      } catch (error) {
        console.error("Error saving summary:", error);
        (saveButton as HTMLButtonElement).disabled = false;
        saveButton.innerHTML = `
          <svg class="mr-1" width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 18.8V5.2C4 4.0799 4 3.51984 4.21799 3.09202C4.40973 2.71569 4.71569 2.40973 5.09202 2.21799C5.51984 2 6.0799 2 7.2 2H16.8C17.9201 2 18.4802 2 18.908 2.21799C19.2843 2.40973 19.5903 2.71569 19.782 3.09202C20 3.51984 20 4.0799 20 5.2V18.8C20 19.9201 20 20.4802 19.782 20.908C19.5903 21.2843 19.2843 21.5903 18.908 21.782C18.4802 22 17.9201 22 16.8 22H7.2C6.0799 22 5.51984 22 5.09202 21.782C4.71569 21.5903 4.40973 21.2843 4.21799 20.908C4 20.4802 4 19.9201 4 18.8Z" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M8 2V7.2C8 7.48132 8 7.62196 8.01636 7.73828C8.08962 8.23314 8.46686 8.61038 8.96172 8.68364C9.07804 8.7 9.21869 8.7 9.5 8.7H14.5C14.7814 8.7 14.922 8.7 15.0383 8.68364C15.5332 8.61038 15.9103 8.23314 15.9836 7.73828C16 7.62196 16 7.48132 16 7.2V2" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Save Summary
        `;
      }
    });
  }
}

// Function to load and display transcript
async function loadAndDisplayTranscript(): Promise<void> {
  console.log("Knugget AI: Loading and displaying transcript");

  const transcriptContentElement =
    document.getElementById("transcript-content");
  if (!transcriptContentElement) return;

  // Show loading state
  showLoading(transcriptContentElement, "Loading Transcript");

  try {
    // Add a small delay to ensure YouTube has fully loaded
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Extract transcript data
    const transcriptResponse = await extractTranscript();

    if (!transcriptResponse.success || !transcriptResponse.data) {
      throw new Error(
        transcriptResponse.error || "Failed to extract transcript"
      );
    }

    // Store transcript data for summary generation
    transcriptData = transcriptResponse.data;

    // Create transcript segments HTML and inject into content
    const segmentsHTML = createTranscriptSegmentHTML(transcriptResponse.data);
    transcriptContentElement.innerHTML = `
      <div class="space-y-2 p-2">
        ${segmentsHTML}
      </div>
    `;

    console.log("Transcript loaded successfully");
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("Transcript extraction error:", errorMessage);
    showError(transcriptContentElement, errorMessage, loadAndDisplayTranscript);
  }
}
// Function to load and display summary
async function loadAndDisplaySummary(): Promise<void> {
  console.log("Knugget AI: Loading and displaying summary");

  const summaryContentElement = document.getElementById("summary-content");
  if (!summaryContentElement) return;

  // First, check if user is logged in
  const isLoggedIn = await isUserLoggedIn();
  if (!isLoggedIn) {
    showLoginRequired(summaryContentElement);
    return;
  }

  // Show loading state
  showLoading(summaryContentElement, "Generating Summary");

  try {
    // Check if we have transcript data
    if (!transcriptData) {
      // Try to load transcript first
      await loadAndDisplayTranscript();

      // Check again if we have transcript data
      if (!transcriptData) {
        throw new Error("No transcript data available for summarization");
      }
    }

    // Check if we already have a summary for this video
    if (summaryData) {
      displaySummary(summaryContentElement, summaryData);
      return;
    }

    // Get video metadata
    const videoUrl = window.location.href;
    const videoId = new URLSearchParams(window.location.search).get("v") || "";
    const videoTitle =
      document.querySelector("h1.title")?.textContent?.trim() || "";

    // Format transcript for API
    const transcriptText = transcriptData
      .map((segment) => segment.text)
      .join(" ");

    // Call the summarize API with the format your backend expects
    const response = await apiRequest<Summary>(ENDPOINTS.SUMMARIZE, "POST", {
      videoUrl,
      transcript: transcriptText,
      title: videoTitle,
    });

    if (!response.success || !response.data) {
      throw new Error(response.error || "Failed to generate summary");
    }

    // Store summary data
    summaryData = response.data;

    // Display the summary
    displaySummary(summaryContentElement, response.data);

    console.log("Summary loaded successfully");
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("Summary generation error:", errorMessage);
    showError(summaryContentElement, errorMessage, loadAndDisplaySummary);
  }
}

// Main function to initialize the extension
function initKnuggetAI(): void {
  console.log("Knugget AI: Initializing extension");

  // Check if we're on a YouTube watch page
  if (!window.location.pathname.includes("/watch")) {
    return;
  }

  // Get current video ID
  const videoId = new URLSearchParams(window.location.search).get("v");

  // Set up URL change detection only once
  setupURLChangeDetection();

  // Process the current page
  processCurrentPage(videoId);
}

// Process the current page
function processCurrentPage(videoId: string | null): void {
  console.log(`Knugget AI: Processing page for video ID ${videoId}`);

  // Update current video ID
  currentVideoId = videoId;

  // Reset data for new video
  transcriptData = null;
  summaryData = null;

  // Notify background script
  chrome.runtime.sendMessage({
    type: "PAGE_LOADED",
    payload: { url: window.location.href },
  });

  // Remove any existing panel
  const existingPanel = document.getElementById(UI_ELEMENTS.CONTAINER_ID);
  if (existingPanel) {
    existingPanel.remove();
  }

  // Start observing the DOM for the secondary column to appear
  observeYouTubeDOM();
}

// Set up URL change detection for SPA navigation (only call this once)
function setupURLChangeDetection(): void {
  // Check if we've already set up the listeners
  if ((window as any)._knuggetURLChangeListenersSet) {
    return;
  }

  console.log("Knugget AI: Setting up URL change detection");

  // Mark that we've set up the listeners
  (window as any)._knuggetURLChangeListenersSet = true;

  // Use history.pushState and replaceState overrides to detect navigation
  const originalPushState = history.pushState;
  history.pushState = function () {
    originalPushState.apply(this, arguments as any);
    setTimeout(handleURLChange, 100); // Small delay to ensure URL is updated
  };

  const originalReplaceState = history.replaceState;
  history.replaceState = function () {
    originalReplaceState.apply(this, arguments as any);
    setTimeout(handleURLChange, 100); // Small delay to ensure URL is updated
  };

  // Also listen for popstate events (back/forward navigation)
  window.addEventListener("popstate", () => {
    setTimeout(handleURLChange, 100); // Small delay to ensure URL is updated
  });

  // Listen for yt-navigate-finish which is YouTube's custom event for navigation completion
  document.addEventListener("yt-navigate-finish", () => {
    console.log("Knugget AI: yt-navigate-finish event detected");
    setTimeout(handleURLChange, 300); // Give YouTube a bit more time to finish rendering
  });
}

// Handle URL changes
function handleURLChange(): void {
  // Check if we're on a watch page
  if (!window.location.pathname.includes("/watch")) {
    return;
  }

  // Get the new video ID
  const newVideoId = new URLSearchParams(window.location.search).get("v");

  // If the video ID has changed, reinitialize the extension
  if (newVideoId && newVideoId !== currentVideoId) {
    console.log(
      `Knugget AI: Video changed from ${currentVideoId} to ${newVideoId}`
    );
    processCurrentPage(newVideoId);
  }
}

// Function to observe YouTube DOM changes and inject our panel
function observeYouTubeDOM(): void {
  console.log("Knugget AI: Observing DOM for secondary column");

  // Try to find the secondary column immediately first
  const secondaryColumn = document.getElementById(UI_ELEMENTS.SECONDARY_COLUMN);
  if (secondaryColumn && !document.getElementById(UI_ELEMENTS.CONTAINER_ID)) {
    injectKnuggetPanel(secondaryColumn);
    return;
  }

  // If not found, set up an observer
  const observer = new MutationObserver((mutations: MutationRecord[]): void => {
    // Look for the secondary column where we'll inject our UI
    const secondaryColumn = document.getElementById(
      UI_ELEMENTS.SECONDARY_COLUMN
    );
    if (secondaryColumn && !document.getElementById(UI_ELEMENTS.CONTAINER_ID)) {
      injectKnuggetPanel(secondaryColumn);
      observer.disconnect();
    }
  });

  // Start observing
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Set a timeout to stop observing after 10 seconds to prevent memory leaks
  setTimeout(() => {
    observer.disconnect();
  }, 10000);
}

// Function to inject our panel
function injectKnuggetPanel(targetElement: HTMLElement): void {
  console.log("Knugget AI: Injecting panel");

  // Create our container
  const knuggetContainer = document.createElement("div");
  knuggetContainer.id = UI_ELEMENTS.CONTAINER_ID;
  knuggetContainer.className = UI_ELEMENTS.CONTAINER_CLASS;

  // Extract video ID from URL for potential API calls
  const videoId = new URLSearchParams(window.location.search).get("v") || "";

  // Create the improved UI with modern design
  knuggetContainer.innerHTML = `
  <div class="knugget-box bg-black min-w-[320px] rounded-lg shadow-lg border border-gray-800 overflow-hidden mb-4">
    <!-- Header with diamond icon -->
    <div class="flex justify-between items-center py-3 px-4 border-b border-gray-800">
      <div class="flex items-center">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="mr-2">
          <path d="M12 2L22 12L12 22L2 12L12 2Z" fill="${UI_ELEMENTS.DIAMOND_ICON_COLOR}"/>
        </svg>
        <span class="text-gray-200 font-medium text-sm">Knugget AI</span>
      </div>
      <div>
        <button id="knugget-settings-btn" class="text-gray-400 hover:text-gray-200">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
        </button>
      </div>
    </div>
    
    <!-- Tabs -->
    <div class="flex border-b border-gray-800">
      <button id="transcript-tab" class="flex-1 py-3 px-4 text-center text-sm font-medium bg-gray-900 text-white border-b-2 border-teal-500">
        Transcript
      </button>
      <button id="summary-tab" class="flex-1 py-3 px-4 text-center text-sm font-medium bg-black text-gray-400 border-b-2 border-transparent">
        Summary
      </button>
    </div>
    
    <!-- Content area -->
    <div class="knugget-content-area">
      <!-- Transcript content -->
      <div id="transcript-content" class="bg-black text-gray-200 max-h-[400px] overflow-y-auto">
        <!-- Transcript will be loaded here -->
        <div class="flex flex-col items-center justify-center p-6 text-center">
          <div class="knugget-spinner mb-4 w-8 h-8 border-2 border-t-2 border-teal-400 border-t-transparent rounded-full animate-spin"></div>
          <p class="text-base font-medium text-gray-200 mb-1">Loading Transcript</p>
          <p class="text-sm text-gray-400">Please wait while we load the transcript...</p>
        </div>
      </div>
      
      <!-- Summary content (initially hidden) -->
      <div id="summary-content" class="hidden bg-black text-gray-200 max-h-[400px] overflow-y-auto">
        <!-- Summary login prompt will be loaded here -->
      </div>
    </div>

    <!-- Footer -->
    <div class="py-2 px-4 border-t border-gray-800 flex justify-between items-center">
      <div class="text-xs text-gray-500">
        Powered by Knugget AI
      </div>
      <div>
        <a href="#" id="knugget-feedback" class="text-xs text-teal-500 hover:text-teal-400">Send feedback</a>
      </div>
    </div>
  </div>
  `;

  // Add the container to the target element
  targetElement.prepend(knuggetContainer);

  // Set up event listeners
  setupPanelEventListeners();

  // Load transcript by default
  loadAndDisplayTranscript();
}

// Add styles
function addStyles(): void {
  const style = document.createElement("style");
  style.textContent = `
    .knugget-extension {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      margin-bottom: 16px;
    }
    
    .knugget-box {
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
    }
    
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    
    .knugget-spinner {
      animation: spin 1s linear infinite;
    }
    
    .transcript-segment {
      padding: 6px 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      transition: background-color 0.2s;
    }
    
    .transcript-segment:hover {
      background-color: rgba(255, 255, 255, 0.05);
    }
    
    .segment-timestamp {
      min-width: 50px;
      color: #00b894;
      font-family: monospace;
      font-weight: 500;
    }
    
    #transcript-content, #summary-content {
      scrollbar-width: thin;
      scrollbar-color: rgba(0, 184, 148, 0.5) rgba(0, 0, 0, 0.1);
      padding: 8px 0;
    }
    
    #transcript-content::-webkit-scrollbar,
    #summary-content::-webkit-scrollbar {
      width: 6px;
    }
    
    #transcript-content::-webkit-scrollbar-track,
    #summary-content::-webkit-scrollbar-track {
      background: rgba(0, 0, 0, 0.1);
    }
    
    #transcript-content::-webkit-scrollbar-thumb,
    #summary-content::-webkit-scrollbar-thumb {
      background-color: rgba(0, 184, 148, 0.5);
      border-radius: 6px;
    }
    
    #transcript-tab, #summary-tab {
      transition: all 0.2s ease;
      position: relative;
    }
    
    #summary-tab:hover, #transcript-tab:hover {
      background-color: rgba(255, 255, 255, 0.05);
    }
    
    button {
      cursor: pointer;
    }
    
    .knugget-extension button:hover {
      opacity: 0.9;
    }
    
    /* Summary styling */
    #summary-content h3 {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 12px;
      padding: 0 12px;
    }
    
    #summary-content h4 {
      font-size: 14px;
      font-weight: 500;
      margin-bottom: 8px;
      padding: 0 12px;
      color: #00b894;
    }
    
    #summary-content ul {
      margin-left: 12px;
      margin-right: 12px;
      margin-bottom: 16px;
    }
    
    #summary-content p {
      padding: 0 12px;
      line-height: 1.5;
      margin-bottom: 12px;
    }
    
    /* Button styling */
    #knugget-login-btn, #save-summary-btn, #retry-btn {
      background-color: #00b894;
      transition: background-color 0.2s ease;
    }
    
    #knugget-login-btn:hover, #save-summary-btn:hover, #retry-btn:hover {
      background-color: #00a884;
    }
    
    /* Diamond icon pulsing animation */
    @keyframes pulse {
      0% {
        transform: scale(1);
      }
      50% {
        transform: scale(1.05);
      }
      100% {
        transform: scale(1);
      }
    }
    
    .knugget-box svg path[fill="${UI_ELEMENTS.DIAMOND_ICON_COLOR}"] {
      animation: pulse 2s infinite ease-in-out;
    }
  `;
  document.head.appendChild(style);
}

// Function to set up panel event listeners
function setupPanelEventListeners(): void {
  // Tab switching
  const transcriptTab = document.getElementById("transcript-tab");
  const summaryTab = document.getElementById("summary-tab");
  const transcriptContent = document.getElementById("transcript-content");
  const summaryContent = document.getElementById("summary-content");

  if (transcriptTab && summaryTab && transcriptContent && summaryContent) {
    transcriptTab.addEventListener("click", () => {
      // Update tab styling
      transcriptTab.classList.add(
        "bg-gray-900",
        "text-white",
        "border-teal-500"
      );
      transcriptTab.classList.remove(
        "bg-black",
        "text-gray-400",
        "border-transparent"
      );
      summaryTab.classList.remove(
        "bg-gray-900",
        "text-white",
        "border-teal-500"
      );
      summaryTab.classList.add(
        "bg-black",
        "text-gray-400",
        "border-transparent"
      );

      // Show transcript, hide summary
      transcriptContent.classList.remove("hidden");
      summaryContent.classList.add("hidden");
    });

    summaryTab.addEventListener("click", () => {
      // Update tab styling
      summaryTab.classList.add("bg-gray-900", "text-white", "border-teal-500");
      summaryTab.classList.remove(
        "bg-black",
        "text-gray-400",
        "border-transparent"
      );
      transcriptTab.classList.remove(
        "bg-gray-900",
        "text-white",
        "border-teal-500"
      );
      transcriptTab.classList.add(
        "bg-black",
        "text-gray-400",
        "border-transparent"
      );

      // Show summary, hide transcript
      summaryContent.classList.remove("hidden");
      transcriptContent.classList.add("hidden");

      // Load summary data if needed
      if (!summaryData) {
        loadAndDisplaySummary();
      }
    });
  }

  // Settings button listener
  const settingsButton = document.getElementById("knugget-settings-btn");
  if (settingsButton) {
    settingsButton.addEventListener("click", () => {
      // Open settings page or modal
      chrome.runtime.sendMessage({ type: "OPEN_SETTINGS" });
    });
  }

  // Feedback link listener
  const feedbackLink = document.getElementById("knugget-feedback");
  if (feedbackLink) {
    feedbackLink.addEventListener("click", (e) => {
      e.preventDefault();
      chrome.runtime.sendMessage({ type: "OPEN_FEEDBACK" });
    });
  }
}

// Initialize the extension when the page loads
document.addEventListener("DOMContentLoaded", () => {
  addStyles();
  initKnuggetAI();
});

// Also initialize when the page is already loaded (for SPA navigation)
if (
  document.readyState === "complete" ||
  document.readyState === "interactive"
) {
  addStyles();
  initKnuggetAI();
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "AUTH_STATE_CHANGED") {
    // If user logged in or out, refresh the summary tab if it's visible
    const summaryContent = document.getElementById("summary-content");
    const summaryTab = document.getElementById("summary-tab");

    if (summaryContent && !summaryContent.classList.contains("hidden")) {
      loadAndDisplaySummary();
    }
  }
});
