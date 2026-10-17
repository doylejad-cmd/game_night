'use strict';

/* =========================================================
   Family Game Night
   All data lives in this phone's local storage.
   ========================================================= */

const KEY = 'dfgn.v1';
const TKEY = 'dfgn.timers.v1';

const AVATARS = ['🦄', '🐶', '🐱', '🦊', '🐼', '🐸', '🦁', '🐯', '🐵', '🐙', '🦖', '🐧', '🐨', '🐰',
  '🦉', '🐝', '🚀', '⭐', '🌈', '🍕', '🎸', '⚽', '🏀', '🎨', '👑', '🤖', '👻', '🧁'];
const COLORS = ['#ff5d8f', '#ff8a3d', '#ffc43d', '#3ccf91', '#2bb6f0', '#6c63ff', '#b25cf7', '#f25ce0', '#00c2b8', '#ff6b6b'];
const THEMES = [
  ['#ff6b9d', '#ff9a6b'], ['#5b8cff', '#8f6bff'], ['#2fd39a', '#1fb5c9'], ['#ffb433', '#ff7a45'],
  ['#b45cff', '#ff5cc8'], ['#21c4f3', '#3b7bff'], ['#ff5f6d', '#ffb36b'], ['#36d67f', '#2bb8c9'],
];
const GAME_ICONS = ['🎲', '🃏', '🧩', '♟️', '🎯', '🏆', '🎳', '🎮'];
const MEDALS = ['🥇', '🥈', '🥉'];

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-5);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const hash = (s) => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h); };
const theme = (id) => THEMES[hash(id) % THEMES.length];
const gameIcon = (id) => GAME_ICONS[hash(id + 'i') % GAME_ICONS.length];
const fmtDate = (ts, year) => new Date(ts).toLocaleDateString(undefined,
  year ? { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' } : { weekday: 'short', month: 'short', day: 'numeric' });

/* ---------- State ---------- */

function defaults() {
  return { players: [], games: [], night: null, history: [], ui: { tab: 'night', view: 'tiles', tmode: 'timer' } };
}
function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && typeof d === 'object') {
      const s = Object.assign(defaults(), d);
      s.ui = Object.assign(defaults().ui, d.ui || {});
      return s;
    }
  } catch (e) { /* fall through */ }
  return defaults();
}
let S = load();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('⚠️ Could not save — storage is full or blocked'); }
}

let SETUP = null; // { players: [ids], games: [ids] } while choosing a new game night

const player = (id) => S.players.find((p) => p.id === id);
const libGame = (id) => S.games.find((g) => g.id === id);
const nightPlayers = () => (S.night ? S.night.playerIds.map(player).filter(Boolean) : []);
const nightGame = (id) => S.night && S.night.games.find((g) => g.id === id);

function total(pid) {
  if (!S.night) return 0;
  return S.night.games.reduce((sum, g) => sum + (typeof g.scores[pid] === 'number' ? g.scores[pid] : 0), 0);
}
// Round-by-round games: rounds add up to a Game Total, which is shown for reference only.
// The manual Score is still what feeds tonight's Total.
function gameTotal(g, pid) {
  return (g.roundScores || []).reduce((sum, r) => sum + (typeof r[pid] === 'number' ? r[pid] : 0), 0);
}
const reachedTarget = (g, pid) => !!g.target && gameTotal(g, pid) >= g.target;
function newInstance(g) {
  return {
    id: uid(), gameId: g.id, name: g.name, rules: g.rules || '',
    rounds: !!g.rounds, target: g.rounds ? g.target || null : null,
    roundScores: g.rounds ? [{}] : [], scores: {},
  };
}
// Apply game settings to tonight's copies of a game (and keep a round ready when rounds are on).
function syncInstances(gameId, instId, props) {
  if (!S.night) return;
  S.night.games.forEach((g) => {
    if (g.id === instId || (gameId && g.gameId === gameId)) {
      Object.assign(g, props);
      if (g.rounds && !(g.roundScores && g.roundScores.length)) g.roundScores = [{}];
    }
  });
}
function isComplete(g, players) {
  return players.length > 0 && players.every((p) => typeof g.scores[p.id] === 'number');
}
function gameLeaders(g, players) {
  if (!isComplete(g, players)) return [];
  const max = Math.max(...players.map((p) => g.scores[p.id]));
  return players.filter((p) => g.scores[p.id] === max).map((p) => p.id);
}
function anyScores() {
  return !!S.night && S.night.games.some((g) => Object.keys(g.scores).length > 0);
}
// Competition ranking: 1, 1, 3 ...
function ranked(list, getTotal) {
  const rows = list.map((p) => ({ p, total: getTotal(p) })).sort((a, b) => b.total - a.total);
  rows.forEach((r, i) => { r.rank = i > 0 && r.total === rows[i - 1].total ? rows[i - 1].rank : i + 1; });
  return rows;
}

/* =========================================================
   Rendering
   ========================================================= */

function render() {
  const tab = S.ui.tab;
  $$('.tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === tab));
  const v = $('#view');
  if (tab === 'players') v.innerHTML = viewPlayers();
  else if (tab === 'games') v.innerHTML = viewGames();
  else if (tab === 'timer') v.innerHTML = viewTimer();
  else v.innerHTML = S.night ? viewScorecard() : SETUP ? viewSetup() : viewHome();
  if (tab === 'night' && S.night) mountScorecard();
  updatePill();
  tickDisplays();
}

/* ---------- Home ---------- */

function winnersOf(h) {
  if (!h.players.length) return [];
  const max = Math.max(...h.players.map((p) => p.total));
  return h.players.filter((p) => p.total === max);
}

function viewHome() {
  const wins = {};
  S.history.forEach((h) => winnersOf(h).forEach((w) => {
    const cur = player(w.id) || w;
    wins[w.id] = wins[w.id] || { p: cur, n: 0 };
    wins[w.id].n++;
  }));
  const hof = Object.values(wins).sort((a, b) => b.n - a.n);
  const topN = hof.length ? hof[0].n : 0;

  return `
    <header class="hero">
      <div class="logo">🎲</div>
      <h1>Family<span>Game Night</span></h1>
      <p>Let the games begin!</p>
    </header>
    <button class="big-btn" data-act="startSetup">✨ Start a New Game Night</button>
    ${!S.players.length && !S.games.length ? `<p class="hint light">Tip: add your family on the Players tab and your favorite games on the Games tab — or add them as you go.</p>` : ''}
    ${hof.length ? `
      <section class="card">
        <h3 class="card-title">🏆 Hall of Fame</h3>
        <div class="hof">${hof.map((h) => `
          <div class="hof-item ${h.n === topN ? 'top' : ''}">
            <div class="av lg" style="background:${h.p.color}">${h.p.emoji}</div>
            <div class="n">${esc(h.p.name)}</div>
            <div class="w">${h.n === topN ? '👑 ' : ''}${h.n} win${h.n === 1 ? '' : 's'}</div>
          </div>`).join('')}
        </div>
      </section>` : ''}
    ${S.history.length ? `
      <h3 class="section-title">📚 Past Game Nights</h3>
      <ul class="list">${S.history.map((h) => {
        const w = winnersOf(h);
        const d = new Date(h.date);
        return `<li><button class="lrow" data-act="openHistory" data-id="${h.id}">
          <span class="main">
            <span class="date-ico"><small>${d.toLocaleDateString(undefined, { month: 'short' })}</small><b>${d.getDate()}</b></span>
            <span class="txt">
              <span class="title" style="display:block">${w.length > 1 ? '🤝 Tie: ' : '🏆 '}${w.map((x) => `${x.emoji} ${esc(x.name)}`).join(' & ')}</span>
              <span class="sub">${fmtDate(h.date, true)} · ${h.games.length} game${h.games.length === 1 ? '' : 's'}${w[0] ? ` · ${w[0].total} pts` : ''}</span>
            </span>
          </span>
        </button></li>`;
      }).join('')}</ul>` : ''}
    <button class="text-link" data-act="backupMenu">💾 Backup &amp; Restore</button>`;
}

/* ---------- Setup ---------- */

function pchip(p, on, act) {
  return `<button class="pchip ${on ? 'on' : ''}" data-act="${act}" data-id="${p.id}">
    <span class="av sm" style="background:${p.color}">${p.emoji}</span>${esc(p.name)}</button>`;
}

function viewSetup() {
  const ready = SETUP.players.length > 0 && SETUP.games.length > 0;
  return `
    <div class="page-head"><div class="ph-title">
      <button class="back" data-act="cancelSetup">‹ Back</button>
      <h2>New Game Night</h2>
    </div></div>
    <section class="card">
      <h3 class="card-title"><span class="step">1</span> Who's playing?</h3>
      ${S.players.length
        ? `<div class="pchips">${S.players.map((p) => pchip(p, SETUP.players.includes(p.id), 'pickPlayer')).join('')}</div>`
        : `<p class="muted">No players yet — add your family!</p>`}
      <button class="add-inline" data-act="newPlayer" data-ctx="setup">＋ Add player</button>
    </section>
    <section class="card">
      <h3 class="card-title"><span class="step">2</span> What are we playing?</h3>
      ${S.games.length
        ? `<p class="muted small">Tap games in the order you'd like to play. You can rearrange them anytime.</p>
           ${S.games.map((g) => {
             const k = SETUP.games.indexOf(g.id);
             return `<button class="gpick ${k >= 0 ? 'on' : ''}" data-act="pickGame" data-id="${g.id}">
               <span class="ord">${k >= 0 ? k + 1 : ''}</span><span class="gname">${esc(g.name)}</span></button>`;
           }).join('')}`
        : `<p class="muted">No games yet — add one!</p>`}
      <button class="add-inline" data-act="newGame" data-ctx="setup">＋ Add game</button>
    </section>
    <button class="big-btn" data-act="startNight" ${ready ? '' : 'disabled'}>Let's Play! 🎉</button>
    ${ready ? '' : `<p class="hint light">Pick at least one player and one game.</p>`}`;
}

/* ---------- Scorecard ---------- */

function scoreInput(g, p) {
  const v = g.scores[p.id];
  return `<span class="score-in">
    <button class="pm" data-act="negate" data-g="${g.id}" data-p="${p.id}" aria-label="Make negative">±</button>
    <input class="score" data-g="${g.id}" data-p="${p.id}" type="text" inputmode="numeric" pattern="[0-9]*"
      autocomplete="off" autocorrect="off" enterkeyhint="next" value="${typeof v === 'number' ? v : ''}" placeholder="–"
      aria-label="${esc(p.name)} score for ${esc(g.name)}">
  </span>`;
}

function leaderText(players) {
  if (!anyScores()) return 'Enter scores to see who\'s winning!';
  const rows = ranked(players, (p) => total(p.id));
  const top = rows.filter((r) => r.rank === 1);
  if (top.length > 1) return `🤝 Tied: <b>${top.map((r) => esc(r.p.name)).join(' & ')}</b> · ${top[0].total}`;
  return `👑 <b>${esc(top[0].p.name)}</b> leads with ${top[0].total}`;
}

function gtInner(g, pid) {
  const t = gameTotal(g, pid);
  return `${t}${g.target ? `<i class="gt-bar"><b style="width:${clamp((t / g.target) * 100, 0, 100)}%"></b></i>` : ''}`;
}

// Rounds grid: one row per round, one column per player, so the keyboard's ‹ › arrows
// move across players within a round.
function roundsHTML(g, players) {
  const rounds = g.roundScores || [];
  return `
    <div class="rounds">
      <div class="sec-label"><span>🔁 Rounds</span>${g.target ? `<span class="target-tag">🎯 First to ${g.target}</span>` : ''}</div>
      <div class="rgrid-wrap"><table class="rgrid" style="min-width:${36 + players.length * 46}px">
        <thead><tr><th class="rk"></th>${players.map((p) => `
          <th><span class="av sm" style="background:${p.color}">${p.emoji}</span><span class="rpn">${esc(p.name)}</span></th>`).join('')}
        </tr></thead>
        <tbody>${rounds.map((r, k) => `
          <tr><th class="rk"><button data-act="roundMenu" data-g="${g.id}" data-k="${k}" aria-label="Round ${k + 1} options">R${k + 1}</button></th>
          ${players.map((p) => `<td><input class="rscore" data-g="${g.id}" data-p="${p.id}" data-k="${k}" type="text" inputmode="numeric"
            pattern="[0-9]*" autocomplete="off" value="${typeof r[p.id] === 'number' ? r[p.id] : ''}" placeholder="–"
            aria-label="${esc(p.name)} round ${k + 1}"></td>`).join('')}</tr>`).join('')}
        </tbody>
      </table></div>
      <div class="round-actions">
        <button class="neg" data-act="negateRound" aria-label="Make the selected round score negative">± Neg</button>
        <button class="add-round" data-act="addRound" data-g="${g.id}">＋ Add round</button>
      </div>
    </div>
    <div class="sec-label pts-label"><span>🏅 Points for tonight</span></div>`;
}

function tileHTML(g, i, players) {
  const [g1, g2] = theme(g.id);
  const n = S.night;
  const leaders = gameLeaders(g, players);
  const last = i === n.games.length - 1;
  const R = !!g.rounds;
  return `
  <article class="tile ${R ? 'has-rounds' : ''}" data-tile="${i}" style="--g1:${g1};--g2:${g2}">
    <div class="tile-top">
      <div class="tile-count">GAME ${i + 1} OF ${n.games.length}</div>
      <button class="tile-menu" data-act="tileMenu" data-id="${g.id}" aria-label="Game options">⋯</button>
      <h3 class="tile-name">${esc(g.name)}</h3>
      ${g.rules ? `<button class="rules-btn" data-act="toggleRules" data-id="${g.id}">📖 Rules</button>` : ''}
    </div>
    ${g.rules ? `<div class="rules" id="rules-${g.id}" hidden>${esc(g.rules)}</div>` : ''}
    ${R ? roundsHTML(g, players) : ''}
    <div class="tile-cols"><span class="c-player">Player</span>${R ? '<span class="c-gt">Game<br>Total</span>' : ''}<span class="c-score">Score</span><span class="c-total">Total</span></div>
    <ul class="score-rows">${players.map((p) => `
      <li class="srow">
        <span class="av" style="background:${p.color}">${p.emoji}<span class="star" data-star="${g.id}:${p.id}">${leaders.includes(p.id) ? '⭐' : ''}</span></span>
        <span class="pname">${esc(p.name)}</span>
        ${R ? `<span class="gtotal ${reachedTarget(g, p.id) ? 'reached' : ''}" data-gt="${g.id}:${p.id}">${gtInner(g, p.id)}</span>` : ''}
        ${scoreInput(g, p)}
        <span class="ptotal" data-total="${p.id}">${total(p.id)}</span>
      </li>`).join('')}
    </ul>
    <div class="tile-foot">
      <div class="leader" data-leader>${leaderText(players)}</div>
      <button class="next-btn" data-act="go" data-i="${i + 1}">${last ? 'Totals 🏆' : 'Next ›'}</button>
    </div>
  </article>`;
}

function standingsHTML(players) {
  const rows = ranked(players, (p) => total(p.id));
  const max = Math.max(1, ...rows.map((r) => r.total));
  const scored = anyScores();
  return `<ol class="stand">${rows.map((r) => `
    <li>
      <span class="medal ${scored && r.rank <= 3 ? '' : 'n'}">${scored && r.rank <= 3 ? MEDALS[r.rank - 1] : r.rank}</span>
      <span class="av" style="background:${r.p.color}">${r.p.emoji}</span>
      <span class="sname"><span>${esc(r.p.name)}</span><span class="bar"><i style="width:${(Math.max(0, r.total) / max) * 100}%"></i></span></span>
      <span class="pts">${r.total}</span>
    </li>`).join('')}</ol>`;
}

function standingsTile(players) {
  return `
  <article class="tile" data-tile="${S.night.games.length}" style="--g1:#ffc43d;--g2:#ff8a3d">
    <div class="tile-top">
      <div class="tile-count">TOTAL SCORE · ALL GAMES</div>
      <h3 class="tile-name">🏆 Standings</h3>
    </div>
    <div id="standings">${standingsHTML(players)}</div>
    <div class="tile-foot col"><button class="big-btn in" data-act="finishNight">🏁 Finish Game Night</button></div>
  </article>`;
}

function chipsHTML(players) {
  const n = S.night;
  return `<div class="chips" id="chips">${n.games.map((g, i) => `
    <button class="gchip" data-act="go" data-i="${i}"><span class="num">${i + 1}</span><span class="lbl">${esc(g.name)}</span><span class="chk" data-chk="${g.id}">${isComplete(g, players) ? '✓' : ''}</span></button>`).join('')}
    <button class="gchip" data-act="go" data-i="${n.games.length}"><span class="num">🏆</span><span class="lbl">Totals</span></button>
  </div>`;
}

function tableHTML(players) {
  const n = S.night;
  return `
  <div class="table-card"><div class="table-wrap"><table class="grid">
    <thead><tr>
      <th class="pcol">Player</th>
      ${n.games.map((g, i) => {
        const [g1, g2] = theme(g.id);
        return `<th><button class="colbtn" data-act="go" data-i="${i}"><i class="dot" style="background:linear-gradient(135deg,${g1},${g2})"></i><span>${g.rounds ? '🔁 ' : ''}${esc(g.name)}</span></button></th>`;
      }).join('')}
      <th class="tcol">Total</th>
    </tr></thead>
    <tbody>${players.map((p) => `
      <tr>
        <th class="pcol"><span class="pc"><span class="av sm" style="background:${p.color}">${p.emoji}</span><span>${esc(p.name)}</span></span></th>
        ${n.games.map((g) => `<td>${scoreInput(g, p)}</td>`).join('')}
        <td class="tcol" data-total="${p.id}">${total(p.id)}</td>
      </tr>`).join('')}
    </tbody>
  </table></div></div>
  <p class="hint light">Tap a game name to open its tile.</p>`;
}

function viewScorecard() {
  const n = S.night;
  const players = nightPlayers();
  const table = S.ui.view === 'table';
  let html = `
    <div class="page-head">
      <div class="ph-title"><div class="eyebrow">🎲 ${fmtDate(n.startedAt)}</div><h2>Scorecard</h2></div>
      <div class="ph-actions">
        <button class="icon-btn" data-act="toggleView" aria-label="${table ? 'Tile view' : 'Table view'}">${table ? '🃏' : '📋'}</button>
        <button class="icon-btn" data-act="reorder" aria-label="Reorder games">↕️</button>
        <button class="icon-btn" data-act="addNightGame" aria-label="Add a game">➕</button>
        <button class="icon-btn" data-act="nightMenu" aria-label="More options">⋯</button>
      </div>
    </div>`;
  if (!players.length) {
    return html + `<div class="empty"><div class="big">🙋</div><h3>No players tonight</h3><p>Add who's playing to start scoring.</p></div>
      <button class="big-btn" data-act="nightPlayers">Choose Players</button>`;
  }
  if (!n.games.length) {
    return html + `<div class="empty"><div class="big">🎲</div><h3>No games yet</h3><p>Add a game to tonight's lineup.</p></div>
      <button class="big-btn" data-act="addNightGame">＋ Add a Game</button>`;
  }
  if (table) {
    html += tableHTML(players);
    html += `<section class="card" style="padding:4px 0 0"><div class="tile-cols" style="padding-top:10px"><span class="c-player">🏆 Standings</span></div><div id="standings">${standingsHTML(players)}</div></section>`;
    html += `<button class="big-btn" data-act="finishNight">🏁 Finish Game Night</button>`;
  } else {
    html += chipsHTML(players);
    html += `<div class="carousel" id="carousel">${n.games.map((g, i) => tileHTML(g, i, players)).join('')}${standingsTile(players)}</div>`;
  }
  return html;
}

// Update totals, stars, leaders and standings in place (keeps the keyboard open while typing).
function refreshScores() {
  if (!S.night) return;
  const players = nightPlayers();
  const totals = Object.fromEntries(players.map((p) => [p.id, total(p.id)]));
  $$('[data-total]').forEach((el) => { el.textContent = totals[el.dataset.total] ?? 0; });
  S.night.games.forEach((g) => {
    const leaders = gameLeaders(g, players);
    players.forEach((p) => {
      const st = document.querySelector(`[data-star="${g.id}:${p.id}"]`);
      if (st) st.textContent = leaders.includes(p.id) ? '⭐' : '';
    });
    const chk = document.querySelector(`[data-chk="${g.id}"]`);
    if (chk) chk.textContent = isComplete(g, players) ? '✓' : '';
    if (g.rounds) {
      players.forEach((p) => {
        const el = document.querySelector(`[data-gt="${g.id}:${p.id}"]`);
        if (el) { el.innerHTML = gtInner(g, p.id); el.classList.toggle('reached', reachedTarget(g, p.id)); }
      });
    }
  });
  const lt = leaderText(players);
  $$('[data-leader]').forEach((el) => { el.innerHTML = lt; });
  const st = $('#standings');
  if (st) st.innerHTML = standingsHTML(players);
}

/* ---------- Carousel ---------- */

function tileOffset(i) {
  const c = $('#carousel');
  const t = c && c.children[i];
  return t ? t.offsetLeft - 16 : 0;
}
function currentTileFromScroll() {
  const c = $('#carousel');
  if (!c) return 0;
  let best = 0, bestD = Infinity;
  [...c.children].forEach((t, i) => {
    const d = Math.abs(t.offsetLeft - 16 - c.scrollLeft);
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}
function markChip(i, smooth = true) {
  const strip = $('#chips');
  if (!strip) return;
  [...strip.children].forEach((ch, k) => ch.classList.toggle('on', k === i));
  const ch = strip.children[i];
  if (ch) strip.scrollTo({ left: ch.offsetLeft - strip.clientWidth / 2 + ch.offsetWidth / 2, behavior: smooth ? 'smooth' : 'auto' });
}
let saveIdxTimer = 0;
function mountScorecard() {
  const c = $('#carousel');
  if (!c) return;
  const n = S.night;
  n.idx = clamp(n.idx || 0, 0, n.games.length);
  c.scrollLeft = tileOffset(n.idx);
  markChip(n.idx, false);
  c.addEventListener('scroll', () => {
    const i = currentTileFromScroll();
    if (i !== S.night.idx) {
      S.night.idx = i;
      markChip(i);
      clearTimeout(saveIdxTimer);
      saveIdxTimer = setTimeout(save, 400);
    }
  }, { passive: true });
}
function goToTile(i) {
  const n = S.night;
  i = clamp(i, 0, n.games.length);
  if (S.ui.view === 'table') {
    S.ui.view = 'tiles';
    n.idx = i;
    save();
    render();
    scrollViewTop();
    return;
  }
  const c = $('#carousel');
  if (!c) return;
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  c.scrollTo({ left: tileOffset(i), behavior: 'smooth' });
}

/* ---------- Players & Games tabs ---------- */

function winsByPlayer() {
  const wins = {};
  S.history.forEach((h) => winnersOf(h).forEach((w) => { wins[w.id] = (wins[w.id] || 0) + 1; }));
  return wins;
}

function viewPlayers() {
  const wins = winsByPlayer();
  const head = `<div class="page-head"><div class="ph-title"><div class="eyebrow">The Family</div><h2>Players</h2></div>
    <button class="add-btn" data-act="newPlayer" data-ctx="library">＋ Add</button></div>`;
  if (!S.players.length) {
    return head + `<div class="empty"><div class="big">👨‍👩‍👧‍👦</div><h3>Who's in the family?</h3>
      <p>Add everyone who plays. They'll be saved for every game night.</p></div>
      <button class="big-btn" data-act="newPlayer" data-ctx="library">＋ Add a Player</button>`;
  }
  return head + `<ul class="list">${S.players.map((p) => `
    <li class="lrow">
      <button class="main" data-act="editPlayer" data-id="${p.id}">
        <span class="av lg" style="background:${p.color}">${p.emoji}</span>
        <span class="txt"><span class="title" style="display:block">${esc(p.name)}</span>
        <span class="sub">${wins[p.id] ? `🏆 ${wins[p.id]} game night win${wins[p.id] === 1 ? '' : 's'}` : 'Tap to edit'}</span></span>
      </button>
      <button class="del" data-act="deletePlayer" data-id="${p.id}" aria-label="Delete ${esc(p.name)}">🗑️</button>
    </li>`).join('')}</ul>`;
}

function viewGames() {
  const head = `<div class="page-head"><div class="ph-title"><div class="eyebrow">Our Collection</div><h2>Games</h2></div>
    <button class="add-btn" data-act="newGame" data-ctx="library">＋ Add</button></div>`;
  if (!S.games.length) {
    return head + `<div class="empty"><div class="big">🃏</div><h3>No games yet</h3>
      <p>Add your favorite games with their rules so everyone knows how to play.</p></div>
      <button class="big-btn" data-act="newGame" data-ctx="library">＋ Add a Game</button>`;
  }
  return head + `<ul class="list">${S.games.map((g) => {
    const [g1, g2] = theme(g.id);
    return `<li class="lrow">
      <button class="main" data-act="editGame" data-id="${g.id}">
        <span class="game-ico" style="--g1:${g1};--g2:${g2}">${gameIcon(g.id)}</span>
        <span class="txt"><span class="title" style="display:block">${esc(g.name)}</span>
        <span class="sub">${g.rounds ? `<span class="badge">🔁 Rounds${g.target ? ` · 🎯 ${g.target}` : ''}</span> ` : ''}${g.rules ? esc(g.rules) : 'No rules added yet — tap to add'}</span></span>
      </button>
      <button class="del" data-act="deleteGame" data-id="${g.id}" aria-label="Delete ${esc(g.name)}">🗑️</button>
    </li>`;
  }).join('')}</ul>`;
}

/* =========================================================
   Sheets (bottom pop-ups)
   ========================================================= */

let sheetOnClose = null;
let sheetTimer = 0;
function openSheet(html, { onMount, onClose } = {}) {
  clearTimeout(sheetTimer);
  const root = $('#sheet-root');
  const wasOpen = root.classList.contains('show');
  root.innerHTML = `<div class="sheet-backdrop" data-act="closeSheet"></div>
    <div class="sheet" role="dialog" aria-modal="true"><div class="grabber"></div>${html}</div>`;
  root.classList.add('open');
  if (wasOpen) root.classList.add('show');
  else { root.offsetHeight; root.classList.add('show'); }
  sheetOnClose = onClose || null;
  if (onMount) onMount(root.querySelector('.sheet'));
}
function closeSheet() {
  const root = $('#sheet-root');
  if (!root.classList.contains('open')) return;
  if (document.activeElement && root.contains(document.activeElement)) document.activeElement.blur();
  root.classList.remove('show');
  root.classList.remove('open');
  const cb = sheetOnClose;
  sheetOnClose = null;
  sheetTimer = setTimeout(() => { root.innerHTML = ''; }, 320);
  if (cb) cb();
}

function confirmBox(title, msg, okLabel = 'Delete', danger = true) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    openSheet(`<h3 class="sheet-title">${title}</h3><p class="sheet-sub">${msg}</p>
      <div class="sheet-actions">
        <button class="btn ghost" data-act="closeSheet">Cancel</button>
        <button class="btn ${danger ? 'danger' : 'primary'}" id="cfYes">${okLabel}</button>
      </div>`, {
      onClose: () => finish(false),
      onMount: (s) => { $('#cfYes', s).onclick = () => { finish(true); closeSheet(); }; },
    });
  });
}

/* ---------- Player form ---------- */

let PF = null;
function playerForm(p, ctx) {
  const isNew = !p;
  const k = S.players.length;
  PF = {
    id: p ? p.id : null, ctx,
    emoji: p ? p.emoji : AVATARS[k % AVATARS.length],
    color: p ? p.color : COLORS[k % COLORS.length],
  };
  openSheet(`
    <h3 class="sheet-title">${isNew ? 'New Player' : 'Edit Player'}</h3>
    <div class="avatar-preview" id="pfPrev" style="background:${PF.color}">${PF.emoji}</div>
    <label class="field" id="pfField"><span>Name</span>
      <input id="pfName" maxlength="20" value="${esc(p ? p.name : '')}" placeholder="e.g. Grandma" autocomplete="off" enterkeyhint="done"></label>
    <div class="field"><span>Pick a buddy</span>
      <div class="emoji-grid">${AVATARS.map((a) => `<button class="emo ${a === PF.emoji ? 'on' : ''}" data-act="pfEmoji" data-v="${a}">${a}</button>`).join('')}</div></div>
    <div class="field"><span>Favorite color</span>
      <div class="swatches">${COLORS.map((c) => `<button class="swatch-btn ${c === PF.color ? 'on' : ''}" style="background:${c}" data-act="pfColor" data-v="${c}" aria-label="Color"></button>`).join('')}</div></div>
    <div class="sheet-actions">
      ${isNew ? '' : `<button class="btn danger-ghost" data-act="deletePlayer" data-id="${p.id}">Delete</button>`}
      <button class="btn ghost" data-act="${ctx === 'night' ? 'nightPlayers' : 'closeSheet'}">Cancel</button>
      <button class="btn primary" data-act="pfSave">Save</button>
    </div>`, {
    onMount: (s) => {
      const inp = $('#pfName', s);
      if (isNew) inp.focus();
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); A.pfSave(); } });
    },
  });
}

/* ---------- Game form ---------- */

let GF = null;
function gameForm(g, ctx) {
  const isNew = !g;
  GF = { id: g ? g.id : null, ctx };
  openSheet(`
    <h3 class="sheet-title">${isNew ? 'New Game' : 'Edit Game'}</h3>
    ${ctx === 'nightEdit' ? '<p class="sheet-sub">Changes also update this game in your Games list.</p>' : ''}
    <label class="field" id="gfField"><span>Game Name</span>
      <input id="gfName" maxlength="40" value="${esc(g ? g.name : '')}" placeholder="e.g. Uno" autocomplete="off" enterkeyhint="next"></label>
    <label class="field"><span>Rules / Description</span>
      <textarea id="gfRules" placeholder="How to play, how scoring works, house rules…">${esc(g ? g.rules : '')}</textarea></label>
    <label class="toggle-row">
      <span class="txt"><b>🔁 Score by rounds</b>
        <small>Track points round by round. Rounds add up to a Game Total; you still enter the Score that counts toward tonight's Total.</small></span>
      <span class="switch"><input type="checkbox" id="gfRounds" ${g && g.rounds ? 'checked' : ''}><i></i></span>
    </label>
    <label class="field" id="gfTargetField" ${g && g.rounds ? '' : 'hidden'}><span>🎯 Target score (optional)</span>
      <input id="gfTarget" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off"
        value="${g && g.target ? g.target : ''}" placeholder="e.g. 500 — we'll cheer when someone gets there"></label>
    <div class="sheet-actions">
      ${!isNew && ctx === 'library' ? `<button class="btn danger-ghost" data-act="deleteGame" data-id="${g.id}">Delete</button>` : ''}
      <button class="btn ghost" data-act="${ctx === 'night' ? 'addNightGame' : 'closeSheet'}">Cancel</button>
      <button class="btn primary" data-act="gfSave">Save</button>
    </div>`, {
    onMount: (s) => {
      const inp = $('#gfName', s);
      if (isNew) inp.focus();
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#gfRules').focus(); } });
      $('#gfRounds', s).addEventListener('change', (e) => { $('#gfTargetField', s).hidden = !e.target.checked; });
    },
  });
}

function flagField(id, msg) {
  const f = $(id);
  if (f) { f.classList.remove('err'); f.offsetWidth; f.classList.add('err'); }
  toast(msg);
}

/* ---------- Game night sheets ---------- */

function reorderSheet() {
  openSheet(`
    <h3 class="sheet-title">Reorder Games</h3>
    <p class="sheet-sub">Drag the ☰ handle to move a game. Scores move with it.</p>
    <ul class="rlist" id="rlist"></ul>
    <button class="btn ghost block" data-act="addNightGame">＋ Add a game</button>
    <button class="btn primary block" data-act="closeSheet">Done</button>`, {
    onMount: (s) => {
      const list = $('#rlist', s);
      fillReorderList(list);
      initReorder(list, (from, to) => {
        moveNightGame(from, to);
        fillReorderList(list);
      });
    },
  });
}
function fillReorderList(list) {
  list.innerHTML = S.night.games.map((g, i) => {
    const [g1, g2] = theme(g.id);
    return `<li style="--g1:${g1};--g2:${g2}">
      <span class="handle" aria-label="Drag to reorder">☰</span><span class="swatch"></span>
      <span class="rname">${i + 1}. ${esc(g.name)}</span>
      <button class="del" data-act="removeNightGame" data-id="${g.id}" data-from="reorder" aria-label="Remove">🗑️</button>
    </li>`;
  }).join('') || '<p class="muted">No games yet.</p>';
}

// Touch-friendly drag-to-reorder (HTML5 drag & drop doesn't work well on iPhone).
function initReorder(list, onDrop) {
  list.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest('.handle');
    if (!handle) return;
    e.preventDefault();
    const item = handle.closest('li');
    const items = [...list.children];
    const from = items.indexOf(item);
    const rects = items.map((el) => el.getBoundingClientRect());
    const step = items.length > 1 ? rects[1].top - rects[0].top : rects[0].height;
    const startY = e.clientY;
    let to = from;
    item.classList.add('dragging');
    try { handle.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }

    const move = (ev) => {
      const minDy = rects[0].top - rects[from].top;
      const maxDy = rects[items.length - 1].top - rects[from].top;
      const dy = clamp(ev.clientY - startY, minDy - 10, maxDy + 10);
      item.style.transform = `translateY(${dy}px) scale(1.03)`;
      const center = rects[from].top + rects[from].height / 2 + dy;
      to = 0;
      items.forEach((el, k) => { if (k !== from && center > rects[k].top + rects[k].height / 2) to++; });
      items.forEach((el, k) => {
        if (k === from) return;
        let shift = 0;
        if (from < to && k > from && k <= to) shift = -step;
        else if (from > to && k >= to && k < from) shift = step;
        el.style.transform = shift ? `translateY(${shift}px)` : '';
      });
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      items.forEach((el) => { el.style.transform = ''; });
      item.classList.remove('dragging');
      if (to !== from) onDrop(from, to);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  });
}

function moveNightGame(from, to) {
  const n = S.night;
  const cur = n.games[n.idx] ? n.games[n.idx].id : null;
  const [g] = n.games.splice(from, 1);
  n.games.splice(to, 0, g);
  if (cur) n.idx = n.games.findIndex((x) => x.id === cur);
  save();
  render();
}

function addGameSheet() {
  const inNight = new Set(S.night.games.map((g) => g.gameId));
  openSheet(`
    <h3 class="sheet-title">Add a Game</h3>
    <p class="sheet-sub">It'll be added to the end of tonight's lineup.</p>
    <button class="btn primary block" style="margin:0 0 14px" data-act="newGame" data-ctx="night">✏️ Create a new game</button>
    ${S.games.map((g) => {
      const [g1, g2] = theme(g.id);
      return `<button class="pick-row" data-act="addGameToNight" data-id="${g.id}">
        <span class="game-ico" style="--g1:${g1};--g2:${g2}">${gameIcon(g.id)}</span>
        <span class="txt"><span class="title" style="display:block">${esc(g.name)}</span>
        ${inNight.has(g.id) ? '<span class="sub">Already in tonight · tap to play again</span>' : ''}</span>
        <span class="plus">＋</span></button>`;
    }).join('')}
    <button class="btn ghost block" data-act="closeSheet">Close</button>`);
}

function addGameToNight(gameId) {
  const g = libGame(gameId);
  if (!g) return;
  const n = S.night;
  n.games.push(newInstance(g));
  n.idx = n.games.length - 1;
  save();
  closeSheet();
  render();
  toast(`🎲 Added ${g.name}!`);
}

function nightPlayersSheet() {
  openSheet(`
    <h3 class="sheet-title">Who's Playing Tonight?</h3>
    <p class="sheet-sub">Tap to add or remove players. Scores are kept if you add someone back.</p>
    <div class="pchips" id="npList">${S.players.map((p) => pchip(p, S.night.playerIds.includes(p.id), 'toggleNightPlayer')).join('')}</div>
    <button class="add-inline" data-act="newPlayer" data-ctx="night">＋ New player</button>
    <button class="btn primary block" data-act="closeSheet">Done</button>`, { onClose: render });
}

function tileMenu(id) {
  const g = nightGame(id);
  if (!g) return;
  openSheet(`
    <h3 class="sheet-title">${esc(g.name)}</h3>
    <p class="sheet-sub">Game ${S.night.games.indexOf(g) + 1} of ${S.night.games.length}</p>
    <button class="menu-row" data-act="editNightGame" data-id="${g.id}"><span class="mi">✏️</span>Edit name, rules &amp; target</button>
    <button class="menu-row" data-act="toggleRounds" data-id="${g.id}"><span class="mi">🔁</span>${g.rounds ? 'Turn off round scoring' : 'Score by rounds'}</button>
    <button class="menu-row" data-act="reorder"><span class="mi">↕️</span>Reorder games</button>
    <button class="menu-row" data-act="openTimer"><span class="mi">⏱️</span>Open timer &amp; stopwatch</button>
    <button class="menu-row" data-act="clearScores" data-id="${g.id}"><span class="mi">🧽</span>Clear this game's scores</button>
    <button class="menu-row danger" data-act="removeNightGame" data-id="${g.id}"><span class="mi">🗑️</span>Remove from tonight</button>`);
}

function nightMenu() {
  openSheet(`
    <h3 class="sheet-title">Game Night</h3>
    <p class="sheet-sub">Started ${fmtDate(S.night.startedAt)}</p>
    <button class="menu-row" data-act="nightPlayers"><span class="mi">🧑‍🤝‍🧑</span>Add or remove players</button>
    <button class="menu-row" data-act="addNightGame"><span class="mi">➕</span>Add a game</button>
    <button class="menu-row" data-act="reorder"><span class="mi">↕️</span>Reorder or remove games</button>
    <button class="menu-row" data-act="toggleView"><span class="mi">${S.ui.view === 'table' ? '🃏' : '📋'}</span>Switch to ${S.ui.view === 'table' ? 'tile' : 'table'} view</button>
    <button class="menu-row" data-act="openTimer"><span class="mi">⏱️</span>Timer &amp; stopwatch</button>
    <button class="menu-row" data-act="finishNight"><span class="mi">🏁</span>Finish &amp; save game night</button>
    <button class="menu-row danger" data-act="cancelNight"><span class="mi">🗑️</span>Discard game night</button>`);
}

function historySheet(id) {
  const h = S.history.find((x) => x.id === id);
  if (!h) return;
  const w = winnersOf(h);
  const rows = ranked(h.players, (p) => p.total);
  openSheet(`
    <div class="winner-hero">
      <div class="crown">${w.length > 1 ? '🤝' : '👑'}</div>
      ${w.length === 1 ? `<div class="av" style="background:${w[0].color}">${w[0].emoji}</div>` : ''}
      <h3>${w.length > 1 ? 'It was a tie!' : `${esc(w[0].name)} won!`}</h3>
      <p>${fmtDate(h.date, true)}</p>
    </div>
    <ol class="stand" style="padding:0">${rows.map((r) => `
      <li><span class="medal ${r.rank <= 3 ? '' : 'n'}">${r.rank <= 3 ? MEDALS[r.rank - 1] : r.rank}</span>
      <span class="av" style="background:${r.p.color}">${r.p.emoji}</span>
      <span class="sname"><span>${esc(r.p.name)}</span></span><span class="pts">${r.total}</span></li>`).join('')}</ol>
    <h3 class="card-title" style="margin:16px 0 4px">Games played</h3>
    <table class="breakdown">${h.games.map((g) => {
      const vals = h.players.filter((p) => typeof g.scores[p.id] === 'number');
      const max = vals.length ? Math.max(...vals.map((p) => g.scores[p.id])) : null;
      const gw = vals.filter((p) => g.scores[p.id] === max);
      return `<tr><td>${esc(g.name)}</td><td>${gw.length ? `⭐ ${gw.map((p) => esc(p.name)).join(' & ')} (${max})` : '—'}</td></tr>`;
    }).join('')}</table>
    ${h.games.filter((g) => g.rounds && g.rounds.length).map((g) => `
      <h4 class="hist-sub">🔁 ${esc(g.name)} rounds${g.target ? ` · 🎯 ${g.target}` : ''}</h4>
      <div class="rgrid-wrap"><table class="rgrid ro" style="min-width:${36 + h.players.length * 46}px">
        <thead><tr><th class="rk"></th>${h.players.map((p) => `<th><span class="av sm" style="background:${p.color}">${p.emoji}</span><span class="rpn">${esc(p.name)}</span></th>`).join('')}</tr></thead>
        <tbody>${g.rounds.map((r, k) => `<tr><th class="rk">R${k + 1}</th>${h.players.map((p) => `<td>${typeof r[p.id] === 'number' ? r[p.id] : '–'}</td>`).join('')}</tr>`).join('')}</tbody>
        <tfoot><tr><th class="rk">Game</th>${h.players.map((p) => `<td>${gameTotal({ roundScores: g.rounds }, p.id)}</td>`).join('')}</tr></tfoot>
      </table></div>`).join('')}
    <div class="sheet-actions">
      <button class="btn danger-ghost" data-act="deleteHistory" data-id="${h.id}">Delete</button>
      <button class="btn primary" data-act="closeSheet">Close</button>
    </div>`);
}

function winnerSheet(h) {
  const w = winnersOf(h);
  openSheet(`
    <div class="winner-hero">
      <div class="crown">${w.length > 1 ? '🤝' : '👑'}</div>
      ${w.length === 1 ? `<div class="av" style="background:${w[0].color}">${w[0].emoji}</div>` : ''}
      <h3>${w.length > 1 ? `It's a tie!` : `${esc(w[0].name)} wins!`}</h3>
      <p>${w.length > 1 ? w.map((x) => esc(x.name)).join(' & ') + ' · ' : ''}${w[0] ? w[0].total : 0} points · ${h.games.length} game${h.games.length === 1 ? '' : 's'}</p>
    </div>
    <ol class="stand" style="padding:0">${ranked(h.players, (p) => p.total).map((r) => `
      <li><span class="medal ${r.rank <= 3 ? '' : 'n'}">${r.rank <= 3 ? MEDALS[r.rank - 1] : r.rank}</span>
      <span class="av" style="background:${r.p.color}">${r.p.emoji}</span>
      <span class="sname"><span>${esc(r.p.name)}</span></span><span class="pts">${r.total}</span></li>`).join('')}</ol>
    <button class="big-btn in" style="margin-top:16px" data-act="closeSheet">Yay! 🎉</button>`);
}

function backupSheet() {
  openSheet(`
    <h3 class="sheet-title">Backup &amp; Restore</h3>
    <p class="sheet-sub">Everything is stored on this phone. Save a backup file (to Files or iCloud Drive) now and then so you never lose your history.</p>
    <button class="menu-row" data-act="exportData"><span class="mi">📤</span>Save a backup file</button>
    <button class="menu-row" data-act="importData"><span class="mi">📥</span>Restore from a backup file</button>
    <button class="btn ghost block" data-act="closeSheet">Close</button>`);
}

/* =========================================================
   Actions
   ========================================================= */

function setScore(gid, pid, s) {
  const g = nightGame(gid);
  if (!g) return;
  if (s === '' || s === '-') delete g.scores[pid];
  else g.scores[pid] = parseInt(s, 10);
  save();
  refreshScores();
}

function setRound(gid, k, pid, s) {
  const g = nightGame(gid);
  if (!g || !g.roundScores || !g.roundScores[k]) return;
  const before = reachedTarget(g, pid);
  if (s === '' || s === '-') delete g.roundScores[k][pid];
  else g.roundScores[k][pid] = parseInt(s, 10);
  save();
  refreshScores();
  if (!before && reachedTarget(g, pid)) {
    const p = player(pid);
    toast(`🎯 ${p ? p.name : 'Someone'} reached ${g.target} in ${g.name}!`);
    confetti(1500);
    fanfare();
  }
}

const negated = (v) => (v === '' || v === '-' ? (v === '-' ? '' : '-') : v.startsWith('-') ? v.slice(1) : '-' + v);
const cleanNum = (v) => v.replace(/[^\d-]/g, '').replace(/(?!^)-/g, '').slice(0, 7);
let lastRoundInput = null;

function roundMenu(gid, k) {
  const g = nightGame(gid);
  if (!g) return;
  openSheet(`
    <h3 class="sheet-title">Round ${k + 1}</h3>
    <p class="sheet-sub">${esc(g.name)} · ${g.roundScores.length} round${g.roundScores.length === 1 ? '' : 's'} so far</p>
    <button class="menu-row" data-act="clearRound" data-g="${g.id}" data-k="${k}"><span class="mi">🧽</span>Clear this round's scores</button>
    <button class="menu-row danger" data-act="deleteRound" data-g="${g.id}" data-k="${k}"><span class="mi">🗑️</span>Delete this round</button>
    <button class="btn ghost block" data-act="closeSheet">Cancel</button>`);
}

const A = {
  tab(el) {
    S.ui.tab = el.dataset.tab;
    if (el.dataset.m) S.ui.tmode = el.dataset.m;
    save();
    render();
    scrollViewTop();
  },
  closeSheet() { closeSheet(); },

  /* Setup */
  startSetup() {
    SETUP = { players: S.players.map((p) => p.id), games: [] };
    render();
    scrollViewTop();
  },
  cancelSetup() { SETUP = null; render(); },
  pickPlayer(el) {
    const id = el.dataset.id;
    const i = SETUP.players.indexOf(id);
    if (i >= 0) SETUP.players.splice(i, 1); else SETUP.players.push(id);
    render();
  },
  pickGame(el) {
    const id = el.dataset.id;
    const i = SETUP.games.indexOf(id);
    if (i >= 0) SETUP.games.splice(i, 1); else SETUP.games.push(id);
    render();
  },
  startNight() {
    if (!SETUP || !SETUP.players.length || !SETUP.games.length) return;
    S.night = {
      id: uid(),
      startedAt: Date.now(),
      playerIds: S.players.filter((p) => SETUP.players.includes(p.id)).map((p) => p.id),
      games: SETUP.games.map(libGame).filter(Boolean).map(newInstance),
      idx: 0,
    };
    SETUP = null;
    S.ui.view = 'tiles';
    save();
    render();
    scrollViewTop();
    confetti(1200);
    toast('🎉 Let the games begin!');
  },

  /* Players */
  newPlayer(el) { playerForm(null, el.dataset.ctx || 'library'); },
  editPlayer(el) { playerForm(player(el.dataset.id), 'library'); },
  pfEmoji(el) {
    PF.emoji = el.dataset.v;
    $$('.emo').forEach((b) => b.classList.toggle('on', b.dataset.v === PF.emoji));
    $('#pfPrev').textContent = PF.emoji;
  },
  pfColor(el) {
    PF.color = el.dataset.v;
    $$('.swatch-btn').forEach((b) => b.classList.toggle('on', b.dataset.v === PF.color));
    $('#pfPrev').style.background = PF.color;
  },
  pfSave() {
    const name = $('#pfName').value.trim();
    if (!name) return flagField('#pfField', 'Please add a name 🙂');
    if (S.players.some((p) => p.id !== PF.id && p.name.toLowerCase() === name.toLowerCase())) {
      return flagField('#pfField', `There's already a player named ${name}`);
    }
    if (PF.id) {
      Object.assign(player(PF.id), { name, emoji: PF.emoji, color: PF.color });
      save(); closeSheet(); render();
      toast('✅ Saved!');
      return;
    }
    const p = { id: uid(), name, emoji: PF.emoji, color: PF.color };
    S.players.push(p);
    if (PF.ctx === 'setup' && SETUP) SETUP.players.push(p.id);
    if (PF.ctx === 'night' && S.night) S.night.playerIds.push(p.id);
    save();
    if (PF.ctx === 'night') { render(); nightPlayersSheet(); } else { closeSheet(); render(); }
    toast(`👋 Welcome, ${name}!`);
  },
  async deletePlayer(el) {
    const p = player(el.dataset.id);
    if (!p) return;
    const inNight = S.night && S.night.playerIds.includes(p.id);
    const ok = await confirmBox(`Delete ${esc(p.name)}?`,
      `${inNight ? "They'll be removed from tonight's scorecard. " : ''}Past game night results are kept.`);
    if (!ok) return;
    S.players = S.players.filter((x) => x.id !== p.id);
    if (S.night) S.night.playerIds = S.night.playerIds.filter((id) => id !== p.id);
    if (SETUP) SETUP.players = SETUP.players.filter((id) => id !== p.id);
    save(); render();
    toast(`🗑️ Deleted ${p.name}`);
  },

  /* Games */
  newGame(el) { gameForm(null, el.dataset.ctx || 'library'); },
  editGame(el) { gameForm(libGame(el.dataset.id), 'library'); },
  editNightGame(el) { gameForm(nightGame(el.dataset.id), 'nightEdit'); GF.id = el.dataset.id; },
  gfSave() {
    const name = $('#gfName').value.trim();
    const rules = $('#gfRules').value.trim();
    const rounds = $('#gfRounds').checked;
    const t = parseInt($('#gfTarget').value.replace(/\D/g, ''), 10);
    const target = rounds && t > 0 ? t : null;
    const props = { name, rules, rounds, target };
    if (!name) return flagField('#gfField', 'Please add a game name 🙂');

    if (GF.ctx === 'nightEdit') {
      const inst = nightGame(GF.id);
      if (!inst) return closeSheet();
      const lib = libGame(inst.gameId);
      if (lib && S.games.some((g) => g.id !== lib.id && g.name.toLowerCase() === name.toLowerCase())) {
        return flagField('#gfField', `You already have a game called ${name}`);
      }
      if (lib) Object.assign(lib, props);
      syncInstances(lib && lib.id, inst.id, props);
      save(); closeSheet(); render();
      toast('✅ Saved!');
      return;
    }
    if (S.games.some((g) => g.id !== GF.id && g.name.toLowerCase() === name.toLowerCase())) {
      return flagField('#gfField', `You already have a game called ${name}`);
    }
    if (GF.id) {
      Object.assign(libGame(GF.id), props);
      syncInstances(GF.id, null, props);
      save(); closeSheet(); render();
      toast('✅ Saved!');
      return;
    }
    const g = { id: uid(), ...props };
    S.games.push(g);
    save();
    if (GF.ctx === 'setup' && SETUP) SETUP.games.push(g.id);
    if (GF.ctx === 'night' && S.night) return addGameToNight(g.id);
    closeSheet(); render();
    toast(`🎲 Added ${name}!`);
  },
  async deleteGame(el) {
    const g = libGame(el.dataset.id);
    if (!g) return;
    const ok = await confirmBox(`Delete ${esc(g.name)}?`, "It'll be removed from your Games list. Tonight's scorecard and past results won't change.");
    if (!ok) return;
    S.games = S.games.filter((x) => x.id !== g.id);
    if (SETUP) SETUP.games = SETUP.games.filter((id) => id !== g.id);
    save(); render();
    toast(`🗑️ Deleted ${g.name}`);
  },

  /* Scorecard */
  go(el) { goToTile(parseInt(el.dataset.i, 10)); },
  toggleRules(el) {
    const r = $('#rules-' + el.dataset.id);
    if (r) { r.hidden = !r.hidden; el.textContent = r.hidden ? '📖 Rules' : '📖 Hide rules'; }
  },
  toggleView() {
    S.ui.view = S.ui.view === 'table' ? 'tiles' : 'table';
    save(); closeSheet(); render();
  },
  negate(el) {
    const inp = el.parentElement.querySelector('input');
    const v = negated(inp.value);
    inp.value = v;
    setScore(inp.dataset.g, inp.dataset.p, v);
    if (v === '-') { inp.focus(); try { inp.setSelectionRange(1, 1); } catch (e) { /* ignore */ } }
  },

  /* Rounds */
  addRound(el) {
    const g = nightGame(el.dataset.g);
    if (!g) return;
    g.roundScores = g.roundScores || [];
    g.roundScores.push({});
    save();
    render();
    const k = g.roundScores.length - 1;
    const first = document.querySelector(`input.rscore[data-g="${g.id}"][data-k="${k}"]`);
    if (first) first.focus();
  },
  negateRound() {
    const inp = lastRoundInput;
    if (!inp || !document.body.contains(inp)) return toast('Tap a round box first, then ±');
    const v = negated(inp.value);
    inp.value = v;
    setRound(inp.dataset.g, +inp.dataset.k, inp.dataset.p, v);
    if (v === '-') { inp.focus(); try { inp.setSelectionRange(1, 1); } catch (e) { /* ignore */ } }
  },
  roundMenu(el) { roundMenu(el.dataset.g, +el.dataset.k); },
  clearRound(el) {
    const g = nightGame(el.dataset.g);
    const k = +el.dataset.k;
    if (!g || !g.roundScores[k]) return closeSheet();
    g.roundScores[k] = {};
    save(); closeSheet(); render();
  },
  async deleteRound(el) {
    const g = nightGame(el.dataset.g);
    const k = +el.dataset.k;
    if (!g || !g.roundScores[k]) return closeSheet();
    if (Object.keys(g.roundScores[k]).length) {
      const ok = await confirmBox(`Delete round ${k + 1}?`, `Its scores will be removed from the ${esc(g.name)} Game Total.`);
      if (!ok) return;
    }
    g.roundScores.splice(k, 1);
    if (!g.roundScores.length) g.roundScores.push({});
    save(); closeSheet(); render();
    toast(`🗑️ Deleted round ${k + 1}`);
  },
  toggleRounds(el) {
    const inst = nightGame(el.dataset.id);
    if (!inst) return;
    const lib = libGame(inst.gameId);
    const props = { rounds: !inst.rounds };
    if (lib) Object.assign(lib, props);
    syncInstances(lib && lib.id, inst.id, props);
    save(); closeSheet(); render();
    toast(props.rounds ? '🔁 Round scoring is on' : 'Round scoring is off');
  },
  reorder() { reorderSheet(); },
  addNightGame() { addGameSheet(); },
  addGameToNight(el) { addGameToNight(el.dataset.id); },
  nightMenu() { nightMenu(); },
  nightPlayers() { nightPlayersSheet(); },
  tileMenu(el) { tileMenu(el.dataset.id); },
  toggleNightPlayer(el) {
    const ids = S.night.playerIds;
    const id = el.dataset.id;
    const i = ids.indexOf(id);
    if (i >= 0) {
      if (ids.length === 1) return toast('You need at least one player!');
      ids.splice(i, 1);
    } else {
      // keep the family's usual order
      ids.push(id);
      S.night.playerIds = S.players.map((p) => p.id).filter((pid) => ids.includes(pid));
    }
    el.classList.toggle('on', i < 0);
    save();
  },
  async clearScores(el) {
    const g = nightGame(el.dataset.id);
    if (!g) return;
    const ok = await confirmBox(`Clear ${esc(g.name)} scores?`, 'All scores for this game will be erased.', 'Clear');
    if (!ok) return;
    g.scores = {};
    save(); render();
  },
  async removeNightGame(el) {
    const g = nightGame(el.dataset.id);
    if (!g) return;
    const fromReorder = el.dataset.from === 'reorder';
    const hasScores = Object.keys(g.scores).length > 0;
    if (hasScores || !fromReorder) {
      const ok = await confirmBox(`Remove ${esc(g.name)}?`, hasScores ? 'Its scores will be removed from tonight\'s totals.' : 'It will be removed from tonight\'s lineup.', 'Remove');
      if (!ok) { if (fromReorder) reorderSheet(); return; }
    }
    const n = S.night;
    const cur = n.games[n.idx] ? n.games[n.idx].id : null;
    n.games = n.games.filter((x) => x.id !== g.id);
    n.idx = cur && cur !== g.id ? n.games.findIndex((x) => x.id === cur) : Math.min(n.idx, n.games.length);
    save(); render();
    if (fromReorder) reorderSheet(); else closeSheet();
    toast(`🗑️ Removed ${g.name}`);
  },
  async finishNight() {
    const players = nightPlayers();
    const ok = await confirmBox('Finish game night?', "Final scores will be saved to your history and the scorecard will be cleared.", 'Finish 🏁', false);
    if (!ok) return;
    const n = S.night;
    const h = {
      id: n.id,
      date: n.startedAt,
      finishedAt: Date.now(),
      players: players.map((p) => ({ id: p.id, name: p.name, emoji: p.emoji, color: p.color, total: total(p.id) })),
      games: n.games.map((g) => ({
        name: g.name,
        scores: { ...g.scores },
        rounds: g.rounds ? (g.roundScores || []).map((r) => ({ ...r })) : null,
        target: g.rounds ? g.target || null : null,
      })),
    };
    S.history.unshift(h);
    S.night = null;
    save(); render();
    scrollViewTop();
    winnerSheet(h);
    confetti(3000);
    fanfare();
  },
  async cancelNight() {
    const ok = await confirmBox('Discard game night?', "Tonight's scores will be erased and not saved to history.", 'Discard');
    if (!ok) return;
    S.night = null;
    save(); render();
  },
  openTimer() { closeSheet(); A.tab({ dataset: { tab: 'timer' } }); },

  /* History & backup */
  openHistory(el) { historySheet(el.dataset.id); },
  async deleteHistory(el) {
    const ok = await confirmBox('Delete this game night?', 'It will be removed from your history and Hall of Fame.');
    if (!ok) return;
    S.history = S.history.filter((h) => h.id !== el.dataset.id);
    save(); render();
  },
  backupMenu() { backupSheet(); },
  exportData() { exportData(); },
  importData() { $('#importFile').click(); },

  /* Timers */
  tmode(el) { S.ui.tmode = el.dataset.m; save(); render(); },
  tpreset(el) { const ms = +el.dataset.ms; T.dur = ms; T.rem = ms; T.endAt = null; saveTimers(); render(); },
  tadj(el) {
    if (T.endAt) return;
    T.rem = T.dur = clamp(T.rem + (+el.dataset.d), 5000, 99 * 60000 + 59000);
    saveTimers(); render();
  },
  tstart() {
    unlockAudio();
    if (T.endAt) { T.rem = tRemaining(); T.endAt = null; }
    else {
      if (T.rem <= 0) T.rem = T.dur;
      T.endAt = Date.now() + T.rem;
      lastTick = 0;
      beep(880, 0.08);
    }
    saveTimers(); syncWake(); render(); ensureLoop();
  },
  treset() { T.endAt = null; T.rem = T.dur; saveTimers(); syncWake(); render(); },
  swstart() {
    unlockAudio();
    if (W.startAt) { W.acc += Date.now() - W.startAt; W.startAt = null; }
    else { W.startAt = Date.now(); beep(880, 0.06); }
    saveTimers(); syncWake(); render(); ensureLoop();
  },
  swlap() {
    if (W.startAt) W.laps.unshift(swElapsed());
    else { W.acc = 0; W.laps = []; }
    saveTimers(); render();
  },
  dismissAlarm() { stopAlarm(); },
};

/* =========================================================
   Timer & stopwatch
   ========================================================= */

const PRESETS = [[30000, '30s'], [60000, '1 min'], [120000, '2 min'], [180000, '3 min'], [300000, '5 min'], [600000, '10 min']];
const RC = 2 * Math.PI * 110;

function loadTimers() {
  try { const d = JSON.parse(localStorage.getItem(TKEY)); if (d && d.T && d.W) return d; } catch (e) { /* ignore */ }
  return { T: { dur: 60000, rem: 60000, endAt: null }, W: { acc: 0, startAt: null, laps: [] } };
}
const { T, W } = loadTimers();
function saveTimers() { try { localStorage.setItem(TKEY, JSON.stringify({ T, W })); } catch (e) { /* ignore */ } }

const tRemaining = () => (T.endAt ? Math.max(0, T.endAt - Date.now()) : T.rem);
const swElapsed = () => W.acc + (W.startAt ? Date.now() - W.startAt : 0);
const pad = (n) => String(n).padStart(2, '0');
function fmtT(ms) {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}
function fmtSW(ms) {
  const cs = Math.floor(ms / 10) % 100;
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  return (h ? `${h}:${pad(Math.floor(s / 60) % 60)}` : pad(Math.floor(s / 60))) + `:${pad(s % 60)}.${pad(cs)}`;
}

function viewTimer() {
  const mode = S.ui.tmode;
  return `
    <div class="page-head"><div class="ph-title"><div class="eyebrow">Ready, set…</div><h2>Timers</h2></div></div>
    <div class="seg">
      <button class="${mode === 'timer' ? 'on' : ''}" data-act="tmode" data-m="timer">⏳ Timer</button>
      <button class="${mode === 'stopwatch' ? 'on' : ''}" data-act="tmode" data-m="stopwatch">⏱️ Stopwatch</button>
    </div>
    <div class="card">${mode === 'stopwatch' ? swPanel() : timerPanel()}</div>`;
}

function timerPanel() {
  const running = !!T.endAt;
  const rem = tRemaining();
  const done = !running && rem === 0;
  const paused = !running && !done && rem < T.dur;
  return `
    <div class="ring-wrap ${done ? 'done' : ''}">
      <svg viewBox="0 0 260 260" aria-hidden="true">
        <defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff5d8f"/><stop offset="1" stop-color="#6c4cf5"/></linearGradient></defs>
        <circle class="ring-bg" cx="130" cy="130" r="110"/>
        <circle class="ring-fg" id="ringFg" cx="130" cy="130" r="110" stroke-dasharray="${RC}" stroke-dashoffset="0"/>
      </svg>
      <div class="ring-center">
        <div class="ring-time" id="tTime">${fmtT(rem)}</div>
        <div class="ring-sub">${running ? 'Go, go, go!' : done ? "Time's up!" : paused ? 'Paused' : 'Ready'}</div>
      </div>
    </div>
    <div class="adj">${[[-60000, '−1m'], [-10000, '−10s'], [10000, '+10s'], [60000, '+1m']]
      .map(([d, l]) => `<button data-act="tadj" data-d="${d}" ${running ? 'disabled' : ''}>${l}</button>`).join('')}</div>
    <div class="presets">${PRESETS.map(([ms, l]) => `<button class="preset ${T.dur === ms ? 'on' : ''}" data-act="tpreset" data-ms="${ms}" ${running ? 'disabled' : ''}>${l}</button>`).join('')}</div>
    <div class="ctrls">
      <button class="ctrl alt" data-act="treset">↺ Reset</button>
      <button class="ctrl ${running ? 'stop' : 'go'}" data-act="tstart">${running ? '❚❚ Pause' : done ? '↺ Again' : paused ? '▶ Resume' : '▶ Start'}</button>
    </div>
    <p class="tip">Keep the app open — iPhone pauses web apps in the background. The screen stays awake while a timer runs.</p>`;
}

function swPanel() {
  const running = !!W.startAt;
  const el = swElapsed();
  let prev = 0;
  const laps = [...W.laps].reverse().map((t, i) => { const split = t - prev; prev = t; return { n: i + 1, t, split }; }).reverse();
  return `
    <div class="sw-face ${running ? 'run' : ''}"><div class="sw-time" id="swTime">${fmtSW(el)}</div></div>
    <div class="ctrls">
      <button class="ctrl alt" data-act="swlap" ${!running && el === 0 ? 'disabled' : ''}>${running ? '🚩 Lap' : '↺ Reset'}</button>
      <button class="ctrl ${running ? 'stop' : 'go'}" data-act="swstart">${running ? '■ Stop' : el ? '▶ Resume' : '▶ Start'}</button>
    </div>
    ${laps.length ? `<ul class="laps">${laps.map((l) => `<li><span>Lap ${l.n}</span><span><span class="split">+${fmtSW(l.split)}</span>${fmtSW(l.t)}</span></li>`).join('')}</ul>` : ''}`;
}

let raf = 0;
let lastTick = 0;
function ensureLoop() { if (!raf) raf = requestAnimationFrame(loop); }
function loop() {
  raf = 0;
  checkTimer();
  tickDisplays();
  if (T.endAt || W.startAt) raf = requestAnimationFrame(loop);
}
function checkTimer() {
  if (!T.endAt) return;
  const rem = T.endAt - Date.now();
  if (rem <= 0) {
    const late = -rem;
    T.endAt = null; T.rem = 0;
    saveTimers(); syncWake();
    if (S.ui.tab === 'timer') render(); else updatePill();
    if (late < 60000) startAlarm();
    return;
  }
  const s = Math.ceil(rem / 1000);
  if (s <= 5 && s !== lastTick) { lastTick = s; beep(660, 0.07, 0, 'square', 0.12); }
}
function tickDisplays() {
  const tt = $('#tTime');
  if (tt) {
    const rem = tRemaining();
    tt.textContent = fmtT(rem);
    tt.classList.toggle('hurry', !!T.endAt && rem <= 10000);
    const fg = $('#ringFg');
    if (fg) fg.style.strokeDashoffset = String(RC * (1 - (T.dur ? rem / T.dur : 0)));
  }
  const sw = $('#swTime');
  if (sw) sw.textContent = fmtSW(swElapsed());
  const pt = $('#pillT');
  if (pt) pt.textContent = fmtT(tRemaining());
  const pw = $('#pillW');
  if (pw) pw.textContent = fmtSW(swElapsed()).slice(0, -1);
}
function updatePill() {
  const p = $('#pill');
  const show = S.ui.tab !== 'timer' && (T.endAt || W.startAt);
  p.hidden = !show;
  p.innerHTML = show
    ? `${T.endAt ? `<button data-act="tab" data-tab="timer" data-m="timer">⏳ <span id="pillT"></span></button>` : ''}${W.startAt ? `<button data-act="tab" data-tab="timer" data-m="stopwatch">⏱️ <span id="pillW"></span></button>` : ''}`
    : '';
}

/* Sound */
let actx = null;
function unlockAudio() {
  try {
    if (!actx) { const C = window.AudioContext || window.webkitAudioContext; if (C) actx = new C(); }
    if (actx && actx.state === 'suspended') actx.resume();
  } catch (e) { /* ignore */ }
  return actx;
}
function beep(freq = 880, dur = 0.15, when = 0, type = 'sine', vol = 0.3) {
  const a = actx;
  if (!a) return;
  const t = a.currentTime + when;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}
function fanfare() {
  unlockAudio();
  [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.22, i * 0.14, 'triangle', 0.25));
}
let alarmTimer = 0;
function startAlarm() {
  $('#alarm').hidden = false;
  let n = 0;
  const ring = () => {
    [0, 0.18, 0.36].forEach((w) => beep(988, 0.14, w, 'square', 0.18));
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    if (++n >= 20) clearInterval(alarmTimer);
  };
  clearInterval(alarmTimer);
  ring();
  alarmTimer = setInterval(ring, 1200);
}
function stopAlarm() {
  clearInterval(alarmTimer);
  $('#alarm').hidden = true;
  T.rem = T.dur;
  saveTimers();
  if (S.ui.tab === 'timer') render();
}

/* Keep screen awake while timing */
let wakeLock = null;
async function syncWake() {
  const want = !!(T.endAt || W.startAt);
  try {
    if (want && !wakeLock && 'wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!want && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch (e) { wakeLock = null; }
}

/* =========================================================
   Backup
   ========================================================= */

async function exportData() {
  const data = JSON.stringify({ app: 'family-game-night', version: 1, exportedAt: new Date().toISOString(),
    players: S.players, games: S.games, history: S.history, night: S.night }, null, 2);
  const name = `game-night-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([data], name, { type: 'application/json' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Game Night Backup' });
      return;
    }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

$('#importFile').addEventListener('change', async (e) => {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (!Array.isArray(d.players) || !Array.isArray(d.games) || !Array.isArray(d.history)) throw new Error('bad file');
    const ok = await confirmBox('Restore this backup?',
      `It has ${d.players.length} players, ${d.games.length} games and ${d.history.length} past game nights. This replaces what's on this phone now.`, 'Restore', false);
    if (!ok) return;
    Object.assign(S, { players: d.players, games: d.games, history: d.history, night: d.night || null });
    SETUP = null;
    save(); render();
    toast('✅ Backup restored!');
  } catch (err) {
    toast("⚠️ That doesn't look like a Game Night backup file");
  }
});

/* =========================================================
   Little extras
   ========================================================= */

let toastTimer = 0;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

function confetti(dur = 2500) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = $('#confetti');
  const ctx = c.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const W0 = document.body.clientWidth, H0 = document.body.clientHeight;
  c.width = W0 * dpr; c.height = H0 * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.style.display = 'block';
  const colors = ['#ff5d8f', '#ffc43d', '#2fcf8f', '#2bb6f0', '#6c63ff', '#ff8a3d', '#ffffff'];
  const parts = Array.from({ length: 170 }, () => ({
    x: Math.random() * W0, y: -20 - Math.random() * H0 * 0.6,
    w: 6 + Math.random() * 6, h: 8 + Math.random() * 8,
    vx: -2 + Math.random() * 4, vy: 2 + Math.random() * 4,
    r: Math.random() * 6, vr: -0.2 + Math.random() * 0.4,
    c: colors[(Math.random() * colors.length) | 0],
  }));
  const start = performance.now();
  (function frame(now) {
    ctx.clearRect(0, 0, W0, H0);
    parts.forEach((p) => {
      p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.r += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
      ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });
    if (now - start < dur + 1500) requestAnimationFrame(frame);
    else { ctx.clearRect(0, 0, W0, H0); c.style.display = 'none'; }
  })(start);
}

/* =========================================================
   Events & startup
   ========================================================= */

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = A[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el, e); }
});

document.addEventListener('input', (e) => {
  const t = e.target;
  if (!t.matches('input.score, input.rscore')) return;
  const s = cleanNum(t.value);
  if (s !== t.value) t.value = s;
  if (t.classList.contains('rscore')) setRound(t.dataset.g, +t.dataset.k, t.dataset.p, s);
  else setScore(t.dataset.g, t.dataset.p, s);
});

// Tap a score box → its number is selected, so typing replaces it (easy fixes).
document.addEventListener('focusin', (e) => {
  const t = e.target;
  if (!t.matches || !t.matches('input.score, input.rscore')) return;
  if (t.classList.contains('rscore')) lastRoundInput = t;
  setTimeout(() => {
    try {
      if (t.value && t.value !== '-') t.setSelectionRange(0, t.value.length);
      else t.setSelectionRange(t.value.length, t.value.length);
    } catch (err) { /* ignore */ }
  }, 0);
});

// The ± button shouldn't steal focus from the score box (keeps the keyboard up).
document.addEventListener('mousedown', (e) => { if (e.target.closest('.pm, .neg')) e.preventDefault(); });

// First touch anywhere unlocks sound on iPhone.
document.addEventListener('pointerdown', unlockAudio, { once: true, capture: true });

function scrollViewTop() {
  const v = $('#view');
  if (v) v.scrollTop = 0;
}

// iPhone slides the whole page up to make room for the keyboard and sometimes
// doesn't slide it back. Put it back whenever the keyboard goes away.
function resetPageShift() {
  if (window.scrollY || document.documentElement.scrollTop || document.body.scrollTop) {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }
}
document.addEventListener('focusout', () => {
  setTimeout(() => {
    const a = document.activeElement;
    if (!a || !a.matches || !a.matches('input, textarea')) resetPageShift();
  }, 120);
});

// Keep pop-up sheets above the on-screen keyboard.
if (window.visualViewport) {
  const vv = window.visualViewport;
  const upd = () => {
    const kb = Math.max(0, document.body.clientHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty('--kb', kb + 'px');
    if (kb === 0) resetPageShift();
  };
  vv.addEventListener('resize', upd);
  vv.addEventListener('scroll', upd);
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    checkTimer();
    syncWake();
    ensureLoop();
    tickDisplays();
  }
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

// A timer that finished while the app was closed just shows as done (no surprise alarm later).
if (T.endAt && T.endAt <= Date.now()) { T.endAt = null; T.rem = 0; saveTimers(); }

render();
ensureLoop();
syncWake();
