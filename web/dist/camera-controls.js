/** Pointer orbit shared by every camera. Each touch has its own lifecycle. */
export class CameraControls {
  constructor() { this.mode = 0; this.pointers = new Map(); this.reset(); }
  reset() { this.yaw = 0; this.pitch = 0; this.zoom = 1; this.pointers.clear(); }
  cycle() { this.mode = (this.mode + 1) % 4; this.reset(); return this.mode; }
  begin(id, x, y) { this.pointers.set(id, { x, y }); }
  move(id, x, y) {
    const previous = this.pointers.get(id);
    if (!previous) return;
    const other = [...this.pointers.entries()].find(([key]) => key !== id)?.[1];
    if (other) {
      const before = Math.hypot(previous.x - other.x, previous.y - other.y);
      const after = Math.hypot(x - other.x, y - other.y);
      if (before > 8 && after > 8) this.zoomBy(before / after);
    } else {
      this.yaw -= (x - previous.x) * .006;
      this.pitch = Math.max(-.27, Math.min(.85, this.pitch + (y - previous.y) * .004));
    }
    this.pointers.set(id, { x, y });
  }
  end(id) { this.pointers.delete(id); }
  clear() { this.pointers.clear(); }
  zoomBy(factor) { if (Number.isFinite(factor)) this.zoom = Math.max(.65, Math.min(2.2, this.zoom * factor)); }
}
