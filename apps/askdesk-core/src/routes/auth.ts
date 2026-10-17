import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { registerSchema } from '../schemas/auth.schema.js';
import { UserModel } from '../models/user.model.js';
import { PasswordService } from '../services/password.service.js';

export const authRoutes: FastifyPluginAsync = async (fastify: FastifyInstance): Promise<void> => {
  fastify.post('/auth/register', async (request, reply) => {
    // 1. Zod Validation
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

    // 2. Check for existing user (fast-fail before hashing)
    const existingUser = await UserModel.findOne({ email }).lean();
    if (existingUser) {
      return reply.code(409).send({
        error: 'Conflict',
        message: 'An account with this email address already exists'
      });
    }

    // 3. Hash password using Argon2id
    const passwordHash = await PasswordService.hash(password);

    // 4. Persist to MongoDB
    try {
      const user = new UserModel({
        email,
        passwordHash,
        name: name ?? null
      });

      await user.save();

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
      // Handle race condition duplicate key error from Mongo (E11000)
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
};
