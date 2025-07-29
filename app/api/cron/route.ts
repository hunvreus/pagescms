import { NextResponse } from "next/server";
import { db } from "@/db";
import { cacheFileTable, cachePermissionTable } from "@/db/schema";
import { lt, sql } from "drizzle-orm";

export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  
  try {
    console.log("Cron job started: Cleaning up cache.");

    // Delete expired cache_file entries (default 7 days)
    const fileCacheTTL = parseInt(process.env.FILE_CACHE_TTL || "10080") * 60 * 1000;
    const fileExpiryDate = new Date(Date.now() - fileCacheTTL);
    const deletedFiles = await db.delete(cacheFileTable)
      .where(lt(cacheFileTable.lastUpdated, fileExpiryDate)).returning();
    console.log(`Deleted ${deletedFiles.length} expired file cache entries.`);

    // Delete expired cache_permission entries (default 1 hour)
    const permissionCacheTTL = parseInt(process.env.PERMISSION_CACHE_TTL || "60") * 60 * 1000;
    const permissionExpiryDate = new Date(Date.now() - permissionCacheTTL);
    const deletedPermissions = await db.delete(cachePermissionTable)
      .where(lt(cachePermissionTable.lastUpdated, permissionExpiryDate)).returning();
    console.log(`Deleted ${deletedPermissions.length} expired permission cache entries.`);

    // Run VACUUM on the tables we just cleaned up
    console.log("Running VACUUM on cache_file.");
    await db.execute(sql`VACUUM cache_file`);
    console.log("Running VACUUM on cache_permission.");
    await db.execute(sql`VACUUM cache_permission`);
    console.log("VACUUM commands executed.");

    return NextResponse.json({ success: true, deletedFiles: deletedFiles.length, deletedPermissions: deletedPermissions.length });
  } catch (error) {
    console.error("Error cleaning up cache:", error);
    return NextResponse.json({ error: "Failed to clean up cache" }, { status: 500 });
  }
} 