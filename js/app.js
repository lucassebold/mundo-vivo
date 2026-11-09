/* Mundo Vivo (cliente): recebe a simulação do servidor ao vivo, suaviza o movimento e mostra a protagonista. */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var cv = $('world'), ctx = cv.getContext('2d'), bcv = $('brain');
  var W = 0, H = 0, dpr = 1;
  var cam = { x: Sim.W / 2, y: Sim.H / 2, z: 1 };
  var view = { t: 0, sp: 1, snapAt: 0, creatures: {}, list: [], foods: [], preds: [], patches: [], prot: null, st: null, ev: null, lastSnapPerf: 0, connected: false };
  var state = { brainOn: true, sayPri: -1, sayUntil: 0, bubble: { i: 'search', c: '#a9b6d8' }, frame: 0, lastUi: 0, stageOf: null, stage: null, overlay: false, lastFrame: 0 };

  document.querySelectorAll('[data-ic]').forEach(function (el) { el.insertAdjacentHTML('afterbegin', Icons.svg(el.getAttribute('data-ic'), 15, Icons.COLOR.accent)); });
  $('cAvatar').innerHTML = Icons.svg('search', 26, Icons.COLOR.muted);

  function resize() { dpr = window.devicePixelRatio || 1; W = window.innerWidth; H = window.innerHeight; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  window.addEventListener('resize', function () { resize(); if (view.connected) draw(performance.now()); }); resize();

  // ---------- Feed ----------
  var FEED_COLOR = { good: Icons.COLOR.good, bad: Icons.COLOR.danger, world: Icons.COLOR.accent, '': Icons.COLOR.info };
  function feed(icon, text, cls) {
    var box = $('feed'), d = document.createElement('div');
    d.className = 'fl ' + (cls || '');
    d.innerHTML = Icons.svg(icon, 16, FEED_COLOR[cls || ''] || Icons.COLOR.info) + '<span></span>';
    d.lastChild.textContent = text;
    box.appendChild(d);
    while (box.children.length > 4) box.removeChild(box.firstChild);
    setTimeout(function () { d.classList.add('out'); }, 7000);
    setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 7700);
  }

  // ---------- Mensagens vindas do servidor ----------
  var CAUSE = { fome: 'from lack of nutrients', predador: 'swallowed by an amoeba', velhice: 'of old age after a long life' };
  function onMsg(m) {
    if (m.k === 'prot') {
      $('overlay').hidden = true; state.overlay = false; state.sayPri = -1; state.sayUntil = 0;
      feed('dna', 'Now following ' + m.name + ' #' + m.id + (m.from ? ', descendant of ' + m.from : '') + ' (' + (m.gen <= 1 ? 'first generation' : 'generation ' + m.gen) + ')', 'good');
    } else if (m.k === 'death') {
      var o = $('overlay');
      o.innerHTML = '<h2>' + Icons.svg('skull', 28, Icons.COLOR.danger) + ' ' + m.name + ' died</h2><p>' + (m.cause === 'predador' ? 'Swallowed by an amoeba' : m.cause === 'fome' ? 'Died from lack of nutrients' : 'Died of old age after a long life') + ' after ' + m.age + ' s of life.</p>' +
        '<p>Absorbed ' + m.eaten + ' nutrients · ' + m.kids + ' cell division' + (m.kids === 1 ? '' : 's') + ' · ' + m.escapes + ' escape' + (m.escapes === 1 ? '' : 's') + '</p>' +
        '<div class="next">' + (m.desc ? 'Its lineage continues with ' + m.nextName + '…' : 'Looking for another bacterium to follow…') + '</div>';
      o.hidden = false; state.overlay = true;
      feed('skull', m.name + ' died ' + (CAUSE[m.cause] || ''), 'bad');
    } else if (m.k === 'birth') feed('heart', m.name + ' divided: a daughter cell was born', 'good');
    else if (m.k === 'escape') feed('escape', m.name + ' escaped from an amoeba', 'good');
    else if (m.k === 'world') feed(m.icon || 'globe', m.text, 'world');
    else if (m.k === 'gen') feed('dna', 'Generation ' + m.gen + ' was born', '');
    else if (m.k === 'life') feed('trend', 'Average cell lifespan: ' + m.avg + ' s (at the start: ' + m.base + ' s)', m.avg >= m.base ? 'good' : '');
  }

  // ---------- Recebendo snapshots ----------
  function angLerp(a, b, k) { var d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * k; }

  // Os snapshots chegam ~7x por segundo; o movimento é reproduzido com um pequeno atraso fixo (DELAY),
  // interpolando entre dois snapshots reais. Assim não há paradas nem trancos quando a rede oscila.
  var snaps = [], clock = { off: null }, DELAY = .45;

  function onSnap(s, now) {
    var first = !view.connected;
    view.connected = true;
    if (snaps.length && s.t < snaps[snaps.length - 1].t - 1) { snaps.length = 0; clock.off = null; }   // servidor reiniciou
    view.lastSnapPerf = now; view.t = s.t; view.st = s.st; view.ev = s.ev; view.viewers = s.viewers; view.sp = s.sp || 1;

    var map = {}, pm = {}, i, a, c, id;
    for (i = 0; i < s.cs.length; i++) map[s.cs[i][0]] = s.cs[i];
    for (i = 0; i < s.ps.length; i++) pm[s.ps[i][0]] = s.ps[i];
    snaps.push({ t: s.t, map: map, ps: pm, fs: s.fs });
    if (snaps.length > 10) snaps.shift();

    // relógio de reprodução: acompanha as chegadas mais cedo (o mais fiel ao servidor) e ignora atrasos pontuais
    var cand = s.t - (now / 1000) * view.sp - DELAY * view.sp;
    if (clock.off === null) clock.off = cand; else clock.off += (cand - clock.off) * (cand > clock.off ? .15 : .01);

    for (i = 0; i < s.cs.length; i++) {
      a = s.cs[i]; c = view.creatures[a[0]];
      if (!c) c = view.creatures[a[0]] = { id: a[0], x: a[1], y: a[2], a: a[3], alive: true, trail: [], near: { food: null, pred: null }, g: {}, inp: [0, 0, 0, 0, 0, 0, 0, 0], hid: [], out: [0, 0], brain: [] };
      c.r = a[4]; c.g.hue = a[5]; c.g.vision = a[6]; c.speed = a[7]; c.e = a[8]; c.age = a[9];
    }
    for (id in view.creatures) if (!map[id]) { if (view.prot && view.prot.id === +id) view.prot.alive = false; delete view.creatures[id]; }
    view.list = []; for (id in view.creatures) view.list.push(view.creatures[id]);

    // amebas (por id, para interpolar certo mesmo quando entram e saem)
    var oldP = {}; view.preds.forEach(function (q) { oldP[q.id] = q; });
    view.preds = s.ps.map(function (p) { return oldP[p[0]] || { id: p[0], x: p[1], y: p[2], a: p[3], r: 13, state: 'wander' }; });
    view.patches = s.pt.map(function (p) { return { x: p[0], y: p[1], r: p[2] }; });

    var pr = s.pr;
    if (pr) {
      var pc = view.creatures[pr.id] || (view.prot && view.prot.id === pr.id ? view.prot : null);
      if (!pc) pc = { id: pr.id, x: cam.x, y: cam.y, a: 0, r: 6, trail: [], g: {}, speed: 0 };
      view.prot = pc;
      pc.alive = pr.alive; pc.name = pr.name; pc.gen = pr.gen; pc.eaten = pr.eaten; pc.kids = pr.kids; pc.escapes = pr.escapes; pc.mut = pr.mut; pc.straight = pr.straight; pc.thrust = pr.thrust;
      pc.inp = pr.inp; pc.hid = pr.hid; pc.out = pr.out; pc.brain = pr.brain; pc.e = pr.e; pc.age = pr.age; pc.g.vision = pr.vision; pc.g.hue = pr.hue;
      pc.near = { food: pr.near.food ? { dx: pr.near.food[0], dy: pr.near.food[1] } : null, pred: pr.near.pred ? { dx: pr.near.pred[0], dy: pr.near.pred[1], d: pr.near.pred[2] } : null };
      pc.lastAte = pr.lastAte; pc.lastKid = pr.lastKid; pc.lastEscape = pr.lastEscape;
      if (first) { cam.x = pc.x; cam.y = pc.y; }
    }
    for (i = 0; i < s.msgs.length; i++) onMsg(s.msgs[i]);
  }

  // ---------- Narração (descreve o estado real da criatura) ----------
  function narrate(c, now) {
    var t = view.t, r, C = Icons.COLOR;
    if (c.near.pred && c.near.pred.d < 120) r = { pri: 5, i: 'alert', c: C.danger, s: 'Danger! An amoeba is close.' };
    else if (t - c.lastEscape < 3) r = { pri: 5, i: 'escape', c: C.good, s: 'Escaped the amoeba by a hair!' };
    else if (t - c.lastKid < 3.5) r = { pri: 4, i: 'heart', c: C.danger, s: 'Divided! ' + c.kids + ' daughter cell' + (c.kids === 1 ? '' : 's') + ' so far.' };
    else if (t - c.lastAte < 1.6) r = { pri: 3, i: 'leaf', c: C.good, s: 'Absorbed nutrients! Energy at ' + Math.round(c.e / Sim.MAXE * 100) + '%.' };
    else if (c.e < 35) r = { pri: 2, i: 'battery', c: C.accent, s: 'Almost out of energy. It needs nutrients soon.' };
    else if (c.straight < .35 && c.age > 8) r = { pri: 1, i: 'spiral', c: C.info, s: 'Going in circles: its brain has not learned to head straight for nutrients yet.' };
    else if (c.near.food && c.inp[0] > .5 && c.thrust > .25) r = { pri: 1, i: 'target', c: C.gold, s: 'Sensed nutrients and is heading for them.' };
    else if (c.near.food && c.inp[0] < -.3) r = { pri: 1, i: 'away', c: C.muted, s: 'There were nutrients nearby, but it went the other way.' };
    else if (c.age < Sim.MATURE) r = { pri: 0, i: 'sprout', c: C.good, s: 'Young cell: growing and learning to find nutrients.' };
    else if (c.age > 200) r = { pri: 0, i: 'hourglass', c: C.muted, s: 'In senescence: slower, but still searching for nutrients.' };
    else r = { pri: 0, i: 'search', c: C.muted, s: 'Exploring the medium in search of nutrients.' };
    if (r.pri >= state.sayPri || now > state.sayUntil) {
      if (r.s !== $('cSay').textContent) { $('cSay').textContent = r.s; state.sayUntil = now + 1900; }
      state.sayPri = r.pri; state.bubble = { i: r.i, c: r.c }; $('cAvatar').innerHTML = Icons.svg(r.i, 26, r.c);
    }
    if (now > state.sayUntil) state.sayPri = -1;
  }

  function dirText(fwd, side) { return fwd > .55 ? 'ahead' : fwd < -.55 ? 'behind' : side > 0 ? 'to the right' : 'to the left'; }
  function brainCaption(c) {
    var seen = [];
    if (c.near.pred) seen.push('<b>amoeba ' + dirText(c.inp[3], c.inp[4]) + '</b>');
    if (c.near.food) seen.push('<b>nutrient ' + dirText(c.inp[0], c.inp[1]) + '</b>');
    var turn = c.out[0], acc = Math.round((c.out[1] + 1) / 2 * 100);
    var act = (Math.abs(turn) < .15 ? '<b>go straight</b>' : '<b>turn ' + (turn > 0 ? 'right' : 'left') + '</b>') + ' and <b>' + (acc > 66 ? 'speed up hard' : acc > 33 ? 'move slowly' : 'almost stop') + '</b>';
    return (seen.length ? 'Senses ' + seen.join(' and ') : 'Senses nothing nearby') + ' &rarr; decides to ' + act + '.';
  }

  // ---------- Interface ----------
  function fmtTime(t) { return t < 3600 ? Math.max(1, Math.round(t / 60)) + ' min' : t < 86400 ? (t / 3600).toFixed(1) + ' h' : (t / 86400).toFixed(1) + ' days'; }
  function ui(now) {
    var s = view.st, p = view.prot;
    var live = view.connected && now - view.lastSnapPerf < 4000;
    $('liveTx').textContent = live ? 'LIVE' : 'reconnecting…';
    $('live').classList.toggle('off', !live);
    $('viewers').textContent = view.viewers || 1;
    $('evChip').hidden = !view.ev; if (view.ev) $('evChip').textContent = 'Event: ' + view.ev;
    if (s) {
      $('stGen').textContent = s.gen; $('stPop').textContent = s.pop;
      $('stLife').textContent = s.avgLife ? s.avgLife + ' s' : '–';
      $('stLifeBase').textContent = s.baseLife ? (s.avgLife >= s.baseLife ? '▲' : '▼') + ' at start: ' + s.baseLife + ' s' : 'measuring…';
      $('stTime').textContent = fmtTime(view.t);
    }
    if (!p) return;
    if (p.alive) { $('brainCap').innerHTML = brainCaption(p); $('bnM').textContent = p.mut; $('bnG').textContent = p.gen; $('bnW').textContent = p.brain.length; }
    $('cName').textContent = p.name + ' #' + p.id;
    $('cGenus').textContent = (window.GENUS && GENUS[p.name]) ? 'Real genus: ' + GENUS[p.name] : '';
    $('cSub').textContent = (p.gen <= 1 ? 'first generation' : 'generation ' + p.gen) + ' · speed ' + Math.round(p.speed || 0) + ' now';
    $('cAge').textContent = Math.round(p.age) + ' s';
    var stage = p.age < Sim.MATURE ? 'young' : p.age < 200 ? 'mature' : 'senescent';
    $('cStage').textContent = 'stage: ' + stage;
    if (state.stageOf !== p.id) { state.stageOf = p.id; state.stage = stage; }
    else if (stage !== state.stage) { state.stage = stage; feed(stage === 'mature' ? 'cake' : 'hourglass', stage === 'mature' ? p.name + ' matured and can now divide' : p.name + ' entered senescence', ''); }
    var pct = Math.max(0, Math.min(1, p.e / Sim.MAXE)) * 100;
    $('cEnergy').style.width = pct + '%'; $('cEnergyTx').textContent = 'energy ' + Math.round(pct) + '%';
    $('cEat').textContent = p.eaten; $('cKids').textContent = p.kids; $('cEsc').textContent = p.escapes;
  }

  // ---------- Desenho ----------
  var foodSrc = null;
  function interpolate(now) {
    var n = snaps.length;
    if (!n || clock.off === null) return;
    var T = now / 1000 * view.sp + clock.off, lo = 0, hi, i, k, A, B, c, span;
    for (i = 0; i < n; i++) if (snaps[i].t <= T) lo = i;
    hi = Math.min(n - 1, lo + 1);
    var sa = snaps[lo], sb = snaps[hi];
    span = sb.t - sa.t;
    k = span > 1e-6 ? Math.max(0, Math.min(1, (T - sa.t) / span)) : 0;
    // sem snapshot mais novo (rede travou): extrapola um pouco, em vez de parar
    var ex = 0, prev = null;
    if (lo === n - 1 && n > 1) { prev = snaps[n - 2]; ex = Math.min(.4 * view.sp, Math.max(0, T - sa.t)); }

    function place(o, A, B, ia, ib) {
      var x, y, ang;
      if (A && B) { x = A[ia] + (B[ia] - A[ia]) * k; y = A[ia + 1] + (B[ia + 1] - A[ia + 1]) * k; ang = angLerp(A[ia + 2], B[ia + 2], k); }
      else { var S = B || A; if (!S) return; x = S[ia]; y = S[ia + 1]; ang = S[ia + 2]; }
      o.x = x; o.y = y; o.a = ang;
    }
    for (i = 0; i < view.list.length; i++) {
      c = view.list[i]; A = sa.map[c.id]; B = sb.map[c.id];
      if (prev && B && prev.map[c.id] && sb.t > prev.t) {
        var P = prev.map[c.id], f = ex / (sb.t - prev.t);
        c.x = B[1] + (B[1] - P[1]) * f; c.y = B[2] + (B[2] - P[2]) * f; c.a = B[3];
      } else place(c, A, B, 1, 1);
    }
    for (i = 0; i < view.preds.length; i++) { c = view.preds[i]; place(c, sa.ps[c.id], sb.ps[c.id], 1, 1); var st = (sb.ps[c.id] || sa.ps[c.id]); if (st) c.state = st[4] === 1 ? 'chase' : st[4] === 2 ? 'rest' : 'wander'; }
    if (foodSrc !== sa) {
      foodSrc = sa;
      view.foods = sa.fs.map(function (f) { return { x: f[0], y: f[1], ph: (f[0] * 13 + f[1] * 7) % 6.28 }; });
    }
    var p = view.prot;
    if (p && p.alive && (!p.lastTrail || now - p.lastTrail > 140)) { p.lastTrail = now; p.trail.push(p.x, p.y); if (p.trail.length > 70) p.trail.splice(0, 2); }
  }
  function camera(dt) {
    var p = view.prot, z = Math.max(W / 1000, H / 640, W / Sim.W, H / Sim.H);
    var kc = 1 - Math.exp(-dt * 3.2);
    cam.z += (z - cam.z) * kc;
    if (p) { cam.x += (p.x - cam.x) * kc; cam.y += (p.y - cam.y) * kc; }
    var hw = W / (2 * cam.z), hh = H / (2 * cam.z);
    cam.x = hw * 2 >= Sim.W ? Sim.W / 2 : Math.max(hw, Math.min(Sim.W - hw, cam.x));
    cam.y = hh * 2 >= Sim.H ? Sim.H / 2 : Math.max(hh, Math.min(Sim.H - hh, cam.y));
  }
  function draw(ts) {
    var p = view.prot;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    Render.world(ctx, W, H, { patches: view.patches, foods: view.foods, creatures: view.list, preds: view.preds }, cam, p, ts / 1000, p && p.alive ? state.bubble : null);
  }
  function frame(ts) {
    requestAnimationFrame(frame);
    if (window.innerWidth !== W || window.innerHeight !== H) resize();
    var dt = Math.min(.1, (ts - (state.lastFrame || ts)) / 1000); state.lastFrame = ts;
    if (!view.connected) { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#02030a'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = 'rgba(205,218,255,.7)'; ctx.font = '600 18px Outfit, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('Connecting to the world…', W / 2, H / 2); return; }
    interpolate(ts);
    var p = view.prot;
    if (p && p.alive && !state.overlay) narrate(p, ts);
    camera(dt);
    draw(ts);
    state.frame++;
    if (state.brainOn && state.frame % 2 === 0) Render.brain(bcv, p && p.alive ? p : null, ts / 1000);
    if (ts - state.lastUi > 200) { state.lastUi = ts; ui(ts); }
  }

  // ---------- Legenda ----------
  var legendOn = true;
  function drawLegend(t) {
    var cs = document.querySelectorAll('#legendBody canvas'), i, k, g, c2, cx = 42, cy = 24;
    for (i = 0; i < cs.length; i++) {
      k = cs[i].getAttribute('data-k'); c2 = cs[i].getContext('2d'); c2.clearRect(0, 0, 84, 48);
      var bact = { x: cx, y: cy, a: .15, r: 6.5, speed: 60, e: 100, id: 3, g: { hue: 170, vision: 130 } };
      if (k === 'bact') Render.creature(c2, bact, t);
      else if (k === 'prot') {
        g = c2.createRadialGradient(cx, cy, 2, cx, cy, 26); g.addColorStop(0, 'rgba(255,200,140,.5)'); g.addColorStop(1, 'rgba(255,176,112,0)');
        c2.fillStyle = g; c2.beginPath(); c2.arc(cx, cy, 26, 0, 6.3); c2.fill(); Render.creature(c2, bact, t, { prot: true });
      } else if (k === 'nutri') { Render.nutrient(c2, 28, 24, 6, 0); Render.nutrient(c2, 52, 16, 5, 1); Render.nutrient(c2, 58, 32, 5, 2); }
      else if (k === 'ameba') Render.pred(c2, { x: cx, y: cy, r: 8, state: 'wander' }, t);
      else if (k === 'range') {
        c2.strokeStyle = 'rgba(255,217,168,.45)'; c2.setLineDash([4, 4]); c2.lineWidth = 1.4; c2.beginPath(); c2.arc(cx, cy, 21, 0, 6.3); c2.stroke(); c2.setLineDash([]);
        c2.strokeStyle = 'rgba(166,255,143,.8)'; c2.beginPath(); c2.moveTo(cx, cy); c2.lineTo(cx + 17, cy - 9); c2.stroke();
        c2.strokeStyle = 'rgba(255,90,90,.85)'; c2.beginPath(); c2.moveTo(cx, cy); c2.lineTo(cx - 14, cy + 11); c2.stroke();
        Render.creature(c2, { x: cx, y: cy, a: 0, r: 4.5, speed: 0, e: 100, id: 3, g: { hue: 170, vision: 130 } }, t);
        Render.nutrient(c2, cx + 17, cy - 9, 3.5, 0);
      } else if (k === 'div') {
        Render.creature(c2, { x: 24, y: 24, a: 0, r: 5, speed: 0, e: 100, id: 3, g: { hue: 170, vision: 130 } }, t);
        c2.fillStyle = 'rgba(255,255,255,.55)'; c2.font = '700 14px Outfit, sans-serif'; c2.textAlign = 'center'; c2.fillText('→', 42, 28);
        Render.creature(c2, { x: 62, y: 15, a: -.2, r: 4, speed: 0, e: 100, id: 4, g: { hue: 175, vision: 130 } }, t);
        Render.creature(c2, { x: 62, y: 33, a: .2, r: 4, speed: 0, e: 100, id: 5, g: { hue: 165, vision: 130 } }, t);
      }
    }
  }
  setInterval(function () { if (legendOn) drawLegend(performance.now() / 1000); }, 90);
  $('legendBtn').onclick = function () {
    legendOn = !legendOn; $('legend').classList.toggle('min', !legendOn); $('legendArrow').textContent = legendOn ? 'hide' : 'show';
    try { localStorage.setItem('mv.legend', legendOn ? '1' : '0'); } catch (e) {}
  };
  try { if (localStorage.getItem('mv.legend') === '0') { legendOn = false; $('legend').classList.add('min'); $('legendArrow').textContent = 'show'; } } catch (e) {}

  // ---------- Controles ----------
  $('brainBig').onclick = function () { var big = $('brainBox').classList.toggle('big'); $('brainBig').textContent = big ? 'shrink' : 'enlarge'; };
  $('brainToggle').onclick = function () {
    state.brainOn = !state.brainOn;
    $('brainBox').classList.toggle('min', !state.brainOn);
    $('brainBig').hidden = !state.brainOn;
    $('brainToggle').textContent = state.brainOn ? 'hide' : 'show';
  };
  $('introClose').onclick = function () { $('intro').hidden = true; try { localStorage.setItem('mv.intro', '1'); } catch (e) {} };
  try { if (localStorage.getItem('mv.intro')) $('intro').hidden = true; } catch (e) {}
  setTimeout(function () { $('intro').hidden = true; }, 30000);

  // ---------- Conexão ----------
  function connect() {
    var es = new EventSource('/stream');
    es.onmessage = function (e) { try { onSnap(JSON.parse(e.data), performance.now()); } catch (err) { if (window.console) console.error(err); } };
  }
  window.MV = { view: view, state: state, onSnap: onSnap };
  if (!window.__NO_STREAM) connect();
  requestAnimationFrame(frame);
})();
