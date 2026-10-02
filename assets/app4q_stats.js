/* ---------------------------- Stats: Lineups and Clutch ----------------------------
   Two pages under the Stats tab of the site bar.

   Lineups  everything that happened while the same 5 (or 4, 3, 2) players shared the floor.
   Clutch   the last five minutes of the fourth quarter or an overtime, score within five.

   Both are worked out from the play-by-play (build_lineups.py rebuilds who was on court;
   build_lineup_stats.py and build_clutch.py add up what happened). The numbers for one
   competition live in their own small file, stats/lu/<cid>.js and stats/cl/<cid>.js, pulled
   in when that competition is chosen; DB.stats lists which competitions each page offers.
   The page shell is plain HTML from renderStats(); statsAfterRender() wires it up after the
   router has put it on the page, and the filters keep their state between visits. */
const STATS = (function () {
  'use strict';
  const IDX = DB.stats || { lu: { comps: [], meta: {} }, cl: { comps: [], meta: {} } };
  const DATA = { lu: {}, cl: {} }, LOAD = {};
  const el = id => document.getElementById(id);
  const PER = 50;
  const div = (a, b) => b ? a / b : null;
  const opt = (v, t, sel) => '<option value="' + esc(v) + '"' + (sel ? ' selected' : '') + '>' + esc(t) + '</option>';

  // ---- one competition's file, pulled in on demand ---------------------------------
  function put(kind, cid, d) { DATA[kind][cid] = d; }
  function load(kind, cid) {
    const k = kind + ':' + cid;
    if (DATA[kind][cid]) return 'done';
    if (LOAD[k]) return LOAD[k];
    LOAD[k] = 'loading';
    const s = document.createElement('script');
    s.src = 'stats/' + kind + '/' + cid + '.js';
    s.onload = () => { LOAD[k] = DATA[kind][cid] ? 'done' : 'error'; redraw(); };
    s.onerror = () => { LOAD[k] = 'error'; redraw(); };
    document.head.appendChild(s);
    return 'loading';
  }
  const waiting = (state, cols, what) => '<tr><td class="st-empty" colspan="' + cols + '">' + (state === 'error'
    ? 'The ' + what + ' numbers for this competition could not be loaded. Check the connection and choose the competition again.'
    : 'Loading this competition…') + '</td></tr>';

  // ---- shared pieces ----------------------------------------------------------------
  // "Wei Lin Khoo" -> "W.L. Khoo"; "Jia Yu, Ivan Chia" -> "J.Y. Chia" (the western given name sits after the comma)
  function short(name) {
    const main = String(name).split(',')[0].trim().split(/\s+/);
    const all = String(name).replace(',', ' ').trim().split(/\s+/);
    const fam = all[all.length - 1];
    const given = (main[main.length - 1] === fam ? main.slice(0, -1) : main).filter(w => !/^(bin|binti|b|bt|a\/l|a\/p|al|ap)$/i.test(w));
    return (given.length ? given.map(w => w[0].toUpperCase() + '.').join('') + ' ' : '') + fam;
  }
  const famOf = name => { const a = String(name).replace(',', ' ').trim().split(/\s+/); return a[a.length - 1].toLowerCase(); };
  const plink = (p, text) => /^\d+$/.test(p[0])
    ? '<a href="#/p/' + p[0] + '" title="' + esc(p[1]) + '">' + esc(text) + '</a>'
    : '<span title="' + esc(p[1]) + ' (not matched to a profile)">' + esc(text) + '</span>';
  const C = (key, label, title, spec, more) => Object.assign({ key, label, title }, spec, more || {});
  const pct = f => ({ get: f, dec: 1 });
  function fmt(v, col, mode) {
    if (v == null || !isFinite(v)) return '<span class="st-dash">—</span>';
    const s = v.toFixed(col.count ? (mode === 'tot' ? 0 : 1) : col.dec);
    if (!col.sign) return s;
    return '<span class="' + (v > 0 ? 'st-pos' : v < 0 ? 'st-neg' : '') + '">' + (v > 0 ? '+' : '') + s + '</span>';
  }
  function sortRows(rows, dir, val, tie) {
    return rows.slice().sort((a, b) => {
      const x = val(a), y = val(b);
      if (x == null && y == null) return tie(a, b);
      if (x == null) return 1; if (y == null) return -1;
      return (x - y) * dir || tie(a, b);
    });
  }
  function pager(p, S, total) {
    const pages = Math.max(1, Math.ceil(total / PER));
    S.page = Math.min(Math.max(1, S.page), pages);
    el(p + 'n-rows').textContent = total.toLocaleString();
    el(p + 'n-pages').textContent = pages;
    el(p + 'f-page').innerHTML = Array.from({ length: pages }, (_, i) => '<option' + (i + 1 === S.page ? ' selected' : '') + '>' + (i + 1) + '</option>').join('');
    el(p + 'prev').disabled = S.page <= 1; el(p + 'next').disabled = S.page >= pages;
  }
  const headCells = (cols, col, dir) => cols.map(x => '<th scope="col"' + (x.key === col.key ? ' aria-sort="' + (dir < 0 ? 'descending' : 'ascending') + '"' : '')
    + '><button data-sort="' + x.key + '" title="' + esc(x.title) + '">' + esc(x.label) + '</button></th>').join('');
  const footText = (S, n, total, col) => n ? 'Rows ' + ((S.page - 1) * PER + 1).toLocaleString() + '–' + ((S.page - 1) * PER + n).toLocaleString() + ' of ' + total.toLocaleString()
    + ' · sorted by ' + col.label + (S.dir < 0 ? ', high to low' : ', low to high') : '';
  function panel(p, S, key, btn, id) {
    el(p + id).hidden = !S[key]; el(p + btn).setAttribute('aria-expanded', !!S[key]);
  }
  function wire(p, S, draw, views) {
    el(p + 'views').addEventListener('click', e => {
      const b = e.target.closest('[data-view]'); if (!b) return;
      S.view = b.dataset.view;
      if (!views()[S.view].cols.some(x => x.key === S.sort)) { S.sort = views()[S.view].first || 'min'; S.dir = -1; }
      S.page = 1; draw();
    });
    el(p + 'f-page').addEventListener('change', e => { S.page = +e.target.value; draw(); });
    el(p + 'prev').addEventListener('click', () => { S.page--; draw(); });
    el(p + 'next').addEventListener('click', () => { S.page++; draw(); });
    el(p + 'thead').addEventListener('click', e => {
      const b = e.target.closest('[data-sort]'); if (!b) return;
      const col = views()[S.view].cols.find(x => x.key === b.dataset.sort);
      const k = col ? col.key : (views()[S.view].first || 'min');
      if (S.sort === k) S.dir = -S.dir; else { S.sort = k; S.dir = col && col.low ? 1 : -1; }
      S.page = 1; draw();
    });
    [['adv-btn', 'adv', 'adv'], ['gl-btn', 'gloss', 'gl']].forEach(([btn, id, key]) => el(p + btn).addEventListener('click', () => {
      S[key] = !S[key]; panel(p, S, key, btn, id);
      if (S[key] && id === 'gloss') el(p + id).scrollIntoView({ block: 'nearest' });
    }));
    panel(p, S, 'adv', 'adv-btn', 'adv'); panel(p, S, 'gl', 'gl-btn', 'gloss');
  }
  const viewButtons = (p, V, cur) => { el(p + 'views').innerHTML = Object.keys(V).map(k =>
    '<button class="st-view" data-view="' + k + '" aria-pressed="' + (k === cur) + '">' + V[k].name + '</button>').join(''); };
  const glossList = (p, cols) => { el(p + 'gl').innerHTML = cols.map(x => '<div><dt>' + esc(x.label) + '</dt><dd>' + esc(x.title) + '</dd></div>').join(''); };
  const pctTxt = v => v == null ? '—' : (v * 100).toFixed(1) + '%';
  const crumb = t => { const c = el('st-crumb'); if (c) c.textContent = t; };

  // one side's box line from [pts, ...build_lineups.BX], with the team's own turnovers and
  // rebounds folded in where a rate needs them
  function side(a) {
    const s = { pts: a[0], fgm: a[1], fga: a[2], tpm: a[3], tpa: a[4], ftm: a[5], fta: a[6], oreb: a[7], dreb: a[8],
      ast: a[9], tov: a[10] + a[17], stl: a[11], blk: a[12], pf: a[13], pfd: a[14], orebA: a[7] + a[15], drebA: a[8] + a[16] };
    s.reb = s.oreb + s.dreb;
    s.poss = s.fga + 0.44 * s.fta - s.orebA + s.tov;
    return s;
  }
  const pieOf = x => x.pts + x.fgm + x.ftm - x.fga - x.fta + x.dreb + 0.5 * x.oreb + x.ast + x.stl + 0.5 * x.blk - x.pf - x.tov;
  // the team-level measures both pages share (o = own side, d = the other side)
  function teamMeasures(o, d, min, gp) {
    const poss = (o.poss + d.poss) / 2;
    const m = { o, d, poss, min, gp, pm: o.pts - d.pts, blka: d.blk, oblka: o.blk,
      fgp: div(o.fgm * 100, o.fga), tpp: div(o.tpm * 100, o.tpa), ftp: div(o.ftm * 100, o.fta),
      ofgp: div(d.fgm * 100, d.fga), otpp: div(d.tpm * 100, d.tpa), oftp: div(d.ftm * 100, d.fta),
      ortg: div(o.pts * 100, poss), drtg: div(d.pts * 100, poss),
      astp: div(o.ast * 100, o.fgm), astto: div(o.ast, o.tov), astr: div(o.ast * 100, o.fga + 0.44 * o.fta + o.ast + o.tov),
      orebp: div(o.orebA * 100, o.orebA + d.drebA), drebp: div(o.drebA * 100, o.drebA + d.orebA),
      rebp: div((o.orebA + o.drebA) * 100, o.orebA + o.drebA + d.orebA + d.drebA),
      tovp: div(o.tov * 100, o.fga + 0.44 * o.fta + o.tov), efg: div((o.fgm + 0.5 * o.tpm) * 100, o.fga),
      ts: div(o.pts * 100, 2 * (o.fga + 0.44 * o.fta)), pace: div(poss * 40, min),
      pie: div(pieOf(o) * 100, pieOf(o) + pieOf(d)),
      ftr: div(o.fta, o.fga), oefg: div((d.fgm + 0.5 * d.tpm) * 100, d.fga), oftr: div(d.fta, d.fga),
      otovp: div(d.tov * 100, d.fga + 0.44 * d.fta + d.tov), oorebp: div(d.orebA * 100, d.orebA + o.drebA),
      fga2: div((o.fga - o.tpa) * 100, o.fga), fga3: div(o.tpa * 100, o.fga),
      pts2: div((o.fgm - o.tpm) * 2 * 100, o.pts), pts3: div(o.tpm * 3 * 100, o.pts), ptsft: div(o.ftm * 100, o.pts) };
    m.net = m.ortg == null || m.drtg == null ? null : m.ortg - m.drtg;
    return m;
  }
  // the box-score columns of one side, shared by Lineups (own and opponent) and Clutch teams
  const boxCols = (who, pre, word, cnt, m2) => [
    C(who + 'fgm', pre + 'FGM', word + 'field goals made', cnt(who, 'fgm')), C(who + 'fga', pre + 'FGA', word + 'field goals attempted', cnt(who, 'fga')),
    C(who + 'fgp', pre + 'FG%', word + 'field goal percentage', pct(m => who === 'o' ? m2(m).fgp : m2(m).ofgp)),
    C(who + 'tpm', pre + '3PM', word + 'three-pointers made', cnt(who, 'tpm')), C(who + 'tpa', pre + '3PA', word + 'three-pointers attempted', cnt(who, 'tpa')),
    C(who + 'tpp', pre + '3P%', word + 'three-point percentage', pct(m => who === 'o' ? m2(m).tpp : m2(m).otpp)),
    C(who + 'ftm', pre + 'FTM', word + 'free throws made', cnt(who, 'ftm')), C(who + 'fta', pre + 'FTA', word + 'free throws attempted', cnt(who, 'fta')),
    C(who + 'ftp', pre + 'FT%', word + 'free throw percentage', pct(m => who === 'o' ? m2(m).ftp : m2(m).oftp)),
    C(who + 'oreb', pre + 'OREB', word + 'offensive rebounds credited to a player', cnt(who, 'oreb')), C(who + 'dreb', pre + 'DREB', word + 'defensive rebounds credited to a player', cnt(who, 'dreb')),
    C(who + 'reb', pre + 'REB', word + 'rebounds credited to a player', cnt(who, 'reb')), C(who + 'ast', pre + 'AST', word + 'assists', cnt(who, 'ast')),
    C(who + 'tov', pre + 'TOV', word + 'turnovers, the team’s own (shot clock, 8 seconds) included', cnt(who, 'tov')),
    C(who + 'stl', pre + 'STL', word + 'steals', cnt(who, 'stl')), C(who + 'blk', pre + 'BLK', word + 'blocks', cnt(who, 'blk'))];
  const teamAdvCols = m2 => [
    C('ortg', 'OFFRTG', 'Points scored per 100 possessions', pct(m => m2(m).ortg)), C('drtg', 'DEFRTG', 'Points allowed per 100 possessions', pct(m => m2(m).drtg), { low: true }),
    C('net', 'NETRTG', 'Offensive rating minus defensive rating', pct(m => m2(m).net), { sign: true })];
  const scoringCols = m2 => [
    C('fga2', '%FGA 2PT', 'Share of field goal attempts that were twos', pct(m => m2(m).fga2)), C('fga3', '%FGA 3PT', 'Share of field goal attempts that were threes', pct(m => m2(m).fga3)),
    C('pts2', '%PTS 2PT', 'Share of points from twos', pct(m => m2(m).pts2)), C('pts3', '%PTS 3PT', 'Share of points from threes', pct(m => m2(m).pts3)),
    C('ptsft', '%PTS FT', 'Share of points from free throws', pct(m => m2(m).ptsft))];
  const seasons = comps => [...new Set(comps.map(c => c.year))].sort((a, b) => b - a);
  // the competition last chosen on either page: the other page opens on it too when it has it
  let LAST = null;
  const follow = (S, BY) => { if (LAST && BY[LAST] && S.cid !== LAST) { S.cid = LAST; S.season = BY[LAST].year; S.team = ''; S.page = 1; if ('vs' in S) S.vs = ''; if ('player' in S) S.player = ''; } };
  const teamOpts = (d, all, pre, cur) => opt('', all, cur === '') + d.teams.map((t, i) => [t[0], i]).sort((a, b) => a[0].localeCompare(b[0]))
    .map(([n, i]) => opt(i, pre + n, String(i) === String(cur))).join('');

  // =============================================================================
  // Lineups
  // =============================================================================
  const LU = (function () {
    const p = 'st-lu-', COMPS = IDX.lu.comps, BY = {};
    COMPS.forEach(c => { BY[c.id] = c; });
    const first = COMPS[0];
    const S = first ? { season: first.year, cid: first.id, mode: 'tot', team: '', n: 5, view: 'trad', min: 0, gp: 1, player: '', sort: 'min', dir: -1, page: 1, adv: false, gl: false } : null;
    const measure = r => r.m || (r.m = teamMeasures(side(r.o), side(r.d), r.sec / 60, r.gp));
    function per(v, m) {
      if (S.mode === 'tot') return v;
      if (S.mode === 'pg') return div(v, m.gp);
      if (S.mode === 'p40') return div(v * 40, m.min);
      return div(v * 100, m.poss);
    }
    const cnt = (who, k) => ({ get: m => per(m[who][k], m), count: true });
    const id = m => m;
    const GPMIN = [
      C('gp', 'GP', 'Games in which this group shared the floor', { get: m => m.gp, dec: 0 }),
      C('min', 'MIN', 'Minutes on court together', { get: m => S.mode === 'pg' ? div(m.min, m.gp) : m.min, dec: 1 })];
    const tail = who => [
      C(who + 'blka', (who === 'd' ? 'OPP ' : '') + 'BLKA', (who === 'd' ? 'Opponents’ ' : '') + 'shots blocked by the other side', { get: m => per(who === 'o' ? m.blka : m.oblka, m), count: true }),
      C(who + 'pf', (who === 'd' ? 'OPP ' : '') + 'PF', (who === 'd' ? 'Opponents’ ' : '') + 'personal fouls', cnt(who, 'pf')),
      C(who + 'pfd', (who === 'd' ? 'OPP ' : '') + 'PFD', (who === 'd' ? 'Opponents’ ' : '') + 'fouls drawn', cnt(who, 'pfd'))];
    const PM = C('pm', '+/-', 'Points scored minus points allowed while on court together', { get: m => per(m.pm, m), count: true, sign: true });
    const VIEWS = {
      trad: { name: 'Traditional', cols: GPMIN.concat([C('pts', 'PTS', 'Points scored', cnt('o', 'pts'))], boxCols('o', '', '', cnt, id), tail('o'), [PM]) },
      adv: { name: 'Advanced', rate: true, cols: GPMIN.concat(teamAdvCols(id), [
        C('astp', 'AST%', 'Share of made field goals that were assisted', pct(m => m.astp)), C('astto', 'AST/TO', 'Assists per turnover', { get: m => m.astto, dec: 2 }),
        C('astr', 'AST RATIO', 'Assists per 100 plays (FGA + 0.44 × FTA + AST + TOV)', pct(m => m.astr)),
        C('orebp', 'OREB%', 'Share of available offensive rebounds taken, team rebounds included', pct(m => m.orebp)),
        C('drebp', 'DREB%', 'Share of available defensive rebounds taken, team rebounds included', pct(m => m.drebp)),
        C('rebp', 'REB%', 'Share of all rebounds taken, team rebounds included', pct(m => m.rebp)),
        C('tovp', 'TOV%', 'Turnovers per 100 plays (FGA + 0.44 × FTA + TOV)', pct(m => m.tovp), { low: true }),
        C('efg', 'EFG%', 'Field goal percentage with a three counted as 1.5 makes', pct(m => m.efg)),
        C('ts', 'TS%', 'Points per two shooting attempts (FGA + 0.44 × FTA)', pct(m => m.ts)),
        C('pace', 'PACE', 'Possessions per 40 minutes', pct(m => m.pace)),
        C('pie', 'PIE', 'Share of the game’s box-score events that went this side’s way', pct(m => m.pie)),
        C('poss', 'POSS', 'Possessions played, the average of both sides’ estimates', { get: m => m.poss, dec: 0 })]) },
      four: { name: 'Four Factors', rate: true, cols: GPMIN.concat([
        C('efg', 'EFG%', 'Effective field goal percentage', pct(m => m.efg)), C('ftr', 'FTA RATE', 'Free throws attempted per field goal attempt', { get: m => m.ftr, dec: 3 }),
        C('tovp', 'TOV%', 'Turnovers per 100 plays', pct(m => m.tovp), { low: true }), C('orebp', 'OREB%', 'Share of available offensive rebounds taken', pct(m => m.orebp)),
        C('oefg', 'OPP EFG%', 'Opponents’ effective field goal percentage', pct(m => m.oefg), { low: true }),
        C('oftr', 'OPP FTA RATE', 'Opponents’ free throws attempted per field goal attempt', { get: m => m.oftr, dec: 3 }, { low: true }),
        C('otovp', 'OPP TOV%', 'Opponents’ turnovers per 100 plays', pct(m => m.otovp)),
        C('oorebp', 'OPP OREB%', 'Share of their own misses the opponents rebounded', pct(m => m.oorebp), { low: true })]) },
      scor: { name: 'Scoring', rate: true, cols: GPMIN.concat(scoringCols(id), [C('astp', '%FGM AST', 'Share of made field goals that were assisted', pct(m => m.astp))]) },
      opp: { name: 'Opponent', cols: GPMIN.concat([C('opts', 'OPP PTS', 'Points allowed', cnt('d', 'pts'))], boxCols('d', 'OPP ', 'Opponents’ ', cnt, id), tail('d'), [PM]) },
    };
    // groups of n players, summed from the five-man rows
    const cache = {};
    function combos(arr, k) {
      const out = [];
      (function go(start, pick) {
        if (pick.length === k) { out.push(pick.slice()); return; }
        for (let i = start; i <= arr.length - (k - pick.length); i++) { pick.push(arr[i]); go(i + 1, pick); pick.pop(); }
      })(0, []);
      return out;
    }
    function groups(cid, d, n) {
      const key = cid + ':' + n;
      if (cache[key]) return cache[key];
      const map = new Map();
      d.rows.forEach(row => {
        const ti = row[0], five = row[1];
        (n === 5 ? [five] : combos(five, n)).forEach(pl => {
          const k = ti + '|' + pl.join(',');
          let g = map.get(k);
          if (!g) map.set(k, g = { ti, p: pl, sec: 0, games: new Set(), o: new Array(18).fill(0), d: new Array(18).fill(0) });
          g.sec += row[2];
          row[3].forEach(x => g.games.add(x));
          for (let i = 0; i < 18; i++) { g.o[i] += row[4][i]; g.d[i] += row[5][i]; }
        });
      });
      const out = [...map.values()];
      out.forEach(g => { g.gp = g.games.size; delete g.games; });
      return (cache[key] = out);
    }
    function current() {
      const c = BY[S.cid], d = DATA.lu[S.cid];
      const view = VIEWS[S.view], col = view.cols.find(x => x.key === S.sort) || view.cols[1];
      if (!d) return { c, d, rows: [], view, col };
      let rows = groups(S.cid, d, S.n);
      if (S.team !== '') rows = rows.filter(r => r.ti === +S.team);
      if (S.player !== '') rows = rows.filter(r => r.p.indexOf(+S.player) >= 0);
      if (S.min > 0) rows = rows.filter(r => r.sec / 60 >= S.min);
      if (S.gp > 1) rows = rows.filter(r => r.gp >= S.gp);
      rows = sortRows(rows, S.dir, r => col.get(measure(r)), (a, b) => b.sec - a.sec);
      return { c, d, rows, view, col };
    }
    function fillComp() {
      const list = COMPS.filter(c => c.year === S.season);
      if (!list.some(c => c.id === S.cid)) S.cid = list[0].id;
      el(p + 'f-comp').innerHTML = list.map(c => opt(c.id, c.label, c.id === S.cid)).join('');
    }
    function fillTeams(d) {
      el(p + 'f-team').innerHTML = teamOpts(d, 'All Teams', '', S.team);
      const on = new Set();
      d.rows.forEach(r => { if (S.team === '' || r[0] === +S.team) r[1].forEach(i => on.add(i)); });
      if (S.player !== '' && !on.has(+S.player)) S.player = '';
      const list = [...on].map(i => [d.players[i][1], i]).sort((a, b) => a[0].localeCompare(b[0]));
      el(p + 'f-player').innerHTML = opt('', S.team === '' ? 'Any player' : 'Any player on this team', S.player === '') + list.map(([n, i]) => opt(i, n, String(i) === String(S.player))).join('');
    }
    function draw() {
      if (!S || !el(p + 'tbody')) return;
      const state = load('lu', S.cid);
      const { c, d, rows, view, col } = current();
      pager(p, S, rows.length);
      el(p + 'thead').innerHTML = '<tr><th class="st-left st-lu" scope="col"><button data-sort="min" title="Players, most minutes together first">Lineups</button></th>'
        + '<th class="st-tmh" scope="col"><button data-sort="min" title="Team">Team</button></th>' + headCells(view.cols, col, S.dir) + '</tr>';
      const slice = rows.slice((S.page - 1) * PER, S.page * PER);
      if (!d) {
        el(p + 'tbody').innerHTML = waiting(state, view.cols.length + 2, 'lineup');
        el(p + 'f-team').innerHTML = opt('', 'All Teams', true); el(p + 'f-player').innerHTML = opt('', 'Any player', true);
      } else {
        fillTeams(d);
        el(p + 'tbody').innerHTML = slice.length ? slice.map(r => {
          const m = measure(r);
          const names = r.p.map(i => d.players[i]).sort((a, b) => famOf(a[1]).localeCompare(famOf(b[1])));
          const t = d.teams[r.ti];
          return '<tr><td class="st-lu">' + names.map(x => plink(x, short(x[1]))).join('<span class="st-sep">-</span>') + '</td><td class="st-tm"><span class="st-code" title="' + esc(t[0]) + '">' + esc(t[1]) + '</span></td>'
            + view.cols.map(x => '<td' + (x.key === col.key ? ' class="st-sorted"' : '') + '>' + fmt(x.get(m), x, S.mode) + '</td>').join('') + '</tr>';
        }).join('') : '<tr><td class="st-empty" colspan="' + (view.cols.length + 2) + '">No lineup matches these filters. Lower the minimum minutes or games, or clear the player.</td></tr>';
      }
      el(p + 'cov').textContent = 'Lineups rebuilt for ' + c.games + ' of ' + c.done + ' games';
      el(p + 'foot-l').textContent = footText(S, slice.length, rows.length, col);
      el(p + 'foot-r').textContent = c.label;
      el(p + 'f-mode').disabled = !!view.rate; el(p + 'mode-hint').hidden = !view.rate;
      viewButtons(p, VIEWS, S.view);
      const chips = ['<span class="st-chip st-fixed">Season: <b>' + c.year + '</b></span>'];
      const chip = (k, label, v) => chips.push('<span class="st-chip">' + label + ': <b>' + esc(v) + '</b><button data-clear="' + k + '" aria-label="Remove ' + label + ' filter">×</button></span>');
      if (d && S.team !== '') chip('team', 'Team', d.teams[+S.team][0]);
      if (d && S.player !== '') chip('player', 'With', d.players[+S.player][1]);
      if (S.min > 0) chip('min', 'Minutes', S.min + '+');
      if (S.gp > 1) chip('gp', 'Games', S.gp + '+');
      el(p + 'chips').innerHTML = chips.join('');
      glossList(p, view.cols);
      crumb('Lineups / ' + view.name);
    }
    function mount() {
      if (!S) return;
      follow(S, BY);
      el(p + 'f-season').innerHTML = seasons(COMPS).map(y => opt(y, y, y === S.season)).join('');
      fillComp();
      el(p + 'f-mode').value = S.mode; el(p + 'f-n').value = S.n; el(p + 'f-min').value = S.min; el(p + 'f-gp').value = S.gp;
      const M = IDX.lu.meta;
      el(p + 'gl-intro').textContent = 'The feed logs every substitution, so the five on court can be followed through a game and each shot, rebound, foul and point given to the players who were there. '
        + 'A row for four, three or two players adds up every five that contained them. Small samples swing wildly: a lineup with a handful of minutes can post any percentage.';
      el(p + 'check').innerHTML = '<div><b>' + (M.games || 0).toLocaleString() + '</b><span>games with lineups rebuilt exactly, five a side in every period</span></div>'
        + '<div><b>' + (M.lineups || 0).toLocaleString() + '</b><span>five-man lineups across ' + COMPS.length + ' competitions</span></div>'
        + '<div><b>' + pctTxt(M.pts_exact) + '</b><span>of team-games where the stints add back to the box-score points</span></div>'
        + '<div><b>' + pctTxt(M.all_exact) + '</b><span>where every counter matches the box score: shots, rebounds, assists, turnovers, steals, blocks, fouls</span></div>';
      el(p + 'f-season').addEventListener('change', e => { S.season = +e.target.value; S.team = ''; S.player = ''; S.page = 1; fillComp(); LAST = S.cid; draw(); });
      el(p + 'f-comp').addEventListener('change', e => { S.cid = LAST = e.target.value; S.team = ''; S.player = ''; S.page = 1; draw(); });
      el(p + 'f-mode').addEventListener('change', e => { S.mode = e.target.value; S.page = 1; draw(); });
      el(p + 'f-team').addEventListener('change', e => { S.team = e.target.value; S.page = 1; draw(); });
      el(p + 'f-n').addEventListener('change', e => { S.n = +e.target.value; S.page = 1; draw(); });
      el(p + 'f-player').addEventListener('change', e => { S.player = e.target.value; S.page = 1; draw(); });
      el(p + 'f-min').addEventListener('input', e => { S.min = Math.max(0, +e.target.value || 0); S.page = 1; draw(); });
      el(p + 'f-gp').addEventListener('input', e => { S.gp = Math.max(1, +e.target.value || 1); S.page = 1; draw(); });
      el(p + 'chips').addEventListener('click', e => {
        const b = e.target.closest('[data-clear]'); if (!b) return;
        const k = b.dataset.clear;
        if (k === 'team') S.team = '';
        if (k === 'player') S.player = '';
        if (k === 'min') { S.min = 0; el(p + 'f-min').value = 0; }
        if (k === 'gp') { S.gp = 1; el(p + 'f-gp').value = 1; }
        S.page = 1; draw();
      });
      wire(p, S, draw, () => VIEWS);
      draw();
    }
    return { S, draw, mount, current, measure, groups };
  })();

  // =============================================================================
  // Clutch
  // =============================================================================
  const CL = (function () {
    const p = 'st-cl-', COMPS = IDX.cl.comps, BY = {};
    COMPS.forEach(c => { BY[c.id] = c; });
    const first = COMPS[0];
    const S = first ? { season: first.year, cid: first.id, who: 'players', view: 'trad', mode: 'tot', time: 300, ab: 'any', diff: 5, period: 'all', outcome: 'all',
      team: '', vs: '', pos: '', start: 'all', min: 0, gp: 1, q: '', sort: 'pts', dir: -1, page: 1, adv: false, gl: false } : null;
    const NB = 18;                                   // points + the 17 counters
    const blank = () => new Array(NB).fill(0);
    // add one event's counters (bit i of mask = counter i) and points to a [pts, ...BX] line
    function add(a, mask, pts) { a[0] += pts; for (let i = 0; mask; i++, mask >>= 1) if (mask & 1) a[i + 1]++; }
    const okMargin = ms => Math.abs(ms) <= S.diff && (S.ab === 'any' || (S.ab === 'behind' ? ms <= 0 : ms >= 0));
    const okPeriod = per => S.period === 'all' || (S.period === 'q4' ? per === 4 : per >= 5);

    // every row of the competition's timeline that passes the filters, added up per player and per team
    function tally(d) {
      const players = new Map(), teams = new Map();
      const rec = (map, k, base) => { let r = map.get(k); if (!r) map.set(k, r = Object.assign({ sec: 0, games: new Set(), wins: new Set(), own: blank(), on: blank(), opp: blank() }, base)); return r; };
      d.games.forEach((g, gi) => {
        const tm = [g.h, g.a], won = [g.hs > g.as, g.as > g.hs];
        // which sides of this game pass the team, opponent and outcome filters
        const sideOk = [0, 1].map(s => (S.team === '' || tm[s] === +S.team) && (S.vs === '' || tm[1 - s] === +S.vs)
          && (S.outcome === 'all' || (S.outcome === 'w') === won[s]));
        if (!sideOk[0] && !sideOk[1]) return;
        const starters = [new Set(g.st[0]), new Set(g.st[1])];
        const plOk = (s, i) => (S.start === 'all' || (S.start === 's') === starters[s].has(i)) && (S.pos === '' || d.players[i][2] === S.pos);
        const touch = (r, s) => { r.games.add(gi); if (won[s]) r.wins.add(gi); };
        g.rows.forEach(row => {
          if (!okPeriod(row[1])) return;
          if (row[0] === 0) {
            const sec = Math.min(row[2], S.time) - Math.min(row[3], S.time);
            if (sec <= 0) return;
            for (let s = 0; s < 2; s++) {
              if (!sideOk[s] || !okMargin(s === 0 ? row[4] : -row[4])) continue;
              const t = rec(teams, tm[s], { ti: tm[s] }); t.sec += sec; touch(t, s);
              g.lu[row[5]][s].forEach(i => { if (plOk(s, i)) { const r = rec(players, tm[s] + ':' + i, { ti: tm[s], pi: i }); r.sec += sec; touch(r, s); } });
            }
          } else {
            if (row[2] > S.time) return;
            const s = row[5], o = 1 - s, ms = s === 0 ? row[3] : -row[3], mask = row[7], pts = row[8], five = g.lu[row[4]];
            if (sideOk[s] && okMargin(ms)) {
              const t = rec(teams, tm[s], { ti: tm[s] }); add(t.own, mask, pts); touch(t, s);
              five[s].forEach(i => { if (plOk(s, i)) add(rec(players, tm[s] + ':' + i, { ti: tm[s], pi: i }).on, mask, pts); });
              if (row[6] >= 0 && plOk(s, row[6])) { const r = rec(players, tm[s] + ':' + row[6], { ti: tm[s], pi: row[6] }); add(r.own, mask, pts); touch(r, s); }
            }
            if (sideOk[o] && okMargin(-ms)) {
              add(rec(teams, tm[o], { ti: tm[o] }).opp, mask, pts);
              five[o].forEach(i => { if (plOk(o, i)) add(rec(players, tm[o] + ':' + i, { ti: tm[o], pi: i }).opp, mask, pts); });
            }
          }
        });
      });
      const done = r => { r.gp = r.games.size; r.w = r.wins.size; r.l = r.gp - r.w; r.min = r.sec / 60; return r; };
      return { players: [...players.values()].map(done), teams: [...teams.values()].map(r => { r.on = r.own; return done(r); }) };
    }
    // a player's measures: his own line, and the team and the opponents while he was on court
    function measure(r) {
      if (r.m) return r.m;
      const me = side(r.own), T = side(r.on), O = side(r.opp), tm = teamMeasures(T, O, r.min, r.gp);
      const play = x => x.fga + 0.44 * x.fta + x.tov;
      const sh = k => div(me[k] * 100, T[k]);
      const m = { me, T, O, tm, gp: r.gp, w: r.w, l: r.l, min: r.min, pm: T.pts - O.pts,
        fgp: div(me.fgm * 100, me.fga), tpp: div(me.tpm * 100, me.tpa), ftp: div(me.ftm * 100, me.fta),
        astp: div(me.ast * 100, T.fgm - me.fgm), astto: div(me.ast, me.tov), astr: div(me.ast * 100, me.fga + 0.44 * me.fta + me.ast + me.tov),
        orebp: div(me.oreb * 100, T.orebA + O.drebA), drebp: div(me.dreb * 100, T.drebA + O.orebA), rebp: div(me.reb * 100, T.orebA + T.drebA + O.orebA + O.drebA),
        tor: div(me.tov * 100, me.fga + 0.44 * me.fta + me.ast + me.tov), efg: div((me.fgm + 0.5 * me.tpm) * 100, me.fga), ts: div(me.pts * 100, 2 * (me.fga + 0.44 * me.fta)),
        usg: div(play(me) * 100, play(T)), pie: div(pieOf(me) * 100, pieOf(T) + pieOf(O)),
        fga2: div((me.fga - me.tpa) * 100, me.fga), fga3: div(me.tpa * 100, me.fga),
        pts2: div((me.fgm - me.tpm) * 2 * 100, me.pts), pts3: div(me.tpm * 3 * 100, me.pts), ptsft: div(me.ftm * 100, me.pts),
        sh: { fgm: sh('fgm'), fga: sh('fga'), tpm: sh('tpm'), tpa: sh('tpa'), ftm: sh('ftm'), fta: sh('fta'), oreb: sh('oreb'), dreb: sh('dreb'), reb: sh('reb'),
          ast: sh('ast'), tov: sh('tov'), stl: sh('stl'), blk: sh('blk'), pf: sh('pf'), pfd: sh('pfd'), pts: sh('pts') } };
      return (r.m = m);
    }
    function per(v, m) { return S.mode === 'tot' ? v : S.mode === 'pg' ? div(v, m.gp) : div(v * 40, m.min); }
    const GWL = unit => [
      C('gp', 'GP', 'Games with clutch time ' + unit, { get: m => m.gp, dec: 0 }),
      C('w', 'W', 'Of those games, the ones his team won', { get: m => m.w, dec: 0 }), C('l', 'L', 'Of those games, the ones his team lost', { get: m => m.l, dec: 0 }, { low: true }),
      C('min', 'MIN', 'Clutch minutes ' + unit, { get: m => S.mode === 'pg' ? div(m.min, m.gp) : m.min, dec: 1 })];
    const own = k => ({ get: m => per(m.me[k], m), count: true });
    const PV = {
      trad: { name: 'Traditional', first: 'pts', cols: GWL('on court').concat([
        C('pts', 'PTS', 'Points scored', own('pts')), C('fgm', 'FGM', 'Field goals made', own('fgm')), C('fga', 'FGA', 'Field goals attempted', own('fga')),
        C('fgp', 'FG%', 'Field goal percentage', pct(m => m.fgp)), C('tpm', '3PM', 'Three-pointers made', own('tpm')), C('tpa', '3PA', 'Three-pointers attempted', own('tpa')),
        C('tpp', '3P%', 'Three-point percentage', pct(m => m.tpp)), C('ftm', 'FTM', 'Free throws made', own('ftm')), C('fta', 'FTA', 'Free throws attempted', own('fta')),
        C('ftp', 'FT%', 'Free throw percentage', pct(m => m.ftp)), C('oreb', 'OREB', 'Offensive rebounds', own('oreb')), C('dreb', 'DREB', 'Defensive rebounds', own('dreb')),
        C('reb', 'REB', 'Rebounds', own('reb')), C('ast', 'AST', 'Assists', own('ast')), C('tov', 'TOV', 'Turnovers', own('tov'), { low: true }),
        C('stl', 'STL', 'Steals', own('stl')), C('blk', 'BLK', 'Blocks', own('blk')), C('pf', 'PF', 'Personal fouls', own('pf'), { low: true }),
        C('pfd', 'PFD', 'Fouls drawn', own('pfd')),
        C('pm', '+/-', 'Team points minus opponents’ points while he was on court in clutch time', { get: m => per(m.pm, m), count: true, sign: true })]) },
      adv: { name: 'Advanced', rate: true, first: 'min', cols: GWL('on court').concat(teamAdvCols(m => m.tm), [
        C('astp', 'AST%', 'Share of his team-mates’ made field goals he assisted while on court', pct(m => m.astp)),
        C('astto', 'AST/TO', 'Assists per turnover', { get: m => m.astto, dec: 2 }),
        C('astr', 'AST RATIO', 'Assists per 100 of his own plays (FGA + 0.44 × FTA + AST + TOV)', pct(m => m.astr)),
        C('orebp', 'OREB%', 'Share of available offensive rebounds he took while on court', pct(m => m.orebp)),
        C('drebp', 'DREB%', 'Share of available defensive rebounds he took while on court', pct(m => m.drebp)),
        C('rebp', 'REB%', 'Share of all rebounds he took while on court', pct(m => m.rebp)),
        C('tor', 'TO RATIO', 'Turnovers per 100 of his own plays', pct(m => m.tor), { low: true }),
        C('efg', 'EFG%', 'Field goal percentage with a three counted as 1.5 makes', pct(m => m.efg)),
        C('ts', 'TS%', 'Points per two shooting attempts (FGA + 0.44 × FTA)', pct(m => m.ts)),
        C('usg', 'USG%', 'Share of his team’s plays (FGA + 0.44 × FTA + TOV) he used while on court', pct(m => m.usg)),
        C('pace', 'PACE', 'Possessions per 40 minutes while he was on court', pct(m => m.tm.pace)),
        C('pie', 'PIE', 'His share of both teams’ box-score events while on court', pct(m => m.pie))]) },
      scor: { name: 'Scoring', rate: true, first: 'min', cols: GWL('on court').concat(scoringCols(m => m)) },
      usage: { name: 'Usage', rate: true, first: 'usg', cols: GWL('on court').concat([C('usg', 'USG%', 'Share of his team’s plays he used while on court', pct(m => m.usg))],
        [['fgm', 'FGM'], ['fga', 'FGA'], ['tpm', '3PM'], ['tpa', '3PA'], ['ftm', 'FTM'], ['fta', 'FTA'], ['oreb', 'OREB'], ['dreb', 'DREB'], ['reb', 'REB'], ['ast', 'AST'],
          ['tov', 'TOV'], ['stl', 'STL'], ['blk', 'BLK'], ['pf', 'PF'], ['pfd', 'PFD'], ['pts', 'PTS']].map(([k, lab]) =>
          C('s' + k, '%' + lab, 'His share of his team’s ' + lab + ' while he was on court', pct(m => m.sh[k])))) },
    };
    // team rows reuse the lineup measures: own line against the opponents' line
    const tmeasure = r => r.m || (r.m = Object.assign(teamMeasures(side(r.own), side(r.opp), r.min, r.gp), { w: r.w, l: r.l }));
    const tcnt = (who, k) => ({ get: m => per(m[who][k], m), count: true });
    const idm = m => m;
    const TV = {
      trad: { name: 'Traditional', first: 'pts', cols: GWL('for the team').concat([C('pts', 'PTS', 'Points scored', tcnt('o', 'pts'))], boxCols('o', '', '', tcnt, idm), [
        C('opf', 'PF', 'Personal fouls', tcnt('o', 'pf'), { low: true }), C('opfd', 'PFD', 'Fouls drawn', tcnt('o', 'pfd')),
        C('pm', '+/-', 'Points scored minus points allowed in clutch time', { get: m => per(m.pm, m), count: true, sign: true })]) },
      adv: { name: 'Advanced', rate: true, first: 'net', cols: GWL('for the team').concat(teamAdvCols(idm), [
        C('astp', 'AST%', 'Share of made field goals that were assisted', pct(m => m.astp)), C('astto', 'AST/TO', 'Assists per turnover', { get: m => m.astto, dec: 2 }),
        C('astr', 'AST RATIO', 'Assists per 100 plays', pct(m => m.astr)), C('orebp', 'OREB%', 'Share of available offensive rebounds taken', pct(m => m.orebp)),
        C('drebp', 'DREB%', 'Share of available defensive rebounds taken', pct(m => m.drebp)), C('rebp', 'REB%', 'Share of all rebounds taken', pct(m => m.rebp)),
        C('tovp', 'TOV%', 'Turnovers per 100 plays', pct(m => m.tovp), { low: true }), C('efg', 'EFG%', 'Effective field goal percentage', pct(m => m.efg)),
        C('ts', 'TS%', 'Points per two shooting attempts', pct(m => m.ts)), C('pace', 'PACE', 'Possessions per 40 minutes', pct(m => m.pace)),
        C('pie', 'PIE', 'Share of both teams’ box-score events', pct(m => m.pie))]) },
      scor: { name: 'Scoring', rate: true, first: 'min', cols: GWL('for the team').concat(scoringCols(idm), [C('astp', '%FGM AST', 'Share of made field goals that were assisted', pct(m => m.astp))]) },
    };
    const views = () => S.who === 'players' ? PV : TV;
    const TIME = { 300: 'Last 5 Minutes', 240: 'Last 4 Minutes', 180: 'Last 3 Minutes', 120: 'Last 2 Minutes', 60: 'Last 1 Minute', 30: 'Last 30 Seconds', 10: 'Last 10 Seconds' };
    function current() {
      const c = BY[S.cid], d = DATA.cl[S.cid], V = views();
      if (!V[S.view]) { S.view = 'trad'; S.sort = 'pts'; S.dir = -1; }
      const view = V[S.view], isP = S.who === 'players', meas = isP ? measure : tmeasure;
      const col = view.cols.find(x => x.key === S.sort) || view.cols.find(x => x.key === view.first) || view.cols[3];
      if (!d) return { c, d, rows: [], view, col, isP, meas, V };
      const t = tally(d);
      let rows = isP ? t.players : t.teams;
      rows = rows.filter(r => r.gp > 0 && (r.sec > 0 || r.own.some(x => x)));
      if (S.min > 0) rows = rows.filter(r => r.min >= S.min);
      if (S.gp > 1) rows = rows.filter(r => r.gp >= S.gp);
      if (S.q) { const q = S.q.toLowerCase(); rows = rows.filter(r => (isP ? d.players[r.pi][1] : d.teams[r.ti][0]).toLowerCase().includes(q)); }
      rows = sortRows(rows, S.dir, r => col.get(meas(r)), (a, b) => b.sec - a.sec);
      return { c, d, rows, view, col, isP, meas, V };
    }
    function fillComp() {
      const list = COMPS.filter(c => c.year === S.season);
      if (!list.some(c => c.id === S.cid)) S.cid = list[0].id;
      el(p + 'f-comp').innerHTML = list.map(c => opt(c.id, c.label, c.id === S.cid)).join('');
    }
    function draw() {
      if (!S || !el(p + 'tbody')) return;
      const state = load('cl', S.cid);
      const { c, d, rows, view, col, isP, meas, V } = current();
      pager(p, S, rows.length);
      const age = C('age', 'AGE', 'Age reached in the season’s year', { get: r => r, dec: 0 });
      el(p + 'thead').innerHTML = '<tr><th class="st-left st-lu" scope="col"><button data-sort="' + (view.first || 'min') + '" title="' + (isP ? 'Player' : 'Team') + '">' + (isP ? 'Player' : 'Team') + '</button></th>'
        + (isP ? '<th class="st-tmh" scope="col"><button data-sort="' + (view.first || 'min') + '" title="Team">Team</button></th><th scope="col"><button data-sort="' + (view.first || 'min') + '" title="' + age.title + '">Age</button></th>' : '')
        + headCells(view.cols, col, S.dir) + '</tr>';
      const slice = rows.slice((S.page - 1) * PER, S.page * PER);
      if (!d) {
        el(p + 'tbody').innerHTML = waiting(state, view.cols.length + 3, 'clutch');
        el(p + 'f-team').innerHTML = opt('', 'All Teams', true); el(p + 'f-vs').innerHTML = opt('', 'VS All Teams', true);
      } else {
        el(p + 'f-team').innerHTML = teamOpts(d, 'All Teams', '', S.team);
        el(p + 'f-vs').innerHTML = teamOpts(d, 'VS All Teams', 'VS ', S.vs);
        el(p + 'tbody').innerHTML = slice.length ? slice.map((r, i) => {
          const m = meas(r), t = d.teams[r.ti], rk = '<span class="st-rk">' + ((S.page - 1) * PER + i + 1) + '</span>';
          const lead = isP
            ? '<td class="st-lu st-one">' + rk + plink(d.players[r.pi], d.players[r.pi][1]) + '</td><td class="st-tm"><span class="st-code" title="' + esc(t[0]) + '">' + esc(t[1]) + '</span></td><td>'
              + (d.players[r.pi][3] ? c.year - d.players[r.pi][3] : '<span class="st-dash">—</span>') + '</td>'
            : '<td class="st-lu st-one">' + rk + '<span title="' + esc(t[0]) + '">' + esc(t[0]) + '</span></td>';
          return '<tr>' + lead + view.cols.map(x => '<td' + (x.key === col.key ? ' class="st-sorted"' : '') + '>' + fmt(x.get(m), x, S.mode) + '</td>').join('') + '</tr>';
        }).join('') : '<tr><td class="st-empty" colspan="' + (view.cols.length + 3) + '">Nothing in this competition matches these filters. Widen the clutch time or the point difference, or clear a team or player filter.</td></tr>';
      }
      el(p + 'cov').textContent = c.games + ' of ' + c.rebuilt + ' rebuilt games reached clutch time';
      el(p + 'foot-l').textContent = footText(S, slice.length, rows.length, col);
      el(p + 'foot-r').textContent = c.label;
      el(p + 'f-mode').disabled = !!view.rate; el(p + 'mode-hint').hidden = !view.rate;
      el(p + 'bio').hidden = !isP;
      el(p + 'who-players').setAttribute('aria-pressed', isP); el(p + 'who-teams').setAttribute('aria-pressed', !isP);
      viewButtons(p, V, S.view);
      const chips = ['<span class="st-chip st-fixed">Season: <b>' + c.year + '</b></span>',
        '<span class="st-chip st-fixed">' + TIME[S.time] + ' · <b>' + (S.diff === 1 ? '1 point' : S.diff + ' points or fewer') + '</b></span>'];
      const chip = (k, label, v) => chips.push('<span class="st-chip">' + label + ': <b>' + esc(v) + '</b><button data-clear="' + k + '" aria-label="Remove ' + label + ' filter">×</button></span>');
      if (S.ab !== 'any') chip('ab', 'Score', S.ab === 'behind' ? 'Behind or Tied' : 'Ahead or Tied');
      if (S.period !== 'all') chip('period', 'Quarter', S.period === 'q4' ? '4th Quarter' : 'Overtime');
      if (S.outcome !== 'all') chip('outcome', 'Outcome', S.outcome === 'w' ? 'Wins' : 'Losses');
      if (d && S.team !== '') chip('team', 'Team', d.teams[+S.team][0]);
      if (d && S.vs !== '') chip('vs', 'VS', d.teams[+S.vs][0]);
      if (isP && S.pos !== '') chip('pos', 'Position', { G: 'Guard', F: 'Forward', C: 'Center' }[S.pos]);
      if (isP && S.start !== 'all') chip('start', 'Role', S.start === 's' ? 'Starters' : 'Bench');
      if (S.min > 0) chip('min', 'Minutes', S.min + '+');
      if (S.gp > 1) chip('gp', 'Games', S.gp + '+');
      if (S.q) chip('q', 'Name', S.q);
      el(p + 'chips').innerHTML = chips.join('');
      glossList(p, (isP ? [age] : []).concat(view.cols));
      crumb((isP ? 'Players' : 'Teams') + ' / Clutch / ' + view.name);
    }
    function mount() {
      if (!S) return;
      follow(S, BY);
      el(p + 'f-season').innerHTML = seasons(COMPS).map(y => opt(y, y, y === S.season)).join('');
      fillComp();
      [['f-mode', 'mode'], ['f-time', 'time'], ['f-ab', 'ab'], ['f-diff', 'diff'], ['f-period', 'period'], ['f-outcome', 'outcome'],
        ['f-pos', 'pos'], ['f-start', 'start'], ['f-min', 'min'], ['f-gp', 'gp'], ['f-q', 'q']].forEach(([id, k]) => { el(p + id).value = S[k]; });
      const M = IDX.cl.meta;
      el(p + 'gl-intro').textContent = 'Clutch time is the last five minutes of the fourth quarter or of an overtime while the score is within five points; the filters narrow both. '
        + 'A play counts by the score when its clock reading began, so a basket and the assist logged after it stand or fall together. '
        + 'Ratings, shares and +/- use the rebuilt lineups: what the team and its opponents did while the player was on court. Clutch samples are small; a few possessions can move any rate a long way.';
      el(p + 'check').innerHTML = '<div><b>' + (M.clutch_games || 0).toLocaleString() + '</b><span>of ' + (M.games || 0).toLocaleString() + ' rebuilt games reached clutch time</span></div>'
        + '<div><b>' + COMPS.length + '</b><span>competitions with at least one clutch game</span></div>'
        + '<div><b>' + pctTxt(M.pts_match) + '</b><span>of clutch games where the points agree with a plain count from the feed, no lineups involved</span></div>'
        + '<div><b>' + pctTxt(IDX.lu.meta.pm_exact_c) + '</b><span>of rebuilt +/- lines equal to the box score, in games whose box +/- adds up</span></div>';
      const on = (id, ev, f) => el(p + id).addEventListener(ev, e => { f(e.target.value); S.page = 1; draw(); });
      on('f-season', 'change', v => { S.season = +v; S.team = ''; S.vs = ''; fillComp(); LAST = S.cid; });
      on('f-comp', 'change', v => { S.cid = LAST = v; S.team = ''; S.vs = ''; });
      on('f-mode', 'change', v => { S.mode = v; });
      on('f-time', 'change', v => { S.time = +v; });
      on('f-ab', 'change', v => { S.ab = v; });
      on('f-diff', 'change', v => { S.diff = +v; });
      on('f-period', 'change', v => { S.period = v; });
      on('f-outcome', 'change', v => { S.outcome = v; });
      on('f-team', 'change', v => { S.team = v; });
      on('f-vs', 'change', v => { S.vs = v; });
      on('f-pos', 'change', v => { S.pos = v; });
      on('f-start', 'change', v => { S.start = v; });
      on('f-min', 'input', v => { S.min = Math.max(0, +v || 0); });
      on('f-gp', 'input', v => { S.gp = Math.max(1, +v || 1); });
      on('f-q', 'input', v => { S.q = v.trim(); });
      [['players', 'who-players'], ['teams', 'who-teams']].forEach(([w, id]) => el(p + id).addEventListener('click', () => {
        if (S.who === w) return;
        S.who = w; S.view = 'trad'; S.sort = 'pts'; S.dir = -1; S.page = 1; draw();
      }));
      el(p + 'chips').addEventListener('click', e => {
        const b = e.target.closest('[data-clear]'); if (!b) return;
        const k = b.dataset.clear, reset = { ab: ['any', 'f-ab'], period: ['all', 'f-period'], outcome: ['all', 'f-outcome'], team: ['', 'f-team'], vs: ['', 'f-vs'],
          pos: ['', 'f-pos'], start: ['all', 'f-start'], min: [0, 'f-min'], gp: [1, 'f-gp'], q: ['', 'f-q'] }[k];
        S[k] = reset[0]; el(p + reset[1]).value = reset[0];
        S.page = 1; draw();
      });
      wire(p, S, draw, views);
      draw();
    }
    return { S, draw, mount, current, measure, tmeasure, tally };
  })();

  // ---- the page shells ---------------------------------------------------------------
  const tableCard = (p, what) => `
    <section class="card st-card" aria-label="${what} table">
      <div class="st-tbar">
        <div class="st-pager">
          <span><b id="${p}n-rows">0</b> rows · Page</span>
          <select id="${p}f-page" aria-label="Page"></select>
          <span>of <b id="${p}n-pages">1</b></span>
          <button class="st-pbtn" id="${p}prev" aria-label="Previous page">‹</button>
          <button class="st-pbtn" id="${p}next" aria-label="Next page">›</button>
        </div>
        <div class="st-tbar-r"><span class="st-cov" id="${p}cov"></span><button class="st-linkbtn" id="${p}gl-btn" aria-expanded="false" aria-controls="${p}gloss">Glossary</button></div>
      </div>
      <div class="st-scroll"><table class="st-table"><thead id="${p}thead"></thead><tbody id="${p}tbody"></tbody></table></div>
      <div class="st-foot"><span id="${p}foot-l"></span><span id="${p}foot-r"></span></div>
    </section>
    <section class="card st-card st-gloss" id="${p}gloss" hidden aria-label="Glossary and method">
      <h2>Glossary</h2><p id="${p}gl-intro"></p><dl class="st-gl" id="${p}gl"></dl><div class="st-check" id="${p}check"></div>
    </section>`;
  function lineupsHTML() {
    const p = 'st-lu-';
    return `
    <div class="st-head">
      <div>
        <h1 class="page-title">Lineups</h1>
        <p class="st-lede">Everything that happened while the same players shared the floor, rebuilt from the play-by-play substitutions of every game.</p>
      </div>
      <div class="st-views" role="group" aria-label="Statistics shown" id="${p}views"></div>
    </div>
    <section class="card st-card st-filters" aria-label="Filters">
      <div class="st-fgrid">
        <div class="st-field"><label for="${p}f-season">Season</label><select id="${p}f-season"></select></div>
        <div class="st-field"><label for="${p}f-comp">Competition</label><select id="${p}f-comp"></select></div>
        <div class="st-field"><label for="${p}f-mode">Per mode</label><select id="${p}f-mode">
          <option value="tot">Totals</option><option value="pg">Per Game</option>
          <option value="p40">Per 40 Minutes</option><option value="p100">Per 100 Possessions</option></select>
          <span class="st-hint" id="${p}mode-hint" hidden>Rates and percentages do not change with the per mode.</span></div>
        <div class="st-field"><label for="${p}f-team">Team</label><select id="${p}f-team"></select></div>
        <div class="st-field"><label for="${p}f-n">Lineups</label><select id="${p}f-n">
          <option value="5">5 Player Lineups</option><option value="4">4 Player Lineups</option>
          <option value="3">3 Player Lineups</option><option value="2">2 Player Lineups</option></select></div>
      </div>
      <div class="st-frow">
        <div class="st-chips" id="${p}chips"></div>
        <button class="st-linkbtn" id="${p}adv-btn" aria-expanded="false" aria-controls="${p}adv">Advanced Filters ▾</button>
      </div>
      <div class="st-adv" id="${p}adv" hidden>
        <div class="st-fgrid st-three">
          <div class="st-field"><label for="${p}f-min">Minimum minutes</label><input type="number" id="${p}f-min" min="0" step="1" value="0" inputmode="numeric"></div>
          <div class="st-field"><label for="${p}f-gp">Minimum games together</label><input type="number" id="${p}f-gp" min="1" step="1" value="1" inputmode="numeric"></div>
          <div class="st-field"><label for="${p}f-player">Lineups with player</label><select id="${p}f-player"></select></div>
        </div>
      </div>
    </section>${tableCard(p, 'Lineup')}`;
  }
  function clutchHTML() {
    const p = 'st-cl-';
    return `
    <div class="st-head">
      <div>
        <div class="st-who" role="group" aria-label="Rows show">
          <button id="${p}who-players" aria-pressed="true">Players</button><span>|</span><button id="${p}who-teams" aria-pressed="false">Teams</button>
        </div>
        <h1 class="page-title">Clutch</h1>
        <p class="st-lede">The last five minutes of the fourth quarter or of an overtime, while the score is within five points.</p>
      </div>
      <div class="st-views" role="group" aria-label="Statistics shown" id="${p}views"></div>
    </div>
    <section class="card st-card st-filters" aria-label="Filters">
      <div class="st-fgrid st-three">
        <div class="st-field"><label for="${p}f-season">Season</label><select id="${p}f-season"></select></div>
        <div class="st-field"><label for="${p}f-comp">Competition</label><select id="${p}f-comp"></select></div>
        <div class="st-field"><label for="${p}f-mode">Per mode</label><select id="${p}f-mode">
          <option value="tot">Totals</option><option value="pg">Per Game</option><option value="p40">Per 40 Minutes</option></select>
          <span class="st-hint" id="${p}mode-hint" hidden>Rates and percentages do not change with the per mode.</span></div>
      </div>
      <div class="st-fgroup"><h2>Game Situation</h2>
        <div class="st-fgrid st-three">
          <div class="st-field"><label for="${p}f-time">Clutch time</label><select id="${p}f-time">
            <option value="300">Last 5 Minutes</option><option value="240">Last 4 Minutes</option><option value="180">Last 3 Minutes</option>
            <option value="120">Last 2 Minutes</option><option value="60">Last 1 Minute</option><option value="30">Last 30 Seconds</option><option value="10">Last 10 Seconds</option></select></div>
          <div class="st-field"><label for="${p}f-ab">Ahead or behind</label><select id="${p}f-ab">
            <option value="any">Ahead or Behind</option><option value="behind">Behind or Tied</option><option value="ahead">Ahead or Tied</option></select></div>
          <div class="st-field"><label for="${p}f-diff">Point diff</label><select id="${p}f-diff">
            <option value="5">5 Point Diff or Less</option><option value="4">4 Point Diff or Less</option><option value="3">3 Point Diff or Less</option>
            <option value="2">2 Point Diff or Less</option><option value="1">1 Point Diff</option></select></div>
          <div class="st-field"><label for="${p}f-period">Quarter</label><select id="${p}f-period">
            <option value="all">4th Quarter and Overtime</option><option value="q4">4th Quarter</option><option value="ot">Overtime</option></select></div>
          <div class="st-field"><label for="${p}f-outcome">Outcome</label><select id="${p}f-outcome">
            <option value="all">All Outcomes</option><option value="w">Wins</option><option value="l">Losses</option></select></div>
        </div>
      </div>
      <div class="st-fgroup"><h2>Team</h2>
        <div class="st-fgrid st-three">
          <div class="st-field"><label for="${p}f-team">Team</label><select id="${p}f-team"></select></div>
          <div class="st-field"><label for="${p}f-vs">VS team</label><select id="${p}f-vs"></select></div>
        </div>
      </div>
      <div class="st-fgroup" id="${p}bio"><h2>Player Bio</h2>
        <div class="st-fgrid st-three">
          <div class="st-field"><label for="${p}f-pos">Position</label><select id="${p}f-pos">
            <option value="">All Positions</option><option value="G">Guard</option><option value="F">Forward</option><option value="C">Center</option></select></div>
          <div class="st-field"><label for="${p}f-start">Starter/Bench</label><select id="${p}f-start">
            <option value="all">All Players</option><option value="s">Starters</option><option value="b">Bench</option></select></div>
        </div>
      </div>
      <div class="st-frow">
        <div class="st-chips" id="${p}chips"></div>
        <button class="st-linkbtn" id="${p}adv-btn" aria-expanded="false" aria-controls="${p}adv">Advanced Filters ▾</button>
      </div>
      <div class="st-adv" id="${p}adv" hidden>
        <div class="st-fgrid st-three">
          <div class="st-field"><label for="${p}f-min">Minimum clutch minutes</label><input type="number" id="${p}f-min" min="0" step="1" value="0" inputmode="numeric"></div>
          <div class="st-field"><label for="${p}f-gp">Minimum clutch games</label><input type="number" id="${p}f-gp" min="1" step="1" value="1" inputmode="numeric"></div>
          <div class="st-field"><label for="${p}f-q">Name contains</label><input type="search" id="${p}f-q" placeholder="Type a name" autocomplete="off"></div>
        </div>
      </div>
    </section>${tableCard(p, 'Clutch')}`;
  }
  if (LU.S && CL.S) LAST = LU.S.cid;
  let PAGE = 'lineups';
  function render(which) {
    PAGE = which === 'clutch' ? 'clutch' : 'lineups';
    const mod = PAGE === 'clutch' ? CL : LU;
    if (!mod.S) return `<div class="page st-page"><h1 class="page-title">${PAGE === 'clutch' ? 'Clutch' : 'Lineups'}</h1>
      <div class="card"><div class="empty-row"><span class="empty-dot"></span>No competition has play-by-play complete enough for this page yet.</div></div></div>`;
    return `<div class="page st-page" id="st-root">${PAGE === 'clutch' ? clutchHTML() : lineupsHTML()}</div>`;
  }
  function redraw() { if (el('st-root')) (PAGE === 'clutch' ? CL : LU).draw(); }

  // ---- the Stats menu in the site bar ---------------------------------------------------
  // The menu hangs from the bar itself, not from the row of links (which scrolls sideways
  // on a phone and would clip it), so it is placed under the button each time it opens.
  function openMenu(open) {
    const btn = el('st-navbtn'), menu = el('st-menu');
    if (!btn || !menu) return;
    menu.hidden = !open; btn.setAttribute('aria-expanded', !!open);
    if (open) {
      const b = btn.getBoundingClientRect(), n = menu.parentNode.getBoundingClientRect();
      menu.style.left = Math.max(8, Math.min(b.left - n.left, n.width - menu.offsetWidth - 8)) + 'px';
      menu.style.top = (b.bottom - n.top + 6) + 'px';
    }
  }
  document.addEventListener('click', e => {
    const menu = el('st-menu');
    if (!menu) return;
    if (e.target.closest('#st-navbtn')) { e.preventDefault(); openMenu(menu.hidden); return; }
    if (!menu.hidden && !menu.contains(e.target)) openMenu(false);
  });
  document.addEventListener('keydown', e => {
    const menu = el('st-menu');
    if (e.key === 'Escape' && menu && !menu.hidden) { openMenu(false); el('st-navbtn').focus(); }
  });
  window.addEventListener('resize', () => { const m = el('st-menu'); if (m && !m.hidden) openMenu(true); });

  // run by the router after every render: the bar is new each time
  function afterRender() {
    const links = document.querySelector('.nav-links'), btn = el('st-navbtn');
    if (links && btn) {
      links.addEventListener('scroll', () => { const m = el('st-menu'); if (m && !m.hidden) openMenu(true); });
      // on a phone the row of links scrolls sideways: start with the Stats tab in view when it is the page
      if (el('st-root') && links.scrollWidth > links.clientWidth)
        links.scrollLeft = Math.max(0, btn.offsetLeft - links.offsetLeft - (links.clientWidth - btn.offsetWidth) / 2);
    }
    if (el('st-root')) (PAGE === 'clutch' ? CL : LU).mount();
  }
  const navButton = active => `<button class="nav-link st-navbtn ${active ? 'active' : ''}" id="st-navbtn" aria-haspopup="true" aria-expanded="false" aria-controls="st-menu">Stats<span class="st-caret" aria-hidden="true">▼</span></button>`;
  const navMenu = cur => `<div class="st-menu" id="st-menu" hidden>
      <a href="#/stats/lineups"${cur === 'lineups' ? ' aria-current="page"' : ''}>Lineups<small>Groups of 5, 4, 3 or 2 players on court together</small></a>
      <a href="#/stats/clutch"${cur === 'clutch' ? ' aria-current="page"' : ''}>Clutch<small>Last five minutes, score within five</small></a>
    </div>`;
  return { put, render, afterRender, navButton, navMenu, LU, CL, DATA, page: () => PAGE };
})();
function STATS_PUT(kind, cid, d) { STATS.put(kind, cid, d); }
function renderStats(which) { return STATS.render(which); }
function statsAfterRender() { STATS.afterRender(); }
