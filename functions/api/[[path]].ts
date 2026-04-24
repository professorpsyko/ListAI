// Cloudflare Pages Function: catch-all /api/* proxy to Railway backend.
// Replaces the Vercel `rewrites` in the old vercel.json.

const BACKEND_ORIGIN = 'https://listai-production-cd9f.up.railway.app'

export const onRequest: PagesFunction = async ({ request, params }) => {
  const url = new URL(request.url)
  const pathSegments = (params.path as string[] | undefined) || []
  const backendPath = '/api/' + pathSegments.join('/')
  const target = BACKEND_ORIGIN + backendPath + url.search

  // Clone headers, strip hop-by-hop + host + origin
  // This is a server-side proxy — the browser's Origin header is irrelevant to the backend
  // and was triggering CORS rejection since the backend only allowed .vercel.app domains.
  const headers = new Headers(request.headers)
  headers.delete('host')
  headers.delete('origin')
  headers.delete('cf-connecting-ip')
  headers.delete('cf-ray')
  headers.delete('cf-visitor')

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: 'manual',
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body
    // Required by some CF runtimes when streaming a body
    ;(init as unknown as { duplex: string }).duplex = 'half'
  }

  const response = await fetch(target, init)

  // Rewrite set-cookie domains if needed — usually not necessary here since
  // both frontend and backend use HTTPS and cookies are scoped correctly.
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })
}
