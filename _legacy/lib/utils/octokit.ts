/**
 * Create an Octokit instance that wraps the requests with a check for credentials
 * to surface revoked/lost access (401 Bad credentials).
 */

import { Octokit } from "@octokit/rest";
import { createHttpError } from "@/lib/api-error";

const getRetryAfter = (response: Response) => {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) return retryAfter;

  const remaining = response.headers.get("x-ratelimit-remaining");
  const reset = response.headers.get("x-ratelimit-reset");
  if (remaining !== "0" || !reset) return null;

  const resetSeconds = Number(reset);
  if (!Number.isFinite(resetSeconds)) return null;

  return String(Math.max(1, resetSeconds - Math.floor(Date.now() / 1000)));
};

const isGithubRateLimitResponse = (response: Response, message: string) => {
  if (response.status !== 403 && response.status !== 429) return false;

  const normalizedMessage = message.toLowerCase();
  return (
    normalizedMessage.includes("rate limit") ||
    response.headers.get("x-ratelimit-remaining") === "0" ||
    Boolean(response.headers.get("retry-after"))
  );
};

export const createOctokitInstance = (token: string, options?: any) => {
  if (!token) throw new Error("Auth token is required to initialize Octokit");

  return new Octokit({
    ...options,
    auth: token,
    request: {
      fetch: async (url: string, options: RequestInit) => {
        const response = await fetch(url, options);

        if (response.status === 401 || response.status === 403 || response.status === 429) {
          let message = response.status === 401
            ? "GitHub authentication failed."
            : "GitHub request failed.";

          try {
            const data = await response.clone().json();
            if (typeof data.message === "string") {
              message = data.message;
            }
            if (response.status === 401 && data.message === "Bad credentials") {
              message = "GitHub authentication failed: bad credentials.";
            }
          } catch {}

          if (response.status === 401) {
            throw createHttpError(message, 401);
          }

          if (isGithubRateLimitResponse(response, message)) {
            const retryAfter = getRetryAfter(response);
            throw createHttpError(
              retryAfter
                ? `GitHub rate limit reached. Please wait ${retryAfter} seconds and try again.`
                : "GitHub rate limit reached. Please wait a minute and try again.",
              429,
              retryAfter ? { "Retry-After": retryAfter } : undefined,
            );
          }
        }

        return response;
      }
    }
  });
};
