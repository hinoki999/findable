    /**
     * BLE Configuration for DropLink
     * Centralized configuration for BLE advertising and scanning
     * 
     * This file contains all BLE-related constants and configuration.
     * It is safe to import this file even if BLE advertising is not implemented.
     */

// DropLink Service UUID - Used for advertising and device detection
// Format: Standard 128-bit UUID
// Generated UUID for DropLink service identification
export const DROPLINK_SERVICE_UUID = 'af7d9e8c-3b2a-4f1e-9c8d-5e6f7a8b9c0d';

    // Device name prefix - Backward compatibility for devices without Service UUID
    // This allows detection of devices that haven't updated to use Service UUID advertising yet
    // Shortened to "DL-" to fit in 31-byte BLE advertising packet limit
    export const DROPLINK_DEVICE_PREFIX = 'DL-';

    // Advertising configuration
    // Note: Actual interval is platform-dependent and may be adjusted by the OS
    export const BLE_ADVERTISING_INTERVAL = 100; // ms (platform-dependent)

    /**
     * Verify Service UUID format
     * @param uuid - UUID string to validate
     * @returns true if UUID is in correct format
     */
    export const isValidUUID = (uuid: string): boolean => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
    };

