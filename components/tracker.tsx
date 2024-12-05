"use client";

import { useEffect } from "react";

export function Tracker({
  owner,
  repo,
  branch
}: {
  owner: string,
  repo: string,
  branch: string
}) {
  useEffect(() => {
    fetch("/api/tracker", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        owner,
        repo,
        branch
      }),
    });
  }, [owner, repo, branch]);

  return null;
}