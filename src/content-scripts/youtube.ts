// Define our UI elements' class and ID names
const UI_ELEMENTS = {
  SECONDARY_COLUMN: "secondary",
  CONTAINER_ID: "knugget-container",
  CONTAINER_CLASS: "knugget-extension knugget-summary-widget",
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

// Track the current video ID to detect changes
let currentVideoId: string | null = null;

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
  history.pushState = function() {
    originalPushState.apply(this, arguments as any);
    setTimeout(handleURLChange, 100); // Small delay to ensure URL is updated
  };

  const originalReplaceState = history.replaceState;
  history.replaceState = function() {
    originalReplaceState.apply(this, arguments as any);
    setTimeout(handleURLChange, 100); // Small delay to ensure URL is updated
  };

  // Also listen for popstate events (back/forward navigation)
  window.addEventListener('popstate', () => {
    setTimeout(handleURLChange, 100); // Small delay to ensure URL is updated
  });
  
  // Listen for yt-navigate-finish which is YouTube's custom event for navigation completion
  document.addEventListener('yt-navigate-finish', () => {
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
    console.log(`Knugget AI: Video changed from ${currentVideoId} to ${newVideoId}`);
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

// Function to create transcript segment HTML
function createTranscriptSegmentHTML(segments: TranscriptSegment[]): string {
  if (!segments || segments.length === 0) {
    return `
      <div class="p-4 text-center">
        <p class="text-gray-500">No transcript segments found.</p>
      </div>
    `;
  }

  return segments
    .map(
      (segment) => `
      <div class="transcript-segment">
        <div class="flex">
          <span class="segment-timestamp">${segment.timestamp}</span>
          <p class="segment-text knugget-transcript-text">${segment.text}</p>
        </div>
      </div>
    `
    )
    .join("");
}

// Function to show loading state in transcript container
function showTranscriptLoading(transcriptContentElement: HTMLElement): void {
  transcriptContentElement.innerHTML = `
    <div class="knugget-loading">
      <div class="knugget-spinner"></div>
    </div>
    <div class="flex flex-col items-center justify-center p-6 text-center">
      <p class="text-base font-medium text-gray-900 mb-1">Loading Transcript</p>
      <p class="text-sm text-gray-500">Please wait while we load the transcript...</p>
    </div>
  `;
}

// Function to show error state in transcript container
function showTranscriptError(transcriptContentElement: HTMLElement, errorMessage: string): void {
  transcriptContentElement.innerHTML = `
    <div class="flex flex-col items-center justify-center p-6 text-center">
      <div class="mb-4 text-red-500">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5"/>
          <path d="M12 7V13M12 16V16.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </div>
      <p class="text-base font-medium text-gray-900 mb-1">Transcript Error</p>
      <p class="text-sm text-gray-500 mb-4">${errorMessage}</p>
      <button id="retry-transcript-btn" class="bg-[#8950FC] hover:bg-[#7940E7] text-white text-sm font-medium px-5 py-2 rounded-md inline-flex items-center">
        Try Again
      </button>
    </div>
  `;

  // Add retry button event listener
  const retryButton = document.getElementById("retry-transcript-btn");
  if (retryButton) {
    retryButton.addEventListener("click", async () => {
      loadAndDisplayTranscript();
    });
  }
}

// Function to load and display transcript
async function loadAndDisplayTranscript(): Promise<void> {
  console.log("Knugget AI: Loading and displaying transcript");
  
  const transcriptContentElement = document.getElementById("transcript-content");
  if (!transcriptContentElement) return;

  // Show loading state
  showTranscriptLoading(transcriptContentElement);

  try {
    // Add a small delay to ensure YouTube has fully loaded
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Extract transcript data
    const transcriptResponse = await extractTranscript();
    
    if (!transcriptResponse.success || !transcriptResponse.data) {
      throw new Error(transcriptResponse.error || "Failed to extract transcript");
    }

    // Create transcript segments HTML and inject into content
    const segmentsHTML = createTranscriptSegmentHTML(transcriptResponse.data);
    transcriptContentElement.innerHTML = `
      <div class="space-y-4">
        ${segmentsHTML}
      </div>
    `;

    console.log("Transcript loaded successfully");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    console.error("Transcript extraction error:", errorMessage);
    showTranscriptError(transcriptContentElement, errorMessage);
  }
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

  // Create UI similar to what you showed in the screenshots, with updated classes
  knuggetContainer.innerHTML = `
  <div class="knugget-box bg-white min-w-[320px] rounded-xl shadow-lg border border-gray-100 overflow-hidden">
    
    <!-- Header with icon and title -->
    <div class="flex items-center justify-between px-3 py-3 border-b border-gray-100">
      <div class="flex items-center space-x-2">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="#8950FC"/>
          <path d="M2 17L12 22L22 17M2 12L12 17L22 12" stroke="#8950FC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span class="font-medium text-gray-900">Transcript & Summary</span>
      </div>
      <div class="flex items-center space-x-1">
        <button class="text-gray-400 hover:text-gray-600 w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <button class="text-gray-400 hover:text-gray-600 w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
    </div>
    
    <!-- Tabs -->
    <div class="flex border-b border-gray-100">
      <button id="transcript-tab" class="knugget-tab active border-[#8950FC] text-[#8950FC] flex-1 py-2 px-4 text-center text-sm">
        Transcript
      </button>
      <button id="summary-tab" class="knugget-tab flex-1 py-2 px-4 text-center text-gray-500 hover:text-gray-700 text-sm">
        Summary
      </button>
    </div>

    <!-- Review banner -->
    <div class="bg-blue-50 knugget-review-banner px-4 py-2 border-b border-gray-100">
      <div class="flex items-center justify-between">
        <span class="text-sm text-blue-800">Enjoying the extension? Consider <a href="#" class="text-blue-600 hover:underline">leaving a review</a></span>
        <span class="text-yellow-500">✨</span>
      </div>
      <p class="text-xs text-blue-600 mt-1">Your feedback is greatly appreciated</p>
    </div>

    <!-- Language selector -->
    <div class="px-4 py-2 border-b border-gray-100">
      <button class="knugget-language-selector inline-flex items-center justify-center px-3 py-1 text-xs font-medium rounded-full bg-black text-white">
        Default (auto-detected)
      </button>
    </div>

    <!-- Content Body - Transcript -->
    <div id="transcript-content" class="px-4 py-2 overflow-y-auto max-h-[calc(100vh-250px)] text-sm space-y-4 bg-white">
      <div class="knugget-loading">
        <div class="knugget-spinner"></div>
      </div>
      <div class="flex flex-col items-center justify-center p-6 text-center">
        <p class="text-base font-medium text-gray-900 mb-1">Loading Transcript</p>
        <p class="text-sm text-gray-500">Please wait while we load the transcript...</p>
      </div>
    </div>
    
    <!-- Hidden Summary Content -->
    <div id="summary-content" class="hidden px-4 py-3 bg-white knugget-summary-content">
      <div class="flex flex-col items-center justify-center p-6 text-center">
        <div class="mb-4">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="10" stroke="#8950FC" stroke-width="1.5"/>
            <path d="M8 12H16M12 8V16" stroke="#8950FC" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </div>
        <p class="text-base font-medium text-gray-900 mb-1">Log in Required</p>
        <p class="text-sm text-gray-500 mb-4">Please log in to access this feature.</p>
        <button id="knugget-login-btn" class="bg-[#8950FC] hover:bg-[#7940E7] text-white text-sm font-medium px-5 py-2 rounded-md inline-flex items-center">
          <svg class="mr-2" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12Z" stroke="white" stroke-width="2"/>
            <path d="M12 8V16M8 12H16" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Log in Now
        </button>
      </div>
    </div>

    <!-- Footer -->
    <div class="text-center text-xs text-gray-400 py-1 border-t border-gray-100">
      Made with ❤️ by Knugget
    </div>
  </div>
`;

  // Insert at the beginning of the secondary column
  targetElement.insertBefore(knuggetContainer, targetElement.firstChild);

  // Add event listeners
  setupEventListeners(videoId);

  // Load and display transcript
  loadAndDisplayTranscript();

  console.log("Knugget AI panel injected successfully");
}

// Set up event listeners for our UI elements
function setupEventListeners(videoId: string): void {
  const loginButton = document.getElementById("knugget-login-btn");
  const transcriptTab = document.getElementById("transcript-tab");
  const summaryTab = document.getElementById("summary-tab");
  const transcriptContent = document.getElementById("transcript-content");
  const summaryContent = document.getElementById("summary-content");

  if (loginButton) {
    loginButton.addEventListener("click", () => {
      // Open login page or handle authentication
      chrome.runtime.sendMessage({
        type: "OPEN_LOGIN",
        payload: { redirectUrl: window.location.href },
      });
    });
  }

  // Handle tab switching
  if (transcriptTab && summaryTab && transcriptContent && summaryContent) {
    transcriptTab.addEventListener("click", () => {
      // Update CSS classes to match what's in the CSS file
      transcriptTab.classList.add("active", "border-[#8950FC]", "text-[#8950FC]");
      summaryTab.classList.remove("active", "border-[#8950FC]", "text-[#8950FC]");
      transcriptContent.classList.remove("hidden");
      summaryContent.classList.add("hidden");
    });

    summaryTab.addEventListener("click", () => {
      // Update CSS classes to match what's in the CSS file
      summaryTab.classList.add("active", "border-[#8950FC]", "text-[#8950FC]");
      transcriptTab.classList.remove("active", "border-[#8950FC]", "text-[#8950FC]");
      summaryContent.classList.remove("hidden");
      transcriptContent.classList.add("hidden");
    });
  }
}

// Run our initialization when the page loads
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initKnuggetAI);
} else {
  initKnuggetAI();
}

// Export types
export {};