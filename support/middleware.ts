import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

// Only /my-tickets (and any sub-paths) requires authentication.
// All other routes — guides, search, status, etc. — are public.
const isProtected = createRouteMatcher(['/my-tickets(.*)'])

export default clerkMiddleware((auth, req) => {
  if (isProtected(req)) auth().protect()
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
