import { InviteSignIn } from "@/components/invite-sign-in";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token?.trim()) {
    return (
      <Empty className="absolute inset-0 border-0 rounded-none">
        <EmptyHeader>
          <EmptyTitle>Invite unavailable</EmptyTitle>
          <EmptyDescription>This invitation link is invalid.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return <InviteSignIn token={token.trim()} />;
}
