import * as THREE from 'three';

/**
 * Ventana panorámica con profundidad 3D real en la sala de Telecomunicaciones (Persona B).
 * Adaptada y optimizada para el layout de Marte VR Survival.
 *
 * Características:
 * - Marco reforzado de búnker industrial con remaches y viga divisoria central.
 * - Vidrio semitransparente con tinte cian y rugosidad baja.
 * - Diorama exterior 3D real: terreno marciano procedural ondulado y 6 formaciones de rocas facetadas.
 * - Antena parabólica 3D exterior a 2.4 m que rota suavemente en tiempo real según
 *   la alineación de telecomunicaciones (sim.telecom.alignment).
 * - Baliza roja de advertencia en la punta del mástil con PointLight parpadeante.
 * - Ciclo solar 3D en tiempo real: sol visible continuo (hourFloat), atardeceres marcianos,
 *   noche con 110 estrellas 3D y luna Fobos.
 * - Partículas de polvo marciano volando en 3D que se aceleran en tormenta.
 * - Iluminación exterior aislada (SpotLight dirigido al exterior) para evitar fugas de luz en la base.
 *
 * @param {THREE.Scene} scene
 * @param {any} sim Simulation instance
 */
export function buildPorthole(scene, sim) {
  const root = new THREE.Group();
  root.name = 'Porthole_System';
  scene.add(root);

  // =========================================================================
  // 1. MARCO INDUSTRIAL Y CRISTAL DE LA VENTANA
  // Centrado en la pared norte de room_telecom: x = 3.0, y = 1.6, z = -4.88
  // =========================================================================
  const frameMat = new THREE.MeshLambertMaterial({ color: 0x42474e });
  const frameGroup = new THREE.Group();
  frameGroup.position.set(3.0, 1.6, -4.88);

  // Biseles del marco (superior, inferior, laterales)
  const topSill = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.06, 0.16), frameMat);
  topSill.position.set(0, 0.48, 0);
  const botSill = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.08, 0.20), frameMat);
  botSill.position.set(0, -0.48, 0.02);
  const leftSill = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.96, 0.16), frameMat);
  leftSill.position.set(-0.9, 0, 0);
  const rightSill = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.96, 0.16), frameMat);
  rightSill.position.set(0.9, 0, 0);

  // Viga divisoria vertical central (refuerzo búnker)
  const centerBeam = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.96, 0.14), frameMat);
  frameGroup.add(topSill, botSill, leftSill, rightSill, centerBeam);

  // Remaches metálicos decorativos en los perfiles
  const rivetGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.02, 8);
  const rivetMat = new THREE.MeshLambertMaterial({ color: 0x22262a });
  for (let x = -0.8; x <= 0.8; x += 0.2) {
    const rTop = new THREE.Mesh(rivetGeo, rivetMat);
    rTop.position.set(x, 0.48, 0.08);
    rTop.rotation.x = Math.PI / 2;
    const rBot = new THREE.Mesh(rivetGeo, rivetMat);
    rBot.position.set(x, -0.48, 0.10);
    rBot.rotation.x = Math.PI / 2;
    frameGroup.add(rTop, rBot);
  }

  // Cristal transparente con sutil reflejo y tinte cian
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x7eb8d0,
    roughness: 0.1,
    metalness: 0.12,
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
  });
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.74, 0.92), glassMat);
  glass.position.set(0, 0, 0.01);
  // Mirando hacia el interior de la sala (hacia +z)
  glass.rotation.y = 0;
  frameGroup.add(glass);
  root.add(frameGroup);

  // =========================================================================
  // 2. DIORAMA EXTERIOR 3D (Superficie de Marte y Rocas con Profundidad Real)
  // El exterior se extiende hacia -z (fuera de la pared norte)
  // =========================================================================
  const exterior = new THREE.Group();
  exterior.name = 'Exterior_Mars_3D';
  root.add(exterior);

  // Terreno marciano ondulado (dunas y desniveles)
  const terrainGeo = new THREE.PlaneGeometry(32, 28, 28, 24);
  terrainGeo.rotateX(-Math.PI / 2);
  const posAttr = terrainGeo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    const elevation = Math.sin(x * 0.22) * 0.45 + Math.cos(z * 0.18) * 0.5 + Math.sin(x * 0.45 + z * 0.28) * 0.28;
    posAttr.setY(i, Math.max(-0.25, elevation));
  }
  terrainGeo.computeVertexNormals();

  const terrainMat = new THREE.MeshLambertMaterial({ color: 0x984424 });
  const terrain = new THREE.Mesh(terrainGeo, terrainMat);
  terrain.position.set(3.0, 0, -17.0);
  exterior.add(terrain);

  // Rocas marcianas en 3D dispersas frente a la ventana
  const rockGeo = new THREE.DodecahedronGeometry(0.3, 1);
  const rockMat = new THREE.MeshLambertMaterial({ color: 0x6e2c14 });
  const rockCoords = [
    { x: 2.2, z: -6.8, s: 0.9, rot: 0.4 },
    { x: 3.9, z: -7.1, s: 0.7, rot: 1.2 },
    { x: 1.7, z: -8.5, s: 1.4, rot: 2.1 },
    { x: 4.6, z: -8.2, s: 1.1, rot: 0.8 },
    { x: 2.8, z: -9.5, s: 0.6, rot: 1.7 },
    { x: 3.6, z: -10.2, s: 1.6, rot: 2.9 },
  ];
  for (const rc of rockCoords) {
    const rock = new THREE.Mesh(rockGeo, rockMat);
    rock.position.set(rc.x, 0.15 * rc.s, rc.z);
    rock.scale.set(rc.s, rc.s * 0.7, rc.s * 1.1);
    rock.rotation.set(rc.rot * 0.5, rc.rot, rc.rot * 0.3);
    exterior.add(rock);
  }

  // =========================================================================
  // 3. ANTENA PARABÓLICA 3D EXTERIOR (Orientación y giro dinámico)
  // Posicionada a 2.4 m fuera de la ventana (x: 3.0, y: 0.0, z: -7.3)
  // =========================================================================
  const antennaRoot = new THREE.Group();
  antennaRoot.position.set(3.0, 0, -7.3);
  exterior.add(antennaRoot);

  const metalMastMat = new THREE.MeshLambertMaterial({ color: 0x3d444c });
  const dishMat = new THREE.MeshLambertMaterial({ color: 0xd2d7de });

  // Mástil de soporte de 4 patas
  const mastHeight = 1.9;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.14, mastHeight, 8), metalMastMat);
  mast.position.set(0, mastHeight / 2, 0);
  antennaRoot.add(mast);

  // Puntales de celosía de la torre
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 2) {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 6), metalMastMat);
    strut.position.set(Math.cos(a) * 0.35, 0.5, Math.sin(a) * 0.35);
    strut.rotation.z = Math.cos(a) * 0.35;
    strut.rotation.x = Math.sin(a) * 0.35;
    antennaRoot.add(strut);
  }

  // Baliza roja de advertencia en la punta del mástil
  const beaconGeo = new THREE.SphereGeometry(0.045, 12, 12);
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
  const beacon = new THREE.Mesh(beaconGeo, beaconMat);
  beacon.position.set(0, mastHeight + 0.45, 0);
  antennaRoot.add(beacon);

  const beaconLight = new THREE.PointLight(0xff2222, 1.2, 6);
  beaconLight.position.copy(beacon.position);
  antennaRoot.add(beaconLight);

  // Eje de giro horizontal (Yaw)
  const yawPivot = new THREE.Group();
  yawPivot.position.set(0, mastHeight, 0);
  antennaRoot.add(yawPivot);

  // Eje de inclinación vertical (Pitch)
  const pitchPivot = new THREE.Group();
  pitchPivot.position.set(0, 0.12, 0);
  yawPivot.add(pitchPivot);

  // Plato parabólico 3D (Copa cóncava + aro exterior)
  const dishRim = new THREE.Mesh(new THREE.TorusGeometry(0.65, 0.03, 8, 28), metalMastMat);
  dishRim.rotation.x = Math.PI / 2;
  const dishBowl = new THREE.Mesh(
    new THREE.SphereGeometry(0.65, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.42),
    dishMat
  );
  dishBowl.rotation.x = -Math.PI / 2;
  pitchPivot.add(dishRim, dishBowl);

  // Trípode del receptor central de la antena
  const hornMount = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.22, 8), metalMastMat);
  hornMount.position.set(0, 0, 0.32);
  hornMount.rotation.x = Math.PI / 2;
  pitchPivot.add(hornMount);

  for (let a = 0; a < 3; a++) {
    const angle = (a * Math.PI * 2) / 3;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 6), metalMastMat);
    leg.position.set((Math.cos(angle) * 0.4) / 2, (Math.sin(angle) * 0.4) / 2, 0.16);
    leg.rotation.z = angle + Math.PI / 2;
    leg.rotation.x = 0.55;
    pitchPivot.add(leg);
  }

  // =========================================================================
  // 4. SOL, LUZ Y CIELO 3D (Ciclo Día / Noche, Estrellas y Fobos)
  // =========================================================================
  const sunMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.8, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xffeedd })
  );
  exterior.add(sunMesh);

  const sunGlow = new THREE.Mesh(
    new THREE.SphereGeometry(1.6, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xffaa66, transparent: true, opacity: 0.35 })
  );
  sunMesh.add(sunGlow);

  // Luz solar exterior dirigida hacia Marte (aislada del interior de la base)
  const sunLight = new THREE.SpotLight(0xffeedd, 1.2, 50, Math.PI / 2.2, 0.4);
  exterior.add(sunLight);
  exterior.add(sunLight.target);

  // Foco de trabajo exterior montado sobre el dintel de la base
  const baseFloodlight = new THREE.SpotLight(0xffe0b0, 1.0, 14, Math.PI / 3, 0.5);
  baseFloodlight.position.set(3.0, 2.35, -5.0);
  baseFloodlight.target.position.set(3.0, 1.0, -7.5);
  exterior.add(baseFloodlight);
  exterior.add(baseFloodlight.target);

  // Campo de estrellas 3D para la noche
  const starCount = 110;
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    starPositions[i * 3] = 3.0 + (Math.random() - 0.5) * 26;
    starPositions[i * 3 + 1] = 2.0 + Math.random() * 14;
    starPositions[i * 3 + 2] = -12.0 - Math.random() * 16;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.08, transparent: true, opacity: 0.9 });
  const stars = new THREE.Points(starGeo, starMat);
  exterior.add(stars);

  // Luna marciana Fobos en 3D
  const phobos = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.35, 1),
    new THREE.MeshLambertMaterial({ color: 0xb4a89c })
  );
  phobos.scale.set(1.4, 0.9, 1.1);
  phobos.position.set(7.5, 9.0, -20.0);
  exterior.add(phobos);

  // =========================================================================
  // 5. PARTÍCULAS DE POLVO Y VIENTO 3D
  // =========================================================================
  const dustCount = 80;
  const dustPositions = new Float32Array(dustCount * 3);
  const dustSpeeds = new Float32Array(dustCount);
  for (let i = 0; i < dustCount; i++) {
    dustPositions[i * 3] = -1.0 + Math.random() * 8.0;
    dustPositions[i * 3 + 1] = 0.5 + Math.random() * 3.5;
    dustPositions[i * 3 + 2] = -5.2 - Math.random() * 6.0;
    dustSpeeds[i] = 1.5 + Math.random() * 2.5;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dustMat = new THREE.PointsMaterial({
    color: 0xd47e4b,
    size: 0.045,
    transparent: true,
    opacity: 0.45,
  });
  const dust = new THREE.Points(dustGeo, dustMat);
  exterior.add(dust);

  // =========================================================================
  // 6. BUCLE DE ACTUALIZACIÓN EN TIEMPO REAL
  // =========================================================================
  let totalTime = 0;

  return {
    update(dt) {
      totalTime += dt;

      // Lectura segura y suave del tiempo
      const clock = sim.time?.clock ? sim.time.clock() : null;
      const hour = clock ? clock.hourFloat : (sim.time?.hour ?? 12);
      const storm = Boolean(sim.power?.stormActive || sim.env?.storm);

      // Estado de alineación y motor de antena
      const alignment = sim.telecom ? sim.telecom.alignment : (sim.resources?.get('signal')?.value / 100 ?? 0.95);
      const motorBroken = sim.electronics?.isBroken ? sim.electronics.isBroken('antenna_motor') : Boolean(sim.telecom?.motorBroken);

      // ---- A. CICLO SOLAR Y DÍA/NOCHE CONTINUO ----
      // 06:00 amanecer (Este, +X), 12:00 cenit, 18:00 atardecer (Oeste, -X)
      const isDay = hour >= 6 && hour < 18;
      const dayProgress = (hour - 6) / 12;
      const sunAngle = Math.PI - dayProgress * Math.PI; // Este (+X) hacia Oeste (-X)

      const sunX = 3.0 + Math.cos(sunAngle) * 16.0;
      const sunY = Math.sin(sunAngle) * 13.0;
      const sunZ = -18.0;

      sunMesh.position.set(sunX, sunY, sunZ);
      sunLight.position.set(sunX, Math.max(0.5, sunY), sunZ);
      sunLight.target.position.set(3.0, 1.0, -7.5);

      if (isDay && !storm) {
        sunMesh.visible = true;
        const noonProximity = Math.sin(dayProgress * Math.PI);
        sunLight.intensity = 0.3 + 1.1 * noonProximity;
        sunLight.color.setRGB(1.0, 0.8 + 0.15 * noonProximity, 0.65 + 0.3 * noonProximity);
        terrainMat.color.setHex(0x984424);
        stars.visible = false;
        phobos.visible = false;
      } else if (storm) {
        sunMesh.visible = false;
        sunLight.intensity = 0.2;
        sunLight.color.setHex(0x7a3a18);
        terrainMat.color.setHex(0x5a260e);
        stars.visible = false;
        phobos.visible = false;
      } else {
        // Noche: cielo oscuro, estrellas 3D y Fobos visibles
        sunMesh.visible = false;
        sunLight.intensity = 0.05;
        sunLight.color.setHex(0x334466);
        terrainMat.color.setHex(0x181014);
        stars.visible = true;
        phobos.visible = true;
      }

      // ---- B. MOVIMIENTO Y ORIENTACIÓN DE LA ANTENA ----
      let targetYaw = (alignment - 0.5) * 1.4;
      let targetPitch = 0.35 + alignment * 0.35;

      if (motorBroken) {
        targetYaw = 0.65 + Math.sin(totalTime * 8) * 0.02;
        targetPitch = -0.15;
      }

      yawPivot.rotation.y += (targetYaw - yawPivot.rotation.y) * Math.min(1, dt * 2.5);
      pitchPivot.rotation.x += (targetPitch - pitchPivot.rotation.x) * Math.min(1, dt * 2.5);

      // Baliza roja intermitente
      const beaconOn = Math.sin(totalTime * 4.5) > 0;
      beaconMat.color.setHex(beaconOn ? 0xff2222 : 0x330000);
      beaconLight.intensity = beaconOn ? 1.4 : 0.05;

      // ---- C. PARTÍCULAS DE VIENTO Y POLVO ----
      const dPos = dustGeo.attributes.position.array;
      const windSpeedMultiplier = storm ? 4.5 : 1.0;
      dustMat.opacity = storm ? 0.75 : 0.35;
      dustMat.size = storm ? 0.065 : 0.04;

      for (let i = 0; i < dustCount; i++) {
        dPos[i * 3] += dustSpeeds[i] * dt * windSpeedMultiplier;
        if (dPos[i * 3] > 7.0) {
          dPos[i * 3] = -1.0;
          dPos[i * 3 + 1] = 0.8 + Math.random() * 2.8;
          dPos[i * 3 + 2] = -5.2 - Math.random() * 5.0;
        }
      }
      dustGeo.attributes.position.needsUpdate = true;
    },
  };
}
