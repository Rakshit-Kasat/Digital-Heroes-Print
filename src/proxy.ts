/**
 * Proxy (Next 16's name for middleware). Runs before matching requests to
 * refresh the Supabase session cookie, and turns signed-out visitors away
 * from private areas early. It is a convenience, not the security boundary:
 * pages re-check with requireUser/requireAdmin and RLS guards the data.
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isPrivate = ["/account", "/admin", "/design", "/checkout"].some((p) => path === p || path.startsWith(`${p}/`));
  if (isPrivate && !data.user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  // Skip static assets, fonts and the Stripe webhook (it carries no session).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|fonts/|api/stripe/webhook|.*\\.(?:svg|png|jpg|jpeg|webp|ttf|woff2)$).*)"],
};
