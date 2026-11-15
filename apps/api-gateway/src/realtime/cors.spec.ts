import { isOriginAllowed } from './realtime.gateway';

describe('API Gateway & Realtime CORS Origin Policy', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalCorsAllowedOrigins = process.env.CORS_ALLOWED_ORIGINS;

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
    if (originalCorsAllowedOrigins === undefined) {
      delete process.env.CORS_ALLOWED_ORIGINS;
    } else {
      process.env.CORS_ALLOWED_ORIGINS = originalCorsAllowedOrigins;
    }
  });

  it('should allow local development origins outside production', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.CORS_ALLOWED_ORIGINS;

    expect(isOriginAllowed('http://localhost:3000')).toBe(true);
    expect(isOriginAllowed('http://localhost:5173')).toBe(true);
    expect(isOriginAllowed('http://127.0.0.1:3000')).toBe(true);
  });

  it('should allow LAN private network origins outside production', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.CORS_ALLOWED_ORIGINS;

    expect(isOriginAllowed('http://192.168.1.10:3000')).toBe(true);
    expect(isOriginAllowed('http://10.0.0.5:8080')).toBe(true);
    expect(isOriginAllowed('http://172.16.0.2:3000')).toBe(true);
  });

  it('should reject localhost and LAN origins in production unless explicitly allowlisted', () => {
    process.env.NODE_ENV = 'production';
    process.env.CORS_ALLOWED_ORIGINS =
      'https://hanbisushi.vn, https://admin.hanbisushi.vn';

    expect(isOriginAllowed('https://hanbisushi.vn')).toBe(true);
    expect(isOriginAllowed('https://admin.hanbisushi.vn')).toBe(true);
    expect(isOriginAllowed('http://localhost:3000')).toBe(false);
    expect(isOriginAllowed('http://127.0.0.1:3000')).toBe(false);
    expect(isOriginAllowed('http://192.168.1.10:3000')).toBe(false);
    expect(isOriginAllowed('http://10.0.0.5:8080')).toBe(false);
    expect(isOriginAllowed('http://172.16.0.2:3000')).toBe(false);
  });

  it('should allow non-browser requests where origin is undefined', () => {
    expect(isOriginAllowed(undefined)).toBe(true);
  });

  it('should reject domain spoofing containing localhost or IP substrings', () => {
    expect(isOriginAllowed('https://localhost.attacker.com')).toBe(false);
    expect(isOriginAllowed('https://attacker-127.0.0.1.com')).toBe(false);
    expect(isOriginAllowed('https://192.168.1.1.malicious.io')).toBe(false);
    expect(isOriginAllowed('https://random-public-site.com')).toBe(false);
  });
});
