import { NextResponse, type NextRequest } from 'next/server';
import { REQUEST_ID_HEADER, requestIdFrom } from '@/server/http/requestId';

export function proxy(request: NextRequest) {
  const requestId = requestIdFrom(request.headers);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);
  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
