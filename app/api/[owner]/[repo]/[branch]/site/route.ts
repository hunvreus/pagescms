export const maxDuration = 30;

import { getConfig } from "@/lib/config-store";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ owner: string, repo: string, branch: string }> },
) {
  try {
    const params = await context.params;
    const config = await getConfig(params.owner, params.repo, params.branch, {
      bootstrapOnMiss: false,
    });

    const contentItems = Array.isArray(config?.object?.content)
      ? config.object.content
      : [];

    const create = contentItems
      .filter((item: Record<string, unknown>) =>
        item?.type === "collection" && typeof item.name === "string"
      )
      .map((item: Record<string, unknown>) => ({
        name: String(item.name),
        label: typeof item.label === "string" && item.label.length > 0
          ? item.label
          : String(item.name),
        href: `/${encodeURIComponent(config?.owner || params.owner.toLowerCase())}/${encodeURIComponent(config?.repo || params.repo.toLowerCase())}/${encodeURIComponent(params.branch)}/collection/${encodeURIComponent(String(item.name))}/new`,
      }));

    const routes = contentItems
      .filter((item: Record<string, unknown>) =>
        typeof item?.name === "string"
        && typeof item?.type === "string"
        && typeof item?.site === "object"
        && typeof (item.site as Record<string, unknown>)?.path === "string"
      )
      .map((item: Record<string, unknown>) => ({
        name: String(item.name),
        label: typeof item.label === "string" && item.label.length > 0
          ? item.label
          : String(item.name),
        type: String(item.type),
        contentPath: typeof item.path === "string" ? item.path : "",
        filename: typeof item.filename === "string" ? item.filename : null,
        extension: typeof item.extension === "string" ? item.extension : "",
        sitePath: String((item.site as Record<string, unknown>).path),
      }));

    return Response.json(
      {
        status: "success",
        data: {
          create,
          routes,
        },
      },
      {
        headers: {
          ...CORS_HEADERS,
          "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
        },
      },
    );
  } catch (error) {
    console.error(error);
    return Response.json(
      {
        status: "error",
        error: error instanceof Error ? error.message : "Failed to load site actions.",
      },
      {
        status: 500,
        headers: CORS_HEADERS,
      },
    );
  }
}
