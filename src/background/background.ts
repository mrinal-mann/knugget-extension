// Listen for installation
chrome.runtime.onInstalled.addListener((): void => {
    console.log('Knugget AI Extension installed');
  });
  
  // Define message handler type
  interface MessageResponse {
    status: string;
    data?: any;
  }
  
  // Listen for messages from content scripts
  chrome.runtime.onMessage.addListener((
    message: KnuggetAI.Message, 
    sender: chrome.runtime.MessageSender, 
    sendResponse: (response: MessageResponse) => void
  ): boolean => {
    
    if (message.type === 'PAGE_LOADED') {
      console.log('YouTube page detected:', message.payload?.url);
      sendResponse({ status: 'acknowledged' });
    }
    
    // Return true to indicate we'll respond asynchronously
    return true;
  });
  
  // Check authentication status
  async function checkAuthStatus(): Promise<KnuggetAI.UserInfo | null> {
    return new Promise((resolve) => {
      chrome.storage.local.get(['knuggetUserInfo'], (result) => {
        if (result.knuggetUserInfo) {
          const userInfo = result.knuggetUserInfo as KnuggetAI.UserInfo;
          
          // Check if token is expired
          if (userInfo.expiresAt < Date.now()) {
            // Token expired, remove it
            chrome.storage.local.remove('knuggetUserInfo');
            resolve(null);
          } else {
            resolve(userInfo);
          }
        } else {
          resolve(null);
        }
      });
    });
  }
  
  // Export for use in other parts of the extension
  export {};