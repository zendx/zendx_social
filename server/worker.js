import { pathToFileURL } from 'node:url';
import { pool } from './db.js';
import { publish } from './providers.js';
import { aggregateStatus } from './validation.js';
import { redact } from './app.js';

export async function processQueue(dbPool = pool, deliver = publish) {
  const connection = await dbPool.getConnection();
  let locked = false;
  const summary = { published: 0, failed: 0 };
  try {
    const [[lock]] = await connection.query("SELECT GET_LOCK('zendx_social_worker',0) AS acquired");
    if (!lock.acquired) return { ...summary, skipped: true };
    locked = true;
    const [rows] = await connection.query("SELECT pt.id,pt.post_id FROM post_targets pt JOIN posts p ON pt.post_id=p.id WHERE pt.status='pending' AND p.status='scheduled' AND p.scheduled_at IS NOT NULL AND p.scheduled_at <= NOW() ORDER BY p.scheduled_at,pt.id LIMIT 50");
    for (const candidate of rows) {
      await connection.beginTransaction();
      try {
        const [[post]] = await connection.execute('SELECT * FROM posts WHERE id=? FOR UPDATE', [candidate.post_id]);
        if (!post || post.status !== 'scheduled' || !post.scheduled_at) { await connection.rollback(); continue; }
        const [[target]] = await connection.execute("SELECT pt.*,sa.provider,sa.config FROM post_targets pt JOIN social_accounts sa ON pt.social_account_id=sa.id WHERE pt.id=? AND pt.status='pending' AND EXISTS (SELECT 1 FROM posts WHERE id=pt.post_id AND scheduled_at <= NOW()) FOR UPDATE", [candidate.id]);
        if (!target) { await connection.rollback(); continue; }
        let error = null;
        let externalId;
        try {
          externalId = await deliver(target.provider, JSON.parse(target.config || '{}'), post);
          if (!externalId || typeof externalId !== 'string') throw new Error('Provider returned no post identifier. Verify delivery before retrying.');
        } catch (e) { error = redact(e.message); }
        if (error) {
          await connection.execute("UPDATE post_targets SET status='failed',error_message=? WHERE id=?", [error, target.id]);
          summary.failed++;
        } else {
          await connection.execute("UPDATE post_targets SET status='published',provider_post_id=?,error_message=NULL,published_at=NOW() WHERE id=?", [externalId, target.id]);
          summary.published++;
        }
        await connection.execute('INSERT INTO delivery_attempts (target_id,success,error_message) VALUES (?,?,?)', [target.id, !error, error]);
        const [targets] = await connection.execute('SELECT status FROM post_targets WHERE post_id=?', [post.id]);
        await connection.execute('UPDATE posts SET status=? WHERE id=?', [aggregateStatus(targets), post.id]);
        await connection.commit();
      } catch (e) { await connection.rollback(); throw e; }
    }
    return summary;
  } finally {
    if (locked) await connection.query("SELECT RELEASE_LOCK('zendx_social_worker')");
    connection.release();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let running = true;
  process.on('SIGINT', () => { running = false; });
  process.on('SIGTERM', () => { running = false; });
  try {
    do {
      console.log(await processQueue());
      if (!process.argv.includes('--watch')) break;
      // Short interruptible waits let shutdown finish promptly between batches.
      for (let i = 0; i < 60 && running; i++) await new Promise(resolve => setTimeout(resolve, 1000));
    } while (running);
  }
  catch (e) { console.error('Worker failed:', redact(e.message)); process.exitCode = 1; }
  finally { await pool.end(); }
}
