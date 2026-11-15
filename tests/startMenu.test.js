import { describe, it, expect } from 'vitest';
import { vrStatus, startMode, VR_SESSION_INIT } from '../src/ui/startMenuRules.js';
import { gameData } from '../src/data/index.js';

describe('start menu rules', () => {
  it('VR is ready only when the browser offers immersive-vr (headset or emulator extension)', () => {
    expect(vrStatus({ hasXr: true, supported: true })).toBe('ready');
    expect(vrStatus({ hasXr: true, supported: false })).toBe('needsExtension'); // desktop Chrome without the extension
    expect(vrStatus({ hasXr: false, supported: false })).toBe('needsExtension');
  });

  it('the menu shows by default; dev params can skip it', () => {
    expect(startMode(new URLSearchParams(''))).toBe('menu');
    expect(startMode(new URLSearchParams('mode=browser'))).toBe('browser');
    expect(startMode(new URLSearchParams('view=1,2,90'))).toBe('browser');
    expect(startMode(new URLSearchParams('iwer'))).toBe('menu');
  });

  it('asks for a floor-level reference space like the old VR button', () => {
    expect(VR_SESSION_INIT.optionalFeatures).toContain('local-floor');
  });

  it('every menu text exists in Spanish', () => {
    const keys = ['menu.title', 'menu.subtitle', 'menu.vr.name', 'menu.vr.desc', 'menu.vr.ready', 'menu.vr.not_detected',
      'menu.vr.missing', 'menu.vr.install', 'menu.vr.emulator', 'menu.browser.name', 'menu.browser.desc', 'menu.error'];
    for (const k of keys) expect(gameData.strings[k], k).toBeTypeOf('string');
  });
});

describe('mission briefing on the start menu', () => {
  it('comes from the game data: 7 days, ≈ 42 min at 1×, and the scripted crises in order', async () => {
    const { missionBriefing } = await import('../src/ui/startMenuRules.js');
    const b = missionBriefing(gameData.balance, gameData.events);
    expect(b.days).toBe(gameData.balance.time.totalDays);
    expect(b.minutesAt1x).toBe(Math.round((b.days * gameData.balance.time.secondsPerDay) / 60));
    expect(b.timeline.map((e) => e.type)).toEqual(['relayTrip', 'receiverFault', 'fault_scrubber_fan', 'storm', 'leak', 'sep', 'fault_antenna_motor']);
    expect(b.timeline.map((e) => e.day)).toEqual([...b.timeline.map((e) => e.day)].sort((x, y) => x - y));
    for (const e of b.timeline) expect(gameData.strings[`menu.event.${e.type}`], e.type).toBeTypeOf('string');
  });
});
