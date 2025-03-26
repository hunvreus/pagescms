"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { generateState } from "arctic";

// Redirect to the GitHub App installation page.
const handleAppInstall = async () => {
	const state = generateState();
	const url = `https://github.com/apps/${process.env.GITHUB_APP_NAME}/installations/new?state=${encodeURIComponent(state)}`;
	
	cookies().set("github_oauth_state", state, {
		path: "/",
		secure: process.env.NODE_ENV === "production",
		httpOnly: true,
		maxAge: 60 * 10,
		sameSite: "lax"
	});

	return redirect(url);
};

export { handleAppInstall };