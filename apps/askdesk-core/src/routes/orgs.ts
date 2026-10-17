import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import crypto from 'node:crypto';
import { Types } from 'mongoose';
import { OrganizationModel } from '../models/organization.model.js';
import { MembershipModel, OrganizationRole } from '../models/membership.model.js';
import { InviteModel } from '../models/invite.model.js';
import { AuditLogModel } from '../models/audit-log.model.js';
import { ApiKeyModel } from '../models/api-key.model.js';
import { authenticate, loadOrgMembership, requireAction } from '../middleware/auth.middleware.js';
import { AuditService } from '../services/audit.service.js';
import { StripeService } from '../services/stripe.service.js';

const createOrgSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Slug must be alphanumeric with hyphens only')
});

const inviteSchema = z.object({
  email: z.string().email().trim().toLowerCase(),
  role: z.enum(['admin', 'member']).default('member')
});

export const orgRoutes: FastifyPluginAsync = async (fastify: FastifyInstance): Promise<void> => {
  // All org routes require authentication
  fastify.addHook('preHandler', authenticate);

  // POST /orgs (Day 5: Create org and make creator the owner)
  fastify.post('/orgs', async (request, reply) => {
    const validation = createOrgSchema.safeParse(request.body);
    if (!validation.success) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'Validation failed',
        details: validation.error.errors
      });
    }

    const { name, slug } = validation.data;
    const userId = request.user.sub;

    const existingSlug = await OrganizationModel.findOne({ slug }).lean();
    if (existingSlug) {
      return reply.code(409).send({
        error: 'Conflict',
        message: 'Organization with this slug already exists'
      });
    }

    const org = new OrganizationModel({ name, slug, plan: 'free' });
    await org.save();

    const membership = new MembershipModel({
      organizationId: org._id,
      userId: new Types.ObjectId(userId),
      role: 'owner'
    });
    await membership.save();

    void AuditService.log({
      actorId: userId,
      organizationId: org._id,
      action: 'org.create',
      targetType: 'Organization',
      targetId: org._id.toString(),
      metadata: { name, slug },
      ip: request.ip
    });

    return reply.code(201).send({
      organization: {
        id: org._id.toString(),
        name: org.name,
        slug: org.slug,
        plan: org.plan,
        createdAt: org.createdAt.toISOString()
      },
      role: 'owner'
    });
  });

  // GET /orgs (List user organizations)
  fastify.get('/orgs', async (request, reply) => {
    const userId = request.user.sub;
    const memberships = await MembershipModel.find({
      userId: new Types.ObjectId(userId)
    }).populate('organizationId');

    const orgs = memberships.map((m) => {
      const org = m.organizationId as unknown as {
        _id: Types.ObjectId;
        name: string;
        slug: string;
        plan: string;
        createdAt: Date;
      };
      return {
        id: org._id.toString(),
        name: org.name,
        slug: org.slug,
        plan: org.plan,
        role: m.role,
        createdAt: org.createdAt.toISOString()
      };
    });

    return reply.code(200).send({ organizations: orgs });
  });

  // POST /orgs/:orgId/invites/accept (Day 7: Accept invite - does not require existing membership)
  fastify.post('/orgs/:orgId/invites/accept', async (request, reply) => {
    const { orgId } = request.params as { orgId: string };
    const { token } = (request.body as { token?: string }) ?? {};

    if (!token) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'Invitation token is required'
      });
    }

    if (!Types.ObjectId.isValid(orgId)) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'Invalid organization ID'
      });
    }

    const org = await OrganizationModel.findById(orgId);
    if (!org) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Organization not found'
      });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const invite = await InviteModel.findOne({
      tokenHash,
      organizationId: org._id,
      status: 'pending'
    });

    if (!invite || invite.expiresAt < new Date()) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'Invalid or expired invitation token'
      });
    }

    const userId = new Types.ObjectId(request.user.sub);

    let membership = await MembershipModel.findOne({
      organizationId: invite.organizationId,
      userId
    });

    if (!membership) {
      membership = new MembershipModel({
        organizationId: invite.organizationId,
        userId,
        role: invite.role
      });
    } else {
      membership.role = invite.role;
    }

    await membership.save();

    invite.status = 'accepted';
    await invite.save();

    void AuditService.log({
      actorId: request.user.sub,
      organizationId: invite.organizationId,
      action: 'member.join',
      targetType: 'Membership',
      targetId: membership._id.toString(),
      metadata: { role: invite.role },
      ip: request.ip
    });

    return reply.code(200).send({
      message: 'Successfully joined organization',
      membership: {
        id: membership._id.toString(),
        role: membership.role
      }
    });
  });

  // Tenant-scoped routes with /orgs/:orgId
  fastify.register(async (orgScope) => {
    orgScope.addHook('preHandler', loadOrgMembership);

    // GET /orgs/:orgId
    orgScope.get('/orgs/:orgId', async (request, reply) => {
      const org = request.organization!;
      return reply.code(200).send({
        id: org._id.toString(),
        name: org.name,
        slug: org.slug,
        plan: org.plan,
        role: request.membership!.role,
        createdAt: org.createdAt.toISOString()
      });
    });

    // POST /orgs/:orgId/invites (Day 6: Create invite with single-use hashed token)
    orgScope.post(
      '/orgs/:orgId/invites',
      { preHandler: [requireAction('member:invite')] },
      async (request, reply) => {
        const validation = inviteSchema.safeParse(request.body);
        if (!validation.success) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: 'Validation failed',
            details: validation.error.errors
          });
        }

        const { email, role } = validation.data;
        const org = request.organization!;

        // Check if already a member
        const existingMember = await MembershipModel.findOne({
          organizationId: org._id
        }).populate({
          path: 'userId',
          match: { email }
        });

        if (existingMember && existingMember.userId) {
          return reply.code(409).send({
            error: 'Conflict',
            message: 'User is already a member of this organization'
          });
        }

        const rawToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

        const invite = new InviteModel({
          organizationId: org._id,
          email,
          role,
          tokenHash,
          invitedBy: new Types.ObjectId(request.user.sub),
          expiresAt
        });

        await invite.save();

        void AuditService.log({
          actorId: request.user.sub,
          organizationId: org._id,
          action: 'member.invite',
          targetType: 'Invite',
          targetId: invite._id.toString(),
          metadata: { email, role },
          ip: request.ip
        });

        // In development / test, return invite token directly for automated tests and console stub
        return reply.code(201).send({
          message: `Invitation generated for ${email}`,
          invite: {
            id: invite._id.toString(),
            email: invite.email,
            role: invite.role,
            expiresAt: invite.expiresAt.toISOString(),
            inviteToken: rawToken // Raw token returned once
          }
        });
      }
    );

    // (accept invite route moved outside orgScope)

    // GET /orgs/:orgId/members (Day 7: List members)
    orgScope.get(
      '/orgs/:orgId/members',
      { preHandler: [requireAction('member:read')] },
      async (request, reply) => {
        const members = await MembershipModel.find({
          organizationId: request.organization!._id
        }).populate<{ userId: { _id: Types.ObjectId; email: string; name?: string } }>('userId');

        const memberList = members.map((m) => ({
          id: m._id.toString(),
          userId: m.userId?._id ? m.userId._id.toString() : null,
          email: m.userId?.email ?? 'unknown',
          name: m.userId?.name ?? null,
          role: m.role,
          joinedAt: m.createdAt.toISOString()
        }));

        return reply.code(200).send({ members: memberList });
      }
    );

    // PATCH /orgs/:orgId/members/:memberId (Day 7: Change role with safety rules)
    orgScope.patch(
      '/orgs/:orgId/members/:memberId',
      { preHandler: [requireAction('member:role_change')] },
      async (request, reply) => {
        const { memberId } = request.params as { memberId: string };
        const { role: newRole } = (request.body as { role?: OrganizationRole }) ?? {};

        if (!newRole || !['owner', 'admin', 'member'].includes(newRole)) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: 'Invalid role provided'
          });
        }

        const targetMember = await MembershipModel.findOne({
          _id: new Types.ObjectId(memberId),
          organizationId: request.organization!._id
        });

        if (!targetMember) {
          return reply.code(404).send({
            error: 'Not Found',
            message: 'Member not found'
          });
        }

        const callerRole = request.membership!.role;

        // RULE: Admins cannot modify owners or promote anyone to owner
        if (callerRole === 'admin') {
          if (targetMember.role === 'owner' || newRole === 'owner') {
            return reply.code(403).send({
              error: 'Forbidden',
              message: 'Admins cannot modify owner roles or promote to owner'
            });
          }
        }

        // RULE: The last owner cannot be demoted
        if (targetMember.role === 'owner' && newRole !== 'owner') {
          const ownerCount = await MembershipModel.countDocuments({
            organizationId: request.organization!._id,
            role: 'owner'
          });

          if (ownerCount <= 1) {
            return reply.code(400).send({
              error: 'Bad Request',
              message: 'Cannot demote the last owner of the organization'
            });
          }
        }

        const previousRole = targetMember.role;
        targetMember.role = newRole;
        await targetMember.save();

        void AuditService.log({
          actorId: request.user.sub,
          organizationId: request.organization!._id,
          action: 'member.role_change',
          targetType: 'Membership',
          targetId: targetMember._id.toString(),
          metadata: { previousRole, newRole },
          ip: request.ip
        });

        return reply.code(200).send({
          message: 'Member role updated successfully',
          member: {
            id: targetMember._id.toString(),
            role: targetMember.role
          }
        });
      }
    );

    // DELETE /orgs/:orgId/members/:memberId (Day 7: Remove member with safety rules)
    orgScope.delete(
      '/orgs/:orgId/members/:memberId',
      { preHandler: [requireAction('member:remove')] },
      async (request, reply) => {
        const { memberId } = request.params as { memberId: string };
        const targetMember = await MembershipModel.findOne({
          _id: new Types.ObjectId(memberId),
          organizationId: request.organization!._id
        });

        if (!targetMember) {
          return reply.code(404).send({
            error: 'Not Found',
            message: 'Member not found'
          });
        }

        const callerRole = request.membership!.role;

        // RULE: Admins cannot remove owners
        if (callerRole === 'admin' && targetMember.role === 'owner') {
          return reply.code(403).send({
            error: 'Forbidden',
            message: 'Admins cannot remove organization owners'
          });
        }

        // RULE: The last owner cannot be removed
        if (targetMember.role === 'owner') {
          const ownerCount = await MembershipModel.countDocuments({
            organizationId: request.organization!._id,
            role: 'owner'
          });

          if (ownerCount <= 1) {
            return reply.code(400).send({
              error: 'Bad Request',
              message: 'Cannot remove the last owner of the organization'
            });
          }
        }

        await MembershipModel.findByIdAndDelete(targetMember._id);

        void AuditService.log({
          actorId: request.user.sub,
          organizationId: request.organization!._id,
          action: 'member.remove',
          targetType: 'Membership',
          targetId: targetMember._id.toString(),
          metadata: { removedRole: targetMember.role },
          ip: request.ip
        });

        return reply.code(200).send({
          message: 'Member removed successfully'
        });
      }
    );

    // GET /orgs/:orgId/audit (Day 8: Audit log query with filters and pagination)
    orgScope.get(
      '/orgs/:orgId/audit',
      { preHandler: [requireAction('audit:read')] },
      async (request, reply) => {
        const query = request.query as {
          page?: string;
          limit?: string;
          action?: string;
          actorId?: string;
        };

        const page = Math.max(1, parseInt(query.page ?? '1', 10));
        const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? '20', 10)));
        const skip = (page - 1) * limit;

        const filter: Record<string, unknown> = {
          organizationId: request.organization!._id
        };

        if (query.action) {
          filter.action = query.action;
        }

        if (query.actorId && Types.ObjectId.isValid(query.actorId)) {
          filter.actorId = new Types.ObjectId(query.actorId);
        }

        const [logs, total] = await Promise.all([
          AuditLogModel.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate<{ actorId: { _id: Types.ObjectId; email: string } }>('actorId'),
          AuditLogModel.countDocuments(filter)
        ]);

        return reply.code(200).send({
          logs: logs.map((l) => ({
            id: l._id.toString(),
            action: l.action,
            actor: l.actorId ? { id: l.actorId._id.toString(), email: l.actorId.email } : null,
            targetType: l.targetType,
            targetId: l.targetId,
            metadata: l.metadata,
            ip: l.ip,
            createdAt: l.createdAt.toISOString()
          })),
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
          }
        });
      }
    );

    // POST /orgs/:orgId/billing/checkout (Day 9: Stripe Checkout session)
    orgScope.post(
      '/orgs/:orgId/billing/checkout',
      { preHandler: [requireAction('billing:manage')] },
      async (request, reply) => {
        const { plan, returnUrl } =
          (request.body as { plan?: 'pro' | 'enterprise'; returnUrl?: string }) ?? {};

        if (!plan || !['pro', 'enterprise'].includes(plan)) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: 'Invalid plan selected. Choose pro or enterprise'
          });
        }

        const org = request.organization!;
        const session = await StripeService.createCheckoutSession({
          organizationId: org._id.toString(),
          organizationName: org.name,
          plan,
          stripeCustomerId: org.stripeCustomerId ?? null,
          successUrl: returnUrl
            ? `${returnUrl}?session_id={CHECKOUT_SESSION_ID}`
            : 'http://localhost:3000/billing?success=true',
          cancelUrl: returnUrl
            ? `${returnUrl}?cancelled=true`
            : 'http://localhost:3000/billing?cancelled=true'
        });

        // Store customer ID on organization if newly created
        if (!org.stripeCustomerId && session.customerId) {
          org.stripeCustomerId = session.customerId;
          await org.save();
        }

        return reply.code(200).send({
          checkoutUrl: session.url,
          sessionId: session.sessionId
        });
      }
    );

    // POST /orgs/:orgId/billing/portal (Day 9: Stripe Customer Portal session)
    orgScope.post(
      '/orgs/:orgId/billing/portal',
      { preHandler: [requireAction('billing:manage')] },
      async (request, reply) => {
        const org = request.organization!;
        if (!org.stripeCustomerId) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: 'No active Stripe billing customer associated with this organization'
          });
        }

        const { returnUrl } = (request.body as { returnUrl?: string }) ?? {};
        const portal = await StripeService.createPortalSession({
          customerId: org.stripeCustomerId,
          returnUrl: returnUrl ?? 'http://localhost:3000/billing'
        });

        return reply.code(200).send({
          portalUrl: portal.url
        });
      }
    );

    // POST /orgs/:orgId/api-keys (Day 10: Create API key, reveal once, hash and prefix store)
    orgScope.post(
      '/orgs/:orgId/api-keys',
      { preHandler: [requireAction('api_key:create')] },
      async (request, reply) => {
        const { name } = (request.body as { name?: string }) ?? {};
        if (!name || name.trim().length === 0) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: 'API Key name is required'
          });
        }

        const randomSecret = crypto.randomBytes(24).toString('hex');
        const prefix = `ak_live_${randomSecret.slice(0, 8)}`;
        const rawApiKey = `${prefix}_${randomSecret}`;
        const keyHash = crypto.createHash('sha256').update(rawApiKey).digest('hex');

        const apiKey = new ApiKeyModel({
          organizationId: request.organization!._id,
          name: name.trim(),
          keyPrefix: prefix,
          keyHash,
          createdBy: new Types.ObjectId(request.user.sub),
          isRevoked: false
        });

        await apiKey.save();

        void AuditService.log({
          actorId: request.user.sub,
          organizationId: request.organization!._id,
          action: 'api_key.create',
          targetType: 'ApiKey',
          targetId: apiKey._id.toString(),
          metadata: { name: apiKey.name, prefix },
          ip: request.ip
        });

        // RETURN FULL RAW KEY ONLY ONCE
        return reply.code(201).send({
          message: 'API key created. Save this secret now; it will not be displayed again.',
          apiKey: {
            id: apiKey._id.toString(),
            name: apiKey.name,
            keyPrefix: apiKey.keyPrefix,
            secret: rawApiKey, // ONLY REVEALED ONCE
            createdAt: apiKey.createdAt.toISOString()
          }
        });
      }
    );

    // GET /orgs/:orgId/api-keys (Day 10: List masked API keys)
    orgScope.get(
      '/orgs/:orgId/api-keys',
      { preHandler: [requireAction('api_key:read')] },
      async (request, reply) => {
        const keys = await ApiKeyModel.find({
          organizationId: request.organization!._id
        }).sort({ createdAt: -1 });

        return reply.code(200).send({
          apiKeys: keys.map((k) => ({
            id: k._id.toString(),
            name: k.name,
            keyPrefix: k.keyPrefix,
            isRevoked: k.isRevoked,
            lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
            createdAt: k.createdAt.toISOString()
          }))
        });
      }
    );

    // DELETE /orgs/:orgId/api-keys/:keyId (Day 10: Revoke API key)
    orgScope.delete(
      '/orgs/:orgId/api-keys/:keyId',
      { preHandler: [requireAction('api_key:revoke')] },
      async (request, reply) => {
        const { keyId } = request.params as { keyId: string };
        const key = await ApiKeyModel.findOne({
          _id: new Types.ObjectId(keyId),
          organizationId: request.organization!._id
        });

        if (!key) {
          return reply.code(404).send({
            error: 'Not Found',
            message: 'API key not found'
          });
        }

        key.isRevoked = true;
        await key.save();

        void AuditService.log({
          actorId: request.user.sub,
          organizationId: request.organization!._id,
          action: 'api_key.revoke',
          targetType: 'ApiKey',
          targetId: key._id.toString(),
          metadata: { name: key.name },
          ip: request.ip
        });

        return reply.code(200).send({
          message: 'API key revoked successfully'
        });
      }
    );
  });
};
