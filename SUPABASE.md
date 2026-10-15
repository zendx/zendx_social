# Supabase setup

The React app still talks to the Node/Express API. The API, sessions, and publishing worker now store data in **Supabase PostgreSQL** using `pg`. XAMPP and MySQL are no longer dependencies. Existing application authentication and SMTP password recovery are preserved; this change does not replace login with Supabase Auth. Uploads still use the local `uploads/` directory; Supabase Storage is not configured.

## Connect your project

1. Open your Supabase project and select **Connect → Session pooler**. Copy the PostgreSQL connection string, using the host and username Supabase provides. Use port **5432**, or use the direct PostgreSQL connection if your network supports it. The transaction pooler on port 6543 is intentionally rejected because the worker uses session advisory locks. [Supabase connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres)
2. Add that string as `DATABASE_URL` in the local `.env` file, replacing the password placeholder with your URL-encoded database password. Keep the existing `SESSION_SECRET`, provider credentials, and SMTP settings. A publishable/anon key or service-role API key is not a database password and cannot replace this connection string.
3. Keep `DB_SSL=true`. Certificate verification is enabled. If necessary, download the project's root certificate from its database settings and set `DB_SSL_CA_FILE` to its local path. Do not disable TLS verification to bypass certificate errors. [node-postgres SSL configuration](https://node-postgres.com/features/ssl)
4. Run:

```sh
npm run db:check
npm run db:setup
npm run db:check
npm run dev
```

The first check may confirm connectivity but report a missing schema; that is expected before setup. Open **http://localhost:5173** after setup. Keep `APP_URL` on that same hostname. API traffic goes to Express on port 3001. Register a new editor, or set `ADMIN_EMAIL`, `ADMIN_NAME`, and `ADMIN_PASSWORD` (12+ characters) before setup to create an administrator if the user table is empty.

You can also run `database/supabase.sql` in the Supabase SQL Editor. `npm run db:setup` applies the same schema and optionally creates the initial admin. The connection must own the application schema or have equivalent DDL permissions. Use the default `postgres` database identity supplied by Dashboard for this setup; a restricted role needs owner-level application access because authentication is handled by Node.

## Data protection and application behavior

- All application tables live in the **`zendx`** schema, separate from `public` and Supabase's `auth.users`. Select `zendx` in the Table Editor to inspect them.
- Every table has RLS enabled, with no browser policies. Schema/table/sequence privileges are revoked from `PUBLIC`, `anon`, and `authenticated` where those API roles exist. Keep `zendx` out of the Data API's exposed schemas. Authentication and authorization happen in Express, and the schema owner can access data from the server. [Supabase RLS guide](https://supabase.com/docs/guides/database/postgres/row-level-security)
- Database credentials remain on the server. No Supabase credentials or provider tokens are bundled into React. Never create a `VITE_DATABASE_URL` variable.
- The application is now private per user. Express filters accounts by `user_id` and posts by `author_id`, including delivery history, comments, analytics, edits, retries, account activation, and comment sync. The worker also verifies account ownership before publishing. RLS blocks browser Data API access; per-user authorization is enforced by the Node API.
- Posts, targets, comments, analytics, users, resets, and legacy schema-only campaign/chat tables are retained. PostgreSQL identity columns, status checks, foreign keys, indexes, an `updated_at` trigger, and atomic comment deduplication replace the MySQL equivalents.
- Sessions persist in PostgreSQL. All transactions use one checked-out connection. Worker overlap prevention uses PostgreSQL advisory locks, and post/target row locking remains in place.
- Schedules remain local database timestamps in `APP_TIMEZONE` (default `Africa/Lagos`). Each checked-out connection applies that timezone.
- Schema setup creates missing objects and never drops application records. It replaces the app's `updated_at` trigger/function and reapplies RLS/privilege protections. It is not a general migration engine for arbitrary existing table layouts.

## Existing records

Your original MySQL database is unchanged. It is not automatically copied to Supabase, especially while the MySQL server is damaged/unresponsive. Start with a new account in Supabase, or recover an export before transferring historical records. PHP bcrypt hashes remain supported if user rows are imported. An import must preserve foreign-key IDs and reset PostgreSQL identity sequences afterward. Local uploads remain available on this machine.

The old MySQL DDL is retained in `database/legacy-mysql.sql` for recovery reference. Do not execute it in Supabase. The PHP source archive remains in `C:\Users\WM EASY COMP\Documents\ZendX Backups`.

## Publishing and checks

```sh
npm run worker        # One real publishing batch
npm run worker:watch  # Repeat every minute
npm test             # API/worker/connection configuration tests
npm run test:db      # Isolated PostgreSQL engine, no cloud access
npm run test:ui      # Chromium UI tests with mocked API
npm run build
```

The worker can publish to real social platforms when accounts are connected. Test fixtures use fake delivery adapters and never publish. Platform support and limitations are unchanged; see README. Exactly-once delivery is not guaranteed across network/process failures, so verify the remote post before retrying an uncertain result.

The PostgreSQL integration test covers repeated non-destructive setup, PHP password login, database-backed sessions, post creation/edit restrictions, draft/future exclusion, mixed provider outcomes, retries, internal notes, upload rejection, hashed single-use resets, schema permissions, RLS, status constraints, and rollback. It uses PGlite's embedded PostgreSQL engine; it does not validate Supabase networking, TLS, or multi-client concurrency. Use `db:check` for the hosted connection.

## Account ownership upgrade

Run `npm run db:setup` after updating the application. The additive migration adds `social_accounts.user_id`, `remote_account_id`, and `is_active`, plus an owner/provider/remote-identity unique index. Fresh schemas require an owner on each account. Older shared records retain a null owner and are excluded from user dashboards and rejected by the worker, rather than being assigned to the wrong person. Users should reconnect to create their own scoped connections. No legacy account records are deleted.

OAuth states are bound to the signed-in user, provider, session, and a ten-minute expiry, then consumed once. Credentials are saved atomically after authorization. Multiple users can authorize the same remote page independently without overwriting each other's tokens. Activation and all posting targets are validated server-side, not just hidden in the UI.

Provider flow references: [X authorization](https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code), [LinkedIn authorization](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow), and [TikTok Login Kit](https://developers.tiktok.com/doc/login-kit-web).
