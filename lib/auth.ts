import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";
import { Resend } from "resend";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { LoginEmailTemplate } from "@/components/email/login";

export const auth = betterAuth({
  baseURL: process.env.BASE_URL as string,
  secret: (process.env.AUTH_SECRET || process.env.BETTER_AUTH_SECRET) as string,
  user: {
    additionalFields: {
      githubUsername: {
        type: "string",
        required: false,
        input: false,
      },
    },
  },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_APP_CLIENT_ID as string,
      clientSecret: process.env.GITHUB_APP_CLIENT_SECRET as string,
      overrideUserInfoOnSignIn: true,
      mapProfileToUser: (profile) => ({
        name: profile.name ?? profile.login,
        image: profile.avatar_url ?? null,
        githubUsername: profile.login,
      }),
      scope: ["repo", "user:email"],
    },
  },
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  plugins: [
    nextCookies(),
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        const resend = new Resend(process.env.RESEND_API_KEY);

        const { error } = await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL!,
          to: [email],
          subject: "Sign in link for Pages CMS",
          react: LoginEmailTemplate({
            url,
            email,
          }),
        });

        if (error) throw new Error(error.message);
      },
    }),
  ],
});
