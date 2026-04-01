import { NextResponse } from "next/server";

export const GET = async () => {
  const appName = process.env.GITHUB_APP_NAME?.trim();

  if (!appName) {
    return NextResponse.json(
      { status: "error", message: "Missing GITHUB_APP_NAME." },
      { status: 500 },
    );
  }

  return NextResponse.redirect(
    `https://github.com/apps/${appName}/installations/new`,
  );
};
