export function remoteAccountId(provider, config) {
  const keys = { facebook: 'page_id', instagram: 'instagram_business_id', twitter: 'twitter_id', linkedin: 'linkedin_id', tiktok: 'open_id' };
  const identity = config[keys[provider]];
  if (!identity || !['string', 'number'].includes(typeof identity)) throw new Error('Provider did not return a valid social account identity.');
  return String(identity);
}

export async function saveConnectedAccounts(connection, userId, provider, accounts) {
  if (!accounts.length) throw new Error('No eligible social accounts were authorized.');
  // Called inside a transaction: all authorized pages are saved or none are.
  for (const account of accounts) {
    const cfg = account.config;
    await connection.execute(`INSERT INTO social_accounts
      (user_id,provider,remote_account_id,account_name,config,access_token,refresh_token,expires_at,is_active)
      VALUES ($1,$2,$3,$4,$5,$6,$7,CASE WHEN $8::bigint IS NULL THEN NULL ELSE to_timestamp($8::double precision/1000) END,TRUE)
      ON CONFLICT (user_id,provider,remote_account_id) DO UPDATE
      SET account_name=EXCLUDED.account_name,config=EXCLUDED.config,
          access_token=EXCLUDED.access_token,refresh_token=EXCLUDED.refresh_token,
          expires_at=EXCLUDED.expires_at,is_active=TRUE`,
    [userId, provider, remoteAccountId(provider, cfg), account.name, JSON.stringify(cfg), cfg.access_token || cfg.page_access_token || null, cfg.refresh_token || null, cfg.expires_at || null]);
  }
}
