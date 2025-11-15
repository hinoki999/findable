import { Platform } from 'react-native';
import * as Device from 'expo-device';
import { ENV } from '../config/environment';

interface BLEError {
  errorType: 'initialization' | 'scan' | 'connection' | 'permission' | 'unknown';
  errorMessage: string;
  userId?: string | number;
  deviceInfo: {
    platform: string;
    osVersion: string;
    deviceModel: string;
    isDevice: boolean;
  };
  timestamp: string;
  additionalData?: Record<string, any>;
}

/**
 * BLE-specific error logger to track Bluetooth issues.
 */
class BLEErrorLogger {
  private static instance: BLEErrorLogger;
  private userId?: string | number;
  private backendUrl: string;

  private constructor() {
    this.backendUrl = ENV.BASE_URL;
  }

  public static getInstance(): BLEErrorLogger {
    if (!BLEErrorLogger.instance) {
      BLEErrorLogger.instance = new BLEErrorLogger();
    }
    return BLEErrorLogger.instance;
  }

  /**
   * Set the current user ID for error tracking
   */
  public setUserId(userId: string | number | undefined) {
    this.userId = userId;
  }

  /**
   * Log a BLE error to the backend
   */
  public async logBLEError(
    errorType: BLEError['errorType'],
    errorMessage: string,
    additionalData?: Record<string, any>
  ) {
    try {
      const errorData: BLEError = {
        errorType,
        errorMessage,
        userId: this.userId,
        deviceInfo: {
          platform: Platform.OS,
          osVersion: Platform.Version.toString(),
          deviceModel: Device.modelName || 'Unknown',
          isDevice: Device.isDevice,
        },
        timestamp: new Date().toISOString(),
        additionalData,
      };

      console.error(`🔵 BLE Error [${errorType}]:`, errorMessage);
      if (additionalData) {
        console.error('Additional data:', additionalData);
      }

      // Send to backend (fire and forget)
      fetch(`${this.backendUrl}/api/log-ble-error`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(errorData),
      }).catch((error) => {
        // Silently fail
        console.warn('Failed to log BLE error to backend:', error);
      });
    } catch (error) {
      // Silently fail
      console.warn('Error in BLE error logger:', error);
    }
  }

  /**
   * Log BLE initialization failure
   */
  public logInitializationError(error: Error | string, details?: Record<string, any>) {
    const message = typeof error === 'string' ? error : error.message;
    this.logBLEError('initialization', message, details);
  }

  /**
   * Log BLE scan failure
   */
  public logScanError(error: Error | string, details?: Record<string, any>) {
    const message = typeof error === 'string' ? error : error.message;
    this.logBLEError('scan', message, details);
  }

  /**
   * Log BLE connection failure
   */
  public logConnectionError(error: Error | string, deviceId?: string) {
    const message = typeof error === 'string' ? error : error.message;
    this.logBLEError('connection', message, { deviceId });
  }

  /**
   * Log BLE permission denial
   */
  public logPermissionError(permissionType: string, details?: Record<string, any>) {
    this.logBLEError(
      'permission',
      `Permission denied: ${permissionType}`,
      details
    );
  }

  /**
   * Log unknown BLE error
   */
  public logUnknownError(error: Error | string, details?: Record<string, any>) {
    const message = typeof error === 'string' ? error : error.message;
    this.logBLEError('unknown', message, details);
  }

  /**
   * Log BLE scan statistics (for tracking scan health)
   */
  public logScanStats(stats: {
    duration: number;
    devicesFound: number;
    errors?: number;
  }) {
    console.log('📊 BLE Scan Stats:', stats);

    // If no devices found or many errors, log it
    if (stats.devicesFound === 0 && stats.duration > 10000) {
      this.logBLEError(
        'scan',
        'BLE scan found no devices after extended period',
        stats
      );
    }
  }
}

// Export singleton instance
export const bleErrorLogger = BLEErrorLogger.getInstance();

/**
 * Hook to use BLE error logger in components
 */
export const useBLEErrorLogger = () => {
  return {
    logInitializationError: (error: Error | string, details?: Record<string, any>) =>
      bleErrorLogger.logInitializationError(error, details),
    logScanError: (error: Error | string, details?: Record<string, any>) =>
      bleErrorLogger.logScanError(error, details),
    logConnectionError: (error: Error | string, deviceId?: string) =>
      bleErrorLogger.logConnectionError(error, deviceId),
    logPermissionError: (permissionType: string, details?: Record<string, any>) =>
      bleErrorLogger.logPermissionError(permissionType, details),
    logUnknownError: (error: Error | string, details?: Record<string, any>) =>
      bleErrorLogger.logUnknownError(error, details),
    logScanStats: (stats: { duration: number; devicesFound: number; errors?: number }) =>
      bleErrorLogger.logScanStats(stats),
  };
};

export default bleErrorLogger;
