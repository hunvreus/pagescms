import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function isAllowedOrigin(originHeader: string, hostHeader: string): boolean {
	try {
		const originUrl = new URL(originHeader);
		return originUrl.host.toLowerCase() === hostHeader.toLowerCase();
	} catch {
		return false;
	}
}

export function proxy(request: NextRequest) {
	if (request.method === "GET") {
		return NextResponse.next();
	}
	const originHeader = request.headers.get("Origin");
	const hostHeader = request.headers.get("Host");
	if (!originHeader || !hostHeader || !isAllowedOrigin(originHeader, hostHeader)) {
		return new NextResponse(null, {
			status: 403
		});
	}
	return NextResponse.next();
}

export const config = {
  matcher: "/api/:path((?!webhook).*)"
}
