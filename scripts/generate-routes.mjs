import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const coordinates = {
  chengdu: [104.0633, 30.6599], dunhuang: [94.6619, 40.1421], mogao: [94.8042, 40.0373],
  yadan: [93.2377, 40.5102], yumenguan: [93.8641, 40.3536], crescent: [94.6754, 40.0876],
  earthSon: [95.8382, 40.3815], jiayuguan: [98.2178, 39.8022], overhang: [98.1765, 39.8518],
  jiuquan: [98.4943, 39.7326], pingshanhu: [100.821, 39.170], earthTree: [100.55, 39.24],
  dafo: [100.4547, 38.9301], zhangye: [100.4498, 38.9259], mati: [100.106, 38.487],
  danxia: [100.0873, 38.9529], tiantishan: [102.7428, 37.5637], toudaocao: [102.61, 37.72],
  wuwei: [102.6380, 37.9283], wushaoling: [102.8838, 37.1834], maya: [102.55, 37.12],
  lanzhou: [103.8343, 36.0611], longnan: [104.9218, 33.4007],
}
const days = {
  oct01: ['dunhuang', 'mogao', 'yadan', 'yumenguan', 'crescent'],
  oct02: ['dunhuang', 'earthSon', 'jiayuguan', 'overhang', 'jiuquan'],
  oct03: ['jiuquan', 'pingshanhu', 'earthTree', 'dafo', 'zhangye'],
  oct04: ['zhangye', 'mati', 'danxia', 'zhangye'],
  oct05: ['zhangye', 'tiantishan', 'toudaocao', 'wuwei'],
  oct06: ['wuwei', 'wushaoling', 'maya', 'lanzhou', 'longnan'],
  oct07: ['longnan', 'chengdu'],
}
const legs = []
for (const [dayId, stops] of Object.entries(days)) {
  for (let index = 0; index < stops.length - 1; index++) {
    const from = stops[index]
    const to = stops[index + 1]
    const query = `${coordinates[from].join(',')};${coordinates[to].join(',')}`
    const url = `https://router.project-osrm.org/route/v1/driving/${query}?overview=full&geometries=geojson&steps=false`
    const response = await fetch(url, { headers: { 'User-Agent': 'hexi-roadbook-route-generator/1.0' } })
    const payload = await response.json()
    const route = payload.routes?.[0]
    if (!response.ok || !route) throw new Error(`Routing failed: ${dayId} ${from} → ${to}`)
    legs.push({
      id: `${dayId}-${index + 1}`,
      dayId, from, to,
      distanceKm: Math.round(route.distance / 100) / 10,
      durationMinutes: Math.round(route.duration / 60),
      coordinates: route.geometry.coordinates,
    })
    console.log(`${dayId}: ${from} → ${to} · ${Math.round(route.distance / 1000)}km · ${route.geometry.coordinates.length} points`)
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
}
const destination = join(root, 'src/data/routes.json')
mkdirSync(dirname(destination), { recursive: true })
writeFileSync(destination, `${JSON.stringify(legs)}\n`)
console.log(`Saved ${legs.length} route legs to ${destination}`)
