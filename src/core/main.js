import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { gameData } from '../data/index.js';
import { createTranslator } from '../utils/strings.js';
import { Game } from './Game.js';
import { buildBasement } from '../world/Basement.js';
import { buildStations, renderBio } from '../ui/Stations.js';
import { Panel } from '../ui/Panel.js';
import { Interaction } from '../vr/Interaction.js';
import { Locomotion } from '../vr/Locomotion.js';
import { XRControls } from '../vr/XRControls.js';
import { DesktopControls } from '../vr/DesktopControls.js';

const PANEL_REFRESH_SECONDS = 0.25; // 4 Hz canvas updates
const MAX_FRAME_DT = 0.1;
const FACING_YAW = { north: 0, west: Math.PI / 2, south: Math.PI, east: -Math.PI / 2 };

const t = createTranslator(gameData.strings);
const game = new Game(gameData, t);
const { layout } = gameData;

// Renderer: conservative Quest settings (AGENTS.md §7): no shadows, no post-processing.
const container = /** @type {HTMLElement} */ (document.getElementById('app'));
const renderer = new THREE.WebGLRenderer({ antialias: true });
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
const params = new URLSearchParams(window.location.search);
let fastForwardTicks = Math.max(0, Number(params.get('ff')) || 0);
const viewParam = params.get('view');
if (viewParam) {
  const [vx, vz, deg] = viewParam.split(',').map(Number);
  if ([vx, vz].every(Number.isFinite)) dolly.position.set(vx, 0, vz);
  if (Number.isFinite(deg)) dolly.rotation.y = THREE.MathUtils.degToRad(deg);
}

// World + stations
const basement = buildBasement(layout, t);
scene.add(basement.group);
/** @type {THREE.Object3D[]} */
const interactive = [];
const stations = buildStations({ layout, rooms: basement.rooms, game, t, scene, interactive });

// Interaction and locomotion
const interaction = new Interaction(interactive, basement.floors, basement.walls);
const locomotion = new Locomotion(renderer, dolly, camera);
const xr = new XRControls(renderer, dolly, interaction, locomotion);
const desktop = new DesktopControls(renderer.domElement, renderer, dolly, camera, interaction, locomotion);

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
const NORMAL_LIGHT = new THREE.Color('#fff1dc');
const EMERGENCY_LIGHT = new THREE.Color('#ff3b2f');
let emergency = false;
function applyLighting() {
  const lit = game.sim.power.served.lighting;
  if (lit === !emergency) return;
  emergency = !lit;
  basement.hemi.intensity = emergency ? 0.25 : 1.1;
  for (const light of Object.values(basement.roomLights)) {
    light.color.copy(emergency ? EMERGENCY_LIGHT : NORMAL_LIGHT);
    light.intensity = emergency ? 1.6 : 5;
  }
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
  desktop.update(dt);
  xr.update();
  stations.animate(dt);

  refreshTimer += dt;
  if (refreshTimer >= PANEL_REFRESH_SECONDS) {
    refreshTimer = 0;
    stations.refresh();
    renderBio(wristBio, game.sim, t);
    applyLighting();
  }
  renderer.render(scene, camera);
});
