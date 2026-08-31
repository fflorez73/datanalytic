import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const SUPER_ADMIN_HOME = '/admin/dashboard';
const CLIENT_HOME = '/dashboard';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: {
        schema: 'analytics',
      },
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isLoginRoute = pathname.startsWith('/login');
  const isAdminRoute = pathname.startsWith('/admin');
  const isClientDashboardRoute = pathname.startsWith('/dashboard');

  // Sin sesión — solo puede ver /login
  if (!user) {
    if (isLoginRoute) return response;
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Con sesión — leer role desde analytics.profiles
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const role = profile?.role ?? 'client';
  const home = role === 'super_admin' ? SUPER_ADMIN_HOME : CLIENT_HOME;

  // Logueado y en /login — mandar a su panel
  if (isLoginRoute) {
    return NextResponse.redirect(new URL(home, request.url));
  }

  // Cliente intentando entrar al panel de super admin
  if (isAdminRoute && role !== 'super_admin') {
    return NextResponse.redirect(new URL(CLIENT_HOME, request.url));
  }

  // Super admin intentando entrar al panel de cliente
  if (isClientDashboardRoute && role === 'super_admin') {
    return NextResponse.redirect(new URL(SUPER_ADMIN_HOME, request.url));
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
