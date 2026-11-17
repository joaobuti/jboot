"use client";

export function getPlatformAuthToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const authUser = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("authUser="));

  if (!authUser) {
    return null;
  }

  try {
    const session = JSON.parse(decodeURIComponent(authUser.split("=").slice(1).join("="))) as {
      accessToken?: string;
    };
    return session.accessToken ?? null;
  } catch {
    return null;
  }
}
