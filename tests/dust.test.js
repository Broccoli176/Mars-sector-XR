import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { gameData } from '../src/data/index.js';
import { buildSolarField, fieldLook, shieldWave } from '../src/world/SolarField.js';
import { newSim, runTicks } from './helpers/sim.js';

const dust = gameData.balance.dust;

describe('Dust on the solar panels (spec §2.5)', () => {
  it('renders 12 panels (2 rows) and the shield wave, without rover, pad or Tesla coil', () => {
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
    expect(names).not.toContain('Rover1_ChargingPad');
    expect(names).not.toContain('Rover2_Cleaning');
    expect(names).not.toContain('TeslaCoil_FieldProp');
    expect(names).toContain('SolarPanelShieldWave');
  });

  it('the shield wave sweeps the panels one after another, then stops', () => {
    const fx = gameData.balance.cleanFx;
    expect(shieldWave(0, 0, fx).active).toBe(true);
    expect(shieldWave(0, 1, fx).active).toBe(false);
    expect(shieldWave(fx.stepS + 0.01, 1, fx).active).toBe(true);
    const sweep = fx.durationS - fx.stepS * 5;
    const mid = shieldWave(sweep / 2, 0, fx);
    expect(mid.x).toBeCloseTo(0, 5);
    expect(mid.opacity).toBeCloseTo(1, 5);
    for (let i = 0; i < 6; i++) expect(shieldWave(fx.durationS + 0.01, i, fx).active).toBe(false);
  });

  it('LIMPIAR (shield) plays the wave in the window and ends after its duration', () => {
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
    expect(field.isCleaning).toBe(false);
    sim.bus.emit('solar:clean', {});
    expect(sim.power.dustFactor).toBeGreaterThan(0.7);
    expect(field.isCleaning).toBe(true);
    field.update(0.5);
    expect(field.root.getObjectByName('SolarPanelShieldWave').visible).toBe(true);
    field.update(gameData.balance.cleanFx.durationS);
    expect(field.isCleaning).toBe(false);
    expect(field.root.getObjectByName('SolarPanelShieldWave').visible).toBe(false);
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
    expect(events[1]).toMatchObject({ by: 'shield', kwh: dust.cleanKwh });
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
