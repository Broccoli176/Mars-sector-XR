import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { gameData } from '../src/data/index.js';
import { buildSolarField, fieldLook } from '../src/world/SolarField.js';
import { newSim, runTicks } from './helpers/sim.js';

const dust = gameData.balance.dust;

describe('Dust on the solar panels (spec §2.5)', () => {
  it('renders six panels, Rover 2, and the Tesla coil without the parked rover', () => {
    const field = buildSolarField(new THREE.Scene(), () => ({ balance: gameData.balance }), {
      center: [0, 1.5, 0],
      width: 2,
      height: 1,
      outward: [1, 0],
    }, { camera: new THREE.PerspectiveCamera(), dolly: new THREE.Group() });
    const nodes = [];
    field.root.traverse((node) => nodes.push(node));
    const panels = nodes.find((node) => node.name === 'SolarPanels');
    expect(panels.count).toBe(6);
    expect(nodes.map((node) => node.name)).not.toContain('Rover1_ChargingPad');
    expect(nodes.map((node) => node.name)).toContain('Rover2_Cleaning');
    expect(nodes.map((node) => node.name)).toContain('TeslaCoil_FieldProp');
  });

  it('follows Rover 2 in third person and only cleans panels after it is close enough', () => {
    const sim = newSim({ events: [] });
    sim.bus.emit('game:start');
    sim.power.dustFactor = 0.7;
    const camera = new THREE.PerspectiveCamera();
    camera.position.y = 1.6;
    const dolly = new THREE.Group();
    dolly.add(camera);
    const field = buildSolarField(new THREE.Scene(), () => sim, {
      center: [0, 1.5, 0],
      width: 2,
      height: 1,
      outward: [1, 0],
    }, { camera, dolly });
    /** @type {any[]} */
    const cleaned = [];
    sim.bus.on('solar:cleaned', (e) => cleaned.push(e));
    field.update(0);

    sim.bus.emit('rover2:control');
    expect(field.isControllingRover2).toBe(true);
    field.update(0);
    const rover2 = field.root.getObjectByName('Rover2_Cleaning');
    const roverPosition = rover2.getWorldPosition(new THREE.Vector3());
    const roverForward = rover2.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
    const cameraPosition = camera.getWorldPosition(new THREE.Vector3());
    const cameraDirection = camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
    const roverFromCamera = roverPosition.sub(cameraPosition).setY(0).normalize();
    expect(cameraDirection.dot(roverForward)).toBeGreaterThan(0.99);
    expect(roverFromCamera.dot(roverForward)).toBeGreaterThan(0.99);

    sim.bus.emit('rover2:clean');
    expect(sim.power.dustFactor).toBe(0.7);

    const cameraStart = dolly.position.clone();
    field.update(1, { drive: 1 });
    expect(dolly.position.distanceTo(cameraStart)).toBeGreaterThan(0);
    sim.bus.emit('rover2:clean');
    expect(sim.power.dustFactor).toBeGreaterThan(0.7);
    expect(cleaned[0].by).toBe('rover2');
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
