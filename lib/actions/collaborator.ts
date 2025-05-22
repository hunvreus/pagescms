"use server";

import { getAuth } from "@/lib/auth";
import { getInstallations, getInstallationRepos } from "@/lib/githubApp";
import { getUserToken } from "@/lib/token";
import { InviteEmailTemplate } from "@/components/email/invite";
import { Resend } from "resend";
import { createLoginToken } from "@/lib/actions/auth";
import { db } from "@/db";
import { and, eq} from "drizzle-orm";
import { collaboratorTable } from "@/db/schema";
import { z } from "zod";

// Invite a collaborator to a repository.
const handleAddCollaborator = async (prevState: any, formData: FormData) => {
	try {
		// TODO: remove the requirement for Github account, let any collaborator invite others
		const { user } = await getAuth();
		if (!user || !user.githubId) throw new Error("You must be signed in with GitHub to invite collaborators.");

		// TODO: add support for branches
		const ownerAndRepoValidation = z.object({
			owner: z.string().trim().min(1),
			repo: z.string().trim().min(1),
		}).safeParse({
			owner: formData.get("owner"),
			repo: formData.get("repo")
		});
		if (!ownerAndRepoValidation.success) throw new Error ("Invalid owner and/or repo");

		const owner = ownerAndRepoValidation.data.owner;
		const repo = ownerAndRepoValidation.data.repo;

		const emailValidation = z.string().trim().email().safeParse(formData.get("email"));
		if (!emailValidation.success) throw new Error ("Invalid email");

		const email = emailValidation.data;

		const token = await getUserToken();
  	if (!token) throw new Error("Token not found");
		
		const installations = await getInstallations(token, [owner]);
		if (installations.length !== 1) throw new Error(`"${owner}" is not part of your GitHub App installations`);

		const installationRepos =  await getInstallationRepos(token, installations[0].id, [repo]);
		if (installationRepos.length !== 1) throw new Error(`"${owner}/${repo}" is not part of your GitHub App installations`);

		const collaborator = await db.query.collaboratorTable.findFirst({
			where: and(
        eq(collaboratorTable.ownerId, installationRepos[0].owner.id),
        eq(collaboratorTable.repoId, installationRepos[0].id),
				eq(collaboratorTable.email, email)
      ),
		});
		if (collaborator) throw new Error(`${email} is already invited to "${owner}/${repo}".`);

    const loginToken = await createLoginToken(email as string);
		const baseUrl = process.env.BASE_URL
			? process.env.BASE_URL
			: process.env.VERCEL_PROJECT_PRODUCTION_URL
				? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
				: "";
    const inviteUrl = `${baseUrl}/sign-in/collaborator/${loginToken}?redirect=/${owner}/${repo}`;

		const resend = new Resend(process.env.RESEND_API_KEY);

    const { data, error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL!,
      to: [email],
      subject: `Join "${owner}/${repo}" on Pages CMS`,
      react: InviteEmailTemplate({
        inviteUrl,
        repoName: `${formData.get("owner")}/${formData.get("repo")}`,
        email: email,
        invitedByName: user.githubName || user.githubUsername,
        invitedByUrl: `https://github.com/${user.githubUsername}`,
      }),
    });

    if (error) {
      console.error(`Failed to send invitation email to ${email}:`, error.message);
      throw new Error(error.message);
    }
    
		const newCollaborator = await db.insert(collaboratorTable).values({
			type: installationRepos[0].owner.type === "User" ? "user" : "org",
			installationId: installations[0].id,
			ownerId: installationRepos[0].owner.id,
			repoId: installationRepos[0].id,
			owner: installationRepos[0].owner.login,
			repo: installationRepos[0].name,
			email,
			invitedBy: user.id
		}).returning();

		return {
			message: `${email} invited to "${owner}/${repo}".`,
			data: newCollaborator
		};
	} catch (error: any) {
		console.error(error);
		return { error: error.message };
	}
};

// Remove a collaborator from a repository.
const handleRemoveCollaborator = async (collaboratorId: number, owner: string, repo: string) => {
	try {
		const { user } = await getAuth();
		if (!user || !user.githubId) throw new Error("You must be signed in with GitHub to invite collaborators.");

		const token = await getUserToken();
  	if (!token) throw new Error("Token not found");

		const collaborator = await db.query.collaboratorTable.findFirst({ where: eq(collaboratorTable.id, collaboratorId) });
		if (!collaborator) throw new Error("Collaborator not found");

		const installations = await getInstallations(token, [owner]);
		if (installations.length !== 1) throw new Error(`"${owner}" is not part of your GitHub App installations`);

		const installationRepos =  await getInstallationRepos(token, installations[0].id, [repo]);
		if (installationRepos.length !== 1) throw new Error(`"${owner}/${repo}" is not part of your GitHub App installations`);

		const deletedCollaborator = await db.delete(collaboratorTable).where(
			and(
				eq(collaboratorTable.id, collaboratorId),
				eq(collaboratorTable.repoId, installationRepos[0].id)
			)
		).returning();

		if (!deletedCollaborator || deletedCollaborator.length === 0) throw new Error("Failed to delete collaborator");

		return { message: `Invitation to ${collaborator.email} for "${owner}/${repo}" successfully removed.` };
	} catch (error: any) {
		console.error(error);
		return { error: error.message };
	}
};

export { handleAddCollaborator, handleRemoveCollaborator };