# RYZITE Control Centre

Enterprise Website Content Management System built for the RYZITE company website, featuring Sanity CMS integration (Project `hnm8jy5w`), Google Analytics 4 Data API reporting, structured page block editing, media library management, automated SEO validation, and server-side audit logging.

---

## Architecture Overview

1. **Admin Frontend (`/src`)**: React 19, TypeScript, Tailwind CSS v4, React Router, Recharts.
2. **Secure Server-Side Backend (`/server.ts`, `/server/*`)**:
   - Express server with HttpOnly, `SameSite=Lax` session cookies.
   - `scrypt` salted password hashing + brute-force login rate limiting (5 attempts / 15 min).
   - Server-side SQLite persistence (`data/ryzite-cms.db`) for admin users, sessions, audit logs, and safe staging storage when `SANITY_API_TOKEN` is not configured.
   - Server-side Sanity CMS client (`@sanity/client`) targeting project `hnm8jy5w`.
   - Server-side Google Analytics 4 Data API v1beta integration using RS256 JWT service account authentication.
   - Validated multipart file uploads (`multer`, 10 MB max, MIME whitelist).

---

## Routes

- `/admin/` — Public RYZITE-branded administrator login page (no Vercel SSO).
- `/admin/dashboard/` — Executive overview, CMS inventory, GA4 trend, recent updates & activity.
- `/admin/pages/` — Structured page block editor (H1/H2/H3 hierarchy checks, paragraphs, lists, images, CTAs, live preview).
- `/admin/portfolio/` — Portfolio case studies CMS.
- `/admin/services/` — Services CMS.
- `/admin/solutions/` — Solutions CMS.
- `/admin/team/` — Team directory CMS.
- `/admin/articles/` — Articles & blog CMS.
- `/admin/testimonials/` — Client testimonials CMS.
- `/admin/media/` — Media library with upload, alt text editing, replacement, and delete confirmation.
- `/admin/seo/` — Global SEO configuration, SERP preview, and automated metadata/structure validator.
- `/admin/analytics/` — Google Analytics 4 live reporting (zero fabricated metrics).
- `/admin/activity/` — Searchable, filterable, paginated server-side audit log.
- `/admin/settings/` — Administrator profile, password change, session policy, and live integration health.

---

## Installation & Local Development

```bash
npm install
cp .env.example .env
# Edit .env with your credentials
npm run dev
```

Open `http://localhost:3000/admin/` in your browser.

### Initial Administrator Provisioning

On first boot, if no administrator exists in `data/ryzite-cms.db`, the server provisions the initial `super_admin` account from:
- `ADMIN_USERNAME` (default in dev: `admin`)
- `ADMIN_PASSWORD` (default in dev: `RyziteAdmin2026!` — change immediately in `/admin/settings/` or via `.env`)
- `ADMIN_NAME` / `ADMIN_EMAIL`

### Resetting Forgotten Admin Credentials

Updating `.env` alone will not overwrite an already-provisioned account in `data/ryzite-cms.db`. To securely reset the administrator username and password without affecting CMS content, media, audit logs, or Sanity data, run the server-side CLI utility:

```bash
npm run admin:reset
```

The script prompts interactively (with masked password input), hashes the new password with `scrypt` and a fresh salt, revokes all prior sessions, clears login rate-limit locks, and records an audit log entry. For headless/CI shells, you can alternatively pass `RESET_ADMIN_USERNAME` and `RESET_ADMIN_PASSWORD` as one-shot environment variables to `npm run admin:reset`.

---

## Sanity CMS Integration (`hnm8jy5w`)

- Existing production content in dataset `production` is **never mutated** during initial setup.
- Set `SANITY_DATASET="staging"` and supply a server-side `SANITY_API_TOKEN` with Editor permissions in `.env` to test live writes safely against a staging dataset before promoting to `production`.
- Never prefix `SANITY_API_TOKEN` with `VITE_`.

---

## Google Analytics 4 Setup

1. Enable the **Google Analytics Data API** in Google Cloud Console.
2. Create a Service Account and grant its email **Viewer** access to your GA4 property.
3. Configure `GA4_PROPERTY_ID`, `GA4_CLIENT_EMAIL`, and `GA4_PRIVATE_KEY` in server environment variables.
4. When unconfigured, the dashboard honestly reports the missing variables without displaying fabricated numbers.

---

## GitHub & Deployment Workflow

Target repository: `https://github.com/Nisla1234/ryzite-website-development`

1. Create an isolated feature branch before pushing:
   ```bash
   git checkout -b feat/ryzite-control-centre
   ```
2. Verify `.env`, `data/`, and `uploads/` are ignored by `.gitignore`.
3. Build for production:
   ```bash
   npm run build
   npm start
   ```
4. **Vercel / Astro / Cloudflare Compatibility Note**:
   - If the existing RYZITE public site is deployed on **Astro + Cloudflare Pages**, host RYZITE Control Centre as a dedicated Node/Vercel service mapped to `/admin/*` via Cloudflare/Vercel rewrites or a subdomain (`cms.ryzite.com`), keeping the public Astro site's build pipeline untouched.
   - Disable **Vercel Deployment Protection / SSO** on the `/admin/` public login route so visitors see the RYZITE login screen rather than a Vercel SSO gate; all dashboard routes and `/api/*` endpoints remain protected by RYZITE's own HttpOnly session middleware.
