import { useEffect, useRef } from "react";
import { useThemeName } from "../theme/theme";
import { drawFrame } from "./draw";
import { FLAVOR_SPECS, type FxFlavor } from "./flavors";
import { ShaderStage } from "./gl/stage";
import { useFxLevel } from "./level";
import { ParticleSystem } from "./particles";
import { subscribeTick } from "./ticker";

/** How the "reduced" level scales the effect: calmer, fainter, fewer particles. */
const REDUCED = { intensity: 0.55, speed: 0.5, particles: 0.35 };

/**
 * The damage-type effect behind a result card's content: a GPU shader frame from the shared stage
 * with particles on top, or particles alone when WebGL2 is unavailable.
 */
export function FlavorField({ flavor, seed }: { flavor: FxFlavor; seed: number }) {
  const level = useFxLevel();
  const theme = useThemeName();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || (level === "off") || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const spec = FLAVOR_SPECS[flavor];
    const dark = theme === "dark";
    const reduced = level === "reduced";
    const system = new ParticleSystem(spec, dark ? spec.colors.dark : spec.colors.light);
    const ratio = window.devicePixelRatio || 1;

    // Layout size (not the zoomed on-screen size) keeps effects independent of canvas zoom.
    const resize = () => {
      const width = canvas.offsetWidth;
      const height = canvas.offsetHeight;
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      system.resize(width, height);
    };
    resize();
    const sizeObserver = new ResizeObserver(resize);
    sizeObserver.observe(canvas);

    let visible = true;
    const visibilityObserver = new IntersectionObserver(entries => {
      visible = entries.at(-1)?.isIntersecting ?? true;
    });
    visibilityObserver.observe(canvas);

    const unsubscribe = subscribeTick((now, dt) => {
      if (!visible || document.hidden) return;
      const time = (now / 1000) * (reduced ? REDUCED.speed : 1);
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);

      const stage = ShaderStage.shared();
      const shaded = stage?.draw({
        flavor, width: canvas.width, height: canvas.height, scale: ratio, time, seed,
        intensity: reduced ? REDUCED.intensity : 1, dark
      }) ?? false;
      if (stage && shaded) {
        context.drawImage(stage.canvas, 0, stage.sourceY(canvas.height), canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
      }

      const particleRate = (shaded ? spec.overlay : 1) * (reduced ? REDUCED.particles : 1);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      if (particleRate > 0) {
        system.step(dt, particleRate);
        drawFrame(context, system, spec, time, dark, { clear: false, band: !shaded });
      }
    });

    return () => {
      unsubscribe();
      sizeObserver.disconnect();
      visibilityObserver.disconnect();
    };
  }, [flavor, level, theme, seed]);

  if (level === "off") return null;
  return <canvas ref={canvasRef} className="bna-fx" data-flavor={flavor} aria-hidden="true" />;
}
