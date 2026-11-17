/*
  fx.js - experimental scroll effects (fx.css is the still half). Load after the system scripts:
    <link rel="stylesheet" href="assets/fx/fx.css">
    <script src="assets/fx/lenis.min.js" defer></script>
    <script type="module" src="assets/fx/fx.js"></script>

  Switches, on <html>: data-fx="smooth curve reveal wind" (the default is all four; "off" is none).
    smooth  eased, weighted scrolling (Lenis; wheel and keyboard only, touch keeps native scrolling)
    curve   one thick line drawn down the page as it scrolls, weaving between the sections
    reveal  every h2 rises line by line from behind its own edge when it comes into view
    wind    photographs come in warped, corners trailing as if blown, and settle flat;
            scrolling fast ruffles them again. Add data-fx-wind to any other box (a video too).

  Off under prefers-reduced-motion, with <html data-motion="off">, and in a headless screenshot
  (unless <html data-motion="live">), the same rules motion.js follows.
*/
const html = document.documentElement;
const main = document.querySelector('main');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const shot = /HeadlessChrome/.test(navigator.userAgent) && html.dataset.motion !== 'live';
const want = (html.dataset.fx ?? 'smooth curve reveal wind').split(/\s+/);
const on = name => want.includes(name);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const WIND_SEL = '.frame--photo, .pl-photo, [data-fx-wind]';
const HEAD_SEL = 'main h2, footer.closing h2';

if (main && !reduced && !shot && html.dataset.motion !== 'off' && !on('off')) start();

function start() {
  const ticks = [];                 // (time, scrollY, velocity) each frame
  const measures = [];              // re-read the layout

  /* ------------------------------------------------------------ smooth */
  let lenis = null;
  if (on('smooth') && typeof window.Lenis === 'function') {
    lenis = new window.Lenis({ lerp: 0.085, wheelMultiplier: 0.9, anchors: true, autoRaf: false });
    // the mobile menu locks the page: let it
    new MutationObserver(() => document.body.classList.contains('nav-locked') ? lenis.stop() : lenis.start())
      .observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }

  /* ------------------------------------------------------------ reveal */
  if (on('reveal')) {
    const heads = [...document.querySelectorAll(HEAD_SEL)];
    heads.forEach(h => {
      // words only: an h2 with markup inside is left alone
      if (h.children.length) return;
      const words = h.textContent.trim().split(/\s+/);
      h.textContent = '';
      words.forEach((w, i) => {
        const outer = document.createElement('span'); outer.className = 'fx-w';
        const inner = document.createElement('span'); inner.textContent = w;
        outer.append(inner); h.append(outer);
        if (i < words.length - 1) h.append(' ');
      });
      h.classList.add('fx-h');
    });
    html.classList.add('fx-reveal');
    const show = h => {
      // the words on one line leave together, each line a beat after the one above
      let line = -1, top = null;
      h.querySelectorAll('.fx-w').forEach(w => {
        if (w.offsetTop !== top) { top = w.offsetTop; line++; }
        w.firstChild.style.setProperty('--fx-l', line);
      });
      h.classList.add('is-in');
    };
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { show(e.target); io.unobserve(e.target); }
    }), { rootMargin: '0px 0px -12% 0px', threshold: 0.2 });
    document.querySelectorAll('.fx-h').forEach(h => io.observe(h));
    // never leave a heading hidden: anything the observer missed shows after 4s on the page
    setTimeout(() => document.querySelectorAll('.fx-h:not(.is-in)').forEach(h => {
      const r = h.getBoundingClientRect();
      if (r.top < innerHeight && r.bottom > 0) show(h);
    }), 4000);
  }

  /* ------------------------------------------------------------ curve */
  if (on('curve')) {
    main.classList.add('fx-main');
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'fx-curve'); svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(NS, 'path');
    svg.append(path); main.prepend(svg);

    let table = [];                 // [length, deepest y so far] along the path
    let total = 0, drawn = 0, mainTop = 0;

    // a smooth line through the points (Catmull-Rom as cubic Beziers)
    const spline = pts => {
      let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
        const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
        const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
        d += `C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
      }
      return d;
    };
    // a full turn around (cx, cy), entered and left at its top
    const loop = (cx, cy, r, dir) => [[cx, cy - r], [cx + dir * r, cy], [cx, cy + r], [cx - dir * r, cy], [cx, cy - r * 0.96]];

    const build = () => {
      const mr = main.getBoundingClientRect();
      const W = mr.width, H = main.offsetHeight;
      mainTop = mr.top + scrollY;
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      const wide = W >= 900;
      const secs = [...main.children].filter(s => s.matches('section')).map(s => {
        const r = s.getBoundingClientRect();
        return { el: s, top: r.top - mr.top, bottom: r.bottom - mr.top, h: r.height, pinned: s.matches('[data-moment]') };
      });
      if (!secs.length) return;
      const edgeL = wide ? -0.03 * W : -0.08 * W, edgeR = wide ? 1.03 * W : 1.08 * W;
      const mid = wide ? 0.495 * W : 0.86 * W;       // the empty column between text and picture
      const runs = [];                                // each run is one unbroken stroke
      let pts = [];
      let side = -1;                                  // which edge the line swings out to next

      // it leaves from under the hero picture
      const hero = secs[0];
      const pic = hero.el.querySelector('.hero__media');
      const pr = pic ? pic.getBoundingClientRect() : null;
      const sx = pr ? pr.left - mr.left + pr.width * 0.35 : W * 0.7;
      const sy = pr ? pr.bottom - mr.top - pr.height * 0.25 : hero.bottom - 80;
      pts.push([sx, sy], [sx - W * 0.04, hero.bottom - 10]);

      secs.slice(1).forEach((s, i) => {
        if (s.pinned) {                               // a section that holds the screen: the line stops, and starts again below
          pts.push([side < 0 ? edgeL : edgeR, s.top + 40]);
          runs.push(pts); pts = [[side < 0 ? edgeL : edgeR, s.bottom - 60]];
          return;
        }
        const out = side < 0 ? edgeL : edgeR;
        const r = clamp(s.h * 0.16, 60, wide ? 150 : 80);
        if (i === 0 && wide) {
          // one loop on the way in, the way a ribbon turns over
          pts.push(...loop(W * 0.2, s.top + r * 0.2, r, 1));
        }
        pts.push([out, s.top + s.h * 0.2]);           // swing out to the edge
        pts.push([mid, s.top + s.h * 0.52]);          // come back through the gap
        if (i % 3 === 2 && wide) pts.push(...loop(mid + side * W * 0.1, s.top + s.h * 0.72, r * 0.8, -side));
        side = -side;
        pts.push([side < 0 ? W * 0.18 : W * 0.82, s.bottom - 6]);
      });
      const last = secs[secs.length - 1];
      pts.push([W * 0.5, last.bottom + 40]);
      runs.push(pts);

      path.setAttribute('d', runs.filter(r => r.length > 1).map(spline).join(''));
      total = path.getTotalLength();
      path.style.strokeDasharray = `${total} ${total}`;
      // how far along the line is, for every depth of the page
      table = [];
      const step = Math.max(8, total / 1200);
      let deep = -Infinity;
      for (let l = 0; l <= total; l += step) {
        deep = Math.max(deep, path.getPointAtLength(l).y);
        table.push([l, deep]);
      }
      drawn = Math.min(drawn, total);
    };
    const lengthAt = y => {
      let lo = 0, hi = table.length - 1;
      if (!table.length || y <= table[0][1]) return 0;
      while (lo < hi) { const m = (lo + hi + 1) >> 1; table[m][1] <= y ? lo = m : hi = m - 1; }
      return table[lo][0];
    };
    measures.push(build);
    ticks.push((t, y) => {
      // the tip of the line stays about three quarters of the way down the screen
      const aim = lengthAt(y - mainTop + innerHeight * 0.78);
      drawn += (aim - drawn) * 0.12;
      if (Math.abs(aim - drawn) < 0.5) drawn = aim;
      path.style.strokeDashoffset = (total - drawn).toFixed(1);
    });
  }

  /* ------------------------------------------------------------ wind */
  if (on('wind')) {
    // where each corner sits when the gust is at full strength, as a share of the box (x of width, y of height)
    const GUST = [[0.08, 0.16], [-0.11, -0.03], [-0.16, -0.15], [0.03, -0.30]];
    const STIFF = [0.11, 0.075, 0.05, 0.09];        // each corner follows at its own pace, so the box ripples
    const DRAG = [0.05, 0.13, 0.03, 0.10];          // how far a fast scroll pushes each corner
    const PHASE = [0, 1.7, 3.1, 4.4];
    const items = [...document.querySelectorAll(WIND_SEL)].map(el => {
      el.classList.add('fx-wind');
      return { el, top: 0, w: 0, h: 0, c: [[0, 0], [0, 0], [0, 0], [0, 0]], still: true, seed: Math.random() * 6 };
    });
    const measure = () => items.forEach(it => {
      const was = it.el.style.transform; it.el.style.transform = 'none';
      const r = it.el.getBoundingClientRect();
      it.top = r.top + scrollY; it.w = r.width; it.h = r.height;
      it.el.style.transform = was;
    });
    measures.push(measure);

    // the matrix that carries the box's four corners to four given points
    const warp = (w, h, p) => {
      const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = p;
      const dx1 = x1 - x2, dx2 = x3 - x2, sx = x0 - x1 + x2 - x3;
      const dy1 = y1 - y2, dy2 = y3 - y2, sy = y0 - y1 + y2 - y3;
      const den = dx1 * dy2 - dx2 * dy1;
      if (Math.abs(den) < 1e-6) return 'none';
      const g = (sx * dy2 - dx2 * sy) / den, k = (dx1 * sy - sx * dy1) / den;
      const a = x1 - x0 + g * x1, b = x3 - x0 + k * x3, d = y1 - y0 + g * y1, e = y3 - y0 + k * y3;
      const f = n => +n.toFixed(6);
      return `matrix3d(${f(a / w)},${f(d / w)},0,${f(g / w)},${f(b / h)},${f(e / h)},0,${f(k / h)},0,0,1,0,${f(x0)},${f(y0)},0,1)`;
    };

    ticks.push((t, y, vel) => {
      const vh = innerHeight;
      const small = innerWidth < 640 ? 0.6 : 1;
      const push = clamp(vel / 70, -1, 1);          // scroll speed, -1 to 1
      items.forEach(it => {
        if (!it.w) return;
        const from = it.top - y;                    // the box's top, from the top of the screen
        const near = from < vh * 1.3 && from + it.h > -vh * 0.3;
        if (!near) { if (!it.still) { it.el.style.transform = ''; it.c.forEach(c => { c[0] = c[1] = 0; }); it.still = true; } return; }
        // 0 as its top edge shows at the bottom of the screen, 1 once it has risen into place
        const enter = clamp((vh - from) / (vh * 0.62 + it.h * 0.25), 0, 1);
        const gust = Math.pow(1 - enter, 1.6) * small;
        const life = gust + Math.abs(push) * 0.5;   // how much air is moving
        let moving = false;
        const pts = it.c.map((c, i) => {
          const flutter = Math.sin(t * 0.0023 + PHASE[i] + it.seed) * 0.022 * life;
          const tx = (GUST[i][0] * gust + flutter) * it.w;
          const ty = (GUST[i][1] * gust + Math.cos(t * 0.0019 + PHASE[i] * 1.3 + it.seed) * 0.02 * life - push * DRAG[i] * small) * it.h + gust * it.h * 0.18;
          c[0] += (tx - c[0]) * STIFF[i]; c[1] += (ty - c[1]) * STIFF[i];
          if (Math.abs(c[0]) > 0.15 || Math.abs(c[1]) > 0.15) moving = true;
          return [(i === 1 || i === 2 ? it.w : 0) + c[0], (i > 1 ? it.h : 0) + c[1]];
        });
        if (moving) { it.el.style.transform = warp(it.w, it.h, pts); it.still = false; }
        else if (!it.still) { it.el.style.transform = ''; it.still = true; }
      });
    });
  }

  /* ------------------------------------------------------------ the one loop */
  const measureAll = () => measures.forEach(m => m());
  let queued = 0;
  const remeasure = () => { clearTimeout(queued); queued = setTimeout(measureAll, 120); };
  measureAll();
  addEventListener('resize', remeasure);
  addEventListener('load', remeasure);
  document.fonts?.ready.then(remeasure);
  new ResizeObserver(remeasure).observe(main);     // a section that changes height moves everything below it

  let lastY = scrollY, vel = 0;
  const frame = t => {
    lenis?.raf(t);
    const y = scrollY;
    vel += ((y - lastY) - vel) * 0.25; lastY = y;
    ticks.forEach(fn => fn(t, y, vel));
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
