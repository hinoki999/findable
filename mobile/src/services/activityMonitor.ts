/**
 * Activity Monitor
 * Comprehensive logging system for tracking app activity with colored console output
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  // Bright colors
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightBlue: '\x1b[94m',
  brightMagenta: '\x1b[95m',
  brightCyan: '\x1b[96m',
};

// Configuration
let isEnabled = true;

// Diagnostic tracking state with safeguards
const diagnosticState = {
  isRunning: false,
  lastRun: null as Date | null,
  cooldownMs: 5000, // 5 second cooldown between runs
  recentErrors: new Set<string>() // Track recent error URLs
};

/**
 * Initialize the activity monitor
 */
export const initMonitor = () => {
  isEnabled = true;
  const timestamp = getTimestamp();
  console.log(`${colors.brightCyan}[${timestamp}] 🚀 ACTIVITY MONITOR: Initialized${colors.reset}`);
  console.log(`${colors.gray}═══════════════════════════════════════════════════${colors.reset}\n`);
};

/**
 * Disable the monitor
 */
export const disableMonitor = () => {
  isEnabled = false;
};

/**
 * Enable the monitor
 */
export const enableMonitor = () => {
  isEnabled = true;
};

/**
 * Get formatted timestamp [HH:MM:SS]
 */
const getTimestamp = (): string => {
  const now = new Date();
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const seconds = now.getSeconds().toString().padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
};

/**
 * Format object for display with indentation
 */
const formatObject = (obj: any, indent: number = 0): string => {
  if (obj === null) return 'null';
  if (obj === undefined) return 'undefined';

  const indentStr = '  '.repeat(indent);

  if (typeof obj !== 'object') {
    return String(obj);
  }

  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';
    if (obj.length > 5) {
      return `[${obj.length} items]`;
    }
    return `[${obj.map(item => formatObject(item, 0)).join(', ')}]`;
  }

  const entries = Object.entries(obj);
  if (entries.length === 0) return '{}';
  if (entries.length > 10) {
    return `{${entries.length} properties}`;
  }

  return entries
    .map(([key, value]) => {
      if (typeof value === 'object' && value !== null) {
        return `${indentStr}  ${key}: ${formatObject(value, indent + 1)}`;
      }
      return `${indentStr}  ${key}: ${JSON.stringify(value)}`;
    })
    .join('\n');
};

/**
 * Truncate long strings for display
 */
const truncate = (str: string, maxLength: number = 100): string => {
  if (str.length <= maxLength) return str;
  return `${str.substring(0, maxLength)}...`;
};

/**
 * Log user action (button clicks, navigation, etc.)
 */
export const logAction = (action: string, details?: any) => {
  if (!isEnabled) return;

  const timestamp = getTimestamp();
  console.log(`${colors.brightMagenta}[${timestamp}] 🔘 ACTION: ${action}${colors.reset}`);

  if (details) {
    console.log(`${colors.gray}           ├─ Details:${colors.reset}`);
    console.log(`${colors.gray}${formatObject(details, 6)}${colors.reset}`);
  }
  console.log('');
};

/**
 * Log API call with full request/response details
 */
export const logApiCall = (
  method: string,
  url: string,
  request?: any,
  response?: any,
  timing?: number,
  error?: any
) => {
  if (!isEnabled) return;

  const timestamp = getTimestamp();

  // Request
  console.log(`${colors.brightBlue}[${timestamp}] 📡 API CALL: ${method} ${url}${colors.reset}`);

  if (request) {
    if (request.headers) {
      console.log(`${colors.gray}           ├─ Headers:${colors.reset}`);
      Object.entries(request.headers).forEach(([key, value]) => {
        // Mask sensitive headers
        if (key.toLowerCase() === 'authorization') {
          console.log(`${colors.gray}           │  ${key}: Bearer ***${colors.reset}`);
        } else {
          console.log(`${colors.gray}           │  ${key}: ${value}${colors.reset}`);
        }
      });
    }

    if (request.body) {
      console.log(`${colors.gray}           ├─ Body:${colors.reset}`);
      try {
        const body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
        // Mask sensitive fields
        const sanitized = { ...body };
        if (sanitized.password) sanitized.password = '***';
        if (sanitized.token) sanitized.token = '***';
        console.log(`${colors.gray}${formatObject(sanitized, 6)}${colors.reset}`);
      } catch (e) {
        console.log(`${colors.gray}           │  ${truncate(String(request.body), 150)}${colors.reset}`);
      }
    }
  }

  // Response
  if (error) {
    console.log(`${colors.brightRed}[${timestamp}] ❌ API ERROR: ${method} ${url}${colors.reset}`);
    console.log(`${colors.red}           ├─ Error: ${error.message || String(error)}${colors.reset}`);
    if (timing) {
      console.log(`${colors.gray}           ├─ Timing: ${timing}ms${colors.reset}`);
    }

    // SAFEGUARD: Auto-run diagnostics for profile save failures
    if (url.includes('/user/profile')) {
      // Extract user_id from URL if available
      const userIdMatch = url.match(/user[\/]?(\d+)/);
      const userId = userIdMatch ? parseInt(userIdMatch[1], 10) : undefined;

      // Use setTimeout to prevent blocking, wrap in catch to prevent cascading failures
      setTimeout(() => {
        runDiagnostics('profile_save', {
          url,
          error: error.message,
          ...(userId && { user_id: userId })
        }).catch(err => {
          // Silently catch diagnostic errors to prevent cascading failures
          console.log(`${colors.gray}[Diagnostic error suppressed]${colors.reset}`);
        });
      }, 100);
    }
  } else if (response) {
    const statusColor = response.status >= 200 && response.status < 300
      ? colors.brightGreen
      : response.status >= 400
      ? colors.brightRed
      : colors.brightYellow;

    console.log(`${statusColor}[${timestamp}] ✅ RESPONSE: ${response.status} ${response.statusText || 'OK'}${colors.reset}`);

    if (timing) {
      console.log(`${colors.gray}           ├─ Timing: ${timing}ms${colors.reset}`);
    }

    if (response.data) {
      console.log(`${colors.gray}           ├─ Data:${colors.reset}`);
      try {
        const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
        console.log(`${colors.gray}${formatObject(data, 6)}${colors.reset}`);
      } catch (e) {
        console.log(`${colors.gray}           │  ${truncate(String(response.data), 150)}${colors.reset}`);
      }
    }
  }

  console.log('');
};

/**
 * Run diagnostics and display results with comprehensive safeguards
 */
export const runDiagnostics = async (
  diagnosticType: 'profile_save' | 'auth' | 'database',
  context: any
) => {
  try {
    // SAFEGUARD 1: Prevent concurrent runs
    if (diagnosticState.isRunning) {
      console.log(`${colors.yellow}⏸️  Diagnostics already running, skipping...${colors.reset}`);
      return;
    }

    // SAFEGUARD 2: Cooldown check
    if (diagnosticState.lastRun) {
      const timeSinceLastRun = Date.now() - diagnosticState.lastRun.getTime();
      if (timeSinceLastRun < diagnosticState.cooldownMs) {
        console.log(`${colors.yellow}⏸️  Diagnostics in cooldown (${Math.ceil((diagnosticState.cooldownMs - timeSinceLastRun) / 1000)}s remaining)${colors.reset}`);
        return;
      }
    }

    // SAFEGUARD 3: Deduplication check
    const errorKey = `${diagnosticType}:${JSON.stringify(context)}`;
    if (diagnosticState.recentErrors.has(errorKey)) {
      console.log(`${colors.yellow}⏸️  Diagnostics already ran for this error${colors.reset}`);
      return;
    }

    // Mark as running
    diagnosticState.isRunning = true;
    diagnosticState.recentErrors.add(errorKey);

    // Clear old errors after 1 minute
    setTimeout(() => {
      diagnosticState.recentErrors.delete(errorKey);
    }, 60000);

    console.log(`\n${colors.yellow}🔍 RUNNING DIAGNOSTICS: ${diagnosticType}${colors.reset}`);

    const token = await AsyncStorage.getItem('@droplink_token');

    // SAFEGUARD 4: Extract user_id properly
    let userId = context?.user_id;
    if (!userId && context?.url) {
      console.log(`${colors.yellow}   No user_id provided, extracting from context...${colors.reset}`);
      // Try to extract from token if available
      if (token) {
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          userId = payload.user_id || payload.sub;
        } catch (e) {
          // Silent fail
        }
      }
    }

    // SAFEGUARD 5: Timeout protection (10 second timeout)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch('https://findable-production.up.railway.app/api/diagnostics/run', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` })
      },
      body: JSON.stringify({
        diagnostic_type: diagnosticType,
        context: {
          ...context,
          ...(userId && { user_id: userId })
        }
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Diagnostic API returned ${response.status}`);
    }

    const results = await response.json();

    // Format and display results
    console.log(`${colors.yellow}═══════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.yellow}📊 DIAGNOSTIC RESULTS: ${results.overall_status?.toUpperCase() || 'UNKNOWN'}${colors.reset}`);
    console.log(`${colors.yellow}   Timestamp: ${results.timestamp}${colors.reset}`);

    if (results.checks && Array.isArray(results.checks)) {
      results.checks.forEach((check: any) => {
        const statusIcon = check.status === 'pass' ? '✅' : check.status === 'fail' ? '❌' : '⚠️';
        const statusColor = check.status === 'pass' ? colors.green : check.status === 'fail' ? colors.red : colors.yellow;

        console.log(`\n${statusColor}${statusIcon} ${check.name}: ${check.status?.toUpperCase() || 'UNKNOWN'}${colors.reset}`);

        if (check.details) {
          Object.entries(check.details).forEach(([key, value]) => {
            console.log(`   ${key}: ${JSON.stringify(value, null, 2)}`);
          });
        }

        if (check.error) {
          console.log(`${colors.red}   Error: ${check.error}${colors.reset}`);
        }
      });
    }

    console.log(`${colors.yellow}═══════════════════════════════════════════════════${colors.reset}\n`);

    // Update last run time
    diagnosticState.lastRun = new Date();

  } catch (error: any) {
    // SAFEGUARD 6: Error isolation - diagnostics failure should not break app
    if (error.name === 'AbortError') {
      console.log(`${colors.red}⏱️  Diagnostic timed out after 10 seconds${colors.reset}`);
    } else {
      console.log(`${colors.red}❌ Diagnostic failed: ${error.message}${colors.reset}`);
    }
  } finally {
    // Always clear running flag
    diagnosticState.isRunning = false;
  }
};

/**
 * Log state change (Redux, Context, local state)
 */
export const logStateChange = (key: string, oldValue: any, newValue: any) => {
  if (!isEnabled) return;

  const timestamp = getTimestamp();
  console.log(`${colors.cyan}[${timestamp}] 🔄 STATE CHANGE: ${key}${colors.reset}`);
  console.log(`${colors.gray}           ├─ Old: ${formatObject(oldValue, 0)}${colors.reset}`);
  console.log(`${colors.gray}           └─ New: ${formatObject(newValue, 0)}${colors.reset}`);
  console.log('');
};

/**
 * Log database operation
 */
export const logDatabase = (operation: string, table: string, data?: any) => {
  if (!isEnabled) return;

  const timestamp = getTimestamp();
  console.log(`${colors.brightYellow}[${timestamp}] 🗄️  DATABASE: ${operation} ${table}${colors.reset}`);

  if (data) {
    console.log(`${colors.gray}           ├─ Data:${colors.reset}`);
    console.log(`${colors.gray}${formatObject(data, 6)}${colors.reset}`);
  }
  console.log('');
};

/**
 * Log error with full stack trace and context
 */
export const logError = (error: Error | any, context?: string) => {
  if (!isEnabled) return;

  const timestamp = getTimestamp();
  console.log(`${colors.brightRed}[${timestamp}] ❌ ERROR${context ? `: ${context}` : ''}${colors.reset}`);
  console.log(`${colors.red}           ├─ Message: ${error.message || String(error)}${colors.reset}`);

  if (error.stack) {
    console.log(`${colors.red}           ├─ Stack:${colors.reset}`);
    const stackLines = error.stack.split('\n').slice(1, 4); // First 3 stack frames
    stackLines.forEach((line: string) => {
      console.log(`${colors.red}           │  ${line.trim()}${colors.reset}`);
    });
  }

  if (error.code) {
    console.log(`${colors.red}           ├─ Code: ${error.code}${colors.reset}`);
  }

  if (error.details) {
    console.log(`${colors.red}           ├─ Details:${colors.reset}`);
    console.log(`${colors.red}${formatObject(error.details, 6)}${colors.reset}`);
  }

  console.log('');
};

/**
 * Log navigation event
 */
export const logNavigation = (from: string, to: string, params?: any) => {
  if (!isEnabled) return;

  const timestamp = getTimestamp();
  console.log(`${colors.brightCyan}[${timestamp}] 🧭 NAVIGATION: ${from} → ${to}${colors.reset}`);

  if (params) {
    console.log(`${colors.gray}           ├─ Params:${colors.reset}`);
    console.log(`${colors.gray}${formatObject(params, 6)}${colors.reset}`);
  }
  console.log('');
};

/**
 * Log authentication event
 */
export const logAuth = (event: string, user?: any) => {
  if (!isEnabled) return;

  const timestamp = getTimestamp();
  console.log(`${colors.brightGreen}[${timestamp}] 🔐 AUTH: ${event}${colors.reset}`);

  if (user) {
    const sanitized = { ...user };
    if (sanitized.password) delete sanitized.password;
    if (sanitized.token) sanitized.token = '***';

    console.log(`${colors.gray}           ├─ User:${colors.reset}`);
    console.log(`${colors.gray}${formatObject(sanitized, 6)}${colors.reset}`);
  }
  console.log('');
};

/**
 * Log warning
 */
export const logWarning = (message: string, details?: any) => {
  if (!isEnabled) return;

  const timestamp = getTimestamp();
  console.log(`${colors.brightYellow}[${timestamp}] ⚠️  WARNING: ${message}${colors.reset}`);

  if (details) {
    console.log(`${colors.yellow}           ├─ Details:${colors.reset}`);
    console.log(`${colors.yellow}${formatObject(details, 6)}${colors.reset}`);
  }
  console.log('');
};

/**
 * Log info message
 */
export const logInfo = (message: string, details?: any) => {
  if (!isEnabled) return;

  const timestamp = getTimestamp();
  console.log(`${colors.blue}[${timestamp}] ℹ️  INFO: ${message}${colors.reset}`);

  if (details) {
    console.log(`${colors.gray}           ├─ Details:${colors.reset}`);
    console.log(`${colors.gray}${formatObject(details, 6)}${colors.reset}`);
  }
  console.log('');
};

/**
 * Log success message
 */
export const logSuccess = (message: string, details?: any) => {
  if (!isEnabled) return;

  const timestamp = getTimestamp();
  console.log(`${colors.brightGreen}[${timestamp}] ✅ SUCCESS: ${message}${colors.reset}`);

  if (details) {
    console.log(`${colors.gray}           ├─ Details:${colors.reset}`);
    console.log(`${colors.gray}${formatObject(details, 6)}${colors.reset}`);
  }
  console.log('');
};

/**
 * Log performance metric
 */
export const logPerformance = (operation: string, duration: number, metadata?: any) => {
  if (!isEnabled) return;

  const timestamp = getTimestamp();
  const color = duration < 100 ? colors.green : duration < 500 ? colors.yellow : colors.red;

  console.log(`${color}[${timestamp}] ⚡ PERFORMANCE: ${operation} (${duration}ms)${colors.reset}`);

  if (metadata) {
    console.log(`${colors.gray}           ├─ Metadata:${colors.reset}`);
    console.log(`${colors.gray}${formatObject(metadata, 6)}${colors.reset}`);
  }
  console.log('');
};

/**
 * Create a divider for visual separation
 */
export const logDivider = (label?: string) => {
  if (!isEnabled) return;

  if (label) {
    console.log(`${colors.gray}═══════════════ ${label} ═══════════════${colors.reset}\n`);
  } else {
    console.log(`${colors.gray}═══════════════════════════════════════════════════${colors.reset}\n`);
  }
};

/**
 * Manual diagnostic trigger for debugging - bypasses all safeguards
 */
export const manualDiagnostic = async (userId?: number) => {
  console.log(`${colors.brightCyan}🔓 Manual diagnostic trigger - bypassing safeguards${colors.reset}`);
  diagnosticState.isRunning = false; // Force reset
  diagnosticState.lastRun = null; // Clear cooldown
  diagnosticState.recentErrors.clear(); // Clear deduplication

  await runDiagnostics('profile_save', { user_id: userId });
};

/**
 * Reset diagnostic state - useful for debugging
 */
export const resetDiagnostics = () => {
  diagnosticState.isRunning = false;
  diagnosticState.lastRun = null;
  diagnosticState.recentErrors.clear();
  console.log(`${colors.green}✅ Diagnostics reset${colors.reset}`);
};

// Export all functions
export default {
  initMonitor,
  disableMonitor,
  enableMonitor,
  logAction,
  logApiCall,
  runDiagnostics,
  manualDiagnostic,
  resetDiagnostics,
  logStateChange,
  logDatabase,
  logError,
  logNavigation,
  logAuth,
  logWarning,
  logInfo,
  logSuccess,
  logPerformance,
  logDivider,
};
