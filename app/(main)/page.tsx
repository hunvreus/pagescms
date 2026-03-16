"use client";

import { useState } from "react";
import { handleAppInstall } from "@/lib/actions/app";
import { useUser } from "@/contexts/user-context";
import { RepoSelect } from "@/components/repo/repo-select";
import { RepoTemplates } from "@/components/repo/repo-templates";
import { RepoLatest } from "@/components/repo/repo-latest";
import { Message } from "@/components/message";
import { SubmitButton } from "@/components/submit-button";
import { hasGithubIdentity } from "@/lib/authz";
import { MainRootLayout } from "./main-root-layout";
import { Github } from "lucide-react";

export default function Page() {
	const [defaultAccount, setDefaultAccount] = useState<any>(null);
    const { user } = useUser();
	const isGithubUser = hasGithubIdentity(user);
	
	if (!user) throw new Error("User not found");
	if (!user.accounts) throw new Error("Accounts not found");

	return (
    <MainRootLayout>
			<div className="max-w-screen-sm mx-auto p-4 md:p-6 space-y-8">
				{user.accounts.length > 0
					? <div className="min-h-[calc(100vh-12rem)] flex flex-col justify-center space-y-8">
					    <div className="space-y-4">
								<h2 className="text-lg leading-none font-semibold">Recently visited</h2>
								<RepoLatest/>
							</div>
							<div className="space-y-4">
								<h2 className="text-lg leading-none font-semibold">Open a project</h2>
								<RepoSelect onAccountSelect={(account) => setDefaultAccount(account)}/>
							</div>
							{isGithubUser &&
								<div className="space-y-4">
									<h2 className="text-lg leading-none font-semibold">Create from a template</h2>
									<RepoTemplates defaultAccount={defaultAccount}/>
								</div>
							}
						</div>
					:	isGithubUser
							? <Message
									title="Install the GitHub app"
									description="You must install the GitHub application for the accounts you want to use Pages CMS with."
									className="absolute inset-0"
								>
									<form action={handleAppInstall}>
										<SubmitButton type="submit">
											<Github className="h-4 w-4 mr-2" />
											Install
										</SubmitButton>
									</form>
								</Message>
						  : <Message
									title="Nothing to see (yet)"
									description="You must be invited to a repository to collaborate. Ask the person who invited you or manages your organization to invite you."
									className="absolute inset-0"
								/>
				}
			</div>
		</MainRootLayout>
	);
}
