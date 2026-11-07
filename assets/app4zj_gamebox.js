/* =========================================================================
   Game pages — the live game page (#/live/<mid>, drawn here for app4n_live.js)
   and a finished game's header and box score (#/c/<cid>/box/<mid>, for
   app4j_match.js and app5_rest.js). Both use one box-score table.

   The table fits its card: when the card is too narrow for every column, the
   less important ones drop out (container queries on .gb-tw, see style.css)
   and the chevron beside a player opens a strip with what was dropped.
     always          MIN PTS REB AST FG
     below 520 px    STL BLK TO +/- go to the strip
     below 700 px    3PT FT PF
     below 1000 px   OR DR EFF
   Every player has a face beside the name: the head crop cut at build time
   (DB.avatars), else the portrait, else their initials in the side's colour.

   Home is gold and away blue everywhere here, the pair the Post Game Report
   uses, since the clubs' own colours are not in the database.
   ========================================================================= */
const GBX = (() => {
  const HUE = [72, 255];
  const COLS = [['min', 'MIN'], ['pts', 'PTS'], ['reb', 'REB'], ['ast', 'AST'], ['stl', 'STL'], ['blk', 'BLK'], ['tov', 'TO'],
    ['fg', 'FG'], ['tp', '3PT'], ['ft', 'FT'], ['oreb', 'OR'], ['dreb', 'DR'], ['pf', 'PF'], ['pm', '+/-'], ['eff', 'EFF']];
  const PRI = { stl: 2, blk: 2, tov: 2, pm: 2, tp: 3, ft: 3, pf: 3, oreb: 4, dreb: 4, eff: 4 };
  const NOBEST = { min: 1, tov: 1, pf: 1, pm: 1 };
  const KEYS = ['pts', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'oreb', 'dreb', 'ast', 'stl', 'blk', 'tov', 'pf', 'pm', 'eff'];
  const XP = new Set(), SORT = {}, FL = {}, SEEN = {}, SCORE = {}, TBL = {};
  const quiet = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fresh = at => at && Date.now() - at < 3000;
  const pc = k => PRI[k] ? ' gb-c' + PRI[k] : '';
  const n0 = v => v == null || v === '' || isNaN(+v) ? null : +v;
  const secOf = m => {
    if (m == null || m === '') return null;
    if (typeof m === 'number') return Math.round(m * 60);
    const x = String(m).match(/^(\d+):(\d{2})/);
    return x ? +x[1] * 60 + +x[2] : null;
  };
  const fmtMin = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  const pctT = (m, a) => a ? Math.round(m / a * 100) + '%' : '–';
  /* a short name for a phone: the site's rule (watchShort), except that an import's name reads
     the Western way, "Kenneth J Perkins Jr" → "K. Perkins Jr" */
  const NAT = {};
  function natOf(cid, pid) {
    if (!cid || !pid) return null;
    if (!NAT[cid]) {
      const m = NAT[cid] = {}, c = COMP_BY_ID[cid];
      Object.values((c && c.roster) || {}).forEach(rows => rows.forEach(r => { if (r.pid && r.nat) m[r.pid] = r.nat; }));
    }
    return NAT[cid][pid] || null;
  }
  function short(n, cid, pid) {
    const nat = natOf(cid, pid);
    if (nat && nat !== 'MAS') {
      const w = String(n || '').replace(/,/g, ' ').split(/\s+/).filter(Boolean);
      const suf = w.length > 2 && /^(jr|sr|ii|iii|iv)\.?$/i.test(w[w.length - 1]) ? ' ' + w.pop() : '';
      if (w.length > 1) return w[0][0].toUpperCase() + '. ' + w[w.length - 1] + suf;
    }
    return typeof watchShort === 'function' ? watchShort(n) : n;
  }

  /* ---------------- a player's numbers ---------------- */
  function val(s, k) {
    if (k === 'min') return s.sec;
    if (k === 'reb') return s.oreb == null && s.dreb == null ? s.reb0 : (s.oreb || 0) + (s.dreb || 0);
    if (k === 'fg') return s.fga == null ? null : s.fgm;
    if (k === 'tp') return s.tpa == null ? null : s.tpm;
    if (k === 'ft') return s.fta == null ? null : s.ftm;
    return s[k];
  }
  function text(s, k) {
    if (k === 'min') return s.sec == null ? '—' : fmtMin(s.sec);
    if (k === 'fg') return s.fga == null ? '—' : `${s.fgm || 0}/${s.fga}`;
    if (k === 'tp') return s.tpa == null ? '—' : `${s.tpm || 0}/${s.tpa}`;
    if (k === 'ft') return s.fta == null ? '—' : `${s.ftm || 0}/${s.fta}`;
    const v = val(s, k);
    if (v == null) return '—';
    return k === 'pm' && v > 0 ? '+' + v : String(v);
  }
  // a line from the stored box score
  function fromBox(l) {
    const s = { sec: secOf(l.min) };
    KEYS.forEach(k => { s[k] = n0(l[k]); });
    if (s.oreb == null && s.dreb == null) s.reb0 = n0(l.reb);
    return s;
  }
  // a player from the live feed (it sends rebounds and offensive rebounds)
  function fromLive(p) {
    const s = { sec: secOf(p.min) };
    KEYS.forEach(k => { s[k] = n0(p[k]); });
    if (s.dreb == null && p.reb != null) s.dreb = (+p.reb || 0) - (+p.oreb || 0);
    return s;
  }
  const playedNothing = s => !s.sec && !s.pts && !s.fga && !s.fta && !val(s, 'reb') && !s.ast && !s.stl && !s.blk && !s.tov && !s.pf;

  /* ---------------- faces and names ---------------- */
  function face(pid, name, side, cls) {
    const src = pid && ((DB.avatars || {})[pid] || PHOTOS[pid]);
    const c = cls ? ' ' + cls : '';
    if (src) return `<span class="gb-av${c}${(DB.avatars || {})[pid] ? '' : ' gb-av-por'}"><img src="${src}" alt="" loading="lazy" decoding="async"></span>`;
    return `<span class="gb-av gb-ini${c}" style="--th:${HUE[side] || HUE[0]}">${esc(initials(name))}</span>`;
  }
  const link = (pid, html) => pid && PERSONS[pid] ? `<a href="#/p/${pid}">${html}</a>` : `<span>${html}</span>`;

  /* ---------------- the table ----------------
     o: { key, side, rows:[{pid, name, num, starter, on, s}], dnp:[names], live, at, foot } */
  function table(o) {
    TBL[o.key] = o;
    const rows = o.rows;
    const cols = COLS.filter(([k]) => rows.some(r => val(r.s, k) != null));
    const sort = SORT[o.key];
    const best = {};
    cols.forEach(([k]) => {
      if (NOBEST[k]) return;
      const v = rows.map(r => val(r.s, k)).filter(x => x != null);
      best[k] = v.length ? Math.max(...v) : null;
    });
    const bySec = (a, b) => (b.s.sec || 0) - (a.s.sec || 0);
    const by = sort ? (a, b) => sort.d * ((val(b.s, sort.k) ?? -1e9) - (val(a.s, sort.k) ?? -1e9)) : null;
    const st = rows.filter(r => r.starter);
    const grp = sort ? [['', rows.slice().sort(by)]]
      : st.length ? [['Starters', st], ['Bench', rows.filter(r => !r.starter).sort(bySec)]]
      : [['', rows.some(r => r.s.sec != null) ? rows.slice().sort(bySec) : rows]];
    // a changed number flashes once, only on the repaint a new poll brings
    let prev = null, anim = !o.again;
    if (o.live) {
      if (FL[o.key] && FL[o.key].cur) anim = false;      // a repaint of a table already on screen
      const snap = {};
      rows.forEach(r => { snap[r.id] = Object.fromEntries(cols.map(([k]) => [k, text(r.s, k)])); });
      const F = FL[o.key] || (FL[o.key] = {});
      if (F.at !== o.at) { F.old = F.cur; F.cur = snap; F.at = o.at; }
      prev = fresh(o.at) && !quiet() ? F.old : null;
    }
    const tot = { sec: null };
    KEYS.forEach(k => { const v = rows.map(r => r.s[k]).filter(x => x != null); tot[k] = v.length ? v.reduce((a, b) => a + b, 0) : null; });
    if (tot.oreb == null && tot.dreb == null) { const v = rows.map(r => r.s.reb0).filter(x => x != null); tot.reb0 = v.length ? v.reduce((a, b) => a + b, 0) : null; }
    const cell = (s, k, r) => {
      const t = text(s, k), v = val(s, k);
      const p = prev && r && prev[r.id] && prev[r.id][k];
      const cls = [k === 'pts' ? 'gb-pts' : '', k === 'pm' && v ? (v > 0 ? 'gb-pos' : 'gb-neg') : '',
        r && best[k] != null && v != null && v > 0 && v === best[k] ? 'gb-best' : '',
        p != null && k !== 'min' && k !== 'pm' && p !== t ? 'gb-flash' : ''].filter(Boolean).join(' ');
      return `<td class="${cls}${pc(k)}">${t}</td>`;
    };
    let i = 0;
    const body = grp.map(([g, list]) => !list.length ? '' : `<tbody>${g ? `<tr class="gb-grp"><td colspan="${cols.length + 1}">${g}</td></tr>` : ''}${list.map(r => {
      const nm = esc(r.name), open = XP.has(r.id), on = o.live && r.on;
      const drop = cols.filter(([k]) => PRI[k]);
      return `<tr class="gb-row${on ? ' gb-on' : ''}" style="animation-delay:${Math.min(i++, 14) * 0.025}s">
        <td class="gb-pl">${link(r.pid, `${face(r.pid, r.name, o.side)}<span class="gb-nm"><b class="gb-fn">${nm}</b><b class="gb-sn">${esc(short(r.name, o.cid, r.pid))}</b><small>${r.num != null && r.num !== '' ? '#' + esc(r.num) : ''}${on ? `${r.num != null && r.num !== '' ? ' · ' : ''}<i class="gb-ondot" title="On court"></i><span class="gb-oc">On court</span>` : ''}</small></span>`)}${drop.length ? `<button type="button" class="gb-xb" data-gbx="${esc(r.id)}" aria-expanded="${open}" aria-label="More stats for ${nm}"><i></i></button>` : ''}</td>
        ${cols.map(([k]) => cell(r.s, k, r)).join('')}</tr>
      ${drop.length ? `<tr class="gb-xr${open ? ' on' : ''}" data-gbxr="${esc(r.id)}"><td colspan="${cols.length + 1}"><div class="gb-xs">${drop.map(([k, l]) => {
        const v = val(r.s, k);
        return `<span class="gb-c${PRI[k]}"><small>${l}</small><b class="${k === 'pm' && v ? (v > 0 ? 'gb-pos' : 'gb-neg') : ''}">${text(r.s, k)}</b></span>`; }).join('')}</div></td></tr>` : ''}`;
    }).join('')}</tbody>`).join('');
    const head = `<thead><tr><th class="gb-pl">Player</th>${cols.map(([k, l]) => `<th class="${pc(k).trim()}"><button type="button" data-gbsort="${esc(o.key)}|${k}" class="${sort && sort.k === k ? 'on' : ''}" aria-label="Sort by ${l}">${l}${sort && sort.k === k ? (sort.d > 0 ? ' ↓' : ' ↑') : ''}</button></th>`).join('')}</tr></thead>`;
    const foot = `<tfoot><tr><td class="gb-pl">Team</td>${cols.map(([k]) => k === 'min' || k === 'pm' ? `<td class="${pc(k).trim()}"></td>` : cell(tot, k)).join('')}</tr>
      ${cols.some(([k]) => k === 'fg' || k === 'tp' || k === 'ft') ? `<tr class="gb-pct"><td class="gb-pl">${o.foot ? esc(o.foot) : ''}</td>${cols.map(([k]) => `<td class="${pc(k).trim()}">${k === 'fg' ? pctT(tot.fgm, tot.fga) : k === 'tp' ? pctT(tot.tpm, tot.tpa) : k === 'ft' ? pctT(tot.ftm, tot.fta) : ''}</td>`).join('')}</tr>` : ''}</tfoot>`;
    return `<div class="gb-tblw" id="gbt-${esc(o.key).replace(/[^a-z0-9-]/gi, '_')}"><div class="gb-tw" tabindex="0" role="region" aria-label="${esc(o.label || 'Box score')}"><table class="gb-bs${anim ? ' gb-anim' : ''}">${head}${body}${foot}</table></div>
      ${o.dnp && o.dnp.length ? `<p class="gb-dnp"><b>Did not play</b> ${o.dnp.map(esc).join(' · ')}</p>` : ''}</div>`;
  }

  /* ---------------- interactions ---------------- */
  document.addEventListener('click', e => {
    const xb = e.target.closest('[data-gbx]');
    if (xb) {
      const id = xb.dataset.gbx, on = !XP.has(id);
      on ? XP.add(id) : XP.delete(id);
      document.querySelectorAll('[data-gbx]').forEach(b => { if (b.dataset.gbx === id) b.setAttribute('aria-expanded', on); });
      document.querySelectorAll('[data-gbxr]').forEach(r => { if (r.dataset.gbxr === id) r.classList.toggle('on', on); });
      return;
    }
    const so = e.target.closest('[data-gbsort]');
    if (so) {
      const [key, k] = so.dataset.gbsort.split('|'), s = SORT[key];
      SORT[key] = s && s.k === k ? (s.d > 0 ? { k, d: -1 } : null) : { k, d: 1 };
      const o = TBL[key], el = so.closest('.gb-tblw');
      if (o && el) { el.outerHTML = table({ ...o, again: true }); const b = document.querySelector(`[data-gbsort="${CSS.escape(key + '|' + k)}"]`); if (b) b.focus(); }
      return;
    }
    const bt = e.target.closest('[data-gbteam]');
    if (bt) { LIVE.bt = +bt.dataset.gbteam; repaint(); }
  });
  function repaint() {
    const page = document.getElementById('live-game');
    if (!page) return;
    const pl = page.querySelector('.gb-plays'), top = pl ? pl.scrollTop : 0;
    page.innerHTML = liveGameInner(page.dataset.mid);
    const p2 = page.querySelector('.gb-plays');
    if (p2 && top) p2.scrollTop = top;
  }
  // "updated 12 s ago" keeps counting between polls
  setInterval(() => {
    document.querySelectorAll('[data-gbago]').forEach(el => { el.textContent = liveAgo(+el.dataset.gbago); });
  }, 1000);

  /* ---------------- the live game page ---------------- */
  // a score that just changed rolls up to its new value
  function odo(key, v, at) {
    const old = SCORE[key];
    if (!old || old.at !== at) SCORE[key] = { v, was: old ? old.v : null, at };
    const s = SCORE[key];
    if (s.was == null || s.was === v || !fresh(at) || quiet()) return String(v);
    return `<span class="gb-roll"><b>${s.was}</b><b>${v}</b></span>`;
  }
  function liveTeamTot(t) {
    const o = {};
    ['pts', 'reb', 'oreb', 'ast', 'stl', 'blk', 'tov', 'pf', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta'].forEach(k => {
      o[k] = t.tot && t.tot[k] != null ? +t.tot[k] : t.pl.reduce((a, p) => a + (+p[k] || 0), 0);
    });
    return o;
  }
  function live(x) {
    const d = x.data, g = x.g, [h, a] = d.teams, fin = d.status === 'final', at = x.at;
    const lead = h.score > a.score ? 0 : a.score > h.score ? 1 : -1;
    // the quarter line
    const qn = Math.max(h.q.length, a.q.length, 4);
    const ot = /OVERTIME/i.test(d.periodType || '') || d.inOT;
    const now = fin ? -1 : ot ? 3 + (d.period > 4 ? d.period - 4 : d.period) : d.period - 1;
    const ql = i => i < 4 ? 'Q' + (i + 1) : 'OT' + (i > 4 ? i - 3 : '');
    const line = `<div class="gb-line" style="grid-template-columns:auto repeat(${qn},34px)"><span></span>${Array.from({ length: qn }, (_, i) => `<span class="${i === now ? 'gb-now' : ''}">${ql(i)}</span>`).join('')}
      ${[h, a].map(t => `<span class="gb-tc">${esc(watchCode(t.name))}</span>${Array.from({ length: qn }, (_, i) => `<span>${t.q[i] != null ? t.q[i] : '–'}</span>`).join('')}`).join('')}</div>`;
    // period and clock
    const lc = liveClock(d), parts = lc.split(' · ');
    const clock = fin ? '<b>FINAL</b>' : parts.length === 2 ? `<i class="gb-pulse"></i><b>${esc(parts[0])}</b>${esc(parts[1])}` : `<b>${esc(lc)}</b>`;
    // the two teams side by side
    const T = [h, a].map(liveTeamTot);
    const pctv = (m, n) => n ? m / n * 100 : 0;
    const cmp = [['FG%', pctv(T[0].fgm, T[0].fga), pctv(T[1].fgm, T[1].fga), v => Math.round(v) + '%'], ['3P%', pctv(T[0].tpm, T[0].tpa), pctv(T[1].tpm, T[1].tpa), v => Math.round(v) + '%'],
      ['REB', T[0].reb, T[1].reb], ['AST', T[0].ast, T[1].ast], ['STL', T[0].stl, T[1].stl], ['TO', T[0].tov, T[1].tov, null, true]];
    const bars = cmp.map(([l, v0, v1, f, low]) => {
      const s = v0 + v1 || 1, w0 = low ? v0 < v1 : v0 > v1, w1 = low ? v1 < v0 : v1 > v0, fm = f || (v => v);
      return `<div class="gb-cm"><b class="${w0 ? 'win' : ''}">${fm(v0)}</b><span class="gb-bar"><i style="--w:${(v0 / s * 100).toFixed(1)}%;--th:${HUE[0]}"></i><i style="--w:${(v1 / s * 100).toFixed(1)}%;--th:${HUE[1]}"></i></span><b class="${w1 ? 'win' : ''}">${fm(v1)}</b><small>${l}</small></div>`;
    }).join('');
    const foul = t => fin ? '' : `<small>${t.fouls}<span class="gb-wide"> team</span> foul${t.fouls === 1 ? '' : 's'}${t.fouls >= 4 ? '<em><span class="gb-wide"> ·</span> penalty</em>' : ''}</small>`;
    const sbd = `<section class="gb-sbd" aria-label="Scoreboard">
      <div class="gb-sbd-top">${fin ? '<span class="lv-tag lv-tag-fin">FINAL</span>' : '<span class="lv-tag"><span class="lv-dot"></span>LIVE</span>'}<a href="#/c/${g.cid}">${esc(liveCompName(g.cid))}</a>${typeof watchLink === 'function' ? watchLink(g.mid, 'Watch with live stats', 'm-watch gb-watch') : ''}</div>
      <div class="gb-sbd-in">
        <div class="gb-tm">${crest(h.name, 64)}<div><b>${esc(h.name)}</b><b class="gb-code">${esc(watchCode(h.name))}</b>${foul(h)}</div></div>
        <div class="gb-mid"><div class="gb-score"><span class="gb-n${lead === 0 ? ' lead' : ''}">${odo(g.mid + ':h', h.score, at)}</span><span class="gb-clk">${clock}</span><span class="gb-n${lead === 1 ? ' lead' : ''}">${odo(g.mid + ':a', a.score, at)}</span></div>${line}</div>
        <div class="gb-tm r"><div><b>${esc(a.name)}</b><b class="gb-code">${esc(watchCode(a.name))}</b>${foul(a)}</div>${crest(a.name, 64)}</div>
      </div>
      <div class="gb-cmp">${bars}</div>
      <div class="gb-upd"><span class="gb-ring${fin ? ' done' : ''}" style="animation-duration:${LIVE.batch === false ? 30 : 15}s;animation-delay:-${Math.min(LIVE.batch === false ? 30 : 15, Math.max(0, (Date.now() - at) / 1000)).toFixed(1)}s" aria-hidden="true"></span>Score, clock, players and plays · updated <b data-gbago="${at}">${liveAgo(at)}</b><span class="gb-sp"></span>${fin ? 'Joins the season stats at the next database update' : `Updates by itself every ${LIVE.batch === false ? 30 : 15} s`}</div>
    </section>`;

    // play-by-play, newest first
    const all = (d.plays || []).filter(p => p.type !== 'substitution' || p.name);
    const S = SEEN[g.mid] || (SEEN[g.mid] = {});
    if (S.at !== at) { S.old = S.cur; S.cur = all.length; S.at = at; }
    const newFrom = S.old != null && fresh(at) && !quiet() ? S.old : Infinity;
    const pers = [...new Set(all.map(livePeriod))].reverse();
    if (LIVE.per !== 'all' && !pers.includes(LIVE.per)) LIVE.per = 'all';
    const isScore = p => p.scoring && p.made && (p.type === '2pt' || p.type === '3pt' || p.type === 'freethrow');
    const shown = all.map((p, i) => [p, all.length - 1 - i]).filter(([p]) => (LIVE.per === 'all' || livePeriod(p) === LIVE.per) && (!LIVE.scoring || isScore(p)));
    const chip = (k, l) => `<button type="button" aria-pressed="${LIVE.per === k}" onclick="livePlaysFilter('${k}')">${l}</button>`;
    let pp = null;
    const plays = shown.map(([p, ord]) => {
      const per = livePeriod(p), side = p.team === 1 ? 0 : p.team === 2 ? 1 : -1, tm = side >= 0 ? d.teams[side] : null;
      const pid = tm && p.no != null && p.no !== '' ? livePid(g.cid, tm.name, String(p.no)) : null, sc = isScore(p);
      const head = per !== pp ? `<li class="gb-per">${esc(per)}</li>` : '';
      pp = per;
      const who = p.name ? `${link(pid, esc(p.name))} ` : tm ? `<b>${esc(tm.name)}</b> ` : '';
      const what = p.name ? livePlayText(p) : livePlayCap(livePlayText(p));
      return head + `<li class="${sc ? 'gb-sc' : ''}${ord >= newFrom ? ' gb-new' : ''}" style="--th:${HUE[side] || HUE[0]}">
        <span class="gb-ck">${esc(String(p.clock || '').replace(/^0(\d:)/, '$1'))}</span>${tm ? crest(tm.name, 18) : '<span></span>'}${p.name ? face(pid, p.name, side, 'gb-sm') : '<span class="gb-av gb-sm gb-team"></span>'}
        <span class="gb-tx">${who}<span>${esc(what)}</span></span>${sc && p.score ? `<span class="gb-sb">${p.score[0]}–${p.score[1]}</span>` : '<span></span>'}</li>`;
    }).join('');
    const feed = `<section class="gb-card gb-feed"><header><h2>Play-by-play</h2><small>${shown.length} play${shown.length === 1 ? '' : 's'}${d.v >= 2 ? '' : ' (latest)'}</small>
        <div class="gb-chips" role="group" aria-label="Period">${chip('all', 'All')}${pers.map(k => chip(k, k)).join('')}</div>
        <label class="gb-sw"><input type="checkbox" ${LIVE.scoring ? 'checked' : ''} onchange="livePlaysFilter(null, this.checked)"><i></i>Scoring only</label></header>
      <ol class="gb-plays" tabindex="0" aria-label="Plays, newest first">${plays || '<li class="gb-empty">No plays for this filter yet.</li>'}</ol></section>`;

    // the box score, one team at a time
    const bt = LIVE.bt === 1 ? 1 : 0, t = d.teams[bt];
    const rows = [], dnp = [];
    t.pl.forEach((p, k) => {
      const s = fromLive(p), pid = p.pid || (p.no != null && p.no !== '' ? livePid(g.cid, t.name, String(p.no)) : null);
      if (playedNothing(s) && !p.starter && !(p.on && !fin)) { dnp.push(p.name); return; }
      // a row's key across polls: the person, else shirt and name (a feed can leave both blank, so the order too)
      rows.push({ id: pid ? String(pid) : `n${bt}:${p.no || ''}:${p.name || ''}:${p.no || p.name ? '' : k}`, pid, name: p.name, num: p.no, starter: !!p.starter, on: !!p.on && !fin, s });
    });
    const tt = t.tot && (t.tot.teamReb || t.tot.teamTov) ? `incl. team ${t.tot.teamReb || 0} REB · ${t.tot.teamTov || 0} TO` : '';
    const box = `<section class="gb-card gb-boxc"><header><h2>${fin ? 'Box score' : 'Live box score'}</h2>
        <div class="gb-seg" role="group" aria-label="Team">${d.teams.map((x, i) => `<button type="button" data-gbteam="${i}" aria-pressed="${i === bt}">${crest(x.name, 20)}<span>${esc(watchCode(x.name))}</span><b>${x.score}</b></button>`).join('')}</div></header>
      ${table({ key: `live:${g.mid}:${bt}`, cid: g.cid, side: bt, rows, dnp, live: !fin, at, foot: tt, label: t.name + ' box score' })}</section>`;
    const extra = h.tot && a.tot && h.tot.paint != null ? `<section class="gb-card gb-tst"><header><h2>Team stats</h2></header><table><thead><tr><th><span class="sr-only">Stat</span></th><th>${esc(watchCode(h.name))}</th><th>${esc(watchCode(a.name))}</th></tr></thead><tbody>
      ${[['Points in the paint', 'paint'], ['Fast-break points', 'fast'], ['Second-chance points', 'second'], ['Points off turnovers', 'offTov'], ['Bench points', 'bench'], ['Biggest lead', 'biggestLead']]
        .map(([l, k]) => `<tr><td>${l}</td><td class="${+h.tot[k] > +a.tot[k] ? 'win' : ''}">${h.tot[k] ?? '–'}</td><td class="${+a.tot[k] > +h.tot[k] ? 'win' : ''}">${a.tot[k] ?? '–'}</td></tr>`).join('')}</tbody></table></section>` : '';
    return `<div class="lv-crumb"><a href="#/">Home</a> › <a href="#/c/${g.cid}">${esc(liveCompName(g.cid))}</a> › ${esc(h.name)} vs ${esc(a.name)}</div>
      ${sbd}
      <div class="gb-lgrid">${feed}<div class="gb-col">${box}${extra}</div></div>
      <p class="gb-note">Live figures come straight from Genius Sports' LiveStats feed and can change as the scorer corrects them. Season averages, leaders, standings and BPM don't move during a game.</p>`;
  }

  /* ---------------- a finished game: header ---------------- */
  function flowSvg(mid, g) {
    const R = typeof PG_DATA !== 'undefined' && PG_DATA[mid];
    if (!R || !R.flow || !R.flow.length) return '';
    const QL = R.ql || 600, REG = 4 * QL, end = (R.gmin || 40) * 60;
    const W = 1000, H = 120, mx = Math.max(10, ...R.flow.map(p => Math.abs(p[1]))) + 2;
    const X = t => t / end * W, Y = m => H / 2 - m / mx * (H / 2 - 10);
    let path = `M0 ${Y(0)}`, prev = 0;
    R.flow.forEach(([t, m]) => { path += ` H${X(t).toFixed(1)} V${Y(m).toFixed(1)}`; prev = m; });
    path += ` H${W}`;
    const n = (R.periods || []).length || 4;
    const starts = Array.from({ length: n }, (_, i) => i < 4 ? i * QL : REG + (i - 4) * 300);
    const big = R.flow.reduce((b, p) => Math.abs(p[1]) > Math.abs(b[1]) ? p : b, [0, 0]);
    const nm = s => esc(watchCode(s ? g.a : g.h));
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Score margin through the game: ${esc(g.h)} above the line, ${esc(g.a)} below">
      <defs><clipPath id="gbu"><rect x="0" y="0" width="${W}" height="${Y(0)}"/></clipPath><clipPath id="gbd"><rect x="0" y="${Y(0)}" width="${W}" height="${H}"/></clipPath>
      <linearGradient id="gbgu" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="oklch(72% 0.14 ${HUE[0]})" stop-opacity=".6"/><stop offset="1" stop-color="oklch(72% 0.14 ${HUE[0]})" stop-opacity=".06"/></linearGradient>
      <linearGradient id="gbgd" x1="0" x2="0" y1="1" y2="0"><stop offset="0" stop-color="oklch(60% 0.15 ${HUE[1]})" stop-opacity=".6"/><stop offset="1" stop-color="oklch(60% 0.15 ${HUE[1]})" stop-opacity=".06"/></linearGradient></defs>
      ${starts.slice(1).map(s => `<line x1="${X(s)}" x2="${X(s)}" y1="0" y2="${H}" class="gb-qx"/>`).join('')}<line x1="0" x2="${W}" y1="${Y(0)}" y2="${Y(0)}" class="gb-zx"/>
      <path d="${path} V${Y(0)} H0Z" fill="url(#gbgu)" clip-path="url(#gbu)" class="gb-ar"/><path d="${path} V${Y(0)} H0Z" fill="url(#gbgd)" clip-path="url(#gbd)" class="gb-ar"/>
      <path d="${path}" class="gb-ln"/></svg>
      <div class="gb-fq">${starts.map((s, i) => `<span style="left:${(X(s) + X(i < n - 1 ? starts[i + 1] : end)) / 2 / W * 100}%">${i < 4 ? 'Q' + (i + 1) : 'OT' + (i - 3)}</span>`).join('')}</div>
      <div class="gb-flab"><span>Biggest lead <b>${Math.abs(big[1])}</b> ${big[1] ? nm(big[1] < 0) : ''}</span><span><i style="--th:${HUE[0]}"></i>${nm(0)} ahead <i style="--th:${HUE[1]}"></i>${nm(1)} ahead</span></div>`;
  }
  // the report's data file arrived: draw the chart into the waiting card
  function flowReady(mid) {
    const el = document.getElementById('gb-flow');
    if (!el || el.dataset.mid !== mid) return;
    const g = GAME_BY_MID[mid];
    const svg = g && flowSvg(mid, g);
    if (svg) el.innerHTML = '<h2>Game flow</h2>' + svg;
    else el.parentElement && el.parentElement.classList.add('gb-noflow'), el.remove();
  }
  function head(o) {
    const { cid, mid, g, tab, tabs, periods, status, round } = o;
    const done = g.st === 'COMPLETE' && g.hs != null;
    const w = done ? (+g.hs > +g.as ? 0 : +g.as > +g.hs ? 1 : -1) : -1;
    const side = (s) => {
      const nm = s ? g.a : g.h;
      return `<div class="gb-ht${s ? ' r' : ''}">${s ? '' : crest(nm, 72)}<div><b>${esc(nm)}</b><small>${s ? 'Away' : 'Home'}</small></div>${s ? crest(nm, 72) : ''}</div>`;
    };
    const when = [g.date ? fmtDate(g.date) : '', g.time || '', g.venue || ''].filter(Boolean).map(esc).join(' · ');
    const btns = (typeof watchLink === 'function' ? watchLink(mid, g.st === 'COMPLETE' ? 'Watch the game with stats' : 'Watch with live stats', 'm-watch gb-pri') : '')
      + (typeof scoutGameLinks === 'function' ? scoutGameLinks(mid, g) : '');
    const hero = `<section class="gb-hero">
      <h1 class="sr-only">${esc(g.h)}${g.hs != null ? ' ' + fmt0(g.hs) + ' – ' + fmt0(g.as) + ' ' : ' v '}${esc(g.a)}</h1>
      ${side(0)}
      <div class="gb-hs"><div class="gb-fsc"><span class="${w === 0 ? 'w' : ''}">${fmt0(g.hs)}</span><i>–</i><span class="${w === 1 ? 'w' : ''}">${fmt0(g.as)}</span></div>
        <div class="gb-chips2"><span class="gb-chip">${esc(status)}</span>${round ? `<span class="gb-chip gb-chip-r">${esc(round)}</span>` : ''}</div>
        ${when ? `<small>${when}</small>` : ''}
        ${btns ? `<div class="gb-hb">${btns}</div>` : ''}</div>
      ${side(1)}
    </section>`;
    let lines = '';
    if (periods && periods.length) {
      const ql = i => i < 4 ? 'Q' + (i + 1) : 'OT' + (i > 4 ? i - 3 : '');
      const ls = `<table class="gb-ls"><thead><tr><th>Team</th>${periods.map((p, i) => `<th>${ql(i)}</th>`).join('')}<th>Final</th></tr></thead><tbody>
        ${[0, 1].map(s => `<tr><td><span>${crest(s ? g.a : g.h, 22)}<b>${esc(s ? g.a : g.h)}</b><em>${esc(watchCode(s ? g.a : g.h))}</em></span></td>${periods.map(p => `<td class="${n0(p[s]) > n0(p[1 - s]) ? 'gb-qw' : ''}">${fmt0(p[s])}</td>`).join('')}<td class="gb-fin">${fmt0(s ? g.as : g.hs)}</td></tr>`).join('')}</tbody></table>`;
      let flow = '';
      const canFlow = g.st === 'COMPLETE' && typeof hasPostgame === 'function' && hasPostgame(cid, mid);
      if (canFlow) {
        const svg = flowSvg(mid, g);
        if (!svg && typeof ensurePostgame === 'function') ensurePostgame(mid);
        flow = `<div class="gb-card gb-flow" id="gb-flow" data-mid="${esc(mid)}"><h2>Game flow</h2>${svg || '<div class="gb-flwait"></div>'}</div>`;
      }
      lines = `<div class="gb-fline${flow ? '' : ' gb-noflow'}"><div class="gb-card gb-lsc"><div class="gb-tw2">${ls}</div></div>${flow}</div>`;
    }
    const tabbar = `<nav class="gb-ftabs" aria-label="Game sections">${tabs.map(([k, l, ok]) =>
      `<a class="${tab === k ? 'on' : ''}${ok ? '' : ' off'}" href="#/c/${cid}/${k}/${mid}"${tab === k ? ' aria-current="page"' : ''}>${l}</a>`).join('')}</nav>`;
    return `<div class="page gb-page">
      <div class="crumb"><a href="#/c/${cid}/schedule">Games</a> / ${esc(g.h)} v ${esc(g.a)}</div>
      ${hero}${lines}${tabbar}`;
  }

  /* ---------------- a finished game: box score ---------------- */
  function box(cid, mid, g, b) {
    const sides = [g.h, g.a];
    const lines = b.p.map((l, i) => ({ l, s: fromBox(l), i }));
    const hasMin = lines.some(x => x.s.sec != null);
    const teamPart = (name, side) => {
      const mine = lines.filter(x => x.l.team === name);
      if (!mine.length) return '';
      const rows = [], dnp = [];
      mine.forEach(({ l, s, i }) => {
        const nm = l.name || (l.pid ? personName(l.pid) : '—');
        // a line with no minutes and nothing else is a player who sat out
        if (hasMin && !l.starter && playedNothing(s) && (s.sec === 0 || s.sec == null)) { dnp.push(nm); return; }
        rows.push({ id: (l.pid || 'b' + mid + '-' + i) + '', pid: l.pid, name: nm, num: l.num, starter: !!l.starter, s });
      });
      const sc = side === 0 ? g.hs : side === 1 ? g.as : null;
      const won = side >= 0 && g.hs != null && (side === 0 ? +g.hs > +g.as : +g.as > +g.hs);
      const lost = side >= 0 && g.hs != null && (side === 0 ? +g.hs < +g.as : +g.as < +g.hs);
      return `<section class="gb-card gb-tb" style="--th:${HUE[side] ?? 250}"><header>${crest(name, 30)}<h3>${esc(name)}</h3>${won ? '<span class="gb-wl w">W</span>' : lost ? '<span class="gb-wl l">L</span>' : ''}${sc != null ? `<b class="gb-ts">${fmt0(sc)}</b>` : ''}</header>
        ${table({ key: `box:${mid}:${side}:${name}`, cid, side: Math.max(0, side), rows, dnp, label: name + ' box score' })}</section>`;
    };
    // the game's leaders: points, rebounds, assists, steals
    const withPid = lines.filter(x => x.l.pid && (x.l.team === g.h || x.l.team === g.a));
    const leaders = [['pts', 'Points'], ['reb', 'Rebounds'], ['ast', 'Assists'], ['stl', 'Steals']].map(([k, l]) => {
      const c = withPid.filter(x => val(x.s, k) != null && val(x.s, k) > 0).sort((p, q) => val(q.s, k) - val(p.s, k) || (q.s.pts || 0) - (p.s.pts || 0))[0];
      return c ? { k, l, x: c } : null;
    }).filter(Boolean);
    const ld = leaders.length >= 2 ? `<div class="gb-leaders">${leaders.map(({ k, l, x }, i) => {
      const side = x.l.team === g.a ? 1 : 0, s = x.s, nm = x.l.name || personName(x.l.pid);
      const line = [['pts', 'PTS'], ['reb', 'REB'], ['ast', 'AST']].filter(([q]) => val(s, q) != null).map(([q, t]) => `${val(s, q)} ${t}`).join(' · ');
      return `<a class="gb-ld" href="#/p/${x.l.pid}" style="--th:${HUE[side]};animation-delay:${i * 0.07}s">${face(x.l.pid, nm, side, 'gb-lg')}<span class="gb-lt"><small>${l}</small><b>${esc(nm)}</b><em>${crest(x.l.team, 14)} ${line}</em></span><span class="gb-lv">${val(s, k)}</span></a>`;
    }).join('')}</div>` : '';
    const other = [...new Set(lines.map(x => x.l.team).filter(t => !sides.includes(t)))];
    return ld + `<div class="gb-tbs">${teamPart(g.h, 0)}${teamPart(g.a, 1)}${other.map(t => teamPart(t || '—', -1)).join('')}</div>
      <p class="gb-note">Per-player box score as published on this game's statistics page; team totals are the sum of the player lines. Starters are grouped first where the source marks them. Click a column to sort, or a player for their career.</p>`;
  }

  return { table, live, head, box, flowReady, face, HUE };
})();
