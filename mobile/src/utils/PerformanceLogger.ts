import { Platform } from 'react-native';
import * as Device from 'expo-device';
import { ENV } from '../config/environment';

interface PerformanceMetric {
  metricName: string;
  durationMs: number;
  screenName?: string;
  userId?: string | number;
  timestamp: string;
  additionalData?: Record<string, any>;
}

/**
 * Performance logger to track screen load times, API calls, and other metrics.
 */
class PerformanceLogger {
  private static instance: PerformanceLogger;
  private userId?: string | number;
  private currentScreen?: string;
  private backendUrl: string;
  private timers: Map<string, number> = new Map();

  private constructor() {
    this.backendUrl = ENV.BASE_URL;
  }

  public static getInstance(): PerformanceLogger {
    if (!PerformanceLogger.instance) {
      PerformanceLogger.instance = new PerformanceLogger();
    }
    return PerformanceLogger.instance;
  }

  /**
   * Set the current user ID for metrics
   */
  public setUserId(userId: string | number | undefined) {
    this.userId = userId;
  }

  /**
   * Set the current screen name for metrics
   */
  public setCurrentScreen(screenName: string) {
    this.currentScreen = screenName;
  }

  /**
   * Start timing an operation
   */
  public startTimer(timerName: string) {
    this.timers.set(timerName, Date.now());
  }

  /**
   * End timing an operation and log the metric
   */
  public endTimer(
    timerName: string,
    additionalData?: Record<string, any>
  ) {
    const startTime = this.timers.get(timerName);
    if (!startTime) {
      console.warn(`Timer "${timerName}" was never started`);
      return;
    }

    const durationMs = Date.now() - startTime;
    this.timers.delete(timerName);

    this.logMetric(timerName, durationMs, additionalData);
  }

  /**
   * Log a performance metric to the backend
   */
  public async logMetric(
    metricName: string,
    durationMs: number,
    additionalData?: Record<string, any>
  ) {
    try {
      const metric: PerformanceMetric = {
        metricName,
        durationMs,
        screenName: this.currentScreen || 'Unknown',
        userId: this.userId,
        timestamp: new Date().toISOString(),
        additionalData,
      };

      console.log(`📊 Performance: ${metricName} took ${durationMs}ms`);

      // Warn if operation is slow
      if (durationMs > 3000) {
        console.warn(`⚠️ Slow operation detected: ${metricName} took ${durationMs}ms`);
      }

      // Send to backend (fire and forget)
      fetch(`${this.backendUrl}/api/log-performance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(metric),
      }).catch((error) => {
        // Silently fail
        console.warn('Failed to log performance metric:', error);
      });
    } catch (error) {
      // Silently fail
      console.warn('Error in performance logger:', error);
    }
  }

  /**
   * Track screen load time
   * Call this when screen mounts
   */
  public trackScreenLoad(screenName: string) {
    const timerName = `screen_load_${screenName}`;
    this.startTimer(timerName);

    // Return cleanup function to call when screen is ready
    return () => {
      this.endTimer(timerName, { screenName });
    };
  }

  /**
   * Track API request duration
   */
  public async trackApiCall<T>(
    apiName: string,
    apiCall: () => Promise<T>
  ): Promise<T> {
    const timerName = `api_${apiName}`;
    this.startTimer(timerName);

    try {
      const result = await apiCall();
      this.endTimer(timerName, { apiName, success: true });
      return result;
    } catch (error) {
      this.endTimer(timerName, { apiName, success: false, error: String(error) });
      throw error;
    }
  }

  /**
   * Track photo upload time
   */
  public trackPhotoUpload() {
    const timerName = 'photo_upload';
    this.startTimer(timerName);

    return {
      success: () => this.endTimer(timerName, { success: true }),
      failure: (error: string) => this.endTimer(timerName, { success: false, error }),
    };
  }

  /**
   * Track BLE scan duration
   */
  public trackBLEScan() {
    const timerName = 'ble_scan';
    this.startTimer(timerName);

    return {
      complete: (devicesFound: number) =>
        this.endTimer(timerName, { devicesFound }),
      error: (error: string) =>
        this.endTimer(timerName, { error }),
    };
  }
}

// Export singleton instance
export const performanceLogger = PerformanceLogger.getInstance();

/**
 * Hook to use performance logger in components
 */
export const usePerformanceLogger = () => {
  return {
    startTimer: (name: string) => performanceLogger.startTimer(name),
    endTimer: (name: string, data?: Record<string, any>) =>
      performanceLogger.endTimer(name, data),
    trackScreenLoad: (screenName: string) =>
      performanceLogger.trackScreenLoad(screenName),
    trackApiCall: <T,>(name: string, call: () => Promise<T>) =>
      performanceLogger.trackApiCall(name, call),
    trackPhotoUpload: () => performanceLogger.trackPhotoUpload(),
    trackBLEScan: () => performanceLogger.trackBLEScan(),
  };
};

export default performanceLogger;
