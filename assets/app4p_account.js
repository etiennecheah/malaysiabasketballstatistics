/* =========================================================================
   Accounts: sign-in, My page, player claims, self-edited profiles and the
   admin review queue.

   The site itself is a static file; everything here talks to a small
   Firebase project (Google sign-in + Firestore). The rule the whole feature
   is built on: nothing a signed-in person writes is public. People write
   REQUESTS (a claim, an edit); the admin approves them, and only then does
   the public part of a profile change. The Firestore security rules in
   firebase/firestore.rules enforce that, not this file.

   Until ACC_CFG is filled in the feature is switched off and the site looks
   exactly as it did. It is also off on any host that is not the live site
   (the claude.ai copy cannot reach Firebase).
   ========================================================================= */
// The web config of the user's Firebase project. These are public identifiers, not secrets:
// what protects the data is the security rules, not hiding these values.
const ACC_CFG = { apiKey: 'AIzaSyC48KaJxnXHm1j5HWWIKyldB9PSw2F4I1M', authDomain: 'hoopstatsmy.firebaseapp.com', projectId: 'hoopstatsmy', appId: '1:862709178167:web:48dbf78e8c6759105144b2' };
const ACC_IG = 'hoopstats_my';
const ACC_SDK = 'https://www.gstatic.com/firebasejs/12.19.0/';
const ACC_HOSTS = ['etiennecheah.github.io', 'localhost', '127.0.0.1'];
const ACC_ID = /^[A-Za-z0-9._-]{1,50}$/;
const ACC_SITES = [
  ['ig', 'Instagram', 'instagram.com/', v => 'https://www.instagram.com/' + v + '/', '@'],
  ['tt', 'TikTok', 'tiktok.com/@', v => 'https://www.tiktok.com/@' + v, '@'],
  ['yt', 'YouTube', 'youtube.com/@', v => 'https://www.youtube.com/@' + v, ''],
  ['fb', 'Facebook', 'facebook.com/', v => 'https://www.facebook.com/' + v, ''],
];
const ACC_AWARDS = ['Champion', 'MVP', 'Finals MVP', 'Top scorer', 'Top rebounder', 'Top assist', 'Top steal', 'Top block'];
const ACC = {
  on: false, state: 'out', user: null, me: null, claim: null, edit: null, admin: false,
  verified: null,   // pid -> true, the public index of verified profiles (null until it has loaded)
  pub: {}, pubWait: {}, modal: null, want: null, form: null, adm: null, toast: '', toastT: 0,
};
ACC.on = !!(window.__ACC_BACKEND__ || (ACC_CFG.projectId && ACC_HOSTS.includes(location.hostname)));

/* ---- small helpers ------------------------------------------------------ */
const accDay = ms => { const d = new Date(ms); return d.getDate() + ' ' + PV_M[d.getMonth()] + ' ' + d.getFullYear(); };
// the source writes a birthday as M/D/YY; requests and the public profile use YYYY-MM-DD
function accIso(s) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return s;
  const x = String(s || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!x) return '';
  let y = +x[3]; if (y < 100) y += y > 30 ? 1900 : 2000;
  return y + '-' + String(x[1]).padStart(2, '0') + '-' + String(x[2]).padStart(2, '0');
}
function accAge(iso) {
  const x = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); if (!x) return null;
  const n = new Date(); let a = n.getFullYear() - +x[1];
  if (n.getMonth() + 1 < +x[2] || (n.getMonth() + 1 === +x[2] && n.getDate() < +x[3])) a--;
  return a;
}
const accTick = '<i class="acc-tk" aria-hidden="true">✓</i>';
function accErr(e) {
  const c = (e && (e.code || e.message)) || '';
  if (/popup-closed|cancelled-popup/.test(c)) return '';
  if (/popup-blocked/.test(c)) return 'Your browser blocked the sign-in window. Allow pop-ups for this site and try again.';
  if (/permission-denied|insufficient permissions/i.test(c)) return 'That is not allowed for this account.';
  if (/requires-recent-login/.test(c)) return 'For safety, sign out, sign in again, and then repeat this.';
  if (/unavailable|network|Failed to fetch/i.test(c)) return 'No connection to the account service. Check your internet and try again.';
  return 'Something went wrong. Please try again.';
}
function accFlag(v) { try { if (v === undefined) return localStorage.getItem('hsmy_in') === '1'; v ? localStorage.setItem('hsmy_in', '1') : localStorage.removeItem('hsmy_in'); } catch (e) {} return false; }
function accToast(t) {
  ACC.toast = t; clearTimeout(ACC.toastT);
  let el = document.getElementById('acc-toast');
  if (!el) { el = document.createElement('div'); el.id = 'acc-toast'; el.className = 'acc-toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.textContent = t; el.classList.add('on');
  ACC.toastT = setTimeout(() => el.classList.remove('on'), 4200);
}
const accOnPage = re => re.test(location.hash);
function accRedraw() { if (document.getElementById('app') && typeof softRoute === 'function') softRoute(); }

/* ---- the backend -------------------------------------------------------- */
// Firestore's REST answers wrap every value in its type; unwrap to plain values.
function accPlain(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return +v.integerValue;
  if ('doubleValue' in v) return +v.doubleValue;
  if ('booleanValue' in v) return !!v.booleanValue;
  if ('timestampValue' in v) return Date.parse(v.timestampValue);
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(accPlain);
  if ('mapValue' in v) { const o = {}; Object.entries(v.mapValue.fields || {}).forEach(([k, x]) => { o[k] = accPlain(x); }); return o; }
  return null;
}
function accFirebase() {
  let auth, db, A, F, loading;
  const load = () => loading || (loading = Promise.all([import(ACC_SDK + 'firebase-app.js'), import(ACC_SDK + 'firebase-auth.js'), import(ACC_SDK + 'firebase-firestore.js')])
    .then(([appM, authM, fsM]) => { A = authM; F = fsM; const app = appM.initializeApp(ACC_CFG); auth = A.getAuth(app); db = F.getFirestore(app); })
    .catch(e => { loading = null; throw e; }));
  const ref = (col, id) => F.doc(db, col, id);
  return {
    async init(onAuth) { await load(); A.onAuthStateChanged(auth, u => onAuth(u ? { uid: u.uid, name: u.displayName || '', email: u.email || '', photo: u.photoURL || '' } : null)); },
    async signIn() { await load(); await A.signInWithPopup(auth, new A.GoogleAuthProvider()); },
    async signOut() { await load(); await A.signOut(auth); },
    async get(col, id) { await load(); const s = await F.getDoc(ref(col, id)); return s.exists() ? s.data() : null; },
    async set(col, id, data, merge) { await load(); await (merge ? F.setDoc(ref(col, id), data, { merge: true }) : F.setDoc(ref(col, id), data)); },
    async del(col, id) { await load(); await F.deleteDoc(ref(col, id)); },
    async list(col, q) {
      await load(); const parts = [];
      if (q && q.where) parts.push(F.where(q.where[0], '==', q.where[1]));
      if (q && q.orderBy) parts.push(F.orderBy(q.orderBy, 'desc'));
      if (q && q.limit) parts.push(F.limit(q.limit));
      const s = await F.getDocs(F.query(F.collection(db, col), ...parts));
      return s.docs.map(d => Object.assign({ id: d.id }, d.data()));
    },
    async count(col) { await load(); return (await F.getCountFromServer(F.collection(db, col))).data().count; },
    async batch(ops) { await load(); const b = F.writeBatch(db); ops.forEach(o => { if (o.op === 'del') b.delete(ref(o.col, o.id)); else if (o.merge) b.set(ref(o.col, o.id), o.data, { merge: true }); else b.set(ref(o.col, o.id), o.data); }); await b.commit(); },
    // the public documents are read with one plain request, so a visitor who never signs in loads no SDK
    async pubGet(col, id) {
      const r = await fetch('https://firestore.googleapis.com/v1/projects/' + encodeURIComponent(ACC_CFG.projectId) + '/databases/(default)/documents/' + col + '/' + encodeURIComponent(id) + '?key=' + encodeURIComponent(ACC_CFG.apiKey));
      if (r.status === 404) return null;
      if (!r.ok) throw new Error('unavailable');
      return accPlain({ mapValue: { fields: (await r.json()).fields || {} } });
    },
    async removeUser() { await load(); if (auth.currentUser) await A.deleteUser(auth.currentUser); },
  };
}
let ACCB = null, ACC_INIT = null;
const accB = () => ACCB || (ACCB = window.__ACC_BACKEND__ || accFirebase());
function accInit() { return ACC_INIT || (ACC_INIT = accB().init(accOnAuth).catch(e => { ACC_INIT = null; throw e; })); }

async function accOnAuth(u) {
  if (!u) {
    Object.assign(ACC, { state: 'out', user: null, me: null, claim: null, edit: null, admin: false, adm: null, form: null });
    accFlag(false); accRedraw(); return;
  }
  ACC.user = u; ACC.state = 'loading'; ACC.mineAt = Date.now(); accFlag(true);
  try {
    const B = accB();
    const [me, claim, edit] = await Promise.all([B.get('users', u.uid), B.get('claims', u.uid), B.get('edits', u.uid).catch(() => null)]);
    ACC.me = me; ACC.claim = claim; ACC.edit = edit;
    ACC.admin = await B.get('meta', 'admin').then(() => true, () => false);
    if (claim && claim.status === 'approved') accWantPub(claim.pid, true);
  } catch (e) { accToast(accErr(e)); }
  ACC.state = 'in';
  if (!ACC.me) accModal('welcome', { name: u.name || '', role: ACC.want && ACC.want.claim ? 'player' : 'fan', agree: false });
  else accAfterSignIn();
  accRedraw();
}
// whatever the person was trying to do when the sign-in dialog opened
function accAfterSignIn() {
  const w = ACC.want; ACC.want = null;
  if (ACC.modal && (ACC.modal.kind === 'signin' || ACC.modal.kind === 'welcome')) accModal(null);
  if (!w) return;
  if (w.claim) accClaimOpen(w.claim);
  else if (w.fav) accFav(w.fav[0], w.fav[1], true);
  else if (w.cmp) accCmpSave(w.cmp[0], w.cmp[1], true);
}

/* ---- the public side of a verified profile ------------------------------ */
async function accLoadVerified() {
  try {
    let hit = null;
    try { const c = JSON.parse(sessionStorage.getItem('hsmy_ver') || 'null'); if (c && Date.now() - c.t < 5 * 60e3) hit = c.d; } catch (e) {}
    if (!hit) {
      const d = await accB().pubGet('meta', 'verified');
      hit = (d && d.pids) || {};
      try { sessionStorage.setItem('hsmy_ver', JSON.stringify({ t: Date.now(), d: hit })); } catch (e) {}
    }
    ACC.verified = hit;
    if (accOnPage(/^#\/(p|compare|me)\b/)) accRedraw();
  } catch (e) { /* the site works without it: no badges, no claim button */ }
}
function accWantPub(pid, force) {
  if (!ACC.on || pid in ACC.pub || ACC.pubWait[pid]) return;
  if (!force && !(ACC.verified && ACC.verified[pid])) return;
  ACC.pubWait[pid] = true;
  accB().pubGet('profiles', pid).then(d => accSetPub(pid, d), () => { delete ACC.pubWait[pid]; });
}
function accSetPub(pid, d) {
  delete ACC.pubWait[pid];
  ACC.pub[pid] = d || null;
  if (typeof PV !== 'undefined') PV.data = null;
  if (ACC.form && ACC.form.pid === pid && !ACC.form.dirty) ACC.form = null;
  if (accOnPage(/^#\/(p|compare|me|admin)\b/)) accRedraw();
}
const accPubOf = pid => (ACC.on && ACC.pub[pid]) || null;
// an approved birthday, height or weight replaces the source's value wherever a bio is shown
function accOverBio(pid, bio) {
  accWantPub(pid);
  const p = accPubOf(pid); if (!p) return bio;
  if (p.dob && /^\d{4}-\d{2}-\d{2}$/.test(p.dob)) { const [y, m, d] = p.dob.split('-').map(Number); bio.dob = m + '/' + d + '/' + y; bio.age = accAge(p.dob); }
  if (+p.ht > 0) bio.ht = +p.ht;
  if (+p.wt > 0) bio.wt = +p.wt;
  return bio;
}
const accHonKey = h => h.year + '|' + h.short;
// approved honour changes: additions the player asked for, and removals
function accOverHon(pid, hon) {
  const p = accPubOf(pid); if (!p) return;
  const by = {};
  (p.honAdd || []).forEach(a => {
    const year = Math.round(+(a && a.year)), comp = String((a && a.comp) || '').slice(0, 60), team = String((a && a.team) || '').slice(0, 40);
    if (!comp || !(year >= 1950 && year <= new Date().getFullYear() + 1) || !ACC_AWARDS.includes(a.award)) return;
    const k = year + '|' + comp;
    const h = by[k] || (by[k] = { year, comp, short: comp, team, champ: false, awards: [], self: true });
    if (a.award === 'Champion') h.champ = true; else if (!h.awards.includes(a.award)) h.awards.push(a.award);
  });
  Object.values(by).forEach(h => hon.push(h));
  const hide = new Set(p.honHide || []);
  for (let i = hon.length - 1; i >= 0; i--) if (!hon[i].self && hide.has(accHonKey(hon[i]))) hon.splice(i, 1);
}
// what the hero and the overview add for a verified profile, and the claim button for one that is not
function accProfile(pid) {
  const o = { badge: '', claim: '', links: '', about: '', fav: '' };
  if (!ACC.on) return o;
  accWantPub(pid);
  const p = accPubOf(pid), mine = ACC.claim && ACC.claim.pid === pid ? ACC.claim.status : '';
  if (p) {
    o.badge = `<span class="acc-ver" title="This profile is looked after by the player">${accTick}Verified player</span>`;
    const L = ACC_SITES.filter(([k]) => p.links && ACC_ID.test(p.links[k] || ''));
    if (L.length) o.links = `<div class="acc-follow"><span class="k">Follow</span>${L.map(([k, label, , url, at]) =>
      `<a href="${esc(url(p.links[k]))}" target="_blank" rel="noopener nofollow"><i>${label}</i><b>${at}${esc(p.links[k])}</b><span aria-hidden="true">↗</span></a>`).join('')}</div>`;
    if (p.bio) o.about = pvSec('About', '', '', `<div class="acc-about"><p>${esc(p.bio)}</p>
      <div class="acc-about-by"><b>${accTick}Written by ${esc(PERSONS[pid])}</b><span>The bio and links come from the player. The stats come from official box scores and cannot be edited.</span></div></div>`);
  }
  // the index says "verified" before the profile itself has arrived: wait rather than offer a claim
  const known = !!ACC.verified && (!ACC.verified[pid] || pid in ACC.pub);
  if (mine === 'approved') o.claim = `<a class="acc-claim" href="#/me/edit"><span>Your profile</span><b>Edit</b></a>`;
  else if (mine === 'pending') o.claim = `<button type="button" class="acc-claim" data-acc="pending"><span>Your claim</span><b>Waiting for review</b></button>`;
  else if (known && !p && !(ACC.claim && /^(approved|pending)$/.test(ACC.claim.status)))
    o.claim = `<button type="button" class="acc-claim" data-acc="claim" data-pid="${esc(pid)}"><span>Is this you?</span><b>Claim this profile</b></button>`;
  o.fav = accFavBtn('p', pid);
  return o;
}

/* ---- favourites and saved comparisons ----------------------------------- */
const accHas = (kind, id) => !!(ACC.me && (kind === 'p' ? ACC.me.favPlayers : ACC.me.favTeams || []).includes(id));
function accFavBtn(kind, id, cls) {
  if (!ACC.on) return '';
  const on = accHas(kind, id), what = kind === 'p' ? 'players' : 'teams';
  return `<button type="button" class="acc-fav ${on ? 'on' : ''} ${cls || ''}" data-acc="fav" data-kind="${kind}" data-id="${esc(id)}" aria-pressed="${on}">${on ? '★ In my ' + what : '☆ Add to my ' + what}</button>`;
}
function accCmpBtn(a, b) {
  if (!ACC.on || !a || !b) return '';
  const on = !!(ACC.me && (ACC.me.compares || []).some(x => x === a + '|' + b || x === b + '|' + a));
  return `<button type="button" class="cmp-swap acc-cmp ${on ? 'on' : ''}" data-acc="cmp" data-a="${esc(a)}" data-b="${esc(b)}" aria-pressed="${on}">${on ? '★ Saved' : '☆ Save comparison'}</button>`;
}
async function accSaveMe(next, done) {
  const prev = ACC.me; ACC.me = next; accRedraw();
  try { await accB().set('users', ACC.user.uid, next); if (done) accToast(done); }
  catch (e) { ACC.me = prev; accRedraw(); accToast(accErr(e)); }
}
function accNeedSignIn(want) {
  if (ACC.state === 'in' && ACC.me) return false;
  ACC.want = want;
  if (ACC.state === 'in' && !ACC.me) accModal('welcome', { name: ACC.user.name || '', role: 'fan', agree: false });
  else accModal('signin', {});
  return true;
}
function accFav(kind, id, addOnly) {
  if (accNeedSignIn({ fav: [kind, id] })) return;
  const key = kind === 'p' ? 'favPlayers' : 'favTeams', cap = kind === 'p' ? 60 : 40, list = (ACC.me[key] || []).slice(), i = list.indexOf(id);
  if (i >= 0 && addOnly) return;
  if (i >= 0) list.splice(i, 1); else { if (list.length >= cap) { accToast('That list is full. Remove one first.'); return; } list.unshift(id); }
  accSaveMe(Object.assign({}, ACC.me, { [key]: list }), i >= 0 ? 'Removed from My page.' : 'Added to My page.');
}
function accCmpSave(a, b, addOnly) {
  if (accNeedSignIn({ cmp: [a, b] })) return;
  const list = (ACC.me.compares || []).slice(), i = list.findIndex(x => x === a + '|' + b || x === b + '|' + a);
  if (i >= 0 && addOnly) return;
  if (i >= 0) list.splice(i, 1); else { if (list.length >= 40) { accToast('That list is full. Remove one first.'); return; } list.unshift(a + '|' + b); }
  accSaveMe(Object.assign({}, ACC.me, { compares: list }), i >= 0 ? 'Comparison removed.' : 'Comparison saved to My page.');
}

/* ---- header ------------------------------------------------------------- */
function accAvatar(cls) {
  const n = (ACC.me && ACC.me.displayName) || (ACC.user && ACC.user.name) || '';
  return `<span class="acc-av ${cls || ''}">${esc(initials(n))}</span>`;
}
function accNav() {
  if (!ACC.on) return '';
  if (ACC.state === 'in') return `<a class="acc-chip ${accOnPage(/^#\/(me|admin)\b/) ? 'on' : ''}" href="#/me">${accAvatar()}My page</a>`;
  if (ACC.state === 'loading') return `<span class="acc-chip wait" aria-hidden="true"><span class="acc-av"></span>My page</span>`;
  return `<button type="button" class="acc-in" data-acc="signin">Sign in</button>`;
}

/* ---- dialogs ------------------------------------------------------------ */
function accModal(kind, data) {
  ACC.modal = kind ? Object.assign({ kind, err: '' }, data || {}) : null;
  // load the account service as the dialog opens, so the Google window can open straight from the click
  if (kind === 'signin' && ACC.on) accInit().catch(() => {});
  accDrawModal();
}
function accDrawModal() {
  let el = document.getElementById('acc-modal');
  if (!ACC.modal) { if (el) el.remove(); document.documentElement.classList.remove('acc-lock'); return; }
  if (!el) { el = document.createElement('div'); el.id = 'acc-modal'; el.className = 'acc-ov'; document.body.appendChild(el); }
  el.innerHTML = `<div class="acc-dlg ${ACC.modal.kind === 'claim' ? 'wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="acc-dt">${accModalBody(ACC.modal)}</div>`;
  document.documentElement.classList.add('acc-lock');
  const f = el.querySelector('[data-autofocus]'); if (f) f.focus();
}
const accErrLine = m => m.err ? `<p class="acc-err" role="alert">${esc(m.err)}</p>` : '';
const accBusy = m => m.busy ? ' disabled' : '';
function accWho() {
  return `<div class="acc-who">${accAvatar()}<div><b>${esc(ACC.user.name || 'Google account')}</b><span>${esc(ACC.user.email)}</span></div>
    <button type="button" class="acc-link" data-acc="switch">Switch account</button></div>`;
}
function accCodeBox(code) {
  return `<div class="acc-code"><span id="acc-code">${esc(code)}</span><button type="button" class="acc-btn line" data-acc="copy" data-copy="${esc(code)}">Copy code</button></div>`;
}
function accSteps(st) {
  const S = [['Claim sent', ''], ['Send the code on Instagram', 'From your own account, to @' + ACC_IG + '.'], ['Checked by HoopStatsMY', 'A person looks at every claim.'], ['Verified', 'You can add a bio and your social links.']];
  const at = st === 'approved' ? 4 : 1;
  return `<ol class="acc-steps">${S.map(([t, s], i) => `<li class="${i < at ? 'done' : i === at ? 'now' : ''}"><i>${i < at ? '✓' : ''}</i><div><b>${t}</b>${s ? `<span>${s}</span>` : ''}</div></li>`).join('')}</ol>`;
}
function accModalBody(m) {
  if (m.kind === 'signin') {
    const nm = m.pid ? PERSONS[m.pid] : '';
    return `${nm ? `<div class="acc-eyebrow">Claim this profile</div><h2 id="acc-dt">${esc(nm)}</h2>
        <p>Sign in so we know who is asking. You only need an account to claim a profile or keep favourites. Everything else on HoopStatsMY stays open to everyone.</p>`
      : `<h2 id="acc-dt">Sign in or sign up</h2><p>One button does both. If it is your first time, we set up your account in the next step.</p>`}
      <button type="button" class="acc-btn dark big" data-acc="google" data-autofocus${accBusy(m)}>${m.busy ? 'Opening Google…' : 'Continue with Google'}</button>
      ${accErrLine(m)}
      <div class="acc-box"><b>With an account you can</b>
        <span>${accTick}Keep your favourite players and teams on one page.</span>
        <span>${accTick}Save player comparisons to come back to.</span>
        <span>${accTick}Claim your own profile, if you are a player.</span></div>
      <p class="acc-fine">We get your name, email address and profile picture from Google. Your email is never shown on the site. All stats stay free to view without an account.</p>
      <div class="acc-foot"><a href="#/privacy">Privacy notice</a><button type="button" class="acc-link" data-acc="close">Not now</button></div>`;
  }
  if (m.kind === 'welcome') {
    return `<h2 id="acc-dt">Welcome to HoopStatsMY</h2><p>Two quick things and your account is ready.</p>
      ${accWho()}
      <label class="acc-f"><span>Display name</span>
        <input type="text" maxlength="40" value="${esc(m.name || '')}" data-accf="m.name" data-autofocus placeholder="What should we call you?" autocomplete="nickname">
        <em>Only you see it for now. You can change it later.</em></label>
      <fieldset class="acc-f"><legend>I am here as</legend>
        <div class="acc-pick">
          <label><input type="radio" name="accrole" value="fan" data-accf="m.role" ${m.role !== 'player' ? 'checked' : ''}><span><b>A fan</b>Follow players and teams.</span></label>
          <label><input type="radio" name="accrole" value="player" data-accf="m.role" ${m.role === 'player' ? 'checked' : ''}><span><b>A player</b>Next step: find and claim your profile.</span></label>
        </div></fieldset>
      <label class="acc-chk"><input type="checkbox" data-accf="m.agree" ${m.agree ? 'checked' : ''}><span>I agree to the <a href="#/privacy" target="_blank" rel="noopener">site rules and privacy notice</a>.</span></label>
      ${accErrLine(m)}
      <button type="button" class="acc-btn big" data-acc="welcome-go"${accBusy(m)}>Create my account</button>
      <div class="acc-foot"><span></span><button type="button" class="acc-link" data-acc="signout">Not now, sign me out</button></div>`;
  }
  if (m.kind === 'claim') {
    const nm = PERSONS[m.pid], d = pvData(m.pid);
    const team = (d.rows[0] && d.rows[0].p.team) || '', b = d.bio || {};
    return `<h2 id="acc-dt">Claim this profile</h2><p>Three short steps. We check every claim by hand before anything changes on the profile.</p>
      <h3 class="acc-step done"><i>✓</i>Signed in</h3>
      ${accWho()}
      <h3 class="acc-step"><i>2</i>Confirm the profile</h3>
      <div class="acc-prof">${PHOTOS[m.pid] ? `<img src="${PHOTOS[m.pid]}" alt="">` : `<span class="acc-av lg">${esc(initials(nm))}</span>`}
        <div><b>${esc(nm)}</b><span>${[team ? esc(pvCase(team)) : '', has(b.num) ? '#' + esc(b.num) : '', b.pos ? esc(PV_POS[b.pos] || b.pos) : ''].filter(Boolean).join(' · ')}</span></div></div>
      <label class="acc-chk"><input type="checkbox" data-accf="m.isMe" ${m.isMe ? 'checked' : ''}><span>I am ${esc(nm)}, and this is my profile.</span></label>
      <h3 class="acc-step"><i>3</i>Show it is you</h3>
      <div class="acc-ig">
        <p>Send this code to <b>@${ACC_IG}</b> in an Instagram message, from your own account.</p>
        ${accCodeBox(m.code)}
        <label class="acc-f"><span>Your Instagram ID</span>
          <input type="text" maxlength="31" value="${esc(m.ig || '')}" data-accf="m.ig" placeholder="@your_instagram_id" autocomplete="off" autocapitalize="off" spellcheck="false">
          <em>We match the message to this ID, so use the account you will send it from.</em></label>
        <a class="acc-btn line" href="https://www.instagram.com/${ACC_IG}/" target="_blank" rel="noopener">Open @${ACC_IG} <span aria-hidden="true">↗</span></a>
      </div>
      <label class="acc-chk"><input type="checkbox" data-accf="m.agree" ${m.agree ? 'checked' : ''}><span>I agree to the <a href="#/privacy" target="_blank" rel="noopener">profile rules and privacy notice</a>.</span></label>
      ${accErrLine(m)}
      <div class="acc-acts"><button type="button" class="acc-btn big" data-acc="claim-send"${accBusy(m)}>Send claim</button><button type="button" class="acc-link" data-acc="close">Cancel</button></div>
      <p class="acc-fine">We never ask for your IC, passport or any other document.</p>`;
  }
  if (m.kind === 'pending') {
    const c = ACC.claim || {};
    return `<span class="acc-pill wait">Claim pending</span><h2 id="acc-dt">Claim sent. One thing left to do.</h2>
      <p>Send this code to <b>@${ACC_IG}</b> in an Instagram message, from <b>@${esc(c.igId || '')}</b>.</p>
      ${accCodeBox(c.code || '')}
      ${accSteps('pending')}
      <div class="acc-box plain">The public profile of ${esc(c.name || '')} stays exactly as it is until the claim is approved. The result shows on My page.</div>
      ${accErrLine(m)}
      <div class="acc-acts"><a class="acc-btn dark big" href="https://www.instagram.com/${ACC_IG}/" target="_blank" rel="noopener">Open @${ACC_IG} ↗</a>
        <button type="button" class="acc-link danger" data-acc="ask" data-ask="withdraw">Withdraw claim</button></div>
      <div class="acc-foot"><span></span><button type="button" class="acc-link" data-acc="close">Close</button></div>`;
  }
  if (m.kind === 'name') {
    return `<h2 id="acc-dt">Display name</h2>
      <label class="acc-f"><span>Display name</span><input type="text" maxlength="40" value="${esc(m.name || '')}" data-accf="m.name" data-autofocus autocomplete="nickname"></label>
      ${accErrLine(m)}
      <div class="acc-acts"><button type="button" class="acc-btn big" data-acc="name-save"${accBusy(m)}>Save</button><button type="button" class="acc-link" data-acc="close">Cancel</button></div>`;
  }
  if (m.kind === 'ask') {
    return `<h2 id="acc-dt">${esc(m.title)}</h2><p>${esc(m.text)}</p>${accErrLine(m)}
      <div class="acc-acts"><button type="button" class="acc-btn big ${m.danger ? 'danger' : ''}" data-acc="ask-yes"${accBusy(m)}>${esc(m.yes)}</button><button type="button" class="acc-link" data-acc="close" data-autofocus>Cancel</button></div>`;
  }
  return '';
}
const ACC_ASK = {
  withdraw: { title: 'Withdraw your claim?', text: 'The claim is deleted. You can claim a profile again later.', yes: 'Withdraw claim', danger: true },
  account: { title: 'Delete your account?', text: 'Your display name, favourites, saved comparisons and any claim are deleted. If you are a verified player, your bio and links come off your profile too. This cannot be undone.', yes: 'Delete my account', danger: true },
  unlink: { title: 'Unlink from this profile?', text: 'The verified badge, your bio and your links come off the profile straight away, and any approved corrections are dropped. You can claim it again later.', yes: 'Unlink me', danger: true },
  clear: { title: 'Remove your bio and links?', text: 'They come off your profile straight away. The verified badge and approved corrections stay.', yes: 'Remove them', danger: true },
};
function accClaimOpen(pid) {
  if (accNeedSignIn({ claim: pid })) { if (ACC.modal && ACC.modal.kind === 'signin') { ACC.modal.pid = pid; accDrawModal(); } return; }
  if (ACC.claim && ACC.claim.status === 'pending') { accModal('pending', {}); return; }
  if (ACC.claim && ACC.claim.status === 'approved') { accToast('Your account is already linked to a profile.'); return; }
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let code = 'HS-';
  const rnd = new Uint32Array(4); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(rnd) : rnd.forEach((_, i) => { rnd[i] = Math.random() * 4294967296; });
  rnd.forEach(n => { code += abc[n % abc.length]; });
  accModal('claim', { pid, code, ig: '', isMe: false, agree: false });
}
async function accDo(fn, okToast) {
  const m = ACC.modal; if (m) { m.busy = true; m.err = ''; accDrawModal(); }
  try { await fn(); if (okToast) accToast(okToast); return true; }
  catch (e) { const t = accErr(e); if (ACC.modal === m && m) { m.busy = false; m.err = t; accDrawModal(); } else if (t) accToast(t); return false; }
}

/* ---- current values, and what a request would change --------------------- */
function accBio0(pid) {
  const bios = BIO[pid] || {};
  const rows = (CAREER[pid] || []).filter(r => hasStats(r.p) && r.p.g).sort((a, b) => (b.c.year || 0) - (a.c.year || 0) || (b.c.start || '').localeCompare(a.c.start || ''));
  return rows.map(r => bios[r.c.id]).find(Boolean) || Object.values(bios)[0] || {};
}
const accBase = pid => { const b = accBio0(pid); return { dob: accIso(b.dob), ht: +b.ht || 0, wt: +b.wt || 0 }; };
function accCurrent(pid, pub) {
  const base = accBase(pid), p = pub === undefined ? accPubOf(pid) : pub;
  return { bio: (p && p.bio) || '', links: Object.assign({ ig: '', tt: '', yt: '', fb: '' }, (p && p.links) || {}),
    dob: (p && p.dob) || base.dob, ht: (p && +p.ht) || base.ht, wt: (p && +p.wt) || base.wt,
    honAdd: ((p && p.honAdd) || []).slice(), honHide: ((p && p.honHide) || []).slice(), base };
}
const accAddKey = a => a.year + '|' + a.comp + '|' + a.award;
const accAddTxt = a => a.year + ' ' + a.comp + ' · ' + a.award + (a.team ? ' · ' + a.team : '');
// one line per thing a request would change; the admin approves or rejects each line
function accDiff(cur, req) {
  const L = [];
  if ((req.bio || '') !== (cur.bio || '')) L.push({ k: 'bio', label: 'Bio', from: cur.bio || '', to: req.bio || '' });
  ACC_SITES.forEach(([k, label, base]) => { const a = cur.links[k] || '', b = (req.links || {})[k] || ''; if (a !== b) L.push({ k: 'l.' + k, label, from: a ? base + a : '', to: b ? base + b : '', raw: b }); });
  if ((req.dob || '') !== (cur.dob || '')) L.push({ k: 'dob', label: 'Birthday', from: cur.dob ? pvDay(cur.dob) : '', to: req.dob ? pvDay(req.dob) : '' });
  if ((+req.ht || 0) !== (+cur.ht || 0)) L.push({ k: 'ht', label: 'Height', from: cur.ht ? cur.ht + ' cm' : '', to: req.ht ? req.ht + ' cm' : '' });
  if ((+req.wt || 0) !== (+cur.wt || 0)) L.push({ k: 'wt', label: 'Weight', from: cur.wt ? cur.wt + ' kg' : '', to: req.wt ? req.wt + ' kg' : '' });
  const ca = new Set(cur.honAdd.map(accAddKey)), ra = new Set((req.honAdd || []).map(accAddKey));
  (req.honAdd || []).forEach(a => { if (!ca.has(accAddKey(a))) L.push({ k: 'add.' + accAddKey(a), label: 'New honour', from: '', to: accAddTxt(a), note: a.note || '', add: a }); });
  cur.honAdd.forEach(a => { if (!ra.has(accAddKey(a))) L.push({ k: 'del.' + accAddKey(a), label: 'Remove honour', from: accAddTxt(a), to: '', del: a }); });
  const ch = new Set(cur.honHide), rh = new Set(req.honHide || []);
  rh.forEach(k => { if (!ch.has(k)) L.push({ k: 'hide.' + k, label: 'Remove honour', from: k.replace('|', ' '), to: '', hide: k }); });
  ch.forEach(k => { if (!rh.has(k)) L.push({ k: 'show.' + k, label: 'Restore honour', from: '', to: k.replace('|', ' '), show: k }); });
  return L;
}
// the public profile after the chosen lines are applied
function accApply(cur, lines) {
  const base = cur.base, o = { bio: cur.bio, links: Object.assign({}, cur.links), dob: cur.dob === base.dob ? '' : cur.dob, ht: cur.ht === base.ht ? 0 : cur.ht, wt: cur.wt === base.wt ? 0 : cur.wt,
    honAdd: cur.honAdd.map(a => ({ year: +a.year, comp: a.comp, award: a.award, team: a.team || '' })), honHide: cur.honHide.slice() };
  lines.forEach(l => {
    if (l.k === 'bio') o.bio = l.to;
    else if (l.k.startsWith('l.')) o.links[l.k.slice(2)] = l.raw || '';
    else if (l.k === 'dob') o.dob = l.req === base.dob ? '' : l.req;
    else if (l.k === 'ht') o.ht = l.req === base.ht ? 0 : l.req;
    else if (l.k === 'wt') o.wt = l.req === base.wt ? 0 : l.req;
    else if (l.add) o.honAdd.push({ year: +l.add.year, comp: l.add.comp, award: l.add.award, team: l.add.team || '' });
    else if (l.del) o.honAdd = o.honAdd.filter(a => accAddKey(a) !== accAddKey(l.del));
    else if (l.hide) o.honHide.push(l.hide);
    else if (l.show) o.honHide = o.honHide.filter(k => k !== l.show);
  });
  return o;
}

/* ---- My page ------------------------------------------------------------ */
// a claim or request may have been decided since this page loaded: look again, at most twice a minute
async function accRefreshMine() {
  if (ACC.state !== 'in' || !ACC.me || Date.now() - (ACC.mineAt || 0) < 30e3) return;
  ACC.mineAt = Date.now();
  try {
    const B = accB(), uid = ACC.user.uid, was = JSON.stringify([ACC.claim, ACC.edit]);
    const [claim, edit] = await Promise.all([B.get('claims', uid), B.get('edits', uid).catch(() => null)]);
    if (JSON.stringify([claim, edit]) === was || !ACC.user || ACC.user.uid !== uid) return;
    ACC.claim = claim; ACC.edit = edit;
    if (claim && claim.status === 'approved') { delete ACC.pub[claim.pid]; accWantPub(claim.pid, true); }
    if (ACC.form && !ACC.form.dirty) ACC.form = null;
    if (accOnPage(/^#\/me\b/)) accRedraw();
  } catch (e) {}
}
function accLatest(pid) {
  let g = null;
  (BOX_BY_PID[pid] || []).forEach(mid => { const x = GAME_BY_MID[mid]; if (x && x.date && (!g || x.date > g.date)) g = x; });
  if (!g) return null;
  const b = getBox(g.mid), l = b && b.p.find(x => x.pid === pid); if (!l) return null;
  const home = l.team === g.h, own = home ? g.hs : g.as, opp = home ? g.as : g.hs;
  return { g, l, win: own > opp, own, opp, oppName: pvCase(home ? g.a : g.h) };
}
function accTeamGames(t) {
  const N = new Set([...t.names].map(n => n.toLowerCase())), is = g => N.has(String(g.h).toLowerCase()) || N.has(String(g.a).toLowerCase());
  const line = g => { const home = N.has(String(g.h).toLowerCase()); return { g, home, own: home ? g.hs : g.as, opp: home ? g.as : g.hs, oppName: pvCase(home ? g.a : g.h) }; };
  const last = hmCompleted().find(is), next = hmUpcoming().find(is);
  return { last: last ? line(last) : null, next: next ? line(next) : null };
}
const accWL = x => `<b class="${x.own > x.opp ? 'w' : 'l'}">${x.own > x.opp ? 'W' : 'L'} ${x.own}–${x.opp}</b>`;
function accShell(head, body) { return `<div class="acc-pg">${head}<div class="page acc-page">${body}</div></div>`; }
function accGate(title, text, btn) {
  return accShell('', `<div class="acc-gate"><h1 class="page-title">${title}</h1><p>${text}</p>${btn || ''}</div>`);
}
function renderMe() {
  if (!ACC.on) return accGate('Accounts', 'Signing in works on the live site only. This copy of HoopStatsMY shows the stats without accounts.');
  if (ACC.state === 'loading') return accGate('My page', 'Loading your account…');
  if (ACC.state !== 'in') return accGate('My page', 'Sign in to keep your favourite players and teams on one page, save comparisons, or claim your own player profile.', `<button type="button" class="acc-btn big" data-acc="signin">Sign in or sign up</button>`);
  if (!ACC.me) return accGate('My page', 'Finish setting up your account to open My page.', `<button type="button" class="acc-btn big" data-acc="welcome">Finish sign-up</button>`);
  accRefreshMine();
  const me = ACC.me, c = ACC.claim, isPlayer = c && c.status === 'approved';
  const head = `<section class="acc-hero"><div class="acc-hero-in">${accAvatar('xl')}
      <div class="acc-hero-id"><h1 class="page-title">${esc(me.displayName)}</h1><span>${isPlayer ? 'Player account' : 'Fan account'} · only you can see this page</span></div>
      <button type="button" class="acc-btn ghost" data-acc="name">Edit display name</button></div></section>`;

  let claim = '';
  if (c) {
    const nm = esc(PERSONS[c.pid] || c.name || ''), link = `<a href="#/p/${esc(c.pid)}">${nm}</a>`;
    const e = ACC.edit && ACC.edit.pid === c.pid ? ACC.edit : null;
    claim = c.status === 'approved' ? `<section class="acc-card acc-mine"><div class="acc-mine-h">${PHOTOS[c.pid] ? `<img src="${PHOTOS[c.pid]}" alt="">` : `<span class="acc-av lg">${esc(initials(c.name || ''))}</span>`}
          <div><span class="acc-ver">${accTick}Verified player</span><h2>${link}</h2></div></div>
        ${e ? `<p class="acc-state ${e.status}">${e.status === 'pending' ? 'Your changes sent on ' + accDay(e.createdAt) + ' are waiting for approval.'
          : e.status === 'approved' ? 'Your last changes were approved' + (e.of && e.applied < e.of ? ' in part (' + e.applied + ' of ' + e.of + ')' : '') + '.'
          : 'Your last changes were not approved.'}${e.note ? ' Note from HoopStatsMY: “' + esc(e.note) + '”' : ''}</p>` : ''}
        <div class="acc-acts"><a class="acc-btn" href="#/me/edit">Edit my profile</a><a class="acc-btn line" href="#/p/${esc(c.pid)}">View public profile</a></div></section>`
      : c.status === 'pending' ? `<section class="acc-card acc-mine"><span class="acc-pill wait">Claim pending</span><h2>${link}</h2>
        <p>Send the code <b class="acc-mono">${esc(c.code)}</b> to <b>@${ACC_IG}</b> on Instagram from <b>@${esc(c.igId)}</b>. We check every claim by hand.</p>
        <div class="acc-acts"><button type="button" class="acc-btn" data-acc="pending">Show the steps</button></div></section>`
      : `<section class="acc-card acc-mine"><span class="acc-pill no">${c.status === 'revoked' ? 'Verification removed' : 'Claim not approved'}</span><h2>${link}</h2>
        <p>${c.note ? 'Note from HoopStatsMY: “' + esc(c.note) + '”' : 'HoopStatsMY could not confirm this claim.'} You can clear it and claim again.</p>
        <div class="acc-acts"><button type="button" class="acc-btn line" data-acc="claim-clear">Clear this claim</button></div></section>`;
  }

  const players = (me.favPlayers || []).filter(p => PERSONS[p]);
  const pl = players.length ? `<div class="acc-grid g3">${players.map(pid => {
      const x = accLatest(pid), team = x ? x.l.team : '';
      return `<article class="acc-card acc-p"><div class="acc-p-h">${PHOTOS[pid] ? `<img src="${PHOTOS[pid]}" alt="">` : `<span class="acc-av lg">${esc(initials(PERSONS[pid]))}</span>`}
          <div><a href="#/p/${pid}">${esc(PERSONS[pid])}</a><span>${esc(pvCase(team) || '')}</span></div>
          <button type="button" class="acc-x" data-acc="fav" data-kind="p" data-id="${pid}" aria-label="Remove ${esc(PERSONS[pid])} from my players">×</button></div>
        ${x ? `<div class="acc-p-g"><span class="k">Latest game · ${pvDay(x.g.date, false)}</span><a href="#/c/${x.g.cid}/box/${x.g.mid}">${accWL(x)} vs ${esc(x.oppName)}</a>
          <div class="acc-p-s"><span><b>${x.l.pts}</b>PTS</span><span><b>${pvReb(x.l)}</b>REB</span><span><b>${x.l.ast}</b>AST</span></div></div>`
          : `<div class="acc-p-g"><span class="k">No box score yet</span></div>`}</article>`; }).join('')}</div>`
    : `<div class="acc-empty">No players yet. Open any <a href="#/players">player</a> and press “☆ Add to my players”.</div>`;

  const teams = (me.favTeams || []).map(s => teamBySlug(s)).filter(Boolean);
  const tm = teams.length ? `<div class="acc-grid g2">${teams.map(t => {
      const x = accTeamGames(t);
      return `<article class="acc-card acc-t"><div class="acc-p-h">${crest(t.name, 44)}<div><a href="#/t/${encodeURIComponent(t.slug)}">${esc(t.name)}</a></div>
          <button type="button" class="acc-x" data-acc="fav" data-kind="t" data-id="${esc(t.slug)}" aria-label="Remove ${esc(t.name)} from my teams">×</button></div>
        <dl class="acc-t-g"><dt>Last</dt><dd>${x.last ? `<a href="#/c/${x.last.g.cid}/box/${x.last.g.mid}">${accWL(x.last)}</a> vs ${esc(x.last.oppName)} · ${pvDay(x.last.g.date, false)}` : '<span class="dim">No result yet</span>'}</dd>
          <dt>Next</dt><dd>${x.next ? `<b>${esc(hmDate(x.next.g, true))}, ${esc(x.next.g.time || '')}</b> vs ${esc(x.next.oppName)}` : '<span class="dim">No game scheduled</span>'}</dd></dl></article>`; }).join('')}</div>`
    : `<div class="acc-empty">No teams yet. Open any <a href="#/teams">team</a> and press “☆ Add to my teams”.</div>`;

  const cmps = (me.compares || []).map(s => s.split('|')).filter(([a, b]) => PERSONS[a] && PERSONS[b]);
  const cm = cmps.length ? `<div class="acc-card acc-list">${cmps.map(([a, b]) => `<div><a href="#/compare/${a}/${b}"><b class="a">${esc(PERSONS[a])}</b><em>vs</em><b class="b">${esc(PERSONS[b])}</b></a>
        <button type="button" class="acc-x" data-acc="cmp" data-a="${a}" data-b="${b}" aria-label="Remove this comparison">×</button></div>`).join('')}</div>`
    : `<div class="acc-empty">Nothing saved yet. On the <a href="#/compare">Compare</a> page, press “☆ Save comparison”.</div>`;

  const side = `${ACC.admin ? `<section class="acc-card acc-adm"><h2>Admin</h2><p>Claims and profile changes wait here for your approval.</p><a class="acc-btn" href="#/admin">Open the review queue</a></section>` : ''}
    ${!c ? `<section class="acc-card acc-cta"><h2>Are you a player?</h2><p>Claim your profile to add a bio and your social links, and to correct your birthday, height, weight and honours.</p>
      <a class="acc-btn" href="#/players">Find my profile</a><span class="acc-fine">Open your profile, then press “Claim this profile”.</span></section>` : ''}
    <section class="acc-card"><h2>Account</h2>
      <dl class="acc-dl"><dt>Display name</dt><dd><b>${esc(me.displayName)}</b></dd>
        <dt>Google account</dt><dd>${esc(ACC.user.email)}<span class="acc-fine">Never shown on the site</span></dd>
        <dt>Member since</dt><dd>${accDay(me.createdAt)}</dd></dl>
      <div class="acc-foot"><button type="button" class="acc-btn line" data-acc="signout">Sign out</button><button type="button" class="acc-link danger" data-acc="ask" data-ask="account">Delete my account</button></div>
      <a class="acc-fine" href="#/privacy">Site rules and privacy notice</a></section>`;

  return accShell(head, `<div class="acc-cols"><div class="acc-main">${claim}
      <section class="acc-sec"><div class="acc-sec-h"><h2>Your players</h2><a href="#/players">Add a player</a></div>${pl}</section>
      <section class="acc-sec"><div class="acc-sec-h"><h2>Your teams</h2><a href="#/teams">Add a team</a></div>${tm}</section>
      <section class="acc-sec"><div class="acc-sec-h"><h2>Saved comparisons</h2><a href="#/compare">New comparison</a></div>${cm}</section>
    </div><aside class="acc-side">${side}</aside></div>`);
}

/* ---- the player's edit page --------------------------------------------- */
function accFormInit(pid) {
  const cur = accCurrent(pid);
  const src = ACC.edit && ACC.edit.status === 'pending' && ACC.edit.pid === pid ? ACC.edit : cur;
  ACC.form = { pid, bio: src.bio || '', links: Object.assign({ ig: '', tt: '', yt: '', fb: '' }, src.links || {}), dob: src.dob || '', ht: +src.ht || '', wt: +src.wt || '',
    honAdd: (src.honAdd || []).map(a => Object.assign({}, a)), honHide: (src.honHide || []).slice(),
    draft: { year: '', comp: '', award: 'Champion', team: '', note: '' }, err: '', dirty: false, busy: false };
}
// the request the form would send, cleaned up
function accFormReq() {
  const f = ACC.form, links = {};
  ACC_SITES.forEach(([k]) => { links[k] = String(f.links[k] || '').trim().replace(/^@/, ''); });
  const bio = String(f.bio || '').replace(/(https?:\/\/|www\.)\S+/gi, '').replace(/\+?\d[\d\s-]{7,}\d/g, '').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, ' ').trim().slice(0, 280);
  return { pid: f.pid, name: PERSONS[f.pid] || '', status: 'pending', createdAt: Date.now(), bio, links, dob: f.dob || '', ht: +f.ht || 0, wt: +f.wt || 0,
    honAdd: f.honAdd.map(a => ({ year: +a.year, comp: a.comp, award: a.award, team: a.team || '', note: a.note || '' })), honHide: f.honHide.slice() };
}
function accFormCheck(req) {
  for (const [k, label] of ACC_SITES) if (req.links[k] && !ACC_ID.test(req.links[k])) return label + ': use the account name only, with letters, numbers, dots, dashes or underscores.';
  if (req.dob) { const a = accAge(req.dob); if (a == null || a < 5 || a > 90) return 'Check the birthday.'; }
  if (req.ht && (req.ht < 100 || req.ht > 250)) return 'Height should be between 100 and 250 cm.';
  if (req.wt && (req.wt < 30 || req.wt > 200)) return 'Weight should be between 30 and 200 kg.';
  return '';
}
function accEditLines() { return accDiff(accCurrent(ACC.form.pid), accFormReq()); }
function accEditSummary() {
  const L = accEditLines();
  return { n: L.length, html: L.length ? L.map(l => `<li><b>${esc(l.label)}</b><span>${l.from ? esc(l.from) : '<i>none</i>'} → ${l.to ? esc(l.to) : '<i>removed</i>'}</span></li>`).join('') : '<li class="dim">Nothing changed yet.</li>' };
}
function renderMeEdit() {
  if (!ACC.on) return renderMe();
  if (ACC.state !== 'in' || !ACC.me) return renderMe();
  const c = ACC.claim;
  if (!c || c.status !== 'approved') return accGate('Edit your profile', 'Only a verified player can edit a profile. Claim your profile first; once HoopStatsMY approves it, this page opens.', `<a class="acc-btn big" href="#/me">Back to My page</a>`);
  const pid = c.pid;
  accRefreshMine();
  accWantPub(pid, true);
  if (!(pid in ACC.pub)) return accGate('Edit your profile', 'Loading your profile…');
  if (!ACC.form || ACC.form.pid !== pid) accFormInit(pid);
  const f = ACC.form, cur = accCurrent(pid), d = pvData(pid), e = ACC.edit && ACC.edit.pid === pid ? ACC.edit : null, sum = accEditSummary();
  const nm = PERSONS[pid], team = (d.rows[0] && d.rows[0].p.team) || '', b = d.bio || {};
  const head = `<section class="acc-hero"><div class="acc-hero-in">${PHOTOS[pid] ? `<img class="acc-hero-ph" src="${PHOTOS[pid]}" alt="">` : accAvatar('xl')}
      <div class="acc-hero-id"><h1 class="page-title">${esc(nm)} <span class="acc-ver">${accTick}Verified player</span></h1>
        <span>${[team ? esc(pvCase(team)) : '', has(b.num) ? '#' + esc(b.num) : '', b.pos ? esc(PV_POS[b.pos] || b.pos) : ''].filter(Boolean).join(' · ')}</span></div>
      <a class="acc-btn ghost" href="#/p/${pid}">View public profile</a></div></section>`;
  const tag = `<span class="acc-pill wait">Checked before it changes</span>`;
  const was = k => { const w = accWas(k, cur); return `<em class="${w.chg ? 'chg' : ''}" data-accwas="${k}">${w.t}</em>`; };
  const newAdds = f.honAdd.map((a, i) => ({ a, i })).filter(x => !cur.honAdd.some(y => accAddKey(y) === accAddKey(x.a)));
  const hidden = f.honHide;
  const honRows = d.hon.map(h => {
    const key = h.self ? 'self:' + h.year + '|' + h.comp : accHonKey(h);
    const gone = h.self ? !f.honAdd.some(a => a.year + '|' + a.comp === h.year + '|' + h.comp) : hidden.includes(accHonKey(h));
    return `<div class="acc-hon ${gone ? 'gone' : ''}"><b>${h.year}</b><span><b>${esc(h.short)}</b>${[h.champ ? 'Champion' : ''].concat(h.awards).filter(Boolean).length ? ' · ' + esc([h.champ ? 'Champion' : ''].concat(h.awards).filter(Boolean).join(', ')) : ''}${gone ? ' <i class="acc-pill wait sm">Removal will be checked</i>' : ''}</span>
      <button type="button" class="acc-link ${gone ? '' : 'danger'}" data-acc="hon-toggle" data-key="${esc(key)}">${gone ? 'Undo' : 'Ask to remove'}</button></div>`; }).join('');
  const restorable = cur.honHide.map(k => { const off = !f.honHide.includes(k);
    return `<div class="acc-hon ${off ? '' : 'gone'}"><b>${esc(k.split('|')[0])}</b><span><b>${esc(k.split('|').slice(1).join('|'))}</b> · removed from your profile${off ? ' <i class="acc-pill wait sm">Restoring will be checked</i>' : ''}</span>
      <button type="button" class="acc-link" data-acc="hon-restore" data-key="${esc(k)}">${off ? 'Undo' : 'Ask to restore'}</button></div>`; }).join('');
  const state = e ? `<div class="acc-state ${e.status}"><b>${e.status === 'pending' ? 'Waiting for approval' : e.status === 'approved' ? 'Approved' : 'Not approved'}</b>
      <span>${e.status === 'pending' ? 'Sent on ' + accDay(e.createdAt) + '. The form below shows what you asked for. You can change it and send again.'
        : e.status === 'approved' ? 'Your last request was approved' + (e.of && e.applied < e.of ? ' in part: ' + e.applied + ' of ' + e.of + ' changes' : '') + '.' : 'Your last request was not approved.'}${e.note ? ' Note from HoopStatsMY: “' + esc(e.note) + '”' : ''}</span></div>` : '';
  return accShell(head, `<div class="acc-edit-h"><h2>Edit your profile</h2><p>Every change is checked by HoopStatsMY before it shows on your profile. Until then your profile stays as it is.</p></div>
    ${state}
    <div class="acc-cols"><div class="acc-main">
      <form class="acc-card acc-form" data-accform="edit" onsubmit="return false">
        <div class="acc-form-h"><h3>Bio and social links</h3>${tag}</div>
        <label class="acc-f"><span>Bio <i id="acc-bio-n">${String(f.bio).length} / 280</i></span>
          <textarea rows="3" maxlength="280" data-accf="f.bio" placeholder="Where you play, what you are working on this season, who you want to thank.">${esc(f.bio)}</textarea>
          <em>Plain text only. Phone numbers and web links are removed.</em></label>
        <div class="acc-links">${ACC_SITES.map(([k, label, base]) => `<label for="acc-l-${k}">${label}</label>
          <div class="acc-pre"><span>${base}</span><input id="acc-l-${k}" type="text" maxlength="51" value="${esc(f.links[k] || '')}" data-accf="f.links.${k}" placeholder="Leave empty to hide" autocomplete="off" autocapitalize="off" spellcheck="false"></div>`).join('')}</div>

        <div class="acc-form-h rule"><h3>Your details</h3>${tag}</div>
        <div class="acc-3">
          <label class="acc-f"><span>Birthday</span><input type="date" value="${esc(f.dob)}" data-accf="f.dob" min="1940-01-01">${was('dob')}</label>
          <label class="acc-f"><span>Height</span><div class="acc-pre end"><input type="number" inputmode="numeric" min="100" max="250" value="${esc(f.ht)}" data-accf="f.ht"><span>cm</span></div>${was('ht')}</label>
          <label class="acc-f"><span>Weight</span><div class="acc-pre end"><input type="number" inputmode="numeric" min="30" max="200" value="${esc(f.wt)}" data-accf="f.wt"><span>kg</span></div>${was('wt')}</label>
        </div>

        <div class="acc-form-h rule"><h3>Honours</h3><span class="acc-fine">${d.hon.length} on your profile</span></div>
        ${honRows || restorable ? `<div class="acc-hons">${honRows}${restorable}</div>` : `<div class="acc-empty">No honours on your profile yet.</div>`}
        ${newAdds.map(({ a, i }) => `<div class="acc-hon new"><b>${esc(a.year)}</b><span><b>${esc(a.comp)}</b> · ${esc(a.award)}${a.team ? ' · ' + esc(a.team) : ''} <i class="acc-pill wait sm">New · will be checked</i></span>
          <button type="button" class="acc-link danger" data-acc="hon-del" data-i="${i}">Remove</button></div>`).join('')}
        <div class="acc-add"><b>Add an honour</b>
          <div class="acc-add-g">
            <label class="acc-f"><span>Year</span><input type="number" inputmode="numeric" min="1990" max="${new Date().getFullYear()}" value="${esc(f.draft.year)}" data-accf="f.draft.year" placeholder="${new Date().getFullYear()}"></label>
            <label class="acc-f"><span>Competition</span><input type="text" maxlength="60" value="${esc(f.draft.comp)}" data-accf="f.draft.comp" placeholder="Name of the competition"></label>
            <label class="acc-f"><span>Honour</span><select data-accf="f.draft.award">${ACC_AWARDS.map(a => `<option ${a === f.draft.award ? 'selected' : ''}>${a}</option>`).join('')}</select></label>
          </div>
          <div class="acc-add-g two">
            <label class="acc-f"><span>Your team that year</span><input type="text" maxlength="40" value="${esc(f.draft.team)}" data-accf="f.draft.team"></label>
            <label class="acc-f"><span>Anything that helps us check it</span><input type="text" maxlength="200" value="${esc(f.draft.note)}" data-accf="f.draft.note" placeholder="A link to the result, or who can confirm it"></label>
          </div>
          <button type="button" class="acc-btn line" data-acc="hon-add">Add to my request</button></div>

        ${f.err ? `<p class="acc-err" role="alert">${esc(f.err)}</p>` : ''}
        <div class="acc-send"><button type="button" class="acc-btn big" data-acc="edit-send" id="acc-send"${f.busy ? ' disabled' : ''}>${sum.n ? 'Send ' + sum.n + ' change' + (sum.n === 1 ? '' : 's') + ' for approval' : 'Send for approval'}</button>
          <button type="button" class="acc-link" data-acc="edit-reset">Start again</button>
          <span class="acc-fine">The result shows here and on My page.</span></div>
      </form>
    </div><aside class="acc-side">
      <section class="acc-card acc-sum"><h2>Your request</h2><ul id="acc-sum">${sum.html}</ul></section>
      <section class="acc-card"><h2>What you can't change here</h2><ul class="acc-ul"><li>Your name</li><li>Team, jersey number and photo</li><li>Stats, which come from official box scores</li></ul>
        <a href="https://www.instagram.com/${ACC_IG}/" target="_blank" rel="noopener">Spot a mistake? Message @${ACC_IG}</a></section>
      <div class="acc-outs"><button type="button" class="acc-link danger" data-acc="ask" data-ask="clear">Remove my bio and links</button>
        <button type="button" class="acc-link danger" data-acc="ask" data-ask="unlink">Unlink me from this profile</button></div>
    </aside></div>`);
}
function accWas(k, cur) {
  const f = ACC.form, chg = k === 'dob' ? (f.dob || '') !== (cur.dob || '') : (+f[k] || 0) !== (+cur[k] || 0);
  const old = k === 'dob' ? (cur.dob ? pvDay(cur.dob) : '') : cur[k] ? cur[k] + (k === 'ht' ? ' cm' : ' kg') : '';
  return { chg, t: chg ? 'Was ' + (old || 'empty') + ' · will be checked' : 'No change' };
}
function accEditLive() {
  const cur = accCurrent(ACC.form.pid);
  document.querySelectorAll('[data-accwas]').forEach(el => { const w = accWas(el.dataset.accwas, cur); el.textContent = w.t; el.classList.toggle('chg', w.chg); });
  const s = accEditSummary(), ul = document.getElementById('acc-sum'), bt = document.getElementById('acc-send'), n = document.getElementById('acc-bio-n');
  if (ul) ul.innerHTML = s.html;
  if (bt) bt.textContent = s.n ? 'Send ' + s.n + ' change' + (s.n === 1 ? '' : 's') + ' for approval' : 'Send for approval';
  if (n) n.textContent = String(ACC.form.bio).length + ' / 280';
}

/* ---- the admin's review queue -------------------------------------------- */
async function accAdminLoad() {
  const a = ACC.adm || (ACC.adm = { tab: 'wait', got: {}, sel: {}, note: {} });
  a.loading = true; a.err = '';
  try {
    const B = accB();
    const [claims, edits, profiles, owners, nUsers, users] = await Promise.all([B.list('claims', { where: ['status', 'pending'] }), B.list('edits', { where: ['status', 'pending'] }),
      B.list('profiles'), B.list('owners'), B.count('users'), B.list('users', { orderBy: 'createdAt', limit: 20 })]);
    Object.assign(a, { claims: claims.sort((x, y) => x.createdAt - y.createdAt), edits: edits.sort((x, y) => x.createdAt - y.createdAt), profiles, owners, nUsers, users, loaded: true });
    profiles.forEach(p => { ACC.pub[p.id] = p; });
  } catch (e) { a.err = accErr(e); }
  a.loading = false; a.at = Date.now();
  if (accOnPage(/^#\/admin\b/)) accRedraw();
}
function accAdmLines(e) {
  const pub = (ACC.adm.profiles || []).find(p => p.id === e.pid) || null, cur = accCurrent(e.pid, pub);
  const L = accDiff(cur, e);
  L.forEach(l => { if (l.k === 'dob') l.req = e.dob || ''; if (l.k === 'ht') l.req = +e.ht || 0; if (l.k === 'wt') l.req = +e.wt || 0; });
  return { cur, L };
}
function renderAdmin() {
  if (!ACC.on || ACC.state === 'loading') return accGate('Review queue', ACC.on ? 'Loading…' : 'Not available on this copy of the site.');
  if (ACC.state !== 'in' || !ACC.admin) return accGate('Review queue', 'This page is for the HoopStatsMY admin only.', ACC.state === 'in' ? '' : `<button type="button" class="acc-btn big" data-acc="signin">Sign in</button>`);
  const a = ACC.adm || (ACC.adm = { tab: 'wait', got: {}, sel: {}, note: {} });
  // the queue is read again whenever the page is opened, not only on Refresh: a claim may have arrived since
  if (!a.loading && Date.now() - (a.at || 0) > 15e3) accAdminLoad();
  const claims = a.claims || [], edits = a.edits || [], profs = a.profiles || [];
  const who = x => `Sent by <b>${esc(x.displayName || '')}</b>${x.email ? ', ' + esc(x.email) : ''} · ${accDay(x.createdAt)}`;
  const plink = (pid, nm) => `<a href="#/p/${esc(pid)}">${esc(PERSONS[pid] || nm || pid)}</a>`;
  const face = pid => PHOTOS[pid] ? `<img src="${PHOTOS[pid]}" alt="">` : `<span class="acc-av lg">${esc(initials(PERSONS[pid] || '?'))}</span>`;
  const noteBox = id => `<label class="acc-f acc-note"><span>Note to the player (optional)</span><input type="text" maxlength="200" value="${esc(a.note[id] || '')}" data-accn="${esc(id)}" placeholder="Shown on their My page"></label>`;

  const claimRows = claims.map(c => {
    const got = !!a.got[c.id], taken = (a.owners || []).find(o => o.id === c.pid && o.uid !== c.id && profs.some(p => p.id === c.pid));
    const known = !!PERSONS[c.pid];
    return `<article class="acc-q ${got ? 'ready' : ''}"><div class="acc-q-p">${face(c.pid)}<div>${plink(c.pid, c.name)}<span>${esc(pvCase((accLatest(c.pid) || { l: {} }).l.team || ''))}</span></div></div>
      <div class="acc-q-b"><span class="acc-pill ${taken || !known ? 'no' : got ? 'ok' : 'wait'}">${!known ? 'Unknown profile' : taken ? 'Already verified for another account' : got ? 'Code received · ready to approve' : 'Waiting for the Instagram code'}</span>
        <span>${who(c)}</span>
        <span>Code <b class="acc-mono">${esc(c.code)}</b> expected from <a href="https://www.instagram.com/${encodeURIComponent(c.igId)}/" target="_blank" rel="noopener nofollow">@${esc(c.igId)} ↗</a></span>
        <label class="acc-chk"><input type="checkbox" data-accgot="${esc(c.id)}" ${got ? 'checked' : ''}><span>I received this code from this Instagram ID</span></label>${noteBox('c:' + c.id)}</div>
      <div class="acc-q-a"><button type="button" class="acc-btn ok" data-acc="adm-claim-ok" data-id="${esc(c.id)}"${got && !taken && known ? '' : ' disabled'}>Approve</button>
        <button type="button" class="acc-btn line danger" data-acc="adm-claim-no" data-id="${esc(c.id)}">Reject</button></div></article>`; }).join('');

  const editRows = edits.map(e => {
    const { L } = accAdmLines(e), sel = a.sel[e.id] || (a.sel[e.id] = {});
    const nOn = L.filter(l => sel[l.k] !== false).length;
    return `<article class="acc-q"><div class="acc-q-p">${face(e.pid)}<div>${plink(e.pid, e.name)}<span class="acc-ver sm">${accTick}Verified</span></div></div>
      <div class="acc-q-b"><span>Sent ${accDay(e.createdAt)}</span>
        ${L.length ? `<div class="acc-lines">${L.map(l => `<label class="acc-line"><input type="checkbox" data-accl="${esc(e.id)}" data-k="${esc(l.k)}" ${sel[l.k] !== false ? 'checked' : ''}>
          <b>${esc(l.label)}</b><span>${l.from ? `<s>${esc(l.from)}</s>` : '<i>none</i>'} → ${l.to ? `<u>${esc(l.to)}</u>` : '<i>removed</i>'}${l.note ? `<em>Player's note: ${esc(l.note)}</em>` : ''}</span></label>`).join('')}</div>`
          : '<span class="dim">This request no longer changes anything.</span>'}${noteBox('e:' + e.id)}</div>
      <div class="acc-q-a"><button type="button" class="acc-btn ok" data-acc="adm-edit-ok" data-id="${esc(e.id)}"${nOn ? '' : ' disabled'}>Approve ${nOn === L.length ? 'all' : nOn + ' of ' + L.length}</button>
        <button type="button" class="acc-btn line danger" data-acc="adm-edit-no" data-id="${esc(e.id)}">Reject all</button></div></article>`; }).join('');

  const wait = `<section class="acc-sec"><div class="acc-sec-h"><h2>Claims</h2></div>${claimRows || '<div class="acc-empty">No claims are waiting.</div>'}</section>
    <section class="acc-sec"><div class="acc-sec-h"><h2>Profile changes from verified players</h2></div>${editRows || '<div class="acc-empty">No changes are waiting.</div>'}
      <p class="acc-fine">Nothing changes on a profile until you approve it. Untick a line to leave it out.</p></section>`;
  const ver = `<section class="acc-sec">${profs.length ? profs.map(p => `<article class="acc-q"><div class="acc-q-p">${face(p.id)}<div>${plink(p.id, p.name)}<span class="acc-ver sm">${accTick}Verified ${p.verifiedAt ? accDay(p.verifiedAt) : ''}</span></div></div>
      <div class="acc-q-b"><span>${p.bio ? esc(p.bio) : '<span class="dim">No bio</span>'}</span>
        <span>${ACC_SITES.filter(([k]) => p.links && p.links[k]).map(([k, label, base]) => esc(base + p.links[k])).join(' · ') || '<span class="dim">No links</span>'}</span></div>
      <div class="acc-q-a"><button type="button" class="acc-btn line" data-acc="adm-clear" data-id="${esc(p.id)}">Clear bio and links</button>
        <button type="button" class="acc-btn line danger" data-acc="adm-revoke" data-id="${esc(p.id)}">Remove verification</button></div></article>`).join('') : '<div class="acc-empty">No verified players yet.</div>'}</section>`;
  const accs = `<section class="acc-sec"><div class="acc-card acc-list">${(a.users || []).map(u => `<div><span><b>${esc(u.displayName || '')}</b> <span class="dim">${esc(u.email || '')}</span></span><span class="dim">${u.role === 'player' ? 'Player' : 'Fan'} · ${accDay(u.createdAt)}</span></div>`).join('') || '<div><span class="dim">No accounts yet.</span></div>'}</div>
      <p class="acc-fine">The 20 newest accounts. The total is in the tile above.</p></section>`;
  const tab = (k, label, n) => `<button type="button" class="${a.tab === k ? 'on' : ''}" data-acc="adm-tab" data-tab="${k}">${label}${n != null ? `<span>${n}</span>` : ''}</button>`;
  return accShell('', `<div class="acc-adm-h"><div><h1 class="page-title">Review queue</h1><p>Only you can open this page. Nothing a player sends goes public until you approve it.</p></div>
      <button type="button" class="acc-btn line" data-acc="adm-refresh"${a.loading ? ' disabled' : ''}>${a.loading ? 'Loading…' : 'Refresh'}</button></div>
    ${a.err ? `<p class="acc-err" role="alert">${esc(a.err)}</p>` : ''}
    <div class="acc-tiles"><div class="${claims.length ? 'hot' : ''}"><b>${a.loaded ? claims.length : '–'}</b><span>Claim${claims.length === 1 ? '' : 's'} waiting</span></div>
      <div class="${edits.length ? 'hot' : ''}"><b>${a.loaded ? edits.length : '–'}</b><span>Profile change${edits.length === 1 ? '' : 's'} waiting</span></div>
      <div><b>${a.loaded ? profs.length : '–'}</b><span>Verified players</span></div>
      <div><b>${a.loaded ? a.nUsers : '–'}</b><span>Accounts signed up</span></div></div>
    <div class="acc-tabs" role="tablist">${tab('wait', 'Waiting', a.loaded ? claims.length + edits.length : null)}${tab('ver', 'Verified players')}${tab('acc', 'Accounts')}</div>
    ${a.tab === 'ver' ? ver : a.tab === 'acc' ? accs : wait}`);
}
async function accAdmin(act, id) {
  const a = ACC.adm, B = accB(), now = Date.now();
  try {
    if (act === 'adm-claim-ok' || act === 'adm-claim-no') {
      const c = a.claims.find(x => x.id === id); if (!c) return;
      const note = (a.note['c:' + id] || '').trim();
      if (act === 'adm-claim-no') await B.set('claims', id, { status: 'rejected', decidedAt: now, note }, true);
      else {
        const exists = a.profiles.some(p => p.id === c.pid), name = PERSONS[c.pid] || c.name;
        await B.batch([{ op: 'set', col: 'owners', id: c.pid, data: { uid: id, at: now } },
          { op: 'set', col: 'profiles', id: c.pid, data: exists ? { name, verifiedAt: now, updatedAt: now } : { name, verifiedAt: now, updatedAt: now, bio: '', links: { ig: '', tt: '', yt: '', fb: '' }, dob: '', ht: 0, wt: 0, honAdd: [], honHide: [] }, merge: true },
          { op: 'set', col: 'meta', id: 'verified', data: { pids: { [c.pid]: true } }, merge: true },
          { op: 'set', col: 'claims', id, data: { status: 'approved', decidedAt: now, note }, merge: true }]);
      }
      accToast(act === 'adm-claim-ok' ? (PERSONS[c.pid] || c.name) + ' is now verified.' : 'Claim rejected.');
    } else if (act === 'adm-edit-ok' || act === 'adm-edit-no') {
      const e = a.edits.find(x => x.id === id); if (!e) return;
      const note = (a.note['e:' + id] || '').trim();
      if (act === 'adm-edit-no') await B.set('edits', id, { status: 'rejected', decidedAt: now, note }, true);
      else {
        const { cur, L } = accAdmLines(e), sel = a.sel[id] || {}, on = L.filter(l => sel[l.k] !== false);
        await B.batch([{ op: 'set', col: 'profiles', id: e.pid, data: Object.assign(accApply(cur, on), { updatedAt: now }), merge: true },
          { op: 'set', col: 'edits', id, data: { status: 'approved', decidedAt: now, applied: on.length, of: L.length, note }, merge: true }]);
      }
      accToast(act === 'adm-edit-ok' ? 'Changes are live on the profile.' : 'Request rejected.');
    } else if (act === 'adm-clear') {
      await B.set('profiles', id, { bio: '', links: { ig: '', tt: '', yt: '', fb: '' }, updatedAt: now }, true);
      accToast('Bio and links cleared.');
    } else if (act === 'adm-revoke') {
      const o = (a.owners || []).find(x => x.id === id), ops = [{ op: 'del', col: 'profiles', id }, { op: 'del', col: 'owners', id }, { op: 'set', col: 'meta', id: 'verified', data: { pids: { [id]: false } }, merge: true }];
      if (o && o.uid) ops.push({ op: 'set', col: 'claims', id: o.uid, data: { status: 'revoked', decidedAt: now }, merge: true });
      await B.batch(ops); delete ACC.pub[id];
      accToast('Verification removed.');
    }
    try { sessionStorage.removeItem('hsmy_ver'); } catch (e) {}
    if (typeof PV !== 'undefined') PV.data = null;
    await accAdminLoad();
  } catch (e) { accToast(accErr(e)); }
}

/* ---- site rules and privacy notice --------------------------------------- */
function renderPrivacy() {
  return accShell('', `<article class="acc-doc"><h1 class="page-title">Site rules and privacy notice</h1>
    <p class="lede">HoopStatsMY is free to read without an account. An account is only needed to keep favourites, save comparisons, or claim your own player profile.</p>
    <h2>What we keep when you sign in</h2>
    <ul><li><b>From Google:</b> your name, email address and profile picture. We never see your password.</li>
      <li><b>From you:</b> your display name, your favourite players and teams, and the comparisons you save.</li>
      <li><b>If you claim a profile:</b> the profile you claimed, your Instagram ID and the one-time code.</li>
      <li><b>If you are a verified player:</b> the bio, social links and corrections you send for approval.</li></ul>
    <h2>Who can see it</h2>
    <ul><li><b>Only you and the HoopStatsMY admin:</b> your email, display name, favourites, saved comparisons, claims and requests.</li>
      <li><b>Everyone:</b> a verified player's bio, social links and corrected details, and only after the admin approves them.</li>
      <li>Your email is never shown on the site and is never sold or passed to anyone else.</li></ul>
    <h2>Where it is kept</h2>
    <p>Accounts and requests are stored with Google Firebase. The stats on the site come from the MABA / Genius Sports competition portal and are public competition records.</p>
    <h2>Profile rules</h2>
    <ul><li>Claim only your own profile. A claim is checked by hand through an Instagram message from your own account.</li>
      <li>We never ask for an IC, passport or any other document.</li>
      <li>Keep your bio true and clean: no insults, no adverts, no contact details.</li>
      <li>Honours must be real. Add something that lets us check them.</li>
      <li>Every change waits for approval. HoopStatsMY can reject a change or remove a verification.</li>
      <li>Stats come from official box scores and are not edited on request. If one is wrong, message us.</li></ul>
    <h2>Taking your data down</h2>
    <ul><li><b>Bio and links:</b> remove them yourself on the edit page. They come down straight away.</li>
      <li><b>Your account:</b> My page → Delete my account. Everything listed above is deleted.</li>
      <li><b>Anything else,</b> including a player or parent who wants a profile looked at: message <a href="https://www.instagram.com/${ACC_IG}/" target="_blank" rel="noopener">@${ACC_IG}</a> on Instagram.</li></ul>
    <p class="acc-fine">Last updated 2 October 2026.</p></article>`);
}

/* ---- events -------------------------------------------------------------- */
function accSetPath(root, path, v) { const ks = path.split('.'); let o = root; for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]]; o[ks[ks.length - 1]] = v; }
function accField(el) {
  const p = el.dataset.accf, v = el.type === 'checkbox' ? el.checked : el.value;
  if (p.startsWith('m.') && ACC.modal) accSetPath(ACC.modal, p.slice(2), v);
  if (p.startsWith('f.') && ACC.form) {
    accSetPath(ACC.form, p.slice(2), v);
    if (!p.startsWith('f.draft')) { ACC.form.dirty = true; accEditLive(); }
  }
}
document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset && t.dataset.accf) accField(t);
  else if (t.dataset && t.dataset.accn && ACC.adm) ACC.adm.note[t.dataset.accn] = t.value;
});
document.addEventListener('change', e => {
  const t = e.target; if (!t.dataset) return;
  if (t.dataset.accf) accField(t);
  else if (t.dataset.accgot && ACC.adm) { ACC.adm.got[t.dataset.accgot] = t.checked; accRedraw(); }
  else if (t.dataset.accl && ACC.adm) { (ACC.adm.sel[t.dataset.accl] = ACC.adm.sel[t.dataset.accl] || {})[t.dataset.k] = t.checked; accRedraw(); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && ACC.modal && ACC.modal.kind !== 'welcome' && !ACC.modal.busy) accModal(null); });
document.addEventListener('click', async e => {
  if (ACC.modal && e.target.id === 'acc-modal' && ACC.modal.kind !== 'welcome' && !ACC.modal.busy) { accModal(null); return; }
  if (ACC.modal && e.target.closest('#acc-modal a[href^="#/"]:not([target])')) { accModal(null); return; }
  const b = e.target.closest('[data-acc]'); if (!b) return;
  const act = b.dataset.acc, m = ACC.modal, B = accB;
  if (b.tagName === 'BUTTON') e.preventDefault();
  if (act === 'close') accModal(null);
  else if (act === 'signin') { ACC.want = null; accModal('signin', {}); }
  else if (act === 'welcome') accModal('welcome', { name: ACC.user.name || '', role: 'fan', agree: false });
  else if (act === 'google') {
    m.busy = true; m.err = ''; accDrawModal();
    try { await accInit(); await B().signIn(); }
    catch (x) { if (ACC.modal === m) { m.busy = false; m.err = accErr(x); accDrawModal(); } }
  }
  else if (act === 'switch') { ACC.want = m && m.pid ? { claim: m.pid } : ACC.want; await B().signOut().catch(() => {}); accModal('signin', m && m.pid ? { pid: m.pid } : {}); }
  else if (act === 'signout') { accModal(null); ACC.want = null; await B().signOut().catch(x => accToast(accErr(x))); if (accOnPage(/^#\/(me|admin)\b/)) location.hash = '#/'; }
  else if (act === 'welcome-go') {
    const name = String(m.name || '').trim().slice(0, 40);
    if (!name) { m.err = 'Type a display name.'; accDrawModal(); return; }
    if (!m.agree) { m.err = 'Tick the box to agree to the site rules and privacy notice.'; accDrawModal(); return; }
    const me = { displayName: name, role: m.role === 'player' ? 'player' : 'fan', email: ACC.user.email, createdAt: Date.now(), favPlayers: [], favTeams: [], compares: [] };
    if (await accDo(() => B().set('users', ACC.user.uid, me))) {
      ACC.me = me; const had = ACC.want; accAfterSignIn(); accRedraw();
      if (!had) { if (me.role === 'player') { location.hash = '#/players'; accToast('Open your profile, then press “Claim this profile”.'); } else location.hash = '#/me'; }
    }
  }
  else if (act === 'name') accModal('name', { name: ACC.me.displayName });
  else if (act === 'name-save') {
    const name = String(m.name || '').trim().slice(0, 40);
    if (!name) { m.err = 'Type a display name.'; accDrawModal(); return; }
    const next = Object.assign({}, ACC.me, { displayName: name });
    if (await accDo(() => B().set('users', ACC.user.uid, next))) { ACC.me = next; accModal(null); accRedraw(); }
  }
  else if (act === 'claim') accClaimOpen(b.dataset.pid);
  else if (act === 'pending') accModal('pending', {});
  else if (act === 'copy') {
    const t = b.dataset.copy;
    try { await navigator.clipboard.writeText(t); b.textContent = 'Copied'; }
    catch (x) { const r = document.createRange(); r.selectNodeContents(document.getElementById('acc-code')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); b.textContent = 'Selected: press copy'; }
  }
  else if (act === 'claim-send') {
    const ig = String(m.ig || '').trim().replace(/^@/, '');
    if (!m.isMe) { m.err = 'Tick the box to confirm this is your profile.'; accDrawModal(); return; }
    if (!/^[A-Za-z0-9._]{1,30}$/.test(ig)) { m.err = 'Type your Instagram ID: letters, numbers, dots and underscores only.'; accDrawModal(); return; }
    if (!m.agree) { m.err = 'Tick the box to agree to the profile rules and privacy notice.'; accDrawModal(); return; }
    const c = { pid: m.pid, name: PERSONS[m.pid] || '', igId: ig, code: m.code, status: 'pending', createdAt: Date.now(), displayName: ACC.me.displayName, email: ACC.user.email };
    if (await accDo(() => B().set('claims', ACC.user.uid, c))) { ACC.claim = c; accModal('pending', {}); accRedraw(); }
  }
  else if (act === 'claim-clear') { try { await B().del('claims', ACC.user.uid); ACC.claim = null; accRedraw(); } catch (x) { accToast(accErr(x)); } }
  else if (act === 'ask') accModal('ask', Object.assign({ ask: b.dataset.ask }, ACC_ASK[b.dataset.ask]));
  else if (act === 'ask-yes') {
    const uid = ACC.user.uid, c = ACC.claim, pid = c && c.pid;
    if (m.ask === 'withdraw') { if (await accDo(() => B().del('claims', uid), 'Claim withdrawn.')) { ACC.claim = null; accModal(null); accRedraw(); } }
    else if (m.ask === 'clear') {
      if (await accDo(() => B().set('profiles', pid, { bio: '', links: { ig: '', tt: '', yt: '', fb: '' }, updatedAt: Date.now() }, true), 'Your bio and links are off your profile.')) {
        ACC.form = null; delete ACC.pub[pid]; accWantPub(pid, true); accModal(null); accRedraw(); }
    }
    else if (m.ask === 'unlink') {
      if (await accDo(async () => { await B().del('profiles', pid); await B().del('edits', uid).catch(() => {}); await B().del('claims', uid); }, 'You are unlinked from the profile.')) {
        ACC.claim = null; ACC.edit = null; ACC.form = null; ACC.pub[pid] = null; if (ACC.verified) delete ACC.verified[pid]; PV.data = null; accModal(null); location.hash = '#/me'; accRedraw(); }
    }
    else if (m.ask === 'account') {
      if (await accDo(async () => {
        if (c && c.status === 'approved') await B().del('profiles', pid).catch(() => {});
        await B().del('edits', uid).catch(() => {}); await B().del('claims', uid).catch(() => {}); await B().del('users', uid);
        await B().removeUser().catch(() => B().signOut());
      }, 'Your account is deleted.')) { accModal(null); location.hash = '#/'; }
    }
  }
  else if (act === 'fav') accFav(b.dataset.kind, b.dataset.id);
  else if (act === 'cmp') accCmpSave(b.dataset.a, b.dataset.b);
  else if (act === 'hon-toggle' && ACC.form) {
    const f = ACC.form, k = b.dataset.key;
    if (k.startsWith('self:')) { const yc = k.slice(5), had = f.honAdd.some(a => a.year + '|' + a.comp === yc);
      f.honAdd = had ? f.honAdd.filter(a => a.year + '|' + a.comp !== yc) : f.honAdd.concat(accCurrent(f.pid).honAdd.filter(a => a.year + '|' + a.comp === yc)); }
    else { const i = f.honHide.indexOf(k); i >= 0 ? f.honHide.splice(i, 1) : f.honHide.push(k); }
    f.dirty = true; accRedraw();
  }
  else if (act === 'hon-restore' && ACC.form) { const f = ACC.form, k = b.dataset.key, i = f.honHide.indexOf(k); i >= 0 ? f.honHide.splice(i, 1) : f.honHide.push(k); f.dirty = true; accRedraw(); }
  else if (act === 'hon-del' && ACC.form) { ACC.form.honAdd.splice(+b.dataset.i, 1); ACC.form.dirty = true; accRedraw(); }
  else if (act === 'hon-add' && ACC.form) {
    const f = ACC.form, d = f.draft, y = +d.year, comp = String(d.comp || '').trim();
    if (!(y >= 1990 && y <= new Date().getFullYear())) f.err = 'Add the year of the honour.';
    else if (comp.length < 3) f.err = 'Add the name of the competition.';
    else if (f.honAdd.length >= 30) f.err = 'That is the most honours one request can hold.';
    else if (f.honAdd.some(a => accAddKey(a) === y + '|' + comp + '|' + d.award)) f.err = 'That honour is already in your request.';
    else { f.honAdd.push({ year: y, comp: comp.slice(0, 60), award: ACC_AWARDS.includes(d.award) ? d.award : 'Champion', team: String(d.team || '').trim().slice(0, 40), note: String(d.note || '').trim().slice(0, 200) });
      f.draft = { year: '', comp: '', award: 'Champion', team: '', note: '' }; f.err = ''; f.dirty = true; }
    accRedraw();
  }
  else if (act === 'edit-reset') { ACC.form = null; accRedraw(); }
  else if (act === 'edit-send' && ACC.form) {
    const f = ACC.form, req = accFormReq(), bad = accFormCheck(req);
    if (bad) { f.err = bad; accRedraw(); return; }
    if (!accDiff(accCurrent(f.pid), req).length) { f.err = 'Nothing has changed yet.'; accRedraw(); return; }
    f.busy = true; f.err = ''; accRedraw();
    try { await B().set('edits', ACC.user.uid, req); ACC.edit = req; ACC.form = null; accToast('Sent. HoopStatsMY will check your changes.'); window.scrollTo(0, 0); }
    catch (x) { f.busy = false; f.err = accErr(x); }
    accRedraw();
  }
  else if (act === 'adm-tab') { ACC.adm.tab = b.dataset.tab; accRedraw(); }
  else if (act === 'adm-refresh') { accAdminLoad(); accRedraw(); }
  else if (/^adm-/.test(act)) { b.disabled = true; await accAdmin(act, b.dataset.id); }
});

/* ---- start --------------------------------------------------------------- */
if (ACC.on) {
  accLoadVerified();
  if (window.__ACC_BACKEND__ || accFlag()) { ACC.state = 'loading'; accInit().catch(() => { ACC.state = 'out'; accRedraw(); }); }
}
