import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { collaboratorTable, userTable } from "@/db/schema";
import type { User } from "@/types/user";

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const collaboratorMatchesUser = (user: Pick<User, "id" | "email">) => (
  or(
    eq(collaboratorTable.userId, user.id),
    and(
      isNull(collaboratorTable.userId),
      sql`lower(${collaboratorTable.email}) = lower(${user.email})`,
    ),
  )
);

const collaboratorMatchesUserForRepo = (
  user: Pick<User, "id" | "email">,
  owner: string,
  repo: string,
) => (
  and(
    collaboratorMatchesUser(user),
    sql`lower(${collaboratorTable.owner}) = lower(${owner})`,
    sql`lower(${collaboratorTable.repo}) = lower(${repo})`,
  )
);

const collaboratorMatchesInvite = (email: string, owner: string, repo: string) => (
  and(
    sql`lower(${collaboratorTable.email}) = lower(${email})`,
    sql`lower(${collaboratorTable.owner}) = lower(${owner})`,
    sql`lower(${collaboratorTable.repo}) = lower(${repo})`,
  )
);

const findVerifiedUserByEmail = async (email: string) => {
  return db.query.userTable.findFirst({
    where: and(
      sql`lower(${userTable.email}) = lower(${normalizeEmail(email)})`,
      eq(userTable.emailVerified, true),
    ),
  });
};

const bindCollaboratorInvitesToUser = async (user: Pick<User, "id" | "email" | "emailVerified">) => {
  if (!user.emailVerified) return;

  await db
    .update(collaboratorTable)
    .set({ userId: user.id })
    .where(
      and(
        isNull(collaboratorTable.userId),
        sql`lower(${collaboratorTable.email}) = lower(${normalizeEmail(user.email)})`,
      ),
    );
};

export {
  bindCollaboratorInvitesToUser,
  collaboratorMatchesInvite,
  collaboratorMatchesUser,
  collaboratorMatchesUserForRepo,
  findVerifiedUserByEmail,
  normalizeEmail,
};
