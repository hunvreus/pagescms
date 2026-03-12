import { NextResponse } from "next/server";

const REPO = "pages-cms/pages-cms";
const PACKAGE_JSON_URL =
  "https://raw.githubusercontent.com/pages-cms/pages-cms/main/package.json";

export async function GET() {
  try {
    const response = await fetch(PACKAGE_JSON_URL, {
      headers: {
        Accept: "application/json",
      },
      next: { revalidate: 3600 },
    });

    if (!response.ok) {
      return NextResponse.json(
        { status: "error", message: "Unable to fetch latest app version." },
        { status: 502 },
      );
    }

    const pkg = (await response.json()) as { version?: string };

    return NextResponse.json({
      status: "success",
      latest: pkg.version ?? null,
      repository: REPO,
      source: "package.json",
    });
  } catch {
    return NextResponse.json(
      { status: "error", message: "Unable to fetch latest app version." },
      { status: 500 },
    );
  }
}
