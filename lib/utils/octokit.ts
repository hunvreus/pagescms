/**
 * Create an Octokit instance that wraps the requests with a check for credentials
 * to surface revoked/lost access (401 Bad credentials).
 */

import { Octokit } from "@octokit/rest";
import { createHttpError } from "@/lib/api-error";

export const createOctokitInstance = (token: string, options?: any) => {
  if (!token) throw new Error("Auth token is required to initialize Octokit");

  return new Octokit({
    ...options,
    auth: token,
    request: {
      fetch: async (url: string, options: RequestInit) => {
        const response = await fetch(url, options);

        if (response.status === 401) {
          let message = "GitHub authentication failed.";

          try {
            const data = await response.clone().json();
            if (data.message === "Bad credentials") {
              message = "GitHub authentication failed: bad credentials.";
            }
          } catch {}

          throw createHttpError(message, 401);
        }

        return response;
      }
    }
  });
};
