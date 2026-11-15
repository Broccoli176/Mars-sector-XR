import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { roverCameraYaw, roverModelYaw } from '../src/world/RoverWorld.js';

describe('3D rover orientation', () => {
  it('aligns the model front and FPV camera with the map heading', () => {
    const forwardAxis = new THREE.Vector3(0, 0, 1);
    const cameraAxis = new THREE.Vector3(0, 0, -1);

    for (const heading of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
      const expectedForward = new THREE.Vector3(Math.sin(heading), 0, -Math.cos(heading));
      const modelForward = forwardAxis.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), roverModelYaw(heading));
      const cameraForward = cameraAxis.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), roverCameraYaw(heading));

      expect(modelForward.x).toBeCloseTo(expectedForward.x, 6);
      expect(modelForward.z).toBeCloseTo(expectedForward.z, 6);
      expect(cameraForward.x).toBeCloseTo(expectedForward.x, 6);
      expect(cameraForward.z).toBeCloseTo(expectedForward.z, 6);
    }
  });
});
