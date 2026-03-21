import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { SpringArmCamera } from './Camera'
import { InputManager } from './InputManager'
import { Kart } from './Kart'
import { Track } from './Track'

export class Game {
  private scene:    THREE.Scene
  private renderer: THREE.WebGLRenderer
  private camera:   SpringArmCamera
  private world:    CANNON.World
  private input:    InputManager
  private kart:     Kart
  private lastTime = 0

  constructor(canvas: HTMLCanvasElement) {
    // ── Three.js ──────────────────────────────────────────────────────────
    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.Fog(0x87ceeb, 100, 400)

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this._setSize()

    // ── Lights ────────────────────────────────────────────────────────────
    const ambient = new THREE.AmbientLight(0xffffff, 0.45)
    this.scene.add(ambient)

    const sun = new THREE.DirectionalLight(0xfff8e8, 1.3)
    sun.position.set(60, 100, 40)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    const sc = sun.shadow.camera as THREE.OrthographicCamera
    sc.left = sc.bottom = -150
    sc.right = sc.top    =  150
    sc.near  = 1;  sc.far = 500
    this.scene.add(sun)

    const hemi = new THREE.HemisphereLight(0x87ceeb, 0x4a7a3a, 0.3)
    this.scene.add(hemi)

    // ── Cannon-es world ───────────────────────────────────────────────────
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -20, 0) })
    this.world.broadphase = new CANNON.SAPBroadphase(this.world)
    this.world.defaultContactMaterial.friction = 0.4

    // ── Camera ────────────────────────────────────────────────────────────
    const aspect = window.innerWidth / window.innerHeight
    this.camera = new SpringArmCamera(aspect)

    // ── Input ─────────────────────────────────────────────────────────────
    this.input = new InputManager()

    // ── Track ─────────────────────────────────────────────────────────────
    new Track(this.scene, this.world)

    // ── Kart (spawn slightly above ground) ───────────────────────────────
    this.kart = new Kart(this.world, this.scene, new CANNON.Vec3(0, 2, 0))

    // ── Resize ────────────────────────────────────────────────────────────
    window.addEventListener('resize', () => {
      this._setSize()
      this.camera.onResize(window.innerWidth / window.innerHeight)
    })
  }

  private _setSize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight)
  }

  start() {
    this.lastTime = performance.now()
    this._loop(this.lastTime)
  }

  private _loop(now: number) {
    requestAnimationFrame(t => this._loop(t))

    const dt = Math.min((now - this.lastTime) / 1000, 0.05)
    this.lastTime = now

    // Physics step (fixed at 60hz, up to 3 substeps)
    this.world.step(1 / 60, dt, 3)

    // Update game objects
    this.kart.update(dt, this.input.getState())

    // Update camera
    this.camera.update(
      this.kart.getPosition(),
      this.kart.getQuaternion(),
      this.kart.driftDir,
      this.kart.speed,
      dt
    )

    this.renderer.render(this.scene, this.camera.camera)
  }
}
