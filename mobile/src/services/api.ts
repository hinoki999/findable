// src/services/api.ts
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export const BASE_URL = "https://findable-production.up.railway.app";
const USE_STUB = false; // Connected to Railway backend!
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
  if (Platform.OS === 'web') {
    return localStorage.getItem('authToken');
  } else {
    return await SecureStore.getItemAsync('authToken');
  }
}

// Helper to create authorized headers
async function getAuthHeaders(): Promise<HeadersInit> {
  const token = await getAuthToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

// Enhanced fetch with timeout, retry, and HTTPS handling (exported for auth screens)
export async function secureFetch(
  url: string,
  options: RequestInit = {},
  retries = MAX_RETRIES
): Promise<Response> {
  // Ensure URL uses HTTPS
  if (!url.startsWith('https://')) {
    const httpsUrl = url.replace('http://', 'https://');
    console.warn(`⚠️ Non-HTTPS URL detected, redirecting to: ${httpsUrl}`);
    url = httpsUrl;
  }

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Handle HTTP -> HTTPS redirects (301, 302, 307, 308)
    if ([301, 302, 307, 308].includes(response.status)) {
      const location = response.headers.get('Location');
      if (location && location.startsWith('https://')) {
        console.log('🔒 Following HTTPS redirect...');
        return secureFetch(location, options, retries - 1);
      }
      throw new HTTPSRedirectError('Redirect to non-HTTPS URL blocked for security');
    }

    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);

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

// --- simple in-memory store for stub mode ---
const _store: Device[] = [
  { id: 1001, name: 'Sarah Chen', rssi: -55, distanceFeet: 18, action: 'returned', timestamp: new Date(Date.now() - 1000 * 60 * 30) },
  { 
    id: 1002, 
    name: 'Alex Rivera', 
    rssi: -60, 
    distanceFeet: 25, 
    action: 'accepted', 
    timestamp: new Date(Date.now() - 1000 * 60 * 60),
    phoneNumber: '+1 (555) 234-5678',
    email: 'alex.rivera@email.com',
    bio: 'Software engineer & coffee enthusiast ☕',
    socialMedia: [
      { platform: 'instagram', handle: '@alexrivera' },
      { platform: 'linkedin', handle: 'alex-rivera' }
    ]
  },
  { id: 1003, name: 'Jordan Kim', rssi: -58, distanceFeet: 20, action: 'dropped', timestamp: new Date(Date.now() - 1000 * 60 * 90) },
  { id: 1004, name: 'Taylor Brooks', rssi: -62, distanceFeet: 28, action: 'returned', timestamp: new Date(Date.now() - 1000 * 60 * 120) },
  { 
    id: 1005, 
    name: 'Morgan Lee', 
    rssi: -57, 
    distanceFeet: 12, 
    action: 'accepted', 
    timestamp: new Date(Date.now() - 1000 * 60 * 150),
    phoneNumber: '+1 (555) 345-6789',
    email: 'morgan.lee@email.com',
    bio: 'Photographer | Travel lover 🌍 | Dog mom 🐕',
    socialMedia: [
      { platform: 'instagram', handle: '@morganlee_photo' },
      { platform: 'twitter', handle: '@morganlee' }
    ]
  },
  { id: 1006, name: 'Casey Williams', rssi: -61, distanceFeet: 26, action: 'returned', timestamp: new Date(Date.now() - 1000 * 60 * 180) },
  { 
    id: 1007, 
    name: 'Avery Martinez', 
    rssi: -59, 
    distanceFeet: 8, 
    action: 'accepted', 
    timestamp: new Date(Date.now() - 1000 * 60 * 210),
    phoneNumber: '+1 (555) 456-7890',
    email: 'avery.m@email.com',
    bio: 'UX Designer | Gaming geek 🎮 | Always creating',
    socialMedia: [
      { platform: 'linkedin', handle: 'avery-martinez' },
      { platform: 'twitter', handle: '@averymartinez' }
    ]
  },
  { id: 1008, name: 'Riley Johnson', rssi: -63, distanceFeet: 30, action: 'dropped', timestamp: new Date(Date.now() - 1000 * 60 * 240) },
  {
    id: 1009,
    name: 'Jamie Foster',
    rssi: -52,
    distanceFeet: 15,
    action: 'accepted',
    timestamp: new Date(Date.now() - 1000 * 60 * 270),
    phoneNumber: '+1 (555) 567-8901',
    email: 'jamie.foster@email.com',
    bio: 'Marketing pro | Foodie | Yoga enthusiast 🧘',
    socialMedia: [
      { platform: 'instagram', handle: '@jamiefoster' },
      { platform: 'linkedin', handle: 'jamie-foster' }
    ]
  },
  {
    id: 1010,
    name: 'Quinn Parker',
    rssi: -65,
    distanceFeet: 32,
    action: 'accepted',
    timestamp: new Date(Date.now() - 1000 * 60 * 300),
    phoneNumber: '+1 (555) 678-9012',
    email: 'quinn.parker@email.com',
    bio: 'Music producer 🎵 | LA based | Always jamming',
    socialMedia: [
      { platform: 'instagram', handle: '@quinnparker' },
      { platform: 'twitter', handle: '@quinnparker' }
    ]
  },
  {
    id: 1011,
    name: 'Sam Chen',
    rssi: -48,
    distanceFeet: 6,
    action: 'accepted',
    timestamp: new Date(Date.now() - 1000 * 60 * 330),
    phoneNumber: '+1 (555) 789-0123',
    email: 'sam.chen@email.com',
    bio: 'Startup founder | Tech investor | Building the future 🚀',
    socialMedia: [
      { platform: 'linkedin', handle: 'sam-chen' },
      { platform: 'twitter', handle: '@samchen' }
    ]
  },
  {
    id: 1012,
    name: 'Drew Wilson',
    rssi: -54,
    distanceFeet: 19,
    action: 'accepted',
    timestamp: new Date(Date.now() - 1000 * 60 * 360),
    phoneNumber: '+1 (555) 890-1234',
    email: 'drew.wilson@email.com',
    bio: 'Fitness coach | Runner 🏃 | Healthy living advocate',
    socialMedia: [
      { platform: 'instagram', handle: '@drewwilson_fit' }
    ]
  },
];
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
    } else {
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
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
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