import { type NextRequest } from 'next/server';

type RouteContext = {
  params: Promise<{ path?: string[] }>;
};

function getUpstreamBaseUrl(): string {
  // Prefer a non-public server-only env var, but fall back to existing config.
  // This value can be plain HTTP even when the site is served over HTTPS.
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
  const upstreamUrl = `${upstreamBase}/${path.join('/')}${incomingUrl.search}`;

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
  // Ensure browsers don't cache auth-protected proxied responses by default.
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
