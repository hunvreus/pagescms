/**
 * Create an Octokit instance that wraps the requests with a check for credentials
 * to surface revoked/lost access (401 Bad credentials).
 */

import { Octokit } from "octokit";

export const createOctokitInstance = (token: string, options?: any) => {
  if (!token) throw new Error("Auth token is required to initialize Octokit");

  return new Octokit({
    ...options,
    auth: token,
    request: {
      fetch: async (url: string, options: RequestInit) => {
        try {
          const response = await fetch(url, options);
          
          // Only attempt to log out on a 401 status
          if (response.status === 401) {
            try {
              const data = await response.json();
              if (data.message === "Bad credentials") {
                throw new Error("GitHub authentication failed: bad credentials.");
              }
            } catch (parseError) {
              // If we can't parse the JSON, just continue
              console.warn("Could not parse 401 response:", parseError);
            }
            throw new Error("GitHub authentication failed.");
          }
          
          // Always return the original response regardless of status
          return response;
        } catch (error) {
          throw error;
        }
      }
    }
  });
};
