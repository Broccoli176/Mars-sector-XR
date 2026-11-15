import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { gameData } from '../data/index.js';
import { createTranslator } from '../utils/strings.js';
import { Game } from './Game.js';
import { buildBasement } from '../world/Basement.js';
import { buildPorthole } from '../world/Porthole.js';
import { buildSolarField } from '../world/SolarField.js';
import { buildRoverWorld } from '../world/RoverWorld.js';
import { buildStations, renderBio } from '../ui/Stations.js';
import { Panel } from '../ui/Panel.js';
import { Interaction } from '../vr/Interaction.js';
import { Locomotion } from '../vr/Locomotion.js';
import { XRControls } from '../vr/XRControls.js';
import { DesktopControls } from '../vr/DesktopControls.js';
import { KeyboardLocomotion } from '../vr/KeyboardLocomotion.js';
import { buildCollider } from '../vr/Collision.js';
import { Grab } from '../vr/Grab.js';
import { Holsters } from '../vr/Holsters.js';

// Dev-only: `?iwer` installs Meta's Immersive Web Emulation Runtime (Quest 3) without the browser
// extension. Must run before VRButton checks session support. Lazy-loaded: not in the main bundle.
const devParams = new URLSearchParams(window.location.search);
if (devParams.has('iwer')) {
  const { installEmulatedQuest3 } = await import('../dev/iwer.js');
  /** @type {any} */ (window).__xrDevice = installEmulatedQuest3();
}

const PANEL_REFRESH_SECONDS = 0.25; // 4 Hz canvas updates
const MAX_FRAME_DT = 0.1;
const FACING_YAW = { north: 0, west: Math.PI / 2, south: Math.PI, east: -Math.PI / 2 };

const t = createTranslator(gameData.strings);
const game = new Game(gameData, t);
const { layout } = gameData;

// Renderer: conservative Quest settings (AGENTS.md §7): no shadows, no post-processing.
// ACES tone mapping runs inside the material shaders (no extra pass); UI panels opt out (toneMapped: false).
const container = /** @type {HTMLElement} */ (document.getElementById('app'));
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFramebufferScaleFactor(1.0);
renderer.xr.setFoveation(1.0);
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#050607');

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 60);
camera.position.set(0, layout.eyeHeight, 0);
const dolly = new THREE.Group();
dolly.name = 'PlayerRig';
dolly.position.fromArray(layout.spawn.position);
dolly.rotation.y = FACING_YAW[/** @type {keyof typeof FACING_YAW} */ (layout.spawn.facing)] ?? 0;
dolly.add(camera);
scene.add(dolly);

// Dev-only URL params:
//   ?view=x,z,deg  places the rig (deg: 0 = north, -90 = east) for quick inspection/screenshots.
//   ?ff=ticks      fast-forwards the simulation that many ticks right after "Iniciar turno".
let fastForwardTicks = Math.max(0, Number(devParams.get('ff')) || 0);
const viewParam = devParams.get('view');
if (viewParam) {
  const [vx, vz, deg] = viewParam.split(',').map(Number);
  if ([vx, vz].every(Number.isFinite)) dolly.position.set(vx, 0, vz);
  if (Number.isFinite(deg)) dolly.rotation.y = THREE.MathUtils.degToRad(deg);
}

// World + stations
const basement = buildBasement(layout, t);
scene.add(basement.group);
// Telecom panoramic window: the wall tagged view "telecom" (exterior lies to its -z side).
const windowWall = layout.walls.find((/** @type {any} */ w) => w.view === 'telecom');
const [ws0, ws1, wy0, wy1] = windowWall.windows[0];
const porthole = buildPorthole(scene, () => game.sim, {
  center: [(ws0 + ws1) / 2, (wy0 + wy1) / 2, windowWall.from[1] + 0.02],
  width: ws1 - ws0,
  height: wy1 - wy0 - 0.04,
});
// Energía window onto the solar field: the wall tagged view "solar" (exterior lies to its +x side).
const solarWall = layout.walls.find((/** @type {any} */ w) => w.view === 'solar');
const [ss0, ss1, sy0, sy1, sRadius = 0] = solarWall.windows[0];
const solarField = buildSolarField(scene, () => game.sim, {
  center: [solarWall.from[0], (sy0 + sy1) / 2, (ss0 + ss1) / 2],
  width: ss1 - ss0,
  height: sy1 - sy0 - 0.04,
  radius: sRadius,
  outward: [1, 0],
}, { camera, dolly });
// Hand-held objects (tools) and the two hip holsters (spec §9.3). Created before the stations so
// room builders can use them through kit.services.
const locomotion = new Locomotion(renderer, dolly, camera);
const grab = new Grab(scene);
const holsters = new Holsters(scene, locomotion, gameData.balance.holster);
const roverWorld = buildRoverWorld(scene, game, camera, dolly, layout);
/** @type {THREE.Object3D[]} */
const interactive = [];
const stations = buildStations({
  layout, rooms: basement.rooms, game, t, scene, interactive,
  services: { scene, grab, holsters, floors: basement.floors, renderer, roverWorld, solarField, locomotion },
});

// Interaction and locomotion
// Furniture blocks the teleport ray and the keyboard body (top-down AABBs).
scene.updateMatrixWorld(true);
const collider = buildCollider(layout);
const _bounds = new THREE.Box3();
for (const solid of stations.solids) {
  _bounds.setFromObject(solid);
  if (_bounds.max.y > 0.3) collider.addBox({ x0: _bounds.min.x, x1: _bounds.max.x, z0: _bounds.min.z, z1: _bounds.max.z });
}
const interaction = new Interaction(interactive, basement.floors, [...basement.walls, ...stations.solids]);
const xr = new XRControls(renderer, dolly, interaction, locomotion);
const desktop = new DesktopControls(renderer.domElement, renderer, dolly, camera, interaction, locomotion);
xr.grab = grab; // grip button
desktop.grab = grab; // G key (dev)
xr.holsters = holsters; // B/Y belt button
desktop.holsters = holsters; // H key (dev)
holsters.grab = grab; // rings light up while holding a tool
const keyboard = new KeyboardLocomotion(renderer, camera, dolly, locomotion, collider);
if (devParams.has('iwer') || devParams.has('debug')) {
  // Do not expose the THREE namespace here: referencing it as a value defeats tree-shaking.
  /** @type {any} */ (window).__marte = { renderer, camera, dolly, game, grab, holsters, Vector3: THREE.Vector3 };
}

// Wrist biomonitor on the left controller (physical device, not a head-locked HUD).
const wristBio = new Panel(0.13, 0.08, { pxPerMeter: 2400 });
wristBio.mesh.position.set(0, 0.035, 0.05);
wristBio.mesh.rotation.x = -Math.PI / 2.6;
xr.onLeftGrip = (grip) => grip.add(wristBio.mesh);

// Dev overlay (desktop only)
const help = /** @type {HTMLElement} */ (document.getElementById('dev-help'));
const crosshair = /** @type {HTMLElement} */ (document.getElementById('crosshair'));
help.textContent = t('dev.help');
crosshair.style.display = 'none';

document.body.appendChild(VRButton.createButton(renderer));

// Auto-pause (SIMULATION_SPEC §1.1): page hidden or XR session not visible.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') game.intent('time:autoPause');
});
renderer.xr.addEventListener('sessionstart', () => {
  help.style.display = 'none';
  const session = renderer.xr.getSession();
  session?.addEventListener('visibilitychange', () => {
    if (session.visibilityState !== 'visible') game.intent('time:autoPause');
  });
});
renderer.xr.addEventListener('sessionend', () => {
  help.style.display = '';
  camera.position.set(0, layout.eyeHeight, 0);
  camera.rotation.set(0, 0, 0);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Emergency lighting when the lighting circuit is not served.
let emergency = false;
function applyLighting() {
  const lit = game.sim.power.served.lighting;
  if (lit === !emergency) return;
  emergency = !lit;
  basement.setEmergency(emergency);
}

const timer = new THREE.Timer();
let refreshTimer = 0;
stations.refresh();
renderBio(wristBio, game.sim, t);

renderer.setAnimationLoop((timestamp) => {
  timer.update(timestamp);
  const dt = Math.min(timer.getDelta(), MAX_FRAME_DT);
  if (fastForwardTicks > 0 && game.sim.phase === 'playing') {
    for (let i = 0; i < fastForwardTicks && game.sim.phase === 'playing'; i++) game.sim.step();
    fastForwardTicks = 0;
  }
  game.sim.advance(dt);
  const controllingRover2 = solarField.isControllingRover2;
  xr.setRover2Control(controllingRover2);
  desktop.setRover2Control(controllingRover2);
  if (!roverWorld.isFPV && !controllingRover2) keyboard.update(dt);
  desktop.update();
  xr.update();
  holsters.update();
  stations.animate(dt);
  porthole.update(dt);
  solarField.update(dt, xr.getRover2Input());
  roverWorld.update(dt);

  refreshTimer += dt;
  if (refreshTimer >= PANEL_REFRESH_SECONDS) {
    refreshTimer = 0;
    stations.refresh();
    renderBio(wristBio, game.sim, t);
    applyLighting();
  }
  renderer.render(scene, camera);
});
