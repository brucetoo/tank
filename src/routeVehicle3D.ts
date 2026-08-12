import * as THREE from 'three'
import type { CustomLayerInterface, CustomRenderMethodInput, Map as MapLibreMap } from 'maplibre-gl'
import { MercatorCoordinate } from 'maplibre-gl'
import type { Coordinates } from './types'

const VEHICLE_LENGTH_METERS = 5.2
const MAPLIBRE_TILE_SIZE = 512

function addBox(
  group: THREE.Group,
  size: [number, number, number],
  position: [number, number, number],
  material: THREE.Material,
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material)
  mesh.position.set(...position)
  group.add(mesh)
  return mesh
}

function createVehicleModel(compact: boolean) {
  const vehicle = new THREE.Group()
  const acid = new THREE.MeshStandardMaterial({ color: 0xe4ff65, roughness: 0.5, metalness: 0.12 })
  const orange = new THREE.MeshStandardMaterial({ color: 0xee714d, roughness: 0.46, metalness: 0.16 })
  const ink = new THREE.MeshStandardMaterial({ color: 0x121918, roughness: 0.68, metalness: 0.08 })
  const glass = new THREE.MeshStandardMaterial({ color: 0x263b3b, roughness: 0.16, metalness: 0.2 })
  const light = new THREE.MeshStandardMaterial({ color: 0xfff3c4, emissive: 0xffb83d, emissiveIntensity: 1.6 })

  addBox(vehicle, [2.25, 4.65, 0.72], [0, 0, 0.78], acid)
  addBox(vehicle, [2.05, 1.68, 0.9], [0, -0.48, 1.55], ink)
  addBox(vehicle, [1.86, 1.48, 0.12], [0, -0.5, 2.06], orange)
  addBox(vehicle, [1.88, 0.12, 0.54], [0, 0.38, 1.58], glass)
  addBox(vehicle, [1.92, 1.05, 0.38], [0, 1.42, 1.12], orange)
  addBox(vehicle, [2.38, 0.2, 0.25], [0, 2.3, 0.56], ink)
  addBox(vehicle, [2.38, 0.2, 0.25], [0, -2.3, 0.56], ink)

  const wheelGeometry = new THREE.CylinderGeometry(0.49, 0.49, 0.42, compact ? 8 : 14)
  for (const x of [-1.17, 1.17]) {
    for (const y of [-1.43, 1.43]) {
      const wheel = new THREE.Mesh(wheelGeometry, ink)
      wheel.position.set(x, y, 0.5)
      wheel.rotation.z = Math.PI / 2
      vehicle.add(wheel)
    }
  }

  const headlightGeometry = new THREE.SphereGeometry(0.16, compact ? 6 : 10, compact ? 4 : 8)
  for (const x of [-0.7, 0.7]) {
    const headlight = new THREE.Mesh(headlightGeometry, light)
    headlight.position.set(x, 2.23, 1.18)
    vehicle.add(headlight)
  }

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1.55, compact ? 12 : 24),
    new THREE.MeshBasicMaterial({ color: 0x101716, transparent: true, opacity: 0.26, depthWrite: false }),
  )
  shadow.scale.y = 1.65
  shadow.position.z = 0.04
  vehicle.add(shadow)

  return vehicle
}

export class RouteVehicle3DLayer implements CustomLayerInterface {
  readonly id = 'route-vehicle-3d'
  readonly type = 'custom' as const
  readonly renderingMode = '3d' as const

  private map: MapLibreMap | null = null
  private camera: THREE.Camera | null = null
  private scene: THREE.Scene | null = null
  private renderer: THREE.WebGLRenderer | null = null
  private vehicle: THREE.Group | null = null
  private coordinate: Coordinates = [0, 0]
  private bearing = 0
  private visible = false

  constructor(private readonly compact = false) {}

  onAdd(map: MapLibreMap, gl: WebGL2RenderingContext) {
    this.map = map
    this.camera = new THREE.Camera()
    this.scene = new THREE.Scene()
    this.vehicle = createVehicleModel(this.compact)
    this.vehicle.visible = false
    this.scene.add(this.vehicle)

    this.scene.add(new THREE.HemisphereLight(0xf4eee0, 0x33403c, 2.4))
    const keyLight = new THREE.DirectionalLight(0xffffff, 3.2)
    keyLight.position.set(-4, -6, 10)
    this.scene.add(keyLight)
    const fillLight = new THREE.DirectionalLight(0xee714d, 1.2)
    fillLight.position.set(5, 4, 6)
    this.scene.add(fillLight)

    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true })
    this.renderer.autoClear = false
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
  }

  setPose(coordinate: Coordinates, bearing: number, visible = true) {
    this.coordinate = coordinate
    this.bearing = bearing
    this.visible = visible
    if (this.vehicle) this.vehicle.visible = visible
    this.map?.triggerRepaint()
  }

  setVisible(visible: boolean) {
    this.visible = visible
    if (this.vehicle) this.vehicle.visible = visible
    this.map?.triggerRepaint()
  }

  render(_gl: WebGL2RenderingContext, args: CustomRenderMethodInput) {
    if (!this.map || !this.camera || !this.scene || !this.renderer || !this.vehicle || !this.visible) return

    const elevation = this.map.queryTerrainElevation(this.coordinate) ?? 0
    const origin = MercatorCoordinate.fromLngLat(this.coordinate, elevation)
    const worldPixels = MAPLIBRE_TILE_SIZE * 2 ** this.map.getZoom()
    const metersPerPixel = 1 / (origin.meterInMercatorCoordinateUnits() * worldPixels)
    const targetLengthPixels = this.compact ? 30 : 42
    const modelScale = targetLengthPixels * metersPerPixel / VEHICLE_LENGTH_METERS
    const mercatorScale = origin.meterInMercatorCoordinateUnits() * modelScale

    const projection = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix)
    const model = new THREE.Matrix4()
      .makeTranslation(origin.x, origin.y, origin.z)
      .scale(new THREE.Vector3(mercatorScale, -mercatorScale, mercatorScale))
      .multiply(new THREE.Matrix4().makeRotationZ(-THREE.MathUtils.degToRad(this.bearing)))

    this.camera.projectionMatrix = projection.multiply(model)
    this.renderer.resetState()
    this.renderer.render(this.scene, this.camera)
  }

  onRemove() {
    const geometries = new Set<THREE.BufferGeometry>()
    const materials = new Set<THREE.Material>()
    this.scene?.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      geometries.add(object.geometry)
      const meshMaterials = Array.isArray(object.material) ? object.material : [object.material]
      meshMaterials.forEach((material) => materials.add(material))
    })
    geometries.forEach((geometry) => geometry.dispose())
    materials.forEach((material) => material.dispose())
    this.renderer?.dispose()
    this.map = null
    this.camera = null
    this.scene = null
    this.renderer = null
    this.vehicle = null
  }
}
