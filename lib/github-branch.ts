import { createOctokitInstance } from "@/lib/utils/octokit";

type BranchHeadCacheEntry = {
  sha: string;
  expiresAt: number;
};

const branchHeadCache = new Map<string, BranchHeadCacheEntry>();
const branchHeadInFlight = new Map<string, Promise<string>>();
const BRANCH_HEAD_CACHE_TTL_MS = parseInt(process.env.BRANCH_HEAD_CACHE_TTL_MS || "15000", 10);

const getBranchHeadCacheKey = (owner: string, repo: string, branch: string) =>
  `${owner.toLowerCase()}::${repo.toLowerCase()}::${branch}`;

const setBranchHeadSha = (owner: string, repo: string, branch: string, sha: string) => {
  const key = getBranchHeadCacheKey(owner, repo, branch);
  branchHeadCache.set(key, {
    sha,
    expiresAt: Date.now() + BRANCH_HEAD_CACHE_TTL_MS,
  });
};

const getBranchHeadSha = async (
  owner: string,
  repo: string,
  branch: string,
  token: string,
  options?: { force?: boolean },
): Promise<string> => {
  const key = getBranchHeadCacheKey(owner, repo, branch);

  if (!options?.force) {
    const cached = branchHeadCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.sha;
  }

  const inFlight = branchHeadInFlight.get(key);
  if (inFlight) return inFlight;

  const job = (async () => {
    const octokit = createOctokitInstance(token);
    const response = await octokit.rest.repos.getBranch({
      owner,
      repo,
      branch,
    });
    const sha = response.data.commit.sha;
    setBranchHeadSha(owner, repo, branch, sha);
    return sha;
  })();

  branchHeadInFlight.set(key, job);
  try {
    return await job;
  } finally {
    branchHeadInFlight.delete(key);
  }
};

export { getBranchHeadSha, setBranchHeadSha };
