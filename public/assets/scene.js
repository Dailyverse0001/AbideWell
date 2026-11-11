/* Abidewell — living scene.
 *
 * A full-bleed canvas of soft, drifting orbs + a faint starfield. It is the
 * "sky" every screen sits in front of. It re-colours itself to the day's
 * hero colour, follows the pointer with gentle parallax, and can be told to
 * burst particles (e.g. when the reader says Amen).
 *
 * Canvas 2D, not WebGL: far better on phones, and a soft particle field
 * reads as immersive without the weight of a three.js dependency.
 *
 * Usage:
 *   const scene = AbidewellScene(el, { dense: false, interactive: true });
 *   scene.setColors('#3f6cf0', '#2a4fd0');
 *   scene.burst(x, y);
 *   scene.setDensity(20);  // fewer orbs on very small screens
 */
(function () {
  'use strict';

  const REDUCE =
    typeof matchMedia === 'function' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches;

  function hexToRgb(hex) {
    const h = (hex || '').replace('#', '');
    const n = parseInt(
      h.length === 3
        ? h
            .split('')
            .map((c) => c + c)
            .join('')
        : h,
      16
    );
    if (!Number.isFinite(n)) return null;
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function mix(a, b, t) {
    return a + (b - a) * t;
  }

  function blend(a, b) {
    return {
      r: Math.round(mix(a.r, b.r, 0.5)),
      g: Math.round(mix(a.g, b.g, 0.5)),
      b: Math.round(mix(a.b, b.b, 0.5))
    };
  }

  function css(c, alpha) {
    const a = alpha == null ? 1 : alpha;
    return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + a + ')';
  }

  class Scene {
    constructor(canvas, opts) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.opts = Object.assign({ dense: false, interactive: true }, opts);
      this.orbs = [];
      this.stars = [];
      this.particles = [];
      this.dpr = 1;
      this.w = 0;
      this.h = 0;
      this.pointer = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };
      this.colors = {
        a: { r: 63, g: 108, b: 240 },
        b: { r: 42, g: 79, b: 208 },
        c: { r: 244, g: 242, b: 236 } // paper
      };
      this.running = false;
      this.raf = 0;
      this.last = 0;

      this.resize = this.resize.bind(this);
      this.onPointer = this.onPointer.bind(this);
      this.tick = this.tick.bind(this);
      this.onVisibility = this.onVisibility.bind(this);

      window.addEventListener('resize', this.resize, { passive: true });
      if (this.opts.interactive && !REDUCE) {
        window.addEventListener('pointermove', this.onPointer, { passive: true });
      }
      document.addEventListener('visibilitychange', this.onVisibility);

      this.resize();
      this.populate();
      this.start();
    }

    setColors(hexA, hexB, hexPaper) {
      const a = hexToRgb(hexA) || this.colors.a;
      const b = hexToRgb(hexB) || this.colors.b;
      if (hexPaper) this.colors.c = hexToRgb(hexPaper) || this.colors.c;
      this.colors.a = a;
      this.colors.b = b;
      this.buildSprites();
    }

    setDensity(count) {
      this.opts.dense = count > 26;
      this.populate();
    }

    /* Each orb is rendered ONCE to a small offscreen canvas, then blitted
       with drawImage every frame: 26 radial-gradient allocations/frame is
       what makes the scene heavy on phones. */
    buildSprites() {
      const S = 128;
      this.orbSprite = document.createElement('canvas');
      this.orbSprite.width = S;
      this.orbSprite.height = S;
      const oc = this.orbSprite.getContext('2d');
      const mixc = blend(this.colors.a, this.colors.b, 0.5);
      const g = oc.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      g.addColorStop(0, css(mixc, 0.32));
      g.addColorStop(0.55, css(mixc, 0.14));
      g.addColorStop(1, css(mixc, 0));
      oc.fillStyle = g;
      oc.fillRect(0, 0, S, S);

      this.starSprite = document.createElement('canvas');
      this.starSprite.width = 32;
      this.starSprite.height = 32;
      const sc = this.starSprite.getContext('2d');
      const sg = sc.createRadialGradient(16, 16, 0, 16, 16, 16);
      sg.addColorStop(0, css(this.colors.c, 0.9));
      sg.addColorStop(0.4, css(this.colors.c, 0.35));
      sg.addColorStop(1, css(this.colors.c, 0));
      sc.fillStyle = sg;
      sc.fillRect(0, 0, 32, 32);
    }

    populate() {
      const small = Math.min(this.w, this.h) < 480;
      const orbCount = this.opts.dense ? (small ? 12 : 18) : small ? 7 : 12;
      const starCount = this.opts.dense ? (small ? 70 : 120) : small ? 45 : 80;

      this.orbs = [];
      for (let i = 0; i < orbCount; i += 1) this.orbs.push(this.makeOrb(true));

      this.stars = [];
      for (let i = 0; i < starCount; i += 1) {
        this.stars.push({
          x: Math.random(),
          y: Math.random(),
          r: 0.4 + Math.random() * 1.4,
          tw: Math.random() * Math.PI * 2,
          tws: 0.4 + Math.random() * 1.6,
          depth: 0.2 + Math.random() * 0.8
        });
      }
    }

    makeOrb(anywhere) {
      const t = Math.random();
      const color = blend(this.colors.a, this.colors.b, t);
      const big = Math.random() < 0.5;
      return {
        x: Math.random(),
        y: anywhere ? Math.random() : 1 + Math.random() * 0.2,
        vx: (Math.random() - 0.5) * 0.00016,
        vy: -(0.00008 + Math.random() * 0.00018),
        r: big ? 0.22 + Math.random() * 0.3 : 0.08 + Math.random() * 0.12,
        a: 0.5 + Math.random() * (big ? 0.5 : 0.4),
        color,
        parallax: 0.2 + Math.random() * 0.8,
        phase: Math.random() * Math.PI * 2,
        phaseSpeed: 0.2 + Math.random() * 0.5
      };
    }

    burst(x, y, count) {
      if (REDUCE || !this.opts.interactive) return;
      const cx = x != null ? x / this.w : 0.5;
      const cy = y != null ? y / this.h : 0.4;
      const n = count || 42;
      const mixc = blend(this.colors.a, this.colors.b, 0.5);
      for (let i = 0; i < n; i += 1) {
        const ang = Math.random() * Math.PI * 2;
        const sp = 0.5 + Math.random() * 6.5;
        this.particles.push({
          x: cx,
          y: cy,
          vx: Math.cos(ang) * sp,
          vy: Math.sin(ang) * sp - 1.5,
          r: 1.5 + Math.random() * 3.5,
          life: 1,
          decay: 0.012 + Math.random() * 0.02,
          color: Math.random() < 0.5 ? this.colors.a : this.colors.b,
          g: 0.02 + Math.random() * 0.02
        });
      }
      if (this.particles.length > 400) this.particles.splice(0, this.particles.length - 400);
    }

    resize() {
      this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      this.w = this.canvas.clientWidth || window.innerWidth;
      this.h = this.canvas.clientHeight || window.innerHeight;
      this.canvas.width = Math.floor(this.w * this.dpr);
      this.canvas.height = Math.floor(this.h * this.dpr);
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }

    onPointer(e) {
      this.pointer.tx = e.clientX / Math.max(1, this.w);
      this.pointer.ty = e.clientY / Math.max(1, this.h);
    }

    onVisibility() {
      if (document.hidden) {
        this.stop();
      } else {
        this.start();
      }
    }

    start() {
      if (this.running) return;
      this.running = true;
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.tick);
    }

    stop() {
      this.running = false;
      cancelAnimationFrame(this.raf);
    }

    /* Half-rate rendering: the sky drifts slowly, so 30fps is indistinguishable
       from 60fps and halves the CPU cost on every phone. */
    tick(now) {
      if (!this.running) return;

      const frame = 33; // ms between renders
      if (now - this.last < frame) {
        this.raf = requestAnimationFrame(this.tick);
        return;
      }

      const dt = Math.min(48, now - this.last);
      this.last = now;

      // damp the pointer
      this.pointer.x += (this.pointer.tx - this.pointer.x) * 0.06;
      this.pointer.y += (this.pointer.ty - this.pointer.y) * 0.06;

      const px = (this.pointer.x - 0.5) * 2;
      const py = (this.pointer.y - 0.5) * 2;

      const ctx = this.ctx;
      const w = this.w;
      const h = this.h;

      ctx.clearRect(0, 0, w, h);

      // orbs: blit the pre-rendered sprite, no per-frame gradient allocation
      for (const o of this.orbs) {
        o.x += o.vx * dt * 60;
        o.y += o.vy * dt * 60;
        o.phase += o.phaseSpeed * (dt / 16);
        // wrap
        if (o.y < -0.4) {
          o.y = 1.4;
          o.x = Math.random();
        }
        if (o.x < -0.4) o.x = 1.4;
        if (o.x > 1.4) o.x = -0.4;

        const breathe = 1 + 0.06 * Math.sin(o.phase);
        const ox = px * 40 * o.parallax;
        const oy = py * 40 * o.parallax;
        const cx = o.x * w + ox;
        const cy = o.y * h + oy;
        const R = o.r * Math.min(w, h) * breathe;

        ctx.globalAlpha = o.a;
        ctx.drawImage(this.orbSprite, cx - R, cy - R, R * 2, R * 2);
      }

      // stars: blit the small sprite, twinkle via alpha
      for (const s of this.stars) {
        s.tw += s.tws * (dt / 16);
        const tw = 0.35 + 0.35 * Math.sin(s.tw);
        const ox = px * 22 * s.depth;
        const oy = py * 22 * s.depth;
        const sx = s.x * w + ox;
        const sy = s.y * h + oy;
        const size = s.r * 4;
        ctx.globalAlpha = tw * 0.5;
        ctx.drawImage(this.starSprite, sx - size / 2, sy - size / 2, size, size);
      }

      // particles (bursts)
      for (let i = this.particles.length - 1; i >= 0; i -= 1) {
        const p = this.particles[i];
        p.life -= p.decay * (dt / 16);
        if (p.life <= 0) {
          this.particles.splice(i, 1);
          continue;
        }
        p.vy += p.g * (dt / 16);
        p.x += (p.vx / w) * (dt / 16);
        p.y += (p.vy / h) * (dt / 16);
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = css(p.color);
        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      this.raf = requestAnimationFrame(this.tick);
    }
  }

  function init(canvas, opts) {
    if (!canvas) return null;
    return new Scene(canvas, opts);
  }

  /* Shared chrome for every screen in the living sky: the cursor ring and
     the magnetic pull on buttons. Runs only on fine pointers and never when
     the user asks for reduced motion. */
  function initChrome() {
    const fine =
      window.matchMedia &&
      window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const reduce =
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!fine || reduce) return;

    /* magnetic pull: .magnet and .amen lean toward the pointer while hovered */
    document.querySelectorAll('.magnet, .amen').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const x = e.clientX - (r.left + r.width / 2);
        const y = e.clientY - (r.top + r.height / 2);
        el.style.transform =
          'translate(' + x * 0.12 + 'px,' + y * 0.22 + 'px)';
      });
      el.addEventListener('pointerleave', () => {
        el.style.transform = '';
      });
    });

    /* the cursor ring */
    const ring = document.querySelector('.cursor');
    if (ring) {
      const dot = ring.querySelector('.cursor-dot');
      let cx = 0, cy = 0, rx = 0, ry = 0;

      window.addEventListener(
        'pointermove',
        (e) => {
          cx = e.clientX;
          cy = e.clientY;
          if (dot) {
            dot.style.left = cx + 'px';
            dot.style.top = cy + 'px';
          }
        },
        { passive: true }
      );

      (function raf() {
        rx += (cx - rx) * 0.18;
        ry += (cy - ry) * 0.18;
        ring.style.left = rx + 'px';
        ring.style.top = ry + 'px';
        requestAnimationFrame(raf);
      })();

      document
        .querySelectorAll('a, button, .archive-item, [tabindex]')
        .forEach((el) => {
          el.addEventListener('pointerenter', () => ring.classList.add('is-hover'));
          el.addEventListener('pointerleave', () => ring.classList.remove('is-hover'));
        });
    }
  }

  window.AbidewellScene = { init, initChrome, hexToRgb };
})();
