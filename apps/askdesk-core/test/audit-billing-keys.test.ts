import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { connectDb, disconnectDb } from '../src/db/connection.js';
import { UserModel } from '../src/models/user.model.js';
import { OrganizationModel } from '../src/models/organization.model.js';
import { MembershipModel } from '../src/models/membership.model.js';
import { AuditLogModel } from '../src/models/audit-log.model.js';
import { ApiKeyModel } from '../src/models/api-key.model.js';
import { WebhookEventModel } from '../src/models/webhook-event.model.js';

const TEST_DB_URI = 'mongodb://127.0.0.1:27017/askdesk_core_test';

describe('Audit Logs, Stripe Billing & API Keys (Days 8, 9, 10)', () => {
  let app: FastifyInstance;
  let authToken: string;
  let testOrgId: string;

  beforeAll(async () => {
    await connectDb(TEST_DB_URI);
    app = buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await UserModel.deleteMany({});
    await OrganizationModel.deleteMany({});
    await MembershipModel.deleteMany({});
    await AuditLogModel.deleteMany({});
    await ApiKeyModel.deleteMany({});
    await WebhookEventModel.deleteMany({});
    await disconnectDb();
    await app.close();
  });

  beforeEach(async () => {
    await UserModel.deleteMany({});
    await OrganizationModel.deleteMany({});
    await MembershipModel.deleteMany({});
    await AuditLogModel.deleteMany({});
    await ApiKeyModel.deleteMany({});
    await WebhookEventModel.deleteMany({});

    // Setup base owner user and org
    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'operator@askdesk.io', password: 'ValidP@ssword2026!' }
    });

    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'operator@askdesk.io', password: 'ValidP@ssword2026!' }
    });
    authToken = JSON.parse(loginRes.payload).accessToken;

    const slug = `support-ops-${Math.random().toString(36).substring(2, 7)}`;
    const orgRes = await app.inject({
      method: 'POST',
      url: '/orgs',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { name: 'Support Ops', slug }
    });
    testOrgId = JSON.parse(orgRes.payload).organization.id;
  });

  // DAY 8: AUDIT LOGS
  describe('Day 8: Audit Log', () => {
    it('appends audit entries and returns paginated, filtered results for admins', async () => {
      // 1. Audit log was already written for user.register, user.login, and org.create
      const auditRes = await app.inject({
        method: 'GET',
        url: `/orgs/${testOrgId}/audit?limit=10&page=1`,
        headers: { authorization: `Bearer ${authToken}` }
      });

      expect(auditRes.statusCode).toBe(200);
      const body = JSON.parse(auditRes.payload);
      expect(body.logs).toBeDefined();
      expect(body.logs.length).toBeGreaterThan(0);
      expect(body.pagination.total).toBeGreaterThan(0);

      // Verify log schema
      const firstLog = body.logs[0];
      expect(firstLog.action).toBeDefined();
      expect(firstLog.createdAt).toBeDefined();

      // Test filter by action
      const filteredRes = await app.inject({
        method: 'GET',
        url: `/orgs/${testOrgId}/audit?action=org.create`,
        headers: { authorization: `Bearer ${authToken}` }
      });
      const filteredBody = JSON.parse(filteredRes.payload);
      expect(filteredBody.logs.every((l: { action: string }) => l.action === 'org.create')).toBe(
        true
      );
    });
  });

  // DAY 9: STRIPE BILLING CHECKOUT & PORTAL
  describe('Day 9: Stripe Billing', () => {
    it('POST /orgs/:orgId/billing/checkout creates a checkout session and assigns customerId', async () => {
      const checkoutRes = await app.inject({
        method: 'POST',
        url: `/orgs/${testOrgId}/billing/checkout`,
        headers: { authorization: `Bearer ${authToken}` },
        payload: { plan: 'pro', returnUrl: 'http://localhost:3000/billing' }
      });

      expect(checkoutRes.statusCode).toBe(200);
      const body = JSON.parse(checkoutRes.payload);
      expect(body.checkoutUrl).toBeDefined();
      expect(body.sessionId).toBeDefined();

      // Verify stripe customer ID was stored on the organization
      const updatedOrg = await OrganizationModel.findById(testOrgId);
      expect(updatedOrg?.stripeCustomerId).toBeDefined();
    });

    it('POST /orgs/:orgId/billing/portal creates a customer portal session for existing customer', async () => {
      // Set customer ID
      await OrganizationModel.findByIdAndUpdate(testOrgId, { stripeCustomerId: 'cus_test_12345' });

      const portalRes = await app.inject({
        method: 'POST',
        url: `/orgs/${testOrgId}/billing/portal`,
        headers: { authorization: `Bearer ${authToken}` }
      });

      expect(portalRes.statusCode).toBe(200);
      const body = JSON.parse(portalRes.payload);
      expect(body.portalUrl).toContain('billing.stripe.com');
    });
  });

  // DAY 10: STRIPE WEBHOOK IDEMPOTENCY & API KEYS
  describe('Day 10: Webhooks & API Keys', () => {
    it('processes Stripe checkout.session.completed and tests duplicate delivery idempotency', async () => {
      const mockEvent = {
        id: 'evt_test_checkout_completed_123',
        type: 'checkout.session.completed',
        data: {
          object: {
            customer: 'cus_stripe_live_test',
            metadata: {
              organizationId: testOrgId,
              plan: 'pro'
            }
          }
        }
      };

      // 1. Initial delivery
      const firstDelivery = await app.inject({
        method: 'POST',
        url: '/webhooks/stripe',
        headers: { 'stripe-signature': 't=123,v1=test_sig' },
        payload: mockEvent
      });

      expect(firstDelivery.statusCode).toBe(200);
      expect(JSON.parse(firstDelivery.payload).received).toBe(true);

      // Verify organization was upgraded to Pro
      const upgradedOrg = await OrganizationModel.findById(testOrgId);
      expect(upgradedOrg?.plan).toBe('pro');
      expect(upgradedOrg?.stripeCustomerId).toBe('cus_stripe_live_test');

      // 2. DUPLICATE DELIVERY (Day 10 requirement: test duplicate webhook delivery)
      const duplicateDelivery = await app.inject({
        method: 'POST',
        url: '/webhooks/stripe',
        headers: { 'stripe-signature': 't=123,v1=test_sig' },
        payload: mockEvent
      });

      expect(duplicateDelivery.statusCode).toBe(200);
      const duplicateBody = JSON.parse(duplicateDelivery.payload);
      expect(duplicateBody.idempotentDuplicate).toBe(true);
      expect(duplicateBody.message).toContain('already processed');

      // Confirm only 1 webhook event record exists
      const count = await WebhookEventModel.countDocuments({ eventId: mockEvent.id });
      expect(count).toBe(1);
    });

    it('creates API key (reveals secret once), lists masked keys, and allows revoke', async () => {
      // 1. Create API key
      const createRes = await app.inject({
        method: 'POST',
        url: `/orgs/${testOrgId}/api-keys`,
        headers: { authorization: `Bearer ${authToken}` },
        payload: { name: 'Production Chat Gateway' }
      });

      expect(createRes.statusCode).toBe(201);
      const createBody = JSON.parse(createRes.payload);
      expect(createBody.apiKey.secret).toMatch(/^ak_live_/); // Revealed ONCE
      expect(createBody.apiKey.keyPrefix).toBeDefined();

      const createdKeyId = createBody.apiKey.id;

      // Verify in DB that only the hash and prefix are saved, NEVER the raw secret
      const keyInDb = await ApiKeyModel.findById(createdKeyId);
      expect(keyInDb).not.toBeNull();
      expect(keyInDb?.keyHash).toBeDefined();
      expect(keyInDb?.keyHash).not.toBe(createBody.apiKey.secret);

      // 2. List API keys (confirms secret is NOT returned in list)
      const listRes = await app.inject({
        method: 'GET',
        url: `/orgs/${testOrgId}/api-keys`,
        headers: { authorization: `Bearer ${authToken}` }
      });

      expect(listRes.statusCode).toBe(200);
      const listBody = JSON.parse(listRes.payload);
      expect(listBody.apiKeys).toHaveLength(1);
      expect(listBody.apiKeys[0].secret).toBeUndefined(); // Masked!
      expect(listBody.apiKeys[0].isRevoked).toBe(false);

      // 3. Revoke API key
      const revokeRes = await app.inject({
        method: 'DELETE',
        url: `/orgs/${testOrgId}/api-keys/${createdKeyId}`,
        headers: { authorization: `Bearer ${authToken}` }
      });

      expect(revokeRes.statusCode).toBe(200);

      // Confirm key is revoked
      const revokedKey = await ApiKeyModel.findById(createdKeyId);
      expect(revokedKey?.isRevoked).toBe(true);
    });
  });
});
