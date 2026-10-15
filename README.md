# ZendX Social

A shared social publishing workspace built with **React + Vite**, **Node.js + Express**, and **MySQL/MariaDB**. React builds the interface; Vite handles development and builds; Express serves the API and production app. PHP is no longer required.

## Run locally

Use Node.js 22.12+ (Node 24 LTS recommended) and MySQL 8 or MariaDB 10.4+. Keep XAMPP's MySQL running; Apache is not needed.

```sh
npm install
npm run db:setup
npm run dev
```

Open **http://localhost:5173**. Vite proxies `/api` and `/uploads` to Express on port 3001. Use the same hostname throughout login and OAuth. Existing users retain their passwords, including PHP bcrypt `$2y$` hashes.

The migration created a private `.env` from `.env.example`, using the old `zendx` database connection and migrating non-placeholder provider/SMTP credentials. If starting elsewhere, copy `.env.example` to `.env`, set the database connection, and generate a random `SESSION_SECRET` of at least 32 characters. Never commit `.env`.

Setup creates missing tables and preserves records. It never drops tables. Do not import the old destructive SQL from the backup. The replacement schema is `database/schema.sql`. If your installation used `social_scheduler`, change `DB_NAME` accordingly.

For a fresh database, register an editor through the app. To create an administrator on an empty database, set `ADMIN_EMAIL`, `ADMIN_NAME`, and an `ADMIN_PASSWORD` of at least 12 characters before setup. There is no default password. Editors and admins currently share content/account tools; this is not a multi-tenant application. Restrict access to public registration when hosting an internal deployment.

## Publishing worker

The worker performs real publishing to configured accounts. It runs separately from the web server, matching the old cron workflow.

```sh
npm run worker        # One batch, up to 50 deliveries
npm run worker:watch  # Batches every 60 seconds until stopped
```

Alternatively schedule `node /absolute/path/to/server/worker.js` every minute, with the project as working directory so dotenv finds `.env`. Drafts are excluded. “Publish now” queues an immediate scheduled post. A database lock prevents overlapping workers; row locks coordinate edits and deliveries. Results and errors are stored per account and parent post statuses are updated. Only failed deliveries can be retried.

A platform may accept a request immediately before a timeout or process/database failure. Exactly-once publishing cannot be guaranteed. Verify the remote channel before retrying an uncertain delivery. Failures are not retried automatically.

Schedules use `DB_TIMEZONE=+01:00` by default (Africa/Lagos). The composer identifies the server-time convention. Schedules are local database datetimes, not browser UTC conversions.

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

- Registration, login/logout, password changes, one-hour emailed password resets. MySQL-backed HttpOnly sessions, CSRF checks, session rotation at login, and rate limiting protect authentication.
- SMTP email uses Nodemailer. Configure `SMTP_*`; reset tokens are never returned in an API response.
- Internal comments are labeled **notes**, preserving local-only behavior. They are not sent to social platforms.
- Comment sync retrieves up to 50 comments per recent eligible delivery and saves new comments locally. Provider failures are shown. Historical pagination is not implemented.
- Analytics shows stored impressions, clicks, and engagements. Automated metric collection remains unimplemented, as in the PHP project.
- Campaign, chat, and calendar-event tables are retained. Campaign/chat workflows were not implemented in PHP and remain absent. Calendar events derive from post schedules.
- Workspace responses include the latest 500 posts, 1,000 deliveries, and 200 comments. Server pagination remains future work for larger installations.

## Checks and production

```sh
npm test
npx playwright install chromium
npm run test:ui
npm run build
```

Browser tests mock API traffic and never publish or modify your database. API/worker tests use isolated fixtures. `npm run test:db` exercises a real separate database; set `TEST_DB_NAME` to an empty name beginning `zendx_test_` and `TEST_DB_PORT` as needed. It refuses the application's configured database.

Set `NODE_ENV=production`, a strong `SESSION_SECRET`, and your public HTTPS `APP_URL`, then run `npm start`. Express serves `dist` and the API on port 3001, bound to loopback for an HTTPS reverse proxy. Secure cookies require HTTPS. Run the worker separately under a process manager or task scheduler.

```text
src/                 React screens, API client, responsive styles
server/              Express API, provider adapters, queue worker
database/schema.sql  Non-destructive legacy-compatible schema
tests/               API, worker, browser, and database checks
uploads/             Preserved original media
OMK/                 Preserved design/reference files
```

The removed PHP source and templates are preserved in `C:\Users\WM EASY COMP\Documents\ZendX Backups\zendx_social-php-preserved-20261015.zip`: 522 files, ZIP integrity verified before removal. This private archive includes original credentials and is outside the web root. The old application database was not dropped or replaced.
