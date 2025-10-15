import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(request: NextRequest) {
  // Vérifie si l'utilisateur a un token next-auth
  const token = await getToken({ 
    req: request, 
    secret: process.env.NEXTAUTH_SECRET 
  });

  const { pathname } = request.nextUrl;

  // Routes qui nécessitent une authentification
  const protectedRoutes = ['/dashboard'];
  const isProtectedRoute = protectedRoutes.some(route => 
    pathname.startsWith(route)
  );

  if (isProtectedRoute) {
    // Si l'utilisateur n'a pas de token next-auth, 
    // on laisse le système Express gérer l'authentification
    if (!token) {
      // On peut ajouter un header pour indiquer qu'il n'y a pas de session next-auth
      const response = NextResponse.next();
      response.headers.set('x-no-nextauth-session', 'true');
      return response;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Exclut les routes suivantes du middleware :
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - auth (routes d'authentification)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|auth).*)',
  ],
};