/** Keep GPU coordinates close to zero while simulation coordinates stay global. */
export class FloatingOrigin {
  constructor(quantum = 128, threshold = 512) {
    this.quantum = quantum;
    this.threshold = threshold;
    this.x = 0;
    this.z = 0;
  }
  update(x, z) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return { dx: 0, dz: 0 };
    if (Math.abs(x - this.x) <= this.threshold && Math.abs(z - this.z) <= this.threshold) return { dx: 0, dz: 0 };
    const nextX = Math.floor(x / this.quantum) * this.quantum;
    const nextZ = Math.floor(z / this.quantum) * this.quantum;
    const delta = { dx: nextX - this.x, dz: nextZ - this.z };
    this.x = nextX; this.z = nextZ;
    return delta;
  }
}
