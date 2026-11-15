export const isCorsOriginAllowed = (origin: string | undefined): boolean => {
  if (!origin) return true; // Cho phép các client phi trình duyệt (cURL, mobile app native, server-to-server)

  const allowedOriginsEnv = process.env.CORS_ALLOWED_ORIGINS;
  const configuredOrigins = allowedOriginsEnv
    ? allowedOriginsEnv
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean)
    : [];

  if (configuredOrigins.includes(origin)) {
    return true;
  }

  if (process.env.NODE_ENV === 'production') {
    return false;
  }

  try {
    const parsed = new URL(origin);
    const hostname = parsed.hostname;
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      /^192\.168\.\d+\.\d+$/.test(hostname) ||
      /^10\.\d+\.\d+\.\d+$/.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(hostname)
    ) {
      return true;
    }
  } catch {
    return false;
  }

  return false;
};
