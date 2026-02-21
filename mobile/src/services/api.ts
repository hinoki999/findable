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
  status: 'sent' | 'received' | 'accepted' | 'returned' | 'declined' | 'deleted' | 'linked';
  createdAt: Date;
  respondedAt?: Date;
  distanceFeet?: number;
  linkViewedAt?: Date;
  // Sender's contact info (shared when drop is sent)
  senderName?: string;
  senderUsername?: string;
  senderEmail?: string;
  senderPhone?: string;
  senderBio?: string;
  senderProfilePhoto?: string;
  senderSocialMedia?: Array<{ platform: string; handle: string }>;
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
    linkViewedAt: d.link_viewed_at ? new Date(d.link_viewed_at) : undefined,
    senderName: d.sender_name,
    senderUsername: d.sender_username,
    senderEmail: d.sender_email,
    senderPhone: d.sender_phone,
    senderBio: d.sender_bio,
    senderProfilePhoto: d.sender_profile_photo,
    senderSocialMedia: d.sender_social_media,
  };
}

/**
 * Send a drop to another user
 * Creates TWO rows: one for sender (status='sent'), one for receiver (status='received')
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
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      throw new Error('User not authenticated');
    }

    const senderId = session.user.id;

    // Validate receiverId
    if (!receiverId || receiverId.trim() === '') {
      throw new Error('Invalid receiver ID');
    }

    console.log('[DROPS] Sending drop from', senderId, 'to', receiverId, 'distance:', distanceFeet);

    // Common drop data
    const dropData = {
      sender_id: senderId,
      receiver_id: receiverId,
      distance_feet: distanceFeet || null,
      sender_name: senderProfile.name || null,
      sender_username: senderProfile.username || null,
      sender_email: senderProfile.email || null,
      sender_phone: senderProfile.phone || null,
      sender_bio: senderProfile.bio || null,
      sender_profile_photo: senderProfile.profilePhoto || null,
      sender_social_media: senderProfile.socialMedia || null,
    };

    // Insert TWO rows: sender's outgoing record and receiver's incoming record
    const { data, error } = await supabase
      .from('drops')
      .insert([
        { ...dropData, status: 'sent' },      // Sender's outgoing record
        { ...dropData, status: 'received' }, // Receiver's incoming record
      ])
      .select();

    if (error) {
      console.error('[DROPS] Supabase drop insert error:', error);
      throw new Error('Failed to send drop. Please try again.');
    }

    console.log('[DROPS] SUCCESS: Drop pair created - sent:', data[0]?.id, 'received:', data[1]?.id);
    
    // Return the receiver's record (received) as the primary drop
    const receiverDrop = data.find(d => d.status === 'received') || data[0];
    return mapDropFromDb(receiverDrop);
  } catch (error: any) {
    console.error('[DROPS] ERROR: Send drop error:', error);
    throw new Error(error.message || 'Failed to send drop. Please try again.');
  }
}

/**
 * Get incoming drops for the current user (received drops sent TO them)
 */
export async function getIncomingDrops(): Promise<Drop[]> {
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      throw new Error('User not authenticated');
    }

    console.log('[DROPS] Fetching incoming drops for user:', session.user.id);

    const { data, error } = await supabase
      .from('drops')
      .select('*')
      .eq('receiver_id', session.user.id)
      .eq('status', 'received')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[DROPS] Supabase incoming drops query error:', error);
      throw new Error('Failed to load incoming drops. Please try again.');
    }

    console.log(`[DROPS] SUCCESS: Loaded ${data?.length || 0} incoming drops`);
    return (data || []).map(mapDropFromDb);
  } catch (error: any) {
    console.error('[DROPS] ERROR: Get incoming drops error:', error);
    throw new Error(error.message || 'Failed to load incoming drops. Please try again.');
  }
}

/**
 * Get sent drops for the current user (drops they sent, awaiting response)
 * Returns drops where sender_id = current user and status = 'sent'
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
      .eq('status', 'sent')
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
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      throw new Error('User not authenticated');
    }

    const userId = session.user.id;
    console.log('[DROPS] Fetching accepted drops for user:', userId);

    // Get drops where user is the receiver AND status is 'accepted'
    // Note: 'deleted' drops are excluded because we filter for 'accepted' status only
    const { data, error } = await supabase
      .from('drops')
      .select('*')
      .eq('receiver_id', userId)
      .eq('status', 'accepted')
      .order('responded_at', { ascending: false });

    if (error) {
      console.error('[DROPS] Supabase accepted drops query error:', error);
      throw new Error('Failed to load accepted drops. Please try again.');
    }

    console.log(`[DROPS] SUCCESS: Loaded ${data?.length || 0} accepted drops`);
    return (data || []).map(mapDropFromDb);
  } catch (error: any) {
    console.error('[DROPS] ERROR: Get accepted drops error:', error);
    throw new Error(error.message || 'Failed to load accepted drops. Please try again.');
  }
}

/**
 * Get linked drops (returned only) for the current user
 * These are mutual connections to show in History
 * Only 'returned' drops are shown here - 'accepted' drops stay on Drops page
 */
export async function getLinkedDrops(): Promise<Drop[]> {
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      throw new Error('User not authenticated');
    }

    const userId = session.user.id;
    console.log('[DROPS] Fetching linked drops for user:', userId);

    // Get drops where user is the RECEIVER and status is 'linked' (mutual links only)
    // We only fetch drops where user is receiver because:
    // - The sender_* fields contain the OTHER person's contact info
    // - When user A and B link, there are 2 drop records:
    //   1. A→B (A's info stored as sender, status='linked')
    //   2. B→A (B's info stored as sender, status='linked')
    // - User A sees drop B→A (where A is receiver) → shows B's info ✓
    // - User B sees drop A→B (where B is receiver) → shows A's info ✓
    const { data, error } = await supabase
      .from('drops')
      .select('*')
      .eq('receiver_id', userId)
      .eq('status', 'linked')
      .order('responded_at', { ascending: false });

    if (error) {
      console.error('[DROPS] Supabase linked drops query error:', error);
      throw new Error('Failed to load linked drops. Please try again.');
    }

    console.log(`[DROPS] SUCCESS: Loaded ${data?.length || 0} linked drops`);
    return (data || []).map(mapDropFromDb);
  } catch (error: any) {
    console.error('[DROPS] ERROR: Get linked drops error:', error);
    throw new Error(error.message || 'Failed to load linked drops. Please try again.');
  }
}

/**
 * Get unviewed link notifications
 * Returns drops where user is receiver, status is 'linked', and link_viewed_at is null
 * These are new mutual connections the user hasn't acknowledged yet
 */
export async function getUnviewedLinks(): Promise<Drop[]> {
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      throw new Error('User not authenticated');
    }

    const userId = session.user.id;
    console.log('[DROPS] Fetching unviewed links for user:', userId);

    const { data, error } = await supabase
      .from('drops')
      .select('*')
      .eq('receiver_id', userId)
      .eq('status', 'linked')
      .is('link_viewed_at', null)
      .order('responded_at', { ascending: false });

    if (error) {
      console.error('[DROPS] Supabase unviewed links query error:', error);
      throw new Error('Failed to load unviewed links.');
    }

    console.log(`[DROPS] SUCCESS: Found ${data?.length || 0} unviewed links`);
    return (data || []).map(mapDropFromDb);
  } catch (error: any) {
    console.error('[DROPS] ERROR: Get unviewed links error:', error);
    throw new Error(error.message || 'Failed to load unviewed links.');
  }
}

/**
 * Mark a link as viewed
 * Sets link_viewed_at timestamp so it won't show as a new notification
 * @param dropId - The drop to mark as viewed
 */
export async function markLinkViewed(dropId: string): Promise<void> {
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      throw new Error('User not authenticated');
    }

    console.log('[DROPS] Marking link as viewed:', dropId);

    const { error } = await supabase
      .from('drops')
      .update({
        link_viewed_at: new Date().toISOString(),
      })
      .eq('id', dropId)
      .eq('receiver_id', session.user.id);

    if (error) {
      console.error('[DROPS] Supabase mark link viewed error:', error);
      throw new Error('Failed to mark link as viewed.');
    }

    console.log('[DROPS] SUCCESS: Link marked as viewed:', dropId);
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

    console.log('[DROPS] Updating drop status:', dropId, 'to', status);

    // First, get the receiver's drop record (status='received')
    const { data: receiverDrop, error: fetchError } = await supabase
      .from('drops')
      .select('*')
      .eq('id', dropId)
      .eq('receiver_id', session.user.id) // Security: only update drops sent to you
      .single();

    if (fetchError || !receiverDrop) {
      console.error('[DROPS] Could not find drop to update:', fetchError);
      throw new Error('Drop not found or you are not the receiver.');
    }

    // Determine the actual status to set in database
    // 'returned' becomes 'linked' for mutual connections
    const dbStatus = status === 'returned' ? 'linked' : status;
    const respondedAt = new Date().toISOString();

    // Update the RECEIVER's drop record (the 'received' one we're responding to)
    const { data, error } = await supabase
      .from('drops')
      .update({
        status: dbStatus,
        responded_at: respondedAt,
      })
      .eq('id', dropId)
      .eq('receiver_id', session.user.id)
      .select()
      .single();

    if (error) {
      console.error('[DROPS] Supabase drop update error:', error);
      throw new Error('Failed to update drop. Please try again.');
    }

    console.log('[DROPS] SUCCESS: Receiver drop updated:', dropId, dbStatus);

    // Also update the SENDER's matching drop record (status='sent')
    // Find the sender's record with same sender_id, receiver_id, and created_at (within 1 second)
    const { data: senderDrop, error: senderFetchError } = await supabase
      .from('drops')
      .select('*')
      .eq('sender_id', receiverDrop.sender_id)
      .eq('receiver_id', receiverDrop.receiver_id)
      .eq('status', 'sent')
      .single();

    if (senderDrop && !senderFetchError) {
      // Determine sender's status based on receiver's response
      let senderStatus: string;
      if (status === 'returned') {
        senderStatus = 'linked';
      } else if (status === 'accepted') {
        senderStatus = 'accepted';
      } else {
        senderStatus = 'declined';
      }

      const { error: senderUpdateError } = await supabase
        .from('drops')
        .update({
          status: senderStatus,
          responded_at: respondedAt,
        })
        .eq('id', senderDrop.id);

      if (senderUpdateError) {
        console.error('[DROPS] Failed to update sender drop:', senderUpdateError);
      } else {
        console.log('[DROPS] SUCCESS: Sender drop updated:', senderDrop.id, senderStatus);
      }
    } else {
      console.log('[DROPS] No sender drop found to update (may be legacy single-row drop)');
    }
    
    // If status is 'returned' (mutual link), create reverse drops for the responder
    // This shares the responder's contact info with the original sender
    if (status === 'returned' && responseProfile) {
      console.log('[DROPS] Creating reverse drop pair for responder:', session.user.id);
      
      // Create TWO reverse drops: responder's 'sent' and original sender's 'linked'
      const reverseDropData = {
        sender_id: session.user.id,           // Current user is now the sender
        receiver_id: receiverDrop.sender_id,  // Original sender is now the receiver
        responded_at: respondedAt,
        sender_name: responseProfile.name || null,
        sender_username: responseProfile.username || null,
        sender_email: responseProfile.email || null,
        sender_phone: responseProfile.phone || null,
        sender_bio: responseProfile.bio || null,
        sender_profile_photo: responseProfile.profilePhoto || null,
        sender_social_media: responseProfile.socialMedia || null,
      };

      const { data: reverseDrops, error: reverseError } = await supabase
        .from('drops')
        .insert([
          { ...reverseDropData, status: 'linked' },  // Responder's outgoing linked record
          { ...reverseDropData, status: 'linked' },  // Original sender's incoming linked record
        ])
        .select();

      if (reverseError) {
        console.error('[DROPS] Failed to create reverse drops:', reverseError);
      } else {
        console.log('[DROPS] SUCCESS: Reverse drop pair created:', reverseDrops?.map(d => d.id).join(', '));
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

    console.log(`SUCCESS: OTP code sent to ${email}`);
  } catch (error: any) {
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
  try {
    // Supabase only supports 'email', 'sms', 'phone_change'
    // For signup OTPs, we still use 'email' type
    const supabaseType = 'email';
    console.log(`DEBUG: Verifying OTP with type: ${supabaseType} (requested: ${verificationType})`);
    
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

    console.log('SUCCESS: OTP verified successfully');
    return { userId: data.user.id };
  } catch (error: any) {
    console.error('ERROR: Verify OTP error:', error);
    throw new Error(error.message || 'Invalid or expired code. Please try again.');
  }
}

// ==================== PHONE VERIFICATION ====================
// Send OTP code to phone number for verification
export async function sendPhoneVerificationCode(phoneNumber: string, userId: string): Promise<void> {
  try {
    // Supabase phone OTP requires phone in E.164 format (+1234567890)
    // Format phone number to E.164 if not already
    let formattedPhone = phoneNumber.replace(/\D/g, ''); // Remove non-digits
    if (!formattedPhone.startsWith('1')) {
      formattedPhone = '1' + formattedPhone; // Add US country code
    }
    formattedPhone = '+' + formattedPhone;

    const { error } = await supabase.auth.signInWithOtp({
      phone: formattedPhone,
      options: {
        shouldCreateUser: false, // Don't create new auth user, just send verification
      },
    });

    if (error) {
      console.error('Failed to send phone OTP:', error);
      throw new Error(`Failed to send code: ${error.message}`);
    }

    console.log(`SUCCESS: Phone OTP sent to ${formattedPhone}`);
  } catch (error: any) {
    console.error('ERROR: Send phone OTP error:', error);
    throw new Error(error.message || 'Failed to send verification code. Please try again.');
  }
}

// Verify phone OTP code and mark phone as verified
export async function verifyPhoneCode(phoneNumber: string, code: string, userId: string): Promise<void> {
  try {
    // Format phone number to E.164
    let formattedPhone = phoneNumber.replace(/\D/g, '');
    if (!formattedPhone.startsWith('1')) {
      formattedPhone = '1' + formattedPhone;
    }
    formattedPhone = '+' + formattedPhone;

    const { data, error } = await supabase.auth.verifyOtp({
      phone: formattedPhone,
      token: code,
      type: 'sms'
    });

    if (error) {
      console.error('Failed to verify phone OTP:', error);
      throw new Error('Invalid or expired code. Please try again.');
    }

    if (!data.user) {
      throw new Error('Verification failed. Please try again.');
    }

    // Update user_profiles to mark phone as verified
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({ 
        phone_verified: true,
        phone_verification_code: null, // Clear verification code
        verification_code_expires: null
      })
      .eq('user_id', userId);

    if (updateError) {
      console.error('Failed to update phone verification status:', updateError);
      throw new Error('Verification succeeded but failed to save status. Please contact support.');
    }

    console.log('SUCCESS: Phone verified and status updated');
  } catch (error: any) {
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

    // Step 4: Sign out user
    await supabase.auth.signOut();
    console.log('SUCCESS: User signed out');

    // Step 5: Delete from Supabase Auth
    // Note: User is already signed out
    // Auth account deletion may require service role or will cascade from profile deletion
    const { error: authError } = await supabase.rpc('delete_user');

    if (authError) {
      console.error('Auth deletion error:', authError);
      // Profile is already deleted, so account is effectively deleted
      console.log('WARNING: Auth account not deleted but profile removed');
    } else {
      console.log('SUCCESS: Auth account deleted');
    }

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



