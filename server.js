// Mundo Vivo: roda UMA simulação no servidor e transmite o que acontece a todos os visitantes (Server-Sent Events).
var http = require('http'), fs = require('fs'), path = require('path');
var Sim = require('./js/sim.js');

var ROOT = __dirname, PORT = process.env.PORT || 3000;
var SIM_SPEED = parseFloat(process.env.SIM_SPEED || '1');       // 1 = tempo real
var DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');  // no Railway, aponte para um Volume para não perder o mundo ao reiniciar
var SAVE_FILE = path.join(DATA_DIR, 'world.json');
var DT = 1 / 20, SNAP_MS = 125, SAVE_MS = parseInt(process.env.SAVE_MS || '60000', 10), SWITCH_MS = 3300;

// ---------- Mundo (carrega o salvo, se existir) ----------
var world = null, boot = 'novo';
try {
  var saved = JSON.parse(fs.readFileSync(SAVE_FILE, 'utf8'));
  if (saved && saved.v === 1 && saved.creatures.length) { world = Sim.restore(saved); boot = 'restaurado'; }
} catch (e) {}
if (!world) {
  world = Sim.create(Math.floor(Math.random() * 1e9));
  for (var w0 = 0; w0 < 8 / DT; w0++) Sim.step(world, DT);
  world.msgs.length = 0;
}
console.log('Mundo ' + boot + ': ' + world.creatures.length + ' criaturas, tempo de mundo ' + Math.round(world.t) + ' s');

function save() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    var tmp = SAVE_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(Sim.serialize(world)));
    fs.renameSync(tmp, SAVE_FILE);
  } catch (e) { console.error('Falha ao salvar:', e.message); }
}

// ---------- Diretor: escolhe e troca a protagonista, igual para todos ----------
var dir = { prot: null, next: null, switchAt: 0, out: [] };   // out: mensagens para o próximo snapshot

function startProt(c, descendantOf) {
  dir.prot = c; dir.next = null;
  dir.out.push({ k: 'prot', name: c.name, id: c.id, gen: c.gen, from: descendantOf ? descendantOf.name : null });
}
function directorTick(now) {
  var i, m, p = dir.prot;
  for (i = 0; i < world.msgs.length; i++) {
    m = world.msgs[i];
    if (m.type === 'death' && p && m.c === p && !dir.next) {
      var pick = Sim.pickProtagonist(world, p);
      dir.next = pick; dir.switchAt = now + SWITCH_MS;
      dir.out.push({ k: 'death', name: p.name, id: p.id, cause: m.cause, age: Math.round(p.age), eaten: p.eaten, kids: p.kids, escapes: p.escapes, nextName: pick.c ? pick.c.name : null, desc: !!pick.descendant });
    } else if (m.type === 'birth' && p && m.c === p) dir.out.push({ k: 'birth', name: p.name });
    else if (m.type === 'escape' && p && m.c === p) dir.out.push({ k: 'escape', name: p.name });
    else if (m.type === 'event' || m.type === 'event-end') dir.out.push({ k: 'world', icon: 'globe', text: m.text });
    else if (m.type === 'rescue') dir.out.push({ k: 'world', icon: 'seed', text: m.text });
  }
  world.msgs.length = 0;
  if (!dir.prot) { var pk = Sim.pickProtagonist(world, null); if (pk.c) startProt(pk.c, null); }
  if (dir.next && now >= dir.switchAt) {
    var nx = dir.next, old = dir.prot;
    if (nx.c && nx.c.alive) startProt(nx.c, nx.descendant ? old : null);
    else { var pk2 = Sim.pickProtagonist(world, null); if (pk2.c) startProt(pk2.c, null); }
  }
}

// ---------- Snapshot compacto ----------
function r1(v) { return Math.round(v * 10) / 10; }
var seq = 0, lastMilestone = world.stats.maxGen, lastLifeNote = world.t;
function snapshot() {
  var s = Sim.stats(world), p = dir.prot, i, c, pr = null;
  var cs = [];
  for (i = 0; i < world.creatures.length; i++) {
    c = world.creatures[i];
    cs.push([c.id, Math.round(c.x), Math.round(c.y), Math.round(c.a * 100) / 100, r1(c.r), Math.round(c.g.hue), Math.round(c.g.vision), Math.round(c.speed), Math.round(c.e), Math.round(c.age)]);
  }
  if (p) {
    pr = { id: p.id, name: p.name, alive: p.alive, gen: p.gen, age: r1(p.age), e: Math.round(p.e), eaten: p.eaten, kids: p.kids, escapes: p.escapes, mut: p.mut, straight: Math.round(p.straight * 100) / 100,
      thrust: Math.round(p.thrust * 100) / 100, inp: p.inp.map(function (v) { return Math.round(v * 100) / 100; }), hid: p.hid.map(function (v) { return Math.round(v * 100) / 100; }), out: p.out.map(function (v) { return Math.round(v * 100) / 100; }),
      near: { food: p.near.food ? [Math.round(p.near.food.dx), Math.round(p.near.food.dy)] : null, pred: p.near.pred ? [Math.round(p.near.pred.dx), Math.round(p.near.pred.dy), Math.round(p.near.pred.d)] : null },
      lastAte: r1(p.lastAte), lastKid: r1(p.lastKid), lastEscape: r1(p.lastEscape), brain: p.brain.map(function (v) { return Math.round(v * 1000) / 1000; }), vision: Math.round(p.g.vision), hue: Math.round(p.g.hue) };
  }
  var extra = [];
  if (s.maxGen >= lastMilestone + 10) { lastMilestone = Math.floor(s.maxGen / 10) * 10; extra.push({ k: 'gen', gen: s.maxGen }); }
  if (s.baseLife && world.t > lastLifeNote + 240) { lastLifeNote = world.t; extra.push({ k: 'life', avg: Math.round(s.avgLife), base: Math.round(s.baseLife) }); }
  var msgs = dir.out.concat(extra); dir.out = [];
  return {
    seq: ++seq, t: Math.round(world.t * 10) / 10, viewers: clients.length,
    st: { pop: s.pop, gen: s.maxGen, avgLife: Math.round(s.avgLife), baseLife: s.baseLife ? Math.round(s.baseLife) : null, deaths: s.deaths },
    ev: world.event ? world.event.name : null,
    cs: cs, fs: world.foods.map(function (f) { return [Math.round(f.x), Math.round(f.y)]; }),
    ps: world.preds.map(function (q) { return [Math.round(q.x), Math.round(q.y), Math.round(q.a * 100) / 100, q.state === 'chase' ? 1 : q.state === 'rest' ? 2 : 0]; }),
    pt: world.patches.map(function (q) { return [Math.round(q.x), Math.round(q.y), Math.round(q.r)]; }),
    pr: pr, msgs: msgs
  };
}

// ---------- Loop da simulação ----------
var clients = [], lastTick = Date.now(), acc = 0, lastSnap = 0, lastSave = Date.now();
setInterval(function () {
  var now = Date.now(), n = 0;
  acc += Math.min(1000, now - lastTick) / 1000 * SIM_SPEED; lastTick = now;
  while (acc >= DT && n < 60) { Sim.step(world, DT); acc -= DT; n++; }
  if (n >= 60) acc = 0;
  directorTick(now);
  if (now - lastSnap >= SNAP_MS) {
    lastSnap = now;
    var data = 'data: ' + JSON.stringify(snapshot()) + '\n\n', i;
    for (i = clients.length - 1; i >= 0; i--) { try { clients[i].write(data); } catch (e) { clients.splice(i, 1); } }
  }
  if (now - lastSave >= SAVE_MS) { lastSave = now; save(); }
}, 50);

// ---------- HTTP ----------
var MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
var PUBLIC = /^\/(index\.html|css\/|js\/|favicon)/;

http.createServer(function (req, res) {
  var url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/stream') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 2000\n\n');
    res.write('data: ' + JSON.stringify(snapshot()) + '\n\n');
    clients.push(res);
    req.on('close', function () { var k = clients.indexOf(res); if (k >= 0) clients.splice(k, 1); });
    return;
  }
  if (url === '/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: true, t: Math.round(world.t), pop: world.creatures.length, viewers: clients.length })); }
  if (url === '/') url = '/index.html';
  if (!PUBLIC.test(url) || url.indexOf('..') >= 0) { res.writeHead(404); return res.end('Não encontrado'); }
  var file = path.join(ROOT, url);
  fs.readFile(file, function (err, data) {
    if (err) { res.writeHead(404); return res.end('Não encontrado'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}).listen(PORT, '0.0.0.0', function () { console.log('Mundo Vivo no ar na porta ' + PORT + ' (velocidade ' + SIM_SPEED + 'x, dados em ' + DATA_DIR + ')'); });

function bye() { save(); process.exit(0); }
process.on('SIGTERM', bye); process.on('SIGINT', bye);
