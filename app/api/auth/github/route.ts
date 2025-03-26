import { redirect } from "next/navigation";
import { getAuth, github, lucia } from "@/lib/auth";
import { cookies } from "next/headers";
import { OAuth2RequestError } from "arctic";
import { generateIdFromEntropySize } from "lucia";
import { encrypt } from "@/lib/crypto";
import { db } from "@/db";
import { userTable, githubUserTokenTable } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Handles GitHub OAuth authentication.
 * 
 * GET /api/auth/github
 * 
 * Requires GitHub OAuth code and state.
 */

export async function GET(request: Request): Promise<Response> {
	const { session } = await getAuth();
  if (session) return redirect("/");

	const url = new URL(request.url);
	const code = url.searchParams.get("code");
	const state = url.searchParams.get("state");
	const storedState = cookies().get("github_oauth_state")?.value ?? null;
	if (!code || !state || !storedState || state !== storedState) {
		return new Response(null, {
			status: 400
		});
	}

	try {
    const token = await github.validateAuthorizationCode(code);
		const githubUserResponse = await fetch("https://api.github.com/user", {
			headers: {
				Authorization: `Bearer ${token.accessToken}`
			}
		});
		const githubUser: GitHubUser = await githubUserResponse.json();
    
    const { ciphertext, iv } = await encrypt(token.accessToken);

		const existingUser = await db.query.userTable.findFirst({
			where: eq(userTable.githubId, Number(githubUser.id))
		});

		if (existingUser) {
			await db.update(githubUserTokenTable).set({
				ciphertext, iv
			}).where(
				eq(githubUserTokenTable.userId, existingUser.id)
			);
			const session = await lucia.createSession(existingUser.id as string, {});
			const sessionCookie = lucia.createSessionCookie(session.id);
			cookies().set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
			return new Response(null, {
				status: 302,
				headers: {
					Location: "/"
				}
			});
		}

		const userId = generateIdFromEntropySize(10); // 16 characters long

		await db.insert(userTable).values({
			id: userId,
			githubId: Number(githubUser.id),
			githubUsername: githubUser.login,
			githubEmail: githubUser.email,
			githubName: githubUser.name
		});
    await db.insert(githubUserTokenTable).values({
			ciphertext,
			iv,
			userId
		});

		const session = await lucia.createSession(userId, {});
		const sessionCookie = lucia.createSessionCookie(session.id);
		cookies().set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
		return new Response(null, {
			status: 302,
			headers: {
				Location: "/"
			}
		});
	} catch (e) {		
    // the specific error message depends on the provider
		if (e instanceof OAuth2RequestError) {
			// invalid code
			return new Response(null, {
				status: 400
			});
		}
		return new Response(null, {
			status: 500
		});
	}
}

interface GitHubUser {
	id: string;
	login: string;
	email: string;
	name: string;
}