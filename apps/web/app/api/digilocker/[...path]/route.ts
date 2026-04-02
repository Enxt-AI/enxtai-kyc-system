import { type NextRequest } from 'next/server';

type RouteContext = {
  params: Promise<{ path?: string[] }>;
};

function getUpstreamBaseUrl(): string {
  return (
    process.env.API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:5001'
  );
}

async function proxy(request: NextRequest, context: RouteContext) {
  const { path = [] } = await context.params;
  const upstreamBase = getUpstreamBaseUrl().replace(/\/+$/, '');

  const incomingUrl = new URL(request.url);
  // Prepend api/digilocker because the path captured by Next.js starts after digilocker
  const upstreamUrl = `${upstreamBase}/api/digilocker/${path.join('/')}${incomingUrl.search}`;

  const headers = new Headers(request.headers);

  // Avoid forwarding hop-by-hop headers.
  headers.delete('connection');
  headers.delete('host');
  headers.delete('content-length');

  const method = request.method;
  const body = method === 'GET' || method === 'HEAD' ? undefined : await request.arrayBuffer();

  const upstreamResponse = await fetch(upstreamUrl, {
    method,
    headers,
    body,
    redirect: 'manual',
  });

  const responseHeaders = new Headers(upstreamResponse.headers);
  if (!responseHeaders.has('cache-control')) {
    responseHeaders.set('cache-control', 'no-store');
  }

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: responseHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
