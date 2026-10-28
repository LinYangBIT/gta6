/** Bind the driving settings without changing the current car or its motion. */
import { STEERING_DEFAULTS, STEERING_LIMITS } from './driving.js?v=11';

export const STEERING_STORAGE_KEY = 'sunset-steering-settings';

export function createSteeringSettings({ simulation, document: dom = globalThis.document, storage, onStatus } = {}) {
  if (typeof simulation?.setSteeringSettings !== 'function') throw new TypeError('A driving simulation is required');
  // Some privacy modes throw even when accessing the storage property.
  if (storage === undefined) { try { storage = globalThis.localStorage; } catch { storage = null; } }
  const byId = id => dom?.getElementById?.(id);
  const fields = Object.keys(STEERING_DEFAULTS);
  const removers = [];
  let disposed = false;
  let saved = {};
  try {
    const parsed = JSON.parse(storage?.getItem(STEERING_STORAGE_KEY) ?? 'null');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      for (const name of fields) if (Object.hasOwn(parsed, name)) saved[name] = parsed[name];
    }
  } catch { /* A missing or malformed preference keeps the recommended values. */ }
  simulation.setSteeringSettings({ ...STEERING_DEFAULTS, ...saved });

  function refresh() {
    const settings = simulation.steeringSettings;
    for (const name of fields) {
      const input = byId(`steering-${name}`), output = byId(`steering-${name}-value`);
      const percent = `${Math.round(settings[name] * 100)}%`;
      if (input) {
        const { min, max } = STEERING_LIMITS[name];
        input.min = String(min); input.max = String(max); input.step = '.05'; input.value = String(settings[name]);
        input.setAttribute('aria-valuemin', String(min)); input.setAttribute('aria-valuemax', String(max));
        input.setAttribute('aria-valuenow', String(settings[name])); input.setAttribute('aria-valuetext', percent);
      }
      if (output) output.textContent = percent;
    }
    return settings;
  }
  function persist() {
    if (typeof storage?.setItem !== 'function') return false;
    try { storage.setItem(STEERING_STORAGE_KEY, JSON.stringify(simulation.steeringSettings)); return true; }
    catch { return false; /* In-session settings still work. */ }
  }
  function listen(element, event, handler) {
    if (!element?.addEventListener) return;
    element.addEventListener(event, handler);
    removers.push(() => element.removeEventListener(event, handler));
  }
  function reset() {
    if (disposed) return simulation.steeringSettings;
    simulation.setSteeringSettings(STEERING_DEFAULTS); const saved = persist(); refresh();
    onStatus?.(saved ? '已恢复推荐转向配置' : '已恢复推荐转向配置（仅本次有效）');
    return simulation.steeringSettings;
  }
  for (const name of fields) {
    const input = byId(`steering-${name}`);
    listen(input, 'input', () => {
      const value = String(input.value).trim() === '' ? NaN : Number(input.value);
      simulation.setSteeringSettings({ [name]: value }); persist(); refresh();
    });
    listen(input, 'change', () => onStatus?.(persist() ? '转向配置已更新并保存' : '转向配置已更新（仅本次有效）'));
  }
  listen(byId('steering-reset'), 'click', reset);
  refresh();
  return {
    get settings() { return simulation.steeringSettings; },
    refresh, reset,
    dispose() { if (disposed) return; disposed = true; for (const remove of removers) remove(); },
  };
}
