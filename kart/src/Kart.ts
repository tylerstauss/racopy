import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { InputState } from './types'

// Drift duration thresholds (seconds) for each spark stage
const DRIFT_THRESHOLDS = [0.5, 1.2, 2.2]
// Turbo boost: forward impulse magnitude per stage (0=blue, 1=yellow, 2=red)
const TURBO_FORCE    = [1600, 2200, 3000]
const TURBO_DURATION = [0.45, 0.75, 1.1]

const STAGE_COLORS  = ['', '#4466ff', '#ffaa22', '#ff3333']
const STAGE_LABELS  = ['', 'MINI TURBO', 'SUPER TURBO', 'ULTRA TURBO']

export class Kart {
  chassisBody: CANNON.Body
  vehicle: CANNON.RaycastVehicle

  mesh: THREE.Group
  wheelMeshes: THREE.Mesh[] = []

  // Drift state
  isDrifting = false
  driftDir = 0       // -1 left, +1 right
  driftTime = 0
  driftStage = 0     // 0=none 1=blue 2=yellow 3=red

  // Turbo state
  turboTimer = 0
  turboStage = 0

  speed = 0  // km/h

  private lapTime = 0
  private speedEl: HTMLElement
  private turboFill: HTMLElement
  private driftEl: HTMLElement
  private timerEl: HTMLElement
  private boostFlash: HTMLElement

  constructor(world: CANNON.World, scene: THREE.Scene, startPos: CANNON.Vec3) {
    this.speedEl   = document.getElementById('speed')!
    this.turboFill = document.getElementById('turbo-fill')!
    this.driftEl   = document.getElementById('drift-indicator')!
    this.timerEl   = document.getElementById('timer')!
    this.boostFlash = document.getElementById('boost-flash')!

    // ── Chassis ─────────────────────────────────────────────────────────
    const chassisShape = new CANNON.Box(new CANNON.Vec3(0.6, 0.22, 1.1))
    this.chassisBody = new CANNON.Body({ mass: 150 })
    this.chassisBody.addShape(chassisShape, new CANNON.Vec3(0, 0.15, 0))
    this.chassisBody.position.copy(startPos)
    this.chassisBody.linearDamping  = 0.3
    this.chassisBody.angularDamping = 0.5

    // ── RaycastVehicle ───────────────────────────────────────────────────
    this.vehicle = new CANNON.RaycastVehicle({
      chassisBody: this.chassisBody,
      indexRightAxis:   0,  // +X = right
      indexUpAxis:      1,  // +Y = up
      indexForwardAxis: 2,  // +Z = forward
    })

    const wheelBase = {
      radius: 0.32,
      directionLocal:   new CANNON.Vec3(0, -1, 0),
      axleLocal:        new CANNON.Vec3(-1, 0, 0),
      suspensionStiffness: 40,
      suspensionRestLength: 0.35,
      frictionSlip: 1.5,
      dampingRelaxation:  2.3,
      dampingCompression: 4.4,
      maxSuspensionForce: 200000,
      rollInfluence: 0.01,
      maxSuspensionTravel: 0.3,
      customSlidingRotationalSpeed: -30,
      useCustomSlidingRotationalSpeed: true,
      chassisConnectionPointLocal: new CANNON.Vec3(0, 0, 0),
    }

    // front-left, front-right, rear-left, rear-right
    const wheelPositions: [number, number, number][] = [
      [-0.7,  0,  0.9],
      [ 0.7,  0,  0.9],
      [-0.7,  0, -0.9],
      [ 0.7,  0, -0.9],
    ]
    wheelPositions.forEach(([x, y, z]) => {
      this.vehicle.addWheel({
        ...wheelBase,
        chassisConnectionPointLocal: new CANNON.Vec3(x, y, z),
      })
    })

    this.vehicle.addToWorld(world)

    // ── Visuals ──────────────────────────────────────────────────────────
    this.mesh = this._buildKartMesh()
    scene.add(this.mesh)

    this.vehicle.wheelInfos.forEach(() => {
      const wm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.32, 0.32, 0.18, 16),
        new THREE.MeshLambertMaterial({ color: 0x222222 })
      )
      wm.rotation.z = Math.PI / 2
      scene.add(wm)
      this.wheelMeshes.push(wm)
    })
  }

  private _buildKartMesh(): THREE.Group {
    const g = new THREE.Group()
    const add = (geo: THREE.BufferGeometry, color: number, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color }))
      m.position.set(x, y, z)
      g.add(m)
    }

    add(new THREE.BoxGeometry(1.2, 0.36, 2.2),   0x1155ee, 0,     0.18,  0)      // body
    add(new THREE.BoxGeometry(0.85, 0.32, 1.05),  0x3377ff, 0,     0.54,  0.08)  // cabin
    add(new THREE.BoxGeometry(1.05, 0.07, 0.18),  0x0033aa, 0,     0.1,   1.08)  // front spoiler
    add(new THREE.BoxGeometry(1.05, 0.28, 0.1),   0x0033aa, 0,     0.3,  -1.1)   // rear spoiler
    add(new THREE.CylinderGeometry(0.08, 0.08, 1.1, 8), 0xcccccc, 0, 0.18, 0)    // axle hint

    return g
  }

  update(dt: number, input: InputState) {
    this.lapTime += dt
    this._updateTimer()

    const { forward, backward, turnLeft, turnRight, drift } = input
    const turn = (turnRight ? 1 : 0) - (turnLeft ? 1 : 0)

    // ── Active turbo boost ───────────────────────────────────────────────
    if (this.turboTimer > 0) {
      this.turboTimer -= dt
      const fwd = new CANNON.Vec3(0, 0, 1)
      this.chassisBody.vectorToWorldFrame(fwd, fwd)
      const f = TURBO_FORCE[this.turboStage]
      this.chassisBody.applyForce(
        new CANNON.Vec3(fwd.x * f, 0, fwd.z * f),
        this.chassisBody.position
      )
      if (this.turboTimer <= 0) {
        this.boostFlash.style.opacity = '0'
      }
    }

    // ── Engine force (rear wheels 2 & 3) ────────────────────────────────
    const maxForce = 1100
    const engineForce = (forward - backward * 0.55) * maxForce
    this.vehicle.applyEngineForce(-engineForce, 2)
    this.vehicle.applyEngineForce(-engineForce, 3)

    // ── Braking ──────────────────────────────────────────────────────────
    const brakeF = (backward > 0 && forward === 0) ? 18 : 0
    for (let i = 0; i < 4; i++) this.vehicle.setBrake(brakeF, i)

    // ── Drift state machine ──────────────────────────────────────────────
    if (drift && !this.isDrifting && Math.abs(turn) > 0.15 && forward > 0) {
      // Initiate: hop
      this.isDrifting = true
      this.driftDir   = Math.sign(turn)
      this.driftTime  = 0
      this.driftStage = 0
      this.chassisBody.applyImpulse(
        new CANNON.Vec3(0, 280, 0),
        this.chassisBody.position
      )
    }

    if (!drift && this.isDrifting) {
      // Release: fire mini-turbo if earned
      if (this.driftStage > 0) {
        this.turboStage = this.driftStage - 1
        this.turboTimer = TURBO_DURATION[this.turboStage]
        this.boostFlash.style.opacity = '1'
        setTimeout(() => { this.boostFlash.style.opacity = '0' }, 120)
      }
      this.isDrifting = false
      this.driftDir   = 0
      this.driftTime  = 0
      this.driftStage = 0
    }

    // ── Drift physics ────────────────────────────────────────────────────
    let steerAngle = turn * 0.44

    if (this.isDrifting) {
      this.driftTime += dt

      // Advance spark stage
      if      (this.driftTime > DRIFT_THRESHOLDS[2]) this.driftStage = 3
      else if (this.driftTime > DRIFT_THRESHOLDS[1]) this.driftStage = 2
      else if (this.driftTime > DRIFT_THRESHOLDS[0]) this.driftStage = 1

      // Locked steer + fine-tune input
      steerAngle = this.driftDir * 0.52 + turn * 0.18

      // Reduce rear grip so back slides out
      this.vehicle.wheelInfos[2].frictionSlip = 0.28
      this.vehicle.wheelInfos[3].frictionSlip = 0.28

      // Subtle lateral push in drift direction
      const lat = new CANNON.Vec3(this.driftDir, 0, 0)
      this.chassisBody.vectorToWorldFrame(lat, lat)
      this.chassisBody.applyForce(
        new CANNON.Vec3(lat.x * 70, 0, lat.z * 70),
        this.chassisBody.position
      )
    } else {
      // Restore normal rear grip
      this.vehicle.wheelInfos[2].frictionSlip = 1.5
      this.vehicle.wheelInfos[3].frictionSlip = 1.5
    }

    // Apply steering to front wheels (negative = right in cannon-es convention)
    this.vehicle.setSteeringValue(-steerAngle, 0)
    this.vehicle.setSteeringValue(-steerAngle, 1)

    // ── Sync visuals ─────────────────────────────────────────────────────
    this._syncMesh()

    // ── Speed (m/s → km/h) ───────────────────────────────────────────────
    const v = this.chassisBody.velocity
    this.speed = Math.sqrt(v.x * v.x + v.z * v.z) * 3.6

    this._updateHUD()
  }

  private _syncMesh() {
    const p = this.chassisBody.position
    const q = this.chassisBody.quaternion
    this.mesh.position.set(p.x, p.y, p.z)
    this.mesh.quaternion.set(q.x, q.y, q.z, q.w)

    this.vehicle.wheelInfos.forEach((wheel, i) => {
      this.vehicle.updateWheelTransform(i)
      const t = wheel.worldTransform
      this.wheelMeshes[i].position.set(t.position.x, t.position.y, t.position.z)
      this.wheelMeshes[i].quaternion.set(t.quaternion.x, t.quaternion.y, t.quaternion.z, t.quaternion.w)
    })
  }

  private _updateHUD() {
    this.speedEl.innerHTML = `${Math.round(this.speed)} <span style="font-size:14px">km/h</span>`

    // Turbo charge bar
    let pct = 0
    let color = '#4af'
    if (this.isDrifting && this.driftStage > 0) {
      const cap = DRIFT_THRESHOLDS[2]
      pct   = Math.min(this.driftTime / cap, 1) * 100
      color = STAGE_COLORS[this.driftStage]
    } else if (this.turboTimer > 0) {
      pct   = (this.turboTimer / TURBO_DURATION[this.turboStage]) * 100
      color = '#44ff88'
    }
    this.turboFill.style.width    = `${pct}%`
    this.turboFill.style.background = color

    // Drift stage label
    if (this.isDrifting && this.driftStage > 0) {
      this.driftEl.textContent  = STAGE_LABELS[this.driftStage]
      this.driftEl.style.color  = STAGE_COLORS[this.driftStage]
      this.driftEl.style.opacity = '1'
    } else {
      this.driftEl.style.opacity = '0'
    }
  }

  private _updateTimer() {
    const t = this.lapTime
    const m = Math.floor(t / 60)
    const s = Math.floor(t % 60)
    const ms = Math.floor((t % 1) * 1000)
    this.timerEl.textContent = `${m}:${String(s).padStart(2,'0')}.${String(ms).padStart(3,'0')}`
  }

  getPosition(): THREE.Vector3 {
    const p = this.chassisBody.position
    return new THREE.Vector3(p.x, p.y, p.z)
  }

  getQuaternion(): THREE.Quaternion {
    const q = this.chassisBody.quaternion
    return new THREE.Quaternion(q.x, q.y, q.z, q.w)
  }
}
