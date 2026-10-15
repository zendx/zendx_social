# PHP → React / Node migration

The active project contains no PHP runtime. The chosen stack is React 19, Vite 8, Express 5, and the existing MySQL/MariaDB schema. JavaScript ES modules run throughout the frontend and server.

## Preserved

Authentication and PHP password compatibility; admin/editor roles; shared social accounts; OAuth connections for five platforms; drafts, schedules, and publish-now queues; media uploads; per-account delivery results and manual retries; calendar; stored analytics; local comments/notes; SMTP password recovery; existing uploads and OMK design files. Database table names and relationships remain compatible with the former app.

Old page logic now lives in `src/main.jsx`, `server/app.js`, `server/providers.js`, and `server/worker.js`. The old scheduler is replaced by `npm run worker`. `.env` replaces PHP configuration.

## Corrected during the port

- Drafts cannot be published by the worker.
- Parent post statuses follow delivery outcomes, including partial failures.
- Concurrent workers use an advisory lock; edits and deliveries use parent-first row locking.
- Retry applies only to failed targets, preserving published deliveries.
- Already-delivered content cannot be edited into accidental duplicate delivery.
- Editors can use the content tools instead of being redirected into an admin-only dead end.
- Sessions rotate at login, persist in MySQL, and use CSRF tokens.
- OAuth uses unpredictable state and X uses S256 PKCE instead of a fixed verifier.
- Reset tokens are hashed, single-use, and expire after an hour. Legacy unexpired reset tokens remain compatible.
- Mail uses Nodemailer rather than the minimal PHP SMTP shim.
- Media types and file signatures are validated; unsupported platform media fails explicitly.
- Local-only comments are accurately labeled as internal notes. Live sync persists retrieved comments.
- Database setup creates missing tables without dropping existing data.
- Provider endpoints are encapsulated in one adapter module, with configurable Meta and LinkedIn versions.

## Verification

- Nine API/logic/worker tests passed.
- Two Chromium browser tests passed, covering login, composer/draft creation, calendar, accounts, engagement, settings, and mobile navigation/overflow.
- Real MariaDB integration passed against a separate temporary database on port 3307: additive schema setup, PHP bcrypt login, persistent sessions, draft/future exclusion, mixed delivery outcomes, retry, notes, invalid upload rejection, and hashed single-use password recovery.
- `npm run build` passed.
- `npm audit` reported zero known vulnerabilities at verification time.

The test database was separate from the application database and was dropped after the test. Test publishing used an injected fake adapter; it did not call social platforms. Browser tests mocked API responses.

**Existing-data verification is pending:** the pre-existing XAMPP MySQL process on port 3306 listens but times out during connection handshakes. The application database was not modified, reset, or replaced. Once that service responds, run `npm run db:setup` and `npm run dev` to use existing records.

**Live integrations are unverified.** Provider app credentials, products, callback URLs, permissions, and approvals must be configured. TikTok direct publishing, automatic token refresh, automated analytics, Instagram video, X/LinkedIn media, and LinkedIn/TikTok comments remain unavailable; the UI/README states these limits. Campaigns and customer chat remain schema-only, as they were before.

## Recovery

Before removal, all 522 original files were archived and ZIP integrity verified. The private archive is outside the web root:

`C:\Users\WM EASY COMP\Documents\ZendX Backups\zendx_social-php-preserved-20261015.zip`

It includes original configuration credentials. Do not publish it. Restore into a separate directory if you need to inspect the former implementation. Uploads and OMK files also remain in the active workspace. Existing database records were not included in the source archive; maintain your usual database backups.

## Primary implementation references

- [Vite guide](https://vite.dev/guide/)
- [Express installation](https://expressjs.com/en/starter/installing/)
- [Meta Instagram content publishing](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/content-publishing/)
- [LinkedIn Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api)
- [TikTok media transfer requirements](https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide)
