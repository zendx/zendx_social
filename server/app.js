import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import path from 'node:path';
import { mkdir, readFile, unlink } from 'node:fs/promises';
import { z } from 'zod';
import { appUrl, production, root } from './config.js';
import { credentials, registration, newPassword, postInput, postStatus } from './validation.js';
import { beginOAuth, completeOAuth, fetchComments, providers, providerSettings } from './providers.js';
import { sendResetEmail } from './mail.js';

const userFields = 'id,name,email,role';
const fail = (status, message) => Object.assign(new Error(message), { status });
const id = v => z.coerce.number().int().positive().parse(v);
const safeUser = u => ({ id: u.id, name: u.name, email: u.email, role: u.role });
const regenerate = req => new Promise((resolve, reject) => req.session.regenerate(e => e ? reject(e) : resolve()));
const saveSession = req => new Promise((resolve, reject) => req.session.save(e => e ? reject(e) : resolve()));

export function createApp({ db, pool, sessionStore, sessionSecret, sendMail = sendResetEmail }) {
  const app = express();
  app.disable('x-powered-by');
  if (production) app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: production ? undefined : false, crossOriginEmbedderPolicy: false }));
  app.use(express.json({ limit: '100kb' }));
  app.use(session({ name: 'zendx.sid', secret: sessionSecret, store: sessionStore, resave: false, saveUninitialized: false, cookie: { httpOnly: true, sameSite: 'lax', secure: production, maxAge: 1000 * 60 * 60 * 24 * 7 } }));
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!req.session.csrf) req.session.csrf = crypto.randomBytes(32).toString('hex');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers['x-csrf-token'] !== req.session.csrf) return res.status(403).json({ error: 'Your session expired. Refresh the page and try again.' });
    next();
  });
  const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many attempts. Please try again later.' } });
  const auth = async (req, res, next) => {
    if (!req.session.userId) throw fail(401, 'Sign in to continue.');
    const [user] = await db(`SELECT ${userFields} FROM users WHERE id=?`, [req.session.userId]);
    if (!user) throw fail(401, 'Sign in to continue.');
    req.user = user;
    next();
  };
  const editor = (req, res, next) => {
    if (!['admin', 'editor'].includes(req.user.role.toLowerCase())) throw fail(403, 'Editor access required.');
    next();
  };
  app.get('/api/health', async (req, res) => { await db('SELECT 1'); res.json({ status: 'ok' }); });
  app.get('/api/session', async (req, res) => {
    const [user] = req.session.userId ? await db(`SELECT ${userFields} FROM users WHERE id=?`, [req.session.userId]) : [];
    res.json({ user: user || null, csrf: req.session.csrf });
  });
  app.post('/api/auth/login', authLimit, async (req, res) => {
    const input = credentials.parse(req.body);
    const [user] = await db('SELECT * FROM users WHERE email=? LIMIT 1', [input.email]);
    // PHP's $2y$ hashes are compatible with bcrypt after normalizing the prefix.
    if (!user || !await bcrypt.compare(input.password, user.password_hash.replace(/^\$2y\$/, '$2b$'))) throw fail(401, 'Email or password is incorrect.');
    await regenerate(req);
    req.session.userId = user.id;
    req.session.csrf = crypto.randomBytes(32).toString('hex');
    await saveSession(req);
    res.json({ user: safeUser(user), csrf: req.session.csrf });
  });
  app.post('/api/auth/register', authLimit, async (req, res) => {
    const input = registration.parse(req.body);
    const hash = await bcrypt.hash(input.password, 12);
    let result;
    try { result = await db('INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)', [input.name, input.email, hash, 'editor']); }
    catch (e) { if (e.code === 'ER_DUP_ENTRY') throw fail(409, 'An account with this email already exists.'); throw e; }
    await regenerate(req);
    req.session.userId = result.insertId;
    req.session.csrf = crypto.randomBytes(32).toString('hex');
    await saveSession(req);
    res.status(201).json({ user: { id: result.insertId, name: input.name, email: input.email, role: 'editor' }, csrf: req.session.csrf });
  });
  app.post('/api/auth/logout', (req, res, next) => req.session.destroy(e => e ? next(e) : res.clearCookie('zendx.sid').json({ success: true })));
  app.post('/api/auth/forgot-password', authLimit, async (req, res) => {
    const email = z.email().parse(req.body.email);
    if (!process.env.SMTP_HOST && sendMail === sendResetEmail) throw fail(503, 'Password reset email is not configured. Contact your administrator.');
    const [user] = await db('SELECT id FROM users WHERE email=?', [email]);
    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      const digest = crypto.createHash('sha256').update(token).digest('hex');
      await db('INSERT INTO password_resets (user_id,token,expires_at) VALUES (?,?,DATE_ADD(NOW(),INTERVAL 1 HOUR))', [user.id, digest]);
      await sendMail(email, `${appUrl}/?reset=${token}`);
    }
    res.json({ message: 'If this email has an account, a reset link has been sent.' });
  });
  app.post('/api/auth/reset-password', authLimit, async (req, res) => {
    const token = z.string().min(16).max(255).parse(req.body.token);
    const password = newPassword.parse(req.body.password);
    const digest = crypto.createHash('sha256').update(token).digest('hex');
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      // Legacy plaintext reset tokens remain valid until their original expiry.
      const [[reset]] = await conn.execute('SELECT * FROM password_resets WHERE token IN (?,?) AND expires_at > NOW() LIMIT 1 FOR UPDATE', [digest, token]);
      if (!reset) throw fail(400, 'Reset link is invalid or expired.');
      await conn.execute('UPDATE users SET password_hash=? WHERE id=?', [await bcrypt.hash(password, 12), reset.user_id]);
      await conn.execute('DELETE FROM password_resets WHERE user_id=?', [reset.user_id]);
      await conn.commit();
    } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
    res.json({ message: 'Password updated. You can now sign in.' });
  });
  app.post('/api/auth/password', auth, authLimit, async (req, res) => {
    const password = newPassword.parse(req.body.password);
    const current = z.string().max(72).parse(req.body.current_password);
    const [user] = await db('SELECT password_hash FROM users WHERE id=?', [req.user.id]);
    if (!await bcrypt.compare(current, user.password_hash.replace(/^\$2y\$/, '$2b$'))) throw fail(400, 'Current password is incorrect.');
    if (password === current) throw fail(400, 'Choose a different password.');
    await db('UPDATE users SET password_hash=? WHERE id=?', [await bcrypt.hash(password, 12), req.user.id]);
    res.json({ message: 'Password updated.' });
  });
  app.get('/api/workspace', auth, editor, async (req, res) => {
    const [accounts, posts, targets, comments, metrics] = await Promise.all([
      db('SELECT id,provider,account_name,created_at FROM social_accounts ORDER BY created_at DESC'),
      db('SELECT p.*,u.name AS author_name FROM posts p LEFT JOIN users u ON p.author_id=u.id ORDER BY p.created_at DESC LIMIT 500'),
      db('SELECT pt.*,sa.provider,sa.account_name,p.title,p.body FROM post_targets pt JOIN social_accounts sa ON pt.social_account_id=sa.id JOIN posts p ON pt.post_id=p.id ORDER BY pt.created_at DESC LIMIT 1000'),
      db('SELECT pc.*,sa.provider,sa.account_name,p.title FROM post_comments pc JOIN post_targets pt ON pc.post_target_id=pt.id JOIN social_accounts sa ON pt.social_account_id=sa.id JOIN posts p ON pt.post_id=p.id ORDER BY pc.created_at DESC LIMIT 200'),
      db('SELECT COALESCE(SUM(impressions),0) AS impressions,COALESCE(SUM(clicks),0) AS clicks,COALESCE(SUM(engagements),0) AS engagements FROM analytics'),
    ]);
    const integrations = providers.map(provider => { const s = providerSettings(provider); return { provider, configured: Boolean(s.id && s.secret) }; });
    res.json({ accounts, posts, targets, comments, metrics: metrics[0], integrations });
  });
  async function writePost(req, res) {
    const input = postInput.parse(req.body);
    const status = postStatus(input);
    if (status === 'scheduled' && !input.account_ids.length) throw fail(400, 'Select at least one social account.');
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      if (input.account_ids.length) {
        const [accounts] = await conn.query('SELECT id FROM social_accounts WHERE id IN (?)', [input.account_ids]);
        if (accounts.length !== input.account_ids.length) throw fail(400, 'A selected account is no longer available.');
      }
      let postId;
      if (req.params.id) {
        postId = id(req.params.id);
        const [[post]] = await conn.execute('SELECT * FROM posts WHERE id=? FOR UPDATE', [postId]);
        if (!post) throw fail(404, 'Post not found.');
        const [deliveries] = await conn.execute('SELECT status FROM post_targets WHERE post_id=? FOR UPDATE', [postId]);
        if (deliveries.some(t => t.status === 'published')) throw fail(409, 'This post has published deliveries. Create a new post instead.');
        await conn.execute('DELETE FROM post_targets WHERE post_id=?', [postId]);
        await conn.execute('UPDATE posts SET title=?,body=?,media_url=?,scheduled_at=?,status=? WHERE id=?', [input.title, input.body, input.media_url, input.publish_now ? new Date() : input.scheduled_at?.replace('T', ' ') || null, status, postId]);
      } else {
        const [result] = await conn.execute('INSERT INTO posts (author_id,title,body,media_url,scheduled_at,status) VALUES (?,?,?,?,?,?)', [req.user.id, input.title, input.body, input.media_url, input.publish_now ? new Date() : input.scheduled_at?.replace('T', ' ') || null, status]);
        postId = result.insertId;
      }
      for (const account of input.account_ids) await conn.execute('INSERT INTO post_targets (post_id,social_account_id) VALUES (?,?)', [postId, account]);
      await conn.commit();
      res.status(req.params.id ? 200 : 201).json({ id: postId, message: status === 'draft' ? 'Draft saved.' : 'Post queued for publishing.' });
    } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
  }
  app.post('/api/posts', auth, editor, writePost);
  app.put('/api/posts/:id', auth, editor, writePost);
  app.post('/api/targets/:id/retry', auth, editor, async (req, res) => {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      // Same lock order as the worker and post editor: parent, then target.
      const [[target]] = await conn.execute('SELECT post_id FROM post_targets WHERE id=?', [id(req.params.id)]);
      if (!target) throw fail(404, 'Delivery not found.');
      await conn.execute('SELECT id FROM posts WHERE id=? FOR UPDATE', [target.post_id]);
      const [result] = await conn.execute("UPDATE post_targets SET status='pending',error_message=NULL WHERE id=? AND status='failed'", [id(req.params.id)]);
      if (!result.affectedRows) throw fail(409, 'Only failed deliveries can be retried.');
      await conn.execute("UPDATE posts SET status='scheduled' WHERE id=?", [target.post_id]);
      await conn.commit();
    } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
    res.json({ message: 'Delivery queued for retry.' });
  });
  app.post('/api/comments', auth, editor, async (req, res) => {
    const input = z.object({ target_id: z.number().int().positive(), comment: z.string().trim().min(1).max(5000) }).parse(req.body);
    const [target] = await db('SELECT id FROM post_targets WHERE id=?', [input.target_id]);
    if (!target) throw fail(404, 'Delivery not found.');
    await db('INSERT INTO post_comments (post_target_id,commenter_name,comment) VALUES (?,?,?)', [input.target_id, req.user.name, input.comment]);
    res.status(201).json({ message: 'Internal note saved. It has not been sent to the platform.' });
  });
  app.post('/api/comments/sync', auth, editor, rateLimit({ windowMs: 60000, limit: 2 }), async (req, res) => {
    const rows = await db("SELECT pt.id,pt.provider_post_id,sa.provider,sa.config FROM post_targets pt JOIN social_accounts sa ON pt.social_account_id=sa.id WHERE pt.status='published' ORDER BY pt.created_at DESC LIMIT 50");
    let count = 0;
    const errors = [];
    for (const row of rows) {
      if (!row.provider_post_id) continue;
      try {
        const comments = await fetchComments(row.provider, JSON.parse(row.config || '{}'), row.provider_post_id);
        for (const c of comments) {
          const result = await db('INSERT INTO post_comments (post_target_id,commenter_name,comment,external_id) SELECT ?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM post_comments WHERE post_target_id=? AND external_id=?)', [row.id, c.commenter_name, c.comment, c.external_id, row.id, c.external_id]);
          count += result.affectedRows;
        }
      } catch (e) { errors.push({ target_id: row.id, provider: row.provider, error: redact(e.message) }); }
    }
    res.json({ message: `Synced ${count} new comments.`, errors });
  });
  const upload = multer({ storage: multer.diskStorage({
    destination: async (req, file, cb) => { try { await mkdir(path.join(root, 'uploads'), { recursive: true }); cb(null, path.join(root, 'uploads')); } catch (e) { cb(e); } },
    filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
  }), limits: { fileSize: 5 * 1024 * 1024, files: 1 }, fileFilter: (req, file, cb) => {
    const valid = /\.(jpg|jpeg|png|gif|webp|mp4|mov|avi|mkv)$/i.test(file.originalname) && /^(image\/(jpeg|png|gif|webp)|video\/(mp4|quicktime|x-msvideo|x-matroska))$/.test(file.mimetype);
    cb(valid ? null : fail(400, 'Choose a supported image or video (maximum 5MB).'), valid);
  } });
  app.post('/api/uploads', auth, editor, upload.single('media'), async (req, res) => {
    if (!req.file) throw fail(400, 'Choose a media file.');
    const bytes = await readFile(req.file.path);
    const ext = path.extname(req.file.filename).toLowerCase();
    const valid = ['.jpg', '.jpeg'].includes(ext) ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : ext === '.png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
      : ext === '.gif' ? bytes.toString('ascii', 0, 3) === 'GIF'
      : ext === '.webp' ? bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
      : ext === '.avi' ? bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'AVI '
      : ext === '.mkv' ? bytes.subarray(0, 4).equals(Buffer.from([26,69,223,163]))
      : bytes.toString('ascii', 4, 8) === 'ftyp';
    if (!valid) { await unlink(req.file.path); throw fail(400, 'File contents do not match the selected media type.'); }
    res.status(201).json({ media_url: `uploads/${req.file.filename}` });
  });
  app.get('/api/oauth/:provider/start', auth, editor, async (req, res) => {
    const provider = z.enum(providers).parse(req.params.provider);
    const oauth = beginOAuth(provider);
    req.session.oauth = { ...oauth, provider };
    await saveSession(req);
    res.redirect(oauth.url);
  });
  app.get('/api/oauth/:provider/callback', auth, editor, async (req, res) => {
    const pending = req.session.oauth;
    delete req.session.oauth;
    await saveSession(req);
    if (!pending || pending.provider !== req.params.provider || pending.state !== req.query.state || Date.now() - pending.createdAt > 600000) throw fail(400, 'OAuth session expired or state is invalid. Please reconnect.');
    if (req.query.error) return res.redirect(`${appUrl}/?view=accounts&notice=${encodeURIComponent('Connection was declined. Please try again.')}`);
    try {
      const accounts = await completeOAuth(req.params.provider, z.string().parse(req.query.code), pending.verifier);
      for (const account of accounts) {
        // Match stable remote identity, preserving target associations when reconnecting.
        const existing = await db('SELECT id,config FROM social_accounts WHERE provider=?', [req.params.provider]);
        const identity = c => c.instagram_business_id || c.page_id || c.twitter_id || c.linkedin_id || c.open_id;
        const match = existing.find(row => identity(JSON.parse(row.config || '{}')) === identity(account.config));
        if (match) await db('UPDATE social_accounts SET account_name=?,config=?,access_token=?,refresh_token=? WHERE id=?', [account.name, JSON.stringify(account.config), account.config.access_token, account.config.refresh_token, match.id]);
        else await db('INSERT INTO social_accounts (provider,account_name,config,access_token,refresh_token) VALUES (?,?,?,?,?)', [req.params.provider, account.name, JSON.stringify(account.config), account.config.access_token, account.config.refresh_token]);
      }
      res.redirect(`${appUrl}/?view=accounts&notice=${encodeURIComponent('Social account connected.')}`);
    } catch (e) { console.error('OAuth connection failed:', redact(e.message)); res.redirect(`${appUrl}/?view=accounts&notice=${encodeURIComponent('Connection failed. Verify provider credentials, callback URL, and app permissions.')}`); }
  });
  app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found.' }));
  app.use('/uploads', express.static(path.join(root, 'uploads'), { dotfiles: 'deny', setHeaders: res => res.set('Content-Security-Policy', "default-src 'none'") }));
  if (production) {
    app.use(express.static(path.join(root, 'dist')));
    app.get('/{*path}', (req, res) => res.sendFile(path.join(root, 'dist', 'index.html')));
  }
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const status = err instanceof z.ZodError || err instanceof multer.MulterError ? 400 : err.status || 500;
    if (status === 500) console.error('Request failed:', redact(err.message));
    res.status(status).json({ error: err instanceof z.ZodError ? err.issues[0].message : status === 500 ? 'The request could not be completed. Check the server configuration and database connection.' : err.message });
  });
  return app;
}
export function redact(message = '') {
  return String(message).replace(/(access_token|refresh_token|client_secret|password)([=":\s]+)[^&\s",}]+/gi, '$1$2[redacted]').slice(0, 1500);
}
