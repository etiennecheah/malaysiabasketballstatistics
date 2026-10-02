#!/usr/bin/env python3
"""Assemble site.html from assets/style.css, data/site_data.json and assets/app*.js."""
import json, os, io

R = os.path.dirname(os.path.abspath(__file__))
A = os.path.join(R, 'assets')
D = os.path.join(R, 'data')

PARTS = ['app1_core.js', 'app2_nav.js', 'app3_comp.js', 'app3b_family.js', 'app4_players.js',
         'app4b_profile.js', 'app4c_impact.js', 'app4d_radar.js', 'app4e_compare.js',
         'app4f_bpm.js', 'app4g_formulas.js', 'app4h_videos.js', 'app4i_games.js',
         'app4j_match.js', 'app4k_teams.js', 'app4l_profile2.js', 'app4m_pathway.js', 'app4n_live.js', 'app4o_home.js', 'app4p_account.js', 'app4q_stats.js', 'app5_rest.js']

def main():
    css = open(os.path.join(A, 'style.css')).read()
    payload = json.load(open(os.path.join(D, 'site_data.json')))
    # BPM is computed from the finished payload (it needs the box scores and the
    # schedule), so it is folded in here rather than inside build_data.py
    bp = os.path.join(D, 'bpm.json')
    if os.path.exists(bp):
        b = json.load(open(bp))
        payload['bpm'], payload['bpmMeta'] = b['bpm'], b['meta']
        # PER / USG% / Win Shares, one row per rated player per competition:
        # [per, usg, ows, dws, ws, ws40, ortg, drtg, minutes]
        payload['adv'] = b.get('adv', {})
    # Play-by-play is NOT inlined (it is ~100 MB across all games). The payload
    # carries only the list of match ids that have it; the compact per-competition
    # file pbp/<cid>.js is pulled in on demand by the loader in app4j_match.js.
    pg = os.path.join(D, 'pbp_games.json')
    if os.path.exists(pg):
        payload['pbpGames'] = json.load(open(pg))
    pper = os.path.join(D, 'pbp_periods.json')
    if os.path.exists(pper):
        payload['pbpPer'] = json.load(open(pper))
    # On/off from the rebuilt lineups (build_lineups.py): per competition, per player
    # [on min, on net/100, off net/100, on-off, 80% lo, 80% hi, on-court +/-, games on,
    #  on possessions, share of the team's games with clean lineups]
    lp = os.path.join(D, 'lineups.json')
    if os.path.exists(lp):
        L = json.load(open(lp))
        payload['onoff'], payload['onoffMeta'] = L['onoff'], L['meta']
    # hand-kept honours (titles, MVPs, stat awards), keyed by person id
    hp = os.path.join(D, 'honours.json')
    if os.path.exists(hp):
        H = {}
        alias = payload.get('palias', {})
        for k, v in json.load(open(hp)).items():
            if k.startswith('_'):
                continue
            k = alias.get(k, k)          # an honour filed on a merged-away id follows the player
            dst = H.setdefault(k, [])
            for h in v:
                same = next((x for x in dst if (h.get('cid') and x.get('cid') == h.get('cid')) or
                             (not h.get('cid') and not x.get('cid') and x.get('year') == h.get('year') and x.get('short') == h.get('short'))), None)
                if same:
                    same['awards'] += [a for a in h['awards'] if a not in same['awards']]
                    same['champ'] = same.get('champ') or h.get('champ')
                else:
                    dst.append(dict(h))
            dst.sort(key=lambda x: -(x.get('year') or 0))
        payload['honours'] = H
    # people the user asked to add who have no competition in the database yet
    xp = os.path.join(D, 'extra_persons.json')
    if os.path.exists(xp):
        X = {k: v for k, v in json.load(open(xp)).items() if not k.startswith('_')}
        for pid, v in X.items():
            payload['persons'].setdefault(pid, v['name'])
        payload['extraPersons'] = X
    # hand-kept extras per player: hero badges and career moves outside the database
    pe = os.path.join(D, 'player_extras.json')
    if os.path.exists(pe):
        alias = payload.get('palias', {})
        payload['playerExtras'] = {alias.get(k, k): v for k, v in json.load(open(pe)).items() if not k.startswith('_')}
    # national-team caps from FIBA (fiba_match.py --write), one row per event, following merges
    nc = os.path.join(D, 'national_caps.json')
    if os.path.exists(nc):
        alias = payload.get('palias', {})
        caps = {}
        for k, rows in json.load(open(nc)).items():
            L = caps.setdefault(alias.get(k, k), [])
            for r in rows:
                if not any(x['y'] == r['y'] and x['e'] == r['e'] for x in L):
                    L.append(r)
        # caps from hand-imported FIBA competitions (import_fibalive.py)
        mcp = os.path.join(D, 'manual_comps.json')
        if os.path.exists(mcp):
            for k, rows in json.load(open(mcp)).get('caps', {}).items():
                L = caps.setdefault(alias.get(k, k), [])
                for r in rows:
                    if not any(x['y'] == r['y'] and x['e'] == r['e'] for x in L):
                        L.append(r)
                L.sort(key=lambda c: (-c['y'], c['e']))
        payload['caps'] = caps
    # SidelineHoopsMY uploads for the Videos grid (snapshot; the player streams the live playlist)
    vp = os.path.join(D, 'videos.json')
    if os.path.exists(vp):
        payload['videos'] = json.load(open(vp))
    # the FIBA wordmark doubles as the competition mark for FIBA events
    if payload.get('logos', {}).get('fiba'):
        payload.setdefault('complogos', {})['fiba'] = payload['logos']['fiba']
    # the Stats pages (Lineups, Clutch): which competitions each offers; the numbers load per competition
    sp = os.path.join(D, 'stats_index.json')
    if os.path.exists(sp):
        payload['stats'] = json.load(open(sp))
    # Square head crops for the small avatar discs. avatars.py cuts them once (OpenCV finds the face)
    # and they are kept in data/avatars/, each named after the portrait it was cut from, so the
    # build itself needs no image libraries. A portrait without a crop is cut now if the libraries
    # are installed; where they are not, the build stops rather than publish badly framed faces
    # (which is what happened when the build first ran on GitHub, where OpenCV is not installed).
    import base64, hashlib
    photos = payload.get('photos', {})
    adir = os.path.join(D, 'avatars')
    av, todo = {}, {}
    for pid, uri in photos.items():
        p = os.path.join(adir, hashlib.sha1(uri.encode()).hexdigest()[:16] + '.webp')
        if os.path.exists(p):
            av[pid] = 'data:image/webp;base64,' + base64.b64encode(open(p, 'rb').read()).decode()
        else:
            todo[pid] = (uri, p)
    if todo:
        try:
            import avatars
        except ImportError as e:
            raise SystemExit('avatars: %d portrait(s) have no face crop in data/avatars/ and one cannot be cut here (%s). '
                             'Run build_site.py where OpenCV and Pillow are installed, then add data/avatars/.' % (len(todo), e))
        os.makedirs(adir, exist_ok=True)
        made, nf = avatars.build({pid: u for pid, (u, p) in todo.items()})
        for pid, (u, p) in todo.items():
            with open(p, 'wb') as f:
                f.write(base64.b64decode(made[pid].split(',', 1)[1]))
        print('avatars: cut %d new face crops, %d faces found' % (len(made), nf))
        av = {pid: av.get(pid) or made[pid] for pid in photos}        # the portraits' order
    payload['avatars'] = av
    print('avatars: %d for %d portraits' % (len(av), len(photos)))
    data = json.dumps(payload, separators=(',', ':'))
    js = '\n\n'.join(open(os.path.join(A, p)).read() for p in PARTS)

    html = io.StringIO()
    w = html.write
    w('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n')
    w('<meta name="viewport" content="width=device-width, initial-scale=1">\n')
    w('<title>HoopStatsMY — Malaysia Basketball Database</title>\n')
    w('<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800'
      '&family=Archivo+Narrow:wght@400;500;600;700&display=swap" rel="stylesheet">\n')
    w('<style>\n' + css + '\n</style>\n')
    # theme is stamped before the first paint so a dark reader never sees a white flash
    w('<script>try{var t=localStorage.getItem("hsmy-theme");'
      'if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t);}catch(e){}</script>\n')
    w('</head>\n<body>\n<div id="app"></div>\n')
    w('<script id="db" type="application/json">' + data.replace('</', '<\\/') + '</script>\n')
    w('<script>\nconst DB = JSON.parse(document.getElementById("db").textContent);\n')
    w(js)
    w('\n</script>\n</body>\n</html>\n')

    out = os.path.join(R, 'site.html')
    with open(out, 'w') as f:
        f.write(html.getvalue())
    print('site.html %.2f MB  (css %dkB, data %.2fMB, js %dkB)'
          % (os.path.getsize(out) / 1024 / 1024, len(css) / 1024, len(data) / 1024 / 1024, len(js) / 1024))


if __name__ == '__main__':
    main()
