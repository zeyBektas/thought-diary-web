# Thought Diary Web

Next.js App Router frontend for the Thought Diary NestJS API.

## Development

```bash
npm install
cp .env.example .env.local
npm run dev
```

The backend API base URL is configured with `NEXT_PUBLIC_API_BASE_URL` and defaults to `http://localhost:5001` in the API client when it is not set.

## Structure

- `app/` — App Router routes and global styles
- `components/` — reusable UI, including shadcn/ui components
- `lib/api/` — typed functions for the verified backend endpoints
- `schemas/` — Zod validation schemas shared by forms and API boundaries
- `types/` — frontend representations of backend response data

## Authentication

The login and registration flows store the short-lived access token, rotated refresh token, and safe user data in `sessionStorage`, scoped to the browser tab. Authenticated API calls send the access token as a bearer token and coordinate a single refresh request when the API returns `401`.

HttpOnly refresh-token cookies would provide stronger XSS protection, but would require backend cookie support and credentialed CORS. That backend redesign is intentionally outside this frontend-only flow.
# thought-diary-web
