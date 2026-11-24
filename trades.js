// Fonte de compras e vendas do token: PumpPortal (ao vivo), simulada (testes) ou desligada.
// Cada negociação vira { side: 'buy'|'sell', sol: número, wallet: string, sig: string }.
var WebSocket = null;
try { WebSocket = require('ws'); } catch (e) {}

var PORTAL = 'wss://pumpportal.fun/api/data';

function shortWallet(w) {
  if (!w || typeof w !== 'string') return null;
  return w.length > 10 ? w.slice(0, 4) + '…' + w.slice(-4) : w;
}

// Conecta ao PumpPortal e assina as negociações de um token. Reconecta sozinho.
// O PumpPortal só libera subscribeTokenTrade com uma chave de API financiada com pelo menos 0,02 SOL (PUMPPORTAL_API_KEY).
function startLive(mint, apiKey, onTrade, status) {
  if (!WebSocket) { status.mode = 'off'; status.error = 'pacote "ws" não instalado'; return { stop: function () {} }; }
  if (!apiKey) { status.mode = 'off'; status.error = 'defina PUMPPORTAL_API_KEY: o PumpPortal exige uma chave de API (financiada com 0,02 SOL) para ler negociações'; return { stop: function () {} }; }
  var ws = null, stopped = false, backoff = 2000, seen = {}, seenOrder = [];
  status.mode = 'live'; status.connected = false; status.trades = 0;
  function open() {
    if (stopped) return;
    try { ws = new WebSocket(PORTAL + '?api-key=' + encodeURIComponent(apiKey)); } catch (e) { return retry(); }
    ws.on('open', function () {
      status.connected = true; backoff = 2000;
      ws.send(JSON.stringify({ method: 'subscribeTokenTrade', keys: [mint] }));
    });
    ws.on('message', function (raw) {
      var m;
      try { m = JSON.parse(raw.toString()); } catch (e) { return; }
      if (m && m.message && !m.txType) { status.note = String(m.message).slice(0, 200); if (/only available|api key|unauthor/i.test(status.note)) status.error = status.note; return; }
      if (!m || (m.txType !== 'buy' && m.txType !== 'sell')) return;
      if (m.mint && m.mint !== mint) return;
      var sol = Number(m.solAmount);
      if (!(sol > 0)) return;
      if (m.signature) {                       // ignora duplicatas
        if (seen[m.signature]) return;
        seen[m.signature] = 1; seenOrder.push(m.signature);
        if (seenOrder.length > 500) delete seen[seenOrder.shift()];
      }
      status.trades++; status.last = Date.now();
      onTrade({ side: m.txType, sol: sol, wallet: m.traderPublicKey || null, sig: m.signature || null });
    });
    ws.on('close', function () { status.connected = false; retry(); });
    ws.on('error', function (e) { status.error = e && e.message; try { ws.close(); } catch (x) {} });
  }
  function retry() { if (stopped) return; setTimeout(open, backoff); backoff = Math.min(30000, backoff * 1.6); }
  open();
  return { stop: function () { stopped = true; try { ws.close(); } catch (e) {} } };
}

// Negociações falsas, só para testar e ajustar os efeitos antes de existir um token
function startSimulated(onTrade, status) {
  status.mode = 'sim'; status.connected = true; status.trades = 0;
  var stopped = false;
  function rndWallet() { var c = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz', s = '', i; for (i = 0; i < 44; i++) s += c[Math.floor(Math.random() * c.length)]; return s; }
  function next() {
    if (stopped) return;
    var side = Math.random() < .6 ? 'buy' : 'sell', r = Math.random(), sol = r < .6 ? .05 + Math.random() * .3 : r < .9 ? .4 + Math.random() * 1.2 : 2 + Math.random() * 6;
    status.trades++; status.last = Date.now();
    onTrade({ side: side, sol: Math.round(sol * 100) / 100, wallet: rndWallet(), sig: 'sim' + Date.now() });
    setTimeout(next, 4000 + Math.random() * 12000);
  }
  setTimeout(next, 3000);
  return { stop: function () { stopped = true; } };
}

module.exports = { startLive: startLive, startSimulated: startSimulated, shortWallet: shortWallet };
