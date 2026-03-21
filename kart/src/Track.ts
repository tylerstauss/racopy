import * as THREE from 'three'
import * as CANNON from 'cannon-es'

export class Track {
  bodies: CANNON.Body[] = []

  constructor(scene: THREE.Scene, world: CANNON.World) {
    this._buildGround(scene, world)
    this._buildTrackSurface(scene)
    this._buildEnvironment(scene)
  }

  private _buildGround(scene: THREE.Scene, world: CANNON.World) {
    // Physics ground plane
    const ground = new CANNON.Body({ mass: 0 })
    ground.addShape(new CANNON.Plane())
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0)
    world.addBody(ground)
    this.bodies.push(ground)

    // Visual ground (large grass area)
    const grassGeo = new THREE.PlaneGeometry(600, 600)
    const grassMat = new THREE.MeshLambertMaterial({ color: 0x3a7a3a })
    const grass = new THREE.Mesh(grassGeo, grassMat)
    grass.rotation.x = -Math.PI / 2
    grass.position.y = -0.01
    grass.receiveShadow = true
    scene.add(grass)

    // Grid overlay for orientation
    const grid = new THREE.GridHelper(600, 60, 0x2a6a2a, 0x2a6a2a)
    grid.position.y = 0.005
    scene.add(grid)
  }

  private _buildTrackSurface(scene: THREE.Scene) {
    const trackMat = new THREE.MeshLambertMaterial({ color: 0x555555 })
    const lineMat  = new THREE.MeshLambertMaterial({ color: 0xffffff })
    const dirtMat  = new THREE.MeshLambertMaterial({ color: 0x8a7a5a })

    // Main straight (center strip)
    const addPlane = (w: number, d: number, mat: THREE.Material, x: number, z: number, ry = 0) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat)
      m.rotation.x  = -Math.PI / 2
      m.rotation.z  = ry
      m.position.set(x, 0.01, z)
      m.receiveShadow = true
      scene.add(m)
    }

    // Straights
    addPlane(14, 80, trackMat,  0,   -50)   // front straight
    addPlane(14, 80, trackMat,  0,    50)   // back straight
    // Curves (approximated as wide rectangles + diagonals)
    addPlane(14, 80, trackMat, -35,   0, Math.PI / 2)  // left
    addPlane(14, 80, trackMat,  35,   0, Math.PI / 2)  // right
    // Corner pieces
    addPlane(20, 20, trackMat, -28,  -80)
    addPlane(20, 20, trackMat,  28,  -80)
    addPlane(20, 20, trackMat, -28,   80)
    addPlane(20, 20, trackMat,  28,   80)

    // Start/finish line (checkerboard)
    for (let i = 0; i < 7; i++) {
      for (let j = 0; j < 2; j++) {
        if ((i + j) % 2 === 0) continue
        const sq = new THREE.Mesh(
          new THREE.PlaneGeometry(2, 2),
          new THREE.MeshLambertMaterial({ color: 0x111111 })
        )
        sq.rotation.x = -Math.PI / 2
        sq.position.set(-6 + i * 2, 0.02, -8 + j * 2)
        scene.add(sq)
      }
    }
    // White lines for start
    addPlane(14, 0.4, lineMat, 0, -7)
    addPlane(14, 0.4, lineMat, 0, -9)

    // Kerb stripes (red/white alternating edges)
    for (let z = -85; z <= 85; z += 8) {
      const c = Math.floor(z / 8) % 2 === 0 ? 0xee3322 : 0xffffff
      const km = new THREE.MeshLambertMaterial({ color: c })
      addPlane(2, 4, km, -42, z)
      addPlane(2, 4, km,  42, z)
    }
    // Dirt run-offs outside track
    addPlane(8, 80, dirtMat, -46, 0)
    addPlane(8, 80, dirtMat,  46, 0)
  }

  private _buildEnvironment(scene: THREE.Scene) {
    // Trees
    const treeTrunk = new THREE.MeshLambertMaterial({ color: 0x6b3a2a })
    const treeLeaf  = new THREE.MeshLambertMaterial({ color: 0x2d6e2d })

    const addTree = (x: number, z: number) => {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 1.5, 6), treeTrunk)
      trunk.position.set(x, 0.75, z)
      scene.add(trunk)
      const crown = new THREE.Mesh(new THREE.ConeGeometry(1.4, 3.5, 7), treeLeaf)
      crown.position.set(x, 3.5, z)
      scene.add(crown)
    }

    const treePositions: [number, number][] = [
      [-60, -60], [-65, -30], [-62,  0],  [-65, 30],  [-60, 60],
      [ 60, -60], [ 65, -30], [ 62,  0],  [ 65, 30],  [ 60, 60],
      [-20, -100], [0, -105], [20, -100],
      [-20,  100], [0,  105], [20,  100],
    ]
    treePositions.forEach(([x, z]) => addTree(x, z))

    // Cones / barriers along track edges
    const coneMat = new THREE.MeshLambertMaterial({ color: 0xff4400 })
    const conePositions: [number, number][] = [
      // Front straight sides
      [-8, -20], [-8, -40], [-8, -60],
      [ 8, -20], [ 8, -40], [ 8, -60],
      // Back straight sides
      [-8,  20], [-8,  40], [-8,  60],
      [ 8,  20], [ 8,  40], [ 8,  60],
    ]
    conePositions.forEach(([x, z]) => {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.2, 8), coneMat)
      cone.position.set(x, 0.6, z)
      scene.add(cone)
    })

    // Grandstand (simple box structure on the inside of turn 1)
    const standMat = new THREE.MeshLambertMaterial({ color: 0xdddddd })
    const stand = new THREE.Mesh(new THREE.BoxGeometry(20, 4, 6), standMat)
    stand.position.set(0, 2, -92)
    scene.add(stand)

    // Skybox-style backdrop: a large sphere with inside color
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(500, 16, 8),
      new THREE.MeshBasicMaterial({ color: 0x87ceeb, side: THREE.BackSide })
    )
    scene.add(sky)

    // Distant hills (hemisphere bumps)
    const hillMat = new THREE.MeshLambertMaterial({ color: 0x4a8a4a })
    const hillPositions: [number, number, number][] = [
      [-120, 0, -80], [120, 0, -80], [-120, 0, 80], [120, 0, 80],
      [0, 0, -130],   [0, 0, 130],
    ]
    hillPositions.forEach(([x, y, z]) => {
      const hill = new THREE.Mesh(new THREE.SphereGeometry(25, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), hillMat)
      hill.position.set(x, y, z)
      scene.add(hill)
    })
  }
}
