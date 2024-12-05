"use server";

import { redirect } from "next/navigation";
import Stripe from "stripe";
import { getAuth } from "@/lib/auth";
import { getUserToken } from "@/lib/token";
import { getInstallations } from "@/lib/githubApp";
import { db } from "@/db";
import { subscriptionTable } from "@/db/schema";
import { and, eq } from "drizzle-orm";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const handleCheckout = async (formData: FormData) => {
  // TODO: see how we allow other users to upgrade
  const { user } = await getAuth();
  if (!user) throw new Error("User not found");

  const owner = String(formData.get("owner"));

  const existingSubscription = await db.query.subscriptionTable.findFirst({
    where: and(
      eq(subscriptionTable.owner, owner),
      eq(subscriptionTable.status, "active"),
    ),
  });

  if (existingSubscription) throw new Error(`There already is a subscription for "${owner}"`);

  const token = await getUserToken();
  if (!token) throw new Error("Token not found");

  const installations = await getInstallations(token, [owner]);
  if (installations.length !== 1) throw new Error(`"${owner}" is not part of your GitHub App installations`);

  const baseUrl = process.env.BASE_URL
    ? process.env.BASE_URL
    : process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "";
  const redirectUri = `${baseUrl}${String(formData.get("pathname"))}`;

  const billingPeriod = String(formData.get("billingPeriod"));

  const priceId = billingPeriod === "yearly"
    ? process.env.STRIPE_PRICE_ID_PRO_YEARLY!
    : process.env.STRIPE_PRICE_ID_PRO_MONTHLY!;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    allow_promotion_codes: true,
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    customer_email: user.githubEmail,
    metadata: {
      userId: user.id,
      owner: installations[0].account.login,
      ownerId: installations[0].account.id
    },
    success_url: `${redirectUri}?status=success&owner=${owner}`,
    cancel_url: `${redirectUri}?status=cancel&owner=${owner}`,
  });

  if (!session.url) throw new Error("Failed to create checkout session");

  return redirect(session.url);
};

const handleManageBilling = async (formData: FormData) => {
  const { user } = await getAuth();
  if (!user) throw new Error("User not found");

  const subscriptionId = String(formData.get("subscriptionId"));

  // TODO: Is there a risk to leak payment info here?
  const subscription = await db.query.subscriptionTable.findFirst({
		where: eq(subscriptionTable.subscriptionId, subscriptionId)
	});

  if (!subscription) throw new Error("Subscription not found");
  if (subscription.userId !== user.id) throw new Error("Unauthorized access to subscription");

  const baseUrl = process.env.BASE_URL
    ? process.env.BASE_URL
    : process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "";
  const returnUri = `${baseUrl}${String(formData.get("pathname"))}`;
  
  const session = await stripe.billingPortal.sessions.create({
    customer: subscription.customerId,
    return_url: returnUri,
  });

  return redirect(session.url);
}

export { handleCheckout, handleManageBilling };