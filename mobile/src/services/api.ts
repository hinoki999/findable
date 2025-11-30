// src/services/api.ts
import { Platform } from 'react-native';
import { ENV } from '../config/environment';
import { storage } from './storage';
import { logApiCall, logError } from './activityMonitor';
import ReactNativeBlobUtil from 'react-native-blob-util';
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

  try {
    // Get current user session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      throw new Error('User not authenticated');
    }

    // Query devices from Supabase
    const { data, error } = await supabase
      .from('devices')
      .select('*')
      .eq('user_id', session.user.id)
      .order('last_seen', { ascending: false });

    if (error) {
      console.error('Supabase devices query error:', error);
      throw new Error('Failed to load devices. Please try again.');
    }

    console.log(`✅ Loaded ${data?.length || 0} devices from Supabase`);
    
    // Map database format to frontend format (snake_case to camelCase)
    return (data || []).map((d: any) => ({
      id: d.id,
      name: d.device_name,
      rssi: d.rssi,
      distanceFeet: d.distance_feet,
      action: d.action,
      timestamp: new Date(d.last_seen),
      phoneNumber: d.phone_number,
      email: d.email,
      bio: d.bio,
      socialMedia: d.social_media,
      profilePhoto: d.profile_photo,
    }));
  } catch (error: any) {
    console.error('❌ Get devices error:', error);
    throw new Error(error.message || 'Failed to load devices. Please try again.');
  }
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

  try {
    // Get current user session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      throw new Error('User not authenticated');
    }

    // Query settings from Supabase
    const { data, error } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', session.user.id)
      .single();

    if (error) {
      // If no settings found (PGRST116), return defaults
      if (error.code === 'PGRST116') {
        console.log('⚠️ No settings found, returning defaults');
        return { darkMode: false, maxDistance: 33, privacyZonesEnabled: false };
      }
      console.error('Supabase settings query error:', error);
      throw new Error('Failed to load settings. Please try again.');
    }

    console.log('✅ Settings loaded from Supabase');
    
    // Map database format to frontend format (snake_case to camelCase)
    return {
      darkMode: data.dark_mode ?? false,
      maxDistance: data.max_distance ?? 33,
      privacyZonesEnabled: data.privacy_zones_enabled ?? false,
    };
  } catch (error: any) {
    console.error('❌ Get settings error:', error);
    
    // Return defaults on error instead of throwing
    if (error.message?.includes('User not authenticated')) {
      throw error;
    }
    
    // For other errors, return defaults to not block app
    console.log('⚠️ Returning default settings due to error');
    return { darkMode: false, maxDistance: 33, privacyZonesEnabled: false };
  }
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

// ==================== OTP VERIFICATION ====================
// Send OTP code to email (works for all verification types)
export async function sendOtpCode(email: string, type: 'recovery' | 'signup'): Promise<void> {
  try {
    const { error} = await supabase.auth.signInWithOtp({
      email: email.toLowerCase(),
      options: {
        shouldCreateUser: type === 'signup', // Only create user for signup verification
      },
    });

    if (error) {
      console.error('Failed to send OTP:', error);
      throw new Error('Failed to send verification code. Please try again.');
    }

    console.log(`✅ OTP code sent to ${email}`);
  } catch (error: any) {
    console.error('❌ Send OTP error:', error);
    throw new Error(error.message || 'Failed to send verification code. Please try again.');
  }
}

// Verify OTP code
export async function verifyOtpCode(
  email: string, 
  code: string, 
  verificationType: 'email' | 'signup' = 'email'
): Promise<{ userId: string }> {
  try {
    // Supabase only supports 'email', 'sms', 'phone_change'
    // For signup OTPs, we still use 'email' type
    const supabaseType = 'email';
    console.log(`🔍 Verifying OTP with type: ${supabaseType} (requested: ${verificationType})`);
    
    const { data, error } = await supabase.auth.verifyOtp({
      email: email.toLowerCase(),
      token: code,
      type: supabaseType
    });

    if (error) {
      console.error('Failed to verify OTP:', error);
      console.error('Error details:', { code: error.code, message: error.message, status: error.status });
      throw new Error('Invalid or expired code. Please try again.');
    }

    if (!data.user) {
      throw new Error('Verification failed. Please try again.');
    }

    console.log('✅ OTP verified successfully');
    return { userId: data.user.id };
  } catch (error: any) {
    console.error('❌ Verify OTP error:', error);
    throw new Error(error.message || 'Invalid or expired code. Please try again.');
  }
}

// Reset password after OTP verification
export async function resetPasswordWithOtp(email: string, code: string, newPassword: string): Promise<void> {
  try {
    // First verify the OTP (this creates a session and logs user in)
    await verifyOtpCode(email, code);

    // Then update password
    const { error } = await supabase.auth.updateUser({
      password: newPassword
    });

    if (error) {
      console.error('Failed to reset password:', error);
      throw new Error('Failed to reset password. Please try again.');
    }

    // Sign out the user so they return to clean unauthenticated state
    await supabase.auth.signOut();
    console.log('✅ User signed out after password reset');

    console.log('✅ Password reset successfully');
  } catch (error: any) {
    console.error('❌ Reset password error:', error);
    throw new Error(error.message || 'Failed to reset password. Please try again.');
  }
}

// Get username by email (for username recovery)
export async function getUsernameByEmail(email: string): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('name')
      .eq('email', email.toLowerCase())
      .single();

    if (error || !data) {
      console.error('Failed to get username:', error);
      throw new Error('No account found with this email address.');
    }

    return data.name;
  } catch (error: any) {
    console.error('❌ Get username error:', error);
    throw new Error(error.message || 'Failed to retrieve username. Please try again.');
  }
}

export async function deleteAccount(userId: string): Promise<void> {
  try {
    console.log('🗑️ Starting account deletion for user:', userId);

    // Validate userId parameter
  if (!userId) {
    throw new Error('User not authenticated');
  }

    // Step 1: Delete from devices table
    const { error: devicesError } = await supabase
      .from('devices')
      .delete()
      .eq('user_id', userId);

    if (devicesError) {
      console.error('Failed to delete devices:', devicesError);
      // Continue anyway - devices are not critical
    } else {
      console.log('✅ Devices deleted');
    }

    // Step 2: Delete from user_settings table
    const { error: settingsError } = await supabase
      .from('user_settings')
      .delete()
      .eq('user_id', userId);

    if (settingsError) {
      console.error('Failed to delete settings:', settingsError);
      // Continue anyway - settings are not critical
    } else {
      console.log('✅ Settings deleted');
    }

    // Step 3: Delete from user_profiles table (CRITICAL)
    const { error: profileError } = await supabase
      .from('user_profiles')
      .delete()
      .eq('user_id', userId);

    if (profileError) {
      console.error('Failed to delete profile:', profileError);
      throw new Error('Failed to delete profile. Please try again.');
    }
    console.log('✅ Profile deleted');

    // Step 4: Sign out user
    await supabase.auth.signOut();
    console.log('✅ User signed out');

    // Step 5: Delete from Supabase Auth
    // Note: User is already signed out
    // Auth account deletion may require service role or will cascade from profile deletion
    const { error: authError } = await supabase.rpc('delete_user');

    if (authError) {
      console.error('Auth deletion error:', authError);
      // Profile is already deleted, so account is effectively deleted
      console.log('⚠️ Auth account not deleted but profile removed');
    } else {
      console.log('✅ Auth account deleted');
    }

    console.log('✅ Account deletion complete');
  } catch (error: any) {
    console.error('❌ Delete account error:', error);
    
    // Re-throw validation errors as-is
    if (error.message?.includes('User not authenticated')) {
      throw error;
    }
    
    throw new Error(error.message || 'Failed to delete account. Please try again.');
  }
}

// ==================== PROFILE PHOTO ====================

export async function uploadProfilePhoto(imageUri: string, userId: string): Promise<string> {
  if (!imageUri || !userId) {
    throw new Error('Missing image or user ID');
  }

  const { data: { session }, error: sessionError } = await supabase.auth.getSession();

  if (!session) {
    throw new Error('Not authenticated - please log out and log back in');
  }

  console.log('Session check - User ID:', session.user.id);
  console.log('Session check - Matches userId param:', session.user.id === userId);

  const extension = imageUri.split('.').pop()?.toLowerCase() || 'jpg';
  const filePath = `${userId}/profile.${extension}`;
  const cleanUri = imageUri.replace('file://', '');
  
  // Read as base64
  const base64 = await ReactNativeBlobUtil.fs.readFile(cleanUri, 'base64');
  
  // Convert base64 to Uint8Array (binary)
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  // Upload using Supabase SDK
  const { error: uploadError } = await supabase.storage
    .from('profile_photos')
    .upload(filePath, bytes.buffer, {
        contentType: `image/${extension}`,
      upsert: true
      });

  if (uploadError) throw uploadError;

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
    .from('profile_photos')
      .getPublicUrl(filePath);

  // Update database
  const { error: dbError } = await supabase
      .from('user_profiles')
      .update({ profile_photo: publicUrl })
      .eq('user_id', userId);

  if (dbError) throw dbError;

    return publicUrl;
}



