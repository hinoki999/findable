// src/services/api.ts
export const BASE_URL = "http://example.invalid";
const USE_STUB = true; // keep true for now

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
};

// --- simple in-memory store for stub mode ---
const _store: Device[] = [
  { id: 1001, name: 'Sarah Chen', rssi: -55, distanceFeet: 18, action: 'returned', timestamp: new Date(Date.now() - 1000 * 60 * 30) },
  { id: 1002, name: 'Alex Rivera', rssi: -60, distanceFeet: 25, action: 'accepted', timestamp: new Date(Date.now() - 1000 * 60 * 60) },
  { id: 1003, name: 'Jordan Kim', rssi: -58, distanceFeet: 20, action: 'dropped', timestamp: new Date(Date.now() - 1000 * 60 * 90) },
  { id: 1004, name: 'Taylor Brooks', rssi: -62, distanceFeet: 28, action: 'returned', timestamp: new Date(Date.now() - 1000 * 60 * 120) },
  { id: 1005, name: 'Morgan Lee', rssi: -57, distanceFeet: 22, action: 'accepted', timestamp: new Date(Date.now() - 1000 * 60 * 150) },
  { id: 1006, name: 'Casey Williams', rssi: -61, distanceFeet: 26, action: 'returned', timestamp: new Date(Date.now() - 1000 * 60 * 180) },
  { id: 1007, name: 'Avery Martinez', rssi: -59, distanceFeet: 24, action: 'accepted', timestamp: new Date(Date.now() - 1000 * 60 * 210) },
  { id: 1008, name: 'Riley Johnson', rssi: -63, distanceFeet: 30, action: 'dropped', timestamp: new Date(Date.now() - 1000 * 60 * 240) },
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
    user_id: 1, // Default user ID, could be from context later
  };
  
  const res = await fetch(`${BASE_URL}/devices`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(backendData),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function getDevices(): Promise<Device[]> {
  if (USE_STUB) {
    await sleep(120);
    return _store.slice();
  }
  const res = await fetch(`${BASE_URL}/devices`);
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
  const res = await fetch(`${BASE_URL}/devices/${deviceId}`, {
    method: "DELETE",
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
  const res = await fetch(`${BASE_URL}/devices`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(device),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}