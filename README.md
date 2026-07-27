# CollectiveVoice

Crowd-prioritised Q&A platform with live voting, AI question clustering, real-time WebSockets, and full admin panel.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js (native `http` + `ws`) |
| Database | Prisma ORM → Neon PostgreSQL (prod) / SQLite (dev) |
| Auth | JWT (access + refresh rotation) + Google OAuth |
| NLP | `@xenova/transformers` — MiniLM-L6 sentence embeddings |
| Frontend | Vanilla JS ES modules + CSS (no bundler) |
| Real-time | WebSocket server (native `ws` library) |

---

## Quick Start (Local)

```powershell
# 1. Install dependencies
npm install

# 2. Copy env template and fill in values
Copy-Item .env.example .env
# Edit .env — set DATABASE_URL, JWT_SECRET, SUPERADMIN_EMAIL

# 3. Generate Prisma client and run migrations
npx prisma generate
npx prisma migrate dev

# 4. Seed demo data
npm run db:seed

# 5. Start the dev server
npm run dev
```

Open **http://localhost:3000**  
Admin panel: **http://localhost:3000/admin.html**

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | HTTP port (default: 3000) |
| `NODE_ENV` | Yes | `production` or `development` |
| `DATABASE_URL` | Yes | Neon PostgreSQL connection string |
| `JWT_SECRET` | Yes | Long random string (64+ hex chars) |
| `JWT_EXPIRES` | No | Access token TTL (default: `1h`) |
| `REFRESH_TTL_DAYS` | No | Refresh token TTL in days (default: 30) |
| `SUPERADMIN_EMAIL` | Yes | Email auto-promoted to superadmin on first login |
| `ALLOWED_ORIGINS` | Yes | Comma-separated list of allowed CORS origins |
| `GOOGLE_CLIENT_ID` | No | Google OAuth — omit to disable |
| `GOOGLE_CLIENT_SECRET` | No | Google OAuth secret |
| `GOOGLE_CALLBACK_URL` | No | OAuth redirect URI |
| `NLP_THRESHOLD` | No | Cosine similarity clustering threshold (default: `0.60`) |

---

## NPM Scripts

```bash
npm run dev          # Start server (dev)
npm start            # Start server (prod alias)
npm test             # Run full Jest test suite
npm run test:api     # API regression tests only
npm run db:migrate   # Run Prisma migrations
npm run db:seed      # Seed demo data
npm run db:studio    # Open Prisma Studio
npm run db:reset     # Reset and re-migrate DB
```

---

## Routes

### Frontend SPA (`/#/...`)

| Route | Description |
|---|---|
| `#/splash`, `#/onboarding/*` | Onboarding flow |
| `#/login`, `#/signup`, `#/forgot`, `#/reset` | Auth pages |
| `#/home`, `#/meetings`, `#/activity`, `#/profile` | Dashboard |
| `#/join`, `#/join/scan`, `#/join/preview` | Join a meeting |
| `#/meetings/create/*` | Create meeting flow |
| `#/audience`, `#/moderator`, `#/speaker` | Live session views |
| `#/analytics`, `#/conducted` | Post-meeting reports |

### Admin Panel (`/admin.html#/...`)

Requires `admin` or `superadmin` role.

| Route | Description |
|---|---|
| `#/overview` | Platform-wide stats |
| `#/users` | User management |
| `#/meetings` | All meetings |
| `#/moderation` | Question moderation |
| `#/health` | System health & WS stats |
| `#/audit` | Admin audit log |
| `#/nlp` | NLP config & tester |

---

## Deployment Checklist

- [ ] `NODE_ENV=production` set in environment
- [ ] `JWT_SECRET` set to a unique random 64-byte hex string
- [ ] `DATABASE_URL` points to your Neon (or other Postgres) database
- [ ] `SUPERADMIN_EMAIL` set to your admin email
- [ ] `ALLOWED_ORIGINS` set to your production domain(s)
- [ ] `GOOGLE_CALLBACK_URL` updated to your production domain
- [ ] Prisma migrations applied: `npx prisma migrate deploy`
- [ ] DB seeded (optional): `npm run db:seed`
- [ ] Process manager configured (e.g. PM2, Railway, Render)
