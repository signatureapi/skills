import Stripe from "stripe";
export function stripeWebhook(req, res) {
  const event = new Stripe(process.env.STRIPE_KEY).webhooks.constructEvent(req.body, req.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET);
  // handle invoice.paid etc.
  res.sendStatus(200);
}
