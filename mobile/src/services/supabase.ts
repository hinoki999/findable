import { Platform, AppState } from 'react-native'
import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://jfuhplqtujaakksmixii.supabase.co'
const supabaseAnonKey = 'sb_publishable_OAfmIDiZq5XPWFlGVyWomA__4q7XRnN'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  global: {
    headers: {
      'X-Client-Info': 'supabase-js-react-native',
    },
  },
})

// CRITICAL: Start auto-refresh immediately on module load
supabase.auth.startAutoRefresh()

// Register AppState listener for React Native
// This keeps the session alive and refreshes tokens properly
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh()
  } else {
    supabase.auth.stopAutoRefresh()
  }
})
