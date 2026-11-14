// Headless balance report: `npm run sim` (optionally `npm run sim -- competent`).
// Runs scripted policies through a full session and prints daily snapshots.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Simulation } from '../src/systems/Simulation.js';
import { idlePolicy, greedyPolicy, competentPolicy, runSession } from '../tests/helpers/policies.js';

const dataDir = fileURLToPath(new URL('../src/data/', import.meta.url));
const load = (/** @type {string} */ name) => JSON.parse(readFileSync(dataDir + name, 'utf8'));
const data = { resources: load('resources.json'), balance: load('balance.json'), events: load('events.json') };

const policies = { idle: idlePolicy, greedy: greedyPolicy, competent: competentPolicy };
const selected = process.argv[2] ? [process.argv[2]] : Object.keys(policies);

for (const name of selected) {
  const policy = policies[/** @type {keyof typeof policies} */ (name)];
  if (!policy) throw new Error(`Unknown policy ${name}`);
  const sim = new Simulation(structuredClone(data));
  /** @type {string[]} */
  const rows = [];
  const snapshot = () => {
    const r = (/** @type {string} */ id) => sim.resources.value(id);
    const c = sim.time.clock();
    rows.push(
      `  D${c.day} ${String(c.hour).padStart(2, '0')}:00  bat ${r('power').toFixed(1).padStart(5)} kWh  ` +
        `O2 ${r('oxygen').toFixed(0).padStart(3)}  CO2 ${r('co2').toFixed(0).padStart(5)}  ` +
        `T ${r('temperature').toFixed(1).padStart(5)}  H2O ${r('water').toFixed(1).padStart(4)}  ` +
        `food ${r('food').toFixed(0).padStart(5)}  hp ${r('health').toFixed(0).padStart(3)}`,
    );
  };
  sim.bus.on('time:dayStarted', snapshot);
  const result = runSession(sim, policy);
  snapshot();
  console.log(`\n[${name}] → ${result?.reason} at day ${result?.day} ${result?.hour}:${String(result?.minute).padStart(2, '0')}`);
  console.log(rows.join('\n'));
}
