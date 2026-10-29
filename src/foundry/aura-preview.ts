/** Cyanotype tokens (spec 7.1): "if" green when the roller is inside, "then" coral when outside. */
export const AURA_COLORS = { inside: 0x6CCBAE, outside: 0xEE7A63 } as const;

const HOLD = 1800;
const FADE = 450;

const shown = new Map<string, { graphics: GraphicsLike; timer: ReturnType<typeof setTimeout> }>();

function remove(key: string): void {
  const entry = shown.get(key);
  if (!entry) return;
  clearTimeout(entry.timer);
  if (!entry.graphics.destroyed) entry.graphics.destroy();
  shown.delete(key);
}

function fade(key: string): void {
  const entry = shown.get(key);
  if (!entry) return;
  foundry.canvas.animation.CanvasAnimation.animate([{ parent: entry.graphics, attribute: "alpha", to: 0 }], { name: `bna-aura-${key}`, duration: FADE })
    .catch(() => undefined)
    .finally(() => {
      if (shown.get(key) === entry) remove(key);
    });
}

/** Draw a checked aura for a moment: `key` identifies the aura, so a new check replaces the old drawing. */
export function previewAura(key: string, shape: ShapeLike, inside: boolean): void {
  if (!canvas.ready) return;
  remove(key);
  const color = inside ? AURA_COLORS.inside : AURA_COLORS.outside;
  const graphics = new PIXI.Graphics();
  graphics.lineStyle({ width: 2, color, alpha: 0.9 });
  graphics.beginFill(color, 0.06);
  graphics.drawShape(shape);
  graphics.endFill();
  canvas.interface.addChild(graphics);
  shown.set(key, { graphics, timer: setTimeout(() => fade(key), HOLD) });
}

export function clearAuraPreviews(): void {
  for (const key of [...shown.keys()]) remove(key);
}

export function registerAuraPreviews(): void {
  Hooks.on("canvasTearDown", clearAuraPreviews);
}
