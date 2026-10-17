declare module 'ioredis-mock' {
  import { Redis } from 'ioredis';
  export default class RedisMock extends Redis {}
}

import '@fastify/jwt';

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
