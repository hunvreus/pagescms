import Link from "next/link";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { accountTable } from "@/db/schema";
import { MainRootLayout } from "../main-root-layout";
import { Installations } from "@/components/settings/installations";
import { Identities } from "@/components/settings/identities";
import { Profile } from "@/components/settings/profile";
import { DocumentTitle } from "@/components/document-title";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardHeader, CardDescription, CardContent, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export default async function Page() {
  const session = await auth.api.getSession({ headers: await headers() });
  const user = session?.user;
  if (!user) throw new Error("User not found");
  const githubAccount = await db.query.accountTable.findFirst({ where: and(eq(accountTable.userId, user.id), eq(accountTable.providerId, "github")) });
  const githubConnected = Boolean(githubAccount);
  const githubManageUrl = process.env.GITHUB_APP_CLIENT_ID ? `https://github.com/settings/connections/applications/${process.env.GITHUB_APP_CLIENT_ID}` : null;
  return (
    <MainRootLayout>
      <DocumentTitle title="设置" />
      <div className="max-w-screen-sm mx-auto p-4 md:p-6 space-y-6">
        <Link className={cn(buttonVariants({ variant: "outline", size: "xs" }), "inline-flex")} href="/"><ArrowLeft />返回首页</Link>
        <header className="flex items-center mb-6"><h1 className="font-semibold tracking-tight text-lg md:text-2xl">设置</h1></header>
        <div className="flex flex-col relative flex-1 space-y-6">
          <Profile name={user.name} email={user.email} githubUsername={user.githubUsername} />
          <Card><CardHeader><CardTitle>身份验证</CardTitle><CardDescription>管理你的登录方式和已关联的身份提供商。</CardDescription></CardHeader><CardContent><Identities email={user.email} githubConnected={githubConnected} githubUsername={user.githubUsername} githubManageUrl={githubManageUrl} /></CardContent></Card>
          {githubConnected && <Card><CardHeader><CardTitle className="text-base md:text-lg">已安装的应用</CardTitle><CardDescription>管理已安装 GitHub 应用的账户。</CardDescription></CardHeader><CardContent><Installations /></CardContent></Card>}
        </div>
      </div>
    </MainRootLayout>
  );
}
