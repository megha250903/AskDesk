import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { connectDb, disconnectDb } from '../src/db/connection.js';
import { UserModel } from '../src/models/user.model.js';
import { PasswordService } from '../src/services/password.service.js';

const TEST_DB_URI = 'mongodb://127.0.0.1:27017/askdesk_core_test';

describe('POST /auth/register', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    await connectDb(TEST_DB_URI);
    app = buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await UserModel.deleteMany({});
    await disconnectDb();
    await app.close();
  });

  beforeEach(async () => {
    await UserModel.deleteMany({});
  });

  it('successfully registers a new user with strong password and returns safe user data', async () => {
    const payload = {
      email: 'Alice.Smith@example.com',
      password: 'SecureP@ssw0rd!2026',
      name: 'Alice Smith'
    };

    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.payload);

    expect(body.message).toBe('User registered successfully');
    expect(body.user).toBeDefined();
    expect(body.user.email).toBe('alice.smith@example.com'); // lowercased
    expect(body.user.name).toBe('Alice Smith');
    expect(body.user.id).toBeDefined();
    expect(typeof body.user.createdAt).toBe('string');

    // CRITICAL SECURITY ASSERTION: password or passwordHash must NEVER be returned
    expect(body.user.password).toBeUndefined();
    expect(body.user.passwordHash).toBeUndefined();
    expect(response.payload).not.toContain('passwordHash');

    // Verify stored user in database has valid Argon2 hash
    const savedUser = await UserModel.findOne({ email: 'alice.smith@example.com' }).select(
      '+passwordHash'
    );
    expect(savedUser).not.toBeNull();
    expect(savedUser?.passwordHash).toMatch(/^\$argon2id\$/);

    // Verify argon2 verification passes with original password
    const isMatch = await PasswordService.verify(payload.password, savedUser!.passwordHash);
    expect(isMatch).toBe(true);
  });

  it('rejects registration when email is already registered (case-insensitive duplicate)', async () => {
    // Seed initial user
    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'bob@example.com',
        password: 'ValidP@ssword123',
        name: 'Bob'
      }
    });

    // Attempt registration with same email (uppercase variation)
    const duplicateResponse = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'BOB@EXAMPLE.COM',
        password: 'AnotherP@ssword456',
        name: 'Bob Impersonator'
      }
    });

    expect(duplicateResponse.statusCode).toBe(409);
    const body = JSON.parse(duplicateResponse.payload);
    expect(body.error).toBe('Conflict');
    expect(body.message).toBe('An account with this email address already exists');

    // Confirm only 1 user exists in DB
    const userCount = await UserModel.countDocuments({ email: 'bob@example.com' });
    expect(userCount).toBe(1);
  });

  it('rejects weak password with descriptive validation errors', async () => {
    // Too short (< 8 chars)
    const shortRes = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'test@example.com',
        password: 'Sh0rt!'
      }
    });
    expect(shortRes.statusCode).toBe(400);
    const shortBody = JSON.parse(shortRes.payload);
    expect(shortBody.message).toBe('Validation failed');
    expect(
      shortBody.details.some((d: { message: string }) =>
        d.message.includes('at least 8 characters')
      )
    ).toBe(true);

    // Missing uppercase
    const noUpperRes = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'test@example.com',
        password: 'lowercase_only1!'
      }
    });
    expect(noUpperRes.statusCode).toBe(400);
    const noUpperBody = JSON.parse(noUpperRes.payload);
    expect(
      noUpperBody.details.some((d: { message: string }) => d.message.includes('uppercase'))
    ).toBe(true);

    // Missing number
    const noNumberRes = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'test@example.com',
        password: 'NoNumbersInPassword!'
      }
    });
    expect(noNumberRes.statusCode).toBe(400);
    const noNumberBody = JSON.parse(noNumberRes.payload);
    expect(
      noNumberBody.details.some((d: { message: string }) => d.message.includes('number'))
    ).toBe(true);

    // Missing special character
    const noSpecialRes = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'test@example.com',
        password: 'NoSpecialChars123'
      }
    });
    expect(noSpecialRes.statusCode).toBe(400);
    const noSpecialBody = JSON.parse(noSpecialRes.payload);
    expect(
      noSpecialBody.details.some((d: { message: string }) =>
        d.message.includes('special character')
      )
    ).toBe(true);
  });

  it('rejects malformed email address', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'not-an-email',
        password: 'ValidP@ssword123'
      }
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.payload);
    expect(body.details.some((d: { message: string }) => d.message.includes('email'))).toBe(true);
  });
});
