/**
 * Canvas geometry helpers.
 *
 * Foundry v14 assigns `Token#shape` and `MeasuredTemplate#shape` only while the
 * placeable is being refreshed, so those properties are undefined until the object
 * has been drawn. Reading them directly threw inside the bonus collector, and because
 * that runs before every roll, a single undrawn placeable silently removed every
 * bonus from the roll. These helpers use the public v14 APIs and never throw.
 */

/**
 * The geometry of a token placeable, in the token's local coordinate space.
 * @param {Token5e} token           A token placeable.
 * @returns {PIXI.Polygon|PIXI.Rectangle|PIXI.Circle|PIXI.Ellipse|null}
 */
export function getTokenShape(token) {
  if (!token) return null;
  // Token#getShape computes the same geometry that Token#shape caches once drawn.
  if (typeof token.getShape === "function") return token.getShape() ?? null;
  return token.shape ?? null;
}

/**
 * The center point of every grid space that a token placeable occupies.
 * @param {Token5e} token     A token placeable.
 * @returns {object[]}        An array of xy coordinates, empty if the token has no geometry.
 */
export function collectTokenCenters(token) {
  const points = [];
  const shape = getTokenShape(token);
  if (!shape) return points;

  const [i, j, i1, j1] = canvas.grid.getOffsetRange(token.bounds);
  const gridless = canvas.grid.type === CONST.GRID_TYPES.GRIDLESS;
  const delta = gridless ? canvas.dimensions.size : 1;
  const offset = gridless ? canvas.dimensions.size / 2 : 0;
  for (let x = i; x < i1; x += delta) {
    for (let y = j; y < j1; y += delta) {
      const point = canvas.grid.getCenterPoint({i: x + offset, j: y + offset});
      const p = {
        x: point.x - token.document.x,
        y: point.y - token.document.y
      };
      if (shape.contains(p.x, p.y)) points.push(point);
    }
  }
  return points;
}

/**
 * Whether a point on the canvas falls inside a measured template.
 * @param {MeasuredTemplate} template     A measured template placeable.
 * @param {object} point                  An xy coordinate in canvas space.
 * @returns {boolean}                     False when the template has no computed geometry.
 */
export function templateContainsPoint(template, point) {
  // Both branches read the cached shape, so an undrawn template simply contains nothing.
  if (!template?.shape) return false;
  if (typeof template.testPoint === "function") return template.testPoint(point);
  return template.shape.contains(point.x - template.document.x, point.y - template.document.y);
}
