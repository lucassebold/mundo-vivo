// Mundo Vivo: roda UMA simulação no servidor e transmite o que acontece a todos os visitantes (Server-Sent Events).
var http = require('http'), fs = require('fs'), path = require('path');
var Sim = require('./js/sim.js');
var Trades = require('./trades.js');
var Agent = require('./agent.js');

var ROOT = __dirname, PORT = process.env.PORT || 3000;
var SIM_SPEED = parseFloat(process.env.SIM_SPEED || '1');       // 1 = tempo real
var DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');  // no Railway, aponte para um Volume para não perder o mundo ao reiniciar
var SAVE_FILE = path.join(DATA_DIR, 'world.json');
var DT = 1 / 20, SNAP_MS = 125, SAVE_MS = parseInt(process.env.SAVE_MS || '60000', 10), SWITCH_MS = 3300;
var TOKEN_MINT = process.env.TOKEN_MINT || '';
var PORTAL_KEY = process.env.PUMPPORTAL_API_KEY || '';          // chave de API do PumpPortal (financiada com >= 0,02 SOL)                   // endereço do token na Pump.fun (ativa as reações a compras e vendas)
var TRADE_SIM = process.env.TRADE_SIM === '1';                   // negociações falsas, só para testar
var MIN_SOL = parseFloat(process.env.MIN_SOL || '0.02');         // abaixo disso a negociação só aparece na lista, sem efeito
var BLOOM_SOL = parseFloat(process.env.BLOOM_SOL || '2');        // compra desse tamanho dispara "Nutrient bloom"
var ADMIN_KEY = process.env.ADMIN_KEY || '';                     // habilita /api/test-trade (compra/venda manual de teste)
Sim.cfg.cycle = parseFloat(process.env.CYCLE_SECS || '900');            // duração do ciclo até virar Agente (padrão 15 min)
Sim.cfg.agentMin = parseFloat(process.env.AGENT_MIN_SECS || '300');      // quanto tempo vive como Agente: entre min e max (padrão 5 a 10 min)
Sim.cfg.agentMax = parseFloat(process.env.AGENT_MAX_SECS || '600');


// ---------- Mundo (carrega o salvo, se existir) ----------
var world = null, boot = 'novo', savedProtId = null;
if (process.env.RESET_WORLD !== '1') {
  try {
    var saved = JSON.parse(fs.readFileSync(SAVE_FILE, 'utf8'));
    if (saved && saved.v === 1 && saved.creatures.length) { world = Sim.restore(saved); boot = 'restaurado'; savedProtId = saved.protId || null; }
  } catch (e) {}
}
if (!world) {
  world = Sim.create(Math.floor(Math.random() * 1e9));
  for (var w0 = 0; w0 < 8 / DT; w0++) Sim.step(world, DT);
  world.msgs.length = 0;
}
console.log('Mundo ' + boot + ': ' + world.creatures.length + ' criaturas, tempo de mundo ' + Math.round(world.t) + ' s, nível ' + world.evo.level);

function save() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    var tmp = SAVE_FILE + '.tmp', data = Sim.serialize(world);
    data.protId = dir.prot && dir.prot.alive ? dir.prot.id : null;
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, SAVE_FILE);
  } catch (e) { console.error('Falha ao salvar:', e.message); }
}

// ---------- Diretor: escolhe e troca a protagonista, igual para todos ----------
var dir = { prot: null, next: null, switchAt: 0, out: [], ageIdx: 0 };   // out: mensagens para o próximo snapshot
var HERO_MILESTONES = [600, 1800, 3600, 7200, 10800, 14400, 18000, 21000];
var agent = Agent.create({ log: function (m) { console.log(m); } });
var say = null;                                                  // última fala do agente { text, src, at }
console.log('Agente: ' + (agent.state.llm ? 'LLM ligado (' + (process.env.AGENT_MODEL || 'claude-haiku-5-5') + ')' : 'frases prontas (sem ANTHROPIC_API_KEY ou SDK indisponível)'));

function agentUnlocked() { return world.evo.level >= Sim.LEVELS.length; }

function setMilestoneIdx(c) { dir.ageIdx = 0; while (dir.ageIdx < HERO_MILESTONES.length && HERO_MILESTONES[dir.ageIdx] <= c.age) dir.ageIdx++; }
function startProt(c, descendantOf) {
  Sim.makeHero(c);
  dir.prot = c; dir.next = null; setMilestoneIdx(c);
  dir.out.push({ k: 'prot', name: c.name, id: c.id, gen: c.gen, from: descendantOf ? descendantOf.name : null });
}
function heroFacts(c) {
  var ev = Sim.evoStatus(world);
  return { age: c.age, energyPct: c.e / Sim.MAXE * 100, gen: c.gen, kids: c.kids, level: ev.level, levelName: ev.name, levelMax: ev.max, left: ev.left, dormant: c.dormant, danger: !!(c.near.pred && c.near.pred.d < 120) };
}
function agentSay(kind) {
  var c = dir.prot;
  if (!agentUnlocked() || !c || !c.alive) return;
  agent.speak(kind, heroFacts(c), function (text, src) { say = { text: text, src: src, at: Date.now() }; dir.out.push({ k: 'say', text: text, src: src }); });
}
var nextIdle = Date.now() + 60000;

// ---------- Conversa com o agente ----------
// Só abre quando o herói é um Agente vivo E há chave de IA (frases prontas não conseguem conversar).
var chatLog = [], chatQ = [], chatBusy = false, chatByIp = {};
var CHAT_QUEUE_MAX = 4, CHAT_GAP_MS = 8000, CHAT_IP_HOUR = parseInt(process.env.CHAT_IP_PER_HOUR || '20', 10);
var CHAT_BAD = /\b(nigg\w*|fagg?\w*|retard\w*|kill yourself|kys|nazi\w*|rape\w*)\b/i;
function chatOpen() { return agentUnlocked() && agent.chatOk() && !!dir.prot && dir.prot.alive; }
function chatWho(ip) { var h = 0, i; for (i = 0; i < ip.length; i++) h = (h * 31 + ip.charCodeAt(i)) >>> 0; return 'Visitor ' + (h % 9000 + 1000); }
function chatPush(m) { chatLog.push(m); if (chatLog.length > 30) chatLog.shift(); dir.out.push({ k: 'chat', role: m.role, who: m.who, text: m.text, src: m.src }); }
function chatAccept(ip, raw) {
  var now = Date.now(), text = String(raw == null ? '' : raw).replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!chatOpen()) return { code: 403, error: agentUnlocked() ? 'The agent cannot hear you right now.' : 'The colony has not reached the Agent level yet.' };
  if (text.length < 2) return { code: 400, error: 'Write a short message.' };
  if (text.length > 200) text = text.slice(0, 200);
  if (/https?:|www\.|\.(com|io|xyz|fun|net|org)\b/i.test(text) || CHAT_BAD.test(text)) return { code: 400, error: 'That message cannot be sent.' };
  var rec = chatByIp[ip] || (chatByIp[ip] = { last: 0, stamps: [] });
  rec.stamps = rec.stamps.filter(function (t) { return now - t < 3600000; });
  if (now - rec.last < CHAT_GAP_MS) return { code: 429, error: 'Slow down: one message every few seconds.' };
  if (rec.stamps.length >= CHAT_IP_HOUR) return { code: 429, error: 'Message limit reached for this hour.' };
  if (chatQ.length >= CHAT_QUEUE_MAX) return { code: 429, error: 'The agent is busy answering others. Try again in a moment.' };
  rec.last = now; rec.stamps.push(now);
  var who = chatWho(ip);
  chatPush({ role: 'v', who: who, text: text });
  chatQ.push({ who: who, text: text });
  chatNext();
  return { code: 200, ok: true };
}
function chatNext() {
  if (chatBusy || !chatQ.length) return;
  var job = chatQ.shift(), c = dir.prot;
  if (!chatOpen()) { chatQ.length = 0; return; }
  chatBusy = true;
  agent.reply(job.who, job.text, heroFacts(c)).then(function (r) {
    chatBusy = false;
    say = { text: r.text, src: r.src, at: Date.now() };
    chatPush({ role: 'a', who: dir.prot ? dir.prot.name : 'Agent', text: r.text, src: r.src });
    chatNext();
  });
}
setInterval(function () { var now = Date.now(), k; for (k in chatByIp) if (now - chatByIp[k].last > 3600000) delete chatByIp[k]; }, 600000);

function directorTick(now) {
  var i, m, p = dir.prot;
  for (i = 0; i < world.msgs.length; i++) {
    m = world.msgs[i];
    if (m.type === 'death' && p && m.c === p && !dir.next) {
      var pick = Sim.pickProtagonist(world, p);
      dir.next = pick; dir.switchAt = now + SWITCH_MS;
      dir.out.push({ k: 'death', name: p.name, id: p.id, cause: m.cause, age: Math.round(p.age), eaten: p.eaten, kids: p.kids, escapes: p.escapes, nextName: pick.c ? pick.c.name : null, desc: !!pick.descendant });
    } else if (m.type === 'birth' && p && m.c === p) { dir.out.push({ k: 'birth', name: p.name }); agentSay('divide'); }
    else if (m.type === 'escape' && p && m.c === p) dir.out.push({ k: 'escape', name: p.name });
    else if (m.type === 'bite' && p && m.c === p) { dir.out.push({ k: 'bite', name: p.name }); agent.note('bite', 'an amoeba bit me but my capsule held'); agentSay('bite'); }
    else if (m.type === 'dormant' && p && m.c === p) { dir.out.push({ k: 'dormant', name: p.name }); agent.note('dormant', 'I ran out of energy and went dormant'); agentSay('dormant'); }
    else if (m.type === 'wake' && p && m.c === p) { dir.out.push({ k: 'wake', name: p.name }); agentSay('wake'); }
    else if (m.type === 'levelup') {
      dir.out.push({ k: 'level', level: m.level, name: m.name, max: Sim.LEVELS.length, agent: m.level >= Sim.LEVELS.length });
      agent.note('levelup', 'the colony reached a new evolution level: ' + m.name);
      if (m.level >= Sim.LEVELS.length) setTimeout(function () { agentSay('awaken'); }, 4000);
      else agentSay('levelup');
    }
    else if (m.type === 'agent-end') {
      if (p && p.alive) { Sim.killHero(world, p); }
      chatLog = []; chatQ.length = 0; agent.resetChat(); dir.out.push({ k: 'chat-reset' });
      dir.out.push({ k: 'world', icon: 'dna', text: 'A new cycle begins: the colony starts evolving again.' });
    }
    else if (m.type === 'storm-end') dir.out.push({ k: 'world', icon: 'globe', text: 'The storm has passed.' });
    else if (m.type === 'event' || m.type === 'event-end') dir.out.push({ k: 'world', icon: 'globe', text: m.text });
    else if (m.type === 'rescue') dir.out.push({ k: 'world', icon: 'seed', text: m.text });
  }
  world.msgs.length = 0;
  if (!dir.prot) {
    var found = null;
    if (savedProtId) { for (i = 0; i < world.creatures.length; i++) if (world.creatures[i].id === savedProtId) found = world.creatures[i]; savedProtId = null; }
    if (found) { Sim.makeHero(found); dir.prot = found; setMilestoneIdx(found); }   // continua a mesma história depois de um reinício
    else { var pk = Sim.pickProtagonist(world, null); if (pk.c) startProt(pk.c, null); }
  }
  if (dir.next && now >= dir.switchAt) {
    var nx = dir.next, old = dir.prot;
    if (nx.c && nx.c.alive) startProt(nx.c, nx.descendant ? old : null);
    else { var pk2 = Sim.pickProtagonist(world, null); if (pk2.c) startProt(pk2.c, null); }
  }
  p = dir.prot;
  if (p && p.alive) {
    if (dir.ageIdx < HERO_MILESTONES.length && p.age >= HERO_MILESTONES[dir.ageIdx]) { dir.out.push({ k: 'hero-age', name: p.name, secs: HERO_MILESTONES[dir.ageIdx] }); dir.ageIdx++; }
    if (now > nextIdle) { nextIdle = now + 90000 + Math.random() * 90000; agentSay('idle'); }
  }
}

// ---------- Compras e vendas do token ----------
var recentTrades = [], tradeDirty = false, effectLog = [], walletLast = {}, tradeStatus = { mode: 'off', connected: false, trades: 0 };
function log10(x) { return Math.log(x) / Math.LN10; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

function onTrade(t) {
  var now = Date.now(), who = Trades.shortWallet(t.wallet), effect = null;
  if (!(t.sol >= MIN_SOL)) return;
  // limites: 1 efeito por carteira a cada 5 s e orçamento global por 10 s (evita spam e manipulação)
  var okWallet = !t.wallet || !walletLast[t.wallet] || now - walletLast[t.wallet] > 5000;
  effectLog = effectLog.filter(function (e) { return now - e < 10000; });
  var okBudget = effectLog.length < 8;
  if (okWallet && okBudget) {
    if (t.wallet) walletLast[t.wallet] = now;
    effectLog.push(now);
    var scale = log10(1 + t.sol * 10);
    if (t.side === 'buy') {
      var p = dir.prot && dir.prot.alive ? dir.prot : null, cx = p ? p.x : Sim.W / 2, cy = p ? p.y : Sim.H / 2;
      var n = Sim.nutrientRain(world, clamp(Math.round(6 + 14 * scale), 6, 40), cx, cy, 80);
      var bloom = t.sol >= BLOOM_SOL && Sim.forceEvent(world, 'Nutrient bloom');
      effect = { type: 'rain', n: n, bloom: !!bloom, x: Math.round(cx), y: Math.round(cy) };
      agent.note('rain', 'nutrients rained from above');
      agentSay('rain');
    } else {
      var st = Sim.startStorm(world, clamp(.35 + .3 * scale, .35, 1), clamp(8 + 10 * scale, 8, 40));
      effect = { type: 'storm', secs: Math.round(st.until - world.t), power: Math.round(st.power * 100) / 100 };
      agent.note('storm', 'a storm swept the medium');
      agentSay('storm');
    }
  }
  var rec = { side: t.side, sol: Math.round(t.sol * 100) / 100, who: who, at: now, effect: effect ? effect.type : null };
  recentTrades.unshift(rec); if (recentTrades.length > 6) recentTrades.pop();
  tradeDirty = true;
  dir.out.push({ k: 'trade', side: t.side, sol: rec.sol, who: who, effect: effect });
}

var tradeSource = null;
var HELIUS_KEY = String(process.env.HELIUS_API_KEY || '').trim(), RPC_WSS = String(process.env.RPC_WSS_URL || '').trim();
if (TOKEN_MINT && !PORTAL_KEY) {      // padrão: lê a blockchain direto (Helius grátis); sem chave usa o RPC público, mais limitado
  var wss = RPC_WSS || (HELIUS_KEY ? 'wss://mainnet.helius-rpc.com/?api-key=' + encodeURIComponent(HELIUS_KEY) : 'wss://api.mainnet-beta.solana.com');
  tradeSource = Trades.startChain(TOKEN_MINT, wss, onTrade, tradeStatus); tradeStatus.source = HELIUS_KEY || RPC_WSS ? 'rpc' : 'rpc-publico';
  console.log('Negociações: ao vivo pela blockchain (' + tradeStatus.source + ') para ' + TOKEN_MINT);
} else if (TOKEN_MINT) { tradeSource = Trades.startLive(TOKEN_MINT, PORTAL_KEY, onTrade, tradeStatus); console.log('Negociações: ' + (tradeStatus.mode === 'live' ? 'ao vivo para ' + TOKEN_MINT : 'DESLIGADAS: ' + tradeStatus.error)); }
else if (TRADE_SIM) { tradeSource = Trades.startSimulated(onTrade, tradeStatus); console.log('Negociações: SIMULADAS (TRADE_SIM=1)'); }
else console.log('Negociações: desligadas (defina TOKEN_MINT para ligar, ou TRADE_SIM=1 para testar)');

// ---------- Snapshot compacto ----------
function r1(v) { return Math.round(v * 10) / 10; }
function r2(v) { return Math.round(v * 100) / 100; }
var seq = 0, lastMilestone = world.stats.maxGen, lastLifeNote = world.t;
function snapshot(full) {
  var s = Sim.stats(world), p = dir.prot, i, c, pr = null;
  var cs = [];
  for (i = 0; i < world.creatures.length; i++) {
    c = world.creatures[i];
    cs.push([c.id, r1(c.x), r1(c.y), r2(c.a), r1(c.r), Math.round(c.g.hue), Math.round(c.g.vision), Math.round(c.speed), Math.round(c.e), Math.round(c.age), c.hero ? 1 : 0]);
  }
  if (p) {
    pr = { id: p.id, name: p.name, alive: p.alive, gen: p.gen, age: r1(p.age), e: Math.round(p.e), eaten: p.eaten, kids: p.kids, escapes: p.escapes, mut: p.mut, straight: Math.round(p.straight * 100) / 100,
      thrust: Math.round(p.thrust * 100) / 100, inp: p.inp.map(function (v) { return Math.round(v * 100) / 100; }), hid: p.hid.map(function (v) { return Math.round(v * 100) / 100; }), out: p.out.map(function (v) { return Math.round(v * 100) / 100; }),
      near: { food: p.near.food ? [Math.round(p.near.food.dx), Math.round(p.near.food.dy)] : null, pred: p.near.pred ? [Math.round(p.near.pred.dx), Math.round(p.near.pred.dy), Math.round(p.near.pred.d)] : null },
      lastAte: r1(p.lastAte), lastKid: r1(p.lastKid), lastEscape: r1(p.lastEscape), lastBite: r1(p.lastBite), brain: p.brain.map(function (v) { return Math.round(v * 1000) / 1000; }), vision: Math.round(p.g.vision), hue: Math.round(p.g.hue),
      maxAge: p.maxAge, dormant: !!p.dormant, agent: agentUnlocked() };
  }
  var extra = [];
  if (s.maxGen >= lastMilestone + 10) { lastMilestone = Math.floor(s.maxGen / 10) * 10; extra.push({ k: 'gen', gen: s.maxGen }); }
  if (s.baseLife && world.t > lastLifeNote + 240) { lastLifeNote = world.t; extra.push({ k: 'life', avg: Math.round(s.avgLife), base: Math.round(s.baseLife) }); }
  var msgs = dir.out.concat(extra); dir.out = [];
  var ev = Sim.evoStatus(world);
  var snap = {
    seq: ++seq, t: Math.round(world.t * 1000) / 1000, sp: SIM_SPEED, viewers: clients.length,
    st: { pop: s.pop, gen: s.maxGen, avgLife: Math.round(s.avgLife), baseLife: s.baseLife ? Math.round(s.baseLife) : null, deaths: s.deaths },
    ev: world.event ? world.event.name : null,
    sm: world.storm ? Math.round(world.storm.power * 100) / 100 : 0,
    lv: { n: ev.level, name: ev.name, max: ev.max, p: Math.round(ev.progress * 100) / 100, nx: ev.next ? [ev.next.name, Math.round(ev.next.secs)] : null, left: Math.round(ev.left), cy: ev.cycle },
    cs: cs, fs: world.foods.map(function (f) { return [Math.round(f.x), Math.round(f.y)]; }),
    ps: world.preds.map(function (q) { return [q.id, r1(q.x), r1(q.y), r2(q.a), q.state === 'chase' ? 1 : q.state === 'rest' ? 2 : 0]; }),
    pt: world.patches.map(function (q) { return [Math.round(q.x), Math.round(q.y), Math.round(q.r)]; }),
    pr: pr, msgs: msgs
  };
  if (full || tradeDirty) snap.tr = recentTrades;
  if (full && say) snap.sy = { text: say.text, src: say.src, ago: Math.round((Date.now() - say.at) / 1000) };
  snap.chat = chatOpen() ? 1 : 0;
  if (full) snap.ch = chatLog;
  return snap;
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
    var data = 'data: ' + JSON.stringify(snapshot(false)) + '\n\n', i;
    tradeDirty = false;
    for (i = clients.length - 1; i >= 0; i--) { try { clients[i].write(data); } catch (e) { clients.splice(i, 1); } }
  }
  if (now - lastSave >= SAVE_MS) { lastSave = now; save(); }
}, 50);

// ---------- HTTP ----------
var MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
var PUBLIC = /^\/(index\.html|css\/|js\/|favicon)/;

http.createServer(function (req, res) {
  var parts = (req.url || '/').split('?'), url = decodeURIComponent(parts[0]), qs = {};
  (parts[1] || '').split('&').forEach(function (kv) { var a = kv.split('='); if (a[0]) qs[decodeURIComponent(a[0])] = decodeURIComponent(a[1] || ''); });
  if (url === '/stream') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 2000\n\n');
    res.write('data: ' + JSON.stringify(snapshot(true)) + '\n\n');
    clients.push(res);
    req.on('close', function () { var k = clients.indexOf(res); if (k >= 0) clients.splice(k, 1); });
    return;
  }
  if (url === '/health') {
    var ev = Sim.evoStatus(world);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, t: Math.round(world.t), pop: world.creatures.length, viewers: clients.length, level: ev.level + '/' + ev.max + ' ' + ev.name, cycle: ev.cycle, agentLeft: Math.round(ev.left), hero: dir.prot ? { name: dir.prot.name, ageMin: Math.round(dir.prot.age / 60), alive: dir.prot.alive } : null, trades: tradeStatus, agent: { unlocked: agentUnlocked(), llm: agent.state.llm, chat: chatOpen(), model: agent.state.model, lastErr: agent.state.lastErr, lastChat: agent.state.lastChat } }));
  }
  if (url === '/api/chat') {                             // POST { text }: mensagem para o agente
    if (req.method !== 'POST') { res.writeHead(405, { Allow: 'POST' }); return res.end(); }
    var ip = String((req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket.remoteAddress || 'x').trim(), body = '';
    req.on('data', function (d) { body += d; if (body.length > 2000) req.destroy(); });
    req.on('end', function () {
      var j = {}; try { j = JSON.parse(body); } catch (e) {}
      var r = chatAccept(ip, j.text);
      res.writeHead(r.code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(r.ok ? { ok: true } : { ok: false, error: r.error }));
    });
    return;
  }
  if (url === '/api/test-trade') {                       // compra/venda manual de teste: /api/test-trade?key=SEGREDO&side=buy&sol=0.8
    if (!ADMIN_KEY || qs.key !== ADMIN_KEY) { res.writeHead(404); return res.end('Not found'); }
    var side = qs.side === 'sell' ? 'sell' : 'buy', sol = parseFloat(qs.sol || '0.5');
    onTrade({ side: side, sol: sol, wallet: qs.wallet || ('TEST' + Math.random().toString(36).slice(2, 12) + 'xyz1234567890abcdefghijklmnopqrst'), sig: 'test' + Date.now() });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, side: side, sol: sol }));
  }
  if (url === '/api/test-level') {                       // só para testes: força o próximo nível (exige ADMIN_KEY)
    if (!ADMIN_KEY || qs.key !== ADMIN_KEY) { res.writeHead(404); return res.end('Not found'); }
    Sim.advanceLevel(world);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, level: world.evo.level }));
  }
  if (url === '/') url = '/index.html';
  if (!PUBLIC.test(url) || url.indexOf('..') >= 0) { res.writeHead(404); return res.end('Not found'); }
  var file = path.join(ROOT, url);
  fs.readFile(file, function (err, data) {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}).listen(PORT, '0.0.0.0', function () { console.log('Mundo Vivo no ar na porta ' + PORT + ' (velocidade ' + SIM_SPEED + 'x, dados em ' + DATA_DIR + ')'); });

function bye() { save(); process.exit(0); }
process.on('SIGTERM', bye); process.on('SIGINT', bye);
