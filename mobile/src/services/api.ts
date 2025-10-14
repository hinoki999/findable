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
      id: Date.now(), 
      action: d.action || 'dropped',
      timestamp: d.timestamp || new Date(),
      ...d 
    };
    _store.unshift(item);
    return item;
  }
  const res = await fetch(`${BASE_URL}/devices`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(d),
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