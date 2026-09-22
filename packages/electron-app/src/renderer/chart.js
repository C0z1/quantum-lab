// chart.js — gráfico 2D sobre canvas, sin dependencias, con estética enterprise.
// (a) curva de convergencia con relleno degradado; (b) histograma de barras.

const COL = {
  grid: '#1a1a20', axis: '#2a2a33', text: '#6a6a72',
  line: '#2ee6b0', fill: 'rgba(46,230,176,0.14)',
  bar: '#8052ff', hl: '#ffb829',
};

export class Chart2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth || 320, h = this.canvas.clientHeight || 160;
    this.canvas.width = w * dpr; this.canvas.height = h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.W = w; this.H = h;
    if (this._last) this._last();
  }

  clear() { this._last = null; this.ctx.clearRect(0, 0, this.W, this.H); }
  get pad() { return 30; }

  _grid(rows) {
    const ctx = this.ctx, x0 = this.pad, y0 = this.H - 20, plotW = this.W - this.pad - 8, plotH = y0 - 14;
    ctx.clearRect(0, 0, this.W, this.H);
    ctx.strokeStyle = COL.grid; ctx.lineWidth = 1;
    for (const gy of rows) {
      const y = y0 - gy * plotH;
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + plotW, y); ctx.stroke();
      ctx.fillStyle = COL.text; ctx.font = '10px ui-monospace, monospace';
      ctx.fillText(gy.toFixed(1), 4, y + 3);
    }
    ctx.strokeStyle = COL.axis;
    ctx.beginPath(); ctx.moveTo(x0, 8); ctx.lineTo(x0, y0); ctx.lineTo(x0 + plotW, y0); ctx.stroke();
    return { x0, y0, plotW, plotH };
  }

  line(points, { color = COL.line } = {}) {
    this._last = () => this.line(points, { color });
    const { x0, y0, plotW, plotH } = this._grid([0.25, 0.5, 0.75, 1.0]);
    const ctx = this.ctx;
    const maxX = Math.max(1, ...points.map((p) => p.x));
    const X = (x) => x0 + (x / maxX) * plotW;
    const Y = (y) => y0 - Math.max(0, Math.min(1, y)) * plotH;
    if (!points.length) return;
    // relleno
    const grad = ctx.createLinearGradient(0, 8, 0, y0);
    grad.addColorStop(0, COL.fill); grad.addColorStop(1, 'rgba(67,224,160,0)');
    ctx.beginPath(); ctx.moveTo(X(points[0].x), y0);
    points.forEach((p) => ctx.lineTo(X(p.x), Y(p.y)));
    ctx.lineTo(X(points[points.length - 1].x), y0); ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();
    // línea
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    ctx.beginPath(); points.forEach((p, i) => { const fx = X(p.x), fy = Y(p.y); i ? ctx.lineTo(fx, fy) : ctx.moveTo(fx, fy); });
    ctx.stroke();
    // marcadores
    ctx.fillStyle = color;
    for (const p of points) { ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), 3.2, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = COL.text; ctx.font = '10px ui-monospace, monospace';
    ctx.fillText('iteración', x0 + plotW - 54, y0 + 14);
  }

  bars(values, { highlight = [] } = {}) {
    this._last = () => this.bars(values, { highlight });
    const { x0, y0, plotW, plotH } = this._grid([0.5, 1.0]);
    const ctx = this.ctx;
    const n = values.length || 1, maxV = Math.max(1e-9, ...values), bw = plotW / n;
    const hl = new Set(highlight);
    for (let i = 0; i < n; i++) {
      const h = (values[i] / maxV) * plotH;
      if (h < 0.5) continue;
      ctx.fillStyle = hl.has(i) ? COL.hl : COL.bar;
      ctx.fillRect(x0 + i * bw, y0 - h, Math.max(1, bw - 0.5), h);
    }
    ctx.fillStyle = COL.text; ctx.font = '10px ui-monospace, monospace';
    ctx.fillText('0', x0 - 2, y0 + 13);
    ctx.fillText(String(n), x0 + plotW - 14, y0 + 13);
  }
}
