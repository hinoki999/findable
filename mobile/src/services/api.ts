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
const _store: Device[] = [];
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