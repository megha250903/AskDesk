import Stripe from 'stripe';
import { env } from '../config/env.js';

export const stripeClient = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-02-24.acacia' as Stripe.LatestApiVersion
});

export class StripeService {
  /**
   * Constructs and verifies a Stripe Webhook Event using the raw payload and signature.
   */
  static constructWebhookEvent(payload: string | Buffer, signature: string): Stripe.Event {
    // If running in test environment with mock keys, allow parsing mock events
    if (env.NODE_ENV === 'test' && env.STRIPE_WEBHOOK_SECRET === 'whsec_askdesk_mock_key') {
      try {
        const parsed = JSON.parse(typeof payload === 'string' ? payload : payload.toString('utf8'));
        if (parsed.id && parsed.type) {
          return parsed as Stripe.Event;
        }
      } catch {
        // Fall back to Stripe verification
      }
    }

    return stripeClient.webhooks.constructEvent(payload, signature, env.STRIPE_WEBHOOK_SECRET);
  }

  /**
   * Creates or retrieves a Stripe Checkout session.
   */
  static async createCheckoutSession(params: {
    organizationId: string;
    organizationName: string;
    plan: 'pro' | 'enterprise';
    stripeCustomerId?: string | null;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ sessionId: string; url: string; customerId: string }> {
    // If mock or test key
    if (env.STRIPE_SECRET_KEY.startsWith('sk_test_askdesk_mock')) {
      const mockCustomerId = params.stripeCustomerId ?? `cus_mock_${params.organizationId}`;
      return {
        sessionId: `cs_test_mock_${Date.now()}`,
        url: `https://checkout.stripe.com/c/pay/cs_test_mock?org=${params.organizationId}`,
        customerId: mockCustomerId
      };
    }

    let customerId = params.stripeCustomerId;
    if (!customerId) {
      const customer = await stripeClient.customers.create({
        name: params.organizationName,
        metadata: { organizationId: params.organizationId }
      });
      customerId = customer.id;
    }

    const session = await stripeClient.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `AskDesk ${params.plan.toUpperCase()} Plan`
            },
            unit_amount: params.plan === 'pro' ? 4900 : 49900,
            recurring: { interval: 'month' }
          },
          quantity: 1
        }
      ],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: {
        organizationId: params.organizationId,
        plan: params.plan
      }
    });

    return {
      sessionId: session.id,
      url: session.url ?? params.successUrl,
      customerId
    };
  }

  /**
   * Creates a Customer Portal session.
   */
  static async createPortalSession(params: {
    customerId: string;
    returnUrl: string;
  }): Promise<{ url: string }> {
    if (env.STRIPE_SECRET_KEY.startsWith('sk_test_askdesk_mock')) {
      return {
        url: `https://billing.stripe.com/p/session/test_mock?customer=${params.customerId}`
      };
    }

    const portal = await stripeClient.billingPortal.sessions.create({
      customer: params.customerId,
      return_url: params.returnUrl
    });

    return { url: portal.url };
  }
}
