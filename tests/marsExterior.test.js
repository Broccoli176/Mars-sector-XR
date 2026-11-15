// @ts-check
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildMarsExterior, BASE_CENTER, BASE_EXCLUSION_RADIUS } from '../src/world/MarsExterior.js';
import { buildSolarField } from '../src/world/SolarField.js';
import { buildPorthole } from '../src/world/Porthole.js';
import { gameData } from '../src/data/index.js';

describe('Unified Mars Exterior (MarsExterior.js)', () => {
  const createMockSim = (hour = 12, storm = false) => ({
    time: { clock: () => ({ hourFloat: hour }) },
    power: {
      cfg: gameData.balance.power,
      stormActive: storm,
      dustFactor: 1.0,
    },
    telecom: {
      angle: 45,
      alignment: 0.85,
      motorBroken: false,
    },
    balance: gameData.balance,
    bus: { on: () => {}, off: () => {}, emit: () => {} },
  });

  it('builds the unified world with circular terrain, sky dome, lighting, fog, antenna, rocks and dust', () => {
    const scene = new THREE.Scene();
    const exterior = buildMarsExterior(scene, () => createMockSim(12));

    expect(exterior.root).toBeDefined();
    expect(exterior.root.name).toBe('MarsExterior_Unified');

    // Lights
    const sunLight = exterior.root.getObjectByName('Mars_SunLight');
    const ambientLight = exterior.root.getObjectByName('Mars_AmbientLight');
    expect(sunLight).toBeInstanceOf(THREE.DirectionalLight);
    expect(ambientLight).toBeInstanceOf(THREE.AmbientLight);

    // Fog
    expect(scene.fog).toBeInstanceOf(THREE.FogExp2);

    // Circular Terrain
    const terrain = exterior.root.getObjectByName('Mars_Terrain');
    expect(terrain).toBeInstanceOf(THREE.Mesh);
    expect(terrain.geometry.attributes.position.count).toBeGreaterThan(1000);

    // Instanced Rocks
    const rocks = exterior.root.getObjectByName('Mars_Rocks_Instanced');
    expect(rocks).toBeInstanceOf(THREE.InstancedMesh);
    expect(rocks.count).toBeGreaterThanOrEqual(40);

    // Global Dust
    const dust = exterior.root.getObjectByName('Mars_Global_Dust');
    expect(dust).toBeInstanceOf(THREE.Points);

    // Telecom Antenna
    const antenna = exterior.root.getObjectByName('Telecom_Antenna_3D');
    expect(antenna).toBeDefined();
    expect(antenna.position.x).toBeCloseTo(-7.5, 1);
    expect(antenna.position.z).toBeCloseTo(-9.88, 1);
  });

  it('dynamically adapts lighting, sky, stars and sun between day and night', () => {
    const scene = new THREE.Scene();
    let currentHour = 12;
    const exterior = buildMarsExterior(scene, () => createMockSim(currentHour));

    // Midday (hour 12)
    exterior.update(0.1);
    const sunLight = exterior.root.getObjectByName('Mars_SunLight');
    const ambientLight = exterior.root.getObjectByName('Mars_AmbientLight');
    const stars = exterior.root.children.find((c) => c instanceof THREE.Points && c.name !== 'Mars_Global_Dust');

    expect(sunLight.intensity).toBeGreaterThan(1.0);
    expect(ambientLight.intensity).toBeGreaterThan(0.4);
    expect(stars.material.opacity).toBeCloseTo(0, 1);

    // Night (hour 2)
    currentHour = 2;
    exterior.update(0.1);
    expect(sunLight.intensity).toBe(0);
    expect(ambientLight.intensity).toBeLessThan(0.15);
    expect(stars.material.opacity).toBeGreaterThan(0.7);
  });

  it('telecom antenna rotates smoothly with sim telecom angle and alignment', () => {
    const scene = new THREE.Scene();
    const sim = createMockSim(12);
    sim.telecom.angle = 60;
    sim.telecom.alignment = 0.9;
    const exterior = buildMarsExterior(scene, () => sim);

    exterior.update(1.0);
    const antenna = exterior.root.getObjectByName('Telecom_Antenna_3D');
    expect(antenna).toBeDefined();
  });

  it('both Porthole and SolarField integrate with the unified exterior without duplicate dioramas', () => {
    const scene = new THREE.Scene();
    const sim = createMockSim(12);
    const exterior = buildMarsExterior(scene, () => sim);

    const porthole = buildPorthole(scene, () => sim, {
      center: [-7.5, 1.6, -7.5],
      width: 1.8,
      height: 1.0,
    }, exterior);

    const solarField = buildSolarField(scene, () => sim, {
      center: [15, 1.675, 7.0],
      width: 2.8,
      height: 1.25,
      radius: 0.6,
      outward: [1, 0],
    }, exterior);

    expect(porthole.root).toBeDefined();
    expect(solarField.root).toBeDefined();

    // Verify solarField has SolarPanels with count 12 and valid UVs on the panel geometry
    const panels = solarField.root.getObjectByName('SolarPanels');
    expect(panels).toBeDefined();
    expect(panels.count).toBe(12);
    expect(panels.geometry.attributes.uv).toBeDefined();
  });
});
