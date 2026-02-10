"use server";

import { redirect } from "next/navigation";

// Redirect to the GitHub App installation page.
const handleAppInstall = async () => {
	const url = `https://github.com/apps/${process.env.GITHUB_APP_NAME}/installations/new`;
	return redirect(url);
};

export { handleAppInstall };
