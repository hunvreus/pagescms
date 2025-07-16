/**
 * Auth helper functions for Lucia auth.
 */

import { cache } from "react";
import { Session, User, Lucia } from "lucia";
import { DrizzlePostgreSQLAdapter, PostgreSQLSessionTable, PostgreSQLUserTable } from "@lucia-auth/adapter-drizzle";
import { db } from "@/db";
import { userTable, sessionTable } from "@/db/schema";
import { GitHub } from "arctic";
import { cookies } from "next/headers";

const adapter = new DrizzlePostgreSQLAdapter(db, sessionTable as unknown as PostgreSQLSessionTable, userTable as unknown as PostgreSQLUserTable);

export const lucia = new Lucia(adapter, {
	sessionCookie: {
		expires: false,
		attributes: {
			secure: process.env.NODE_ENV === "production"
		}
	},
	getUserAttributes: (attributes) => {
		return {
			githubId: attributes.githubId,
			githubUsername: attributes.githubUsername,
			githubEmail: attributes.githubEmail,
			githubName: attributes.githubName,
			email: attributes.email
		};
	}
});

declare module "lucia" {
	interface Register {
		Lucia: typeof lucia;
		DatabaseUserAttributes: DatabaseUserAttributes;
	}
}

export interface DatabaseUserAttributes {
	id: string;
	githubId: number;
	githubUsername: string;
	githubEmail: string;
	githubName: string;
	email: string;
}

export const github = new GitHub(process.env.GITHUB_APP_CLIENT_ID!, process.env.GITHUB_APP_CLIENT_SECRET!);

export const getAuth = cache(
	async (): Promise<{ user: User; session: Session } | { user: null; session: null }> => {
		const sessionId = cookies().get(lucia.sessionCookieName)?.value ?? null;
		if (!sessionId) {
			return {
				user: null,
				session: null
			};
		}

		const result = await lucia.validateSession(sessionId);
		// next.js throws when you attempt to set cookie when rendering page
		try {
			if (result.session && result.session.fresh) {
				const sessionCookie = lucia.createSessionCookie(result.session.id);
				cookies().set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
			}
			if (!result.session) {
				const sessionCookie = lucia.createBlankSessionCookie();
				cookies().set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
			}
		} catch {}
		return result;
	}
);