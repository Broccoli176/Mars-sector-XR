// Real NASA photos on the rover NavCam (pure rules, no three.js; tested in tests/roverPhotos.test.js).
// Data: src/data/real/rover_photos.json (curated photojournal images + latest NavCam snapshot).

/**
 * Which photo the NavCam shows: the site photo when the rover is at a site that has one; the latest real
 * NavCam frame while docked at base; otherwise none (drawn view).
 * @param {{ x: number, y: number, docked: boolean }} rover
 * @param {{ photos: any[], latest?: any } | null | undefined} data
 * @param {{ sites: { id: string, x: number, y: number }[], siteRadiusM: number }} cfg
 * @returns {{ kind: 'site', photo: any, siteId: string } | { kind: 'latest', photo: any } | null}
 */
export function photoForRover(rover, data, cfg) {
  if (!data) return null;
  for (const site of cfg.sites) {
    if (Math.hypot(site.x - rover.x, site.y - rover.y) > cfg.siteRadiusM) continue;
    const photo = data.photos.find((p) => p.siteId === site.id);
    if (photo) return { kind: 'site', photo, siteId: site.id };
  }
  if (rover.docked && data.latest) return { kind: 'latest', photo: data.latest };
  return null;
}

/**
 * Source rectangle (cover) for drawing an image into a W×H screen, honouring an optional crop
 * [x, y, w, h] in fractions of the image. Without crop the whole image is fitted (contain).
 * @param {number} iw @param {number} ih @param {number} W @param {number} H @param {number[] | null} crop
 * @returns {{ sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number }}
 */
export function photoRect(iw, ih, W, H, crop) {
  if (!crop) {
    const s = Math.min(W / iw, H / ih);
    const dw = iw * s;
    const dh = ih * s;
    return { sx: 0, sy: 0, sw: iw, sh: ih, dx: (W - dw) / 2, dy: (H - dh) / 2, dw, dh };
  }
  let sx = crop[0] * iw;
  let sy = crop[1] * ih;
  let sw = crop[2] * iw;
  let sh = crop[3] * ih;
  // Cover: trim the crop to the screen's aspect ratio, keeping it centred.
  const target = W / H;
  if (sw / sh > target) {
    const nw = sh * target;
    sx += (sw - nw) / 2;
    sw = nw;
  } else {
    const nh = sw / target;
    sy += (sh - nh) / 2;
    sh = nh;
  }
  return { sx, sy, sw, sh, dx: 0, dy: 0, dw: W, dh: H };
}

/** Sites with a real photo already visited by the rover (gallery counter). @param {Set<string>} visited @param {any[]} photos */
export function photosReceived(visited, photos) {
  const withPhoto = [...new Set(photos.map((p) => p.siteId))];
  return { got: withPhoto.filter((id) => visited.has(id)).length, total: withPhoto.length };
}
