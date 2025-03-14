import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { generateIdFromEntropySize } from "lucia";
import { isWithinExpirationDate } from "oslo";
import { sha256 } from "oslo/crypto";
import { encodeHex } from "oslo/encoding";
import { getAuth, lucia } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { emailLoginTokenTable, userTable } from "@/db/schema";

/**
 * Handles email login authentication (for collaborators).
 * GET /api/auth/email/[token]
 * 
 * Requires email login token.
 */

export async function GET(
	request: Request,
	{ params }: { params: { token: string } }
) {
	const { session } = await getAuth();
  if (session) return redirect("/");

	const verificationToken = params.token;

	const tokenHash = encodeHex(await sha256(new TextEncoder().encode(verificationToken)));
	const token = await db.query.emailLoginTokenTable.findFirst({
		where: eq(emailLoginTokenTable.tokenHash, tokenHash)
	});

	if (!token) {
		const error = "Your sign in link is invalid.";
		redirect(`/sign-in?error=${encodeURIComponent(error)}`);
	} else {
		await db.delete(emailLoginTokenTable).where(
			eq(emailLoginTokenTable.tokenHash, tokenHash)
		);
		const expiresAtDate = new Date(Number(token.expiresAt) * 1000);
		if (!isWithinExpirationDate(expiresAtDate)) {
			const error = "Your sign in link has expired.";
			redirect(`/sign-in?error=${encodeURIComponent(error)}`);
		} else {
			const user = await db.query.userTable.findFirst({
				where: eq(userTable.email, token.email)
			});

			let userId;

			if (!user) {
				userId = generateIdFromEntropySize(10); // 16 characters long
				await db.insert(userTable).values({
					id: userId,
					email: token.email
				});
			} else {
				userId = user.id;
			}
			
			// await lucia.invalidateUserSessions(userId);
			const session = await lucia.createSession(userId, {});
			const sessionCookie = lucia.createSessionCookie(session.id);
			cookies().set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
			
			redirect("/");
		}
	}
}