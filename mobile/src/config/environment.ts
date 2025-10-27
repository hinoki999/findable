// Environment configuration for API endpoints
// Switch between development and production URLs

export type Environment = 'development' | 'production';

// Set this to switch environments
const CURRENT_ENV: Environment = 'production'; // Change to 'development' for local testing

const ENV_CONFIG = {
  development: {
    BASE_URL: 'http://192.168.1.92:8081',
    NAME: 'Development (Local)',
    ENFORCE_HTTPS: false,
  },
  production: {
    BASE_URL: 'https://findable-production.up.railway.app',
    NAME: 'Production (Railway)',
    ENFORCE_HTTPS: true,
  },
};

export const ENV = ENV_CONFIG[CURRENT_ENV];

// Helper to check if we're in development mode
export const isDevelopment = () => CURRENT_ENV === 'development';
export const isProduction = () => CURRENT_ENV === 'production';

// Log current environment on import
console.log(`🌍 API Environment: ${ENV.NAME}`);
console.log(`🔗 Base URL: ${ENV.BASE_URL}`);

