import { createClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'

const supabaseUrl = 'https://jfuhplqtujaakksmixii.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpmdWhwbHF0dWphYWtrc21peGlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzI0MzMzMzQsImV4cCI6MjA0ODAwOTMzNH0.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpmdWhwbHF0dWphYWtrc21peGlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzI0MzMzMzQsImV4cCI6MjA0ODAwOTMzNH0'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})

