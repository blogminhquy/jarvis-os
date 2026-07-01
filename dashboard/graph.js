// ============================================
// JARVIS OS - Graph Layer (Graphify)
// Force-directed graph trên canvas thuần, không cần thư viện ngoài.
// Đọc /graph endpoint → vẽ mạng lưới note kết nối qua wikilink.
// ============================================

class JarvisGraph {
  constructor(canvas, tooltip) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.tooltip = tooltip;
    this.nodes = [];
    this.edges = [];
    this.running = false;

    // View transform
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;

    // Interaction
    this.dragging = null;
    this.panning = false;
    this.hoverNode = null;
    this.lastMouse = { x: 0, y: 0 };

    this._bindEvents();
  }

  async load(source = "all") {
    const res = await fetch(`/graph?source=${source}`);
    const data = await res.json();
    this._init(data);
    return data.stats;
  }

  _init(data) {
    const w = this.canvas.width, h = this.canvas.height;
    const cx = w / 2, cy = h / 2;

    this.nodes = data.nodes.map((n, i) => {
      const angle = (i / data.nodes.length) * Math.PI * 2;
      const r = Math.min(w, h) * 0.3;
      return {
        ...n,
        x: cx + Math.cos(angle) * r + (Math.random() - 0.5) * 50,
        y: cy + Math.sin(angle) * r + (Math.random() - 0.5) * 50,
        vx: 0, vy: 0,
        radius: Math.max(4, Math.min(16, 4 + n.links * 1.2)),
      };
    });

    const idMap = {};
    this.nodes.forEach(n => idMap[n.id] = n);
    this.edges = data.edges
      .map(e => ({ source: idMap[e.source], target: idMap[e.target] }))
      .filter(e => e.source && e.target);

    // Reset view, fit
    this.scale = 1; this.offsetX = 0; this.offsetY = 0;
    this._start();
  }

  _start() {
    if (this.running) return;
    this.running = true;
    this.iterations = 0;
    this._loop();
  }

  stop() { this.running = false; }

  _loop() {
    if (!this.running) return;
    if (this.iterations < 300) {
      this._simulate();
      this.iterations++;
    }
    this._render();
    requestAnimationFrame(() => this._loop());
  }

  _simulate() {
    const REPULSION = 6000;
    const SPRING = 0.008;
    const SPRING_LEN = 80;
    const CENTER = 0.002;
    const DAMPING = 0.85;
    const w = this.canvas.width, h = this.canvas.height;
    const cx = w / 2, cy = h / 2;

    // Repulsion giữa các node
    for (let i = 0; i < this.nodes.length; i++) {
      const a = this.nodes[i];
      for (let j = i + 1; j < this.nodes.length; j++) {
        const b = this.nodes[j];
        let dx = a.x - b.x, dy = a.y - b.y;
        let dist2 = dx * dx + dy * dy || 1;
        let dist = Math.sqrt(dist2);
        let force = REPULSION / dist2;
        let fx = (dx / dist) * force, fy = (dy / dist) * force;
        a.vx += fx; a.vy += fy;
        b.vx -= fx; b.vy -= fy;
      }
    }

    // Spring trên edge
    for (const e of this.edges) {
      let dx = e.target.x - e.source.x, dy = e.target.y - e.source.y;
      let dist = Math.sqrt(dx * dx + dy * dy) || 1;
      let force = (dist - SPRING_LEN) * SPRING;
      let fx = (dx / dist) * force, fy = (dy / dist) * force;
      e.source.vx += fx; e.source.vy += fy;
      e.target.vx -= fx; e.target.vy -= fy;
    }

    // Hút về tâm + cập nhật vị trí
    for (const n of this.nodes) {
      n.vx += (cx - n.x) * CENTER;
      n.vy += (cy - n.y) * CENTER;
      n.vx *= DAMPING; n.vy *= DAMPING;
      if (n !== this.dragging) { n.x += n.vx; n.y += n.vy; }
    }
  }

  _render() {
    const ctx = this.ctx;
    const w = this.canvas.width, h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(this.offsetX, this.offsetY);
    ctx.scale(this.scale, this.scale);

    // Edges
    ctx.lineWidth = 0.8;
    for (const e of this.edges) {
      const highlight = this.hoverNode && (e.source === this.hoverNode || e.target === this.hoverNode);
      ctx.strokeStyle = highlight ? "rgba(255,107,43,0.6)" : "rgba(120,120,160,0.15)";
      ctx.beginPath();
      ctx.moveTo(e.source.x, e.source.y);
      ctx.lineTo(e.target.x, e.target.y);
      ctx.stroke();
    }

    // Nodes
    for (const n of this.nodes) {
      const isHover = n === this.hoverNode;
      const isNeighbor = this.hoverNode && this.edges.some(e =>
        (e.source === this.hoverNode && e.target === n) ||
        (e.target === this.hoverNode && e.source === n));
      const dim = this.hoverNode && !isHover && !isNeighbor;

      ctx.globalAlpha = dim ? 0.25 : 1;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
      ctx.fillStyle = n.color;
      ctx.fill();
      if (isHover) {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Label khi zoom đủ lớn hoặc node lớn/hover
      if (this.scale > 1.3 || n.radius > 9 || isHover) {
        ctx.globalAlpha = dim ? 0.3 : 1;
        ctx.fillStyle = "#e8e8f0";
        ctx.font = `${Math.max(9, 11 / this.scale)}px -apple-system, sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(n.label, n.x, n.y + n.radius + 11 / this.scale);
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  _screenToWorld(sx, sy) {
    return {
      x: (sx - this.offsetX) / this.scale,
      y: (sy - this.offsetY) / this.scale,
    };
  }

  _nodeAt(sx, sy) {
    const p = this._screenToWorld(sx, sy);
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const n = this.nodes[i];
      const dx = p.x - n.x, dy = p.y - n.y;
      if (dx * dx + dy * dy <= (n.radius + 3) ** 2) return n;
    }
    return null;
  }

  _bindEvents() {
    const c = this.canvas;

    c.addEventListener("mousedown", (e) => {
      const rect = c.getBoundingClientRect();
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      const node = this._nodeAt(sx, sy);
      if (node) {
        this.dragging = node;
        this.iterations = 0; // re-energize layout
      } else {
        this.panning = true;
      }
      this.lastMouse = { x: sx, y: sy };
    });

    c.addEventListener("mousemove", (e) => {
      const rect = c.getBoundingClientRect();
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;

      if (this.dragging) {
        const p = this._screenToWorld(sx, sy);
        this.dragging.x = p.x; this.dragging.y = p.y;
        this.dragging.vx = 0; this.dragging.vy = 0;
      } else if (this.panning) {
        this.offsetX += sx - this.lastMouse.x;
        this.offsetY += sy - this.lastMouse.y;
      } else {
        const node = this._nodeAt(sx, sy);
        this.hoverNode = node;
        if (node) {
          this.tooltip.style.display = "block";
          this.tooltip.style.left = (e.clientX + 12) + "px";
          this.tooltip.style.top = (e.clientY + 12) + "px";
          this.tooltip.innerHTML = `<strong>${node.label}</strong><br><span class="tt-path">${node.path}</span><br><span class="tt-links">${node.links} kết nối</span>`;
          c.style.cursor = "pointer";
        } else {
          this.tooltip.style.display = "none";
          c.style.cursor = "grab";
        }
      }
      this.lastMouse = { x: sx, y: sy };
    });

    window.addEventListener("mouseup", () => {
      this.dragging = null;
      this.panning = false;
    });

    c.addEventListener("wheel", (e) => {
      e.preventDefault();
      const rect = c.getBoundingClientRect();
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.max(0.2, Math.min(4, this.scale * delta));
      // Zoom về con trỏ
      this.offsetX = sx - (sx - this.offsetX) * (newScale / this.scale);
      this.offsetY = sy - (sy - this.offsetY) * (newScale / this.scale);
      this.scale = newScale;
    }, { passive: false });
  }

  resize() {
    const parent = this.canvas.parentElement;
    this.canvas.width = parent.clientWidth;
    this.canvas.height = parent.clientHeight - 56; // trừ header
  }
}

window.JarvisGraph = JarvisGraph;
