# StartupForge — Server

Express + MongoDB API for **StartupForge**, the startup team-builder platform. Handles authentication (Better Auth + a JWT challenge layer), startups, opportunities, applications, Stripe payments, and admin moderation.

## Tech Stack
- **Express 4** (ESM)
- **MongoDB** (native `mongodb` driver)
- **Better Auth** — email/password + Google, mapped onto the `users` collection
- **JWT** — issued after login, stored in an HTTPOnly cookie, verified by middleware
- **Stripe Checkout** — founder premium package

## Getting Started

```bash
npm install
cp .env.example .env   # then fill in real values
npm run dev            # http://localhost:5000
```

Seed the admin account (registration only offers Founder/Collaborator):

```bash
npm run seed:admin
```

## Environment Variables
See [.env.example](.env.example). Key ones: 
- `MONGODB_URI`, `DB_NAME`
- `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`
- `CLIENT_ORIGIN` (must include your frontend URL, e.g., `http://localhost:3000`)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `JWT_SECRET`
- `STRIPE_SECRET_KEY`, `PREMIUM_PRICE_CENTS`
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`

## Auth Flow
1. Client registers/logs in via Better Auth (`/api/auth/*`) — sets a Better Auth session cookie.
2. Client calls `POST /api/jwt` — server reads the session, signs a JWT, sets an **HTTPOnly** `access_token` cookie.
3. Protected routes use `verifyToken` + `requireRole(...)` middleware.
4. The Next.js frontend reads the `access_token` cookie in `middleware.js` to protect dashboard routes during SSR.

## API Overview

| Area | Routes |
|------|--------|
| Auth | `/api/auth/*` (Better Auth), `POST /api/jwt`, `POST /api/jwt/logout` |
| Startups | `GET /api/startups`, `GET /api/startups/:id`, `GET /mine`, `GET /all`, `POST`, `PUT /:id`, `DELETE /:id`, `PATCH /:id/approve` |
| Opportunities | `GET /api/opportunities` (search/filter/paginate), `GET /filters`, `GET /:id`, `GET /mine`, `POST`, `PUT /:id`, `DELETE /:id` |
| Applications | `POST /api/applications`, `GET /mine`, `GET /founder`, `PATCH /:id/status` |
| Payments | `POST /api/payments/create-checkout-session`, `POST /confirm`, `GET /mine`, `GET /` (admin) |
| Users | `GET /api/users/me`, `PATCH /me`, `GET /` (admin), `PATCH /:id/block` |
| Stats | `GET /api/stats/founder`, `/collaborator`, `/admin` |

## Challenge Requirements
- **Search** — `$regex` on `role_title` + `required_skills` (`GET /api/opportunities?search=`)
- **Filter** — `$in` on `work_type` and `industry` (`industry` via `$lookup` to startups)
- **JWT** — generation, HTTPOnly cookie, verify middleware, protected dashboard APIs
- **Pagination** — server-side, `$facet` for page slice + total (`?page=&limit=`)

## Collections
`users`, `startups`, `opportunities`, `applications`, `payments`.

## License
MIT
