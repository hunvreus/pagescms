import { redirect } from "next/navigation";

export default async function Page(
  props: Readonly<{
    params: Promise<{ owner: string; repo: string; branch: string }>;
  }>,
) {
  const params = await props.params;
  redirect(`/${params.owner}/${params.repo}/${encodeURIComponent(params.branch)}/configuration`);
}
