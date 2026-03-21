import * as THREE from 'three'

export class SpringArmCamera {
  camera: THREE.PerspectiveCamera
  private smoothPos = new THREE.Vector3()
  private smoothLook = new THREE.Vector3()
  private initialized = false

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(65, aspect, 0.1, 1000)
  }

  update(
    kartPos: THREE.Vector3,
    kartQuat: THREE.Quaternion,
    driftDir: number,
    speed: number,
    dt: number
  ) {
    // Base offset: behind and above the kart
    const offset = new THREE.Vector3(0, 3.5, -7.5)

    // Swing camera outward during a drift for dramatic effect
    if (driftDir !== 0) {
      offset.x = -driftDir * 2.2
      offset.z = -7.0
    }

    // Compress camera slightly at high speed
    const speedFactor = Math.min(speed / 120, 1)
    offset.z -= speedFactor * 1.0

    // Transform offset to world space relative to kart orientation
    const worldOffset = offset.clone().applyQuaternion(kartQuat)
    const targetPos = kartPos.clone().add(worldOffset)

    // Look-at point: slightly in front of kart
    const lookOffset = new THREE.Vector3(0, 0.8, 3).applyQuaternion(kartQuat)
    const targetLook = kartPos.clone().add(lookOffset)

    if (!this.initialized) {
      this.smoothPos.copy(targetPos)
      this.smoothLook.copy(targetLook)
      this.initialized = true
    }

    // Spring lerp — faster when far away, slower when close
    const posLerp = Math.min(0.07 + speed * 0.0003, 0.14)
    const lookLerp = 0.18
    this.smoothPos.lerp(targetPos, posLerp)
    this.smoothLook.lerp(targetLook, lookLerp)

    this.camera.position.copy(this.smoothPos)
    this.camera.lookAt(this.smoothLook)
  }

  onResize(aspect: number) {
    this.camera.aspect = aspect
    this.camera.updateProjectionMatrix()
  }
}
