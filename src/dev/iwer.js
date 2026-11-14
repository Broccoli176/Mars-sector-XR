// Dev-only: Meta's Immersive Web Emulation Runtime (emulated Quest 3), loaded with `?iwer`.
// Kept in its own module so the bundler emits it as a separate lazy chunk.
import { XRDevice, metaQuest3 } from 'iwer';

export function installEmulatedQuest3() {
  const device = new XRDevice(metaQuest3);
  // Desktop Chrome exposes a native navigator.xr without a headset, so the runtime must be forced.
  device.installRuntime({ forceInstall: true });
  return device;
}
