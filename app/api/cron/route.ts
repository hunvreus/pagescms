import { NextResponse } from "next/server";
import { db } from "@/db";
import { cacheFileTable, cachePermissionTable } from "@/db/schema";
import { lt } from "drizzle-orm";

export const runtime = "edge";

export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  
  try {
    // Delete expired cache_file entries (default 7 days)
    const fileCacheTTL = parseInt(process.env.FILE_CACHE_TTL || "10080") * 60 * 1000;
    const fileExpiryDate = new Date(Date.now() - fileCacheTTL);
    await db.delete(cacheFileTable)
      .where(lt(cacheFileTable.lastUpdated, fileExpiryDate));

    // Delete expired cache_permission entries (default 1 hour)
    const permissionCacheTTL = parseInt(process.env.PERMISSION_CACHE_TTL || "60") * 60 * 1000;
    const permissionExpiryDate = new Date(Date.now() - permissionCacheTTL);
    await db.delete(cachePermissionTable)
      .where(lt(cachePermissionTable.lastUpdated, permissionExpiryDate));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error cleaning up cache:", error);
    return NextResponse.json({ error: "Failed to clean up cache" }, { status: 500 });
  }
} 