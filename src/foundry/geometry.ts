// Canvas geometry that never throws. Foundry v14 assigns Token#shape and MeasuredTemplate#shape only
// while a placeable is drawn, so undrawn placeables simply contain nothing (v1 canvas-shapes.mjs).

export interface Point {
  x: number;
  y: number;
}

function tokenShape(token: TokenPlaceable): ShapeLike | null {
  if (typeof token.getShape === "function") return token.getShape() ?? null;
  return token.shape ?? null;
}

/** The centre of every grid space a token covers. */
export function tokenCenters(token: TokenPlaceable): Point[] {
  const shape = tokenShape(token);
  if (!shape || !canvas.ready) return [];
  const grid = canvas.grid;
  const [i0, j0, i1, j1] = grid.getOffsetRange(token.bounds);
  const gridless = grid.type === CONST.GRID_TYPES.GRIDLESS;
  const delta = gridless ? canvas.dimensions.size : 1;
  const offset = gridless ? canvas.dimensions.size / 2 : 0;
  const points: Point[] = [];
  for (let i = i0; i < i1; i += delta) {
    for (let j = j0; j < j1; j += delta) {
      const point = grid.getCenterPoint({ i: i + offset, j: j + offset });
      if (shape.contains(point.x - token.document.x, point.y - token.document.y)) points.push(point);
    }
  }
  return points;
}

/** The area an aura of `range` feet around `source` covers, limited by walls per requirement; null for none or infinite. */
export function auraShape(source: TokenPlaceable, range: number, require: readonly string[], pad: boolean): ShapeLike | null {
  if (!canvas.ready || (range <= 0)) return null;
  let radius = range;
  if (pad) radius += canvas.grid.distance * Math.max(source.document.width, source.document.height) * 0.5;
  const center = source.center;
  let shape: ShapeLike = new PIXI.Polygon(canvas.grid.getCircle(center, radius));
  for (const type of require) {
    // Sight polygons stop at darkness sources by default (v14 edgeTypes); "includeDarkness" is deprecated.
    shape = foundry.canvas.geometry.ClockwiseSweepPolygon.create(center, {
      type,
      debug: false,
      useThreshold: type !== "move",
      boundaryShapes: [shape]
    });
  }
  return shape;
}

/**
 * Whether `roller` stands within `range` feet of `source` (-1 = anywhere), limited by walls for each
 * requirement ("sight", "move", "sound", "light"), as v1's TokenAura.
 */
export function withinAura(source: TokenPlaceable, roller: TokenPlaceable, range: number, require: readonly string[], pad: boolean): boolean {
  if (range === -1) return true;
  const shape = auraShape(source, range, require, pad);
  return !!shape && tokenCenters(roller).some(point => shape.contains(point.x, point.y));
}

/**
 * Whether a canvas point lies inside a measured template. In v14 a template's shape exists only
 * once the templates layer has drawn it, so it is computed from the document when missing.
 * Like MeasuredTemplate#testPoint, points within a pixel of the edge count as inside.
 */
export function templateContains(template: TemplatePlaceable, point: Point): boolean {
  let shape: ShapeLike | null | undefined = template.shape;
  if (!shape && (typeof template._computeShape === "function")) {
    try {
      shape = template._computeShape();
    } catch {
      shape = null;
    }
  }
  if (!shape) return false;
  const x = point.x - template.document.x;
  const y = point.y - template.document.y;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (shape.contains(x + dx, y + dy)) return true;
    }
  }
  return false;
}
