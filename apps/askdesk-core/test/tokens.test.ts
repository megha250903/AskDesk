import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { connectDb, disconnectDb } from '../src/db/connection.js';
import { UserModel } from '../src/models/user.model.js';
import { RefreshTokenModel } from '../src/models/refresh-token.model.js';

const TEST_DB_URI = 'mongodb://127.0.0.1:27017/askdesk_core_test';

describe('Auth Sessions, JWT & Refresh Rotation (Days 3 & 4)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    await connectDb(TEST_DB_URI);
    app = buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await UserModel.deleteMany({});
    await RefreshTokenModel.deleteMany({});
    await disconnectDb();
    await app.close();
  });

  beforeEach(async () => {
    await UserModel.deleteMany({});
    await RefreshTokenModel.deleteMany({});
  });

  it('POST /auth/login issues 15m access token and httpOnly secure refresh cookie', async () => {
    // 1. Register user
    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'carol@example.com',
        password: 'ValidP@ssword2026!',
        name: 'Carol'
      }
    });

    // 2. Login
    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'carol@example.com',
        password: 'ValidP@ssword2026!'
      }
    });

    expect(loginRes.statusCode).toBe(200);
    const body = JSON.parse(loginRes.payload);
    expect(body.accessToken).toBeDefined();
    expect(body.user.email).toBe('carol@example.com');

    // Verify cookie
    const cookies = loginRes.cookies;
    const refreshCookie = cookies.find((c) => c.name === 'refreshToken');
    expect(refreshCookie).toBeDefined();
    expect(refreshCookie?.httpOnly).toBe(true);
    expect(refreshCookie?.path).toBe('/auth');

    // Verify token stored in DB as hash (never plain text)
    const tokenInDb = await RefreshTokenModel.findOne();
    expect(tokenInDb).not.toBeNull();
    expect(tokenInDb?.tokenHash).toBeDefined();
    expect(tokenInDb?.tokenHash).not.toBe(refreshCookie?.value);
  });

  it('POST /auth/login rejects invalid credentials', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'nonexistent@example.com',
        password: 'RandomPassword123!'
      }
    });

    expect(res.statusCode).toBe(401);
  });

  it('POST /auth/refresh rotates token on every use', async () => {
    // Register & Login
    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'dave@example.com', password: 'ValidP@ssword2026!' }
    });

    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'dave@example.com', password: 'ValidP@ssword2026!' }
    });

    const initialCookie = loginRes.cookies.find((c) => c.name === 'refreshToken')!.value;

    // Refresh token
    const refreshRes = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      cookies: { refreshToken: initialCookie }
    });

    expect(refreshRes.statusCode).toBe(200);
    const refreshBody = JSON.parse(refreshRes.payload);
    expect(refreshBody.accessToken).toBeDefined();

    const newCookie = refreshRes.cookies.find((c) => c.name === 'refreshToken')!.value;
    expect(newCookie).not.toBe(initialCookie); // Single-use rotated!
  });

  it('simulates a stolen, reused refresh token and revokes the whole token family', async () => {
    // Register & Login
    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'eve@example.com', password: 'ValidP@ssword2026!' }
    });

    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'eve@example.com', password: 'ValidP@ssword2026!' }
    });

    const stolenToken = loginRes.cookies.find((c) => c.name === 'refreshToken')!.value;

    // Legitimate user refreshes token
    const legitimateRefresh = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      cookies: { refreshToken: stolenToken }
    });
    expect(legitimateRefresh.statusCode).toBe(200);
    const legitimateNextToken = legitimateRefresh.cookies.find(
      (c) => c.name === 'refreshToken'
    )!.value;

    // Attacker tries to use the previously used (now revoked) stolenToken!
    const attackerRefresh = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      cookies: { refreshToken: stolenToken }
    });

    expect(attackerRefresh.statusCode).toBe(401);
    const attackerBody = JSON.parse(attackerRefresh.payload);
    expect(attackerBody.message).toContain('Refresh token reuse detected');

    // Confirm that the legitimate user's newest token is ALSO revoked because the family was compromised
    const legitimateRetry = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      cookies: { refreshToken: legitimateNextToken }
    });
    expect(legitimateRetry.statusCode).toBe(401);
  });

  it('POST /auth/logout revokes session and clears cookie', async () => {
    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'frank@example.com', password: 'ValidP@ssword2026!' }
    });

    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'frank@example.com', password: 'ValidP@ssword2026!' }
    });

    const cookie = loginRes.cookies.find((c) => c.name === 'refreshToken')!.value;

    const logoutRes = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      cookies: { refreshToken: cookie }
    });

    expect(logoutRes.statusCode).toBe(200);

    // Refresh attempt should now fail
    const refreshRes = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      cookies: { refreshToken: cookie }
    });
    expect(refreshRes.statusCode).toBe(401);
  });
});
