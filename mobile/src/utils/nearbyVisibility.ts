import { BleDevice } from '../components/BLEScanner';
import { DROPSHAKE_SERVICE_UUID } from '../config/bleConfig';

const FULL_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const normalizeUUID = (uuid: string): string => uuid.toLowerCase().replace(/-/g, '');
const normalizedDropShakeUUID = normalizeUUID(DROPSHAKE_SERVICE_UUID);

/**
 * Single source of truth for whether a scanned device may be shown as a nearby
 * user. Used by both HomeScreen (radar) and DropScreen (list) so they agree.
 *
 * A device is shown only if all of these hold:
 * - it advertises the DropShake service UUID
 * - it is within the user's max distance
 * - the block list has loaded at least once (null = unknown, show nobody)
 * - its userId is a full UUID (background-seeded entries hold only the 8-char
 *   BLE prefix until a live scan resolves them; the block check can't match a prefix)
 * - it is not in a block relationship with the current user (either direction)
 */
export function isVisibleNearbyUser(
  device: BleDevice,
  blockedUserIds: Set<string> | null,
  maxDistance: number
): boolean {
  const isDropShake = (device.serviceUUIDs || []).some(
    uuid => normalizeUUID(uuid) === normalizedDropShakeUUID
  );
  if (!isDropShake) return false;

  if (device.distanceFeet > maxDistance) return false;

  if (!blockedUserIds) return false;

  if (!device.userId || !FULL_UUID_RE.test(device.userId)) return false;

  return !blockedUserIds.has(device.userId);
}
