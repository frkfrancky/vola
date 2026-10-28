import "server-only";
import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";

const COOKIE_NAME = "vola_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function secretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("SESSION_SECRET doit être défini (au moins 16 caractères).");
  }
  return new TextEncoder().encode(secret);
}

export async function createSession(userId: string) {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secretKey());

  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function getSession(): Promise<{ userId: string; issuedAt: number } | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (!payload.sub || !payload.iat) return null;
    return { userId: payload.sub, issuedAt: payload.iat };
  } catch {
    return null;
  }
}

export async function deleteSession() {
  (await cookies()).delete(COOKIE_NAME);
}
