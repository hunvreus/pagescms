import { createFileRoute } from '@tanstack/react-router'

import { handleBillingWebhookRequest } from '#/server/billing-webhook.server'

export const Route = createFileRoute('/api/webhooks/billing')({
  server: {
    handlers: {
      POST: ({ request, context }) =>
        handleBillingWebhookRequest(
          request,
          context.getServices().billingWebhook,
        ),
    },
  },
})
