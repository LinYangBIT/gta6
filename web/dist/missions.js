import { CHUNK_SIZE, WORLD_SEED, collidersNear, hashCoordinates, isRoad } from './world-layout.js?v=11';
import { COAST_MISSION_STOPS } from './coast-layout.js?v=11';

const INTERACTION_RADIUS = 3;
const PARKING_RADIUS = 12;
const STOP_SPEED = .7;
const STOP_DURATION = .5;
const STAGES = Object.freeze({ pickup: 0, vehicle: 1, drive: 2, deliver: 3, offer: 4 });
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const onFoot = actor => actor?.mode === 'walk';
const driving = actor => actor?.mode === 'drive' && actor.activeVehicleId != null;
const validActor = actor => actor && Number.isFinite(actor.x) && Number.isFinite(actor.z);

/** Session-local delivery jobs. World positions remain independent of render origin. */
export class MissionSystem {
  constructor({ seed = WORLD_SEED } = {}) {
    this.reset({ seed });
  }

  reset({ seed = this.seed ?? WORLD_SEED } = {}) {
    this.seed = seed;
    this.stage = 'pickup';
    this.contract = 1;
    this.cash = 0;
    this.completed = 0;
    this.elapsed = 0;
    this.stopTime = 0;
    this.reward = 300;
    this.notice = '';
    this.noticeId = 0;
    this.lastActor = null;
    this.pickup = { x: 13, z: 13, label: '棕榈街联络人', kind: 'contact' };
    this.destination = { x: 13, z: -115, label: '海岸咖啡收件人', kind: 'contact' };
    this.parking = { x: 3, z: -CHUNK_SIZE, label: '海岸咖啡 · 停车点', kind: 'parking' };
    return this.snapshot();
  }

  /** The visible contact for the current step; useful for placing its character. */
  get contact() {
    return { ...(this.stage === 'pickup' ? this.pickup : this.destination) };
  }

  _announce(message) {
    this.notice = message;
    this.noticeId++;
  }

  update(dt, actor) {
    if (!validActor(actor)) return this.snapshot();
    this.lastActor = { ...actor };
    const elapsed = Number.isFinite(dt) ? Math.max(0, Math.min(.1, dt)) : 0;
    this.elapsed += elapsed;
    if (this.stage === 'vehicle' && driving(actor)) {
      this.stage = 'drive';
      this._announce('包裹已放好 · 沿黄色标记前往收件地点');
    }
    if (this.stage === 'drive') {
      const stopped = driving(actor) && distance(actor, this.parking) <= PARKING_RADIUS
        && Number.isFinite(actor.speed) && Math.abs(actor.speed) < STOP_SPEED;
      this.stopTime = stopped ? this.stopTime + elapsed : 0;
      if (this.stopTime + Number.EPSILON >= STOP_DURATION) {
        this.stage = 'deliver';
        this._announce('已到达 · 下车后步行到联络人身边交付');
      }
    }
    return this.snapshot(actor);
  }

  interact(actor = this.lastActor) {
    const current = this.snapshot(actor);
    if (!current.interaction?.available) {
      return { ok: false, message: '步行靠近黄色联络人标记后互动', snapshot: current };
    }
    this.lastActor = { ...actor };
    if (this.stage === 'pickup') {
      this.stage = 'vehicle';
      this._announce('已领取摄影器材 · 找一辆喜欢的车出发');
    } else if (this.stage === 'deliver') {
      this.cash += this.reward;
      this.completed++;
      this.stage = 'offer';
      this._announce(`委托完成 +$${this.reward} · 可在此接取下一份委托`);
    } else if (this.stage === 'offer') {
      this._nextContract();
      this._announce('新委托已接取 · 可继续使用原车，也可以换一辆车');
    }
    return { ok: true, message: this.notice, snapshot: this.snapshot(actor) };
  }

  _nextContract() {
    this.contract++;
    this.pickup = { ...this.destination };
    const hash = hashCoordinates('coast-delivery', this.seed, this.contract);
    // The first few jobs introduce distinct authored landmarks. Later contracts
    // continue into the generated city rather than cycling this finite district.
    if (this.contract <= 4 && COAST_MISSION_STOPS.length) {
      const options = COAST_MISSION_STOPS.filter(stop => distance(this.pickup, stop.contact) > 60);
      const stop = options[hash % options.length];
      if (stop) {
        this.destination = { ...stop.contact, label: `${stop.label}收件人`, kind: 'contact' };
        this.parking = { ...stop.parking, label: `${stop.label} · 停车点`, kind: 'parking' };
        this.reward = 250 + Math.round(distance(this.pickup, this.destination) / 50) * 25;
        this.stopTime = 0; this.stage = 'vehicle';
        return;
      }
    }
    const gridX = Math.round((this.pickup.x - 13) / CHUNK_SIZE);
    const gridZ = Math.round((this.pickup.z - 13) / CHUNK_SIZE);
    const direction = hash % 4;
    const blocks = 2 + (hash >>> 4) % 3;
    const sideStep = ((hash >>> 8) % 3) - 1;
    const offsets = [[sideStep, -blocks], [blocks, sideStep], [sideStep, blocks], [-blocks, sideStep]];
    const [dx, dz] = offsets[direction];
    let x = (gridX + dx) * CHUNK_SIZE;
    let z = (gridZ + dz) * CHUNK_SIZE;
    const clear = (px, pz, radius) => !collidersNear(px, pz, this.seed).some(rect => px + radius >= rect.minX && px - radius <= rect.maxX && pz + radius >= rect.minZ && pz - radius <= rect.maxZ);
    // A grid point can now lie in coastal sand or water. Extend that leg until
    // both the parking area and the pedestrian handover are actually reachable.
    for (let attempt = 0; attempt < 12; attempt++) {
      if (isRoad(x + 3, z) && !isRoad(x + 13, z + 13) && clear(x + 3, z, 2.5) && clear(x + 13, z + 13, .7)) break;
      x += dx * CHUNK_SIZE; z += dz * CHUNK_SIZE;
    }
    const names = ['棕榈唱片店', '湾畔照相馆', '日落修车铺', '海岸咖啡', '花园小卖部', '霓虹旅店'];
    const label = names[(hash >>> 12) % names.length];
    this.destination = { x: x + 13, z: z + 13, label: `${label}收件人`, kind: 'contact' };
    this.parking = { x: x + 3, z, label: `${label} · 停车点`, kind: 'parking' };
    this.reward = 200 + (blocks + Math.abs(sideStep)) * 75;
    this.stopTime = 0;
    this.stage = 'vehicle';
  }

  snapshot(actor = this.lastActor) {
    const intro = this.contract === 1;
    const canInteract = validActor(actor) && onFoot(actor)
      && ['pickup', 'deliver', 'offer'].includes(this.stage)
      && distance(actor, this.stage === 'pickup' ? this.pickup : this.destination) <= INTERACTION_RADIUS;
    const objectives = {
      pickup: '步行到黄色标记，与联络人交谈',
      vehicle: '靠近任意车辆，上车开始送货',
      drive: onFoot(actor) ? '重新上车，继续前往收件地点' : '驾车前往黄色停车点，减速停稳',
      deliver: onFoot(actor) ? '步行到收件人身边，互动交付' : '停车后下车，亲手交付包裹',
      offer: '委托完成。自由探索，或与联络人接取新委托',
    };
    const interactionLabels = { pickup: '领取委托', deliver: '交付包裹', offer: '接取下一单' };
    const target = this.stage === 'pickup' ? this.pickup
      : this.stage === 'drive' ? this.parking
      : ['deliver', 'offer'].includes(this.stage) ? this.destination : null;
    return {
      chapter: intro ? '01 / 初来乍到' : `${String(this.contract).padStart(2, '0')} / 街头委托`,
      title: this.stage === 'offer' ? '准时送达' : intro ? '一份顺路的委托' : '城市传递',
      description: intro ? '替街角的朋友把摄影器材送到海岸咖啡，赚取第一笔报酬。'
        : `将包裹送到${this.destination.label.replace('收件人', '')}。路线由你决定。`,
      objective: objectives[this.stage],
      stage: this.stage,
      progress: STAGES[this.stage],
      total: 4,
      reward: this.reward,
      cash: this.cash,
      completed: this.completed,
      contract: this.contract,
      target: target ? { ...target } : null,
      contact: this.contact,
      interaction: canInteract ? { available: true, label: interactionLabels[this.stage] } : null,
      notice: this.notice,
      noticeId: this.noticeId,
    };
  }
}
