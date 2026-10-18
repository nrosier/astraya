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
  readonly hue: number;
  readonly rocket: boolean;
}

const RUN_MS = 10_000;
const GRAVITY = 0.05;

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

  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    view.cancelAnimationFrame(frame);
    view.removeEventListener('resize', resize);
    canvas.remove();
  };

  const burst = (rocket: Spark): void => {
    for (let index = 0; index < 60; index++) {
      const angle = (index / 60) * Math.PI * 2;
      const speed = (1 + Math.random() * 3) * ratio;
      sparks.push({
        x: rocket.x,
        y: rocket.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        hue: rocket.hue + Math.random() * 30,
        rocket: false,
      });
    }
  };

  const tick = (now: number): void => {
    start ??= now;
    const launching = now - start < RUN_MS;
    if (launching && now >= nextLaunch) {
      sparks.push({
        x: canvas.width * (0.15 + Math.random() * 0.7),
        y: canvas.height,
        vx: (Math.random() - 0.5) * 2 * ratio,
        vy: -(canvas.height / 90) * (0.85 + Math.random() * 0.3),
        life: 1,
        hue: Math.random() * 360,
        rocket: true,
      });
      nextLaunch = now + 250 + Math.random() * 450;
    }

    context?.clearRect(0, 0, canvas.width, canvas.height);
    for (let index = sparks.length - 1; index >= 0; index--) {
      const spark = sparks[index];
      if (spark === undefined) continue;
      spark.x += spark.vx;
      spark.y += spark.vy;
      spark.vy += GRAVITY * ratio;
      if (spark.rocket) {
        if (spark.vy >= 0) {
          sparks.splice(index, 1);
          burst(spark);
          continue;
        }
      } else {
        spark.life -= 0.012;
        if (spark.life <= 0) {
          sparks.splice(index, 1);
          continue;
        }
      }
      if (context !== null) {
        context.globalAlpha = Math.max(spark.life, 0);
        context.fillStyle = `hsl(${String(spark.hue)} 90% 60%)`;
        context.fillRect(spark.x, spark.y, 2.5 * ratio, 2.5 * ratio);
      }
    }

    if (!launching && sparks.length === 0) stop();
    else frame = view.requestAnimationFrame(tick);
  };
  frame = view.requestAnimationFrame(tick);
  return stop;
}
