# ZendX Social

A personal social publishing workspace built with **React + Vite**, **Node.js + Express**, and **Supabase PostgreSQL**. React builds the interface; Vite handles development and builds; Express serves the API and production app. PHP, Apache, and local MySQL are no longer required.

## Run locally

Use Node.js 22.12+ (Node 24 LTS recommended) and a Supabase project. Add your **Session pooler** connection string from Supabase Dashboard > Connect to the server-only `.env` file:

```dotenv
DATABASE_URL=postgresql://postgres.PROJECT_REF:ENCODED_PASSWORD@POOLER_HOST:5432/postgres
APP_TIMEZONE=Africa/Lagos
DB_SSL=true
```

Copy the actual host/user from Supabase; do not use the placeholders above literally. Percent-encode special characters in the password. Use port 5432 (Session pooler) or a direct connection, rather than the transaction pooler on port 6543: the worker needs session advisory locks. TLS certificate verification stays enabled. Set `DB_SSL_CA_FILE` to Supabase's downloaded CA certificate path if your environment needs it. See [Supabase setup](SUPABASE.md) for full instructions.

```sh
npm install
npm run db:check
npm run db:setup
npm run dev
```

Open **http://localhost:5173**. Vite proxies `/api` and `/uploads` to Express on port 3001. Use the same hostname throughout login and OAuth. Recovered/imported user records retain password compatibility, including PHP bcrypt `$2y$` hashes. Existing MySQL records are not automatically copied to Supabase.

The local `.env` retains existing provider/SMTP settings and has an empty `DATABASE_URL` slot ready for your Supabase connection. If starting elsewhere, copy `.env.example` and generate a random `SESSION_SECRET` of at least 32 characters. Never commit `.env` or put database credentials in a `VITE_*` variable.

`db:check` performs a read-only connection/schema check. Before setup it may report that the connection works but the schema is missing. `db:setup` applies `database/supabase.sql` transactionally and preserves existing application records. It creates a private `zendx` schema with RLS on every table and no access for Supabase browser/API roles. In Supabase's Table Editor, select the `zendx` schema. Connect the Node backend as the schema owner (the Dashboard's default postgres connection). Do not expose this schema through the public Data API.

The previous MySQL schema is retained as `database/legacy-mysql.sql` for recovery reference only. Do not run it on Supabase. Your damaged local MySQL data is untouched; recovering and importing those records is a separate step.

For a fresh database, register an editor through the app. To create an administrator on an empty database, set `ADMIN_EMAIL`, `ADMIN_NAME`, and an `ADMIN_PASSWORD` of at least 12 characters before setup. There is no default password. Each user sees only their own social accounts, posts, delivery results, comments, and analytics. Editors and admins have the same content tools within their own login. Existing accounts from the older shared schema are not assigned to an arbitrary user; their owners must reconnect them.

## Connect and choose where to post

1. Sign up or log in to ZendX. New users are taken to Social Accounts.
2. Choose a platform and click **Connect**. The browser opens that platform's authorization page.
3. Sign in (or use the separate **Sign up** link to create an account on the platform) and approve access. The provider controls its own login, consent, and signup experience.
4. After a successful callback, the account appears in your dashboard as **Connected**, with **Active for posting** enabled. Expired connections show **Reconnect required**.
5. Open Create Post, check only the active accounts that should receive it, then publish or schedule. No accounts are preselected on new posts.

The Social Accounts screen lets users pause/reactivate their own connections. Paused/expired accounts cannot be selected for new deliveries. Pausing an account makes its pending deliveries fail when the worker processes them; a delivery already being sent may complete. Reconnect refreshes the same user's remote identity without deleting delivery history. Another user's authorization never overwrites your tokens.

All provider client IDs/secrets are configured once by the application owner in `.env`; users never need developer credentials. Missing integrations display **Coming soon** rather than a broken Connect link. Facebook connects managed Pages; Instagram currently requires a professional account linked to a Facebook Page. TikTok account connection is supported, while direct publishing remains unavailable and TikTok is excluded from the post selector.

## Publishing worker

The worker performs real publishing to configured accounts. It runs separately from the web server, matching the old cron workflow.

```sh
npm run worker        # One batch, up to 50 deliveries
npm run worker:watch  # Batches every 60 seconds until stopped
```

Alternatively schedule `node /absolute/path/to/server/worker.js` every minute, with the project as working directory so dotenv finds `.env`. Drafts are excluded. “Publish now” queues an immediate scheduled post. A database lock prevents overlapping workers; row locks coordinate edits and deliveries. Results and errors are stored per account and parent post statuses are updated. Only failed deliveries can be retried.

A platform may accept a request immediately before a timeout or process/database failure. Exactly-once publishing cannot be guaranteed. Verify the remote channel before retrying an uncertain delivery. Failures are not retried automatically.

Schedules use `APP_TIMEZONE=Africa/Lagos` by default (Africa/Lagos). The composer identifies the server-time convention. Schedules are local database datetimes, not browser UTC conversions.

## Integrations

Configure server-only credentials in `.env`. Register the exact callback URLs in each provider console:

```text
http://localhost:5173/api/oauth/facebook/callback
http://localhost:5173/api/oauth/instagram/callback
http://localhost:5173/api/oauth/twitter/callback
http://localhost:5173/api/oauth/linkedin/callback
http://localhost:5173/api/oauth/tiktok/callback
```

Use a public HTTPS `APP_URL` in production. Providers may require HTTPS in development too. These replace PHP callback URLs. App products, scopes, review, account types, and publishing permissions must be configured with each provider. Live publishing has not been validated against real accounts during this migration.

| Platform | Implemented | Limitations |
|---|---|---|
| Facebook | Page OAuth, text/photo/video delivery, comment retrieval | Page publishing permissions required |
| Instagram | Facebook-linked business OAuth, image delivery, comments | Video/Reels not implemented |
| X / Twitter | OAuth with S256 PKCE, text delivery, conversation replies | Media upload not implemented; API tier applies |
| LinkedIn | OpenID connection and text Posts API delivery | Set an enabled `LINKEDIN_API_VERSION` (YYYYMM); no media or comments |
| TikTok | OAuth account connection | Direct publishing disabled pending creator privacy/consent UI and app approval; no comments |

Uploads retain the original 5MB limit, with MIME/signature validation added. Set `PUBLIC_MEDIA_ORIGIN` to a public HTTPS origin so providers can download uploads. Localhost media is not accessible to social platforms. Unsupported media combinations fail explicitly instead of silently discarding attachments.

Expired accounts require reconnection. Refresh tokens are retained but automatic refresh is not implemented. Tokens remain server-side in the legacy database format; at-rest encryption is not included. Reconnection updates stable remote identities without deleting delivery history.

## Preserved workflows

- Registration, login/logout, password changes, one-hour emailed password resets. PostgreSQL-backed HttpOnly sessions, CSRF checks, session rotation at login, and rate limiting protect authentication.
- SMTP email uses Nodemailer. Configure `SMTP_*`; reset tokens are never returned in an API response.
- Internal comments are labeled **notes**, preserving local-only behavior. They are not sent to social platforms.
- Comment sync retrieves up to 50 comments per recent eligible delivery and saves new comments locally. Provider failures are shown. Historical pagination is not implemented.
- Analytics shows stored impressions, clicks, and engagements. Automated metric collection remains unimplemented, as in the PHP project.
- Campaign, chat, and calendar-event tables are retained. Campaign/chat workflows were not implemented in PHP and remain absent. Calendar events derive from post schedules.
- Workspace responses include the latest 500 posts, 1,000 deliveries, and 200 comments. Server pagination remains future work for larger installations.

## Checks and production

### Vercel deployment

The repository includes `vercel.json` and `api/index.js`: Vite builds the frontend, and `/api/*` runs the Express app as a Node function. Other page URLs fall back to the frontend. Deploy the repository root, not just `dist`.

In Vercel Project Settings > Environment Variables, set these for the deployment environment you use, then redeploy:

- `DATABASE_URL`: your Supabase Session pooler connection string on port 5432.
- `SESSION_SECRET`: a stable random secret of at least 32 characters, not the example value.
- `APP_URL`: your deployed HTTPS origin, for example `https://your-app.vercel.app`.
- `DB_SSL`: `true`.
- `APP_TIMEZONE`: `Africa/Lagos` (optional; this is the default).
- Provider and SMTP credentials when those features are enabled.

Do not copy a Windows `DB_SSL_CA_FILE` path into Vercel. Leave that variable unset there: the function uses the bundled `database/prod-ca-2021.crt`. Local `.env` files are not deployed. Run `npm run db:setup` locally against the target database if its schema has not been initialized.

After deployment, open `/api/health` and confirm it returns JSON with `status: "ok"`; `/api/session` should return JSON too. If initialization fails, the function returns a JSON 503 with a reference you can locate in Vercel runtime logs. Update social provider callback URLs to use the deployed origin.

Vercel does not provide persistent local upload storage or a continuously running publishing worker. File uploads still require migration to object storage before use on Vercel; run the existing worker on a separate persistent host or scheduler. Sign-in and database-backed workspace features use the deployed API.

```sh
npm test
npm run test:db
npx playwright install chromium
npm run test:ui
npm run build
```

Browser tests mock API traffic and never publish or modify your database. API/worker tests use isolated fixtures. `npm run test:db` runs the actual PostgreSQL schema, queries, constraints, triggers, and RLS checks using an isolated in-memory PGlite engine. It needs no credentials, never contacts Supabase, and never modifies your database. Hosted connectivity, TLS, and pooler behavior still require `npm run db:check` against your configured project.

Set `NODE_ENV=production`, a strong `SESSION_SECRET`, and your public HTTPS `APP_URL`, then run `npm start`. Express serves `dist` and the API on port 3001, bound to loopback for an HTTPS reverse proxy. Secure cookies require HTTPS. Run the worker separately under a process manager or task scheduler.

```text
src/                 React screens, API client, responsive styles
server/              Express API, provider adapters, queue worker
database/supabase.sql PostgreSQL schema, indexes, triggers, RLS
tests/               API, worker, browser, and database checks
uploads/             Preserved original media
OMK/                 Preserved design/reference files
```

The removed PHP source and templates are preserved in `C:\Users\WM EASY COMP\Documents\ZendX Backups\zendx_social-php-preserved-20261015.zip`: 522 files, ZIP integrity verified before removal. This private archive includes original credentials and is outside the web root. The old application database was not dropped or replaced.
