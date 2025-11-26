// src/services/api.ts
import { Platform } from 'react-native';
import { ENV } from '../config/environment';
import { storage } from './storage';
import { logApiCall, logError } from './activityMonitor';
import * as FileSystem from 'expo-file-system';
import { decode } from 'base64-arraybuffer';
import { supabase } from './supabase';

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
  } else {
    console.log('═══════════════════════════════════════════════════════');
    console.log('🔍 POINT E: api.ts - NO TOKEN AVAILABLE');
    console.log('  timestamp:', new Date().toISOString());
    console.log('  token was null/undefined');
    console.log('═══════════════════════════════════════════════════════');
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

export async function saveDevice(d: Device, userId: string): Promise<any> {
  // Validate userId parameter
  if (!userId) {
    throw new Error('User not authenticated');
  }

  try {
    // Map frontend format to database format (camelCase to snake_case)
    const dbData = {
      user_id: userId,
      device_name: d.name,
      rssi: d.rssi,
      distance_feet: d.distanceFeet,
      action: d.action || 'dropped',
      last_seen: d.timestamp ? new Date(d.timestamp).toISOString() : new Date().toISOString(),
      phone_number: d.phoneNumber || null,
      email: d.email || null,
      bio: d.bio || null,
      social_media: d.socialMedia || null,
      profile_photo: d.profilePhoto || null,
    };

    let data, error;

    if (d.id) {
      // Update existing record using upsert
      const result = await supabase
        .from('devices')
        .upsert({ ...dbData, id: d.id })
        .select()
        .single();
      data = result.data;
      error = result.error;
    } else {
      // Insert new record
      const result = await supabase
        .from('devices')
        .insert(dbData)
        .select()
        .single();
      data = result.data;
      error = result.error;
    }

    if (error) {
      console.error('Supabase device save error:', error);
      throw new Error('Failed to save device. Please try again.');
    }

    console.log('✅ Device saved successfully:', data?.id);
    return data;
  } catch (error: any) {
    console.error('❌ Device save error:', error);
    
    // Re-throw validation errors as-is
    if (error.message?.includes('User not authenticated')) {
      throw error;
    }
    
    throw new Error(error.message || 'Failed to save device. Please try again.');
  }
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

export async function deleteDevice(deviceId: number, userId: string): Promise<void> {
  // Validate userId parameter
  if (!userId) {
    throw new Error('User not authenticated');
  }

  try {
    // Delete from Supabase (with user_id filter for security)
    const { error } = await supabase
      .from('devices')
      .delete()
      .eq('id', deviceId)
      .eq('user_id', userId); // Security: only delete own devices

    if (error) {
      console.error('Supabase device delete error:', error);
      throw new Error('Failed to delete device. Please try again.');
    }

    console.log(`✅ Device ${deviceId} deleted successfully`);
  } catch (error: any) {
    console.error('❌ Device delete error:', error);
    
    // Re-throw validation errors as-is
    if (error.message?.includes('User not authenticated')) {
      throw error;
    }
    
    throw new Error(error.message || 'Failed to delete device. Please try again.');
  }
}

export async function restoreDevice(device: Device, userId: string): Promise<void> {
  // Restore is the same as saving - just call saveDevice
  await saveDevice(device, userId);
}

// ==================== USER PROFILE ====================
export interface UserProfile {
  name: string;
  email: string;
  phone: string;
  bio: string;
  profilePhoto?: string;
  socialMedia?: Array<{ platform: string; handle: string }>;
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

export async function saveUserSettings(settings: UserSettings, userId: string): Promise<void> {
  // Validate userId parameter
  if (!userId) {
    throw new Error('User not authenticated');
  }

  try {
    // Map camelCase to snake_case for Supabase
    const { error } = await supabase
      .from('user_settings')
      .upsert({
        user_id: userId,
        dark_mode: settings.darkMode,
        max_distance: settings.maxDistance,
        privacy_zones_enabled: settings.privacyZonesEnabled,
      })
      .eq('user_id', userId);

    if (error) {
      console.error('Supabase settings update error:', error);
      throw new Error('Failed to save settings. Please try again.');
    }

    console.log('✅ Settings saved successfully');
  } catch (error: any) {
    console.error('❌ Settings save error:', error);
    
    // Re-throw validation errors as-is
    if (error.message?.includes('User not authenticated')) {
      throw error;
    }
    
    throw new Error(error.message || 'Failed to save settings. Please try again.');
  }
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
// Check if username is available (for signup validation)
export async function checkUsernameAvailability(username: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('name', username)
      .single();
    
    // If data exists, username is taken
    // If error.code is 'PGRST116' (not found), username is available
    return !data;
  } catch (error) {
    console.error('Username check error:', error);
    // On error, assume available (don't block signup)
    return true;
  }
}

// Check if email is available (for signup validation)
export async function checkEmailAvailability(email: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('email', email.toLowerCase())
      .single();
    
    // If data exists, email is taken
    return !data;
  } catch (error) {
    console.error('Email check error:', error);
    // On error, assume available (don't block signup)
    return true;
  }
}


export async function changeUsername(newUsername: string, userId: string): Promise<void> {
  try {
    // Validate userId parameter
    if (!userId) {
      throw new Error('User not authenticated');
    }

    // Update username in user_profiles table
    const { error: profileError } = await supabase
      .from('user_profiles')
      .update({ name: newUsername })
      .eq('user_id', userId);

    if (profileError) {
      console.error('Failed to update username in profile:', profileError);
      throw new Error('Failed to change username. Please try again.');
    }

    // Update username in Supabase Auth metadata (optional but recommended)
    const { error: authError } = await supabase.auth.updateUser({
      data: { username: newUsername }
    });

    if (authError) {
      console.error('Failed to update username in auth:', authError);
      // Don't throw - profile update succeeded, metadata update is optional
    }

    console.log('✅ Username changed successfully');
  } catch (error: any) {
    console.error('❌ Change username error:', error);
    
    // Re-throw validation errors as-is
    if (error.message?.includes('User not authenticated')) {
      throw error;
    }
    
    throw new Error(error.message || 'Failed to change username. Please try again.');
  }
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  try {
    // Supabase built-in password update
    const { error } = await supabase.auth.updateUser({
      password: newPassword
    });

    if (error) {
      console.error('Failed to change password:', error);
      throw new Error('Failed to change password. Please try again.');
    }

    console.log('✅ Password changed successfully');
  } catch (error: any) {
    console.error('❌ Change password error:', error);
    throw new Error(error.message || 'Failed to change password. Please try again.');
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
export async function uploadProfilePhoto(imageUri: string, userId: string): Promise<string> {
  // Validate inputs
  if (!imageUri) {
    throw new Error('Please select an image first');
  }
  if (!userId) {
    throw new Error('User not authenticated');
  }

  // Extract file extension from imageUri
  const extension = imageUri.split('.').pop()?.toLowerCase() || 'jpg';
  
  // Generate file path (userId.extension, will overwrite previous photo)
  const filePath = `${userId}.${extension}`;

  try {
    // Read file as base64
    const base64Data = await FileSystem.readAsStringAsync(imageUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Convert base64 to ArrayBuffer
    const arrayBuffer = decode(base64Data);

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('PROFILE_PHOTOS')
      .upload(filePath, arrayBuffer, {
        contentType: `image/${extension}`,
        upsert: true, // Overwrite existing file
      });

    if (uploadError) {
      console.error('Supabase upload error:', uploadError);
      throw new Error('Failed to upload photo. Please try again.');
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('PROFILE_PHOTOS')
      .getPublicUrl(filePath);

    // Update user_profiles table with new photo URL
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({ profile_photo: publicUrl })
      .eq('user_id', userId);

    if (updateError) {
      console.error('Database update error:', updateError);
      throw new Error('Failed to save photo to profile. Please try again.');
    }

    console.log('✅ Photo uploaded successfully:', publicUrl);
    return publicUrl;
  } catch (error: any) {
    console.error('❌ Upload error:', error);
    
    // Provide user-friendly error messages
    if (error.message?.includes('Failed to read')) {
      throw new Error('Failed to read image file');
    } else if (error.message?.includes('User not authenticated') || error.message?.includes('Please select an image')) {
      throw error; // Re-throw validation errors as-is
    } else {
      throw new Error(error.message || 'Failed to upload photo. Please try again.');
    }
  }
}



