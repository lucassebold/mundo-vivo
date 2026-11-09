/* Ícones vetoriais próprios (traço fino, 24x24). Servem para o HTML (SVG) e para o canvas (Path2D). */
(function () {
  var P = {
    alert: 'M12 3.5 22 20.5H2z M12 10v4.5 M12 17.6h.01',
    escape: 'M4 6l7 6-7 6 M12 6l7 6-7 6',
    heart: 'M12 20.5S3.5 15 3.5 9.2A4.7 4.7 0 0 1 12 6.6a4.7 4.7 0 0 1 8.5 2.6c0 5.800-8.500 11.300-8.500 11.300z',
    leaf: 'M5 19.500C5 10.500 11 5 20 5c0 9-5.500 15-14.500 15 M5 19.500 14 10.500',
    battery: 'M3 8h15v8H3z M21 11v2 M6 10.800v2.400',
    target: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7.500a4.500 4.500 0 1 0 0 9 4.500 4.500 0 0 0 0-9z M12 12h.01',
    away: 'M4 12h11 M11 7l-5 5 5 5 M20 5v14',
    spiral: 'M12 12.500a1 1 0 0 1 1.500-1 2.500 2.500 0 0 1-2.500 3.500 4.500 4.500 0 0 1-3-7.500 7 7 0 0 1 11 3',
    sprout: 'M12 21v-9 M12 13c0-4-3-6-7-6 0 4 3 6 7 6z M12 15.500c0-3 2-5 6-5 0 3-2 5-6 5z',
    hourglass: 'M6 3h12 M6 21h12 M7 3c0 5 5 6 5 9s-5 4-5 9 M17 3c0 5-5 6-5 9s5 4 5 9',
    search: 'M10.500 4a6.500 6.500 0 1 0 0 13 6.500 6.500 0 0 0 0-13z M15.500 15.500 21 21',
    skull: 'M12 3a8 8 0 0 0-5.500 13.800V20h11v-3.200A8 8 0 0 0 12 3z M9 11.500h.01 M15 11.500h.01 M10.500 20v-2.500 M13.500 20v-2.500',
    brain: 'M5 6.500a1.800 1.800 0 1 0 0 .01 M5 17.500a1.800 1.800 0 1 0 0 .01 M19 12a1.800 1.800 0 1 0 0 .01 M12 4a1.800 1.800 0 1 0 0 .01 M12 20a1.800 1.800 0 1 0 0 .01 M6.800 7 10.400 5 M6.800 17 10.400 19 M13.600 5 17.400 10.800 M13.600 19 17.400 13.200 M6.500 8.300v7.400',
    dna: 'M8 3c0 4 8 6 8 9s-8 5-8 9 M16 3c0 4-8 6-8 9s8 5 8 9 M9.500 7h5 M9.500 17h5',
    globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M3 12h18 M12 3c3.500 3 3.500 15 0 18 M12 3c-3.500 3-3.500 15 0 18',
    trend: 'M3 17l6-6 4 4 8-8 M15 7h6v6',
    lineage: 'M12 5.500a1.800 1.800 0 1 0 0 .01 M6 19a1.800 1.800 0 1 0 0 .01 M18 19a1.800 1.800 0 1 0 0 .01 M12 7.500v4 M12 11.500 6 17 M12 11.500 18 17',
    cake: 'M4 20h16 M5 20v-7h14v7 M5 16.500c2 1.500 3.500 1.500 7 0s5 1.500 7 0 M12 13V9 M12 6.500c-1-1.500 1-2 0-3.500',
    seed: 'M12 21c-4-3-6-6-6-10a6 6 0 0 1 12 0c0 4-2 7-6 10z M12 8v7',
    wall: 'M3 5h18v14H3z M3 12h18 M9 5v7 M15 12v7',
    close: 'M6 6l12 12 M18 6 6 18'
  };
  var Icons = window.Icons = {};
  Icons.COLOR = { danger: '#ff6b6b', good: '#8dffb0', gold: '#ffd27a', info: '#7aa7ff', accent: '#ffb070', muted: '#a9b6d8' };
  Icons.svg = function (name, size, color) {
    size = size || 16;
    return '<svg class="ic" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="' + (color || 'currentColor') + '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="' + (P[name] || P.search) + '"/></svg>';
  };
  var cache = {};
  Icons.draw = function (ctx, name, x, y, size, color, lw) {
    var p = cache[name] || (cache[name] = new Path2D(P[name] || P.search)), k = size / 24;
    ctx.save(); ctx.translate(x - size / 2, y - size / 2); ctx.scale(k, k);
    ctx.strokeStyle = color; ctx.lineWidth = lw || 1.9; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.stroke(p); ctx.restore();
  };
})();
