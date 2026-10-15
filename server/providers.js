import crypto from 'node:crypto';
import { appUrl } from './config.js';

export const providers = ['facebook', 'instagram', 'twitter', 'linkedin', 'tiktok'];
const metaVersion = () => process.env.META_API_VERSION || 'v23.0';
const graph = () => `https://graph.facebook.com/${metaVersion()}`;
export async function remote(url, { token, form, json, headers = {}, method = 'GET' } = {}) {
  const response = await fetch(url, {
    method: form || json ? 'POST' : method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}), ...(json ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: form ? new URLSearchParams(form) : json ? JSON.stringify(json) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const raw = await response.text();
  let data;
  try { data = raw ? JSON.parse(raw) : {}; } catch { throw new Error('Provider returned an invalid response.'); }
  if (!response.ok || (data.error && data.error.code !== 'ok')) throw new Error(data.error?.message || data.error_description || `Provider request failed (${response.status}).`);
  return { data, headers: response.headers };
}
export function providerSettings(provider) {
  if (!providers.includes(provider)) throw new Error('Unknown provider.');
  if (provider === 'facebook' || provider === 'instagram') return {
    id: process.env.META_APP_ID, secret: process.env.META_APP_SECRET,
    authorize: `https://www.facebook.com/${metaVersion()}/dialog/oauth`, tokenUrl: `${graph()}/oauth/access_token`,
    scope: provider === 'facebook' ? 'pages_show_list,pages_manage_posts,pages_read_engagement,pages_read_user_content' : 'pages_show_list,pages_read_engagement,instagram_basic,instagram_content_publish,instagram_manage_comments',
  };
  if (provider === 'twitter') return { id: process.env.TWITTER_CLIENT_ID, secret: process.env.TWITTER_CLIENT_SECRET, authorize: 'https://x.com/i/oauth2/authorize', tokenUrl: 'https://api.x.com/2/oauth2/token', scope: 'tweet.read tweet.write users.read offline.access' };
  if (provider === 'linkedin') return { id: process.env.LINKEDIN_CLIENT_ID, secret: process.env.LINKEDIN_CLIENT_SECRET, authorize: 'https://www.linkedin.com/oauth/v2/authorization', tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken', scope: 'openid profile email w_member_social' };
  return { id: process.env.TIKTOK_CLIENT_KEY, secret: process.env.TIKTOK_CLIENT_SECRET, authorize: 'https://www.tiktok.com/v2/auth/authorize/', tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/', scope: 'user.info.basic,video.publish' };
}
export function beginOAuth(provider) {
  const settings = providerSettings(provider);
  if (!settings.id || !settings.secret) throw new Error(`${provider} credentials have not been configured.`);
  const state = crypto.randomBytes(32).toString('hex');
  const verifier = crypto.randomBytes(48).toString('base64url');
  const params = new URLSearchParams({ response_type: 'code', redirect_uri: `${appUrl}/api/oauth/${provider}/callback`, scope: settings.scope, state, [provider === 'tiktok' ? 'client_key' : 'client_id']: settings.id });
  if (provider === 'twitter') {
    params.set('code_challenge', crypto.createHash('sha256').update(verifier).digest('base64url'));
    params.set('code_challenge_method', 'S256');
  }
  return { state, verifier, createdAt: Date.now(), url: `${settings.authorize}?${params}` };
}
export async function completeOAuth(provider, code, verifier) {
  const s = providerSettings(provider);
  const form = { grant_type: 'authorization_code', code, redirect_uri: `${appUrl}/api/oauth/${provider}/callback`, [provider === 'tiktok' ? 'client_key' : 'client_id']: s.id };
  let headers = {};
  if (provider === 'twitter') {
    form.code_verifier = verifier;
    headers.Authorization = `Basic ${Buffer.from(`${s.id}:${s.secret}`).toString('base64')}`;
  } else form.client_secret = s.secret;
  const { data: token } = await remote(s.tokenUrl, { form, headers });
  if (!token.access_token) throw new Error('Provider did not return an access token.');
  const config = { access_token: token.access_token, refresh_token: token.refresh_token || null, expires_at: token.expires_in ? Date.now() + token.expires_in * 1000 : null };
  if (provider === 'facebook' || provider === 'instagram') {
    const { data: pages } = await remote(`${graph()}/me/accounts?fields=id,name,access_token,instagram_business_account`, { token: token.access_token });
    const accounts = (pages.data || []).filter(p => provider === 'facebook' || p.instagram_business_account).map(p => ({
      name: p.name, config: { ...config, page_id: p.id, page_access_token: p.access_token, instagram_business_id: p.instagram_business_account?.id },
    }));
    if (!accounts.length) throw new Error('No eligible pages or linked Instagram business accounts were found.');
    return accounts;
  }
  if (provider === 'twitter') {
    const { data } = await remote('https://api.x.com/2/users/me', { token: token.access_token });
    return [{ name: data.data.username, config: { ...config, twitter_id: data.data.id } }];
  }
  if (provider === 'linkedin') {
    const { data } = await remote('https://api.linkedin.com/v2/userinfo', { token: token.access_token });
    return [{ name: data.name || 'LinkedIn', config: { ...config, linkedin_id: data.sub } }];
  }
  const { data } = await remote('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name', { token: token.access_token });
  return [{ name: data.data.user.display_name, config: { ...config, open_id: data.data.user.open_id } }];
}
function publicMedia(media) {
  if (!media) return null;
  if (media.startsWith('uploads/')) {
    if (!process.env.PUBLIC_MEDIA_ORIGIN) throw new Error('Configure PUBLIC_MEDIA_ORIGIN to publish uploaded media.');
    return `${process.env.PUBLIC_MEDIA_ORIGIN.replace(/\/$/, '')}/${media}`;
  }
  return media;
}
export async function publish(provider, config, post) {
  if (config.expires_at && config.expires_at < Date.now()) throw new Error('Account token has expired. Reconnect this account.');
  if (['twitter', 'linkedin'].includes(provider) && post.media_url) throw new Error('This integration supports text posts only. Remove media or choose another account.');
  const media = publicMedia(post.media_url);
  if (provider === 'facebook') {
    if (!config.page_id || !config.page_access_token) throw new Error('Reconnect Facebook to obtain a page token.');
    const video = media && /\.(mp4|mov|avi|mkv)(\?|$)/i.test(media);
    const endpoint = video ? 'videos' : media ? 'photos' : 'feed';
    const form = video ? { file_url: media, description: post.body } : media ? { url: media, caption: post.body } : { message: post.body };
    const { data } = await remote(`${graph()}/${config.page_id}/${endpoint}`, { token: config.page_access_token, form });
    return data.post_id || data.id;
  }
  if (provider === 'instagram') {
    if (!media) throw new Error('Instagram requires a public image URL.');
    if (/\.(mp4|mov|avi|mkv)(\?|$)/i.test(media)) throw new Error('Instagram video publishing is not implemented. Use an image.');
    const { data } = await remote(`${graph()}/${config.instagram_business_id}/media`, { token: config.page_access_token, form: { image_url: media, caption: post.body } });
    const { data: published } = await remote(`${graph()}/${config.instagram_business_id}/media_publish`, { token: config.page_access_token, form: { creation_id: data.id } });
    return published.id;
  }
  if (provider === 'twitter') {
    const { data } = await remote('https://api.x.com/2/tweets', { token: config.access_token, json: { text: post.body } });
    return data.data.id;
  }
  if (provider === 'linkedin') {
    if (!process.env.LINKEDIN_API_VERSION) throw new Error('Set LINKEDIN_API_VERSION to an enabled YYYYMM version.');
    const { data, headers } = await remote('https://api.linkedin.com/rest/posts', { token: config.access_token, headers: { 'LinkedIn-Version': process.env.LINKEDIN_API_VERSION, 'X-Restli-Protocol-Version': '2.0.0' }, json: { author: `urn:li:person:${config.linkedin_id}`, commentary: post.body, visibility: 'PUBLIC', distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] }, lifecycleState: 'PUBLISHED', isReshareDisabledByAuthor: false } });
    return headers.get('x-restli-id') || data.id;
  }
  // Direct Post requires creator-specific privacy controls and explicit consent.
  // Retain account connection, but do not submit an incomplete publishing request.
  if (provider === 'tiktok') throw new Error('TikTok is connected. Direct publishing requires creator privacy/consent controls and app approval; it is not enabled yet.');
  throw new Error('Unsupported social provider.');
}
export async function fetchComments(provider, config, externalId) {
  if (provider === 'facebook' || provider === 'instagram') {
    const fields = provider === 'facebook' ? 'id,message,from,created_time' : 'id,text,username,timestamp';
    const { data } = await remote(`${graph()}/${encodeURIComponent(externalId)}/comments?fields=${fields}&limit=50`, { token: config.page_access_token });
    return (data.data || []).map(c => ({ external_id: c.id, commenter_name: c.from?.name || c.username || '', comment: c.message || c.text || '', created_at: c.created_time || c.timestamp }));
  }
  if (provider === 'twitter') {
    const { data } = await remote(`https://api.x.com/2/tweets/search/recent?query=${encodeURIComponent(`conversation_id:${externalId} -is:retweet`)}&tweet.fields=author_id,created_at`, { token: config.access_token });
    return (data.data || []).map(c => ({ external_id: c.id, commenter_name: c.author_id, comment: c.text, created_at: c.created_at }));
  }
  throw new Error(`Live comment retrieval is not implemented for ${provider}.`);
}
