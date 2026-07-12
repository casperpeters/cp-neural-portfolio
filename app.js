(() => {
  const canvas = document.querySelector('#neural-canvas');
  const hero = canvas.closest('.hero');
  const ctx = canvas.getContext('2d', { alpha: true });
  const toggle = document.querySelector('#motion-toggle');
  const count = document.querySelector('#node-count');
  const clock = document.querySelector('#clock');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const PALETTE = ['110,231,255', '171,145,255', '198,255,114'];
  const TRAIL_DURATION = 1400;
  const TRAIL_RADIUS = 145;
  const STAMP_INTERVAL = 24;
  const CONNECTION_RADIUS = 155;

  let running = !reduced;
  let raf = 0;
  let nodes = [];
  let trail = [];
  let ripples = [];
  let lastFrame = 0;
  let lastStamp = 0;
  let colorCursor = 0;

  const pointer = {
    x: -9999, y: -9999, px: -9999, py: -9999,
    active: false, speed: 0
  };

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const target = Math.max(34, Math.min(68, Math.floor(rect.width / 22)));
    nodes = Array.from({ length: target }, (_, i) => ({
      x: Math.random() * rect.width,
      y: Math.random() * rect.height * .76,
      ox: 0,
      oy: 0,
      vx: (Math.random() - .5) * .075,
      vy: (Math.random() - .5) * .075,
      r: Math.random() * 1.8 + .9,
      color: PALETTE[i % PALETTE.length],
      phase: Math.random() * Math.PI * 2
    }));
    count.textContent = String(target).padStart(3, '0');
    render(performance.now(), false);
  }

  function stamp(x, y, time, strength = 1) {
    trail.unshift({
      x, y, born: time, strength,
      color: PALETTE[Math.floor(colorCursor++ / 9) % PALETTE.length]
    });
    if (trail.length > 42) trail.length = 42;
  }

  function stampInterpolated(x, y, time) {
    if (!pointer.active || pointer.px < -1000) {
      stamp(x, y, time);
      return;
    }
    const dx = x - pointer.px;
    const dy = y - pointer.py;
    const distance = Math.hypot(dx, dy);
    const steps = Math.min(8, Math.max(1, Math.ceil(distance / 18)));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      stamp(pointer.px + dx * t, pointer.py + dy * t, time - (steps - i) * 2, .92);
    }
  }

  function trailInfluence(x, y, now) {
    let combined = 0;
    for (let i = 0; i < Math.min(trail.length, 22); i++) {
      const p = trail[i];
      const life = Math.max(0, 1 - (now - p.born) / TRAIL_DURATION);
      if (!life) continue;
      const distance = Math.hypot(x - p.x, y - p.y);
      if (distance >= TRAIL_RADIUS) continue;
      const spatial = Math.pow(1 - distance / TRAIL_RADIUS, .28);
      combined = Math.min(1, combined + spatial * life * p.strength * .68);
    }
    return combined;
  }

  function drawActivationField(now) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = trail.length - 1; i >= 0; i--) {
      const p = trail[i];
      const life = Math.max(0, 1 - (now - p.born) / TRAIL_DURATION);
      if (!life) continue;
      const radius = TRAIL_RADIUS * (.72 + life * .28);
      const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
      gradient.addColorStop(0, `rgba(${p.color},${.28 * life})`);
      gradient.addColorStop(.38, `rgba(${p.color},${.12 * life})`);
      gradient.addColorStop(1, `rgba(${p.color},0)`);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // A continuous after-image makes fast pointer movement read as one signal,
    // while the radial stamps above keep the edge soft and organic.
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = trail.length - 2; i >= 0; i--) {
      const a = trail[i];
      const b = trail[i + 1];
      const life = Math.min(
        Math.max(0, 1 - (now - a.born) / TRAIL_DURATION),
        Math.max(0, 1 - (now - b.born) / TRAIL_DURATION)
      );
      if (!life || Math.hypot(a.x - b.x, a.y - b.y) > 90) continue;
      ctx.strokeStyle = `rgba(${a.color},${.42 + life * .48})`;
      ctx.lineWidth = 2.8 + life * 6;
      ctx.shadowColor = `rgb(${a.color})`;
      ctx.shadowBlur = 24 + life * 18;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.restore();
  }

  function drawConnection(a, b, distance, activation, time, seed) {
    if (distance >= CONNECTION_RADIUS) return;
    const base = 1 - distance / CONNECTION_RADIUS;
    const alpha = base * (.14 + activation * .82);
    ctx.strokeStyle = `rgba(${activation > .18 ? a.color : '113,133,142'},${alpha})`;
    ctx.lineWidth = .5 + activation * 1.8;
    ctx.shadowColor = activation > .15 ? `rgb(${a.color})` : 'transparent';
    ctx.shadowBlur = activation * 12;
    ctx.beginPath();
    ctx.moveTo(a.x + a.ox, a.y + a.oy);
    ctx.lineTo(b.x + b.ox, b.y + b.oy);
    ctx.stroke();

    if (activation > .22 && seed % 5 === 0) {
      const progress = (time * .00038 + a.phase + seed * .071) % 1;
      const x = (a.x + a.ox) + ((b.x + b.ox) - (a.x + a.ox)) * progress;
      const y = (a.y + a.oy) + ((b.y + b.oy) - (a.y + a.oy)) * progress;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(${a.color},${.35 + activation * .6})`;
      ctx.shadowColor = `rgb(${a.color})`;
      ctx.shadowBlur = 9;
      ctx.beginPath(); ctx.arc(x, y, 1.25 + activation, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  function drawNode(n, activation, time) {
    const x = n.x + n.ox;
    const y = n.y + n.oy;
    const idle = 1.8 + Math.sin(time * .0015 + n.phase) * 1.1;
    const halo = idle + activation * 19;

    ctx.save();
    ctx.globalCompositeOperation = activation > .05 ? 'lighter' : 'source-over';
    ctx.fillStyle = `rgba(${n.color},${.04 + activation * .29})`;
    ctx.beginPath(); ctx.arc(x, y, n.r + halo, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(${n.color},${.58 + activation * .42})`;
    ctx.shadowColor = `rgb(${n.color})`;
    ctx.shadowBlur = activation * 22;
    ctx.beginPath(); ctx.arc(x, y, n.r + activation * 3.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    if (activation > .5) {
      ctx.strokeStyle = `rgba(${n.color},${activation * .24})`;
      ctx.lineWidth = .6;
      ctx.beginPath(); ctx.arc(x, y, 6 + activation * 8, 0, Math.PI * 2); ctx.stroke();
    }
  }

  function drawChip(w, h, now) {
    const cx = w * .79;
    const cy = h * .23;
    const s = Math.min(76, w * .062);
    const latest = trail[0];
    const incomingSignal = latest ? Math.max(0, 1 - (now - latest.born) / 520) : 0;
    // The silicon core acknowledges activity anywhere in the neural field,
    // but reacts much more strongly when the pointer actually approaches it.
    const activation = Math.max(trailInfluence(cx, cy, now), incomingSignal * .4);
    const glow = .28 + activation * .68;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = `rgba(110,231,255,${glow})`;
    ctx.lineWidth = .7 + activation * 1.1;
    ctx.shadowColor = 'rgb(110,231,255)';
    ctx.shadowBlur = activation * 22;
    ctx.strokeRect(-s / 2, -s / 2, s, s);
    ctx.strokeRect(-s * .31, -s * .31, s * .62, s * .62);

    for (let i = -2; i <= 2; i++) {
      const pulse = activation > .08 && ((now * .001 + i * .17) % 1) < .55;
      ctx.globalAlpha = pulse ? 1 : .55;
      ctx.beginPath(); ctx.moveTo(i * s / 5, -s / 2); ctx.lineTo(i * s / 5, -s * .72); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(i * s / 5, s / 2); ctx.lineTo(i * s / 5, s * .72); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-s / 2, i * s / 5); ctx.lineTo(-s * .72, i * s / 5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s / 2, i * s / 5); ctx.lineTo(s * .72, i * s / 5); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = `rgba(110,231,255,${.62 + activation * .38})`;
    ctx.font = '8px DM Mono';
    ctx.textAlign = 'center';
    ctx.fillText(activation > .18 ? 'SIGNAL / IN' : 'CP / CORE', 0, 3);
    ctx.restore();
  }

  function drawPointer(now) {
    if (!pointer.active) return;
    const latest = trail[0];
    const life = latest ? Math.max(0, 1 - (now - latest.born) / 280) : 0;
    if (!life) return;
    const radius = 8 + Math.min(pointer.speed, 28) * .16;
    ctx.save();
    ctx.strokeStyle = `rgba(238,243,245,${.92 * life})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(pointer.x, pointer.y, radius, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pointer.x - radius - 5, pointer.y); ctx.lineTo(pointer.x - radius + 1, pointer.y);
    ctx.moveTo(pointer.x + radius - 1, pointer.y); ctx.lineTo(pointer.x + radius + 5, pointer.y);
    ctx.moveTo(pointer.x, pointer.y - radius - 5); ctx.lineTo(pointer.x, pointer.y - radius + 1);
    ctx.moveTo(pointer.x, pointer.y + radius - 1); ctx.lineTo(pointer.x, pointer.y + radius + 5);
    ctx.stroke();
    ctx.fillStyle = `rgba(238,243,245,${.78 * life})`;
    ctx.shadowColor = 'rgb(110,231,255)';
    ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(pointer.x, pointer.y, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawCursorLinks(now) {
    if (!pointer.active) return;
    const latest = trail[0];
    const life = latest ? Math.max(0, 1 - (now - latest.born) / 360) : 0;
    if (!life) return;

    const nearest = nodes
      .map(node => ({ node, distance: Math.hypot(pointer.x - (node.x + node.ox), pointer.y - (node.y + node.oy)) }))
      .filter(item => item.distance < 270)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 4);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    nearest.forEach((item, rank) => {
      const x = item.node.x + item.node.ox;
      const y = item.node.y + item.node.oy;
      const strength = (1 - item.distance / 270) * life;
      ctx.strokeStyle = `rgba(${item.node.color},${.34 + strength * .66})`;
      ctx.lineWidth = 1.5 + strength * 2.4;
      ctx.setLineDash(rank === 0 ? [] : [2, 6]);
      ctx.shadowColor = `rgb(${item.node.color})`;
      ctx.shadowBlur = 8 + strength * 14;
      ctx.beginPath(); ctx.moveTo(pointer.x, pointer.y); ctx.lineTo(x, y); ctx.stroke();

      const progress = (now * .0012 + rank * .19) % 1;
      const sx = pointer.x + (x - pointer.x) * progress;
      const sy = pointer.y + (y - pointer.y) * progress;
      ctx.setLineDash([]);
      ctx.fillStyle = `rgba(${item.node.color},${.5 + strength * .5})`;
      ctx.beginPath(); ctx.arc(sx, sy, 1.7 + strength * 1.8, 0, Math.PI * 2); ctx.fill();
    });
    ctx.restore();
  }

  function drawRipples(now) {
    for (let i = ripples.length - 1; i >= 0; i--) {
      const p = ripples[i];
      const age = now - p.born;
      const life = 1 - age / 900;
      if (life <= 0) { ripples.splice(i, 1); continue; }
      const radius = 16 + (1 - life) * 150;
      ctx.strokeStyle = `rgba(${p.color},${life * .32})`;
      ctx.lineWidth = .7;
      ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, Math.PI * 2); ctx.stroke();
    }
  }

  function render(time, schedule = true) {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const dt = Math.min(32, time - (lastFrame || time));
    lastFrame = time;

    trail = trail.filter(p => time - p.born <= TRAIL_DURATION + 80);
    ctx.clearRect(0, 0, w, h);

    const backdrop = ctx.createLinearGradient(0, 0, 0, h);
    backdrop.addColorStop(0, 'rgba(5,12,16,.32)');
    backdrop.addColorStop(1, 'rgba(7,9,11,0)');
    ctx.fillStyle = backdrop;
    ctx.fillRect(0, 0, w, h);
    drawActivationField(time);

    const active = new Float32Array(nodes.length);
    nodes.forEach((n, i) => {
      active[i] = trailInfluence(n.x + n.ox, n.y + n.oy, time);
      if (!running) return;
      n.x += n.vx * (dt / 16.67);
      n.y += n.vy * (dt / 16.67);
      if (n.x < 0 || n.x > w) n.vx *= -1;
      if (n.y < 0 || n.y > h * .78) n.vy *= -1;

      const dx = pointer.x - n.x;
      const dy = pointer.y - n.y;
      const distance = Math.hypot(dx, dy);
      const pull = pointer.active && distance < 190 ? (1 - distance / 190) * 7 : 0;
      n.ox += (((distance ? dx / distance : 0) * pull) - n.ox) * .04;
      n.oy += (((distance ? dy / distance : 0) * pull) - n.oy) * .04;
    });

    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const distance = Math.hypot((a.x + a.ox) - (b.x + b.ox), (a.y + a.oy) - (b.y + b.oy));
        drawConnection(a, b, distance, Math.max(active[i], active[j]), time, i * 71 + j * 29);
      }
    }

    nodes.forEach((n, i) => drawNode(n, active[i], time));
    drawCursorLinks(time);
    drawChip(w, h, time);
    drawRipples(time);
    drawPointer(time);

    if (running && schedule) raf = requestAnimationFrame(render);
  }

  function setRunning(value) {
    running = value;
    toggle.setAttribute('aria-pressed', String(!value));
    toggle.innerHTML = value
      ? '<span class="toggle-icon">Ⅱ</span> PAUSE SIGNAL'
      : '<span class="toggle-icon">▶</span> RESUME SIGNAL';
    cancelAnimationFrame(raf);
    if (running) raf = requestAnimationFrame(render);
    else render(performance.now(), false);
  }

  function handlePointerMove(e) {
    if (!running) return;
    const rect = canvas.getBoundingClientRect();
    const inside = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
    if (!inside) {
      pointer.active = false;
      return;
    }
    const now = performance.now();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    pointer.speed = pointer.active ? Math.hypot(x - pointer.x, y - pointer.y) : 0;
    pointer.px = pointer.x;
    pointer.py = pointer.y;
    if (now - lastStamp >= STAMP_INTERVAL) {
      stampInterpolated(x, y, now);
      lastStamp = now;
      canvas.dataset.signalTrail = String(trail.length);
    }
    pointer.x = x;
    pointer.y = y;
    pointer.active = true;
  }

  // Global tracking prevents the text and CTA layers above the canvas from
  // creating dead zones. This is the key interaction pattern from the reference.
  window.addEventListener('pointermove', handlePointerMove, { passive: true });

  hero.addEventListener('pointerdown', e => {
    if (!running) return;
    if (e.target.closest('a, button')) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const now = performance.now();
    ripples.push({ x, y, born: now, color: PALETTE[colorCursor % PALETTE.length] });
    for (let i = 0; i < 8; i++) {
      const angle = i / 8 * Math.PI * 2;
      stamp(x + Math.cos(angle) * 24, y + Math.sin(angle) * 24, now - i * 3, 1.25);
    }
  });

  toggle.addEventListener('click', () => setRunning(!running));
  addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => {
    cancelAnimationFrame(raf);
    if (!document.hidden && running) raf = requestAnimationFrame(render);
  });

  function tickClock() {
    clock.textContent = new Intl.DateTimeFormat('nl-NL', {
      timeZone: 'Europe/Amsterdam', hour: '2-digit', minute: '2-digit',
      second: '2-digit', hour12: false
    }).format(new Date()) + ' AMS';
  }

  tickClock();
  setInterval(tickClock, 1000);
  resize();
  if (running) raf = requestAnimationFrame(render);
})();
