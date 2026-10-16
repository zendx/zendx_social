import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LayoutDashboard, CalendarDays, Users, MessageCircle, Settings, LogOut, Plus, ArrowUpRight, ChevronLeft, ChevronRight, Search, ImagePlus, Send, Clock3, Check, X, RefreshCw, FileText, ExternalLink, Layers, Menu, AlertCircle, Eye, MousePointer2, Heart } from 'lucide-react';
import { api } from './api';
import './styles.css';
import LegalPage, { LegalLinks } from './LegalPages';

const platformNames = { facebook: 'Facebook', instagram: 'Instagram', twitter: 'X / Twitter', linkedin: 'LinkedIn', tiktok: 'TikTok' };
const signupUrls = { facebook: 'https://www.facebook.com/r.php', instagram: 'https://www.instagram.com/accounts/emailsignup/', twitter: 'https://x.com/i/flow/signup', linkedin: 'https://www.linkedin.com/signup', tiktok: 'https://www.tiktok.com/signup' };
const isSelectable = a => a.is_active !== false && a.connection_status !== 'reconnect_required' && a.can_publish !== false && a.provider !== 'tiktok';
const platformLetters = { facebook: 'f', instagram: '◎', twitter: '𝕏', linkedin: 'in', tiktok: '♪' };
function Platform({ provider, small = false }) { return <span className={`platform ${provider} ${small ? 'small' : ''}`} aria-label={platformNames[provider]}>{platformLetters[provider] || '?'}</span>; }
const formatDate = value => value ? new Date(value.replace(' ', 'T')).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Unscheduled';
const dayKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
function Badge({ status }) { return <span className={`badge ${status}`}><span />{status}</span>; }
function Empty({ icon: Icon = FileText, title, text, action }) { return <div className="empty"><span className="empty-icon"><Icon size={24} /></span><h3>{title}</h3><p>{text}</p>{action}</div>; }
function App() {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const [view, setView] = useState(new URLSearchParams(location.search).get('view') || 'overview');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(new URLSearchParams(location.search).get('notice') || '');
  const [composer, setComposer] = useState(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const resetToken = new URLSearchParams(location.search).get('reset');
  useEffect(() => { api('/session').then(s => setUser(s.user)).catch(e => setError(e.message)).finally(() => setBooting(false)); }, []);
  async function load(firstVisit = false) {
    setRefreshing(true);
    try { const workspace = await api('/workspace'); setData(workspace); setError(''); if (firstVisit && !workspace.accounts.length && !new URLSearchParams(location.search).has('view')) navigate('accounts'); }
    catch (e) { if (e.status === 401) { setUser(null); setData(null); } setError(e.message); }
    finally { setRefreshing(false); }
  }
  useEffect(() => { if (user) load(true); }, [user]);
  useEffect(() => { if (!user) return; const timer = setInterval(() => load(), 60000); return () => clearInterval(timer); }, [user]);
  function navigate(next) { setView(next); setMobileNav(false); const url = new URL(location.href); url.search = ''; url.searchParams.set('view', next); history.replaceState({}, '', url); }
  async function action(path, body = {}, method = 'POST') {
    try { const result = await api(path, { method, body }); setNotice(result.message || 'Saved.'); await load(); return result; }
    catch (e) { setError(e.message); return null; }
  }
  if (booting) return <div className="boot"><span className="brand-symbol">z<span>✦</span></span><p>Opening your workspace…</p></div>;
  if (!user || resetToken) return <Auth onLogin={u => { setData(null); setUser(u); }} initialError={error} resetToken={resetToken} />;
  const nav = [{ id: 'overview', label: 'Overview', icon: LayoutDashboard }, { id: 'posts', label: 'Content library', icon: Layers }, { id: 'calendar', label: 'Calendar', icon: CalendarDays }, { id: 'accounts', label: 'Social accounts', icon: Users }, { id: 'engage', label: 'Engagement', icon: MessageCircle }];
  const titles = { overview: 'Your workspace, in focus.', posts: 'Make room for great content.', calendar: 'A little planning. A lot of possibility.', accounts: 'Your channels, connected.', engage: 'Keep the conversation going.', settings: 'Make yourself at home.' };
  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? 'open' : ''}`}>
      <a className="brand" href="/" onClick={e => { e.preventDefault(); navigate('overview'); }}><span className="brand-symbol">z<span>✦</span></span><span>zendx<span className="brand-light">social</span></span></a>
      <div className="workspace-switch"><span className="workspace-avatar">W</span><div><strong>Your workspace</strong><small>Social management</small></div><ChevronRight size={16} /></div>
      <span className="nav-caption">WORKSPACE</span>
      <nav>{nav.map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? 'active' : ''} onClick={() => navigate(id)}><Icon size={19} />{label}{id === 'posts' && data && <span className="nav-count">{data.posts.length}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="sidebar-tip"><span>✦</span><h4>A consistent presence<br />starts with a plan.</h4><p>Your next great post is one idea away.</p><button onClick={() => setComposer({})}>Create something <ArrowUpRight size={15} /></button></div><button className={`settings-link ${view === 'settings' ? 'active' : ''}`} onClick={() => navigate('settings')}><Settings size={18} /> Settings</button><div className="profile"><span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span><div><strong>{user.name}</strong><small>{user.role}</small></div><button title="Sign out" aria-label="Sign out" onClick={async () => { try { await api('/auth/logout', { method: 'POST', body: {} }); setUser(null); setData(null); } catch (e) { setError(e.message); } }}><LogOut size={17} /></button></div></div>
    </aside>
    <div className="main-wrap"><header className="topbar"><div><button className="icon-button mobile-menu" aria-label="Toggle menu" onClick={() => setMobileNav(!mobileNav)}><Menu size={20} /></button><span>Workspace</span><ChevronRight size={14} /><strong>{view === 'settings' ? 'Settings' : nav.find(n => n.id === view)?.label || 'Overview'}</strong></div><div><span className="today">{new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span><button className={`icon-button ${refreshing ? 'spinning' : ''}`} title="Refresh workspace" aria-label="Refresh workspace" onClick={load} disabled={refreshing}><RefreshCw size={17} /></button><span className="avatar mini">{user.name.slice(0, 1)}</span></div></header>
      <main><div className="page-heading"><div><p className="eyebrow">YOUR SOCIAL, SIMPLIFIED</p><h1>{titles[view] || titles.overview}</h1><p>Plan with purpose. Publish with confidence. Stay connected.</p></div><button className="button primary" onClick={() => setComposer({})}><Plus size={18} /> Create post</button></div>
        {error && <div className="alert error" role="alert"><AlertCircle size={18} /><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError('')}><X size={16} /></button></div>}
        {notice && <div className="alert success" role="status"><Check size={18} /><span>{notice}</span><button aria-label="Dismiss message" onClick={() => setNotice('')}><X size={16} /></button></div>}
        {!data ? <Empty title={refreshing ? 'Loading your workspace…' : 'Your workspace is unavailable'} text="Check the Supabase connection and make sure database setup has completed." action={<button className="button" onClick={load}>Try again</button>} /> : <>
          {view === 'overview' && <Overview data={data} user={user} navigate={navigate} compose={setComposer} action={action} />}
          {view === 'posts' && <PostList data={data} compose={setComposer} action={action} />}
          {view === 'calendar' && <Calendar posts={data.posts} compose={setComposer} />}
          {view === 'accounts' && <Accounts data={data} action={action} />}
          {view === 'engage' && <Engagement data={data} action={action} />}
          {view === 'settings' && <SettingsPage user={user} action={action} />}
        </>}
        <footer><LegalLinks />Made for a more intentional social presence.<span>ZendX Social <span className="footer-dot">●</span> Your creative workspace</span></footer>
      </main>
    </div>
    {composer && data && <Composer post={composer} accounts={data.accounts.filter(isSelectable)} targets={data.targets} onClose={() => setComposer(null)} onSave={async (body, postId) => { try { const result = await api(postId ? `/posts/${postId}` : '/posts', { method: postId ? 'PUT' : 'POST', body }); setNotice(result.message); await load(); setComposer(null); return result; } catch (e) { return { error: e.message }; } }} />}
  </div>;
}

function Auth({ onLogin, initialError, resetToken }) {
  const [mode, setMode] = useState(resetToken ? 'reset' : 'login');
  const [error, setError] = useState(initialError);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError(''); setMessage('');
    const values = Object.fromEntries(new FormData(e.currentTarget));
    if (values.confirm_password !== undefined && values.confirm_password !== values.password) { setError('Passwords do not match.'); setBusy(false); return; }
    try {
      const endpoints = { login: '/auth/login', register: '/auth/register', forgot: '/auth/forgot-password', reset: '/auth/reset-password' };
      const result = await api(endpoints[mode], { method: 'POST', body: { ...values, token: resetToken } });
      if (result.user) onLogin(result.user);
      else { setMessage(result.message); if (mode === 'reset') { history.replaceState({}, '', '/'); setMode('login'); } }
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return <div className="auth-layout"><div className="auth-art"><a className="brand" href="/"><span className="brand-symbol">z<span>✦</span></span><span>zendx<span className="brand-light">social</span></span></a><div className="auth-copy"><span className="eyebrow">LESS JUGGLING. MORE CREATING.</span><h1>Your ideas deserve<br />a bigger stage<span>.</span></h1><p>One thoughtful space to plan your content,<br />connect your channels, and keep growing.</p><div className="orbit"><span className="orbit-center">z✦</span>{Object.keys(platformNames).map((p, i) => <div key={p} className={`orbit-item item-${i}`}><Platform provider={p} /></div>)}</div></div><small>Plan. Publish. Connect.</small></div><div className="auth-form-wrap"><div className="auth-form"><span className="eyebrow">WELCOME TO YOUR NEXT CHAPTER</span><h1>{{ login: 'Good to have you here.', register: 'Create your workspace.', forgot: 'Forgot your password?', reset: 'A fresh start.' }[mode]}</h1><p>{{ login: 'Sign in and pick up where inspiration left off.', register: 'A more organized social presence starts here.', forgot: 'We’ll email you a link to reset it.', reset: 'Choose a new password for your account.' }[mode]}</p>{error && <div className="alert error" role="alert">{error}</div>}{message && <div className="alert success" role="status">{message}</div>}<form onSubmit={submit}>
      {mode === 'register' && <label>Full name<input name="name" autoComplete="name" required maxLength={100} placeholder="Your name" /></label>}
      {mode !== 'reset' && <label>Email address<input name="email" type="email" autoComplete="email" required placeholder="you@company.com" /></label>}
      {mode !== 'forgot' && <label>Password<input name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'login' ? 1 : 8} maxLength={72} required placeholder={mode === 'login' ? 'Enter your password' : 'At least 8 characters'} /></label>}
      {(mode === 'reset' || mode === 'register') && <label>Confirm password<input name="confirm_password" type="password" autoComplete="new-password" required maxLength={72} placeholder="Enter your password again" /></label>}
      {mode === 'login' && <button type="button" className="text-button forgot-link" onClick={() => { setMode('forgot'); setError(''); }}>Forgot password?</button>}
      <button className="button primary full" disabled={busy}>{busy ? 'Please wait…' : { login: 'Sign in to your workspace', register: 'Create account', forgot: 'Send reset link', reset: 'Update password' }[mode]}<ArrowUpRight size={17} /></button>
    </form><p className="auth-switch">{mode === 'login' ? 'New around here? ' : 'Already have an account? '}<button className="text-button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); setMessage(''); }}>{mode === 'login' ? 'Create an account' : 'Sign in'}</button></p><LegalLinks /><div className="auth-foot"><span />A little structure. A lot more possibility.<span /></div></div></div></div>;
}

function Overview({ data, user, navigate, compose, action }) {
  const scheduled = data.posts.filter(p => p.status === 'scheduled');
  const drafts = data.posts.filter(p => p.status === 'draft');
  const published = data.posts.filter(p => p.status === 'published');
  return <><section className="welcome-banner"><div><span className="banner-tag"><span /> YOUR NEXT CHAPTER STARTS HERE</span><h2>Good things take a little planning.</h2><p>Welcome back, {user.name.split(' ')[0]}. Let’s turn your ideas into meaningful connections.</p><button onClick={() => compose({})}>Let’s make something <ArrowUpRight size={16} /></button></div><div className="banner-illustration" aria-hidden="true"><div className="sun">✦</div><div className="floating-note note-one"><span className="note-icon"><Check size={16} /></span><div><strong>Ideas, meet action.</strong><small>Your next post is waiting.</small></div></div><div className="floating-note note-two"><CalendarDays size={20} /><div><strong>A plan that works for you</strong><small>One post at a time.</small></div></div><span className="sparkle">✧</span></div></section>
    <div className="stats-grid">{[{ label: 'Connected accounts', value: data.accounts.length, icon: Users, note: 'Your social universe', color: 'purple' }, { label: 'Scheduled posts', value: scheduled.length, icon: Clock3, note: 'Good things on the way', color: 'orange' }, { label: 'Published posts', value: published.length, icon: Send, note: 'Out there, making connections', color: 'green' }, { label: 'Drafts in progress', value: drafts.length, icon: FileText, note: 'Ideas worth coming back to', color: 'blue' }].map(s => <div className="stat-card" key={s.label}><div><span>{s.label}</span><span className={`stat-icon ${s.color}`}><s.icon size={18} /></span></div><strong>{s.value.toString().padStart(2, '0')}</strong><p>{s.note}</p></div>)}</div>
    <div className="overview-columns"><section className="panel"><div className="section-heading"><div><h2>Coming up next <span className="count-bubble">{scheduled.length}</span></h2><p>A look at what’s lined up for your audience.</p></div><button className="text-button" onClick={() => navigate('calendar')}>View calendar <ArrowUpRight size={15} /></button></div>{scheduled.length ? <div className="upcoming-list">{[...scheduled].sort((a, b) => (a.scheduled_at || '').localeCompare(b.scheduled_at || '')).slice(0, 4).map(post => <PostRow key={post.id} post={post} targets={data.targets} compose={compose} />)}</div> : <Empty icon={CalendarDays} title="Your next great post belongs here" text="Create a post and give your ideas a place on the calendar." action={<button className="button" onClick={() => compose({})}><Plus size={16} /> Schedule a post</button>} />}</section>
    <section className="panel channels-panel"><div className="section-heading"><div><h2>Your channels</h2><p>All your connections, together.</p></div><button className="icon-button" aria-label="Manage channels" onClick={() => navigate('accounts')}><ArrowUpRight size={18} /></button></div>{data.accounts.length ? data.accounts.slice(0, 5).map(a => <div className="channel-row" key={a.id}><Platform provider={a.provider} /><div><strong>{a.account_name}</strong><small>{platformNames[a.provider]} ? {a.connection_status === 'reconnect_required' ? 'Reconnect required' : a.is_active === false ? 'Connected ? Paused' : 'Connected'}</small></div><span className={`connected-dot ${!isSelectable(a) ? 'paused' : ''}`} title={isSelectable(a) ? 'Connected and active' : 'Paused or expired'} /></div>) : <div className="channels-empty"><div className="platform-cluster"><Platform provider="instagram" /><Platform provider="facebook" /><Platform provider="linkedin" /></div><h3>Bring your channels together.</h3><p>Connect your first account to start publishing from one place.</p></div>}<button className="button full" onClick={() => navigate('accounts')}><Plus size={15} /> Connect a channel</button></section></div>
    <section className="panel"><div className="section-heading"><div><h2>Recent activity</h2><p>Every delivery tells a story.</p></div><button className="text-button" onClick={() => navigate('posts')}>View content library <ArrowUpRight size={15} /></button></div><Deliveries targets={data.targets.slice(0, 5)} action={action} /></section>
  </>;
}
function PostRow({ post, targets, compose }) {
  const accounts = targets.filter(t => t.post_id === post.id);
  const date = post.scheduled_at ? new Date(post.scheduled_at.replace(' ', 'T')) : null;
  return <button className="post-row" onClick={() => compose(post)}><span className="date-tile"><small>{date ? date.toLocaleDateString(undefined, { month: 'short' }) : 'IDEA'}</small><strong>{date ? date.getDate() : '✦'}</strong></span><span className="post-row-content"><strong>{post.title || post.body.slice(0, 45)}</strong><small>{post.body.slice(0, 90)}</small><span className="post-meta">{accounts.map(a => <Platform key={a.id} provider={a.provider} small />)}<span>{formatDate(post.scheduled_at)}</span></span></span><Badge status={post.status} /><ChevronRight size={16} /></button>;
}
function PostList({ data, compose, action }) {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const posts = data.posts.filter(p => (filter === 'all' || p.status === filter) && `${p.title} ${p.body}`.toLowerCase().includes(search.toLowerCase()));
  return <><div className="content-toolbar"><div className="tabs">{['all', 'draft', 'scheduled', 'published', 'failed'].map(s => <button className={filter === s ? 'active' : ''} key={s} onClick={() => setFilter(s)}>{s === 'all' ? 'All posts' : s}<span>{data.posts.filter(p => s === 'all' || p.status === s).length}</span></button>)}</div><label className="search"><Search size={17} /><input aria-label="Search posts" placeholder="Find a post…" value={search} onChange={e => setSearch(e.target.value)} /></label></div><section className="panel">{posts.length ? posts.map(p => <PostRow key={p.id} post={p} targets={data.targets} compose={compose} />) : <Empty title="A blank page, a fresh possibility." text="Save an idea as a draft or schedule your next post." action={<button className="button primary" onClick={() => compose({})}><Plus size={16} /> Create a post</button>} />}</section><section className="panel"><div className="section-heading"><div><h2>Delivery history</h2><p>Individual results for every selected channel.</p></div></div><Deliveries targets={data.targets} action={action} /></section></>;
}
function Deliveries({ targets, action }) {
  const [retrying, setRetrying] = useState(null);
  if (!targets.length) return <Empty icon={Send} title="Your story is just getting started" text="Delivery results will appear here once you create a post." />;
  return <div className="table-scroll"><table><thead><tr><th>POST</th><th>CHANNEL</th><th>STATUS</th><th>DELIVERY DETAILS</th><th /></tr></thead><tbody>{targets.map(t => <tr key={t.id}><td><strong>{t.title || t.body?.slice(0, 45) || 'Untitled post'}</strong></td><td><div className="table-account"><Platform provider={t.provider} small /><span>{t.account_name}</span></div></td><td><Badge status={t.status} /></td><td className={t.error_message ? 'delivery-error' : 'muted'}>{t.error_message || (t.published_at ? formatDate(t.published_at) : 'Waiting for publishing worker')}</td><td>{t.status === 'failed' && <button className="text-button" disabled={retrying === t.id} onClick={async () => { setRetrying(t.id); await action(`/targets/${t.id}/retry`); setRetrying(null); }}><RefreshCw size={13} /> Retry</button>}</td></tr>)}</tbody></table></div>;
}
function Calendar({ posts, compose }) {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const start = new Date(month); start.setDate(1 - ((month.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const today = dayKey(new Date());
  return <section className="panel calendar-panel"><div className="section-heading"><div><h2>{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2><p>A little breathing room for your big ideas.</p></div><div className="calendar-controls"><button className="button" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Today</button><button className="icon-button" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft size={19} /></button><button className="icon-button" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight size={19} /></button></div></div><div className="calendar-scroll"><div className="calendar-grid">{['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map(d => <div className="calendar-weekday" key={d}>{d}</div>)}{days.map(date => <div key={dayKey(date)} className={`calendar-day ${date.getMonth() !== month.getMonth() ? 'outside' : ''} ${dayKey(date) === today ? 'is-today' : ''}`}><div><span>{date.getDate()}</span><button aria-label={`Create post for ${dayKey(date)}`} onClick={() => compose({ scheduled_at: `${dayKey(date)}T09:00` })}><Plus size={13} /></button></div>{posts.filter(p => p.scheduled_at?.slice(0, 10) === dayKey(date)).map(p => <button key={p.id} className={`calendar-post ${p.status}`} onClick={() => compose(p)}><small>{p.scheduled_at.slice(11, 16)}</small>{p.title || p.body.slice(0, 30)}</button>)}</div>)}</div></div><div className="calendar-legend"><Badge status="scheduled" /><Badge status="published" /><Badge status="failed" /></div></section>;
}
function Accounts({ data, action }) {
  const [busy, setBusy] = useState(null);
  const [activation, setActivation] = useState({});
  return <>
    <div className="connection-guide"><span>1 <strong>Choose a platform</strong></span><ChevronRight size={16} /><span>2 <strong>Sign in & authorize</strong></span><ChevronRight size={16} /><span>3 <strong>Choose it when posting</strong></span></div>
    <section className="panel"><div className="section-heading"><div><h2>Connected accounts <span className="count-bubble">{data.accounts.length}</span></h2><p>Your accounts belong to your login. Activate the ones you want to use for posting.</p></div></div>
      {data.accounts.length ? <div className="account-grid">{data.accounts.map(a => {
        const expired = a.connection_status === 'reconnect_required';
        const supported = a.can_publish !== false && a.provider !== 'tiktok';
        const active = supported && (activation[a.id] ?? a.is_active !== false);
        return <article className="account-card" key={a.id}><div><Platform provider={a.provider} /><span className={`connection-pill ${expired ? 'needs-connection' : ''}`}>{expired ? 'Reconnect required' : 'Connected'}</span></div><h3>{a.account_name}</h3><p>{platformNames[a.provider]}</p><small>Added {formatDate(a.created_at)}</small>
          <label className="activation-control"><input type="checkbox" role="switch" aria-label={`Activate ${a.account_name} for posting`} checked={active} disabled={busy === a.id || expired || !supported} onChange={async e => { const next = e.target.checked; setActivation(v => ({ ...v, [a.id]: next })); setBusy(a.id); await action(`/accounts/${a.id}`, { is_active: next }, 'PATCH'); setActivation(v => { const result = { ...v }; delete result[a.id]; return result; }); setBusy(null); }} /><span>{!supported ? 'Publishing coming soon' : active ? 'Active for posting' : 'Paused for posting'}</span></label>
          <a href={`/api/oauth/${a.provider}/start`} className="text-button"><RefreshCw size={14} /> {expired ? 'Reconnect to continue posting' : 'Reconnect / change account'}</a>
        </article>;
      })}</div> : <Empty icon={Users} title="Choose your first social platform." text="Click Connect below, sign in to your account on the platform, and approve access. It will appear here as Connected." />}
    </section>
    <section className="panel"><div className="section-heading"><div><h2>Expand your social circle</h2><p>Choose the social media accounts you want to activate. You can add more at any time.</p></div></div>
      <div className="integration-list">{data.integrations.map(i => {
        const connected = data.accounts.filter(a => a.provider === i.provider && a.connection_status !== 'reconnect_required').length;
        return <div className="integration-row" key={i.provider}><Platform provider={i.provider} /><div><strong>{platformNames[i.provider]} {connected > 0 && <span className="connection-pill">{connected} connected</span>}</strong><p>{i.provider === 'tiktok' ? 'Connect your account. Direct publishing is not available yet.' : i.provider === 'instagram' ? 'Connect your professional Instagram account linked to a Facebook Page.' : i.provider === 'facebook' ? 'Sign in to Facebook and authorize the Pages you manage.' : 'Sign in and authorize your account to publish from ZendX.'}</p><a className="text-button signup-link" href={signupUrls[i.provider]} target="_blank" rel="noopener noreferrer">Need an account? Sign up <ExternalLink size={11} /></a></div>
          {i.configured ? <a className="button" href={`/api/oauth/${i.provider}/start`}><Plus size={15} />{connected ? 'Connect another' : 'Connect'}<ExternalLink size={13} /></a> : <button className="button" disabled title="This platform is being set up by the app administrator">Coming soon</button>}
        </div>;
      })}</div><div className="inline-note"><AlertCircle size={16} /><p>After you approve access on the platform, you will return here and see your account as Connected. You can activate or pause it, then select individual accounts each time you create a post.</p></div>
    </section>
  </>;
}
function Engagement({ data, action }) {
  const [syncing, setSyncing] = useState(false);
  const [syncErrors, setSyncErrors] = useState([]);
  const [saving, setSaving] = useState(false);
  return <><div className="stats-grid metrics-grid">{[{ label: 'Impressions', value: data.metrics.impressions, icon: Eye }, { label: 'Clicks', value: data.metrics.clicks, icon: MousePointer2 }, { label: 'Engagements', value: data.metrics.engagements, icon: Heart }].map(s => <div className="stat-card" key={s.label}><div><span>{s.label}</span><span className="stat-icon green"><s.icon size={18} /></span></div><strong>{Number(s.value).toLocaleString()}</strong><p>From stored analytics records</p></div>)}</div><div className="inline-note"><AlertCircle size={16} /><p>Analytics collection is not yet automated. These totals reflect existing database records.</p></div><section className="panel"><div className="section-heading"><div><h2>Conversations & notes</h2><p>Live comments and internal notes, in one place.</p></div><button className="button" disabled={syncing} onClick={async () => { setSyncing(true); const r = await action('/comments/sync'); setSyncErrors(r?.errors || []); setSyncing(false); }}><RefreshCw size={15} />{syncing ? 'Syncing…' : 'Sync comments'}</button></div>{syncErrors.length > 0 && <div className="alert error" role="alert">{syncErrors.map(e => <p key={e.target_id}>{platformNames[e.provider]}: {e.error}</p>)}</div>}{data.comments.length ? <div className="comments-list">{data.comments.map(c => <article className="comment" key={c.id}><span className="avatar">{(c.commenter_name || '?').slice(0, 1)}</span><div><div className="comment-heading"><strong>{c.commenter_name || 'Unknown author'}</strong><span>{c.external_id ? 'Platform comment' : 'Internal note'}</span><small>{formatDate(c.created_at)}</small></div><p>{c.comment}</p><small><Platform provider={c.provider} small /> {c.account_name} · {c.title || 'Untitled post'}</small></div></article>)}</div> : <Empty icon={MessageCircle} title="Room for a good conversation." text="Sync comments from published posts or add a note for your team." />}</section><section className="panel note-panel"><div className="section-heading"><div><h2>Leave an internal note</h2><p>Notes are saved in your workspace and are not sent to social platforms.</p></div></div><form onSubmit={async e => { e.preventDefault(); const form = e.currentTarget; const values = Object.fromEntries(new FormData(form)); setSaving(true); const r = await action('/comments', { target_id: Number(values.target_id), comment: values.comment }); setSaving(false); if (r) form.reset(); }}><label>Post delivery<select name="target_id" required defaultValue=""><option value="" disabled>Choose a post and channel</option>{data.targets.map(t => <option value={t.id} key={t.id}>{t.title || t.body?.slice(0, 35)} — {t.account_name}</option>)}</select></label><label>Your note<textarea name="comment" required maxLength={5000} placeholder="Keep your team in the loop…" /></label><button className="button primary" disabled={!data.targets.length || saving}>{saving ? 'Saving…' : 'Save internal note'}</button></form></section></>;
}
function SettingsPage({ user, action }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return <div className="settings-grid"><section className="panel profile-panel"><span className="avatar large">{user.name.slice(0, 1)}</span><h2>{user.name}</h2><p>{user.email}</p><span className="role-pill">{user.role}</span><div className="inline-note"><p>Your social accounts and posts are private to your login. Choose your active channels before publishing.</p></div></section><section className="panel note-panel"><div className="section-heading"><div><h2>Change password</h2><p>A fresh password for a little peace of mind.</p></div></div>{error && <div role="alert" className="alert error">{error}</div>}<form onSubmit={async e => { e.preventDefault(); setError(''); const form = e.currentTarget; const v = Object.fromEntries(new FormData(form)); if (v.password !== v.confirm_password) return setError('New passwords do not match.'); setBusy(true); const r = await action('/auth/password', { current_password: v.current_password, password: v.password }); setBusy(false); if (r) form.reset(); }}><label>Current password<input type="password" name="current_password" required autoComplete="current-password" maxLength={72} /></label><label>New password<input type="password" name="password" required minLength={8} maxLength={72} autoComplete="new-password" placeholder="At least 8 characters" /></label><label>Confirm new password<input type="password" name="confirm_password" required autoComplete="new-password" maxLength={72} /></label><button className="button primary" disabled={busy}>{busy ? 'Updating…' : 'Update password'}</button></form></section></div>;
}
function Composer({ post, accounts, targets, onClose, onSave }) {
  const [form, setForm] = useState({ title: post.title || '', body: post.body || '', media_url: post.media_url || '', scheduled_at: post.scheduled_at?.replace(' ', 'T').slice(0, 16) || '', account_ids: targets.filter(t => t.post_id === post.id && accounts.some(a => a.id === t.social_account_id)).map(t => t.social_account_id) });
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const hasPublished = post.id && targets.some(t => t.post_id === post.id && t.status === 'published');
  useEffect(() => { const handler = e => { if (e.key === 'Escape' && !busy && !uploading) onClose(); }; document.addEventListener('keydown', handler); const old = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.removeEventListener('keydown', handler); document.body.style.overflow = old; }; }, [busy, uploading, onClose]);
  const update = (key, value) => setForm(f => ({ ...f, [key]: value }));
  async function save(mode) {
    setError('');
    if (!form.body.trim()) return setError('Write some content for your post.');
    if (mode !== 'draft' && !form.account_ids.length) return setError('Choose at least one channel.');
    if (mode === 'schedule' && !form.scheduled_at) return setError('Choose a date and time.');
    setBusy(true);
    const result = await onSave({ ...form, media_url: form.media_url || null, scheduled_at: mode === 'draft' ? null : form.scheduled_at || null, publish_now: mode === 'now' }, post.id);
    if (result?.error) setError(result.error);
    setBusy(false);
  }
  return <div className="modal-backdrop"><section className="composer" role="dialog" aria-modal="true" aria-labelledby="composer-title"><div className="modal-heading"><div><span className="eyebrow">A LITTLE IDEA. A BIG POSSIBILITY.</span><h2 id="composer-title">{post.id ? 'Your post, in detail.' : 'Let’s create something.'}</h2></div><button className="icon-button" aria-label="Close composer" onClick={onClose} disabled={busy || uploading}><X size={21} /></button></div><div className="composer-body">{error && <div className="alert error" role="alert">{error}</div>}{hasPublished && <div className="inline-note"><AlertCircle size={17} /><p>This post has already been delivered to a channel. Create a new post to publish revised content.</p></div>}<fieldset disabled={busy || hasPublished}><label>Give it a title <small>Only visible in your workspace</small><input autoFocus name="title" maxLength={255} value={form.title} onChange={e => update('title', e.target.value)} placeholder="A name for your next great idea" /></label><label>Your message<textarea name="body" rows={6} maxLength={20000} value={form.body} onChange={e => update('body', e.target.value)} placeholder="What would you like to share with the world?" /></label><div className="character-count">{form.body.length.toLocaleString()} / 20,000</div><label>Choose where to post <small>Only selected accounts receive this post</small></label><div className="account-options">{accounts.length ? accounts.map(a => <label key={a.id} className={`account-option ${form.account_ids.includes(a.id) ? 'selected' : ''}`}><input type="checkbox" checked={form.account_ids.includes(a.id)} onChange={e => update('account_ids', e.target.checked ? [...form.account_ids, a.id] : form.account_ids.filter(v => v !== a.id))} /><Platform provider={a.provider} small /><span>{a.account_name}</span>{form.account_ids.includes(a.id) && <Check size={14} />}</label>) : <p className="muted">Connect and activate a social account before scheduling. You can still save a draft.</p>}</div><div className="media-controls"><label>Media URL<input type="text" maxLength={255} placeholder="https://… or upload a file" value={form.media_url} onChange={e => update('media_url', e.target.value)} /></label><label className="button upload-button"><ImagePlus size={18} />{uploading ? 'Uploading…' : 'Upload media'}<input type="file" aria-label="Upload media" accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,video/x-msvideo,video/x-matroska" disabled={uploading} onChange={async e => { const file = e.target.files[0]; if (!file) return; setUploading(true); setError(''); try { const body = new FormData(); body.append('media', file); const r = await api('/uploads', { method: 'POST', body }); update('media_url', r.media_url); } catch (err) { setError(err.message); } finally { setUploading(false); e.target.value = ''; } }} /></label></div><small className="muted">Images or video, up to 5MB. Support depends on the selected platform.</small>{form.media_url?.startsWith('uploads/') && <div className="uploaded-file"><Check size={14} /> Media uploaded <button className="text-button" onClick={() => update('media_url', '')}>Remove</button></div>}<label className="schedule-label">Give it a moment<input type="datetime-local" value={form.scheduled_at} onChange={e => update('scheduled_at', e.target.value)} /></label><p className="muted small-text">Scheduled time uses the server’s timezone (Africa/Lagos by default). Publishing runs when the background worker processes the queue.</p></fieldset></div><div className="composer-footer"><button className="button" disabled={busy || uploading || hasPublished} onClick={() => save('draft')}><FileText size={15} />Save draft</button><div><button className="button" disabled={busy || uploading || hasPublished} onClick={() => save('now')}><Send size={15} />Publish now</button><button className="button primary" disabled={busy || uploading || hasPublished} onClick={() => save('schedule')}><Clock3 size={15} />{busy ? 'Saving…' : 'Schedule post'}</button></div></div></section></div>;
}

const publicPath = location.pathname.replace(/\/+$/, '');
const legalPage = ['/privacy-policy', '/data-deletion', '/user-data-deletion'].includes(publicPath);
createRoot(document.getElementById('root')).render(<React.StrictMode>{legalPage ? <LegalPage deletion={publicPath !== '/privacy-policy'} /> : <App />}</React.StrictMode>);
