// Base URL for the Knugget API
const API_BASE_URL = 'https://api.knugget.ai';

// API endpoints
const ENDPOINTS = {
  LOGIN: '/auth/login',
  REGISTER: '/auth/register',
  REFRESH_TOKEN: '/auth/refresh',
  USER_PROFILE: '/user/profile',
  SUMMARIZE: '/ai/summarize',
  SAVED_SUMMARIES: '/user/summaries',
  SAVE_SUMMARY: '/user/summaries/save'
};

// Interface for API response
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Get stored authentication token
async function getAuthToken(): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['knuggetUserInfo'], (result) => {
      if (result.knuggetUserInfo) {
        const userInfo = result.knuggetUserInfo as KnuggetAI.UserInfo;
        
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

// Generic API request function
async function apiRequest<T>(
  endpoint: string, 
  method: string = 'GET', 
  data?: any,
  requiresAuth: boolean = true
): Promise<ApiResponse<T>> {
  try {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    
    // Add auth token if required
    if (requiresAuth) {
      const token = await getAuthToken();
      if (!token) {
        return {
          success: false,
          error: 'Authentication required'
        };
      }
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    // Make the request
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined
    });
    
    // Parse the JSON response
    const result = await response.json();
    
    if (!response.ok) {
      return {
        success: false,
        error: result.error || `Request failed with status ${response.status}`
      };
    }
    
    return {
      success: true,
      data: result
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

// Login function
export async function login(email: string, password: string): Promise<ApiResponse<KnuggetAI.UserInfo>> {
  return apiRequest<KnuggetAI.UserInfo>(
    ENDPOINTS.LOGIN,
    'POST',
    { email, password },
    false
  );
}

// Get user profile
export async function getUserProfile(): Promise<ApiResponse<KnuggetAI.UserInfo>> {
  return apiRequest<KnuggetAI.UserInfo>(ENDPOINTS.USER_PROFILE);
}

// Summarize content
export async function summarizeContent(
  content: string, 
  metadata: Record<string, any>
): Promise<ApiResponse<KnuggetAI.Summary>> {
  return apiRequest<KnuggetAI.Summary>(
    ENDPOINTS.SUMMARIZE,
    'POST',
    { content, metadata }
  );
}

// Save a summary
export async function saveSummary(summary: KnuggetAI.Summary): Promise<ApiResponse<{id: string}>> {
  return apiRequest<{id: string}>(
    ENDPOINTS.SAVE_SUMMARY,
    'POST',
    summary
  );
}
// Get saved summaries
export async function getSavedSummaries(): Promise<ApiResponse<KnuggetAI.Summary[]>> {
  return apiRequest<KnuggetAI.Summary[]>(ENDPOINTS.SAVED_SUMMARIES);
}