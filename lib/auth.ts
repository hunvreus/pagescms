import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { getBaseUrl } from "@/lib/base-url";
import { sendEmail } from "@/lib/mailer";
import { repairLegacyEmailOnLogin } from "@/lib/legacy-email-repair";

export const auth = betterAuth({
  baseURL: getBaseUrl(),
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
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["github"],
      disableImplicitLinking: false,
      updateUserInfoOnLink: true,
      allowUnlinkingAll: false,
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
    schema: {
      user: schema.userTable,
      session: schema.sessionTable,
      account: schema.accountTable,
      verification: schema.verificationTable,
    },
  }),
  databaseHooks: {
    session: {
      create: {
        after: async (session) => {
          try {
            await repairLegacyEmailOnLogin(session.id, session.userId);
          } catch (error) {
            console.warn("[auth] legacy email repair failed", {
              sessionId: session.id,
              userId: session.userId,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        },
      },
    },
  },
  plugins: [
    nextCookies(),
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        const escapedEmail = email.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const escapedUrl = url.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
        const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;font-family:Arial,sans-serif;background:#ffffff;color:#0a0a0a;">
    <div style="max-width:465px;margin:0 auto;">
      <h1 style="font-size:24px;line-height:1.2;margin:0 0 20px;">Sign in to Pages CMS</h1>
      <p style="font-size:16px;line-height:24px;margin:0 0 16px;">Click the button below to sign in to Pages CMS:</p>
      <p style="margin:0 0 24px;">
        <a href="${escapedUrl}" style="display:inline-block;background:#171717;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:600;">Sign in</a>
      </p>
      <p style="font-size:16px;line-height:24px;margin:0 0 8px;">Or copy and paste this URL into your browser:</p>
      <p style="font-size:14px;line-height:22px;word-break:break-all;margin:0 0 24px;">
        <a href="${escapedUrl}" style="color:#0a0a0a;">${escapedUrl}</a>
      </p>
      <p style="font-size:13px;line-height:20px;color:#737373;margin:0;">
        This email was intended for <a href="mailto:${escapedEmail}" style="color:#737373;">${escapedEmail}</a>. If you did not try to sign in, you can ignore this email.
      </p>
    </div>
  </body>
</html>`;

        await sendEmail({
          to: email,
          subject: "Sign in link for Pages CMS",
          html,
        });
      },
    }),
  ],
});
