import "server-only";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { createHttpError } from "@/lib/api-error";
import type { User } from "@/types/user";

const getAdminEmails = () => {
  return new Set(
    (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
};

const isBootstrapAdminEmail = (email: string | null | undefined) => {
  if (!email) return false;
  return getAdminEmails().has(email.trim().toLowerCase());
};

const hasAdminAccess = (user: Pick<User, "email"> | null | undefined) => {
  return Boolean(user && isBootstrapAdminEmail(user.email));
};

const requireAdminSession = async () => {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  const user = session?.user;

  if (!user) {
    throw createHttpError("Not signed in.", 401);
  }

  if (!hasAdminAccess(user)) {
    throw createHttpError("Admin access required.", 403);
  }

  return { session, user };
};

export {
  getAdminEmails,
  hasAdminAccess,
  isBootstrapAdminEmail,
  requireAdminSession,
};
