"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { generateState } from "arctic";
import { TimeSpan, createDate } from "oslo";
import { sha256 } from "oslo/crypto";
import { encodeHex } from "oslo/encoding";
import { generateIdFromEntropySize } from "lucia";
import { github, lucia, getAuth } from "@/lib/auth";
import { db } from "@/db";
import { emailLoginTokenTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { Resend } from "resend";
import { LoginEmailTemplate } from "@/components/email/login";

async function createLoginToken(email: string): Promise<string> {
	await db.delete(emailLoginTokenTable).where(eq(emailLoginTokenTable.email, email));
	const tokenId = generateIdFromEntropySize(25);
	const tokenHash = encodeHex(await sha256(new TextEncoder().encode(tokenId)));
	await db.insert(emailLoginTokenTable).values({
		tokenHash: tokenHash,
		email,
		expiresAt: Math.floor(createDate(new TimeSpan(2, "h")).getTime() / 1000)
	});
	return tokenId;
}

const handleEmailSignIn = async (prevState: any, formData: FormData) => {
  const validation = z.coerce.string().email().safeParse(formData.get("email"));

	if (!validation.success) return { error: "Invalid email" };

	const email = validation.data;

	const verificationToken = await createLoginToken(email as string);
	const baseUrl = process.env.BASE_URL
    ? process.env.BASE_URL
    : process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "";
	const verificationLink = `${baseUrl}/api/auth/email/${verificationToken}`;

	const resend = new Resend(process.env.RESEND_API_KEY);

	const { data, error } = await resend.emails.send({
		from: "Pages CMS <no-reply@mail.pagescms.org>",
		to: [email],
		subject: "Sign in link for Pages CMS",
		react: LoginEmailTemplate({
			url: verificationLink,
			email: email
		}),
	});

	if (error) throw new Error(error.message);

	return { message: "We've sent you a link to sign in. If you don't see it, check your spam folder." };	
};

const handleGithubSignIn = async () => {
  const state = generateState();
	const url = await github.createAuthorizationURL(state, { scopes: ["repo", "user:email"] });

	cookies().set("github_oauth_state", state, {
		path: "/",
		secure: process.env.NODE_ENV === "production",
		httpOnly: true,
		maxAge: 60 * 10,
		sameSite: "lax"
	});

	return redirect(url.href);
};

const handleSignOut = async () => {
	const { session } = await getAuth();
	if (!session) return { error: "Unauthorized" };
	
	await lucia.invalidateSession(session.id);
	
	const sessionCookie = lucia.createBlankSessionCookie();
	cookies().set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
	
	return redirect("/");
};

export { createLoginToken, handleEmailSignIn, handleGithubSignIn, handleSignOut };