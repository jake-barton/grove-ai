import { NextRequest, NextResponse } from 'next/server';

// Routes that require authentication (write operations only)
const PROTECTED_ROUTES: { path: string; methods: string[] }[] = [
  { path: '/api/chat', methods: ['POST'] },
  { path: '/api/companies', methods: ['POST'] },
  { path: '/api/companies/sync', methods: ['POST'] },
  { path: '/api/export', methods: ['POST', 'GET'] },
  { path: '/api/sheets/format', methods: ['POST'] },
];

// Matches /api/companies/[id] PATCH and DELETE
const COMPANY_ID_PATTERN = /^\/api\/companies\/[^/]+$/;

// Internal server-to-server calls (e.g. /api/chat calling /api/companies/[id])
// pass this header so middleware can allow them without a browser cookie.
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET || 'grove-internal-2026';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const method = req.method;

  // Check if this is a protected company/:id route
  const isCompanyIdRoute =
    COMPANY_ID_PATTERN.test(pathname) && (method === 'PATCH' || method === 'DELETE');

  // Check if this matches any other protected route
  const isProtected =
    isCompanyIdRoute ||
    PROTECTED_ROUTES.some(
      (r) => pathname === r.path && r.methods.includes(method),
    );

  if (!isProtected) return NextResponse.next();

  // Allow internal server-to-server calls (e.g. chat route calling companies route)
  const internalHeader = req.headers.get('x-grove-internal');
  if (internalHeader === INTERNAL_SECRET) return NextResponse.next();

  // Allow authenticated browser sessions
  const session = req.cookies.get('grove-session');
  if (session?.value === 'authenticated') return NextResponse.next();

  return NextResponse.json(
    { error: 'Authentication required', code: 'UNAUTHORIZED' },
    { status: 401 },
  );
}

export const config = {
  matcher: ['/api/chat', '/api/companies', '/api/companies/:path*', '/api/export', '/api/sheets/:path*'],
};
