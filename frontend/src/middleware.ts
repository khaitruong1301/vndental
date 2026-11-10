import { NextResponse, type NextRequest } from 'next/server';

// Chưa có cookie đăng nhập → chuyển về /login (API tự kiểm tra token)
export function middleware(req: NextRequest) {
  const loggedIn = req.cookies.has('clinic_token');
  const isLogin = req.nextUrl.pathname === '/login';
  if (!loggedIn && !isLogin) {
    const url = new URL('/login', req.url);
    url.searchParams.set('next', req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }
  if (loggedIn && isLogin) return NextResponse.redirect(new URL('/', req.url));
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next|favicon.ico|icon.svg).*)'],
};
