const DEFAULT_IDENTITY_LOGIN_URL = "http://localhost:3000/login";

export function getIdentityLoginUrl(): string {
  const configuredUrl = process.env.NEXT_PUBLIC_JBOOT_IDENTITY_WEB_URL;

  if (!configuredUrl) {
    return DEFAULT_IDENTITY_LOGIN_URL;
  }

  try {
    return new URL("/login", configuredUrl).toString();
  } catch {
    return DEFAULT_IDENTITY_LOGIN_URL;
  }
}

export function redirectToIdentityLogin(): void {
  window.location.assign(getIdentityLoginUrl());
}
