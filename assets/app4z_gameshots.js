/* =========================================================================
   Shot chart — a tab of the box score page (#/c/<cid>/shots/<mid>). One game's
   shots, drawn by the profile's Shot map (app4u_shots.js, app4w_shot3d.js): the
   same 3D terrain, zones and every-shot views, set against the event's average.
   A team at a time, the whole team or one player of it, the whole game or one
   period.
   Data (build_shots.py): stats/shg/<mid>.js holds the game's chart, both sides;
   stats/sh/<cid>.js the event's averages. The sync reads a game's chart once it
   is final, for the competitions in data/shot_comps.json and every competition
   imported through data/add_comps.json. DB.shotG says which games have one
   ({c: competitions with charts, x: their finished games without one}).
   ========================================================================= */
const SG = {mid: null, side: 0, pid: '', q: 'all'};
let SG_SET = null;
function hasGameShots(cid, mid) {
  const d = DB.shotG; if (!d) return false;
  if (!SG_SET) SG_SET = {c: new Set(String(d.c || '').split(',')), x: new Set(String(d.x || '').split(','))};
  const g = matchGame(cid, mid);
  return !!g && g.st === 'COMPLETE' && SG_SET.c.has(cid) && !SG_SET.x.has(mid);
}
const sgShort = pid => { const n = personName(pid); return typeof watchShort === 'function' ? watchShort(n) || n : n; };
const sgTeam = t => typeof teamDisplay === 'function' ? teamDisplay(t) : t;
const sgFg = list => `${list.reduce((t, s) => t + s.made, 0)}/${list.length}`;

function renderMatchShots(cid, mid) {
  const g = matchGame(cid, mid);
  if (!g) return renderNotFound(cid);
  const head = matchHead(cid, mid, 'shots');
  const wait = msg => head + `<div class="card"><div class="empty-row"><span class="empty-dot"></span>${msg}</div></div></div>`;
  if (!SHG_DATA[mid]) {
    ensureGameShots(mid);
    return wait(SHG_ST[mid] === 'error' ? 'There is no shot chart for this game.' : 'Loading the shot chart…');
  }
  if (!SH_DATA[cid]) {
    ensureShots(cid);
    return wait(SH_ST[cid] === 'error' ? 'The shot chart could not be loaded. Refresh the page to try again.' : 'Loading the shot chart…');
  }
  if (SG.mid !== mid) { SG.mid = mid; SG.side = 0; SG.pid = ''; SG.q = 'all'; SM.zone = null; }
  const all = smGameShots(mid), mine = all.filter(s => s.side === SG.side);
  if (SG.pid && !mine.some(s => s.pid === SG.pid)) SG.pid = '';
  const pers = [...new Set(all.map(s => String(s.per)))].sort((a, b) => a - b);
  if (SG.q !== 'all' && pers.indexOf(SG.q) < 0) SG.q = 'all';
  SM.src = {mid, cid, side: SG.side, pid: SG.pid, q: SG.q};
  const team = SG.side ? g.a : g.h;
  // the shooters of this side, most attempts first, with their shirt numbers from the box score
  const box = getBox(mid), num = {};
  if (box) box.p.forEach(r => { if (r.pid) num[r.pid] = r.num; });
  const by = {}; mine.forEach(s => { if (s.pid) (by[s.pid] = by[s.pid] || []).push(s); });
  const shooters = Object.entries(by).sort((p, q) => q[1].length - p[1].length || q[1].reduce((t, s) => t + s.made, 0) - p[1].reduce((t, s) => t + s.made, 0));
  const inQ = l => SG.q === 'all' ? l : l.filter(s => String(s.per) === SG.q);
  const teams = [[0, g.h], [1, g.a]].map(([k, t]) => { const l = all.filter(s => s.side === k);
    return `<button class="sg-team" data-sgt="${k}" aria-pressed="${SG.side === k}">${crest(t, 26)}<span>${esc(sgTeam(t))}</span><small>${sgFg(l)} FG</small></button>`; }).join('');
  const chips = [`<button class="sg-chip sg-all" data-sgp="" aria-pressed="${!SG.pid}"><span>Whole team</span><small>${sgFg(inQ(mine))}</small></button>`]
    .concat(shooters.map(([pid, l]) => `<button class="sg-chip" data-sgp="${pid}" aria-pressed="${SG.pid === pid}">${avatar(pid)}<span>${num[pid] != null && num[pid] !== '' ? '#' + esc(num[pid]) + ' ' : ''}${esc(sgShort(pid))}</span><small>${sgFg(inQ(l))}</small></button>`)).join('');
  const qs = [['all', 'Whole game']].concat(pers.map(p => [p, sm3dPer(p)]));
  const qbar = `<div class="sm-seg" role="group" aria-label="Period">${qs.map(([k, l]) => `<button data-sgq="${k}" aria-pressed="${SG.q === k}">${l}<small>${sgFg((SG.pid ? mine.filter(s => s.pid === SG.pid) : mine).filter(s => k === 'all' || String(s.per) === k))}</small></button>`).join('')}</div>`;
  const who = SG.pid ? personName(SG.pid) : sgTeam(team);
  const when = SG.q === 'all' ? 'whole game' : sm3dPer(SG.q);
  const m = smMain([cid], [], `${who} · ${when}`);
  const line = SG.pid && box ? box.p.find(r => r.pid === SG.pid) : null;
  const card = SG.pid
    ? `<a class="sg-who" href="#/p/${SG.pid}">${avatar(SG.pid)}<span><b>${esc(personName(SG.pid))}</b><small>${esc(sgTeam(team))}${line ? ` · ${fmt0(line.pts)} pts · ${fmt0(line.fgm)}/${fmt0(line.fga)} FG · ${fmt0(line.tpm)}/${fmt0(line.tpa)} 3P` : ''}</small></span></a>`
    : `<div class="sg-who">${crest(team, 34)}<span><b>${esc(sgTeam(team))}</b><small>${SG.side ? fmt0(g.as) : fmt0(g.hs)} points · ${shooters.length} player${shooters.length === 1 ? '' : 's'} with a shot</small></span></div>`;
  return head + `<div class="sg">
    <div class="sg-teams" role="group" aria-label="Team">${teams}</div>
    <div class="sg-chips" role="group" aria-label="Shooter">${chips}</div>
    <div class="sg-sel">${card}${qbar}</div>
    ${m.html}
  </div></div>`;
}
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-sgt],[data-sgp],[data-sgq]'); if (!b) return;
  if (b.dataset.sgt !== undefined) { const k = +b.dataset.sgt; if (k === SG.side) return; SG.side = k; SG.pid = ''; }
  else if (b.dataset.sgp !== undefined) { if (b.dataset.sgp === SG.pid) return; SG.pid = b.dataset.sgp; }
  else { if (b.dataset.sgq === SG.q) return; SG.q = b.dataset.sgq; }
  SM.zone = null; softRoute();
});
