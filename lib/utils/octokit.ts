/**
 * Create an Octokit instance that wraps the requests with a check for credentials
 * to log out the user if they revoked/lost access.
 */

import { Octokit } from "octokit";
import { handleSignOut } from "@/lib/actions/auth";

export const createOctokitInstance = (token: string) => {
  if (!token) throw new Error("Auth token is required to initialize Octokit");

  return new Octokit({
    auth: token,
    request: {
      fetch: async (url: string, options: RequestInit) => {
        try {
          const response = await fetch(url, options);
          if (response.status === 401) {
            const data = await response.json();
            if (data.message === "Bad credentials") {
              // If the user revoke access, we sign them out
              // TODO: fix that for layouts AND figure out how to catch error coming from data fetching in components
              await handleSignOut();
            }
          }
          return response;
        } catch (error) {
          throw error;
        }
      }
    }
  });
};