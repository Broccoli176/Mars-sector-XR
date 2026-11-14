/**
 * SHARED: merges per-owner data files (see docs/COLLABORATION.md). Pure — usable from Vite, Vitest and Node scripts.
 * Throws when two files define the same key, so ownership clashes fail loudly instead of silently overriding.
 * @param {[string, Record<string, any>][]} files [fileName, content] pairs
 * @param {string} what label for error messages
 */
export function mergeObjects(files, what) {
  /** @type {Record<string, any>} */
  const merged = {};
  /** @type {Record<string, string>} */
  const origin = {};
  for (const [file, content] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
    for (const [key, value] of Object.entries(content ?? {})) {
      if (key in merged) throw new Error(`${what}: key "${key}" is defined in both ${origin[key]} and ${file}`);
      merged[key] = value;
      origin[key] = file;
    }
  }
  return merged;
}

/**
 * Concatenates per-room arrays (stations), rejecting duplicate ids.
 * @param {[string, any[]][]} files
 */
export function mergeStationLists(files) {
  const seen = new Map();
  /** @type {any[]} */
  const all = [];
  for (const [file, list] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
    for (const station of list ?? []) {
      if (seen.has(station.id)) throw new Error(`stations: id "${station.id}" is defined in both ${seen.get(station.id)} and ${file}`);
      seen.set(station.id, file);
      all.push(station);
    }
  }
  return all;
}
