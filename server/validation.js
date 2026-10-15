import { z } from 'zod';

export const credentials = z.object({ email: z.email().max(150), password: z.string().min(1).max(72) });
export const registration = credentials.extend({ name: z.string().trim().min(1).max(100), password: z.string().min(8).max(72) });
export const newPassword = z.string().min(8).max(72);
export const postInput = z.object({
  title: z.string().trim().max(255).default(''),
  body: z.string().trim().min(1, 'Write some content for your post.').max(20000),
  media_url: z.string().max(255).nullable().optional().transform(v => v || null).refine(v => !v || /^https?:\/\//i.test(v) || /^uploads\/[\w.-]+$/.test(v), 'Use an HTTP media URL or an uploaded file.'),
  scheduled_at: z.string().nullable().optional().refine(v => !v || /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/.test(v) && !Number.isNaN(Date.parse(v)), 'Choose a valid schedule.'),
  publish_now: z.boolean().default(false),
  account_ids: z.array(z.number().int().positive()).max(100).default([]).transform(v => [...new Set(v)]),
});
export function postStatus(post) {
  return post.publish_now || post.scheduled_at ? 'scheduled' : 'draft';
}
export function aggregateStatus(targets) {
  if (targets.some(t => t.status === 'pending')) return 'scheduled';
  return targets.length && targets.every(t => t.status === 'published') ? 'published' : 'failed';
}
