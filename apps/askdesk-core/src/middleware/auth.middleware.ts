import { FastifyRequest, FastifyReply } from 'fastify';
import { Types } from 'mongoose';
import { OrganizationModel } from '../models/organization.model.js';
import { MembershipModel } from '../models/membership.model.js';
import { Action, can } from '../rbac/permissions.js';

export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    return reply.code(401).send({
      error: 'Unauthorized',
      message: 'Invalid or expired access token'
    });
  }
}

export async function loadOrgMembership(
  request: FastifyRequest<{ Params: { orgId?: string } }>,
  reply: FastifyReply
): Promise<void> {
  const orgId = request.params.orgId ?? (request.headers['x-org-id'] as string | undefined);

  if (!orgId || !Types.ObjectId.isValid(orgId)) {
    return reply.code(400).send({
      error: 'Bad Request',
      message: 'Invalid or missing organization ID'
    });
  }

  const userId = request.user?.sub;
  if (!userId) {
    return reply.code(401).send({
      error: 'Unauthorized',
      message: 'Authentication required'
    });
  }

  const [org, membership] = await Promise.all([
    OrganizationModel.findById(orgId),
    MembershipModel.findOne({
      organizationId: new Types.ObjectId(orgId),
      userId: new Types.ObjectId(userId)
    })
  ]);

  if (!org) {
    return reply.code(404).send({
      error: 'Not Found',
      message: 'Organization not found'
    });
  }

  if (!membership) {
    return reply.code(403).send({
      error: 'Forbidden',
      message: 'You are not a member of this organization'
    });
  }

  request.organization = org;
  request.membership = membership;
}

export function requireAction(action: Action) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.membership) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: 'Organization membership context required'
      });
    }

    if (!can(request.membership.role, action)) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: `Action '${action}' not permitted for role '${request.membership.role}'`
      });
    }
  };
}
