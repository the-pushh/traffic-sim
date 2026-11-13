// Performance benchmark: what loads the computer while each preset runs.
//
//   npm run build && npx vite preview --port 4173 &
//   npm run perf -- [url] [--label name] [--quick] [--throttle 6]
//
// For every preset at Medium and Congested load it plays the run and, over a fixed window,
// records main-thread time per animation frame (Chrome's own task accounting), GPU time
// (timer queries), frame-to-frame times, WebGL draw calls and triangles, style/layout time,
// the JS heap, and a CPU profile summed by function. It also measures the idle map (Ready)
// and, with --throttle N, a run with the CPU slowed N times (does the resolution step down,
// and does the frame rate hold?). Results go to artifacts/perf/<label>.json; a table prints.
// Simulation step time on its own: `npm run perf:sim`.
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null;
};
const url = args.find((a, i) => !a.startsWith('--') && !['--label', '--throttle'].includes(args[i - 1])) ?? 'http://localhost:4173/';
const label = option('--label') ?? 'run';
const THROTTLE = Number(option('--throttle') ?? 0);
const IDLE_MS = 5000;

const reachable = await fetch(url).then((r) => r.ok, () => false);
if (!reachable) {
  console.error(`Nothing is serving ${url}. Start it first: npm run build && npx vite preview --port 4173`);
  process.exit(1);
}
const QUICK = args.includes('--quick'); // only the two heaviest cases, for comparing changes
const WARM_MS = 2000;
const MEASURE_MS = 8000;
const LOADS = [
  { name: 'Medium', key: null },
  { name: 'Congested', key: 'End' },
];

const browser = await chromium.launch({ channel: 'chrome', args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization'] });
// Close Chrome even when a step fails.
process.on('uncaughtException', async (error) => {
  console.error(error);
  await browser.close().catch(() => {});
  process.exit(1);
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });

// Count WebGL draw calls and triangles per animation frame, and frame-to-frame times.
await page.addInitScript(() => {
  const perf = { draws: 0, triangles: 0, frames: [], recording: false };
  window.__perf = perf;
  const TRIANGLES = 4;
  const wrap = (proto, name, countAt) => {
    const original = proto[name];
    proto[name] = function (...a) {
      perf.draws++;
      if (a[0] === TRIANGLES) perf.triangles += (a[countAt] / 3) * (name.endsWith('Instanced') ? a[countAt + (name.startsWith('drawElements') ? 3 : 1)] : 1);
      return original.apply(this, a);
    };
  };
  for (const proto of [WebGL2RenderingContext.prototype, WebGLRenderingContext.prototype]) {
    wrap(proto, 'drawElements', 1);
    wrap(proto, 'drawArrays', 2);
  }
  wrap(WebGL2RenderingContext.prototype, 'drawElementsInstanced', 1);
  wrap(WebGL2RenderingContext.prototype, 'drawArraysInstanced', 2);
  // GPU time per frame: a timer query on the app's WebGL context spans from one animation
  // frame to the next (this callback runs before the app's), so it brackets one frame's drawing.
  let gl = null;
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    const context = getContext.call(this, type, ...rest);
    if (type === 'webgl2' && !gl) gl = context; // the app's renderer is the first WebGL context made
    return context;
  };
  perf.gpuMs = [];
  let timer = null;
  let open = null;
  const pending = [];
  let last = 0;
  const loop = (t) => {
    if (perf.recording && last) perf.frames.push({ dt: t - last, draws: perf.draws, triangles: perf.triangles });
    perf.draws = perf.triangles = 0;
    last = t;
    if (gl && !timer) timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    if (gl && timer) {
      if (open) {
        gl.endQuery(timer.TIME_ELAPSED_EXT);
        pending.push({ query: open, recording: perf.recording });
        open = null;
      }
      while (pending.length && gl.getQueryParameter(pending[0].query, gl.QUERY_RESULT_AVAILABLE)) {
        const done = pending.shift();
        const disjoint = gl.getParameter(timer.GPU_DISJOINT_EXT);
        if (done.recording && !disjoint) perf.gpuMs.push(gl.getQueryParameter(done.query, gl.QUERY_RESULT) / 1e6);
        gl.deleteQuery(done.query);
      }
      open = gl.createQuery();
      gl.beginQuery(timer.TIME_ELAPSED_EXT, open);
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
});

const cdp = await page.context().newCDPSession(page);
await cdp.send('Performance.enable');
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 200 });

const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
const loaded = () => page.waitForSelector('.status', { state: 'hidden', timeout: 120000 });

const t0 = Date.now();
await page.goto(url);
await loaded();
const firstLoadMs = Date.now() - t0;
const gpu = await page.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl2');
  const info = gl?.getExtension('WEBGL_debug_renderer_info');
  return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'unknown';
});

// The idle map (Ready, nothing moving): what it costs to leave the app open.
const idle = await (async () => {
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    window.__perf.frames = [];
    window.__perf.gpuMs = [];
    window.__perf.recording = true;
  });
  const before = await metrics();
  await page.waitForTimeout(IDLE_MS);
  const after = await metrics();
  const { frames, gpuMs } = await page.evaluate(async () => {
    window.__perf.recording = false;
    await new Promise((r) => setTimeout(r, 300));
    return { frames: window.__perf.frames, gpuMs: window.__perf.gpuMs };
  });
  const perSecond = (v) => Math.round(v / (IDLE_MS / 1000));
  return {
    mainThreadMsPerSecond: perSecond((after.TaskDuration - before.TaskDuration) * 1000),
    drawCallsPerSecond: perSecond(frames.reduce((a, f) => a + f.draws, 0)),
    framesDrawnPerSecond: perSecond(frames.filter((f) => f.draws > 0).length),
    gpuMsPerSecond: perSecond(gpuMs.reduce((a, b) => a + b, 0)),
  };
})();

const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;
};
const round = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

/** Self time per function over the profile, top entries. */
function hotFunctions(profile, top = 12) {
  const self = new Map();
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const interval = (profile.endTime - profile.startTime) / Math.max(1, profile.samples.length);
  for (const id of profile.samples) {
    const { callFrame } = byId.get(id);
    const file = callFrame.url.split('/').pop() || '(native)';
    const key = `${callFrame.functionName || '(anonymous)'} ${file}:${callFrame.lineNumber + 1}`;
    self.set(key, (self.get(key) ?? 0) + interval / 1000);
  }
  const total = [...self.values()].reduce((a, b) => a + b, 0);
  return [...self]
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([fn, ms]) => ({ fn, ms: round(ms), share: `${round((ms / total) * 100)}%` }));
}

const results = [];
for (let s = 0; s < 5; s++) {
  const scene = (await page.locator('.scene-name').textContent())?.trim();
  if (scene !== 'Blank board' && (!QUICK || ['Main Street', 'Flyover Bottleneck'].includes(scene))) {
    for (const load of QUICK ? LOADS.slice(1) : LOADS) {
      await page.getByRole('button', { name: 'Restart run' }).click();
      await page.getByRole('button', { name: '90 s' }).click();
      const slider = page.locator('.intensity [role="slider"]');
      await slider.focus();
      await page.keyboard.press(load.key ?? 'Home');
      if (!load.key) for (let i = 0; i < 2; i++) await page.keyboard.press('ArrowRight'); // Medium
      await page.locator('.dock [data-action="play-pause"]').click();
      await page.waitForTimeout(WARM_MS);
      const before = await metrics();
      await page.evaluate(() => {
        window.__perf.frames = [];
        window.__perf.gpuMs = [];
        window.__perf.recording = true;
      });
      await cdp.send('Profiler.start');
      await page.waitForTimeout(MEASURE_MS);
      const { profile } = await cdp.send('Profiler.stop');
      const { frames, gpuMs } = await page.evaluate(async () => {
        window.__perf.recording = false;
        await new Promise((r) => setTimeout(r, 300)); // let the last queries resolve
        return { frames: window.__perf.frames, gpuMs: window.__perf.gpuMs };
      });
      const after = await metrics();
      await page.locator('.dock [data-action="play-pause"]').click(); // pause
      const n = Math.max(1, frames.length);
      const per = (m) => round(((after[m] - before[m]) * 1000) / n, 2);
      results.push({
        scene,
        load: load.name,
        fps: round(frames.length / (MEASURE_MS / 1000)),
        frameMsP50: round(percentile(frames.map((f) => f.dt), 50)),
        frameMsP95: round(percentile(frames.map((f) => f.dt), 95)),
        longFrames: frames.filter((f) => f.dt > 20).length,
        gpuMsPerSecond: round(gpuMs.reduce((x, y) => x + y, 0) / (MEASURE_MS / 1000)),
        gpuMsP50: round(percentile(gpuMs, 50), 2),
        gpuMsP95: round(percentile(gpuMs, 95), 2),
        mainThreadMsPerFrame: per('TaskDuration'),
        scriptMsPerFrame: per('ScriptDuration'),
        styleLayoutMsPerFrame: round(per('RecalcStyleDuration') + per('LayoutDuration'), 2),
        framesDrawnPerSecond: round(frames.filter((f) => f.draws > 0).length / (MEASURE_MS / 1000)),
        drawCallsPerSecond: Math.round(frames.reduce((a, f) => a + f.draws, 0) / (MEASURE_MS / 1000)),
        drawCallsPerFrame: round(frames.reduce((a, f) => a + f.draws, 0) / n),
        trianglesPerFrame: Math.round(frames.reduce((a, f) => a + f.triangles, 0) / n),
        heapMB: round(after.JSHeapUsedSize / 1e6),
        hot: hotFunctions(profile),
      });
      console.error(`measured ${scene} · ${load.name}`);
    }
  }
  const t = Date.now();
  await page.getByRole('button', { name: 'Restart run' }).click();
  await page.getByRole('button', { name: 'Next scene' }).click();
  await loaded();
  if (s < 4) results.push({ sceneSwitchMs: Date.now() - t, to: (await page.locator('.scene-name').textContent())?.trim() });
}

// A slower computer: the CPU slowed THROTTLE times, Main Street at Congested.
let throttled = null;
if (THROTTLE > 1) {
  const slow = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await slow.goto(url);
  await slow.waitForSelector('.status', { state: 'hidden', timeout: 120000 });
  const width = () => slow.evaluate(() => document.querySelector('canvas').width);
  const before = await width();
  const slowCdp = await slow.context().newCDPSession(slow);
  await slowCdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  await slow.locator('.intensity [role="slider"]').focus();
  await slow.keyboard.press('End');
  await slow.locator('.dock [data-action="play-pause"]').click();
  await slow.waitForTimeout(8000);
  const fps = await slow.evaluate(() => new Promise((r) => { let n = 0; const s = performance.now(); const l = () => { n++; performance.now() - s < 2000 ? requestAnimationFrame(l) : r(n / 2); }; requestAnimationFrame(l); }));
  throttled = { cpuSlowdown: THROTTLE, canvasWidthBefore: before, canvasWidthAfter: await width(), fps: round(fps) };
  await slow.close();
}

await browser.close();
mkdirSync('artifacts/perf', { recursive: true });
const report = { label, url, date: new Date().toISOString(), gpu, viewport: '1440x900 @2x', firstLoadMs, idle, results, throttled };
writeFileSync(`artifacts/perf/${label}.json`, JSON.stringify(report, null, 2));

console.log(`\n${label} · ${url} · GPU ${gpu} · first load ${firstLoadMs} ms\n`);
console.log(`idle (Ready): ${JSON.stringify(idle)}`);
console.log('scene · load | frames/s (drawn) | frame p50/p95 ms | GPU ms/s | main ms/frame | script | style+layout | draws/s | draws per drawn frame | heap MB');
for (const r of results.filter((r) => r.scene)) {
  console.log(`${r.scene} · ${r.load} | ${r.fps} (${r.framesDrawnPerSecond}) | ${r.frameMsP50}/${r.frameMsP95} | ${r.gpuMsPerSecond} | ${r.mainThreadMsPerFrame} | ${r.scriptMsPerFrame} | ${r.styleLayoutMsPerFrame} | ${r.drawCallsPerSecond} | ${round(r.drawCallsPerSecond / Math.max(1, r.framesDrawnPerSecond))} | ${r.heapMB}`);
}
for (const r of results.filter((r) => r.to)) console.log(`switch to ${r.to}: ${r.sceneSwitchMs} ms`);
if (throttled) console.log(`CPU ×${throttled.cpuSlowdown}: canvas ${throttled.canvasWidthBefore} → ${throttled.canvasWidthAfter} px wide, ${throttled.fps} fps`);
