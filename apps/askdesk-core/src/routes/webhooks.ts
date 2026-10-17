import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { StripeService } from '../services/stripe.service.js';
import { WebhookEventModel } from '../models/webhook-event.model.js';
import { OrganizationModel } from '../models/organization.model.js';
import { AuditService } from '../services/audit.service.js';

export const webhookRoutes: FastifyPluginAsync = async (
  fastify: FastifyInstance
): Promise<void> => {
  fastify.post(
    '/webhooks/stripe',
    {
      config: {
        // Stripe webhook signature requires raw payload
        rawBody: true
      }
    },
    async (request, reply) => {
      const signature = request.headers['stripe-signature'] as string | undefined;
      if (!signature) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'Missing Stripe signature header'
        });
      }

      let event;
      try {
        const rawPayload =
          typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
        event = StripeService.constructWebhookEvent(rawPayload, signature);
      } catch (err) {
        request.log.error(err, 'Stripe webhook signature verification failed');
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'Invalid webhook signature'
        });
      }

      // 1. Idempotency Check (Day 10 requirement: test duplicate webhook delivery)
      const alreadyProcessed = await WebhookEventModel.findOne({ eventId: event.id });
      if (alreadyProcessed) {
        return reply.code(200).send({
          received: true,
          idempotentDuplicate: true,
          message: 'Event already processed'
        });
      }

      // 2. Process event types
      try {
        switch (event.type) {
          case 'checkout.session.completed': {
            const session = event.data.object as {
              customer?: string;
              metadata?: { organizationId?: string; plan?: 'free' | 'pro' | 'enterprise' };
            };

            const orgId = session.metadata?.organizationId;
            const newPlan = session.metadata?.plan ?? 'pro';

            if (orgId) {
              await OrganizationModel.findByIdAndUpdate(orgId, {
                plan: newPlan,
                ...(session.customer ? { stripeCustomerId: session.customer } : {})
              });

              void AuditService.log({
                organizationId: orgId,
                action: 'billing.checkout_completed',
                targetType: 'Organization',
                targetId: orgId,
                metadata: { plan: newPlan, customerId: session.customer }
              });
            }
            break;
          }

          case 'customer.subscription.deleted': {
            const subscription = event.data.object as { customer?: string };
            if (subscription.customer) {
              const org = await OrganizationModel.findOneAndUpdate(
                { stripeCustomerId: subscription.customer },
                { plan: 'free' }
              );

              if (org) {
                void AuditService.log({
                  organizationId: org._id,
                  action: 'billing.subscription_cancelled',
                  targetType: 'Organization',
                  targetId: org._id.toString(),
                  metadata: { plan: 'free' }
                });
              }
            }
            break;
          }

          default:
            // Handle other events gracefully
            break;
        }

        // 3. Record event in idempotency table
        await WebhookEventModel.create({
          eventId: event.id,
          source: 'stripe'
        });

        return reply.code(200).send({ received: true });
      } catch (err) {
        request.log.error(err, 'Error processing Stripe webhook');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Error processing webhook event'
        });
      }
    }
  );
};
