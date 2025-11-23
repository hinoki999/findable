import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { ENV } from '../config/environment';

interface ErrorData {
  message: string;
  stack?: string;
  screenName?: string;
  userId?: string | number;
  deviceInfo: {
    platform: string;
    osVersion: string;
    deviceModel: string;
    appVersion: string;
    isDevice: boolean;
  };
  timestamp: string;
}

/**
 * Global error logger that catches all JavaScript errors in the app.
 * Sends errors to backend for monitoring.
 */
class ErrorLogger {
  private static instance: ErrorLogger;
  private userId?: string | number;
  private currentScreen?: string;
  private backendUrl: string;

  private constructor() {
    this.backendUrl = ENV.BASE_URL;
  }

  public static getInstance(): ErrorLogger {
    if (!ErrorLogger.instance) {
      ErrorLogger.instance = new ErrorLogger();
    }
    return ErrorLogger.instance;
  }

  /**
   * Set the current user ID for error tracking
   */
  public setUserId(userId: string | number | undefined) {
    this.userId = userId;
  }

  /**
   * Set the current screen name for error tracking
   */
  public setCurrentScreen(screenName: string) {
    this.currentScreen = screenName;
  }

  /**
   * Log an error to the backend
   */
  public async logError(
    error: Error,
    errorInfo?: ErrorInfo | any,
    customData?: Record<string, any>
  ) {
    try {
      const errorData: ErrorData = {
        message: error.message || 'Unknown error',
        stack: error.stack || errorInfo?.componentStack || 'No stack trace',
        screenName: this.currentScreen || 'Unknown',
        userId: this.userId,
        deviceInfo: {
          platform: Platform.OS,
          osVersion: Platform.Version.toString(),
          deviceModel: Device.modelName || 'Unknown',
          appVersion: Constants.expoConfig?.version || 'Unknown',
          isDevice: Device.isDevice,
        },
        timestamp: new Date().toISOString(),
      };

      // Add custom data if provided
      const payload = {
        ...errorData,
        ...customData,
      };

      console.error('📤 Logging error to backend:', payload);

      // Send to backend (fire and forget - don't block user experience)
      fetch(`${this.backendUrl}/api/log-error`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }).catch((fetchError) => {
        // Silently fail - don't crash app if logging fails
        console.warn('Failed to log error to backend:', fetchError);
      });
    } catch (loggingError) {
      // Silently fail - don't crash app while trying to log an error
      console.warn('Error in error logger:', loggingError);
    }
  }

  /**
   * Log a custom error with a message
   */
  public async logCustomError(
    message: string,
    details?: Record<string, any>
  ) {
    const error = new Error(message);
    await this.logError(error, undefined, details);
  }
}

// Export singleton instance
export const errorLogger = ErrorLogger.getInstance();

// Error Boundary Component
interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error) => ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('🔴 Error Boundary caught error:', error);
    console.error('Error Info:', errorInfo);

    // Log to backend
    errorLogger.logError(error, errorInfo);
  }

  render() {
    if (this.state.hasError && this.state.error) {
      // Render fallback UI if provided
      if (this.props.fallback) {
        return this.props.fallback(this.state.error);
      }

      // Default error UI
      return null; // Or you can show a default error screen
    }

    return this.props.children;
  }
}

/**
 * Hook to manually log errors from components
 */
export const useErrorLogger = () => {
  const logError = (error: Error, customData?: Record<string, any>) => {
    errorLogger.logError(error, undefined, customData);
  };

  const logCustomError = (message: string, details?: Record<string, any>) => {
    errorLogger.logCustomError(message, details);
  };

  return {
    logError,
    logCustomError,
  };
};

export default errorLogger;
