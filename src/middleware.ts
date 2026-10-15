import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, signSession, verifySession, timeoutMinutes } from "@/lib/jwt";

// Sliding session timeout: every request with a valid session re-issues the cookie.
export async function middleware(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);
  const { pathname } = req.nextUrl;

  if (!session) {
    if (pathname.startsWith("/app")) return NextResponse.redirect(new URL("/login?expired=1", req.url));
    if (pathname.startsWith("/platform") && pathname !== "/platform/login")
      return NextResponse.redirect(new URL("/platform/login", req.url));
    return NextResponse.next();
  }

  // Expose the path to server layouts (used to force a first-login password change).
  const headers = new Headers(req.headers);
  headers.set("x-pathname", pathname);
  const res = NextResponse.next({ request: { headers } });
  const { sub, kind, tid, role } = session;
  res.cookies.set(SESSION_COOKIE, await signSession({ sub, kind, tid, role }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: timeoutMinutes() * 60,
  });
  return res;
}

export const config = { matcher: ["/app/:path*", "/platform/:path*", "/api/:path*"] };
