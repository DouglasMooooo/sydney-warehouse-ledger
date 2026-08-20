import { NextResponse } from 'next/server';
import { sessionCookieName } from '../../../../src/auth/session';

export async function POST(request: Request) {
  const runtime = process.env.NODE_ENV === 'production' ? 'production' : 'development';
  const response = NextResponse.redirect(new URL('/', request.url));
  response.cookies.delete(sessionCookieName(runtime));
  return response;
}
