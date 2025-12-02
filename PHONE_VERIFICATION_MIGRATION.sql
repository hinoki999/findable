-- Phone Verification System Migration
-- Run this in Supabase SQL Editor

-- Add phone verification columns to user_profiles table
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS phone_verification_code TEXT,
ADD COLUMN IF NOT EXISTS verification_code_expires TIMESTAMPTZ;

-- Create index for faster verification lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_phone_verified 
ON user_profiles(phone_verified);

-- Verify changes
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'user_profiles'
AND column_name IN ('phone_verified', 'phone_verification_code', 'verification_code_expires');

