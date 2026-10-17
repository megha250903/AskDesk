import '@fastify/jwt';
import { IOrganization } from '../models/organization.model.js';
import { IMembership } from '../models/membership.model.js';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      sub: string;
      email: string;
    };
    user: {
      sub: string;
      email: string;
    };
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }

  interface FastifyRequest {
    organization?: IOrganization;
    membership?: IMembership;
  }
}
