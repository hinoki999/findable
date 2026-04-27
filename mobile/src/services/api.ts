// src/services/api.ts
import { Platform } from 'react-native';
import Constants from 'expo-constants';
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
  
  // DEBUG: POINT D: Token retrieval from storage
  console.log('═══════════════════════════════════════════════════════');
  console.log('DEBUG: POINT D: api.ts - Token Retrieved from Storage');
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
  console.log('DEBUG: getAuthHeaders - Token exists:', !!token);
  console.log('DEBUG: Token length:', token?.length || 0);
  console.log('DEBUG: Token first 20 chars:', token?.substring(0, 20));
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
    
    // DEBUG: POINT E: Final Authorization header
    console.log('═══════════════════════════════════════════════════════');
    console.log('DEBUG: POINT E: api.ts - Authorization Header Constructed');
    console.log('  timestamp:', new Date().toISOString());
    console.log('  token used:', token);
    console.log('  Authorization header:', headers['Authorization']);
    console.log('  Header length:', headers['Authorization']?.length);
    console.log('  Contains Bearer?:', headers['Authorization']?.startsWith('Bearer '));
    console.log('═══════════════════════════════════════════════════════');
  } else {
    console.log('═══════════════════════════════════════════════════════');
    console.log('DEBUG: POINT E: api.ts - NO TOKEN AVAILABLE');
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
    console.warn(`WARNING: Non-HTTPS URL detected in production, redirecting to: ${httpsUrl}`);
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

    // Handle abort (timeout)
    if (error.name === 'AbortError') {
      if (retries > 0) {
        console.log(`[RETRY] Request timeout, retrying... (${retries} attempts left)`);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s before retry
        return secureFetch(url, options, retries - 1);
      }
      throw new TimeoutError('Request timed out after 30 seconds');
    }

    // Handle network errors
    if (error.message === 'Network request failed' || error.message === 'Failed to fetch') {
      if (retries > 0) {
        console.log(`[NETWORK] Network error, retrying... (${retries} attempts left)`);
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

    console.log('SUCCESS: Device saved successfully:', data?.id);
    return data;
  } catch (error: any) {
    console.error('ERROR: Device save error:', error);
    
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

    console.log(`SUCCESS: Loaded ${data?.length || 0} devices from Supabase`);
    
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
    console.error('ERROR: Get devices error:', error);
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

    console.log(`SUCCESS: Device ${deviceId} deleted successfully`);
  } catch (error: any) {
    console.error('ERROR: Device delete error:', error);
    
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

// ==================== DROPS API ====================

export interface Drop {
  id: string;
  senderId: string;
  receiverId: string;
  status: 'pending' | 'accepted' | 'declined' | 'linked';
  createdAt: Date;
  respondedAt?: Date;
  distanceFeet?: number;
  // Sender's contact info (shared when drop is sent)
  senderName?: string;
  senderUsername?: string;
  senderEmail?: string;
  senderPhone?: string;
  senderBio?: string;
  senderProfilePhoto?: string;
  senderSocialMedia?: Array<{ platform: string; handle: string }>;
}

export interface Link {
  id: string;
  userId1: string;
  userId2: string;
  dropId: string;
  createdAt: Date;
  // Contact info for the other user (fetched separately or joined)
  otherUserName?: string;
  otherUserUsername?: string;
  otherUserEmail?: string;
  otherUserPhone?: string;
  otherUserBio?: string;
  otherUserProfilePhoto?: string;
  otherUserSocialMedia?: Array<{ platform: string; handle: string }>;
}

// Helper to map database format to frontend format
function mapDropFromDb(d: any): Drop {
  return {
    id: d.id,
    senderId: d.sender_id,
    receiverId: d.receiver_id,
    status: d.status,
    createdAt: new Date(d.created_at),
    respondedAt: d.responded_at ? new Date(d.responded_at) : undefined,
    distanceFeet: d.distance_feet,
    senderName: d.sender_name,
    senderUsername: d.sender_username,
    senderEmail: d.sender_email,
    senderPhone: d.sender_phone,
    senderBio: d.sender_bio,
    senderProfilePhoto: d.sender_profile_photo,
    senderSocialMedia: d.sender_social_media,
  };
}

// Helper to map link from database format to frontend format
function mapLinkFromDb(l: any, currentUserId: string, receiverProfiles?: Map<string, any>): Link {
  // Determine which user is "the other user" from current user's perspective
  // user_id_1 = original drop sender, user_id_2 = original drop receiver
  const isCurrentUserTheSender = l.user_id_1 === currentUserId;
  
  // Get the nested drop data (from the join)
  const drop = l.drops;
  
  // If current user is user_id_1 (the sender), check if we have receiver profile data
  // Otherwise use sender fields from the drop
  let otherUserName = drop?.sender_name;
  let otherUserUsername = drop?.sender_username;
  let otherUserEmail = drop?.sender_email;
  let otherUserPhone = drop?.sender_phone;
  let otherUserBio = drop?.sender_bio;
  let otherUserProfilePhoto = drop?.sender_profile_photo;
  let otherUserSocialMedia = drop?.sender_social_media;
  
  if (isCurrentUserTheSender && receiverProfiles) {
    const receiverProfile = receiverProfiles.get(l.user_id_2);
    if (receiverProfile) {
      otherUserName = receiverProfile.name;
      otherUserUsername = receiverProfile.username;
      otherUserEmail = receiverProfile.email;
      otherUserPhone = receiverProfile.phone;
      otherUserBio = receiverProfile.bio;
      otherUserProfilePhoto = receiverProfile.profile_photo;
      otherUserSocialMedia = receiverProfile.social_media;
    }
  }
  
  return {
    id: l.id,
    userId1: l.user_id_1,
    userId2: l.user_id_2,
    dropId: l.drop_id,
    createdAt: new Date(l.created_at),
    // Contact info - from receiver profile if sender, from drop sender fields if receiver
    otherUserName,
    otherUserUsername,
    otherUserEmail,
    otherUserPhone,
    otherUserBio,
    otherUserProfilePhoto,
    otherUserSocialMedia,
  };
}

/**
 * Send a drop to another user
 * Creates ONE row with status='pending'
 * @param receiverId - UUID of the user receiving the drop
 * @param senderProfile - Sender's contact info to share
 * @param distanceFeet - Distance to receiver in feet (from BLE RSSI)
 */
export async function sendDrop(
  receiverId: string,
  senderProfile: {
    name?: string;
    username?: string;
    email?: string;
    phone?: string;
    bio?: string;
    profilePhoto?: string;
    socialMedia?: Array<{ platform: string; handle: string }>;
  },
  distanceFeet?: number
): Promise<Drop> {
  const callTimestamp = Date.now();
  console.log('[DROP-DUPE] sendDrop ENTRY - timestamp:', callTimestamp, 'receiverId:', receiverId);
  console.log('[DROP-CRASH] sendDrop called with receiverId:', receiverId, 'distanceFeet:', distanceFeet);
  console.log('[DROP-CRASH] senderProfile:', JSON.stringify(senderProfile, null, 2));
  
  try {
    console.log('[DROP-CRASH] Step 1: Getting session...');
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError) {
      console.error('[DROP-CRASH] Session error:', JSON.stringify(sessionError, null, 2));
      throw new Error('User not authenticated');
    }
    
    if (!session) {
      console.error('[DROP-CRASH] No session found');
      throw new Error('User not authenticated');
    }

    const senderId = session.user.id;
    console.log('[DROP-CRASH] Step 2: Session obtained, senderId:', senderId);
    console.log('[DROP-DUPE] senderId:', senderId, 'receiverId:', receiverId, 'timestamp:', callTimestamp);

    // Validate receiverId
    if (!receiverId || receiverId.trim() === '') {
      console.error('[DROP-CRASH] Invalid receiverId:', receiverId);
      throw new Error('Invalid receiver ID');
    }

    console.log('[DROPS] Sending drop from', senderId, 'to', receiverId, 'distance:', distanceFeet);
    console.log('[DROP-CRASH] Step 3: Checking for existing drops/links...');

    // Check if a pending or accepted drop already exists from current user to receiver
    const { data: existingDrop, error: existingDropError } = await supabase
      .from('drops')
      .select('id, status')
      .eq('sender_id', senderId)
      .eq('receiver_id', receiverId)
      .in('status', ['pending', 'accepted'])
      .maybeSingle();

    if (existingDropError) {
      console.error('[DROPS] Error checking existing drops:', existingDropError);
    } else if (existingDrop) {
      console.log('[DROPS] Existing drop found:', existingDrop.id, 'status:', existingDrop.status);
      throw new Error('You have already dropped this user');
    }

    // Check if a link already exists between the two users
    const { data: existingLink, error: existingLinkError } = await supabase
      .from('links')
      .select('id')
      .or(`and(user_id_1.eq.${senderId},user_id_2.eq.${receiverId}),and(user_id_1.eq.${receiverId},user_id_2.eq.${senderId})`)
      .maybeSingle();

    if (existingLinkError) {
      console.error('[DROPS] Error checking existing links:', existingLinkError);
    } else if (existingLink) {
      console.log('[DROPS] Existing link found:', existingLink.id);
      throw new Error('You are already linked with this person');
    }

    console.log('[DROP-CRASH] Step 4: Building drop data...');

    // Drop data - single row with status 'pending'
    const dropData = {
      sender_id: senderId,
      receiver_id: receiverId,
      status: 'pending',
      distance_feet: distanceFeet || null,
      sender_name: senderProfile.name || null,
      sender_username: senderProfile.username || null,
      sender_email: senderProfile.email || null,
      sender_phone: senderProfile.phone || null,
      sender_bio: senderProfile.bio || null,
      sender_profile_photo: senderProfile.profilePhoto || null,
      sender_social_media: senderProfile.socialMedia || null,
    };
    
    console.log('[DROP-CRASH] Step 5: Drop data built:', JSON.stringify(dropData, null, 2));
    console.log('[DROP-DUPE] About to insert single drop row, timestamp:', callTimestamp);

    // Insert ONE row with status 'pending'
    console.log('[DROP-CRASH] Step 6: Inserting to Supabase...');
    const { data, error } = await supabase
      .from('drops')
      .insert(dropData)
      .select()
      .single();

    if (error) {
      console.error('[DROPS] Supabase drop insert error:', error);
      console.error('[DROP-CRASH] Step 5 FAILED - Supabase error:', JSON.stringify(error, null, 2));
      throw new Error('Failed to send drop. Please try again.');
    }

    console.log('[DROP-CRASH] Step 6: Insert successful');
    console.log('[DROPS] SUCCESS: Drop created with id:', data?.id);
    console.log('[DROP-DUPE] Insert completed - drop ID:', data?.id, 'timestamp:', callTimestamp);
    console.log('[DROP-DUPE] Full insert response:', JSON.stringify(data, null, 2));
    
    console.log('[DROP-CRASH] Step 7: Returning drop:', data?.id);
    console.log('[DROP-DUPE] sendDrop EXIT - timestamp:', callTimestamp, 'returning drop ID:', data?.id);
    return mapDropFromDb(data);
  } catch (error: any) {
    console.error('[DROPS] ERROR: Send drop error:', error);
    console.error('[DROP-CRASH] EXCEPTION in sendDrop:', error?.message);
    console.error('[DROP-CRASH] Full error object:', JSON.stringify(error, null, 2));
    console.error('[DROP-CRASH] Stack trace:', error?.stack);
    console.log('[DROP-DUPE] sendDrop FAILED - timestamp:', callTimestamp, 'error:', error?.message);
    throw new Error(error.message || 'Failed to send drop. Please try again.');
  }
}

/**
 * Get incoming drops for the current user (pending drops sent TO them)
 */
export async function getIncomingDrops(): Promise<Drop[]> {
  const callTimestamp = Date.now();
  console.log('[DROP-SCREEN] getIncomingDrops ENTRY - timestamp:', callTimestamp);
  
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      console.error('[DROP-SCREEN] No session for getIncomingDrops');
      throw new Error('User not authenticated');
    }

    const userId = session.user.id;
    console.log('[DROPS] Fetching incoming drops for user:', userId);
    console.log('[DROP-SCREEN] Query params - receiver_id:', userId, 'status: pending');

    const { data, error } = await supabase
      .from('drops')
      .select('*')
      .eq('receiver_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[DROPS] Supabase incoming drops query error:', error);
      console.error('[DROP-SCREEN] Query FAILED:', JSON.stringify(error, null, 2));
      throw new Error('Failed to load incoming drops. Please try again.');
    }

    console.log(`[DROPS] SUCCESS: Loaded ${data?.length || 0} incoming drops`);
    console.log('[DROP-SCREEN] Query returned', data?.length || 0, 'results');
    console.log('[DROP-SCREEN] Full result set:', JSON.stringify(data, null, 2));
    console.log('[DROP-SCREEN] getIncomingDrops EXIT - timestamp:', callTimestamp);
    return (data || []).map(mapDropFromDb);
  } catch (error: any) {
    console.error('[DROPS] ERROR: Get incoming drops error:', error);
    console.error('[DROP-SCREEN] getIncomingDrops EXCEPTION:', error?.message);
    throw new Error(error.message || 'Failed to load incoming drops. Please try again.');
  }
}

/**
 * Get sent drops for the current user (drops they sent, awaiting response)
 * Returns drops where sender_id = current user and status = 'pending'
 */
export async function getSentDrops(): Promise<Drop[]> {
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      throw new Error('User not authenticated');
    }

    console.log('[DROPS] Fetching sent drops for user:', session.user.id);

    const { data, error } = await supabase
      .from('drops')
      .select('*')
      .eq('sender_id', session.user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[DROPS] Supabase sent drops query error:', error);
      throw new Error('Failed to load sent drops. Please try again.');
    }

    console.log(`[DROPS] SUCCESS: Loaded ${data?.length || 0} sent drops`);
    return (data || []).map(mapDropFromDb);
  } catch (error: any) {
    console.error('[DROPS] ERROR: Get sent drops error:', error);
    throw new Error(error.message || 'Failed to load sent drops. Please try again.');
  }
}

/**
 * Get accepted drops for the current user (drops they accepted but haven't returned)
 * These appear on the Drops page, separate from nearby BLE users
 */
export async function getAcceptedDrops(): Promise<Drop[]> {
  const callTimestamp = Date.now();
  console.log('[DROP-SCREEN] getAcceptedDrops ENTRY - timestamp:', callTimestamp);
  
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      console.error('[DROP-SCREEN] getAcceptedDrops - no session');
      throw new Error('User not authenticated');
    }

    const userId = session.user.id;
    console.log('[DROPS] Fetching accepted drops for user:', userId);
    console.log('[DROP-SCREEN] Query params - receiver_id:', userId, 'status: accepted');

    // Get drops where user is the receiver AND status is 'accepted'
    // Sender never sees accepted drops — only receiver does
    // Sender only sees result when drop becomes a link (status = 'linked')
    const { data, error } = await supabase
      .from('drops')
      .select('*')
      .eq('receiver_id', userId)
      .eq('status', 'accepted')
      .order('responded_at', { ascending: false });

    if (error) {
      console.error('[DROPS] Supabase accepted drops query error:', error);
      console.error('[DROP-SCREEN] getAcceptedDrops query FAILED:', JSON.stringify(error, null, 2));
      throw new Error('Failed to load accepted drops. Please try again.');
    }

    console.log(`[DROPS] SUCCESS: Loaded ${data?.length || 0} accepted drops`);
    console.log('[DROP-SCREEN] Query returned', data?.length || 0, 'accepted drops');
    console.log('[DROP-SCREEN] Full result set:', JSON.stringify(data, null, 2));
    console.log('[DROP-SCREEN] getAcceptedDrops EXIT - timestamp:', callTimestamp);
    return (data || []).map(mapDropFromDb);
  } catch (error: any) {
    console.error('[DROPS] ERROR: Get accepted drops error:', error);
    console.error('[DROP-SCREEN] getAcceptedDrops EXCEPTION:', error?.message);
    throw new Error(error.message || 'Failed to load accepted drops. Please try again.');
  }
}

/**
 * Get linked drops (returned only) for the current user
 * These are mutual connections to show in History
 * Only 'returned' drops are shown here - 'accepted' drops stay on Drops page
 */
export async function getLinkedDrops(): Promise<Link[]> {
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      throw new Error('User not authenticated');
    }

    const userId = session.user.id;
    console.log('[DROPS] Fetching links for user:', userId);

    // Query links table with join to drops table for profile data
    const { data, error } = await supabase
      .from('links')
      .select('*, drops(sender_id, receiver_id, sender_name, sender_username, sender_email, sender_phone, sender_bio, sender_profile_photo, sender_social_media, distance_feet)')
      .or(`user_id_1.eq.${userId},user_id_2.eq.${userId}`)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[DROPS] Supabase links query error:', error);
      throw new Error('Failed to load links. Please try again.');
    }

    console.log(`[DROPS] SUCCESS: Loaded ${data?.length || 0} links`);
    
    // Collect user_id_2 values for links where current user is user_id_1 (the sender)
    // These are the receiver profiles we need to fetch separately
    const receiverUserIds = (data || [])
      .filter((l: any) => l.user_id_1 === userId)
      .map((l: any) => l.user_id_2);
    
    // Fetch receiver profiles if any exist
    let receiverProfiles: Map<string, any> | undefined;
    if (receiverUserIds.length > 0) {
      console.log('[DROPS] Fetching receiver profiles for:', receiverUserIds);
      const { data: profilesData, error: profilesError } = await supabase
        .from('user_profiles')
        .select('user_id, name, username, email, phone, bio, profile_photo, social_media')
        .in('user_id', receiverUserIds);
      
      if (profilesError) {
        console.error('[DROPS] Error fetching receiver profiles:', profilesError);
      } else if (profilesData) {
        receiverProfiles = new Map(profilesData.map((p: any) => [p.user_id, p]));
        console.log('[DROPS] Loaded', receiverProfiles.size, 'receiver profiles');
      }
    }
    
    return (data || []).map(l => mapLinkFromDb(l, userId, receiverProfiles));
  } catch (error: any) {
    console.error('[DROPS] ERROR: Get links error:', error);
    throw new Error(error.message || 'Failed to load links. Please try again.');
  }
}

/**
 * Get unviewed link notifications
 * Returns links where user is user_id_1 or user_id_2 AND viewed_at IS NULL
 */
export async function getUnviewedLinks(): Promise<Link[]> {
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      throw new Error('User not authenticated');
    }

    const userId = session.user.id;
    console.log('[DROPS] Fetching unviewed links for user:', userId);

    // Query links table with join to drops table for profile data
    // Only return links where viewed_at IS NULL
    const { data, error } = await supabase
      .from('links')
      .select('*, drops(sender_id, receiver_id, sender_name, sender_username, sender_email, sender_phone, sender_bio, sender_profile_photo, sender_social_media, distance_feet)')
      .or(`user_id_1.eq.${userId},user_id_2.eq.${userId}`)
      .is('viewed_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[DROPS] Supabase unviewed links query error:', error);
      throw new Error('Failed to load unviewed links.');
    }

    console.log(`[DROPS] SUCCESS: Found ${data?.length || 0} unviewed links`);
    return (data || []).map(l => mapLinkFromDb(l, userId));
  } catch (error: any) {
    console.error('[DROPS] ERROR: Get unviewed links error:', error);
    throw new Error(error.message || 'Failed to load unviewed links.');
  }
}

/**
 * Mark a link as viewed
 * Sets viewed_at timestamp so it won't show as a new notification
 * @param linkId - The link to mark as viewed
 */
export async function markLinkViewed(linkId: string): Promise<void> {
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      throw new Error('User not authenticated');
    }

    console.log('[DROPS] Marking link as viewed:', linkId);

    const { error } = await supabase
      .from('links')
      .update({
        viewed_at: new Date().toISOString(),
      })
      .eq('id', linkId);

    if (error) {
      console.error('[DROPS] Supabase mark link viewed error:', error);
      throw new Error('Failed to mark link as viewed.');
    }

    console.log('[DROPS] SUCCESS: Link marked as viewed:', linkId);
  } catch (error: any) {
    console.error('[DROPS] ERROR: Mark link viewed error:', error);
    throw new Error(error.message || 'Failed to mark link as viewed.');
  }
}

/**
 * Update drop status (accept, return, or decline)
 * When status is 'returned', creates a SECOND drop row in reverse direction
 * @param dropId - The drop to update
 * @param status - New status
 * @param responseProfile - If returning, include responder's contact info for the reverse drop
 */
export async function updateDropStatus(
  dropId: string,
  status: 'accepted' | 'returned' | 'declined',
  responseProfile?: {
    name?: string;
    username?: string;
    email?: string;
    phone?: string;
    bio?: string;
    profilePhoto?: string;
    socialMedia?: Array<{ platform: string; handle: string }>;
  }
): Promise<Drop> {
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      throw new Error('User not authenticated');
    }

    const userId = session.user.id;
    console.log('[DROPS] Updating drop status:', dropId, 'to', status);

    // First, get the drop record
    const { data: drop, error: fetchError } = await supabase
      .from('drops')
      .select('*')
      .eq('id', dropId)
      .eq('receiver_id', userId) // Security: only update drops sent to you
      .single();

    if (fetchError || !drop) {
      console.error('[DROPS] Could not find drop to update:', fetchError);
      throw new Error('Drop not found or you are not the receiver.');
    }

    // Determine the actual status to set in database
    // 'returned' becomes 'linked' for mutual connections
    const dbStatus = status === 'returned' ? 'linked' : status;
    const respondedAt = new Date().toISOString();

    // Update the single drop record
    const { data, error } = await supabase
      .from('drops')
      .update({
        status: dbStatus,
        responded_at: respondedAt,
      })
      .eq('id', dropId)
      .eq('receiver_id', userId)
      .select()
      .single();

    if (error) {
      console.error('[DROPS] Supabase drop update error:', error);
      throw new Error('Failed to update drop. Please try again.');
    }

    console.log('[DROPS] SUCCESS: Drop updated:', dropId, dbStatus);
    
    // If status is 'returned' (mutual link), create a link record
    if (status === 'returned') {
      console.log('[DROPS] Creating link for drop:', dropId);
      
      // Insert into links table: user_id_1 = sender, user_id_2 = receiver (current user)
      // viewed_at is NULL on creation so both users see it as a new link notification
      const { data: linkData, error: linkError } = await supabase
        .from('links')
        .insert({
          user_id_1: drop.sender_id,
          user_id_2: userId,
          drop_id: dropId,
        })
        .select()
        .single();

      if (linkError) {
        console.error('[DROPS] Failed to create link:', linkError);
        // Don't throw - drop status was updated successfully
      } else {
        console.log('[DROPS] SUCCESS: Link created:', linkData?.id);
      }
    }

    return mapDropFromDb(data);
  } catch (error: any) {
    console.error('[DROPS] ERROR: Update drop status error:', error);
    throw new Error(error.message || 'Failed to update drop. Please try again.');
  }
}

/**
 * Get a specific drop by ID
 */
export async function getDrop(dropId: string): Promise<Drop | null> {
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      throw new Error('User not authenticated');
    }

    const userId = session.user.id;

    const { data, error } = await supabase
      .from('drops')
      .select('*')
      .eq('id', dropId)
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      console.error('[DROPS] Supabase get drop error:', error);
      throw new Error('Failed to load drop. Please try again.');
    }

    return data ? mapDropFromDb(data) : null;
  } catch (error: any) {
    console.error('[DROPS] ERROR: Get drop error:', error);
    throw new Error(error.message || 'Failed to load drop. Please try again.');
  }
}

/**
 * Delete a drop (for cleanup or user request)
 */
export async function deleteDrop(dropId: string): Promise<void> {
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      throw new Error('User not authenticated');
    }

    const userId = session.user.id;
    
    console.log('[DROPS] SOFT-DELETE: Starting soft delete operation');
    console.log('[DROPS] SOFT-DELETE: dropId =', dropId);
    console.log('[DROPS] SOFT-DELETE: userId =', userId);

    // Soft delete: update status to 'deleted' instead of removing row
    const { data, error } = await supabase
      .from('drops')
      .update({ 
        status: 'deleted',
        responded_at: new Date().toISOString()
      })
      .eq('id', dropId)
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .select();

    console.log('[DROPS] SOFT-DELETE: Supabase response - data:', data, ', error:', error);

    if (error) {
      console.error('[DROPS] SOFT-DELETE: Supabase update error:', error);
      throw new Error('Failed to delete drop. Please try again.');
    }

    if (!data || data.length === 0) {
      console.error('[DROPS] SOFT-DELETE: No rows updated - drop not found or not owned by user');
      throw new Error('Drop not found or you do not have permission to delete it');
    }

    console.log('[DROPS] SUCCESS: Drop soft-deleted (status set to deleted):', dropId);
  } catch (error: any) {
    console.error('[DROPS] ERROR: Soft delete drop error:', error);
    throw new Error(error.message || 'Failed to delete drop. Please try again.');
  }
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
        console.log('WARNING: No settings found, returning defaults');
        return { darkMode: false, maxDistance: 33, privacyZonesEnabled: false };
      }
      console.error('Supabase settings query error:', error);
      throw new Error('Failed to load settings. Please try again.');
    }

    console.log('SUCCESS: Settings loaded from Supabase');
    
    // Map database format to frontend format (snake_case to camelCase)
    return {
      darkMode: data.dark_mode ?? false,
      maxDistance: data.max_distance ?? 33,
      privacyZonesEnabled: data.privacy_zones_enabled ?? false,
    };
  } catch (error: any) {
    console.error('ERROR: Get settings error:', error);
    
    // Return defaults on error instead of throwing
    if (error.message?.includes('User not authenticated')) {
      throw error;
    }
    
    // For other errors, return defaults to not block app
    console.log('WARNING: Returning default settings due to error');
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

    console.log('SUCCESS: Settings saved successfully');
  } catch (error: any) {
    console.error('ERROR: Settings save error:', error);
    
    // Re-throw validation errors as-is
    if (error.message?.includes('User not authenticated')) {
      throw error;
    }
    
    throw new Error(error.message || 'Failed to save settings. Please try again.');
  }
}

// ==================== PINNED CONTACTS ====================
export async function getPinnedContacts(): Promise<number[]> {
  if (USE_STUB) {
    await sleep(100);
    return [];
  }

  try {
    // Get current user session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      throw new Error('User not authenticated');
    }

    // Query pinned contacts from Supabase
    const { data, error } = await supabase
      .from('pinned_contacts')
      .select('device_id')
      .eq('user_id', session.user.id);

    if (error) {
      console.error('Supabase pinned contacts query error:', error);
      throw new Error('Failed to load pinned contacts. Please try again.');
    }

    console.log(`SUCCESS: Loaded ${data?.length || 0} pinned contacts from Supabase`);
    
    // Return array of device IDs
    return (data || []).map((row: any) => row.device_id);
  } catch (error: any) {
    console.error('ERROR: Get pinned contacts error:', error);
    throw new Error(error.message || 'Failed to load pinned contacts. Please try again.');
  }
}

export async function pinContact(deviceId: number): Promise<void> {
  if (USE_STUB) {
    await sleep(100);
    return;
  }

  try {
    // Get current user session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      throw new Error('User not authenticated');
    }

    // Insert pinned contact into Supabase
    const { error } = await supabase
      .from('pinned_contacts')
      .insert({
        user_id: session.user.id,
        device_id: deviceId,
        pinned_at: new Date().toISOString()
      });

    // Ignore duplicate key error (23505) - contact already pinned
    if (error && error.code !== '23505') {
      console.error('Supabase pin contact error:', error);
      throw new Error('Failed to pin contact. Please try again.');
    }

    console.log(`SUCCESS: Contact ${deviceId} pinned successfully`);
  } catch (error: any) {
    console.error('ERROR: Pin contact error:', error);
    throw new Error(error.message || 'Failed to pin contact. Please try again.');
  }
}

export async function unpinContact(deviceId: number): Promise<void> {
  if (USE_STUB) {
    await sleep(100);
    return;
  }

  try {
    // Get current user session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      throw new Error('User not authenticated');
    }

    // Delete pinned contact from Supabase
    const { error } = await supabase
      .from('pinned_contacts')
      .delete()
      .eq('user_id', session.user.id)
      .eq('device_id', deviceId);

    if (error) {
      console.error('Supabase unpin contact error:', error);
      throw new Error('Failed to unpin contact. Please try again.');
    }

    console.log(`SUCCESS: Contact ${deviceId} unpinned successfully`);
  } catch (error: any) {
    console.error('ERROR: Unpin contact error:', error);
    throw new Error(error.message || 'Failed to unpin contact. Please try again.');
  }
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

    console.log('SUCCESS: Username changed successfully');
  } catch (error: any) {
    console.error('ERROR: Change username error:', error);
    
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

    console.log('SUCCESS: Password changed successfully');
  } catch (error: any) {
    console.error('ERROR: Change password error:', error);
    throw new Error(error.message || 'Failed to change password. Please try again.');
  }
}

// ==================== OTP VERIFICATION ====================
// Send OTP code to email (works for all verification types)
export async function sendOtpCode(email: string, type: 'recovery' | 'signup'): Promise<void> {
  console.log('[EMAIL-VERIFY] sendOtpCode called');
  console.log('[EMAIL-VERIFY] email:', email);
  console.log('[EMAIL-VERIFY] type:', type);
  try {
    console.log('[EMAIL-VERIFY] Calling supabase.auth.signInWithOtp...');
    const { error} = await supabase.auth.signInWithOtp({
      email: email.toLowerCase(),
      options: {
        shouldCreateUser: type === 'signup', // Only create user for signup verification
      },
    });

    if (error) {
      console.error('[EMAIL-VERIFY] signInWithOtp error:', error);
      console.error('[EMAIL-VERIFY] signInWithOtp error details:', JSON.stringify(error, null, 2));
      console.error('Failed to send OTP:', error);
      throw new Error(error.message || 'Failed to send verification code. Please try again.');
    }

    console.log('[EMAIL-VERIFY] signInWithOtp succeeded');
    console.log(`SUCCESS: OTP code sent to ${email}`);
  } catch (error: any) {
    console.error('[EMAIL-VERIFY] sendOtpCode caught exception:', error);
    console.error('[EMAIL-VERIFY] Exception details:', JSON.stringify(error, null, 2));
    console.error('ERROR: Send OTP error:', error);
    throw new Error(error.message || 'Failed to send verification code. Please try again.');
  }
}

// Verify OTP code
export async function verifyOtpCode(
  email: string, 
  code: string, 
  verificationType: 'email' | 'signup' = 'email'
): Promise<{ userId: string }> {
  console.log('[EMAIL-VERIFY] verifyOtpCode called');
  console.log('[EMAIL-VERIFY] email:', email);
  console.log('[EMAIL-VERIFY] code length:', code?.length);
  console.log('[EMAIL-VERIFY] verificationType:', verificationType);
  try {
    // Supabase only supports 'email', 'sms', 'phone_change'
    // For signup OTPs, we still use 'email' type
    const supabaseType = 'email';
    console.log(`[EMAIL-VERIFY] Calling supabase.auth.verifyOtp with type: ${supabaseType}`);
    console.log(`DEBUG: Verifying OTP with type: ${supabaseType} (requested: ${verificationType})`);
    
    const { data, error } = await supabase.auth.verifyOtp({
      email: email.toLowerCase(),
      token: code,
      type: supabaseType
    });

    console.log('[EMAIL-VERIFY] verifyOtp response - data:', data ? 'present' : 'null');
    console.log('[EMAIL-VERIFY] verifyOtp response - error:', error ? JSON.stringify(error, null, 2) : 'null');

    if (error) {
      console.error('[EMAIL-VERIFY] verifyOtp error:', error);
      console.error('[EMAIL-VERIFY] verifyOtp error details:', JSON.stringify(error, null, 2));
      console.error('Failed to verify OTP:', error);
      console.error('Error details:', { code: error.code, message: error.message, status: error.status });
      throw new Error(error.message || 'Invalid or expired code. Please try again.');
    }

    if (!data.user) {
      console.error('[EMAIL-VERIFY] verifyOtp returned no user in data');
      throw new Error('Verification failed. Please try again.');
    }

    console.log('[EMAIL-VERIFY] verifyOtp succeeded, userId:', data.user.id);
    console.log('SUCCESS: OTP verified successfully');
    return { userId: data.user.id };
  } catch (error: any) {
    console.error('[EMAIL-VERIFY] verifyOtpCode caught exception:', error);
    console.error('[EMAIL-VERIFY] Exception details:', JSON.stringify(error, null, 2));
    console.error('ERROR: Verify OTP error:', error);
    throw new Error(error.message || 'Invalid or expired code. Please try again.');
  }
}

// ==================== PHONE VERIFICATION ====================
export async function sendPhoneVerificationCode(phoneNumber: string, userId: string): Promise<void> {
  console.log('[PHONE-VERIFY] sendPhoneVerificationCode called');
  console.log('[PHONE-VERIFY] Raw phone input:', phoneNumber);
  console.log('[PHONE-VERIFY] userId:', userId);
  try {
    let formattedPhone = phoneNumber.replace(/\D/g, '');
    console.log('[PHONE-VERIFY] After removing non-digits:', formattedPhone);
    if (!formattedPhone.startsWith('1')) {
      formattedPhone = '1' + formattedPhone;
      console.log('[PHONE-VERIFY] After prepending country code 1:', formattedPhone);
    }
    formattedPhone = '+' + formattedPhone;
    console.log('[PHONE-VERIFY] Final formatted phone:', formattedPhone);

    console.log('[PHONE-VERIFY] Calling supabase.auth.updateUser with phone:', formattedPhone);
    const { error } = await supabase.auth.updateUser({
      phone: formattedPhone
    });

    if (error) {
      console.error('[PHONE-VERIFY] supabase.auth.updateUser error:', error);
      console.error('[PHONE-VERIFY] Error details:', JSON.stringify(error, null, 2));
      console.error('Failed to send phone OTP:', error);
      throw new Error(`Failed to send code: ${error.message}`);
    }

    console.log('[PHONE-VERIFY] supabase.auth.updateUser SUCCESS');
    console.log(`SUCCESS: Phone OTP sent to ${formattedPhone}`);
  } catch (error: any) {
    console.error('[PHONE-VERIFY] Caught exception:', error);
    console.error('[PHONE-VERIFY] Exception details:', JSON.stringify(error, null, 2));
    console.error('ERROR: Send phone OTP error:', error);
    throw new Error(error.message || 'Failed to send verification code. Please try again.');
  }
}

export async function verifyPhoneCode(phoneNumber: string, code: string, userId: string): Promise<void> {
  console.log('[PHONE-VERIFY] verifyPhoneCode called');
  console.log('[PHONE-VERIFY] Raw phone input:', phoneNumber);
  console.log('[PHONE-VERIFY] Code input:', code);
  console.log('[PHONE-VERIFY] userId:', userId);
  try {
    let formattedPhone = phoneNumber.replace(/\D/g, '');
    console.log('[PHONE-VERIFY] After removing non-digits:', formattedPhone);
    if (!formattedPhone.startsWith('1')) {
      formattedPhone = '1' + formattedPhone;
      console.log('[PHONE-VERIFY] After prepending country code 1:', formattedPhone);
    }
    formattedPhone = '+' + formattedPhone;
    console.log('[PHONE-VERIFY] Final formatted phone:', formattedPhone);

    console.log('[PHONE-VERIFY] Calling supabase.auth.verifyOtp with phone:', formattedPhone, 'token:', code, 'type: phone_change');
    const { data, error } = await supabase.auth.verifyOtp({
      phone: formattedPhone,
      token: code,
      type: 'phone_change'
    });

    console.log('[PHONE-VERIFY] verifyOtp response - data:', JSON.stringify(data, null, 2));
    console.log('[PHONE-VERIFY] verifyOtp response - error:', error ? JSON.stringify(error, null, 2) : 'null');

    if (error) {
      console.error('[PHONE-VERIFY] verifyOtp error:', error);
      console.error('Failed to verify phone OTP:', error);
      throw new Error('Invalid or expired code. Please try again.');
    }

    if (!data.user) {
      console.error('[PHONE-VERIFY] verifyOtp returned no user in data');
      throw new Error('Verification failed. Please try again.');
    }

    console.log('[PHONE-VERIFY] verifyOtp SUCCESS, user id:', data.user.id);
    console.log('[PHONE-VERIFY] Calling supabase user_profiles update for user_id:', userId);
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({
        phone_verified: true,
        phone_verification_code: null,
        verification_code_expires: null
      })
      .eq('user_id', userId);

    if (updateError) {
      console.error('[PHONE-VERIFY] user_profiles update error:', updateError);
      console.error('[PHONE-VERIFY] Update error details:', JSON.stringify(updateError, null, 2));
      console.error('Failed to update phone verification status:', updateError);
      throw new Error('Verification succeeded but failed to save status. Please contact support.');
    }

    console.log('[PHONE-VERIFY] user_profiles update SUCCESS');
    console.log('SUCCESS: Phone verified and status updated');
  } catch (error: any) {
    console.error('[PHONE-VERIFY] Caught exception:', error);
    console.error('[PHONE-VERIFY] Exception details:', JSON.stringify(error, null, 2));
    console.error('ERROR: Verify phone code error:', error);
    throw new Error(error.message || 'Invalid or expired code. Please try again.');
  }
}

// DISABLED: Twilio account suspended
// const TWILIO_ACCOUNT_SID = Constants.expoConfig?.extra?.twilioAccountSid || '';
// const TWILIO_AUTH_TOKEN = Constants.expoConfig?.extra?.twilioAuthToken || '';
// const TWILIO_VERIFY_SERVICE_SID = Constants.expoConfig?.extra?.twilioVerifyServiceSid || '';

// DISABLED: Twilio account suspended - stub functions to prevent app crashes
export async function sendPhoneVerificationCodeTwilio(phoneNumber: string): Promise<void> {
  throw new Error('Phone verification is temporarily unavailable. Twilio account suspended.');
  }

export async function verifyPhoneCodeTwilio(phoneNumber: string, code: string, userId: string): Promise<void> {
  throw new Error('Phone verification is temporarily unavailable. Twilio account suspended.');
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
    console.log('SUCCESS: User signed out after password reset');

    console.log('SUCCESS: Password reset successfully');
  } catch (error: any) {
    console.error('ERROR: Reset password error:', error);
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
    console.error('ERROR: Get username error:', error);
    throw new Error(error.message || 'Failed to retrieve username. Please try again.');
  }
}

export async function deleteAccount(userId: string): Promise<void> {
  try {
    console.log('Starting account deletion for user:', userId);

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
      console.log('SUCCESS: Devices deleted');
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
      console.log('SUCCESS: Settings deleted');
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
    console.log('SUCCESS: Profile deleted');

    // Step 4: Delete from Supabase Auth (must be done while user is still authenticated)
    const { error: authError } = await supabase.rpc('delete_user');

    if (authError) {
      console.error('Auth deletion error:', authError);
      // Profile is already deleted, so account is effectively deleted
      console.log('WARNING: Auth account not deleted but profile removed');
    } else {
      console.log('SUCCESS: Auth account deleted');
    }

    // Step 5: Sign out user
    await supabase.auth.signOut();
    console.log('SUCCESS: User signed out');

    console.log('SUCCESS: Account deletion complete');
  } catch (error: any) {
    console.error('ERROR: Delete account error:', error);
    
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

// Save push notification token to user profile
export const savePushToken = async (token: string): Promise<void> => {
  console.log('[PUSH-DEBUG] savePushToken called with token:', token.substring(0, 30) + '...');
  console.log('[PUSH-DEBUG] Calling supabase.auth.getUser()...');
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  console.log('[PUSH-DEBUG] getUser result - user:', user ? 'EXISTS (id: ' + user.id.substring(0, 8) + '...)' : 'NULL', 'authError:', authError ? authError.message : 'none');
  if (!user) {
    console.log('[PUSH-DEBUG] No user found, returning early without saving token');
    return;
  }
  console.log('[PUSH-DEBUG] User found, updating user_profiles with push_token...');
  const { error: updateError } = await supabase
    .from('user_profiles')
    .update({ push_token: token })
    .eq('user_id', user.id);
  console.log('[PUSH-DEBUG] Supabase update result - error:', updateError ? updateError.message : 'none (success)');
};
