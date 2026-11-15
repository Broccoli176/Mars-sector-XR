import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Rounded-rectangle path centred on (cx, cy). The radius is clamped to half the shorter side.
 * @param {THREE.Shape | THREE.Path} path @param {number} w @param {number} h @param {number} r
 * @param {number} [cx] @param {number} [cy]
 */
export function roundedRectPath(path, w, h, r, cx = 0, cy = 0) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  const x0 = cx - w / 2;
  const y0 = cy - h / 2;
  const x1 = cx + w / 2;
  const y1 = cy + h / 2;
  if (rr <= 0) {
    // Plain rectangle (no degenerate zero-length curves for the triangulator).
    path.moveTo(x0, y0);
    path.lineTo(x1, y0);
    path.lineTo(x1, y1);
    path.lineTo(x0, y1);
    path.lineTo(x0, y0);
    return path;
  }
  path.moveTo(x0 + rr, y0);
  path.lineTo(x1 - rr, y0);
  path.quadraticCurveTo(x1, y0, x1, y0 + rr);
  path.lineTo(x1, y1 - rr);
  path.quadraticCurveTo(x1, y1, x1 - rr, y1);
  path.lineTo(x0 + rr, y1);
  path.quadraticCurveTo(x0, y1, x0, y1 - rr);
  path.lineTo(x0, y0 + rr);
  path.quadraticCurveTo(x0, y0, x0 + rr, y0);
  return path;
}

/** Filled rounded rectangle in the XY plane. @param {number} w @param {number} h @param {number} r */
export function roundedRectGeometry(w, h, r) {
  return new THREE.ShapeGeometry(roundedRectPath(new THREE.Shape(), w, h, r), 6);
}

/**
 * Ring between an outer and an inner rounded rectangle, extruded `depth` along z and centred on z = 0.
 * Indexed (so it merges with BoxGeometry). Used for the wall fill of a rounded window and for its frame.
 * @param {{ w: number, h: number, r: number }} outer @param {{ w: number, h: number, r: number }} inner
 * @param {number} depth
 */
export function roundedRingGeometry(outer, inner, depth) {
  const shape = roundedRectPath(new THREE.Shape(), outer.w, outer.h, outer.r);
  shape.holes.push(roundedRectPath(new THREE.Path(), inner.w, inner.h, inner.r));
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 6 }).translate(0, 0, -depth / 2);
  geo.clearGroups();
  return mergeVertices(geo);
}
