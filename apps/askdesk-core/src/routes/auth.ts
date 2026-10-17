import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { registerSchema, loginSchema } from '../schemas/auth.schema.js';
import { UserModel } from '../models/user.model.js';
import { PasswordService } from '../services/password.service.js';
import { TokenService } from '../services/token.service.js';
import { AuditService } from '../services/audit.service.js';

export const authRoutes: FastifyPluginAsync = async (fastify: FastifyInstance): Promise<void> => {
  // POST /auth/register
  fastify.post('/auth/register', async (request, reply) => {
    const validationResult = registerSchema.safeParse(request.body);
    if (!validationResult.success) {
      const formattedErrors = validationResult.error.errors.map((err) => ({
        field: err.path.join('.'),
        message: err.message
      }));

      return reply.code(400).send({
        error: 'Bad Request',
        message: 'Validation failed',
        details: formattedErrors
      });
    }

    const { email, password, name } = validationResult.data;

    const existingUser = await UserModel.findOne({ email }).lean();
    if (existingUser) {
      return reply.code(409).send({
        error: 'Conflict',
        message: 'An account with this email address already exists'
      });
    }

    const passwordHash = await PasswordService.hash(password);

    try {
      const user = new UserModel({
        email,
        passwordHash,
        name: name ?? null
      });

      await user.save();

      void AuditService.log({
        actorId: user._id,
        action: 'user.register',
        targetType: 'User',
        targetId: user._id.toString(),
        metadata: { email: user.email },
        ip: request.ip
      });

      return reply.code(201).send({
        message: 'User registered successfully',
        user: {
          id: user._id.toString(),
          email: user.email,
          name: user.name,
          createdAt: user.createdAt.toISOString()
        }
      });
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: number }).code === 11000
      ) {
        return reply.code(409).send({
          error: 'Conflict',
          message: 'An account with this email address already exists'
        });
      }

      request.log.error(err, 'Failed to create user during registration');
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred while creating your account'
      });
    }
  });

  // POST /auth/login (Day 3: JWT access token + refresh token in httpOnly cookie + rate limiting)
  fastify.post(
    '/auth/login',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '15 minutes'
        }
      }
    },
    async (request, reply) => {
      const validationResult = loginSchema.safeParse(request.body);
      if (!validationResult.success) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'Validation failed',
          details: validationResult.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message
          }))
        });
      }

      const { email, password } = validationResult.data;

      // Select passwordHash explicitly
      const user = await UserModel.findOne({ email }).select('+passwordHash');
      if (!user) {
        return reply.code(401).send({
          error: 'Unauthorized',
          message: 'Invalid email or password'
        });
      }

      const isPasswordValid = await PasswordService.verify(password, user.passwordHash);
      if (!isPasswordValid) {
        return reply.code(401).send({
          error: 'Unauthorized',
          message: 'Invalid email or password'
        });
      }

      // Generate 15-minute JWT access token
      const accessToken = fastify.jwt.sign(
        {
          sub: user._id.toString(),
          email: user.email
        },
        { expiresIn: '15m' }
      );

      // Generate Refresh Token session stored as SHA-256 hash
      const { rawToken } = await TokenService.createSession({
        userId: user._id,
        userAgent: (request.headers['user-agent'] as string) ?? null,
        ip: request.ip
      });

      // Set httpOnly secure cookie
      reply.setCookie('refreshToken', rawToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/auth',
        maxAge: 30 * 24 * 60 * 60 // 30 days
      });

      void AuditService.log({
        actorId: user._id,
        action: 'user.login',
        targetType: 'User',
        targetId: user._id.toString(),
        metadata: { email: user.email },
        ip: request.ip
      });

      return reply.code(200).send({
        accessToken,
        user: {
          id: user._id.toString(),
          email: user.email,
          name: user.name,
          createdAt: user.createdAt.toISOString()
        }
      });
    }
  );

  // POST /auth/refresh (Day 4: Single-use rotation with reuse detection)
  fastify.post('/auth/refresh', async (request, reply) => {
    const rawRefreshToken = request.cookies.refreshToken;
    if (!rawRefreshToken) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Refresh token cookie is missing'
      });
    }

    const rotationResult = await TokenService.rotateToken(rawRefreshToken, {
      userAgent: (request.headers['user-agent'] as string) ?? null,
      ip: request.ip
    });

    if (!rotationResult.success) {
      reply.clearCookie('refreshToken', { path: '/auth' });

      if (rotationResult.reason === 'reuse_detected') {
        return reply.code(401).send({
          error: 'Unauthorized',
          message: 'Refresh token reuse detected. All sessions have been revoked.'
        });
      }

      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Invalid or expired refresh token'
      });
    }

    const user = await UserModel.findById(rotationResult.userId);
    if (!user) {
      reply.clearCookie('refreshToken', { path: '/auth' });
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'User no longer exists'
      });
    }

    // Generate fresh 15-minute access token
    const accessToken = fastify.jwt.sign(
      {
        sub: user._id.toString(),
        email: user.email
      },
      { expiresIn: '15m' }
    );

    // Set rotated refresh cookie
    reply.setCookie('refreshToken', rotationResult.newRawToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/auth',
      maxAge: 30 * 24 * 60 * 60
    });

    return reply.code(200).send({
      accessToken
    });
  });

  // POST /auth/logout (Day 4)
  fastify.post('/auth/logout', async (request, reply) => {
    const rawRefreshToken = request.cookies.refreshToken;
    if (rawRefreshToken) {
      await TokenService.revokeToken(rawRefreshToken);
    }

    reply.clearCookie('refreshToken', { path: '/auth' });
    return reply.code(200).send({
      message: 'Logged out successfully'
    });
  });
};
