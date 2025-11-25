import { createClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'

const supabaseUrl = 'https://jfuhplqtujaakksmixii.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpmdWhwbHF0dWphYWtrc21peGlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM5Njk0NzEsImV4cCI6MjA3OTU0NTQ3MX0.YC_Xi5gmqZEi-DBjjAqLmcCik3ho2eZAa1UU2oXJ6QA'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})

