import React, { useEffect } from 'react';

export function LegalLinks() {
  return <nav className="legal-links" aria-label="Privacy and data"><a href="/privacy-policy">Privacy policy</a><a href="/data-deletion">User data deletion</a></nav>;
}

export default function LegalPage({ deletion }) {
  const title = deletion ? 'User data deletion' : 'Privacy policy';
  useEffect(() => { document.title = `${title} | ZendX Social`; }, [title]);
  return <div className="legal-page">
    <header className="legal-header"><a className="brand" href="/">zendx<span className="brand-light">social</span></a><a className="button" href="/">Back to workspace</a></header>
    <main className="legal-content">
      <p className="eyebrow">YOUR PRIVACY, YOUR CONTROL</p><h1>{title}</h1><p className="legal-updated">Last updated: October 16, 2026</p>
      <article className="panel legal-article">{deletion ? <>
        <section><h2>Request deletion of your data</h2><p>You can request removal of your ZendX Social account or data associated with a connected social account. Contact the administrator who provided your ZendX Social access, using your existing support or onboarding contact channel.</p><p>There is currently no automatic account deletion option in the app. This page provides instructions; visiting it does not submit a deletion request.</p></section>
        <section><h2>What to include</h2><ol><li>Use the subject “ZendX Social data deletion request”.</li><li>Provide the email address registered to your ZendX Social account.</li><li>Specify whether you want your entire account removed or only data for a particular social account. For a social account, include its platform and account or Page name.</li><li>Ask for confirmation when your request has been completed.</li></ol><p>The administrator may need to verify that you control the account before removing data. Never send your password, access tokens, or recovery codes.</p></section>
        <section><h2>Data covered by your request</h2><p>A full account removal request covers your profile, stored social account connections and tokens, drafts, scheduled posts, delivery records, and uploaded media associated with your account. Tell the administrator if you want only a particular connection removed.</p><p>Ask the administrator to confirm the scope, expected completion date, and whether any records or backup copies must be retained and for how long.</p></section>
        <section><h2>Stop social platform access</h2><p>You can also revoke ZendX Social’s access through the connected platform’s app permissions or business integration settings. Pausing an account in ZendX Social stops it being selected for new posts; it does not delete stored data or revoke platform permissions.</p><p>Revoking access does not itself submit a ZendX Social data deletion request. Contact your administrator to remove the stored data as well.</p></section>
        <section><h2>Content already published</h2><p>Removing ZendX Social data does not remove posts or comments already published on a social platform. Manage or delete that content directly on the relevant platform.</p></section>
      </> : <>
        <section><h2>About this policy</h2><p>ZendX Social helps you connect social accounts, prepare content, schedule posts, and manage engagement. This policy describes the information used by this application. Your workspace administrator operates your installation and is your contact for privacy questions.</p></section>
        <section><h2>Information we process</h2><ul><li><strong>Account information:</strong> your name, email address, account role, and a hashed password.</li><li><strong>Social connections:</strong> platform identifiers, account or Page names, authorization tokens, permissions, and connection details supplied when you authorize an integration.</li><li><strong>Content:</strong> drafts, post text, uploaded images or videos, scheduling details, and publishing results.</li><li><strong>Engagement information:</strong> comments and performance information retrieved from connected platforms when you use those features.</li><li><strong>Session and security information:</strong> login sessions, password reset records, and operational error information needed to run and protect the service.</li></ul></section>
        <section><h2>How information is used</h2><p>Information is used to authenticate you, show your workspace, connect the accounts you authorize, publish the content you select, process scheduled posts, retrieve engagement information, and diagnose service issues.</p></section>
        <section><h2>Social platforms and service providers</h2><p>When you connect a platform or publish content, ZendX Social exchanges the information needed for that action with that platform. Hosting, database, and email services configured by your workspace administrator may also process information to operate the service. Each connected platform handles information under its own privacy policy.</p></section>
        <section><h2>Cookies and security</h2><p>The application uses a session cookie to keep you signed in and protect authenticated requests. Passwords are stored as hashes. Social account tokens are stored to enable authorized platform requests; access to the server and database must be protected by your workspace operator.</p></section>
        <section><h2>Storage and retention</h2><p>Workspace records and uploaded media remain in the installation’s configured storage until removed. Retention of operational logs and backups depends on your administrator’s hosting arrangements. Contact your administrator for the retention periods that apply to your installation.</p></section>
        <section><h2>Your choices and deletion</h2><p>You can edit drafts, change your password, pause social accounts for posting, and revoke app permissions through the relevant social platform. To request access to, correction of, or deletion of stored information, contact your workspace administrator. See our <a href="/data-deletion">user data deletion instructions</a> for the information to include.</p></section>
        <section><h2>Contact and updates</h2><p>For privacy questions, use the support or onboarding contact channel provided by your workspace administrator. Updates to this policy will appear on this page with a revised date.</p></section>
      </>}</article>
      <LegalLinks />
    </main>
  </div>;
}
