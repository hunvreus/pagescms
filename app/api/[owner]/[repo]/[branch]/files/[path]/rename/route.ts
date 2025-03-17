import { createOctokitInstance } from "@/lib/utils/octokit";
import { getSchemaByName } from "@/lib/schema";
import { getConfig } from "@/lib/utils/config";
import { getFileExtension, normalizePath } from "@/lib/utils/file";
import { getAuth } from "@/lib/auth";
import { getToken } from "@/lib/token";
import { updateFileCache } from "@/lib/githubCache";

/**
 * Renames a file in a GitHub repository.
 * 
 * POST /api/[owner]/[repo]/[branch]/files/[path]/rename
 *
 * Requires authentication.
 */

export async function POST(
  request: Request,
  { params }: { params: { owner: string, repo: string, branch: string, path: string } }
) {
  try {
    const { user, session } = await getAuth();
    if (!session) return new Response(null, { status: 401 });

    const token = await getToken(user, params.owner, params.repo);
    if (!token) throw new Error("Token not found");

    if (params.path === ".pages.yml") throw new Error(`Renaming the settings file isn't allowed.`);

    const config = await getConfig(params.owner, params.repo, params.branch);
    if (!config) throw new Error(`Configuration not found for ${params.owner}/${params.repo}/${params.branch}.`);

    const data: any = await request.json();

    if (!data.type || !["content", "media"].includes(data.type)) throw new Error(`"type" is required and must be set to "content" or "media".`);
    if (!data.name && data.type === "content") throw new Error(`"name" is required.`);
    if (!data.newPath) throw new Error(`"newPath" is required.`);

    const normalizedPath = normalizePath(params.path);
    const normalizedNewPath = normalizePath(data.newPath);
    if (normalizedPath === normalizedNewPath) throw new Error(`New path "${data.newPath}" is the same as the old path.`);

    let schema;

    switch (data.type) {
      case "content":
        if (!data.name) throw new Error(`"name" is required for content.`);

        schema = getSchemaByName(config.object, data.name);
        if (!schema) throw new Error(`Content schema not found for ${data.name}.`);

        if (schema.type === "file") throw new Error(`Renaming content of type "file" isn't allowed.`);
        
        if (!normalizedPath.startsWith(schema.path)) throw new Error(`Invalid path "${params.path}" for ${data.type} "${data.name}".`);
        if (!normalizedNewPath.startsWith(schema.path)) throw new Error(`Invalid path "${data.newPath}" for ${data.type} "${data.name}".`);

        if (getFileExtension(normalizedPath) !== schema.extension) throw new Error(`Invalid extension "${getFileExtension(normalizedPath)}" for ${data.type} "${data.name}".`);
        if (getFileExtension(normalizedNewPath) !== schema.extension) throw new Error(`Invalid extension "${getFileExtension(normalizedNewPath)}" for ${data.type} "${data.name}".`);
        break;
      case "media":
        if (!data.name) throw new Error(`"name" is required for media.`);

        schema = getSchemaByName(config.object, data.name, "media");
        if (!schema) throw new Error(`Media schema not found for ${data.name}.`);
        
        if (!normalizedPath.startsWith(schema.input)) throw new Error(`Invalid path "${params.path}" for media.`);
        if (!normalizedNewPath.startsWith(schema.input)) throw new Error(`Invalid path "${data.newPath}" for media.`);
        
        if (
          schema.extensions?.length > 0 &&
          !schema.extensions.includes(getFileExtension(normalizedPath))
        ) throw new Error(`Invalid extension "${getFileExtension(normalizedPath)}" for media.`);
        if (
          schema.extensions?.length > 0 &&
          !schema.extensions.includes(getFileExtension(normalizedNewPath))
        ) throw new Error(`Invalid extension "${getFileExtension(normalizedNewPath)}" for media.`);
        break;
    }
    
    const response = await githubRenameFile(token, params.owner, params.repo, params.branch, normalizedPath, normalizedNewPath);

    // Update the cache with the rename operation
    await updateFileCache(
      data.type === 'content' ? 'collection' : 'media',
      params.owner,
      params.repo,
      params.branch,
      {
        type: 'rename',
        path: normalizedPath,
        newPath: normalizedNewPath,
        commit: {
          sha: response.sha,
          timestamp: Date.now()
        }
      }
    );

    // TODO: remove success message in backend 
    return Response.json({
      status: "success",
      message: `File "${normalizedPath}" moved to "${normalizedNewPath}".`,
      data: {
        path: response?.path,
        newPath: response?.newPath,
      }
    });
  } catch (error: any) {
    console.error(error);
    return Response.json({
      status: "error",
      message: error.message,
    });
  }
};

// /!\ THE FOLLOWING IS A BIT OF A WTF... But hear me out.
// We can't easily rename a file via the GitHub API. We could copy the file with a new path and
// then delete the original, but we'd then lose the commit history. So we resort to a rather
// barbaric approach, chaining 5 sequential API calls. More about the why and how:
// https://stackoverflow.com/questions/31563444/rename-a-file-with-github-api
// https://medium.com/@obodley/renaming-a-file-using-the-git-api-fed1e6f04188
// https://www.levibotelho.com/development/commit-a-file-with-the-github-api/
const githubRenameFile = async (
  token: string,
  owner: string,
  repo: string,
  branch: string,
  path: string,
  newPath: string,
) => {
  const octokit = createOctokitInstance(token);

  // Step 1: Get the current branch commit SHA
  const { data: branchData } = await octokit.rest.repos.getBranch({
    owner,
    repo,
    branch,
  });
  const currentSha = branchData.commit.sha;

  // Step 2: Get the current tree
  const { data: treeData } = await octokit.rest.git.getTree({
    owner,
    repo,
    tree_sha: currentSha,
    recursive: "true",
  });
  const tree = treeData.tree;

  // Step 3: Create a new tree with the updated path
  const newTree = tree
    .filter(item => item.type !== 'tree')
    .map(item => ({
      path: item.path === path ? newPath : item.path,
      mode: item.mode as "100644" | "100755" | "040000" | "160000" | "120000",
      type: item.type as "commit" | "tree" | "blob",
      sha: item.sha,
    }));

  const { data: newTreeData } = await octokit.rest.git.createTree({
    owner,
    repo,
    tree: newTree,
  });
  const newTreeSha = newTreeData.sha;

  // Step 4: Create a commit for the new tree
  const { data: commitData } = await octokit.rest.git.createCommit({
    owner,
    repo,
    message: `Rename ${path} to ${newPath}`,
    tree: newTreeSha,
    parents: [currentSha],
  });
  const commitSha = commitData.sha;

  // Step 5: Point the branch at the new commit
  await octokit.rest.git.updateRef({
    owner,
    repo,
    ref: `heads/${branch}`,
    sha: commitSha,
  });

  return {
    sha: commitSha,
    path: path,
    newPath: newPath,
  };
};