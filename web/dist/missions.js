import { CHUNK_SIZE, WORLD_SEED, collidersNear, hashCoordinates, isRoad } from './world-layout.js?v=12';
import { COAST_MISSION_STOPS } from './coast-layout.js?v=12';

const INTERACTION_RADIUS = 3;
const PARKING_RADIUS = 12;
const STOP_SPEED = .7;
const STOP_DURATION = .5;
const STAGES = Object.freeze({ pickup: 0, vehicle: 1, drive: 2, deliver: 3, offer: 4 });
// The road-facing corners retain the same clear margin as generated contacts.
// These two introductions connect the coast jobs to the new inland districts.
const METRO_DELIVERIES = Object.freeze({
  5: { cx: -3, cz: -2, label: '货运工业区', contactLabel: '货运调度员', voiceLabel: 'Freight Works', title: '货运线' },
  6: { cx: -3, cz: -3, label: '西湾航空站', contactLabel: '航空站地勤', voiceLabel: 'West Bay Air', title: '空港快递' },
});
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
        && Number.isFinite(actor.speed) && Math.abs(actor.speed) < STOP_SPEED
        && (actor.altitude ?? 0) <= .35 && Math.abs(actor.verticalSpeed ?? 0) < .5;
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
    const metro = METRO_DELIVERIES[this.contract];
    if (metro) {
      const x = metro.cx * CHUNK_SIZE, z = metro.cz * CHUNK_SIZE;
      this.destination = { x: x + 13, z: z + 13, label: metro.contactLabel, voiceLabel: metro.voiceLabel, kind: 'contact' };
      this.parking = { x: x + 3, z, label: `${metro.label} · 停车点`, kind: 'parking' };
      this.reward = 300 + Math.round(distance(this.pickup, this.destination) / 50) * 25;
      this.stopTime = 0; this.stage = 'vehicle';
      return;
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
      vehicle: '靠近车辆按 E 上车 · 自行车、卡车、直升机均可',
      drive: onFoot(actor) ? '重新上车，继续前往收件地点' : actor?.vehicleKind === 'helicopter' ? '飞往黄色停车点，降落并停稳' : '驾车前往黄色停车点，减速停稳',
      deliver: onFoot(actor) ? '步行到收件人身边，互动交付' : '停车后下车，亲手交付包裹',
      offer: '委托完成。自由探索，或与联络人接取新委托',
    };
    const voiceText = {
      pickup: 'Welcome to Sunset Coast. Follow the gold marker. Walk up to your contact and press E to accept the job.',
      vehicle: 'Package secured. Pick any ride. A car, a bike, a truck, or a helicopter. Get close and press E to get in.',
      drive: onFoot(actor) ? 'Your delivery is still active. Find a ride and follow the gold marker.'
        : actor?.vehicleKind === 'helicopter' ? 'Head for the gold marker. Land at the destination and come to a complete stop.'
          : `${this.destination.voiceLabel ? `Deliver the package to ${this.destination.voiceLabel}. ` : ''}Follow the gold marker to the delivery point. Slow down and stop inside the marked area.`,
      deliver: onFoot(actor) ? 'Walk to the contact. Press E to hand over the package.'
        : 'You made it. Press E to get out, then walk to the contact and deliver the package.',
      offer: `Delivery complete. You earned ${this.reward} dollars. Explore the city, or talk to the contact for another job.`,
    };
    const actionHint = {
      pickup: canInteract ? '按 E / 点互动 · 领取委托' : '跟随金色光柱 · 步行靠近联络人',
      vehicle: '小地图 B 自行车 · T 卡车 · H 直升机',
      drive: onFoot(actor) ? '靠近车辆 · 按 E 上车' : actor?.vehicleKind === 'helicopter' ? 'SPACE 上升 · CTRL 下降 · 落地后交付' : '沿金色标记前进 · 目的地停稳',
      deliver: onFoot(actor) ? canInteract ? '按 E / 点互动 · 交付包裹' : '金色光柱下 · 步行靠近收件人' : '按 E / 点互动下车 · 步行交付',
      offer: '按 E / 点互动 · 接取下一单',
    };
    const interactionLabels = { pickup: '领取委托', deliver: '交付包裹', offer: '接取下一单' };
    const target = this.stage === 'pickup' ? this.pickup
      : this.stage === 'drive' ? this.parking
      : ['deliver', 'offer'].includes(this.stage) ? this.destination : null;
    return {
      chapter: intro ? '01 / 初来乍到' : `${String(this.contract).padStart(2, '0')} / 街头委托`,
      title: this.stage === 'offer' ? '准时送达' : intro ? '一份顺路的委托' : METRO_DELIVERIES[this.contract]?.title || '城市传递',
      description: intro ? '替街角的朋友把摄影器材送到海岸咖啡，赚取第一笔报酬。'
        : `将包裹送到${this.destination.label.replace('收件人', '')}。路线由你决定。`,
      objective: objectives[this.stage],
      actionHint: actionHint[this.stage],
      voiceText: voiceText[this.stage],
      voiceKey: `${this.seed}:${this.contract}:${this.stage}:${['drive', 'deliver'].includes(this.stage) ? (onFoot(actor) ? 'walk' : actor?.vehicleKind === 'helicopter' ? 'flight' : 'drive') : ''}`,
      directionAngle: target && validActor(actor) ? Math.atan2(target.x - actor.x, target.z - actor.z) - (actor.yaw || 0) : null,
      distance: target && validActor(actor) ? distance(actor, target) : null,
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
