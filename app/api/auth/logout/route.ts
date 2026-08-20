import { NextResponse } from 'next/server';
import { sessionCookieName } from '../../../../src/auth/session';
import { sessionCookieOptions } from '../../../../src/auth/session';

export async function POST(request: Request) {
  const runtime = process.env.NODE_ENV === 'production' ? 'production' : 'development';
  const response = NextResponse.redirect(new URL('/', request.url));
  response.cookies.set(sessionCookieName(runtime), '', { ...sessionCookieOptions(runtime), maxAge: 0 });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
