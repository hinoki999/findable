// src/services/api.ts
import { Platform } from 'react-native';
import { ENV } from '../config/environment';
import { storage } from './storage';
import { logApiCall, logError } from './activityMonitor';

export const BASE_URL = ENV.BASE_URL;
const USE_STUB = false; // Connected to backend!
const REQUEST_TIMEOUT = 30000; // 30 seconds
const MAX_RETRIES = 3;

// Custom error types for better error handling
export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

export class HTTPSRedirectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HTTPSRedirectError';
  }
}

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

// Helper to get auth token
async function getAuthToken(): Promise<string | null> {
  const token = await storage.getItem('authToken');
  
  // 🔍 POINT D: Token retrieval from storage
  console.log('═══════════════════════════════════════════════════════');
  console.log('🔍 POINT D: api.ts - Token Retrieved from Storage');
  console.log('  timestamp:', new Date().toISOString());
  console.log('  retrieved token:', token);
  console.log('  typeof token:', typeof token);
  console.log('  token length:', token?.length);
  console.log('  is null?:', token === null);
  console.log('  is string "null"?:', token === 'null');
  console.log('  is undefined?:', token === undefined);
  console.log('  JWT segments:', token?.split('.').length);
  console.log('═══════════════════════════════════════════════════════');
  
  return token;
}

// Helper to create authorized headers
async function getAuthHeaders(): Promise<HeadersInit> {
  const token = await getAuthToken();
  console.log('🔑 getAuthHeaders - Token exists:', !!token);
  console.log('🔑 Token length:', token?.length || 0);
  console.log('🔑 Token first 20 chars:', token?.substring(0, 20));
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
    
    // 🔍 POINT E: Final Authorization header
    console.log('═══════════════════════════════════════════════════════');
    console.log('🔍 POINT E: api.ts - Authorization Header Constructed');
    console.log('  timestamp:', new Date().toISOString());
    console.log('  token used:', token);
    console.log('  Authorization header:', headers['Authorization']);
    console.log('  Header length:', headers['Authorization']?.length);
    console.log('  Contains Bearer?:', headers['Authorization']?.startsWith('Bearer '));
    console.log('═══════════════════════════════════════════════════════');
  }} else {
    console.log('═══════════════════════════════════════════════════════');
    console.log('🔍 POINT E: api.ts - NO TOKEN AVAILABLE');
    console.log('  timestamp:', new Date().toISOString());
    console.log('  token was null/undefined');
    console.log('═══════════════════════════════════════════════════════');
  }
} else {
    console.log('❌ No token available, Authorization header NOT set');
  }
  return headers;
}

// Enhanced fetch with timeout, retry, and HTTPS handling (exported for auth screens)
export async function secureFetch(
  url: string,
  options: RequestInit = {},
  retries = MAX_RETRIES
): Promise<Response> {
  // Only enforce HTTPS in production (Railway)
  if (ENV.ENFORCE_HTTPS && !url.startsWith('https://')) {
    const httpsUrl = url.replace('http://', 'https://');
    console.warn(`⚠️ Non-HTTPS URL detected in production, redirecting to: ${httpsUrl}`);
    url = httpsUrl;
  }

  // Log all API calls for monitoring
  const logData = {
    timestamp: new Date().toISOString(),
    endpoint: url,
    method: options.method || 'GET',
    user_id: null as number | null,
    success: false,
    status_code: null as number | null,
    error: null as string | null
  };

  // Extract user_id from token if available
  try {
    const token = await storage.getItem('authToken');
    if (token) {
      const payload = JSON.parse(atob(token.split('.')[1]));
      logData.user_id = payload.user_id || payload.sub || null;
    }
  } catch {}

  // Capture start time for performance tracking
  const startTime = Date.now();

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Log success/failure
    logData.success = response.ok;
    logData.status_code = response.status;

    // Calculate timing and log to activity monitor
    const timing = Date.now() - startTime;
    logApiCall(
      options.method || 'GET',
      url,
      {
        headers: options.headers,
        body: options.body
      },
      {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      },
      timing
    );

    // Send to backend logging endpoint (fire-and-forget, don't block on this)
    fetch(`${BASE_URL}/api/log-api-call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(logData)
    }).catch(() => {}); // Silent fail - don't break app if logging fails

    // Handle HTTP -> HTTPS redirects (301, 302, 307, 308)
    if ([301, 302, 307, 308].includes(response.status)) {
      const location = response.headers.get('Location');
      if (location) {
        // In production, only follow HTTPS redirects
        if (ENV.ENFORCE_HTTPS && !location.startsWith('https://')) {
          throw new HTTPSRedirectError('Redirect to non-HTTPS URL blocked for security');
        }
        console.log('🔀 Following redirect...');
        return secureFetch(location, options, retries - 1);
      }
    }

    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);

    // Log error
    logData.error = error.message || String(error);

    // Log to activity monitor
    const timing = Date.now() - startTime;
    logApiCall(
      options.method || 'GET',
      url,
      {
        headers: options.headers,
        body: options.body
      },
      undefined,
      timing,
      error
    );

    // Send to backend logging endpoint (fire-and-forget)
    fetch(`${BASE_URL}/api/log-api-call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(logData)
    }).catch(() => {}); // Silent fail

    // Handle abort (timeout)
    if (error.name === 'AbortError') {
      if (retries > 0) {
        console.log(`⏱️ Request timeout, retrying... (${retries} attempts left)`);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s before retry
        return secureFetch(url, options, retries - 1);
      }
      throw new TimeoutError('Request timed out after 30 seconds');
    }

    // Handle network errors
    if (error.message === 'Network request failed' || error.message === 'Failed to fetch') {
      if (retries > 0) {
        console.log(`🌐 Network error, retrying... (${retries} attempts left)`);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s before retry
        return secureFetch(url, options, retries - 1);
      }
      throw new NetworkError('Unable to connect to server. Please check your internet connection.');
    }

    // Rethrow other errors
    throw error;
  }
}

export type Device = { 
  id?: number; 
  name: string; 
  rssi: number; 
  distanceFeet: number;
  action?: 'dropped' | 'accepted' | 'declined' | 'returned';
  timestamp?: Date;
  phoneNumber?: string;
  email?: string;
  bio?: string;
  socialMedia?: Array<{ platform: string; handle: string }>;
  profilePhoto?: string;
};

// --- simple in-memory store for stub mode (empty - no mock data) ---
const _store: Device[] = [];
const sleep = (ms:number) => new Promise(r => setTimeout(r, ms));

export async function saveDevice(d: Device) {
  if (USE_STUB) {
    await sleep(150);
    const item = { 
      id: d.id || Date.now(), // Use provided id if available
      action: d.action || 'dropped',
      timestamp: d.timestamp || new Date(),
      ...d 
    };
    // Check if device with this id already exists, update instead of adding duplicate
    const existingIndex = _store.findIndex(device => device.id === item.id);
    if (existingIndex !== -1) {
      _store[existingIndex] = item;
    }} else {
      _store.unshift(item);
    }
    return item;
  }
  
  // Map frontend format to backend format
  const backendData = {
    name: d.name,
    rssi: d.rssi,
    distance: d.distanceFeet, // Backend expects distance in feet
  };
  
  const headers = await getAuthHeaders();
  const res = await secureFetch(`${BASE_URL}/devices`, {
    method: "POST",
    headers,
    body: JSON.stringify(backendData),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new Error(error.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function getDevices(): Promise<Device[]> {
  if (USE_STUB) {
    await sleep(120);
    return _store.slice();
  }
  const headers = await getAuthHeaders();
  const res = await secureFetch(`${BASE_URL}/devices`, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function deleteDevice(deviceId: number): Promise<void> {
  if (USE_STUB) {
    await sleep(100);
    const index = _store.findIndex(d => d.id === deviceId);
    if (index !== -1) {
      _store.splice(index, 1);
      console.log(`✅ Device ${deviceId} deleted from store`);
    }
    return;
  }
  const headers = await getAuthHeaders();
  const res = await secureFetch(`${BASE_URL}/devices/${deviceId}`, {
    method: "DELETE",
    headers,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export async function restoreDevice(device: Device): Promise<void> {
  if (USE_STUB) {
    await sleep(100);
    // Add back to store
    _store.unshift(device);
    console.log(`✅ Device ${device.id} restored to store`);
    return;
  }
  // For real API, would need to POST it back
  const headers = await getAuthHeaders();
  const res = await secureFetch(`${BASE_URL}/devices`, {
    method: "POST",
    headers,
    body: JSON.stringify(device),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

// ==================== USER PROFILE ====================
export interface UserProfile {
  name: string;
  email: string;
  phone: string;
  bio: string;
  profile_photo?: string;
  socialMedia?: Array<{ platform: string; handle: string }>;
}

export async function getUserProfile(): Promise<UserProfile> {
  if (USE_STUB) {
    await sleep(100);
    return { name: '', email: '', phone: '', bio: '' };
  }
  const headers = await getAuthHeaders();
  const res = await secureFetch(`${BASE_URL}/user/profile`, { headers });

  // Better error handling
  if (!res.ok) {
    let errorMessage = `Failed to load profile: HTTP ${res.status}`;
    try {
      const errorData = await res.json();
      if (errorData.detail) {
        errorMessage = errorData.detail;
      }
    } catch (parseError) {
      // Response wasn't JSON, use default message
    }
    throw new Error(errorMessage);
  }

  return res.json();
}

export async function saveUserProfile(profile: UserProfile): Promise<void> {
  if (USE_STUB) {
    await sleep(100);
    return;
  }
  const headers = await getAuthHeaders();
  const res = await secureFetch(`${BASE_URL}/user/profile`, {
    method: "POST",
    headers,
    body: JSON.stringify(profile),
  });

  // Parse backend error response for detailed message
  if (!res.ok) {
    let errorMessage = `HTTP ${res.status}`;
    try {
      const errorData = await res.json();
      // Backend returns { detail: "error message" }
      if (errorData.detail) {
        errorMessage = errorData.detail;
      }
    } catch (parseError) {
      // Response wasn't JSON, use default message
    }
    throw new Error(errorMessage);
  }
}

// ==================== USER SETTINGS ====================
export interface UserSettings {
  darkMode: boolean;
  maxDistance: number;
  privacyZonesEnabled: boolean;
}

export async function getUserSettings(): Promise<UserSettings> {
  if (USE_STUB) {
    await sleep(100);
    return { darkMode: false, maxDistance: 33, privacyZonesEnabled: false };
  }
  const headers = await getAuthHeaders();
  const res = await secureFetch(`${BASE_URL}/user/settings`, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function saveUserSettings(settings: UserSettings): Promise<void> {
  if (USE_STUB) {
    await sleep(100);
    return;
  }
  const headers = await getAuthHeaders();
  const res = await secureFetch(`${BASE_URL}/user/settings`, {
    method: "POST",
    headers,
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

// ==================== PRIVACY ZONES ====================
export interface PrivacyZone {
  id: number;
  address: string;
  radius: number;
}

export async function getPrivacyZones(): Promise<PrivacyZone[]> {
  if (USE_STUB) {
    await sleep(100);
    return [];
  }
  const headers = await getAuthHeaders();
  const res = await secureFetch(`${BASE_URL}/user/privacy-zones`, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function savePrivacyZone(zone: { address: string; radius: number }): Promise<PrivacyZone> {
  if (USE_STUB) {
    await sleep(100);
    return { id: Date.now(), ...zone };
  }
  const headers = await getAuthHeaders();
  const res = await secureFetch(`${BASE_URL}/user/privacy-zones`, {
    method: "POST",
    headers,
    body: JSON.stringify(zone),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function deletePrivacyZone(zoneId: number): Promise<void> {
  if (USE_STUB) {
    await sleep(100);
    return;
  }
  const headers = await getAuthHeaders();
  const res = await secureFetch(`${BASE_URL}/user/privacy-zones/${zoneId}`, {
    method: "DELETE",
    headers,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

// ==================== PINNED CONTACTS ====================
export async function getPinnedContacts(): Promise<number[]> {
  if (USE_STUB) {
    await sleep(100);
    return [];
  }
  const headers = await getAuthHeaders();
  const res = await secureFetch(`${BASE_URL}/user/pinned`, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function pinContact(deviceId: number): Promise<void> {
  if (USE_STUB) {
    await sleep(100);
    return;
  }
  const headers = await getAuthHeaders();
  const res = await secureFetch(`${BASE_URL}/user/pinned/${deviceId}`, {
    method: "POST",
    headers,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export async function unpinContact(deviceId: number): Promise<void> {
  if (USE_STUB) {
    await sleep(100);
    return;
  }
  const headers = await getAuthHeaders();
  const res = await secureFetch(`${BASE_URL}/user/pinned/${deviceId}`, {
    method: "DELETE",
    headers,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

// ==================== AUTH MANAGEMENT ====================
export async function changeUsername(newUsername: string): Promise<{ token: string; username: string }> {
  const headers = await getAuthHeaders();
  const res = await secureFetch(`${BASE_URL}/auth/change-username?new_username=${encodeURIComponent(newUsername)}`, {
    method: "POST",
    headers,
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await secureFetch(`${BASE_URL}/auth/change-password?current_password=${encodeURIComponent(currentPassword)}&new_password=${encodeURIComponent(newPassword)}`, {
    method: "POST",
    headers,
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.detail || `HTTP ${res.status}`);
  }
}

export async function deleteAccount(): Promise<void> {
  console.log('🔑 Getting auth token for delete...');
  const headers = await getAuthHeaders();
  console.log('📤 Sending DELETE request to:', `${BASE_URL}/user/delete`);
  console.log('📋 Headers:', headers);

  const res = await secureFetch(`${BASE_URL}/user/delete`, {
    method: "DELETE",
    headers,
  });

  console.log('📥 Response status:', res.status);

  if (!res.ok) {
    const errorText = await res.text();
    console.error('❌ Delete failed. Response:', errorText);
    try {
      const error = JSON.parse(errorText);
      throw new Error(error.detail || `HTTP ${res.status}`);
    } catch {
      throw new Error(`HTTP ${res.status}: ${errorText}`);
    }
  }

  console.log('✅ Delete request successful');
}

// ==================== PROFILE PHOTO ====================
export async function uploadProfilePhoto(imageUri: string): Promise<{ success: boolean; url: string }> {
  console.log('📸 Starting profile photo upload...');
  console.log('Image URI:', imageUri);

  // Validate file size (max 10MB)
  const MAX_SIZE = 10 * 1024 * 1024; // 10MB

  try {
    // Check if file exists and get info
    if (Platform.OS !== 'web') {
      // For native, we'll validate size after FormData creation
      console.log('⚠️ Skipping size validation for native (will validate on backend)');
    }

    // Create FormData
    const formData = new FormData();

    if (Platform.OS === 'web') {
      console.log('🌐 Web platform - fetching blob...');
      const response = await fetch(imageUri);
      const blob = await response.blob();

      // Validate size on web
      if (blob.size > MAX_SIZE) {
        throw new Error('File too large. Maximum size is 10MB');
      }

      formData.append('file', blob, 'profile.jpg');
    }} else {
      // For mobile (Android/iOS)
      console.log('📱 Mobile platform - preparing file...');
      const filename = imageUri.split('/').pop() || 'profile.jpg';
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : 'image/jpeg';

      console.log('File name:', filename);
      console.log('File type:', type);

      // Create proper file object for React Native
      formData.append('file', {
        uri: imageUri,
        name: filename,
        type: type,
      } as any);
    }

    // Get auth headers
    console.log('🔑 Getting auth token...');
    const headers = await getAuthHeaders();

    // Remove Content-Type header - let browser/RN set it with boundary for FormData
    const uploadHeaders: any = { ...headers };
    delete uploadHeaders['Content-Type'];

    console.log('📤 Uploading to backend...');

    // Upload with timeout and retry
    const res = await secureFetch(`${BASE_URL}/user/profile/photo`, {
      method: 'POST',
      headers: uploadHeaders,
      body: formData,
    });

    console.log('📥 Response status:', res.status);

    if (!res.ok) {
      const errorText = await res.text();
      console.error('❌ Upload failed. Response:', errorText);
      try {
        const error = JSON.parse(errorText);
        throw new Error(error.detail || `Upload failed: ${res.status}`);
      } catch {
        throw new Error(`Upload failed: ${res.status} - ${errorText}`);
      }
    }

    const result = await res.json();
    console.log('✅ Photo uploaded successfully:', result);

    return {
      success: true,
      url: result.url || imageUri,
    };
  } catch (error: any) {
    console.error('❌ Upload error:', error);
    console.error('Error details:', error.message);

    // Provide user-friendly error messages
    if (error.message?.includes('too large')) {
      throw new Error('Photo too large. Please choose a smaller photo (max 10MB)');
    } else if (error.message?.includes('timeout') || error.message?.includes('Timeout')) {
      throw new Error('Upload timed out. Please check your internet connection and try again');
    } else if (error.message?.includes('Network')) {
      throw new Error('Network error. Please check your internet connection');
    }} else {
      throw new Error(error.message || 'Failed to upload photo. Please try again');
    }
  }
}






