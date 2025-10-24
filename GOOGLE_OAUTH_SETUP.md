# Google OAuth Setup Guide

To enable "Continue with Google" functionality, you need to set up Google OAuth credentials. Follow these steps:

## 1. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the **Google+ API** (or Google Identity)

## 2. Create OAuth Credentials

### For Web (Development)
1. Go to **APIs & Services** > **Credentials**
2. Click **Create Credentials** > **OAuth client ID**
3. Choose **Web application**
4. Add Authorized JavaScript origins:
   - `http://localhost:8081`
   - `http://localhost:19006`
5. Add Authorized redirect URIs:
   - `http://localhost:8081`
   - `http://localhost:19006`
6. Copy the **Client ID**

### For iOS
1. Create another OAuth client ID
2. Choose **iOS**
3. Enter your bundle identifier (e.g., `com.yourcompany.droplink`)
4. Copy the **Client ID**

### For Android
1. Create another OAuth client ID
2. Choose **Android**
3. Enter your package name (e.g., `com.yourcompany.droplink`)
4. Get your SHA-1 certificate fingerprint:
   ```bash
   keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
   ```
5. Copy the **Client ID**

### For Expo
1. Create another OAuth client ID
2. Choose **Web application**
3. Add redirect URI: `https://auth.expo.io/@your-username/your-app-slug`
4. Copy the **Client ID**

## 3. Update Configuration Files

### Frontend (`mobile/src/services/googleAuth.ts`)
```typescript
const GOOGLE_OAUTH_CONFIG = {
  expoClientId: 'YOUR_EXPO_CLIENT_ID.apps.googleusercontent.com',
  iosClientId: 'YOUR_IOS_CLIENT_ID.apps.googleusercontent.com',
  androidClientId: 'YOUR_ANDROID_CLIENT_ID.apps.googleusercontent.com',
  webClientId: 'YOUR_WEB_CLIENT_ID.apps.googleusercontent.com',
};
```

### Backend (`backend/main.py`)
```python
GOOGLE_CLIENT_ID = "YOUR_WEB_CLIENT_ID.apps.googleusercontent.com"
```

**Important:** Use the **Web Client ID** for backend verification (not iOS or Android IDs).

## 4. Install Dependencies

### Frontend
```bash
cd mobile
npm install
```

### Backend
```bash
cd backend
pip install -r requirements.txt
```

## 5. Test the Integration

1. Start the backend:
   ```bash
   cd backend
   uvicorn main:app --reload
   ```

2. Start the frontend:
   ```bash
   cd mobile
   npm run web
   ```

3. Click "Continue with Google" on the Welcome screen
4. Sign in with your Google account
5. You should be automatically logged in and see the Contact Info screen

## Troubleshooting

### "Invalid Client" Error
- Make sure you're using the correct Client ID for the platform
- Check that redirect URIs are correctly configured
- Verify the Client ID has no extra spaces

### "Access Blocked" Error
- Add test users in Google Cloud Console > **OAuth consent screen** > **Test users**
- Your app needs to be verified for production use

### Token Verification Failed
- Ensure backend is using the Web Client ID (not iOS/Android)
- Check that `google-auth` library is installed

## Production Deployment

### Railway Backend
Add environment variable:
```
GOOGLE_CLIENT_ID=your_web_client_id_here.apps.googleusercontent.com
```

Update `backend/main.py`:
```python
import os
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "YOUR_DEFAULT_CLIENT_ID")
```

### Security Notes
- Never commit Client IDs to public repositories
- Use environment variables in production
- Keep your Client Secret secure (never expose to frontend)
- Configure OAuth consent screen properly before going live

