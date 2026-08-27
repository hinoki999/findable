// Environment configuration
// Railway backend removed - app uses Supabase directly
export type Environment = 'development' | 'production';

const CURRENT_ENV: Environment = 'production';

const ENV_CONFIG = {
  development: {
    BASE_URL: '',
    NAME: 'Development',
    ENFORCE_HTTPS: false,
  },
  production: {
    BASE_URL: '',
    NAME: 'Production',
    ENFORCE_HTTPS: true,
  },
};

export const ENV = ENV_CONFIG[CURRENT_ENV];

export const isDevelopment = () => CURRENT_ENV === 'development';
export const isProduction = () => CURRENT_ENV === 'production';

