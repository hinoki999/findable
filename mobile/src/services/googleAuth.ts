import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { makeRedirectUri } from 'expo-auth-session';
import { Platform } from 'react-native';

// This is required for web browser completion
WebBrowser.maybeCompleteAuthSession();

// Google OAuth Client IDs (you'll need to create these in Google Cloud Console)
const GOOGLE_OAUTH_CONFIG = {
  expoClientId: 'YOUR_EXPO_CLIENT_ID_HERE.apps.googleusercontent.com',
  iosClientId: 'YOUR_IOS_CLIENT_ID_HERE.apps.googleusercontent.com',
  androidClientId: 'YOUR_ANDROID_CLIENT_ID_HERE.apps.googleusercontent.com',
  webClientId: 'YOUR_WEB_CLIENT_ID_HERE.apps.googleusercontent.com',
};

export function useGoogleAuth() {
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest(
    {
      clientId: Platform.select({
        ios: GOOGLE_OAUTH_CONFIG.iosClientId,
        android: GOOGLE_OAUTH_CONFIG.androidClientId,
        web: GOOGLE_OAUTH_CONFIG.webClientId,
        default: GOOGLE_OAUTH_CONFIG.expoClientId,
      }),
    }
  );

  return {
    request,
    response,
    promptAsync,
  };
}

export async function authenticateWithGoogle(idToken: string): Promise<{
  token: string;
  user_id: number;
  username: string;
}> {
  const response = await fetch('https://findable-production.up.railway.app/auth/google', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id_token: idToken,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Google authentication failed');
  }

  return await response.json();
}

