/* Mundo Vivo: roda a simulação, escolhe a protagonista, narra o que ela faz e mostra tudo na tela. */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var cv = $('world'), ctx = cv.getContext('2d'), bcv = $('brain');
  var DT = 1 / 20;
  var world = Sim.create(Math.floor(Math.random() * 1e9));
  var state = { speed: 1, acc: 0, last: 0, prot: null, next: null, switchAt: 0, overlayUntil: 0, brainOn: true, sayPri: -1, sayUntil: 0, bubble: { i: 'search', c: '#a9b6d8' }, lastUi: 0, frame: 0, milestone: 1, lifeNote: 180 };
  document.querySelectorAll('[data-ic]').forEach(function (el) { el.insertAdjacentHTML('afterbegin', Icons.svg(el.getAttribute('data-ic'), 15, Icons.COLOR.accent)); });
  $('cAvatar').innerHTML = Icons.svg('search', 26, Icons.COLOR.muted);
  var cam = { x: Sim.W / 2, y: Sim.H / 2, z: 1 };
  var W = 0, H = 0, dpr = 1;

  function resize() {
    dpr = window.devicePixelRatio || 1; W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  }
  window.addEventListener('resize', function () { resize(); if (typeof draw === 'function') draw(state.last); }); resize();

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

  // ---------- Protagonista ----------
  function parentLabel(c) {
    if (c.gen <= 1) return 'da primeira geração';
    return 'geração ' + c.gen;
  }
  function setProt(c, descendantOf) {
    state.prot = c; state.sayPri = -1; state.sayUntil = 0;
    feed('dna', 'Agora você acompanha ' + c.name + (descendantOf ? ', descendente de ' + descendantOf.name : '') + ' (' + parentLabel(c) + ')', 'good');
  }

  var CAUSE = { fome: 'de fome', predador: 'pega por um predador', velhice: 'de velhice, depois de uma vida longa' };
  function protDied(c, cause) {
    var next = Sim.pickProtagonist(world, c);
    state.next = next; state.switchAt = state.last + 3300; state.overlayUntil = state.switchAt;
    var o = $('overlay');
    o.innerHTML = '<h2>' + Icons.svg('skull', 28, Icons.COLOR.danger) + ' ' + c.name + ' morreu</h2><p>' + (cause === 'predador' ? 'Foi pega por um predador' : cause === 'fome' ? 'Morreu de fome' : 'Morreu de velhice, depois de uma vida longa') + ' depois de ' + Math.round(c.age) + ' s de vida.</p>' +
      '<p>Comeu ' + c.eaten + ' vezes · ' + c.kids + ' filhote' + (c.kids === 1 ? '' : 's') + ' · ' + c.escapes + ' fuga' + (c.escapes === 1 ? '' : 's') + '</p>' +
      '<div class="next">' + (next.descendant ? 'Sua linhagem continua com ' + next.c.name + '…' : 'Procurando outra criatura para acompanhar…') + '</div>';
    o.hidden = false;
    feed('skull', c.name + ' morreu ' + (CAUSE[cause] || ''), 'bad');
  }

  // ---------- Narração (descreve o estado real da criatura) ----------
  function narrate(c, now) {
    var t = world.t, r;
    if (c.near.pred && c.near.pred.d < 120) r = { pri: 5, i: 'alert', c: Icons.COLOR.danger, s: 'Perigo! Tem um predador perto dela.' };
    else if (t - c.lastEscape < 3) r = { pri: 5, i: 'escape', c: Icons.COLOR.good, s: 'Escapou do predador por pouco!' };
    else if (t - c.lastKid < 3.5) r = { pri: 4, i: 'heart', c: Icons.COLOR.danger, s: 'Teve um filhote! São ' + c.kids + ' até agora.' };
    else if (t - c.lastAte < 1.6) r = { pri: 3, i: 'leaf', c: Icons.COLOR.good, s: 'Comeu! Energia em ' + Math.round(c.e / Sim.MAXE * 100) + '%.' };
    else if (c.e < 35) r = { pri: 2, i: 'battery', c: Icons.COLOR.accent, s: 'Quase sem energia. Precisa achar comida logo.' };
    else if (c.straight < .35 && c.age > 8) r = { pri: 1, i: 'spiral', c: Icons.COLOR.info, s: 'Dando voltas: o cérebro dela ainda não aprendeu a seguir reto até a comida.' };
    else if (c.near.food && c.inp[0] > .5 && c.thrust > .25) r = { pri: 1, i: 'target', c: Icons.COLOR.gold, s: 'Viu comida e está indo atrás.' };
    else if (c.near.food && c.inp[0] < -.3) r = { pri: 1, i: 'away', c: Icons.COLOR.muted, s: 'Tinha comida por perto, mas foi pro outro lado.' };
    else if (c.age < Sim.MATURE) r = { pri: 0, i: 'sprout', c: Icons.COLOR.good, s: 'Ainda é filhote: crescendo e aprendendo a achar comida.' };
    else if (c.age > 200) r = { pri: 0, i: 'hourglass', c: Icons.COLOR.muted, s: 'Já está velha: mais lenta, mas ainda procurando comida.' };
    else r = { pri: 0, i: 'search', c: Icons.COLOR.muted, s: 'Explorando em busca de comida.' };
    if (r.pri >= state.sayPri || now > state.sayUntil) {
      if (r.s !== $('cSay').textContent) { $('cSay').textContent = r.s; state.sayUntil = now + 1900; }
      state.sayPri = r.pri; state.bubble = { i: r.i, c: r.c }; $('cAvatar').innerHTML = Icons.svg(r.i, 26, r.c);
    }
    if (now > state.sayUntil) state.sayPri = -1;
  }

  // ---------- Mensagens do mundo ----------
  function drain() {
    var i, m, p = state.prot;
    for (i = 0; i < world.msgs.length; i++) {
      m = world.msgs[i];
      if (m.type === 'death' && p && m.c === p && !state.next) protDied(m.c, m.cause);
      else if (m.type === 'birth' && p && m.c === p) feed('heart', p.name + ' teve um filhote', 'good');
      else if (m.type === 'escape' && p && m.c === p) feed('escape', p.name + ' escapou de um predador', 'good');
      else if (m.type === 'event') feed('globe', m.text, 'world');
      else if (m.type === 'event-end') feed('globe', m.text, 'world');
      else if (m.type === 'rescue') feed('seed', m.text, 'world');
    }
    world.msgs.length = 0;
  }

  // ---------- Câmera ----------
  function camera(dt) {
    var p = state.prot, z = Math.max(W / 1000, H / 640, W / Sim.W, H / Sim.H);
    cam.z += (z - cam.z) * Math.min(1, dt * 3);
    if (p) { cam.x += (p.x - cam.x) * Math.min(1, dt * 3); cam.y += (p.y - cam.y) * Math.min(1, dt * 3); }
    var hw = W / (2 * cam.z), hh = H / (2 * cam.z);
    cam.x = hw * 2 >= Sim.W ? Sim.W / 2 : Math.max(hw, Math.min(Sim.W - hw, cam.x));
    cam.y = hh * 2 >= Sim.H ? Sim.H / 2 : Math.max(hh, Math.min(Sim.H - hh, cam.y));
  }

  // ---------- Interface ----------
  function fmtTime(t) { return t < 60 ? Math.round(t) + ' s' : Math.floor(t / 60) + ' min'; }
  function dirText(fwd, side) { return fwd > .55 ? 'à frente' : fwd < -.55 ? 'atrás' : side > 0 ? 'à direita' : 'à esquerda'; }
  function brainCaption(c) {
    var seen = [];
    if (c.near.pred) seen.push('<b>predador ' + dirText(c.inp[3], c.inp[4]) + '</b>');
    if (c.near.food) seen.push('<b>comida ' + dirText(c.inp[0], c.inp[1]) + '</b>');
    var turn = c.out[0], acc = Math.round((c.out[1] + 1) / 2 * 100);
    var act = (Math.abs(turn) < .15 ? '<b>seguir reto</b>' : '<b>virar para a ' + (turn > 0 ? 'direita' : 'esquerda') + '</b>') + ' e <b>' + (acc > 66 ? 'acelerar forte' : acc > 33 ? 'andar devagar' : 'quase parar') + '</b>';
    return (seen.length ? 'Vê ' + seen.join(' e ') : 'Não vê nada por perto') + ' &rarr; decide ' + act + '.';
  }
  function ui(now) {
    var s = Sim.stats(world), p = state.prot;
    $('stGen').textContent = s.maxGen; $('stPop').textContent = s.pop;
    $('stLife').textContent = s.avgLife ? Math.round(s.avgLife) + ' s' : '–';
    $('stLifeBase').textContent = s.baseLife ? (s.avgLife >= s.baseLife ? '▲' : '▼') + ' no início: ' + Math.round(s.baseLife) + ' s' : 'medindo…';
    $('stTime').textContent = fmtTime(s.t);
    if (s.maxGen >= state.milestone + 10) { state.milestone = Math.floor(s.maxGen / 10) * 10; feed('dna', 'Nasceu a geração ' + s.maxGen, ''); }
    if (s.baseLife && s.t > state.lifeNote) { state.lifeNote = s.t + 240; feed('trend', 'Vida média: ' + Math.round(s.avgLife) + ' s (no início: ' + Math.round(s.baseLife) + ' s)', s.avgLife >= s.baseLife ? 'good' : ''); }
    if (p && p.alive) { $('brainCap').innerHTML = brainCaption(p); $('bnM').textContent = p.mut; $('bnG').textContent = p.gen; $('bnW').textContent = p.brain.length; }
    else if (!p) $('brainCap').textContent = '';
    if (!p) return;
    $('cName').textContent = p.name + ' #' + p.id;
    $('cSub').textContent = parentLabel(p) + ' · ' + p.speed.toFixed(0) + ' de velocidade agora';
    $('cAge').textContent = Math.round(p.age) + ' s';
    var stage = p.age < Sim.MATURE ? 'filhote' : p.age < 200 ? 'adulta' : 'idosa';
    $('cStage').textContent = 'fase: ' + stage;
    if (state.stageOf !== p.id) { state.stageOf = p.id; state.stage = stage; }
    else if (stage !== state.stage) { state.stage = stage; feed(stage === 'adulta' ? 'cake' : 'hourglass', stage === 'adulta' ? p.name + ' chegou à vida adulta e já pode ter filhotes' : p.name + ' está envelhecendo', ''); }
    var pct = Math.max(0, Math.min(1, p.e / Sim.MAXE)) * 100;
    $('cEnergy').style.width = pct + '%'; $('cEnergyTx').textContent = 'energia ' + Math.round(pct) + '%';
    $('cEat').textContent = p.eaten; $('cKids').textContent = p.kids; $('cEsc').textContent = p.escapes;
  }

  // ---------- Loop ----------
  function draw(ts) {
    var p = state.prot;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    Render.world(ctx, W, H, world, cam, p, ts / 1000, p && p.alive ? state.bubble : null);
  }
  function frame(ts) {
    requestAnimationFrame(frame);
    if (window.innerWidth !== W || window.innerHeight !== H) resize();
    var dt = Math.min(.1, (ts - state.last) / 1000);
    if (!state.last) dt = 0;
    state.last = ts;
    state.acc += dt * state.speed;
    var n = 0;
    while (state.acc >= DT && n < 80) { Sim.step(world, DT); state.acc -= DT; n++; }
    if (n >= 80) state.acc = 0;
    drain();

    if (!state.prot) { var pk = Sim.pickProtagonist(world, null); if (pk.c) setProt(pk.c, null); }
    if (state.next && ts >= state.switchAt) {
      var nx = state.next; state.next = null; $('overlay').hidden = true;
      var old = state.prot;
      if (nx.c && nx.c.alive) setProt(nx.c, nx.descendant ? old : null);
      else { var pk2 = Sim.pickProtagonist(world, null); setProt(pk2.c, null); }
    }
    var p = state.prot;
    if (p && p.alive && !state.next) narrate(p, ts);
    camera(dt);

    draw(ts);
    state.frame++;
    if (state.brainOn && state.frame % 2 === 0) Render.brain(bcv, p && p.alive ? p : null, ts / 1000);
    if (ts - state.lastUi > 200) { state.lastUi = ts; ui(ts); }
  }

  // ---------- Controles ----------
  document.querySelectorAll('[data-sp]').forEach(function (b) {
    b.onclick = function () {
      state.speed = parseInt(b.getAttribute('data-sp'), 10);
      document.querySelectorAll('[data-sp]').forEach(function (x) { x.classList.toggle('on', x === b); });
    };
  });
  $('brainBig').onclick = function () { var big = $('brainBox').classList.toggle('big'); $('brainBig').textContent = big ? 'reduzir' : 'ampliar'; };
  $('brainToggle').onclick = function () {
    state.brainOn = !state.brainOn;
    $('brainBox').classList.toggle('min', !state.brainOn);
    $('brainBig').hidden = !state.brainOn;
    $('brainToggle').textContent = state.brainOn ? 'ocultar' : 'mostrar';
  };
  $('introClose').onclick = function () { $('intro').hidden = true; try { localStorage.setItem('mv.intro', '1'); } catch (e) {} };
  try { if (localStorage.getItem('mv.intro')) $('intro').hidden = true; } catch (e) {}
  setTimeout(function () { $('intro').hidden = true; }, 30000);

  for (var w0 = 0; w0 < 8 / DT; w0++) Sim.step(world, DT);
  world.msgs.length = 0;
  window.MV = { world: world, state: state };
  requestAnimationFrame(frame);
})();
