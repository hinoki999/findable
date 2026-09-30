import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FCM_URL = "https://fcm.googleapis.com/v1/projects/droplink-5700c/messages:send";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  record: {
    id: string;
    sender_id: string;
    receiver_id: string;
    status: string;
    sender_name: string | null;
    created_at: string;
    responded_at: string | null;
  };
  old_record: {
    id: string;
    status: string;
  } | null;
}

interface UserProfile {
  user_id: string;
  name: string | null;
  username?: string | null;
  push_token: string | null;
}

// Names shown in a push come from the account's profile, never from the drop row
// (sender_name is written by the sender and could say anything). Control characters
// and line breaks are removed and the length capped, so a name can't fake extra
// notification text.
function displayName(profile: { name?: string | null; username?: string | null } | undefined): string {
  const raw = profile?.name || profile?.username || "";
  const clean = raw.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\s+/g, " ").trim();
  if (!clean) return "Someone";
  return clean.length > 40 ? `${clean.slice(0, 39)}…` : clean;
}

// Base64url encode for JWT
function base64urlEncode(str: string): string {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlEncodeBytes(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Generate a signed JWT for Google OAuth2
async function generateJWT(serviceAccount: {
  client_email: string;
  private_key: string;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: GOOGLE_TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };

  const encodedHeader = base64urlEncode(JSON.stringify(header));
  const encodedPayload = base64urlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  // Import private key
  const pemContents = serviceAccount.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\n/g, "");

  const keyData = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    keyData.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(signingInput)
  );

  return `${signingInput}.${base64urlEncodeBytes(signature)}`;
}

// Exchange JWT for Google OAuth2 access token
async function getAccessToken(serviceAccount: {
  client_email: string;
  private_key: string;
}): Promise<string> {
  const jwt = await generateJWT(serviceAccount);
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get access token: ${error}`);
  }

  const data = await response.json();
  return data.access_token;
}

// Send FCM V1 notification
async function sendFCMNotification(
  fcmToken: string,
  title: string,
  body: string,
  accessToken: string
): Promise<void> {
  try {
    const response = await fetch(FCM_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        message: {
          token: fcmToken,
          notification: { title, body },
          android: {
            priority: "high",
            notification: { sound: "default" },
          },
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("[FCM] Push failed:", response.status, error);
    } else {
      console.log("[FCM] Push sent successfully to token:", fcmToken.substring(0, 20) + "...");
    }
  } catch (error) {
    console.error("[FCM] Error sending notification:", error);
  }
}

serve(async (req) => {
  const validKeys = Object.values(JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}'));
  if (!validKeys.includes(req.headers.get('apikey'))) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const payload: WebhookPayload = await req.json();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Load Firebase service account
    const serviceAccountRaw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
    if (!serviceAccountRaw) {
      console.error("[FCM] FIREBASE_SERVICE_ACCOUNT secret not set");
      return new Response(JSON.stringify({ error: "Firebase credentials missing" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const serviceAccount = JSON.parse(serviceAccountRaw);
    const accessToken = await getAccessToken(serviceAccount);

    const { type, record, old_record } = payload;

    if (type === "INSERT" && record.status === "pending") {
      const { data: profiles } = await supabase
        .from("user_profiles")
        .select("user_id, name, username, push_token")
        .in("user_id", [record.sender_id, record.receiver_id]);
      const sender = profiles?.find((p: UserProfile) => p.user_id === record.sender_id);
      const receiver = profiles?.find((p: UserProfile) => p.user_id === record.receiver_id);

      if (receiver?.push_token) {
        console.log("[FCM] Sending drop notification to receiver:", record.receiver_id.substring(0, 8));
        await sendFCMNotification(
          receiver.push_token,
          "New Drop!",
          `${displayName(sender)} sent you a drop`,
          accessToken
        );
      } else {
        console.log("[FCM] No push token found for receiver:", record.receiver_id.substring(0, 8));
      }
    }

    if (type === "UPDATE" && record.status === "linked" && old_record?.status !== "linked") {
      const { data: profiles } = await supabase
        .from("user_profiles")
        .select("user_id, name, username, push_token")
        .in("user_id", [record.sender_id, record.receiver_id]);

      if (profiles) {
        const sender = profiles.find((p: UserProfile) => p.user_id === record.sender_id);
        const receiver = profiles.find((p: UserProfile) => p.user_id === record.receiver_id);

        if (sender?.push_token) {
          await sendFCMNotification(
            sender.push_token,
            "New Link!",
            `You linked with ${displayName(receiver)}`,
            accessToken
          );
        }
        if (receiver?.push_token) {
          await sendFCMNotification(
            receiver.push_token,
            "New Link!",
            `You linked with ${displayName(sender)}`,
            accessToken
          );
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[Webhook] Error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});