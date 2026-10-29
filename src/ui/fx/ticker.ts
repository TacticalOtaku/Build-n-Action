type Tick = (now: number, dt: number) => void;

/** Longest step fed to simulations, so a backgrounded tab does not burst particles on return. */
const MAX_STEP = 0.05;

const subscribers = new Set<Tick>();
let frame = 0;
let last = 0;

function loop(now: number): void {
  const dt = last ? Math.min(MAX_STEP, (now - last) / 1000) : 0;
  last = now;
  for (const tick of [...subscribers]) tick(now, dt);
  frame = subscribers.size ? requestAnimationFrame(loop) : 0;
}

/** Run `tick` on the shared animation loop until the returned function is called. */
export function subscribeTick(tick: Tick): () => void {
  subscribers.add(tick);
  if (!frame) frame = requestAnimationFrame(loop);
  return () => {
    subscribers.delete(tick);
    if (!subscribers.size && frame) {
      cancelAnimationFrame(frame);
      frame = 0;
      last = 0;
    }
  };
}
