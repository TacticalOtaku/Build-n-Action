import type { FxFlavor } from "../flavors";
import { SHADER_UNIFORMS, VERTEX_SOURCE, buildFragment } from "./glsl";
import { SHADER_PALETTES, hexToRgb } from "./palettes";
import { log } from "../../../core/log";

type Uniform = (typeof SHADER_UNIFORMS)[number];

interface CompiledProgram {
  program: WebGLProgram;
  uniforms: Record<Uniform, WebGLUniformLocation | null>;
}

export interface ShaderFrame {
  flavor: FxFlavor;
  /** Target size in device pixels. */
  width: number;
  height: number;
  /** Device pixels per CSS pixel. */
  scale: number;
  /** Seconds. */
  time: number;
  seed: number;
  intensity: number;
  dark: boolean;
}

/**
 * One WebGL2 context shared by every effect card: browsers cap live contexts (~16), so each card
 * draws its frame here and copies it onto its own 2D canvas. Unavailable when WebGL2 is missing or
 * the context is lost; callers then fall back to 2D particles.
 */
export class ShaderStage {
  static #shared: ShaderStage | null | undefined;

  static shared(): ShaderStage | null {
    if (ShaderStage.#shared === undefined) ShaderStage.#shared = ShaderStage.#create();
    const stage = ShaderStage.#shared;
    return (stage && !stage.#lost) ? stage : null;
  }

  static #create(): ShaderStage | null {
    if (typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2", {
      alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false
    });
    return gl ? new ShaderStage(canvas, gl) : null;
  }

  readonly canvas: HTMLCanvasElement;
  readonly #gl: WebGL2RenderingContext;
  readonly #programs = new Map<FxFlavor, CompiledProgram | null>();
  #vertexArray: WebGLVertexArrayObject | null = null;
  #lost = false;

  private constructor(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext) {
    this.canvas = canvas;
    this.#gl = gl;
    this.#setupGeometry();
    canvas.addEventListener("webglcontextlost", event => {
      event.preventDefault();
      this.#lost = true;
    });
    canvas.addEventListener("webglcontextrestored", () => {
      this.#programs.clear();
      this.#setupGeometry();
      this.#lost = false;
    });
  }

  /** Render one frame into the bottom-left `width`×`height` of the canvas; false if it could not. */
  draw(frame: ShaderFrame): boolean {
    if (this.#lost) return false;
    const compiled = this.#program(frame.flavor);
    if (!compiled) return false;
    const gl = this.#gl;
    const width = Math.max(1, Math.ceil(frame.width));
    const height = Math.max(1, Math.ceil(frame.height));
    if ((this.canvas.width < width) || (this.canvas.height < height)) {
      this.canvas.width = Math.max(this.canvas.width, width);
      this.canvas.height = Math.max(this.canvas.height, height);
    }

    gl.viewport(0, 0, width, height);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const { uniforms } = compiled;
    const [color0, color1, color2] = SHADER_PALETTES[frame.flavor][frame.dark ? "dark" : "light"];
    gl.useProgram(compiled.program);
    gl.bindVertexArray(this.#vertexArray);
    gl.uniform2f(uniforms.u_resolution, width / frame.scale, height / frame.scale);
    gl.uniform1f(uniforms.u_scale, frame.scale);
    gl.uniform1f(uniforms.u_time, frame.time);
    gl.uniform1f(uniforms.u_seed, frame.seed);
    gl.uniform1f(uniforms.u_intensity, frame.intensity);
    gl.uniform3f(uniforms.u_color0, ...hexToRgb(color0));
    gl.uniform3f(uniforms.u_color1, ...hexToRgb(color1));
    gl.uniform3f(uniforms.u_color2, ...hexToRgb(color2));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return true;
  }

  /** Where the last frame of this size sits in `canvas` (WebGL draws from the bottom-left). */
  sourceY(height: number): number {
    return this.canvas.height - Math.ceil(height);
  }

  #setupGeometry(): void {
    const gl = this.#gl;
    this.#vertexArray = gl.createVertexArray();
    gl.bindVertexArray(this.#vertexArray);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  }

  #program(flavor: FxFlavor): CompiledProgram | null {
    if (this.#programs.has(flavor)) return this.#programs.get(flavor) ?? null;
    const gl = this.#gl;
    const compile = (type: number, source: string): WebGLShader | null => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
      log.warn(`${flavor} effect shader failed to compile:`, gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    };
    const vertex = compile(gl.VERTEX_SHADER, VERTEX_SOURCE);
    const fragment = compile(gl.FRAGMENT_SHADER, buildFragment(flavor));
    const program = gl.createProgram();
    let compiled: CompiledProgram | null = null;
    if (vertex && fragment && program) {
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.bindAttribLocation(program, 0, "a_position");
      gl.linkProgram(program);
      if (gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const uniforms = Object.fromEntries(SHADER_UNIFORMS.map(name => [name, gl.getUniformLocation(program, name)]));
        compiled = { program, uniforms: uniforms as CompiledProgram["uniforms"] };
      } else {
        log.warn(`${flavor} effect shader failed to link:`, gl.getProgramInfoLog(program));
      }
    }
    if (vertex) gl.deleteShader(vertex);
    if (fragment) gl.deleteShader(fragment);
    this.#programs.set(flavor, compiled);
    return compiled;
  }
}
