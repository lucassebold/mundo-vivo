/* Desenho do mundo (visão de cima), da protagonista e do cérebro. */
(function () {
  var R = window.Render = {};
  var TAU = Math.PI * 2;

  function creature(ctx, c, t, o) {
    o = o || {};
    var r = c.r, sp = Math.min(1, c.speed / 110), wig = Math.sin(t * 12 + c.id) * (.25 + sp * .5);
    var hunger = c.e < 35;
    var col = 'hsl(' + c.g.hue + ',' + (hunger ? 25 : 68) + '%,' + (o.prot ? 66 : 56) + '%)';
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.a);
    ctx.globalAlpha = o.alpha === undefined ? 1 : o.alpha;
    // cauda
    ctx.fillStyle = col; ctx.beginPath();
    ctx.moveTo(-r * 1.3, 0); ctx.lineTo(-r * 2.5, wig * r * 1.2 - r * .5); ctx.lineTo(-r * 2.5, wig * r * 1.2 + r * .5); ctx.closePath(); ctx.fill();
    // corpo
    ctx.beginPath(); ctx.ellipse(0, 0, r * 1.5, r, 0, 0, TAU); ctx.fill();
    if (o.prot) { ctx.strokeStyle = '#ffd9a8'; ctx.lineWidth = 2; ctx.stroke(); }
    // olhos: quanto maiores, maior a visão
    var er = 1.2 + c.g.vision / 220 * 2.4;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(r * .75, -r * .45, er, 0, TAU); ctx.arc(r * .75, r * .45, er, 0, TAU); ctx.fill();
    ctx.fillStyle = '#10131c';
    ctx.beginPath(); ctx.arc(r * .75 + er * .3, -r * .45, er * .5, 0, TAU); ctx.arc(r * .75 + er * .3, r * .45, er * .5, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function pred(ctx, p, t) {
    var chase = p.state === 'chase', rest = p.state === 'rest';
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a);
    if (chase) { ctx.shadowColor = '#ff3b3b'; ctx.shadowBlur = 24; }
    ctx.globalAlpha = rest ? .55 : 1;
    ctx.fillStyle = chase ? '#d12b2b' : '#7d1d2c';
    ctx.beginPath();
    var i, a, rr;
    for (i = 0; i < 14; i++) { a = i / 14 * TAU; rr = i % 2 ? p.r * .95 : p.r * 1.55; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0; ctx.fillStyle = '#ffd1d1';
    ctx.beginPath(); ctx.arc(p.r * .6, -p.r * .35, 2.6, 0, TAU); ctx.arc(p.r * .6, p.r * .35, 2.6, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // cam: { x, y, z }; prot: criatura protagonista (ou null); bubble: emoji sobre ela
  R.world = function (ctx, w, h, world, cam, prot, t, bubble) {
    var bg = ctx.createRadialGradient(w / 2, h / 2, 50, w / 2, h / 2, Math.max(w, h) * .8);
    bg.addColorStop(0, '#0a1620'); bg.addColorStop(1, '#02030a');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2, h / 2); ctx.scale(cam.z, cam.z); ctx.translate(-cam.x, -cam.y);

    // chão do mundo
    ctx.fillStyle = '#071a1c'; ctx.fillRect(0, 0, Sim.W, Sim.H);
    ctx.strokeStyle = 'rgba(120,200,190,.05)'; ctx.lineWidth = 1; ctx.beginPath();
    var g;
    for (g = 0; g <= Sim.W; g += 100) { ctx.moveTo(g, 0); ctx.lineTo(g, Sim.H); }
    for (g = 0; g <= Sim.H; g += 100) { ctx.moveTo(0, g); ctx.lineTo(Sim.W, g); }
    ctx.stroke();
    var i, p;
    for (i = 0; i < world.patches.length; i++) {
      p = world.patches[i];
      var rg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 2.4);
      rg.addColorStop(0, 'rgba(70,200,120,.16)'); rg.addColorStop(1, 'rgba(70,200,120,0)');
      ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 2.4, 0, TAU); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(160,230,220,.35)'; ctx.lineWidth = 3; ctx.strokeRect(0, 0, Sim.W, Sim.H);

    // comida
    ctx.fillStyle = '#a6ff8f';
    for (i = 0; i < world.foods.length; i++) {
      var f = world.foods[i], s = 3 + Math.sin(t * 3 + f.ph) * .6;
      ctx.beginPath(); ctx.arc(f.x, f.y, s, 0, TAU); ctx.fill();
    }

    // o que a protagonista enxerga
    if (prot && prot.alive) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,217,168,.18)'; ctx.setLineDash([6, 8]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(prot.x, prot.y, prot.g.vision, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      if (prot.near.food) { ctx.strokeStyle = 'rgba(166,255,143,.55)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(prot.x, prot.y); ctx.lineTo(prot.x + prot.near.food.dx, prot.y + prot.near.food.dy); ctx.stroke(); }
      if (prot.near.pred) { ctx.strokeStyle = 'rgba(255,90,90,.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(prot.x, prot.y); ctx.lineTo(prot.x + prot.near.pred.dx, prot.y + prot.near.pred.dy); ctx.stroke(); }
      // rastro
      var tr = prot.trail;
      if (tr.length > 4) {
        ctx.lineWidth = 2.5; ctx.lineCap = 'round';
        for (i = 2; i < tr.length; i += 2) { ctx.strokeStyle = 'rgba(255,176,112,' + (i / tr.length * .5) + ')'; ctx.beginPath(); ctx.moveTo(tr[i - 2], tr[i - 1]); ctx.lineTo(tr[i], tr[i + 1]); ctx.stroke(); }
      }
      ctx.restore();
    }

    // criaturas ao fundo
    var cs = world.creatures;
    for (i = 0; i < cs.length; i++) if (cs[i] !== prot) creature(ctx, cs[i], t, { alpha: .72 });
    for (i = 0; i < world.preds.length; i++) pred(ctx, world.preds[i], t);

    if (prot && prot.alive) {
      var rg2 = ctx.createRadialGradient(prot.x, prot.y, 4, prot.x, prot.y, 46 + Math.sin(t * 4) * 4);
      rg2.addColorStop(0, 'rgba(255,200,140,.45)'); rg2.addColorStop(1, 'rgba(255,176,112,0)');
      ctx.fillStyle = rg2; ctx.beginPath(); ctx.arc(prot.x, prot.y, 50, 0, TAU); ctx.fill();
      creature(ctx, prot, t, { prot: true });
      if (bubble) {
        var bx = prot.x, by = prot.y - prot.r * 2 - 30;
        ctx.fillStyle = 'rgba(8,10,22,.86)'; ctx.beginPath(); ctx.arc(bx, by, 17, 0, TAU); ctx.fill();
        ctx.strokeStyle = bubble.c; ctx.lineWidth = 1.6; ctx.globalAlpha = .85; ctx.stroke(); ctx.globalAlpha = 1;
        // rabinho do balão
        ctx.fillStyle = 'rgba(8,10,22,.86)'; ctx.beginPath(); ctx.moveTo(bx - 4, by + 15); ctx.lineTo(bx + 4, by + 15); ctx.lineTo(bx, by + 21); ctx.closePath(); ctx.fill();
        Icons.draw(ctx, bubble.i, bx, by, 19, bubble.c, 2);
      }
    }
    ctx.restore();

    var vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .45, w / 2, h / 2, Math.max(w, h) * .75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,6,.6)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
  };

  // Rede neural da protagonista: neurônios brilham, sinais viajam pelas conexões
  var IN_LABELS = ['frente', 'lado', 'perto', 'frente', 'lado', 'perto', 'energia', 'parede'];
  var GROUP = [{ a: 0, b: 2, t: 'COMIDA', icon: 'leaf', col: '#8dffb0' }, { a: 3, b: 5, t: 'PREDADOR', icon: 'alert', col: '#ff6b6b' }, { a: 6, b: 6, t: 'ENERGIA', icon: 'battery', col: '#ffb070' }, { a: 7, b: 7, t: 'PAREDE', icon: 'wall', col: '#a9b6d8' }];
  function bez(xa, ya, xb, yb, p) {
    var cx = xa + (xb - xa) * .5, u = 1 - p;
    return [u * u * u * xa + 3 * u * u * p * cx + 3 * u * p * p * cx + p * p * p * xb, u * u * u * ya + 3 * u * u * p * ya + 3 * u * p * p * yb + p * p * p * yb];
  }
  R.brain = function (cv, c, t) {
    var ctx = cv.getContext('2d'), w = cv.width, h = cv.height;
    ctx.clearRect(0, 0, w, h);
    if (!c) return;
    var NIN = Sim.NIN, NH = Sim.NH, NOUT = Sim.NOUT, i, j, k = 0;
    var X0 = 300, X1 = w / 2 + 10, X2 = w - 230, top = 74, bot = h - 30, gap = 22;
    function yin(n) { var g = n < 3 ? 0 : n < 6 ? 1 : n < 7 ? 2 : 3; return top + n * ((bot - top - 3 * gap) / (NIN - 1)) + g * gap; }
    function yh(n) { return top + (bot - top) * (n + .5) / NH; }
    function yo(n) { return top + (bot - top) * (.3 + n * .4); }
    var wts = c.brain, ws1 = [], ws2 = [], edges = [];
    for (j = 0; j < NH; j++) { ws1[j] = []; for (i = 0; i < NIN; i++) ws1[j][i] = wts[k++]; k++; }
    for (j = 0; j < NOUT; j++) { ws2[j] = []; for (i = 0; i < NH; i++) ws2[j][i] = wts[k++]; k++; }
    for (j = 0; j < NH; j++) for (i = 0; i < NIN; i++) edges.push({ xa: X0, ya: yin(i), xb: X1, yb: yh(j), w: ws1[j][i], act: c.inp[i] });
    for (j = 0; j < NOUT; j++) for (i = 0; i < NH; i++) edges.push({ xa: X1, ya: yh(i), xb: X2, yb: yo(j), w: ws2[j][i], act: c.hid[i] });

    // cabeçalhos de coluna
    ctx.font = '700 19px Outfit, system-ui, sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(205,218,255,.55)';
    ctx.fillText('V Ê', X0, 30); ctx.fillText('P E N S A', X1, 30); ctx.fillText('A G E', X2, 30);
    ctx.strokeStyle = 'rgba(205,218,255,.12)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X0 - 60, 46); ctx.lineTo(X0 + 60, 46); ctx.moveTo(X1 - 60, 46); ctx.lineTo(X1 + 60, 46); ctx.moveTo(X2 - 60, 46); ctx.lineTo(X2 + 60, 46); ctx.stroke();

    // conexões
    var e, flow;
    ctx.lineCap = 'round';
    for (k = 0; k < edges.length; k++) {
      e = edges[k]; e.flow = Math.abs(e.w * e.act);
      if (Math.abs(e.w) < .3) continue;
      var a = .12 + Math.min(.55, e.flow * .3) + Math.min(.2, Math.abs(e.w) * .05);
      ctx.strokeStyle = e.w > 0 ? 'rgba(122,167,255,' + a + ')' : 'rgba(255,107,107,' + a + ')';
      ctx.lineWidth = 1.1 + Math.min(3, e.flow * 1.2 + Math.abs(e.w) * .3);
      ctx.beginPath(); ctx.moveTo(e.xa, e.ya); ctx.bezierCurveTo(e.xa + (e.xb - e.xa) * .5, e.ya, e.xa + (e.xb - e.xa) * .5, e.yb, e.xb, e.yb); ctx.stroke();
    }
    // sinais viajando pelas conexões mais ativas
    var top36 = edges.filter(function (q) { return q.flow > .25 && Math.abs(q.w) >= .3; }).sort(function (q1, q2) { return q2.flow - q1.flow; }).slice(0, 40);
    var amb = edges.filter(function (q) { return Math.abs(q.w) >= 1; }).sort(function (q1, q2) { return Math.abs(q2.w) - Math.abs(q1.w); }).slice(0, 18);
    for (k = 0; k < amb.length; k++) {
      e = amb[k]; var pa = bez(e.xa, e.ya, e.xb, e.yb, ((t * .3 + k * .21) % 1));
      var gg = ctx.createRadialGradient(pa[0], pa[1], 0, pa[0], pa[1], 9);
      gg.addColorStop(0, e.w > 0 ? 'rgba(160,200,255,.55)' : 'rgba(255,150,150,.55)'); gg.addColorStop(1, 'rgba(160,200,255,0)');
      ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(pa[0], pa[1], 9, 0, TAU); ctx.fill();
    }
    for (k = 0; k < top36.length; k++) {
      e = top36[k];
      var ph = ((t * .55 + k * .137) % 1), pt = bez(e.xa, e.ya, e.xb, e.yb, ph), rr = 2 + Math.min(2.5, e.flow);
      var g = ctx.createRadialGradient(pt[0], pt[1], 0, pt[0], pt[1], rr * 3.2);
      var col = e.w > 0 ? '170,205,255' : '255,150,150';
      g.addColorStop(0, 'rgba(' + col + ',.95)'); g.addColorStop(1, 'rgba(' + col + ',0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(pt[0], pt[1], rr * 3.2, 0, TAU); ctx.fill();
    }

    function neuron(x, y, v, rad) {
      var act = Math.min(1, Math.abs(v) + .1 + .07 * Math.sin(t * 2.2 + x * .01 + y * .03)), rgb = v >= 0 ? '255,190,120' : '115,165,255';
      var glow = ctx.createRadialGradient(x, y, 0, x, y, rad + 6 + act * 20);
      glow.addColorStop(0, 'rgba(' + rgb + ',' + (.15 + act * .55) + ')'); glow.addColorStop(1, 'rgba(' + rgb + ',0)');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, rad + 6 + act * 20, 0, TAU); ctx.fill();
      ctx.fillStyle = '#0a1020'; ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(' + rgb + ',' + (.35 + act * .65) + ')'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = 'rgba(' + rgb + ',' + (.15 + act * .85) + ')'; ctx.beginPath(); ctx.arc(x, y, rad * (.35 + act * .45), 0, TAU); ctx.fill();
    }
    // entradas com rótulos agrupados
    var gi, gr, ys;
    for (gi = 0; gi < GROUP.length; gi++) {
      gr = GROUP[gi];
      ys = (yin(gr.a) + yin(gr.b)) / 2;
      Icons.draw(ctx, gr.icon, 30, ys, 30, gr.col, 1.7);
      ctx.textAlign = 'left'; ctx.font = '800 17px Outfit, system-ui, sans-serif'; ctx.fillStyle = gr.col;
      ctx.fillText(gr.t, 56, ys - (gr.b > gr.a ? 24 : 0));
    }
    ctx.font = '500 17px Outfit, system-ui, sans-serif'; ctx.textAlign = 'right';
    for (i = 0; i < NIN; i++) {
      var lab = IN_LABELS[i];
      if (i < 6) { ctx.fillStyle = 'rgba(205,218,255,' + (.4 + Math.min(.55, Math.abs(c.inp[i]) * .6)) + ')'; ctx.fillText(lab, X0 - 26, yin(i)); }
    }
    for (i = 0; i < NIN; i++) neuron(X0, yin(i), c.inp[i], 12);
    for (j = 0; j < NH; j++) neuron(X1, yh(j), c.hid[j], 13);

    // saídas
    var turn = c.out[0], acc = (c.out[1] + 1) / 2;
    neuron(X2, yo(0), turn, 19); neuron(X2, yo(1), c.out[1], 19);
    ctx.textAlign = 'left';
    ctx.font = '800 26px Outfit, system-ui, sans-serif'; ctx.fillStyle = '#fff';
    ctx.fillText('virar', X2 + 30, yo(0) - 12);
    ctx.fillText('acelerar', X2 + 30, yo(1) - 12);
    ctx.font = '500 18px Outfit, system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,214,160,.95)';
    ctx.fillText(Math.abs(turn) < .15 ? 'seguindo reto' : (turn > 0 ? 'para a direita ' : 'para a esquerda ') + Math.round(Math.abs(turn) * 100) + '%', X2 + 30, yo(0) + 12);
    ctx.fillText(Math.round(acc * 100) + '% da velocidade', X2 + 30, yo(1) + 12);
  };
})();
