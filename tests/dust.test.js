import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { gameData } from '../src/data/index.js';
import { buildSolarField, fieldLook, cleanerPath, cleanerDuration } from '../src/world/SolarField.js';
import { newSim, runTicks } from './helpers/sim.js';

const dust = gameData.balance.dust;

describe('Dust on the solar panels (spec §2.5)', () => {
  it('renders 12 panels (2 rows), the cleaning robot and its dock', () => {
    const field = buildSolarField(new THREE.Scene(), () => ({ balance: gameData.balance }), {
      center: [0, 1.5, 0],
      width: 2,
      height: 1,
      outward: [1, 0],
    });
    const nodes = [];
    field.root.traverse((node) => nodes.push(node));
    const panels = nodes.find((node) => node.name === 'SolarPanels');
    expect(panels.count).toBe(12);
    const names = nodes.map((node) => node.name);
    expect(names).toContain('SolarCleanerRover');
    expect(names).toContain('SolarCleanerDock');
    expect(names).not.toContain('SolarPanelShieldWave');
  });

  it('the robot leaves its dock, brushes every panel in order end to end, then returns', () => {
    const fx = gameData.balance.cleanFx;
    const total = cleanerDuration(fx, 12);
    expect(cleanerPath(0, fx, 12)).toMatchObject({ phase: 'leave', panel: 0, cleaned: 0 });
    const first = cleanerPath(fx.dockHopS + fx.perPanelS / 2, fx, 12);
    expect(first).toMatchObject({ phase: 'brush', panel: 0 });
    expect(first.x).toBeCloseTo(0, 5);
    expect(cleanerPath(fx.dockHopS + fx.perPanelS + fx.hopS / 2, fx, 12)).toMatchObject({ phase: 'hop', from: 0, panel: 1, cleaned: 1 });
    // Panels are visited 0 → 11 and the "cleaned" count only grows.
    const seen = [];
    let cleaned = 0;
    for (let t = 0; t <= total; t += 0.05) {
      const at = cleanerPath(t, fx, 12);
      if (at.phase === 'brush' && seen[seen.length - 1] !== at.panel) seen.push(at.panel);
      expect(at.cleaned).toBeGreaterThanOrEqual(cleaned);
      cleaned = at.cleaned;
    }
    expect(seen).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(cleanerPath(total - fx.dockHopS / 2, fx, 12).phase).toBe('return');
    expect(cleanerPath(total + 0.01, fx, 12)).toMatchObject({ phase: 'done', cleaned: 12 });
  });

  it('LIMPIAR sends the robot out and it parks again when the run ends', () => {
    const sim = newSim({ events: [] });
    sim.bus.emit('game:start');
    sim.power.dustFactor = 0.7;
    const field = buildSolarField(new THREE.Scene(), () => sim, {
      center: [0, 1.5, 0],
      width: 2,
      height: 1,
      outward: [1, 0],
    });
    field.update(0);
    const robot = field.root.getObjectByName('SolarCleanerRover');
    const parked = robot.position.clone();
    expect(field.isCleaning).toBe(false);
    sim.bus.emit('solar:clean', {});
    expect(sim.power.dustFactor).toBeGreaterThan(0.7);
    expect(field.isCleaning).toBe(true);
    field.update(gameData.balance.cleanFx.dockHopS + 0.2);
    expect(robot.position.distanceTo(parked)).toBeGreaterThan(1);
    field.update(cleanerDuration(gameData.balance.cleanFx, 12));
    expect(field.isCleaning).toBe(false);
    expect(robot.position.distanceTo(parked)).toBeLessThan(1e-6);
  });

  it('settles at the real Mars Pathfinder rate when calm (0.28 % per sol)', () => {
    expect(dust.calmLossPerSol).toBe(gameData.real.solar_dust.measured.maeObscurationPerSol);
    const sim = newSim({ events: [] });
    sim.bus.emit('game:start');
    runTicks(sim, 24 * 60);
    expect(sim.power.dustFactor).toBeCloseTo(1 - dust.calmLossPerSol, 4);
  });

  it('a dust storm buries the panels and cuts solar output', () => {
    const sim = newSim({ events: [{ id: 's', day: 1, time: '06:00', type: 'storm', durationHours: 10 }] });
    sim.bus.emit('game:start');
    runTicks(sim, 10 * 60 + 1);
    expect(sim.power.stormActive).toBe(false);
    expect(sim.power.dustFactor).toBeLessThan(0.93);
    const noon = { hourFloat: 12 };
    const trackerFactor = sim.solarTracker.factor(noon.hourFloat);
    expect(sim.power.generation(noon)).toBeCloseTo(sim.power.cfg.rtgKw + sim.power.cfg.solarKw * trackerFactor * sim.power.dustFactor, 6);
  });

  it('the electrodynamic dust shield recovers output for a battery cost, and refuses when useless', () => {
    const sim = newSim({ events: [] });
    /** @type {any[]} */
    const events = [];
    sim.bus.on('solar:cleaned', (e) => events.push(e));
    sim.bus.on('solar:rejected', (e) => events.push(e));
    sim.bus.emit('solar:clean');
    expect(events[0]).toEqual({ reason: 'noDust' });

    sim.power.dustFactor = 0.7;
    const battery = sim.resources.value('power');
    sim.bus.emit('solar:clean');
    expect(events[1]).toMatchObject({ by: 'robot', kwh: dust.cleanKwh });
    expect(sim.power.dustFactor).toBeCloseTo(1 - 0.3 * (1 - dust.cleanRecovery));
    expect(sim.resources.value('power')).toBeCloseTo(battery - dust.cleanKwh);

    sim.power.dustFactor = 0.7;
    sim.power.stormActive = true;
    sim.bus.emit('solar:clean');
    expect(events[2]).toEqual({ reason: 'storm' });
  });

  it('a dust devil sweeps part of the dust away (scripted event)', () => {
    const sim = newSim({ events: [{ id: 'd', day: 1, time: '07:00', type: 'dustDevil' }] });
    sim.power.dustFactor = 0.6;
    sim.bus.emit('game:start');
    runTicks(sim, 61);
    expect(sim.power.dustFactor).toBeGreaterThan(0.6 + 0.4 * dust.devilRecovery - 0.01);
  });

  it('the solar window shows dirty panels as duller', () => {
    const power = gameData.balance.power;
    expect(fieldLook(12, false, power, 0.6).panel).toBeLessThan(fieldLook(12, false, power, 1).panel);
    expect(fieldLook(12, false, power, 0.6).soil).toBeCloseTo(0.4);
  });
});
