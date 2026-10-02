/* =========================================================================
   Videos — the SidelineHoopsMY channel, embedded.

   This tab is the one part of the site that is NOT a snapshot. Everything
   else was scraped once and frozen, which is what makes it immune to the
   source portal going down; this streams from YouTube, so it is always
   current and it stops working if YouTube is unreachable. That is the right
   trade here — a frozen list of videos would be wrong within a week.

   It plays the channel's *uploads playlist* rather than a list of video ids
   baked in at build time. Every channel has one, and its id is the channel id
   with the leading UC swapped for UU. It therefore covers every upload, past
   and future, with nothing to maintain and no API key to hold.

   The fallback panel sits underneath the player rather than being switched to
   by script: a frame blocked by the host's content policy fails silently, with
   no event to listen for. If the frame renders it covers the panel; if it does
   not, the reader gets the channel link instead of an empty rectangle.
   ========================================================================= */

const YT_CHANNEL = 'UCFm3Lxd4m27Am9uqcuRjRqg';
const YT_HANDLE = '@sidelinehoops.malaysia';
const YT_NAME = 'SidelineHoopsMY';
// the uploads playlist: every video the channel has ever posted, in order
const YT_UPLOADS = 'UU' + YT_CHANNEL.slice(2);
const YT_URL = 'https://www.youtube.com/' + YT_HANDLE;

// The grid under the player: every long-form upload as a small tile, from
// data/videos.json (a snapshot of the channel's Videos tab). Clicking a tile
// plays it in the player above — inside the uploads playlist, so "next" still
// walks the channel, and anything newer than the snapshot plays there too.
const VID_TAGS = [
  ['sea', 'SEA Games 2025', /SEA GAME/i],
  ['agong', 'Agong Cup', /AGONG/i],
  ['u17', 'U17 National', /U17 NATIONAL/i],
  ['seaba', 'U18 SEABA 2024', /SEABA/i],
  ['dleague', 'D-League U23', /D-LEAGUE/i],
  ['fbc', 'Future Bound Classic', /FUTURE BOUND/i]];
const VID_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function vidTag(t) { const m = VID_TAGS.find(x => x[2].test(t)); return m ? m[0] : 'other'; }
function vidDate(d) { const [y, m, dd] = d.split('-'); return +dd + ' ' + VID_MONTHS[+m - 1] + ' ' + y; }
function vidEmbed(id, auto) {
  return 'https://www.youtube.com/embed/' + (id ? id + '?list=' + YT_UPLOADS + '&' : 'videoseries?list=' + YT_UPLOADS + '&')
       + 'rel=0&modestbranding=1' + (auto ? '&autoplay=1' : '');
}
// "HEADLINE | who | event" — the first part is the hook, the rest is the context line
function vidSplit(t) {
  const parts = t.split('|').map(x => x.trim()).filter(Boolean);
  // a bare game tag ("G2") is not a headline: keep it, but lead with the line after it
  if (parts.length > 1 && parts[0].length < 5) parts.splice(0, 2, parts[0] + ' · ' + parts[1]);
  return [parts[0] || t, parts.slice(1).filter(x => !x.startsWith('@')).join(' · ').replace(/\s*@\S+/g, '')];
}

function renderVideos() {
  // www.youtube.com rather than youtube-nocookie.com: the two are separate
  // hosts, and a host that allowlists embedded video at all allowlists the
  // canonical one. Privacy is worth less here than the player actually loading.
  const pend = window.VID_PENDING; window.VID_PENDING = null;
  const src = vidEmbed(pend || null, !!pend);
  const V = (DB.videos && DB.videos.videos) || [];
  const counts = {};
  V.forEach(v => { const k = vidTag(v.t); counts[k] = (counts[k] || 0) + 1; });
  const chips = [['all', 'All', V.length]].concat(VID_TAGS.filter(x => counts[x[0]]).map(x => [x[0], x[1], counts[x[0]]]));
  if (counts.other) chips.push(['other', 'Other', counts.other]);
  const tiles = V.map(v => {
    const [hook, ctx] = vidSplit(v.t);
    return `<button type="button" class="vid-tile${v.id === pend ? ' playing' : ''}" data-vid="${esc(v.id)}" data-tag="${vidTag(v.t)}" title="${esc(v.t)}">
      <span class="vid-thumb"><span class="vid-thumb-ph">${esc(hook)}</span>
        <img src="https://i.ytimg.com/vi/${esc(v.id)}/mqdefault.jpg" alt="" loading="lazy" onerror="this.remove()">
        <span class="vid-len">${esc(v.len || '')}</span><span class="vid-now">Playing</span></span>
      <span class="vid-meta"><span class="vid-hook">${esc(hook)}</span>
        <span class="vid-ctx">${esc(ctx)}</span>
        <span class="vid-date">${vidDate(v.d)}</span></span>
    </button>`;
  }).join('');

  return `<div class="page">
    <div class="vid-hero">
      <h1 class="vid-title">${esc(YT_NAME)}</h1>
      <p class="vid-lede">Highlights, news and coverage from around Malaysian basketball. Pick any video below
        to play it here, or <a href="${YT_URL}" target="_blank" rel="noopener noreferrer">open the channel on YouTube ↗</a>.</p>
    </div>

    <div class="vid-layout">
    <div class="card vid-card" id="vid-player">
      <div class="vid-frame">
        <div class="vid-fallback">
          <div class="vid-fallback-in">
            <div class="vid-fallback-h">The player could not load</div>
            <p>Embedded video is blocked by this browser or by whatever is hosting this page.
              Nothing on the page can fix that — the videos play normally on YouTube itself.</p>
            <a class="chip" href="${YT_URL}" target="_blank" rel="noopener noreferrer">Watch on YouTube ↗</a>
          </div>
        </div>
        <iframe id="vid-iframe" src="${src}" title="${esc(YT_NAME)} — all videos" loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
      </div>
    </div>

    ${V.length ? `<div class="vid-list">
      <div class="vid-list-head">
        <h2 class="vid-list-title">All videos <span>${V.length}</span></h2>
        <div class="vid-chips">${chips.map(([k, l, n], i) => `<button type="button" class="vid-chip${i ? '' : ' on'}" data-vtag="${k}">${esc(l)} <span>${n}</span></button>`).join('')}</div>
      </div>
      <div class="vid-grid">${tiles}</div>
    </div>` : ''}
    </div>
    <div class="note">The list of videos was taken from the channel on ${DB.videos ? vidDate(DB.videos.taken) : ''};
      the player streams the channel's own playlist from YouTube, so anything posted since plays there too
      (use the playlist control inside the player). This is the one page that depends on another service being up —
      everything else is a stored snapshot. The videos belong to ${esc(YT_NAME)}; this page only embeds them.</div>
  </div>`;
}

document.addEventListener('click', e => {
  const chip = e.target.closest && e.target.closest('.vid-chip');
  if (chip) {
    const k = chip.dataset.vtag;
    document.querySelectorAll('.vid-chip').forEach(c => c.classList.toggle('on', c === chip));
    document.querySelectorAll('.vid-tile').forEach(t => { t.hidden = !(k === 'all' || t.dataset.tag === k); });
    return;
  }
  const tile = e.target.closest && e.target.closest('.vid-tile');
  if (!tile) return;
  const f = document.getElementById('vid-iframe');
  if (f) f.src = vidEmbed(tile.dataset.vid, true);
  document.querySelectorAll('.vid-tile').forEach(t => t.classList.toggle('playing', t === tile));
  const p = document.getElementById('vid-player');
  if (p && p.getBoundingClientRect().top < 0) p.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
