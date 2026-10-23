import { createHash } from "node:crypto";
import { createOctokitInstance } from "@/lib/utils/octokit";
import { parse, stringify } from "@/lib/serialization";
import { getFieldByPath, getSchemaByName, safeAccess, setByPath } from "@/lib/schema";
import { getConfig } from "@/lib/config-store";
import { getFileExtension, getParentPath, normalizePath, serializedTypes } from "@/lib/utils/file";
import { getToken } from "@/lib/token";
import {
  getBranchHeadSha,
  getCollectionCache,
  setBranchHeadSha,
  updateFileCache,
} from "@/lib/github-cache-file";
import { createHttpError, toErrorResponse } from "@/lib/api-error";
import { buildCommitTokens, resolveCommitIdentity, resolveCommitMessage } from "@/lib/commit-message";
import { requireApiUserSession } from "@/lib/session-server";

/**
 * Saves a manual order for the entries of a collection folder.
 *
 * POST /api/[owner]/[repo]/[branch]/collections/[name]/order
 *
 * The collection must define `view.reorder` (the name of a number field). The
 * body lists the entries in their new order; each one gets its 1-based position
 * written in that field. Only the entries whose position changes are modified,
 * all in a single commit.
 *
 * Requires authentication.
 */

export async function POST(
  request: Request,
  context: { params: Promise<{ owner: string, repo: string, branch: string, name: string }> }
) {
  try {
    const params = await context.params;
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) return sessionResult.response;
    const user = sessionResult.user;

    const { token } = await getToken(user, params.owner, params.repo, true);
    if (!token) throw new Error("Token not found");

    const config = await getConfig(params.owner, params.repo, params.branch, {
      getToken: async () => token,
    });
    if (!config) throw new Error(`Configuration not found for ${params.owner}/${params.repo}/${params.branch}.`);
    const schema = getSchemaByName(config.object, params.name);
    if (!schema || schema.type !== "collection") {
      throw createHttpError(`Collection "${params.name}" not found.`, 404);
    }

    const reorderField: string | undefined = schema.view?.reorder ?? undefined;
    if (!reorderField) {
      throw createHttpError(`Collection "${params.name}" doesn't define "view.reorder".`, 400);
    }
    const field = schema.fields ? getFieldByPath(schema.fields, reorderField) : undefined;
    if (!field || field.type !== "number") {
      throw createHttpError(`"view.reorder" must be the name of a "number" field in "${params.name}".`, 400);
    }
    if (!serializedTypes.includes(schema.format)) {
      throw createHttpError(`Collection "${params.name}" can't be reordered: its format has no fields.`, 400);
    }

    const data: any = await request.json();
    const folder = normalizePath(data.path || schema.path);
    if (!folder.startsWith(schema.path)) {
      throw createHttpError(`Invalid path "${data.path}" for collection "${params.name}".`, 400);
    }
    if (schema.subfolders === false && folder !== schema.path) {
      throw createHttpError(`Invalid path "${data.path}" for collection "${params.name}".`, 400);
    }

    if (!Array.isArray(data.entries) || data.entries.length === 0) {
      throw createHttpError(`"entries" must be a non-empty array.`, 400);
    }
    const requested: { path: string, sha: string }[] = data.entries.map((entry: any) => ({
      path: normalizePath(String(entry?.path ?? "")),
      sha: String(entry?.sha ?? ""),
    }));
    if (new Set(requested.map((entry) => entry.path)).size !== requested.length) {
      throw createHttpError(`"entries" contains duplicate paths.`, 400);
    }

    const cachedEntries = await getCollectionCache(
      params.owner,
      params.repo,
      params.branch,
      folder,
      token,
      schema.view?.node?.filename,
    );
    const cachedByPath = new Map<string, any>(
      cachedEntries
        .filter((item: any) => item.type === "file")
        .map((item: any) => [item.path, item]),
    );

    const changes: { path: string, content: string }[] = [];
    const positions = new Map<string, number>();

    requested.forEach((entry, index) => {
      if (
        getParentPath(entry.path) !== folder ||
        getFileExtension(entry.path) !== (schema.extension ?? "")
      ) {
        throw createHttpError(`Invalid path "${entry.path}" for collection "${params.name}".`, 400);
      }

      const cached = cachedByPath.get(entry.path);
      if (!cached) throw createHttpError(`Entry "${entry.path}" not found.`, 404);
      if (cached.sha !== entry.sha) {
        throw createHttpError(
          `"${entry.path}" has changed since you last loaded it. Please refresh the page and try again.`,
          409,
        );
      }

      const position = index + 1;
      positions.set(entry.path, position);

      const contentObject = parse(cached.content, { format: schema.format, delimiters: schema.delimiters });
      const currentPosition: unknown = safeAccess(contentObject, reorderField);
      if (currentPosition === position) return;

      setByPath(contentObject, reorderField, position);
      changes.push({
        path: entry.path,
        content: stringify(contentObject, { format: schema.format, delimiters: schema.delimiters }),
      });
    });

    if (changes.length === 0) {
      return Response.json({
        status: "success",
        message: "The order is already up to date.",
        data: {
          entries: requested.map((entry) => ({ path: entry.path, sha: entry.sha, position: positions.get(entry.path) })),
        },
      });
    }

    const commitIdentity = resolveCommitIdentity({
      configObject: config.object,
      identityOverride: schema.commit?.identity,
    });
    const committer = (commitIdentity === "user" && user.email)
      ? { name: user.name?.trim() || user.email, email: user.email }
      : undefined;

    const octokit = createOctokitInstance(token);
    const headSha = await getBranchHeadSha(params.owner, params.repo, params.branch, token);

    const message = resolveCommitMessage({
      configObject: config.object,
      templatesOverride: schema.commit?.templates,
      action: "update",
      tokens: buildCommitTokens({
        action: "update",
        owner: params.owner,
        repo: params.repo,
        branch: params.branch,
        path: folder,
        contentName: params.name,
        user: user.email || user.name || String(user.id || ""),
        userName: committer?.name,
        userEmail: committer?.email,
      }),
    });

    let commitSha: string;
    try {
      const options = { octokit, owner: params.owner, repo: params.repo, branch: params.branch, headSha, message, changes };
      commitSha = committer
        ? await commitWithRest({ ...options, committer })
        : await commitWithGraphql(options);
    } catch (error: any) {
      console.error(error);
      if (error.status === 409 || error.status === 422 || error.name === "GraphqlResponseError") {
        throw createHttpError(
          "The branch has changed or is protected. Please refresh the page and try again.",
          409,
        );
      }
      throw error;
    }
    setBranchHeadSha(params.owner, params.repo, params.branch, commitSha);
    const newShas = new Map(changes.map((change) => [change.path, gitBlobSha(change.content)]));

    const timestamp = Date.now();
    // One at a time: each call also writes the folder's cache meta row, which has
    // a unique index, so concurrent calls would collide on it.
    for (const change of changes) {
      await updateFileCache("collection", params.owner, params.repo, params.branch, {
        type: "modify",
        path: change.path,
        sha: newShas.get(change.path)!,
        content: change.content,
        size: Buffer.byteLength(change.content),
        commit: { sha: commitSha, timestamp },
      });
    }
    return Response.json({
      status: "success",
      message: `Order saved (${changes.length} ${changes.length === 1 ? "entry" : "entries"} updated).`,
      data: {
        commit: commitSha,
        entries: requested.map((entry) => ({
          path: entry.path,
          sha: newShas.get(entry.path) ?? entry.sha,
          position: positions.get(entry.path),
        })),
      },
    });
  } catch (error: any) {
    console.error(error);
    return toErrorResponse(error);
  }
}

type CommitFilesOptions = {
  octokit: ReturnType<typeof createOctokitInstance>;
  owner: string;
  repo: string;
  branch: string;
  headSha: string;
  message: string;
  changes: { path: string; content: string }[];
};

// SHA that Git gives to a file with this content
const gitBlobSha = (content: string) =>
  createHash("sha1")
    .update(`blob ${Buffer.byteLength(content)}\0`)
    .update(content)
    .digest("hex");

// Commits all the files in a single request. GitHub sets the author itself
// (the app or the token's user), so it can't carry a custom committer.
const commitWithGraphql = async ({ octokit, owner, repo, branch, headSha, message, changes }: CommitFilesOptions) => {
  const result: any = await octokit.graphql(
    `mutation ($input: CreateCommitOnBranchInput!) {
      createCommitOnBranch(input: $input) { commit { oid } }
    }`,
    {
      input: {
        branch: { repositoryNameWithOwner: `${owner}/${repo}`, branchName: branch },
        message: { headline: message },
        expectedHeadOid: headSha,
        fileChanges: {
          additions: changes.map((change) => ({
            path: change.path,
            contents: Buffer.from(change.content).toString("base64"),
          })),
        },
      },
    },
  );
  return result.createCommitOnBranch.commit.oid as string;
};

// Same thing with the Git data API, for commits that must carry a committer
const commitWithRest = async ({
  octokit, owner, repo, branch, headSha, message, changes, committer,
}: CommitFilesOptions & { committer: { name: string; email: string } }) => {
  const { data: headCommit } = await octokit.rest.git.getCommit({ owner, repo, commit_sha: headSha });
  const { data: tree } = await octokit.rest.git.createTree({
    owner,
    repo,
    base_tree: headCommit.tree.sha,
    tree: changes.map((change) => ({
      path: change.path,
      mode: "100644" as const,
      type: "blob" as const,
      content: change.content,
    })),
  });
  const { data: commit } = await octokit.rest.git.createCommit({
    owner,
    repo,
    message,
    tree: tree.sha,
    parents: [headSha],
    committer,
  });
  await octokit.rest.git.updateRef({ owner, repo, ref: `heads/${branch}`, sha: commit.sha });
  return commit.sha;
};
