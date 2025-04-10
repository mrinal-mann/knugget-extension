// DOM Element References
interface DOMElements {
    loginSection: HTMLElement | null;
    userSection: HTMLElement | null;
    usernameElement: HTMLElement | null;
    loginButton: HTMLElement | null;
    dashboardButton: HTMLElement | null;
    logoutButton: HTMLElement | null;
    summariesCount: HTMLElement | null;
    creditsCount: HTMLElement | null;
  }
  
  // Get all DOM elements
  function getDOMElements(): DOMElements {
    return {
      loginSection: document.getElementById('login-section'),
      userSection: document.getElementById('user-section'),
      usernameElement: document.getElementById('username'),
      loginButton: document.getElementById('login-button'),
      dashboardButton: document.getElementById('dashboard-button'),
      logoutButton: document.getElementById('logout-button'),
      summariesCount: document.getElementById('summaries-count'),
      creditsCount: document.getElementById('credits-count')
    };
  }
  
  // Initialize the popup
  function initPopup(): void {
    const elements = getDOMElements();
    
    // Check if user is logged in
    chrome.storage.local.get(['knuggetUserInfo'], (result) => {
      if (result.knuggetUserInfo) {
        // User is logged in
        const userInfo = result.knuggetUserInfo as KnuggetAI.UserInfo;
        showLoggedInState(elements, userInfo);
        
        // Fetch additional user data (summaries count, credits)
        fetchUserData(userInfo);
      } else {
        // User is not logged in
        showLoggedOutState(elements);
      }
    });
    
    // Set up event listeners
    setupEventListeners(elements);
  }
  
  // Show logged in state UI
  function showLoggedInState(elements: DOMElements, userInfo: KnuggetAI.UserInfo): void {
    if (
      elements.loginSection && 
      elements.userSection && 
      elements.usernameElement
    ) {
      elements.loginSection.style.display = 'none';
      elements.userSection.style.display = 'block';
      elements.usernameElement.textContent = userInfo.name || 'User';
    }
  }
  
  // Show logged out state UI
  function showLoggedOutState(elements: DOMElements): void {
    if (elements.loginSection && elements.userSection) {
      elements.loginSection.style.display = 'block';
      elements.userSection.style.display = 'none';
    }
  }
  
  // Set up event listeners
  function setupEventListeners(elements: DOMElements): void {
    // Login button click handler
    if (elements.loginButton) {
      elements.loginButton.addEventListener('click', () => {
        // For now, just open a new tab to the login page
        // Later, you'll implement proper OAuth2 authentication
        chrome.tabs.create({ url: 'https://knugget.ai/login' });
      });
    }
    
    // Dashboard button click handler
    if (elements.dashboardButton) {
      elements.dashboardButton.addEventListener('click', () => {
        chrome.tabs.create({ url: 'https://knugget.ai/dashboard' });
      });
    }
    
    // Logout button click handler
    if (elements.logoutButton) {
      elements.logoutButton.addEventListener('click', () => {
        chrome.storage.local.remove('knuggetUserInfo', () => {
          showLoggedOutState(elements);
        });
      });
    }
  }
  
  // Fetch additional user data
  async function fetchUserData(userInfo: KnuggetAI.UserInfo): Promise<void> {
    const elements = getDOMElements();
    
    try {
      // Mock data for now - in a real implementation you would fetch from your API
      const mockData = {
        summariesCount: 12,
        creditsRemaining: 50
      };
      
      // Update UI with data
      if (elements.summariesCount) {
        elements.summariesCount.textContent = mockData.summariesCount.toString();
      }
      
      if (elements.creditsCount) {
        elements.creditsCount.textContent = mockData.creditsRemaining.toString();
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
    }
  }
  
  // Initialize when DOM is loaded
  document.addEventListener('DOMContentLoaded', initPopup);
  
  export {};