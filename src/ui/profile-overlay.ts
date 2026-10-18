/**
 * @module ui/profile-overlay
 * @purpose An easter egg for the birth-record screen (#697): a short fireworks overlay when the deployment's `ASTRAYA_EASTER_EGG` setting matches the person shown.
 * @conventions Off without the server route (the static demo) or the setting; skipped under reduced motion. The overlay is a fixed, click-through, `aria-hidden` canvas that removes itself once its last spark fades.
 * @exports OverlayConfig, loadOverlayConfig, checkFeatureFlag, initProfileOverlay
 */

export type OverlayConfig =
  { readonly enabled: false } | { readonly enabled: true; readonly dateDigest: string; readonly nameDigest: string };

const OFF: OverlayConfig = { enabled: false };
let configRequest: Promise<OverlayConfig> | undefined;

/** The deployment's setting, fetched once per page load; off on any failure. */
export function loadOverlayConfig(fetchImpl: typeof fetch = fetch): Promise<OverlayConfig> {
  configRequest ??= fetchImpl('/api/profile-overlay')
    .then(async (response) => (response.ok ? ((await response.json()) as OverlayConfig) : OFF))
    .then((config) => (config.enabled && typeof config.dateDigest === 'string' ? config : OFF))
    .catch(() => OFF);
  return configRequest;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function checkFeatureFlag(date: string, name: string, config: OverlayConfig): Promise<boolean> {
  if (!config.enabled) return false;
  if ((await sha256Hex(date)) !== config.dateDigest) return false;
  const tokens = name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .split(/\s+/)
    .filter((token) => token !== '');
  const digests = await Promise.all(tokens.map(sha256Hex));
  return digests.includes(config.nameDigest);
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  readonly decay: number;
  readonly hue: number;
  readonly size: number;
  readonly rocket: boolean;
}

/** The show's settings (#706). */
const SHOW = {
  /** How long new rockets go up; the last sparks then fade before the overlay removes itself. */
  runMs: 10_000,
  /** One automatic launch every this many milliseconds. */
  launchEveryMs: 600,
  /** Sparks in one burst. */
  burstCount: 90,
  /** Multiplies every burst's speed. */
  explosionForce: 1,
  /** Downward pull added to each spark every frame, in CSS pixels. */
  gravity: 0.08,
  /** Air drag: each frame keeps this share of a spark's speed. */
  airKeep: 0.985,
  /** How much of the previous frame each frame fades out: lower leaves longer motion-blur trails. */
  trailFade: 0.15,
} as const;

type BurstPattern = 'sphere' | 'ring' | 'double-ring' | 'star' | 'heart' | 'willow';
const PATTERNS: readonly BurstPattern[] = ['sphere', 'ring', 'double-ring', 'star', 'heart', 'willow'];

/** A spark's starting velocity in a burst, by pattern: `t` runs 0 to 1 around the burst, `speed` is its base speed. */
function burstVelocity(pattern: BurstPattern, t: number, speed: number): { vx: number; vy: number; slow: boolean } {
  const angle = t * Math.PI * 2;
  switch (pattern) {
    case 'sphere': {
      const random = Math.random() * Math.PI * 2;
      const reach = speed * Math.sqrt(Math.random());
      return { vx: Math.cos(random) * reach, vy: Math.sin(random) * reach, slow: false };
    }
    case 'ring':
      return { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, slow: false };
    case 'double-ring': {
      const reach = speed * (Math.round(t * 90) % 2 === 0 ? 1 : 0.55);
      return { vx: Math.cos(angle) * reach, vy: Math.sin(angle) * reach, slow: false };
    }
    case 'star': {
      const reach = speed * (0.45 + 0.55 * Math.abs(Math.cos(angle * 2.5)));
      return { vx: Math.cos(angle) * reach, vy: Math.sin(angle) * reach, slow: false };
    }
    case 'heart': {
      // The classic heart curve, scaled to the burst's speed; y grows downward on a canvas.
      const hx = 16 * Math.sin(angle) ** 3;
      const hy = 13 * Math.cos(angle) - 5 * Math.cos(2 * angle) - 2 * Math.cos(3 * angle) - Math.cos(4 * angle);
      return { vx: (hx / 17) * speed, vy: (-hy / 17) * speed, slow: false };
    }
    case 'willow':
      return { vx: Math.cos(angle) * speed * 0.8, vy: Math.sin(angle) * speed * 0.8, slow: true };
  }
}

/** Runs the overlay; returns a function that ends it early (e.g. when the screen unmounts). */
export function initProfileOverlay(doc: Document = document): () => void {
  const view = doc.defaultView;
  if (view === null || view.matchMedia('(prefers-reduced-motion: reduce)').matches) return () => undefined;
  const canvas = doc.createElement('canvas');
  canvas.className = 'profile-overlay';
  canvas.setAttribute('aria-hidden', 'true');
  doc.body.append(canvas);
  const context = canvas.getContext('2d');
  const ratio = view.devicePixelRatio || 1;
  const resize = (): void => {
    canvas.width = Math.round(view.innerWidth * ratio);
    canvas.height = Math.round(view.innerHeight * ratio);
  };
  resize();
  view.addEventListener('resize', resize);

  const sparks: Spark[] = [];
  let start: number | undefined;
  let nextLaunch = 0;
  let frame = 0;
  let stopped = false;
  let launching = true;
  let trailHue = 0;

  // A short rainbow spark trail behind the cursor while the show runs (#706); the canvas itself never takes the pointer.
  const onPointerMove = (event: PointerEvent): void => {
    if (!launching) return;
    for (let index = 0; index < 3; index++) {
      trailHue = (trailHue + 7) % 360;
      sparks.push({
        x: event.clientX * ratio,
        y: event.clientY * ratio,
        vx: (Math.random() - 0.5) * 1.6 * ratio,
        vy: (Math.random() - 0.8) * 1.6 * ratio,
        life: 1,
        decay: 0.03,
        hue: trailHue,
        size: 1.8,
        rocket: false,
      });
    }
  };
  view.addEventListener('pointermove', onPointerMove, { passive: true });

  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    view.cancelAnimationFrame(frame);
    view.removeEventListener('resize', resize);
    view.removeEventListener('pointermove', onPointerMove);
    canvas.remove();
  };

  const burst = (rocket: Spark): void => {
    const pattern = PATTERNS[Math.floor(Math.random() * PATTERNS.length)] ?? 'sphere';
    const speed = (2.6 + Math.random() * 1.4) * SHOW.explosionForce * ratio;
    // Rainbow: the hues run once around the spectrum across the burst, from a random starting colour.
    const offset = Math.random() * 360;
    for (let index = 0; index < SHOW.burstCount; index++) {
      const t = index / SHOW.burstCount;
      const { vx, vy, slow } = burstVelocity(pattern, t, speed);
      sparks.push({
        x: rocket.x,
        y: rocket.y,
        vx,
        vy,
        life: 1,
        decay: slow ? 0.008 : 0.012 + Math.random() * 0.006,
        hue: (offset + t * 360) % 360,
        size: 2.4,
        rocket: false,
      });
    }
  };

  const tick = (now: number): void => {
    start ??= now;
    launching = now - start < SHOW.runMs;
    if (launching && now >= nextLaunch) {
      sparks.push({
        x: canvas.width * (0.15 + Math.random() * 0.7),
        y: canvas.height,
        vx: (Math.random() - 0.5) * 2 * ratio,
        vy: -(canvas.height / 90) * (0.85 + Math.random() * 0.3),
        life: 1,
        decay: 0,
        hue: Math.random() * 360,
        size: 2.6,
        rocket: true,
      });
      nextLaunch = now + SHOW.launchEveryMs;
    }

    if (context !== null) {
      // Fade the last frame rather than clearing it, which leaves motion-blur trails on a transparent canvas.
      context.globalCompositeOperation = 'destination-out';
      context.globalAlpha = SHOW.trailFade;
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.globalCompositeOperation = 'lighter';
    }
    for (let index = sparks.length - 1; index >= 0; index--) {
      const spark = sparks[index];
      if (spark === undefined) continue;
      spark.x += spark.vx;
      spark.y += spark.vy;
      spark.vy += SHOW.gravity * ratio;
      if (spark.rocket) {
        if (spark.vy >= 0) {
          sparks.splice(index, 1);
          burst(spark);
          continue;
        }
      } else {
        spark.vx *= SHOW.airKeep;
        spark.vy *= SHOW.airKeep;
        spark.life -= spark.decay;
        if (spark.life <= 0) {
          sparks.splice(index, 1);
          continue;
        }
      }
      if (context !== null) {
        context.globalAlpha = Math.max(spark.life, 0);
        context.fillStyle = `hsl(${String(Math.round(spark.hue))} 95% 62%)`;
        context.fillRect(spark.x, spark.y, spark.size * ratio, spark.size * ratio);
      }
    }

    if (!launching && sparks.length === 0) stop();
    else frame = view.requestAnimationFrame(tick);
  };
  frame = view.requestAnimationFrame(tick);
  return stop;
}
