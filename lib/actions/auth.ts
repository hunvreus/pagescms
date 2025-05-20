"use server";

/**
 * Authentication actions. All handled with Lucia auth, look at `lib/auth.ts` as well.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { generateState } from "arctic";
import { TimeSpan, createDate, isWithinExpirationDate } from "oslo";
import { sha256 } from "oslo/crypto";
import { encodeHex } from "oslo/encoding";
import { generateIdFromEntropySize } from "lucia";
import { github, lucia, getAuth } from "@/lib/auth";
import { db } from "@/db";
import { emailLoginTokenTable, userTable } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { Resend } from "resend";
import { LoginEmailTemplate } from "@/components/email/login";

// Create a login token for the user.
const createLoginToken = async (email: string): Promise<string> => {
	await db.delete(emailLoginTokenTable).where(eq(sql`lower(${emailLoginTokenTable.email})`, email.toLowerCase()));
	const tokenId = generateIdFromEntropySize(25);
	const tokenHash = encodeHex(await sha256(new TextEncoder().encode(tokenId)));
	await db.insert(emailLoginTokenTable).values({
		tokenHash: tokenHash,
		email: email.toLowerCase(),
		expiresAt: Math.floor(createDate(new TimeSpan(2, "h")).getTime() / 1000)
	});
	return tokenId;
};

// Send a sign in link to the user's email (collaborator)
const handleEmailSignIn = async (prevState: any, formData: FormData) => {
  const validation = z.coerce.string().email().safeParse(formData.get("email"));

	if (!validation.success) return { error: "Invalid email" };

	const email = validation.data;

	const loginToken = await createLoginToken(email as string);
	const baseUrl = process.env.BASE_URL
    ? process.env.BASE_URL
    : process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "";
	const loginUrl = `${baseUrl}/sign-in/collaborator/${loginToken}`;

	const resend = new Resend(process.env.RESEND_API_KEY);

	const { data, error } = await resend.emails.send({
		from: process.env.RESEND_FROM_EMAIL!,
		to: [email],
		subject: "Sign in link for Pages CMS",
		react: LoginEmailTemplate({
			url: loginUrl,
			email: email
		}),
	});

	if (error) throw new Error(error.message);

	return { message: "We've sent you a link to sign in. If you don't see it, check your spam folder." };	
};

// Redirect to the GitHub sign in page.
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

// Sign out the user.
const handleSignOut = async () => {
	const { session } = await getAuth();
	if (!session) return { error: "Unauthorized" };
	
	await lucia.invalidateSession(session.id);
	
	const sessionCookie = lucia.createBlankSessionCookie();
	cookies().set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
	
	return redirect("/");
};

// Helper function to get the token data
const getTokenData = async (token: string) => {
  const tokenHash = encodeHex(await sha256(new TextEncoder().encode(token)));
	const emailLoginToken = await db.query.emailLoginTokenTable.findFirst({
		where: eq(emailLoginTokenTable.tokenHash, tokenHash)
	});

	if (!emailLoginToken) throw new Error("Your sign in link is invalid (token is invalid).");
		
  const expiresAtDate = new Date(Number(emailLoginToken.expiresAt) * 1000);
  if (!isWithinExpirationDate(expiresAtDate)) throw new Error("Your sign in link has expired.");

  return { tokenHash, emailLoginToken };
}

// Sign in with token (collaborator)
const handleSignInWithToken = async (token: string, redirectTo?: string) => {
  let tokenHash, emailLoginToken;
  try {
    ({ tokenHash, emailLoginToken } = await getTokenData(token));
  } catch (error: any) {
    return redirect(`/sign-in?error=${encodeURIComponent(error.message)}`);
  }

  // Consume invite token
  await db.delete(emailLoginTokenTable).where(
    eq(emailLoginTokenTable.tokenHash, tokenHash)
  );

  // Retrieve or create user
  const user = await db.query.userTable.findFirst({
    where: eq(userTable.email, emailLoginToken.email)
  });

  let userId;

  if (!user) {
    userId = generateIdFromEntropySize(10); // 16 characters long
    await db.insert(userTable).values({
      id: userId,
      email: emailLoginToken.email
    });
  } else {
    userId = user.id;
  }
    
  // Log in user
  // await lucia.invalidateUserSessions(userId);
  const session = await lucia.createSession(userId, {});
  const sessionCookie = lucia.createSessionCookie(session.id);
  cookies().set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
    
  if (redirectTo) {
    return redirect(redirectTo);
  } else {
    return redirect("/");
  }
}

// Sign out the user and sign in with token (collaborator)
const handleSignOutAndSignIn = async (token: string, redirectTo?: string) => {
  const { session } = await getAuth();
	if (!session) return { error: "Unauthorized" };
	
	await lucia.invalidateSession(session.id);
	
	const sessionCookie = lucia.createBlankSessionCookie();
	cookies().set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);

  return handleSignInWithToken(token, redirectTo);
}

export {
  getTokenData,
  createLoginToken,
  handleEmailSignIn,
  handleGithubSignIn,
  handleSignOut,
  handleSignInWithToken,
  handleSignOutAndSignIn
};