import type { FlavorSpec } from "./flavors";
import type { Particle, ParticleSystem } from "./particles";

const TAU = Math.PI * 2;

/** Three translucent, independently moving flame tongues along the bottom edge. */
function flameBand(ctx: CanvasRenderingContext2D, width: number, height: number, time: number, colors: readonly string[]): void {
  for (let layer = 0; layer < 3; layer++) {
    const base = 3 + (layer * 3);
    const amplitude = 3 + (layer * 2);
    ctx.beginPath();
    ctx.moveTo(0, height);
    for (let x = 0; x <= width + 6; x += 6) {
      const wave = (Math.sin((x * 0.045) + (time * 3.1) + (layer * 1.7)) * 0.6)
        + (Math.sin((x * 0.11) - (time * 4.7) + layer) * 0.4);
      ctx.lineTo(x, height - base - (amplitude * (0.5 + (wave * 0.5))));
    }
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.globalAlpha = 0.24 - (layer * 0.06);
    ctx.fillStyle = colors[layer % colors.length] ?? "#FF8A3D";
    ctx.fill();
  }
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.1, radius), 0, TAU);
}

function drawParticle(ctx: CanvasRenderingContext2D, particle: Particle, spec: FlavorSpec, progress: number): void {
  const { x, y, size, seed } = particle;
  switch (spec.shape) {
    case "ember": {
      circle(ctx, x, y, size);
      ctx.fill();
      ctx.globalAlpha *= 0.35;
      ctx.fillRect(x - (size * 0.5), y, size, size * 4);
      break;
    }
    case "mote": {
      circle(ctx, x, y, size * (1 + (0.4 * Math.sin((progress * 6) + (seed * TAU)))));
      ctx.fill();
      break;
    }
    case "flake": {
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let arm = 0; arm < 3; arm++) {
        const angle = (seed * TAU) + (progress * 2) + ((arm * Math.PI) / 3);
        ctx.moveTo(x - (Math.cos(angle) * size), y - (Math.sin(angle) * size));
        ctx.lineTo(x + (Math.cos(angle) * size), y + (Math.sin(angle) * size));
      }
      ctx.stroke();
      break;
    }
    case "spark": {
      const angle = seed * TAU;
      const segments = 5;
      let px = x;
      let py = y;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(px, py);
      for (let i = 1; i <= segments; i++) {
        const offset = Math.sin(seed * 97 * i) * size * 0.3;
        px += (Math.cos(angle) * (size / segments)) - (Math.sin(angle) * offset);
        py += (Math.sin(angle) * (size / segments)) + (Math.cos(angle) * offset);
        ctx.lineTo(px, py);
      }
      ctx.stroke();
      break;
    }
    case "bubble": {
      ctx.lineWidth = 1;
      circle(ctx, x, y, size);
      ctx.stroke();
      break;
    }
    case "wisp": {
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, size);
      gradient.addColorStop(0, particle.color);
      gradient.addColorStop(1, "transparent");
      ctx.fillStyle = gradient;
      circle(ctx, x, y, size);
      ctx.fill();
      break;
    }
    case "ring": {
      ctx.lineWidth = 2 * (1 - progress);
      circle(ctx, x, y, size + (progress * size * 4));
      ctx.stroke();
      break;
    }
    case "shard": {
      const angle = (seed * TAU) + (progress * 3);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(0, -size);
      ctx.lineTo(size * 0.6, 0);
      ctx.lineTo(0, size);
      ctx.lineTo(-size * 0.6, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      break;
    }
  }
}

export interface DrawOptions {
  /** Clear the canvas first; off when particles are drawn over a shader frame. */
  clear?: boolean;
  /** Draw the 2D flame band; off when the fire shader already draws flames. */
  band?: boolean;
}

/** Paint one frame; additive blending glows on dark paper, plain blending stays legible on light paper. */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  system: ParticleSystem,
  spec: FlavorSpec,
  time: number,
  dark: boolean,
  { clear = true, band = true }: DrawOptions = {}
): void {
  const { width, height } = system;
  if (clear) ctx.clearRect(0, 0, width, height);
  ctx.globalCompositeOperation = dark ? "lighter" : "source-over";
  if (spec.band && band) flameBand(ctx, width, height, time, system.colors);
  for (const particle of system.particles) {
    const progress = Math.min(1, particle.age / particle.life);
    ctx.globalAlpha = Math.sin(Math.PI * progress) * (dark ? 0.95 : 0.75);
    ctx.fillStyle = particle.color;
    ctx.strokeStyle = particle.color;
    drawParticle(ctx, particle, spec, progress);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}
