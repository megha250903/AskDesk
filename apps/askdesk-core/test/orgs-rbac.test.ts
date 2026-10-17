import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { connectDb, disconnectDb } from '../src/db/connection.js';
import { UserModel } from '../src/models/user.model.js';
import { OrganizationModel } from '../src/models/organization.model.js';
import { MembershipModel, OrganizationRole } from '../src/models/membership.model.js';
import { InviteModel } from '../src/models/invite.model.js';
import { can, Action, PERMISSION_MATRIX } from '../src/rbac/permissions.js';

const TEST_DB_URI = 'mongodb://127.0.0.1:27017/askdesk_core_test';

describe('Organizations, RBAC & Team Management (Days 5, 6, 7)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    await connectDb(TEST_DB_URI);
    app = buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await UserModel.deleteMany({});
    await OrganizationModel.deleteMany({});
    await MembershipModel.deleteMany({});
    await InviteModel.deleteMany({});
    await disconnectDb();
    await app.close();
  });

  beforeEach(async () => {
    await UserModel.deleteMany({});
    await OrganizationModel.deleteMany({});
    await MembershipModel.deleteMany({});
    await InviteModel.deleteMany({});
  });

  // TABLE-DRIVEN RBAC TESTS (Day 6 Requirement)
  describe('RBAC Permission Matrix (Table-Driven)', () => {
    const roles: OrganizationRole[] = ['owner', 'admin', 'member'];
    const actions = Object.keys(PERMISSION_MATRIX) as Action[];

    actions.forEach((action) => {
      roles.forEach((role) => {
        const expected = PERMISSION_MATRIX[action].includes(role);
        it(`evaluates can('${role}', '${action}') => ${expected}`, () => {
          expect(can(role, action)).toBe(expected);
        });
      });
    });
  });

  it('POST /orgs creates organization and assigns creator as owner', async () => {
    // 1. Create user and login
    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'founder@acme.com', password: 'ValidP@ssword2026!' }
    });

    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'founder@acme.com', password: 'ValidP@ssword2026!' }
    });
    const { accessToken } = JSON.parse(loginRes.payload);

    // 2. Create organization
    const orgRes = await app.inject({
      method: 'POST',
      url: '/orgs',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name: 'Acme Corp', slug: 'acme-corp' }
    });

    expect(orgRes.statusCode).toBe(201);
    const orgBody = JSON.parse(orgRes.payload);
    expect(orgBody.organization.slug).toBe('acme-corp');
    expect(orgBody.role).toBe('owner');

    // Confirm Membership in database
    const membership = await MembershipModel.findOne({
      organizationId: orgBody.organization.id
    });
    expect(membership).not.toBeNull();
    expect(membership?.role).toBe('owner');
  });

  it('middleware blocks non-members from accessing /orgs/:orgId', async () => {
    // User A creates org
    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'usera@example.com', password: 'ValidP@ssword2026!' }
    });
    const loginA = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'usera@example.com', password: 'ValidP@ssword2026!' }
    });
    const tokenA = JSON.parse(loginA.payload).accessToken;

    const slugA = `tenant-a-${Math.random().toString(36).substring(2, 7)}`;
    const orgRes = await app.inject({
      method: 'POST',
      url: '/orgs',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { name: 'Tenant A', slug: slugA }
    });
    const orgId = JSON.parse(orgRes.payload).organization.id;

    // User B attempts to access User A's organization
    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'userb@example.com', password: 'ValidP@ssword2026!' }
    });
    const loginB = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'userb@example.com', password: 'ValidP@ssword2026!' }
    });
    const tokenB = JSON.parse(loginB.payload).accessToken;

    const forbiddenRes = await app.inject({
      method: 'GET',
      url: `/orgs/${orgId}`,
      headers: { authorization: `Bearer ${tokenB}` }
    });

    expect(forbiddenRes.statusCode).toBe(403);
    expect(JSON.parse(forbiddenRes.payload).message).toContain('not a member');
  });

  it('handles team lifecycle: invite, accept, change role, and enforces owner safety rules', async () => {
    // 1. Owner registers and creates org
    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'ceo@startup.io', password: 'ValidP@ssword2026!' }
    });
    const ceoLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'ceo@startup.io', password: 'ValidP@ssword2026!' }
    });
    const ceoToken = JSON.parse(ceoLogin.payload).accessToken;

    const orgRes = await app.inject({
      method: 'POST',
      url: '/orgs',
      headers: { authorization: `Bearer ${ceoToken}` },
      payload: { name: 'Startup IO', slug: 'startup-io' }
    });
    const orgId = JSON.parse(orgRes.payload).organization.id;

    // 2. Owner invites a member
    const inviteRes = await app.inject({
      method: 'POST',
      url: `/orgs/${orgId}/invites`,
      headers: { authorization: `Bearer ${ceoToken}` },
      payload: { email: 'developer@startup.io', role: 'member' }
    });
    expect(inviteRes.statusCode).toBe(201);
    const { inviteToken } = JSON.parse(inviteRes.payload).invite;

    // 3. Developer registers and accepts invite
    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'developer@startup.io', password: 'ValidP@ssword2026!' }
    });
    const devLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'developer@startup.io', password: 'ValidP@ssword2026!' }
    });
    const devToken = JSON.parse(devLogin.payload).accessToken;

    const acceptRes = await app.inject({
      method: 'POST',
      url: `/orgs/${orgId}/invites/accept`,
      headers: { authorization: `Bearer ${devToken}` },
      payload: { token: inviteToken }
    });
    expect(acceptRes.statusCode).toBe(200);

    // 4. List members
    const membersRes = await app.inject({
      method: 'GET',
      url: `/orgs/${orgId}/members`,
      headers: { authorization: `Bearer ${ceoToken}` }
    });
    expect(membersRes.statusCode).toBe(200);
    const { members } = JSON.parse(membersRes.payload);
    expect(members).toHaveLength(2);

    const devMemberId = members.find(
      (m: { email: string }) => m.email === 'developer@startup.io'
    ).id;
    const ceoMemberId = members.find((m: { email: string }) => m.email === 'ceo@startup.io').id;

    // 5. Promote developer to admin
    const promoteRes = await app.inject({
      method: 'PATCH',
      url: `/orgs/${orgId}/members/${devMemberId}`,
      headers: { authorization: `Bearer ${ceoToken}` },
      payload: { role: 'admin' }
    });
    expect(promoteRes.statusCode).toBe(200);

    // 6. SAFETY RULE: Admin cannot demote owner
    const adminTriesDemoteOwner = await app.inject({
      method: 'PATCH',
      url: `/orgs/${orgId}/members/${ceoMemberId}`,
      headers: { authorization: `Bearer ${devToken}` },
      payload: { role: 'member' }
    });
    expect(adminTriesDemoteOwner.statusCode).toBe(403);

    // 7. SAFETY RULE: Last owner cannot be demoted or removed by anyone
    const ownerTriesDemotingSelf = await app.inject({
      method: 'PATCH',
      url: `/orgs/${orgId}/members/${ceoMemberId}`,
      headers: { authorization: `Bearer ${ceoToken}` },
      payload: { role: 'member' }
    });
    expect(ownerTriesDemotingSelf.statusCode).toBe(400);
    expect(JSON.parse(ownerTriesDemotingSelf.payload).message).toContain(
      'Cannot demote the last owner'
    );

    const ownerTriesRemovingSelf = await app.inject({
      method: 'DELETE',
      url: `/orgs/${orgId}/members/${ceoMemberId}`,
      headers: { authorization: `Bearer ${ceoToken}` }
    });
    expect(ownerTriesRemovingSelf.statusCode).toBe(400);
    expect(JSON.parse(ownerTriesRemovingSelf.payload).message).toContain(
      'Cannot remove the last owner'
    );
  });
});
