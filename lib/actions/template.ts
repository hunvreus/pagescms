"use server";

import { createOctokitInstance } from "@/lib/utils/octokit";
import { getAuth } from "@/lib/auth";
import { getInstallations } from "@/lib/githubApp";
import { getUserToken } from "@/lib/token";
import templates from "@/lib/utils/templates";
import { z } from "zod";

// Copy a template repository.
const handleCopyTemplate = async (prevState: any, formData: FormData) => {
  try {
		const { user } = await getAuth();
		if (!user || !user.githubId) throw new Error("You must be signed in with GitHub to invite collaborators.");

		const token = await getUserToken();
  	if (!token) throw new Error("Token not found");

    const templateRepos = templates.map(template => template.repository) as string[];
    const templateRepoValidation = z.enum(templateRepos as [string, ...string[]]).safeParse(formData.get("template"));
    if (!templateRepoValidation.success) throw new Error ("Invalid template repository");
    
    const ownerAndNameValidation = z.object({
			owner: z.string().trim().min(1),
			name: z.string().trim().min(1),
		}).safeParse({
			owner: formData.get("owner"),
			name: formData.get("name")
		});
		if (!ownerAndNameValidation.success) throw new Error ("Invalid owner and/or repo");

		const owner = ownerAndNameValidation.data.owner;
		const name = ownerAndNameValidation.data.name;

		const installations = await getInstallations(token, [owner]);
		if (installations.length !== 1) throw new Error(`"${owner}" is not part of your GitHub App installations`);

    const [template_owner, template_repo] = templateRepoValidation.data.split("/");

		const octokit = createOctokitInstance(token);
    const response = await octokit.rest.repos.createUsingTemplate({
      template_owner,
      template_repo,
      owner,
      name,
    });

		return {
      message: `"${templateRepoValidation.data}" successfully copied as "${response.data.full_name}".`,
      data: {
        template: templateRepoValidation.data,
        owner,
        repo: name,
        branch: response.data.default_branch
      }
    };
	} catch (error: any) {
		console.error(error);
		return { error: error.response?.data?.message || error.message };
	}
};

export { handleCopyTemplate };