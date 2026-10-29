/** Physical dimensions are shared by gameplay and vehicle rendering. */
export const VEHICLE_SPECS = Object.freeze(Object.fromEntries(Object.entries({
  coupe: { label: 'COASTAL GT · 跑车', mass: 1320, radius: 1.10, spine: 1.15, wheelRadius: .43, wheelbase: 2.65, maxSpeed: 42, reverseSpeed: 6, power: 9.5, braking: 21, height: 1.5 },
  sedan: { label: 'SUNDOWN · 轿车', mass: 1550, radius: 1.07, spine: 1.28, wheelRadius: .41, wheelbase: 2.8, maxSpeed: 39, reverseSpeed: 6, power: 8.7, braking: 20, height: 1.7 },
  suv: { label: 'TRAILWAY · SUV', mass: 2180, radius: 1.13, spine: 1.28, wheelRadius: .46, wheelbase: 2.9, maxSpeed: 35, reverseSpeed: 5.5, power: 7.5, braking: 19, height: 2.1 },
  bicycle: { label: 'NEON PEDAL · 自行车', mass: 100, radius: .42, spine: .58, wheelRadius: .36, wheelbase: 1.12, maxSpeed: 12, reverseSpeed: 2, power: 3.8, braking: 9, height: 1.8 },
  truck: { label: 'HAULER · 货运卡车', mass: 6800, radius: 1.35, spine: 2.15, wheelRadius: .58, wheelbase: 4.35, maxSpeed: 26, reverseSpeed: 4.5, power: 5.8, braking: 15, height: 3.6 },
  helicopter: { label: 'SKYLINE AIR · 直升机', mass: 2250, radius: 1.1, spine: 2.35, wheelRadius: .43, wheelbase: 3.8, maxSpeed: 40, reverseSpeed: 12, power: 7, braking: 9, height: 2.8 },
}).map(([kind, spec]) => [kind, Object.freeze({ kind, ...spec })])));

export const VEHICLE_KINDS = Object.freeze(Object.keys(VEHICLE_SPECS));
export function vehicleSpec(kind) { return VEHICLE_SPECS[kind] || VEHICLE_SPECS.coupe; }
