#!/usr/bin/env python3
"""
Generate a secure random JWT secret key for Droplin backend
Run this script and copy the output to your .env file
"""

import secrets

# Generate a 256-bit (32 bytes) URL-safe base64 encoded random key
secret_key = secrets.token_urlsafe(32)

print("=" * 80)
print("SECURE JWT SECRET KEY GENERATED")
print("=" * 80)
print()
print("Copy this value to your .env file:")
print()
print(f"JWT_SECRET_KEY={secret_key}")
print()
print("=" * 80)
print()
print("IMPORTANT:")
print("1. Add this to backend/.env file for local development")
print("2. Add this to Railway environment variables for production")
print("3. Keep this secret - NEVER commit to Git or share publicly")
print("4. Use a different key for development and production")
print()
print("=" * 80)

