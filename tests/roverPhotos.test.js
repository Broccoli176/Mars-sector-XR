import { describe, it, expect } from 'vitest';
import { existsSync, statSync } from 'node:fs';
import { photoForRover, photoRect, photosReceived } from '../src/rooms/control/roverPhotos.js';
import { gameData } from '../src/data/index.js';

const data = gameData.real.rover_photos;
const cfg = gameData.balance.rover;
const file = (f) => new URL(`../public/images/rover/${f}`, import.meta.url);

describe('real NASA photos for the rover NavCam', () => {
  it('every photo is credited, linked, captioned and present (and light enough for the Quest)', () => {
    expect(data.photos.length).toBeGreaterThanOrEqual(2);
    for (const p of [...data.photos, data.latest]) {
      expect(p.url).toMatch(/^https:\/\//);
      expect(p.pageUrl).toMatch(/^https:\/\//);
      expect(p.credit).toMatch(/NASA/);
      expect(existsSync(file(p.file)), p.file).toBe(true);
      expect(statSync(file(p.file)).size).toBeLessThan(400 * 1024);
    }
    for (const p of data.photos) {
      expect(gameData.strings[p.captionKey], p.captionKey).toBeDefined();
      expect(cfg.sites.some((s) => s.id === p.siteId), p.siteId).toBe(true);
    }
  });

  it('shows the site photo within reach, the latest NavCam when docked, nothing elsewhere', () => {
    const backshell = cfg.sites.find((s) => s.id === 'backshell');
    expect(photoForRover({ x: backshell.x + 3, y: backshell.y, docked: false }, data, cfg)).toMatchObject({ kind: 'site', siteId: 'backshell' });
    expect(photoForRover({ x: 0, y: 0, docked: true }, data, cfg)?.kind).toBe('latest');
    expect(photoForRover({ x: 30, y: 30, docked: false }, data, cfg)).toBeNull();
    expect(photoForRover({ x: 0, y: 0, docked: true }, null, cfg)).toBeNull();
  });

  it('crops cover the screen with its aspect ratio; without crop the image is fitted whole', () => {
    const c = photoRect(1200, 358, 860, 620, [0.1, 0, 0.41, 1]);
    expect(c.sw / c.sh).toBeCloseTo(860 / 620, 5);
    expect(c.dw).toBe(860);
    const fit = photoRect(1200, 1060, 860, 620, null);
    expect(fit.dh).toBeCloseTo(620);
    expect(fit.dw).toBeLessThan(860);
  });

  it('counts received photos', () => {
    expect(photosReceived(new Set(['backshell', 'delta', 'nothing']), data.photos).got).toBe(2);
  });
});
