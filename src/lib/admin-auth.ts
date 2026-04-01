import { cookies } from "next/headers";

const TOKEN_NAME = "admin_token";

// Simple HMAC-based token: timestamp.signature
// In production, consider using a proper JWT library
export async function createAdminToken(): Promise<string> {
  const timestamp = Date.now().toString();
  const secret = process.env.ADMIN_PASSWORD!;
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(timestamp)
  );

  const sig = Buffer.from(signature).toString("hex");
  return `${timestamp}.${sig}`;
}

export async function verifyAdminToken(token: string): Promise<boolean> {
  try {
    const [timestamp, sig] = token.split(".");
    if (!timestamp || !sig) return false;

    // Token expires after 7 days
    const age = Date.now() - parseInt(timestamp);
    if (age > 7 * 24 * 60 * 60 * 1000) return false;

    const secret = process.env.ADMIN_PASSWORD!;
    const encoder = new TextEncoder();

    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const sigBytes = Uint8Array.from(
      sig.match(/.{2}/g)!.map((byte) => parseInt(byte, 16))
    );

    return await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes,
      encoder.encode(timestamp)
    );
  } catch {
    return false;
  }
}

export async function setAdminCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(TOKEN_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60, // 7 days
    path: "/",
  });
}

export async function isAdminAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(TOKEN_NAME)?.value;
  if (!token) return false;
  return verifyAdminToken(token);
}

export async function clearAdminCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(TOKEN_NAME);
}
