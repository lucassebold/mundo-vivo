/* Motor do Mundo Vivo: criaturas com cérebros neurais que evoluem sozinhas. Sem DOM: roda no navegador e no Node. */
(function (root) {
  var Sim = {};
  var W = 1400, H = 900;
  var NIN = 8, NH = 8, NOUT = 2;
  var NW = NH * (NIN + 1) + NOUT * (NH + 1);
  var MAXE = 200, FOOD_E = 40, REP_E = 110, CAP = 130, MAX_AGE = 300, MATURE = 22, METAB = .22, TURN_COST = 1.2;
  Sim.W = W; Sim.H = H; Sim.NIN = NIN; Sim.NH = NH; Sim.NOUT = NOUT; Sim.MAXE = MAXE; Sim.MAX_AGE = MAX_AGE; Sim.MATURE = MATURE;

  function rng(seed) {
    var a = seed >>> 0;
    var f = function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    f.gauss = function () { var u = 1 - f(), v = f(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    f.int = function (n) { return Math.floor(f() * n); };
    f.getState = function () { return a; };
    f.setState = function (v) { a = v >>> 0; };
    return f;
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // gêneros reais de bactérias (o jogo é inspirado nelas; não representa a biologia exata de cada espécie)
  var NAMES = ['Escherichia', 'Bacillus', 'Vibrio', 'Lactobacillus', 'Pseudomonas', 'Salmonella', 'Clostridium', 'Streptococcus', 'Klebsiella', 'Listeria', 'Rhizobium', 'Azotobacter', 'Serratia', 'Proteus', 'Bacteroides', 'Helicobacter', 'Mycobacterium', 'Shewanella', 'Geobacter', 'Deinococcus', 'Streptomyces', 'Nitrosomonas', 'Thiobacillus', 'Acinetobacter', 'Campylobacter', 'Legionella', 'Enterobacter', 'Borrelia', 'Treponema', 'Cyanobacterium'];

  // ---------- Cérebro: rede 8 -> 8 -> 2 ----------
  function randomBrain(rnd) {
    var w = [], i;
    for (i = 0; i < NW; i++) w.push(rnd.gauss() * .6);
    return w;
  }
  function mutateBrain(w, rnd) {
    var o = w.slice(), i, r, m = 0;
    for (i = 0; i < o.length; i++) {
      r = rnd();
      if (r < .1) { o[i] += rnd.gauss() * .4; m++; }
      else if (r < .4) o[i] += rnd.gauss() * .05;
      o[i] = clamp(o[i], -4, 4);
    }
    o._m = m;
    return o;
  }
  function randomGenes(rnd) { return { size: .8 + rnd() * .4, speed: 85 + rnd() * 30, vision: 100 + rnd() * 50, hue: rnd() * 360 }; }
  function mutateGenes(g, rnd) {
    return {
      size: clamp(g.size + rnd.gauss() * .05, .6, 1.6),
      speed: clamp(g.speed + rnd.gauss() * 5, 55, 150),
      vision: clamp(g.vision + rnd.gauss() * 7, 50, 220),
      hue: (g.hue + rnd.gauss() * 6 + 360) % 360
    };
  }
  function think(c) {
    var w = c.brain, inp = c.inp, hid = c.hid, out = c.out, i, j, k = 0, s;
    for (j = 0; j < NH; j++) {
      s = 0;
      for (i = 0; i < NIN; i++) s += w[k++] * inp[i];
      s += w[k++]; hid[j] = Math.tanh(s);
    }
    for (j = 0; j < NOUT; j++) {
      s = 0;
      for (i = 0; i < NH; i++) s += w[k++] * hid[i];
      s += w[k++]; out[j] = Math.tanh(s);
    }
  }

  // ---------- Mundo ----------
  Sim.create = function (seed, opts) {
    opts = opts || {};
    var rnd = rng(seed || 1), i;
    var world = {
      rnd: rnd, t: 0, nextId: 1, foods: [], preds: [], creatures: [], msgs: [], archive: [],
      patches: [], event: null, nextEvent: 140 + rnd() * 100, predSpeed: 90, predTimer: 0,
      nextPredId: 1, stats: { born: 0, deaths: 0, life: [], base: null, maxGen: 0 }, foodTarget: 190, cap: CAP
    };
    for (i = 0; i < 4; i++) world.patches.push({ x: 150 + rnd() * (W - 300), y: 120 + rnd() * (H - 240), ph: rnd() * 6.28, r: 70 + rnd() * 30 });
    for (i = 0; i < world.foodTarget; i++) spawnFood(world);
    for (i = 0; i < (opts.pop || 60); i++) addCreature(world, rnd() * W, rnd() * H, randomBrain(rnd), randomGenes(rnd), null);
    world.basePreds = opts.preds === undefined ? 2 : opts.preds;
    
    return world;
  };

  function spawnFood(world) {
    var rnd = world.rnd, x, y, p;
    if (rnd() < .7) {
      p = world.patches[rnd.int(world.patches.length)];
      x = p.x + rnd.gauss() * p.r; y = p.y + rnd.gauss() * p.r;
    } else { x = rnd() * W; y = rnd() * H; }
    world.foods.push({ x: clamp(x, 8, W - 8), y: clamp(y, 8, H - 8), ph: rnd() * 6.28 });
  }
  function addPred(world) {
    var rnd = world.rnd;
    world.preds.push({ id: world.nextPredId++, x: rnd() * W, y: rnd() * H, a: rnd() * 6.28, state: 'wander', timer: 0, target: null, r: 13 });
  }
  function addCreature(world, x, y, brain, genes, parent) {
    var anc = parent ? [parent.id].concat(parent.anc).slice(0, 5) : [];
    var c = {
      id: world.nextId++, parent: parent ? parent.id : 0, anc: anc, gen: parent ? parent.gen + 1 : 1,
      name: NAMES[world.rnd.int(NAMES.length)], x: x, y: y, a: world.rnd() * 6.28, speed: 0, e: 100, age: 0,
      g: genes, brain: brain, eaten: 0, kids: 0, cd: 6, thrust: 0, turn: 0, danger: false, escapes: 0,
      inp: [0, 0, 0, 0, 0, 0, 0, 0], hid: [0, 0, 0, 0, 0, 0, 0, 0], out: [0, 0], near: { food: null, pred: null },
      straight: .5, pathAcc: 0, sx: x, sy: y, st: 0, lastAte: -99, lastKid: -99, lastEscape: -99, alive: true, cause: null, trail: []
    };
    c.mut = brain._m || 0;
    c.r = 6 * genes.size;
    world.creatures.push(c);
    world.stats.born++;
    if (c.gen > world.stats.maxGen) world.stats.maxGen = c.gen;
    return c;
  }

  function sense(world, c) {
    var cs = Math.cos(c.a), sn = Math.sin(c.a), vis = c.g.vision, i, f, dx, dy, d2, best = vis * vis, bf = null, bp = null, inp = c.inp, d;
    var foods = world.foods, preds = world.preds;
    for (i = 0; i < foods.length; i++) {
      f = foods[i]; dx = f.x - c.x; dy = f.y - c.y; d2 = dx * dx + dy * dy;
      if (d2 < best) { best = d2; bf = f; }
    }
    if (bf) {
      dx = bf.x - c.x; dy = bf.y - c.y; d = Math.sqrt(best) || 1;
      inp[0] = (dx * cs + dy * sn) / d; inp[1] = (-dx * sn + dy * cs) / d; inp[2] = 1 - d / vis;
      c.near.food = { dx: dx, dy: dy, d: d };
    } else { inp[0] = inp[1] = inp[2] = 0; c.near.food = null; }
    best = vis * vis;
    for (i = 0; i < preds.length; i++) {
      f = preds[i]; dx = f.x - c.x; dy = f.y - c.y; d2 = dx * dx + dy * dy;
      if (d2 < best) { best = d2; bp = f; }
    }
    if (bp) {
      dx = bp.x - c.x; dy = bp.y - c.y; d = Math.sqrt(best) || 1;
      inp[3] = (dx * cs + dy * sn) / d; inp[4] = (-dx * sn + dy * cs) / d; inp[5] = 1 - d / vis;
      c.near.pred = { dx: dx, dy: dy, d: d, p: bp };
    } else { inp[3] = inp[4] = inp[5] = 0; c.near.pred = null; }
    inp[6] = c.e / MAXE * 2 - 1;
    var px = c.x + cs * 60, py = c.y + sn * 60;
    inp[7] = (px < 0 || px > W || py < 0 || py > H) ? 1 : 0;
  }

  function kill(world, c, cause) {
    if (!c.alive) return;
    c.alive = false; c.cause = cause;
    var st = world.stats;
    st.deaths++;
    st.life.push(c.age); if (st.life.length > 60) st.life.shift();
    if (st.base === null && st.deaths >= 40) st.base = avg(st.life.slice(-40));
    if (c.eaten >= 6) {
      world.archive.push({ brain: c.brain, genes: c.g, score: c.age + c.kids * 20 });
      world.archive.sort(function (a, b) { return b.score - a.score; });
      if (world.archive.length > 12) world.archive.length = 12;
    }
    world.msgs.push({ t: world.t, type: 'death', c: c, cause: cause });
  }
  function avg(a) { var s = 0, i; for (i = 0; i < a.length; i++) s += a[i]; return a.length ? s / a.length : 0; }
  Sim.avg = avg;

  Sim.step = function (world, dt) {
    var rnd = world.rnd, cs = world.creatures, i, j, c, p, f, speed, nAlive;
    world.t += dt;

    // comida: reposição e eventos
    var want = world.foodTarget * (world.event && world.event.food ? world.event.food : 1);
    if (world.foods.length < want && rnd() < dt * 9) spawnFood(world);
    for (i = 0; i < world.patches.length; i++) { p = world.patches[i]; p.ph += dt * .05; p.x = clamp(p.x + Math.cos(p.ph) * dt * 2.2, 80, W - 80); p.y = clamp(p.y + Math.sin(p.ph * 1.3) * dt * 2.2, 80, H - 80); }
    if (world.event && world.t > world.event.until) { world.msgs.push({ t: world.t, type: 'event-end', text: world.event.endText }); if (world.event.preds) while (world.preds.length > world.event.basePreds) world.preds.pop(); world.event = null; }
    if (!world.event && world.t > world.nextEvent) startEvent(world);

    // criaturas
    nAlive = 0;
    for (i = 0; i < cs.length; i++) {
      c = cs[i]; if (!c.alive) continue;
      c.age += dt; c.cd -= dt;
      sense(world, c);
      think(c);
      c.turn += (c.out[0] * 4 - c.turn) * (1 - Math.exp(-dt / .15));
      c.thrust += ((c.out[1] + 1) / 2 - c.thrust) * (1 - Math.exp(-dt / .3));
      c.a += c.turn * dt;
      c.r = 6 * c.g.size * (.55 + .45 * Math.min(1, c.age / MATURE));
      speed = c.thrust * c.g.speed * (1 - .3 * clamp((c.age - 200) / 100, 0, 1)); c.speed = speed;
      c.x += Math.cos(c.a) * speed * dt; c.y += Math.sin(c.a) * speed * dt;
      if (c.x < 0) { c.x = 0; c.a = Math.PI - c.a; } else if (c.x > W) { c.x = W; c.a = Math.PI - c.a; }
      if (c.y < 0) { c.y = 0; c.a = -c.a; } else if (c.y > H) { c.y = H; c.a = -c.a; }
      c.pathAcc += speed * dt; c.st += dt;
      if (c.st >= 3) { var dd = Math.sqrt((c.x - c.sx) * (c.x - c.sx) + (c.y - c.sy) * (c.y - c.sy)); if (c.pathAcc > 25) c.straight = c.straight * .5 + .5 * Math.min(1, dd / c.pathAcc); c.sx = c.x; c.sy = c.y; c.pathAcc = 0; c.st = 0; }
      c.e -= Math.abs(c.turn) / 4 * TURN_COST * dt;
      c.e -= (2 + 2.2 * c.g.size + .01 * c.g.vision + 7 * Math.pow(speed / 100, 2) * c.g.size) * METAB * dt;

      // comer
      for (j = world.foods.length - 1; j >= 0; j--) {
        f = world.foods[j];
        if (Math.abs(f.x - c.x) < c.r + 5 && Math.abs(f.y - c.y) < c.r + 5 && (f.x - c.x) * (f.x - c.x) + (f.y - c.y) * (f.y - c.y) < (c.r + 5) * (c.r + 5)) {
          world.foods.splice(j, 1); c.e = Math.min(MAXE, c.e + FOOD_E); c.eaten++; c.lastAte = world.t;
        }
      }
      // sustos e fugas
      if (c.near.pred) {
        if (c.near.pred.d < 80) c.danger = true;
        else if (c.danger && c.near.pred.d > 150) { c.danger = false; escaped(world, c); }
      } else if (c.danger) { c.danger = false; escaped(world, c); }

      // reprodução
      if (c.e >= REP_E && c.age >= MATURE && c.cd <= 0 && cs.length < world.cap) {
        var child = addCreature(world, c.x + rnd.gauss() * 12, c.y + rnd.gauss() * 12, mutateBrain(c.brain, rnd), mutateGenes(c.g, rnd), c);
        child.e = c.e * .4; c.e *= .5; c.kids++; c.cd = 18; c.lastKid = world.t;
        world.msgs.push({ t: world.t, type: 'birth', c: c, child: child });
      }
      if (c.e <= 0) kill(world, c, 'fome');
      else if (c.age > MAX_AGE) kill(world, c, 'velhice');
      if (c.alive) nAlive++;
      if (((world.t * 10) | 0) % 3 === 0 && c.trail.length < 80) c.trail.push(c.x, c.y);
      if (c.trail.length > 70) c.trail.splice(0, 2);
    }

    // predadores
    world.predTimer -= dt;
    if (world.predTimer <= 0) {
      world.predTimer = 2;
      var ms = 0, n = 0;
      for (i = 0; i < cs.length; i++) if (cs[i].alive) { ms += cs[i].g.speed; n++; }
      if (n) world.predSpeed = clamp(.88 * ms / n + 10, 65, 140);
    }
    var wantPreds = world.basePreds + Math.floor(nAlive / 60);
    if (world.t < 100) world.preds.length = 0;
    else if (!world.event) { while (world.preds.length < wantPreds) addPred(world); if (!world.predMsg) { world.predMsg = true; world.msgs.push({ t: world.t, type: 'event', text: 'As primeiras amebas chegaram ao meio.' }); } }
    for (i = 0; i < world.preds.length; i++) stepPred(world, world.preds[i], dt);

    // limpeza e socorro
    for (i = cs.length - 1; i >= 0; i--) if (!cs[i].alive) cs.splice(i, 1);
    if (cs.length < 10) rescue(world);
  };

  function escaped(world, c) {
    if (world.t - c.lastEscape < 12) return;
    c.escapes++; c.lastEscape = world.t; world.msgs.push({ t: world.t, type: 'escape', c: c });
  }

  function stepPred(world, p, dt) {
    var cs = world.creatures, i, c, best = 140 * 140, bt = null, dx, dy, d2, d, sp;
    if (p.state === 'rest') { p.timer -= dt; sp = 10; if (p.timer <= 0) p.state = 'wander'; }
    else {
      for (i = 0; i < cs.length; i++) {
        c = cs[i]; if (!c.alive) continue;
        dx = c.x - p.x; dy = c.y - p.y; d2 = dx * dx + dy * dy;
        if (d2 < best) { best = d2; bt = c; }
      }
      if (p.state === 'wander') { if (bt) { p.state = 'chase'; p.timer = 3.5; } }
      if (p.state === 'chase') {
        p.timer -= dt;
        if (!bt || p.timer <= 0) { p.state = 'rest'; p.timer = 7; sp = 10; }
        else {
          p.a = Math.atan2(bt.y - p.y, bt.x - p.x); sp = world.predSpeed;
          d = Math.sqrt(best);
          if (d < p.r + bt.r) { kill(world, bt, 'predador'); p.state = 'rest'; p.timer = 14; sp = 0; }
        }
      }
      if (p.state === 'wander') { p.a += world.rnd.gauss() * .9 * dt; sp = 38; }
    }
    p.speed = sp;
    p.x += Math.cos(p.a) * sp * dt; p.y += Math.sin(p.a) * sp * dt;
    if (p.x < 0) { p.x = 0; p.a = Math.PI - p.a; } else if (p.x > W) { p.x = W; p.a = Math.PI - p.a; }
    if (p.y < 0) { p.y = 0; p.a = -p.a; } else if (p.y > H) { p.y = H; p.a = -p.a; }
  }

  function rescue(world) {
    var rnd = world.rnd, i, a, n = 8;
    for (i = 0; i < n; i++) {
      if (world.archive.length) { a = world.archive[rnd.int(world.archive.length)]; addCreature(world, rnd() * W, rnd() * H, mutateBrain(a.brain, rnd), mutateGenes(a.genes, rnd), null); }
      else addCreature(world, rnd() * W, rnd() * H, randomBrain(rnd), randomGenes(rnd), null);
    }
    world.msgs.push({ t: world.t, type: 'rescue', text: 'A colônia quase se extinguiu. Descendentes das melhores linhagens repovoaram o meio.' });
  }

  var EVENTS = [
    { name: 'Escassez de nutrientes', text: 'Escassez: os nutrientes estão rareando no meio.', endText: 'Os nutrientes voltaram a circular.', food: .4, dur: 70 },
    { name: 'Floração de nutrientes', text: 'Floração: uma explosão de nutrientes encheu o meio.', endText: 'A floração de nutrientes acabou.', food: 1.6, dur: 60 },
    { name: 'Surto de amebas', text: 'Surto: mais amebas chegaram caçando bactérias.', endText: 'As amebas extras se dispersaram.', preds: 3, dur: 55 }
  ];
  function startEvent(world) {
    var def = EVENTS[world.rnd.int(EVENTS.length)];
    world.event = { name: def.name, food: def.food, preds: def.preds, endText: def.endText, until: world.t + def.dur, basePreds: world.preds.length };
    if (def.preds) for (var i = 0; i < def.preds; i++) addPred(world);
    world.nextEvent = world.t + def.dur + 140 + world.rnd() * 160;
    world.msgs.push({ t: world.t, type: 'event', text: def.text, name: def.name });
  }

  // ---------- Protagonista ----------
  // Prefere um descendente vivo do anterior (a dinastia continua); senão, alguém bem de saúde.
  Sim.pickProtagonist = function (world, prev) {
    var cs = world.creatures, i, c, best = null, bs = -1, s;
    if (prev) {
      for (i = 0; i < cs.length; i++) {
        c = cs[i]; if (!c.alive) continue;
        var k = c.anc.indexOf(prev.id);
        if (k >= 0 && (c.straight > .4 || c.age < 15)) { s = 1000 - k * 100 + c.e; if (s > bs) { bs = s; best = c; } }
      }
      if (best) return { c: best, descendant: true };
    }
    function safe(x) { for (var q = 0; q < world.preds.length; q++) { var dx = world.preds[q].x - x.x, dy = world.preds[q].y - x.y; if (dx * dx + dy * dy < 260 * 260) return false; } return true; }
    var pool = cs.filter(function (x) { return x.alive && x.age > 4 && safe(x) && x.straight > .55; });
    if (!pool.length) pool = cs.filter(function (x) { return x.alive && x.age > 4 && safe(x); });
    if (!pool.length) pool = cs.filter(function (x) { return x.alive && x.age > 4; });
    if (!pool.length) pool = cs.filter(function (x) { return x.alive; });
    // sem descendente: prefere um filhote saudável, para acompanhar a vida inteira desde o começo
    var young = cs.filter(function (x) { return x.alive && x.age < 40 && safe(x) && x.straight > .55; });
    if (young.length) { young.sort(function (a, b) { return b.e - a.e; }); return { c: young[world.rnd.int(Math.min(4, young.length))], descendant: false }; }
    // prefere quem já está bem de energia e experiente: histórias mais longas de acompanhar
    pool.sort(function (a, b) { return (b.e + b.eaten * 4 + b.age) - (a.e + a.eaten * 4 + a.age); });
    return { c: pool[world.rnd.int(Math.max(1, Math.min(5, pool.length)))], descendant: false };
  };

  // ---------- Salvar e restaurar (para o servidor sobreviver a reinícios) ----------
  var CFIELDS = ['id', 'parent', 'anc', 'gen', 'name', 'x', 'y', 'a', 'speed', 'e', 'age', 'g', 'brain', 'eaten', 'kids', 'cd', 'escapes', 'straight', 'lastAte', 'lastKid', 'lastEscape', 'mut'];
  Sim.serialize = function (world) {
    return {
      v: 1, t: world.t, nextId: world.nextId, rng: world.rnd.getState(), nextEvent: world.nextEvent, predSpeed: world.predSpeed, basePreds: world.basePreds, predMsg: !!world.predMsg,
      foodTarget: world.foodTarget, cap: world.cap, stats: world.stats, archive: world.archive, patches: world.patches,
      foods: world.foods.map(function (f) { return [Math.round(f.x), Math.round(f.y)]; }),
      preds: world.preds.map(function (p) { return { id: p.id, x: p.x, y: p.y, a: p.a, state: p.state, timer: p.timer, r: p.r }; }), nextPredId: world.nextPredId,
      creatures: world.creatures.filter(function (c) { return c.alive; }).map(function (c) { var o = {}; CFIELDS.forEach(function (k) { o[k] = c[k]; }); return o; })
    };
  };
  Sim.restore = function (d) {
    var world = Sim.create(1, { pop: 0, preds: 0 });
    world.rnd.setState(d.rng); world.t = d.t; world.nextId = d.nextId; world.nextEvent = d.nextEvent; world.predSpeed = d.predSpeed; world.basePreds = d.basePreds; world.predMsg = d.predMsg;
    world.foodTarget = d.foodTarget; world.cap = d.cap; world.stats = d.stats; world.archive = d.archive; world.patches = d.patches;
    world.foods = d.foods.map(function (f) { return { x: f[0], y: f[1], ph: world.rnd() * 6.28 }; });
    world.nextPredId = d.nextPredId || 1000;
    world.preds = d.preds.map(function (p) { p.target = null; if (!p.id) p.id = world.nextPredId++; return p; });
    world.creatures = d.creatures.map(function (o) {
      var c = addCreature(world, o.x, o.y, o.brain, o.g, null);
      world.stats.born--;
      CFIELDS.forEach(function (k) { c[k] = o[k]; });
      c.r = 6 * c.g.size * (.55 + .45 * Math.min(1, c.age / MATURE)); c.sx = c.x; c.sy = c.y;
      return c;
    });
    return world;
  };

  Sim.spawn = function (world, brain, genes) { return addCreature(world, W / 2, H / 2, brain, genes, null); };

  Sim.stats = function (world) {
    var alive = world.creatures.length, ms = 0, mv = 0, i;
    for (i = 0; i < alive; i++) { ms += world.creatures[i].g.speed; mv += world.creatures[i].g.vision; }
    return { pop: alive, preds: world.preds.length, avgLife: avg(world.stats.life), baseLife: world.stats.base, maxGen: world.stats.maxGen, deaths: world.stats.deaths, meanSpeed: alive ? ms / alive : 0, meanVision: alive ? mv / alive : 0, t: world.t };
  };

  root.Sim = Sim;
  if (typeof module !== 'undefined' && module.exports) module.exports = Sim;
})(typeof window !== 'undefined' ? window : global);
