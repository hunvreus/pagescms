import { cache } from "react";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

const getServerSession = cache(async () => {
  return auth.api.getSession({
    headers: await headers(),
  });
});

export { getServerSession };
