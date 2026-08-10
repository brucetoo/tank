import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import mapLibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import type { GeoJSONSource, Map as MapLibreMap, Marker } from 'maplibre-gl'
import {
  ArrowUpRight,
  BedDouble,
  CarFront,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Compass,
  ExternalLink,
  Hotel,
  MapPin,
  Mountain,
  Navigation,
  Pause,
  Play,
  Route,
  Sparkles,
} from 'lucide-react'
import { days, places, roadDays } from './data/itinerary'
import routeData from './data/routes.json'
import type { Coordinates, Place, PlaceKind, PlaybackCursor, RouteLeg, TripDay } from './types'

maplibregl.setWorkerUrl(mapLibreWorkerUrl)

const routes = routeData as RouteLeg[]
const routesByDay = new Map(roadDays.map((day) => [day.id, routes.filter((leg) => leg.dayId === day.id)]))
window.routesByDay = routesByDay
const roadRoute = {
  type: 'Feature' as const,
  properties: {},
  geometry: { type: 'MultiLineString' as const, coordinates: routes.map((leg) => leg.coordinates) },
}
const emptyRoute = () => ({ type: 'FeatureCollection' as const, features: [] })

type CameraMode = 'overview' | 'cluster' | 'manual'

interface PlaceCluster {
  id: string
  placeIds: string[]
}

function distanceBetween([lng1, lat1]: Coordinates, [lng2, lat2]: Coordinates) {
  const toRadians = (value: number) => value * Math.PI / 180
  const latDistance = toRadians(lat2 - lat1)
  const lngDistance = toRadians(lng2 - lng1)
  const a = Math.sin(latDistance / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(lngDistance / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function getRouteStops(dayId: string) {
  const legs = routesByDay.get(dayId) ?? []
  if (!legs.length) return []
  return [legs[0].from, ...legs.map((leg) => leg.to)].filter((id, index, list) => list.indexOf(id) === index)
}

function getPlaceClusters(dayId: string) {
  const stops = getRouteStops(dayId)
  const clusters: PlaceCluster[] = []
  for (let start = 0; start < stops.length - 1; start += 1) {
    const placeIds = [stops[start]]
    for (let end = start + 1; end < stops.length; end += 1) {
      const previous = places[stops[end - 1]].coordinates
      const current = places[stops[end]].coordinates
      if (distanceBetween(previous, current) > 50) break
      const candidate = [...placeIds, stops[end]]
      const diagonal = Math.max(...candidate.map((id) => distanceBetween(places[candidate[0]].coordinates, places[id].coordinates)))
      if (diagonal > 90) break
      placeIds.push(stops[end])
    }
    const closePair = placeIds.length === 2 && distanceBetween(places[placeIds[0]].coordinates, places[placeIds[1]].coordinates) <= 15
    if (placeIds.length >= 3 || closePair) {
      clusters.push({ id: `${dayId}-${placeIds.join('-')}`, placeIds })
      start += placeIds.length - 2
    }
  }
  return clusters
}

function getMapPadding(map: MapLibreMap) {
  const width = map.getContainer().clientWidth
  if (width <= 560) return { top: 56, right: 24, bottom: 92, left: 24 }
  if (width <= 820) return { top: 72, right: 44, bottom: 88, left: 44 }
  return { top: 88, right: 72, bottom: 92, left: 72 }
}

function bearingBetween([lng1, lat1]: Coordinates, [lng2, lat2]: Coordinates) {
  const toRadians = (value: number) => value * Math.PI / 180
  const deltaLng = toRadians(lng2 - lng1)
  const fromLat = toRadians(lat1)
  const toLat = toRadians(lat2)
  const y = Math.sin(deltaLng) * Math.cos(toLat)
  const x = Math.cos(fromLat) * Math.sin(toLat) - Math.sin(fromLat) * Math.cos(toLat) * Math.cos(deltaLng)
  return Math.atan2(y, x) * 180 / Math.PI
}

function interpolateLeg(leg: RouteLeg, progress: number) {
  const distances = [0]
  for (let index = 1; index < leg.coordinates.length; index += 1) {
    distances.push(distances[index - 1] + distanceBetween(leg.coordinates[index - 1], leg.coordinates[index]))
  }
  const target = distances.at(-1)! * Math.max(0, Math.min(1, progress))
  let index = 1
  while (index < distances.length && distances[index] < target) index += 1
  if (index >= distances.length) return { coordinate: leg.coordinates.at(-1)!, coordinates: leg.coordinates }
  const segmentLength = distances[index] - distances[index - 1]
  const ratio = segmentLength === 0 ? 0 : (target - distances[index - 1]) / segmentLength
  const start = leg.coordinates[index - 1]
  const end = leg.coordinates[index]
  return {
    coordinate: [start[0] + (end[0] - start[0]) * ratio, start[1] + (end[1] - start[1]) * ratio] as Coordinates,
    coordinates: [...leg.coordinates.slice(0, index), [start[0] + (end[0] - start[0]) * ratio, start[1] + (end[1] - start[1]) * ratio] as Coordinates],
  }
}

const kindLabel: Record<PlaceKind, string> = {
  city: '城市',
  culture: '人文',
  nature: '自然',
  landmark: '地标',
  hotel: '住宿',
  transport: '交通',
}

const line = (coordinates: Coordinates[]) => ({
  type: 'Feature' as const,
  properties: {},
  geometry: { type: 'LineString' as const, coordinates },
})

const multiLine = (coordinates: Coordinates[][]) => ({
  type: 'Feature' as const,
  properties: {},
  geometry: { type: 'MultiLineString' as const, coordinates },
})

interface RoadMapProps {
  selectedDay: TripDay
  selectedPlaceId: string
  placeFocusRequest: number
  cameraResetRequest: number
  playback: PlaybackCursor | null
  onSelectPlace: (id: string) => void
}

function RoadMap({ selectedDay, selectedPlaceId, placeFocusRequest, cameraResetRequest, playback, onSelectPlace }: RoadMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markersRef = useRef<Map<string, Marker>>(new Map())
  const vehicleMarkerRef = useRef<Marker | null>(null)
  const selectRef = useRef(onSelectPlace)
  const cameraModeRef = useRef<CameraMode>('overview')
  const activeClusterRef = useRef<string | null>(null)
  const automaticCameraRef = useRef(false)
  const lastFollowRef = useRef(0)

  useEffect(() => {
    selectRef.current = onSelectPlace
  }, [onSelectPlace])

  useEffect(() => {
    cameraModeRef.current = 'overview'
    activeClusterRef.current = null
  }, [cameraResetRequest])

  useEffect(() => {
    document.querySelectorAll<HTMLButtonElement>('.map-marker').forEach((element) => {
      const active = element.dataset.placeId === selectedPlaceId
      element.classList.toggle('is-active', active)
      element.setAttribute('aria-pressed', String(active))
    })
  }, [selectedPlaceId])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const map = new maplibregl.Map({
      container,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors',
          },
        },
        layers: [
          { id: 'paper', type: 'background', paint: { 'background-color': '#d8d4c7' } },
          { id: 'osm', type: 'raster', source: 'osm', paint: { 'raster-saturation': -0.78, 'raster-contrast': 0.12, 'raster-brightness-max': 0.86 } },
        ],
      },
      center: [99.5, 37.5],
      zoom: 4.25,
      attributionControl: false,
      cooperativeGestures: true,
    })

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'bottom-right')
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left')

    const takeCameraControl = () => {
      if (!automaticCameraRef.current) cameraModeRef.current = 'manual'
    }
    map.on('dragstart', takeCameraControl)
    map.on('zoomstart', takeCameraControl)
    map.on('rotatestart', takeCameraControl)
    map.on('moveend', () => { automaticCameraRef.current = false })

    map.on('load', () => {
      const arrowImage = document.createElement('canvas')
      arrowImage.width = 32
      arrowImage.height = 32
      const context = arrowImage.getContext('2d')
      if (context) {
        context.strokeStyle = '#101716'
        context.fillStyle = '#f4eee0'
        context.lineWidth = 3
        context.lineJoin = 'round'
        context.beginPath()
        context.moveTo(7, 5)
        context.lineTo(25, 16)
        context.lineTo(7, 27)
        context.lineTo(12, 16)
        context.closePath()
        context.fill()
        context.stroke()
      }
      if (context) map.addImage('route-arrow', context.getImageData(0, 0, 32, 32), { pixelRatio: 2 })
      const initialLegs = routesByDay.get(selectedDay.id) ?? []
      const initialRoute = selectedDay.phase === 'road'
        ? multiLine(initialLegs.map((leg) => leg.coordinates))
        : line(selectedDay.placeIds.map((id) => places[id].coordinates))
      map.addSource('full-route', { type: 'geojson', data: roadRoute })
      map.addLayer({
        id: 'full-route-shadow',
        type: 'line',
        source: 'full-route',
        paint: { 'line-color': '#18201e', 'line-width': 5, 'line-opacity': 0.14 },
      })
      map.addLayer({
        id: 'full-route-line',
        type: 'line',
        source: 'full-route',
        paint: { 'line-color': '#33403c', 'line-width': 2, 'line-opacity': 0.42 },
      })
      map.addSource('day-route', { type: 'geojson', data: initialRoute })
      map.addLayer({ id: 'day-route-halo', type: 'line', source: 'day-route', paint: { 'line-color': '#101716', 'line-width': 9, 'line-opacity': 0.2 } })
      map.addLayer({ id: 'day-route-line', type: 'line', source: 'day-route', paint: { 'line-color': selectedDay.accent, 'line-width': 4.5, 'line-opacity': 0.3, 'line-dasharray': selectedDay.phase === 'prologue' ? [1.5, 1.2] : [1, 0] } })
      map.addLayer({
        id: 'day-route-arrows',
        type: 'symbol',
        source: 'day-route',
        layout: { 'symbol-placement': 'line', 'symbol-spacing': 110, 'icon-image': 'route-arrow', 'icon-size': 1, 'icon-keep-upright': false, 'icon-rotation-alignment': 'map', 'icon-allow-overlap': true },
      })
      map.addSource('traveled-route', { type: 'geojson', data: emptyRoute() })
      map.addLayer({ id: 'traveled-route-halo', type: 'line', source: 'traveled-route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#101716', 'line-width': 11, 'line-opacity': 0.92 } })
      map.addLayer({ id: 'traveled-route-line', type: 'line', source: 'traveled-route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#e4ff65', 'line-width': 6.5, 'line-opacity': 1 } })
      map.addSource('current-route', { type: 'geojson', data: emptyRoute() })
      map.addLayer({ id: 'current-route-halo', type: 'line', source: 'current-route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#101716', 'line-width': 11, 'line-opacity': 0.92 } })
      map.addLayer({ id: 'current-route-line', type: 'line', source: 'current-route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#e4ff65', 'line-width': 6.5, 'line-opacity': 1 } })
    })

    Object.values(places).forEach((place) => {
      const element = document.createElement('button')
      element.type = 'button'
      element.className = 'map-marker'
      element.dataset.placeId = place.id
      element.setAttribute('aria-label', `在行程中选择 ${place.name}`)
      element.innerHTML = `<span class="marker-dot"></span><span class="marker-label">${place.shortName ?? place.name}</span>`
      element.addEventListener('click', () => selectRef.current(place.id))
      const marker = new maplibregl.Marker({ element, anchor: 'center' }).setLngLat(place.coordinates).addTo(map)
      markersRef.current.set(place.id, marker)
    })

    const vehicleElement = document.createElement('div')
    vehicleElement.className = 'route-vehicle'
    vehicleElement.setAttribute('aria-label', 'TANK 路线车辆位置')
    vehicleElement.innerHTML = `
      <svg viewBox="0 0 64 80" aria-hidden="true">
        <path class="tank-shadow" d="M18 7Q32-1 46 7L53 19V65Q53 73 45 76H19Q11 73 11 65V19L18 7Z" />
        <path class="tank-body" d="M20 5Q32 0 44 5L50 18V64Q50 70 44 73H20Q14 70 14 64V18L20 5Z" />
        <path class="tank-hood" d="M21 8Q32 4 43 8L47 20H17L21 8Z" />
        <path class="tank-windshield" d="M18 25H46L43 38H21L18 25Z" />
        <path class="tank-roof" d="M21 41H43V60H21V41Z" />
        <path class="tank-mark" d="M24 46H40M32 46V56" />
        <path class="tank-bumper" d="M20 67H44" />
        <path class="tank-wheel tank-wheel-left" d="M9 22H14V37H9ZM9 48H14V63H9Z" />
        <path class="tank-wheel tank-wheel-right" d="M50 22H55V37H50ZM50 48H55V63H50Z" />
        <circle class="tank-headlight" cx="22" cy="13" r="2.5" />
        <circle class="tank-headlight" cx="42" cy="13" r="2.5" />
      </svg>
    `
    vehicleMarkerRef.current = new maplibregl.Marker({ element: vehicleElement, anchor: 'center', rotationAlignment: 'map' })

    mapRef.current = map
    return () => {
      markersRef.current.clear()
      vehicleMarkerRef.current = null
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const update = () => {
      const dayLegs = routesByDay.get(selectedDay.id) ?? []
      const coordinates = selectedDay.phase === 'road' ? dayLegs.map((leg) => leg.coordinates) : []
      const source = map.getSource('day-route') as GeoJSONSource | undefined
      source?.setData(selectedDay.phase === 'road' ? multiLine(coordinates) : line(selectedDay.placeIds.map((id) => places[id].coordinates)))
      ;(map.getSource('traveled-route') as GeoJSONSource | undefined)?.setData(emptyRoute())
      ;(map.getSource('current-route') as GeoJSONSource | undefined)?.setData(emptyRoute())
      map.setPaintProperty('day-route-line', 'line-color', selectedDay.accent)
      map.setPaintProperty('day-route-line', 'line-dasharray', selectedDay.phase === 'prologue' ? [1.5, 1.2] : [1, 0])
      map.setLayoutProperty('day-route-arrows', 'visibility', selectedDay.phase === 'road' ? 'visible' : 'none')
      vehicleMarkerRef.current?.remove()
      const bounds = new maplibregl.LngLatBounds()
      if (coordinates.length) coordinates.forEach((route) => route.forEach((coordinate) => bounds.extend(coordinate)))
      else selectedDay.placeIds.forEach((id) => bounds.extend(places[id].coordinates))
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      cameraModeRef.current = 'overview'
      activeClusterRef.current = null
      automaticCameraRef.current = true

      // 计算边界尺寸，判断是否需要放大以确保能看到路线
      const boundsWidth = bounds.getEast() - bounds.getWest()
      const boundsHeight = bounds.getNorth() - bounds.getSouth()
      const minBoundsSize = 0.02 // 最小边界尺寸（约2公里）

      if (boundsWidth < minBoundsSize || boundsHeight < minBoundsSize) {
        // 如果边界太小，使用较大的缩放级别
        map.fitBounds(bounds, { padding: getMapPadding(map), maxZoom: 12, duration: reducedMotion ? 0 : 800, linear: true })
      } else {
        // 正常情况使用原缩放级别
        map.fitBounds(bounds, { padding: getMapPadding(map), maxZoom: 8.2, duration: reducedMotion ? 0 : 800, linear: true })
      }
    }
    map.getSource('day-route') ? update() : map.once('load', update)
  }, [selectedDay])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const update = () => {
      const traveledSource = map.getSource('traveled-route') as GeoJSONSource | undefined
      const currentSource = map.getSource('current-route') as GeoJSONSource | undefined
      const marker = vehicleMarkerRef.current
      if (!playback || playback.dayId !== selectedDay.id) {
        traveledSource?.setData(emptyRoute())
        currentSource?.setData(emptyRoute())
        marker?.remove()
        return
      }
      const dayLegs = routesByDay.get(playback.dayId) ?? []
      if (playback.legIndex >= dayLegs.length) {
        traveledSource?.setData(multiLine(dayLegs.map((item) => item.coordinates)))
        currentSource?.setData(emptyRoute())
        const finalLeg = dayLegs.at(-1)
        if (marker && finalLeg) {
          marker.setLngLat(finalLeg.coordinates.at(-1)!).setRotation(bearingBetween(finalLeg.coordinates.at(-2)!, finalLeg.coordinates.at(-1)!))
          if (!marker.getElement().parentElement) marker.addTo(map)
        }
        return
      }
      const leg = dayLegs[playback.legIndex]
      if (!leg) return
      const position = interpolateLeg(leg, playback.legProgress)
      const completed = dayLegs.slice(0, playback.legIndex).map((item) => item.coordinates)
      traveledSource?.setData(multiLine(completed))
      currentSource?.setData(line(position.coordinates))
      if (marker) {
        const currentIndex = Math.max(0, Math.min(position.coordinates.length - 1, leg.coordinates.length - 1))
        const previous = leg.coordinates[Math.max(0, currentIndex - 1)]
        const next = leg.coordinates[Math.min(currentIndex + 1, leg.coordinates.length - 1)]
        marker.setLngLat(position.coordinate).setRotation(bearingBetween(previous, next))
        if (!marker.getElement().parentElement) marker.addTo(map)
      }

      if (cameraModeRef.current === 'manual') return
      const clusters = getPlaceClusters(selectedDay.id)
      const targetCluster = clusters.find((cluster) => {
        const approaching = cluster.placeIds.includes(leg.to) && playback.legProgress >= 0.7
        const travelingInside = cluster.placeIds.includes(leg.from) && cluster.placeIds.includes(leg.to)
        return approaching || travelingInside
      })
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

      if (targetCluster && activeClusterRef.current !== targetCluster.id) {
        const bounds = new maplibregl.LngLatBounds()
        targetCluster.placeIds.forEach((id) => bounds.extend(places[id].coordinates))
        bounds.extend(position.coordinate)
        const padding = getMapPadding(map)
        const camera = map.cameraForBounds(bounds, { padding })
        if (camera) {
          const mobile = map.getContainer().clientWidth <= 560
          const zoom = Math.round(Math.min(mobile ? 10.5 : 11.5, Math.max(mobile ? 5 : 5.5, camera.zoom ?? map.getZoom())) * 4) / 4
          cameraModeRef.current = 'cluster'
          activeClusterRef.current = targetCluster.id
          automaticCameraRef.current = true
          map.easeTo({ center: camera.center, zoom, duration: reducedMotion ? 0 : 650 })
        }
      } else if (!targetCluster && cameraModeRef.current === 'cluster' && playback.legProgress > 0.08) {
        const bounds = new maplibregl.LngLatBounds()
        dayLegs.forEach((item) => item.coordinates.forEach((coordinate) => bounds.extend(coordinate)))
        cameraModeRef.current = 'overview'
        activeClusterRef.current = null
        automaticCameraRef.current = true
        map.fitBounds(bounds, { padding: getMapPadding(map), maxZoom: 8.2, duration: reducedMotion ? 0 : 750, linear: true })
      } else {
        // 确保车轨迹图标始终在可视范围内，动态调整地图位置
        const point = map.project(position.coordinate)
        const container = map.getContainer()
        const horizontalMargin = container.clientWidth * 0.15 // 减小安全区域边距
        const verticalMargin = container.clientHeight * 0.15
        const outsideSafeArea = point.x < horizontalMargin || point.x > container.clientWidth - horizontalMargin
          || point.y < verticalMargin || point.y > container.clientHeight - verticalMargin

        const now = performance.now()
        if (outsideSafeArea && now - lastFollowRef.current > 600) { // 缩短延迟
          lastFollowRef.current = now
          automaticCameraRef.current = true

          // 计算需要调整的中心位置
          let targetX = position.coordinate[0]
          let targetY = position.coordinate[1]

          if (point.x < horizontalMargin) {
            const deltaX = (horizontalMargin - point.x) / container.clientWidth
            targetX += deltaX * 360 / Math.pow(2, map.getZoom()) // 调整经度
          } else if (point.x > container.clientWidth - horizontalMargin) {
            const deltaX = (point.x - (container.clientWidth - horizontalMargin)) / container.clientWidth
            targetX += deltaX * 360 / Math.pow(2, map.getZoom())
          }

          if (point.y < verticalMargin) {
            const deltaY = (verticalMargin - point.y) / container.clientHeight
            targetY += deltaY * 180 / Math.pow(2, map.getZoom()) // 调整纬度
          } else if (point.y > container.clientHeight - verticalMargin) {
            const deltaY = (point.y - (container.clientHeight - verticalMargin)) / container.clientHeight
            targetY += deltaY * 180 / Math.pow(2, map.getZoom())
          }

          map.easeTo({
            center: [targetX, targetY],
            duration: reducedMotion ? 0 : 300
          })
        }

        // 动态调整比例尺，确保车辆和路线可见
        const visibleBounds = map.getBounds()
        const boundsContainsPosition = visibleBounds.contains(position.coordinate)
        if (!boundsContainsPosition) {
          // 如果车辆不在可视范围内，立即调整地图位置
          map.easeTo({
            center: position.coordinate,
            duration: reducedMotion ? 0 : 500
          })
        }
      }
    }
    map.getSource('current-route') ? update() : map.once('load', update)
  }, [playback, selectedDay.id])

  useEffect(() => {
    if (placeFocusRequest === 0) return
    const map = mapRef.current
    const selectedPlace = places[selectedPlaceId]
    if (!map || !selectedPlace) return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    map.flyTo({ center: selectedPlace.coordinates, zoom: Math.max(map.getZoom(), 6.6), duration: reducedMotion ? 0 : 900 })
  }, [placeFocusRequest, selectedPlaceId])

  return (
    <div className="map-shell" aria-label="河西走廊交互地图">
      <div ref={containerRef} className="map-canvas" />
      <div className="map-topline" aria-hidden="true">
        <span>31.2°N—40.5°N</span>
        <span>HEXI CORRIDOR / G30</span>
      </div>
      <div className="map-legend">
        <span><i className="legend-line" style={{ background: selectedDay.accent }} />当日路线</span>
        <span><i className="legend-dash" />完整旅程</span>
      </div>
    </div>
  )
}

function DateRail({ selectedIndex, onSelect }: { selectedIndex: number; onSelect: (index: number) => void }) {
  const listRef = useRef<HTMLDivElement>(null)

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    let next = index
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = Math.min(days.length - 1, index + 1)
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = Math.max(0, index - 1)
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = days.length - 1
    else return
    event.preventDefault()
    onSelect(next)
    listRef.current?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus()
  }

  return (
    <nav className="date-rail" aria-label="选择行程日期">
      <div className="rail-heading"><span>行程轴</span><b>{days.length} DAYS</b></div>
      <div className="rail-list" ref={listRef}>
        {days.map((day, index) => (
          <button
            key={day.id}
            aria-current={selectedIndex === index ? 'date' : undefined}
            tabIndex={selectedIndex === index ? 0 : -1}
            className={selectedIndex === index ? 'rail-day is-selected' : 'rail-day'}
            onClick={() => onSelect(index)}
            onKeyDown={(event) => onKeyDown(event, index)}
            style={{ '--day-accent': day.accent } as React.CSSProperties}
          >
            <span className="rail-index">{String(index + 1).padStart(2, '0')}</span>
            <strong>{day.date}</strong>
            <span>{day.weekday}</span>
            <i />
          </button>
        ))}
      </div>
    </nav>
  )
}

function PlacePanel({ place }: { place: Place }) {
  return (
    <article className="place-panel" aria-live="polite">
      <div className="place-visual" style={{ '--place-image': `url("${place.image}")` } as React.CSSProperties}>
        <img src={place.image} alt={`${place.name}的小红书实拍`} />
        <div className="visual-stamp"><span>{kindLabel[place.kind]}</span><b>{place.coordinates[1].toFixed(2)}°N</b></div>
        <a className="image-credit" href={place.imageSource.url} target="_blank" rel="noreferrer" aria-label={`查看图片来源：${place.imageSource.title}`}>
          <span>{place.imageCredit}</span>
          <ExternalLink size={12} aria-hidden="true" />
        </a>
      </div>
      <div className="place-copy">
        <div className="eyebrow"><MapPin size={14} /> SELECTED PLACE</div>
        <h2>{place.name}</h2>
        <p>{place.caption}</p>
        <div className="place-notes">
          {place.stay && <span><Clock3 size={15} />{place.stay}</span>}
          {place.navHint && <span><Navigation size={15} />{place.navHint}</span>}
        </div>
        {place.inspiration ? (
          <a className="source-card" href={place.inspiration.url} target="_blank" rel="noreferrer">
            <span className="red-book-mark">小红书</span>
            <span><small>{place.inspiration.note}</small><strong>{place.inspiration.title}</strong><em>by {place.inspiration.author}</em></span>
            <ExternalLink size={18} aria-hidden="true" />
          </a>
        ) : (
          <div className="field-note"><Sparkles size={16} /><span>路线手记</span> 选择带有灵感标记的地点，可查看小红书原帖参考。</div>
        )}
      </div>
    </article>
  )
}

function App() {
  const initialIndex = days.findIndex((day) => day.id === 'oct01')
  const [selectedIndex, setSelectedIndex] = useState(initialIndex)
  const [selectedPlaceId, setSelectedPlaceId] = useState(days[initialIndex].placeIds[1])
  const [placeFocusRequest, setPlaceFocusRequest] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playback, setPlayback] = useState<PlaybackCursor | null>(null)
  const [playbackRequest, setPlaybackRequest] = useState(0)
  const selectedDay = days[selectedIndex]
  const selectedPlace = places[selectedPlaceId]
  const selectedLegs = routesByDay.get(selectedDay.id) ?? []
  const selectedDistance = selectedLegs.reduce((total, leg) => total + leg.distanceKm, 0)
  const playbackProgress = playback?.dayId === selectedDay.id && selectedDistance
    ? (selectedLegs.slice(0, playback.legIndex).reduce((total, leg) => total + leg.distanceKm, 0)
      + (selectedLegs[playback.legIndex]?.distanceKm ?? 0) * playback.legProgress) / selectedDistance
    : 0

  const stats = useMemo(() => ({
    distance: roadDays.reduce((total, day) => total + Number(day.distance?.match(/\d+/)?.[0] ?? 0), 0),
    places: new Set(days.flatMap((day) => day.placeIds)).size,
  }), [])

  const selectDay = useCallback((index: number) => {
    const nextIndex = Math.max(0, Math.min(days.length - 1, index))
    const nextDay = days[nextIndex]
    setSelectedIndex(nextIndex)
    setSelectedPlaceId(nextDay.placeIds[0])
    setPlayback(nextDay.phase === 'road' ? { dayId: nextDay.id, legIndex: 0, legProgress: 0 } : null)
    setPlaybackRequest((request) => request + 1)
    setIsPlaying(nextDay.phase === 'road')
  }, [])

  const togglePlayback = useCallback(() => {
    if (selectedDay.phase !== 'road') return
    if (!playback || playback.dayId !== selectedDay.id || playback.legIndex >= selectedLegs.length) {
      setPlayback({ dayId: selectedDay.id, legIndex: 0, legProgress: 0 })
      setSelectedPlaceId(selectedLegs[0]?.from ?? selectedDay.placeIds[0])
    }
    setIsPlaying((value) => !value)
  }, [playback, selectedDay, selectedLegs])

  useEffect(() => {
    if (!isPlaying || !playback || playback.dayId !== selectedDay.id) return
    const dayLegs = routesByDay.get(playback.dayId) ?? []
    if (!dayLegs.length) {
      setIsPlaying(false)
      return
    }
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let frame = 0
    let startTime: number | null = null
    const startProgress = playback.legProgress
    const leg = dayLegs[playback.legIndex]
    if (!leg) return
    setSelectedPlaceId(leg.from)
    // 保证路线绘制速度一致，设置固定速度（例如：每秒移动 50 公里）
    const fixedSpeed = 50 // 公里/秒
    const duration = reducedMotion ? 550 : Math.max(1000, Math.min(10000, leg.distanceKm / fixedSpeed * 1000))

    const advance = (time: number) => {
      if (startTime === null) startTime = time
      const progress = reducedMotion ? 1 : Math.min(1, startProgress + (time - startTime) / duration)
      setPlayback({ dayId: selectedDay.id, legIndex: playback.legIndex, legProgress: progress })
      if (progress < 1) {
        frame = window.requestAnimationFrame(advance)
        return
      }
      setSelectedPlaceId(leg.to)
      const nextLegIndex = playback.legIndex + 1
      if (nextLegIndex < dayLegs.length) {
        setPlayback({ dayId: selectedDay.id, legIndex: nextLegIndex, legProgress: 0 })
        return
      }
      setIsPlaying(false)
      setPlayback({ dayId: selectedDay.id, legIndex: dayLegs.length, legProgress: 0 })
    }
    frame = window.requestAnimationFrame(advance)
    return () => window.cancelAnimationFrame(frame)
  }, [isPlaying, playback?.dayId, playback?.legIndex, playbackRequest, selectedDay.id])

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest('button, a, input, textarea, select, [role="button"]'))) return
      if (event.key === ' ') {
        event.preventDefault()
        togglePlayback()
      } else if (event.key === 'ArrowRight') selectDay(selectedIndex + 1)
      else if (event.key === 'ArrowLeft') selectDay(selectedIndex - 1)
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [selectDay, selectedIndex, togglePlayback])

  const selectPlace = (id: string) => {
    setIsPlaying(false)
    setSelectedPlaceId(id)
    setPlaceFocusRequest((request) => request + 1)
    const owningIndex = days.findIndex((day) => day.placeIds.includes(id))
    const targetIndex = selectedDay.placeIds.includes(id) ? selectedIndex : owningIndex
    if (targetIndex >= 0) {
      if (targetIndex !== selectedIndex) setSelectedIndex(targetIndex)
      setPlayback(null)
    }
  }

  return (
    <main className="app-shell">
      <header className="masthead">
        <a className="brand" href="#top" aria-label="探秘河西走廊路书首页">
          <span className="brand-compass"><Compass size={20} /></span>
          <span><b>河西走廊</b><small>EXPLORATION ROADBOOK · 2026</small></span>
        </a>
        <div className="trip-title" id="top">
          <span>成都 / 敦煌 / 河西走廊</span>
          <h1>探秘河西走廊</h1>
        </div>
        <div className="header-stats" aria-label="行程统计">
          <span><b>{stats.distance.toLocaleString()}</b><small>公里</small></span>
          <span><b>{roadDays.length}</b><small>公路日</small></span>
          <span><b>{stats.places}</b><small>地点</small></span>
          <button className={isPlaying ? 'play-button is-playing' : 'play-button'} onClick={togglePlayback} disabled={selectedDay.phase !== 'road'} aria-label={selectedDay.phase !== 'road' ? '序章不支持公路路线播放' : isPlaying ? '暂停路线播放' : '播放当日路线'} aria-pressed={isPlaying}>
            {isPlaying ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
            <span>{selectedDay.phase !== 'road' ? '序章' : isPlaying ? '暂停' : playbackProgress >= 1 ? '重新播放' : '播放路线'}</span>
          </button>
        </div>
      </header>

      <DateRail selectedIndex={selectedIndex} onSelect={selectDay} />

      <section className="hero-grid">
        <RoadMap selectedDay={selectedDay} selectedPlaceId={selectedPlaceId} placeFocusRequest={placeFocusRequest} cameraResetRequest={playbackRequest} playback={playback} onSelectPlace={selectPlace} />
        <aside className="day-card" style={{ '--accent': selectedDay.accent } as React.CSSProperties}>
          <div className="day-card-head">
            <span className="day-number">{selectedDay.dayNumber}</span>
            <span className="day-date">{selectedDay.date} · {selectedDay.weekday}</span>
          </div>
          <div className="route-kicker"><Route size={16} /> TODAY'S ROAD</div>
          <h2>{selectedDay.city}</h2>
          <p className="day-subtitle">{selectedDay.subtitle}</p>
          <div className="day-metrics">
            {selectedDay.drive && <span><CarFront size={18} /><b>{selectedDay.drive}</b><small>驾驶</small></span>}
            {selectedDay.distance && <span><Mountain size={18} /><b>{selectedDay.distance}</b><small>里程</small></span>}
            {selectedDay.hotel && <span><BedDouble size={18} /><b>{selectedDay.hotel}</b><small>今晚</small></span>}
          </div>
          <div className="place-chips" aria-label="当日地点">
            {selectedDay.placeIds.filter((id, index, list) => list.indexOf(id) === index).map((id, index) => (
              <button key={id} className={selectedPlaceId === id ? 'place-chip is-active' : 'place-chip'} onClick={() => selectPlace(id)} aria-pressed={selectedPlaceId === id}>
                <span>{String(index + 1).padStart(2, '0')}</span>{places[id].shortName ?? places[id].name}
              </button>
            ))}
          </div>
          {selectedDay.phase === 'road' && (
            <div className="route-progress" aria-live="polite">
              <div><span>{isPlaying ? 'ON THE ROAD' : playbackProgress >= 1 ? 'ARRIVED' : playbackProgress > 0 ? 'PAUSED' : 'ROUTE READY'}</span><b>{Math.round(playbackProgress * 100)}%</b></div>
              <progress max="1" value={playbackProgress} aria-label="当日路线播放进度" />
              <small>{selectedLegs.length} 段 · {Math.round(selectedDistance)} KM{playback && playback.legIndex < selectedLegs.length ? ` · ${places[selectedLegs[playback.legIndex].from].shortName ?? places[selectedLegs[playback.legIndex].from].name} → ${places[selectedLegs[playback.legIndex].to].shortName ?? places[selectedLegs[playback.legIndex].to].name}` : ''}</small>
            </div>
          )}
          <div className="day-controls">
            <button onClick={() => selectDay(selectedIndex - 1)} disabled={selectedIndex === 0} aria-label="前一天"><ChevronLeft size={18} /></button>
            <span>{selectedIndex + 1} / {days.length}</span>
            <button onClick={() => selectDay(selectedIndex + 1)} disabled={selectedIndex === days.length - 1} aria-label="后一天"><ChevronRight size={18} /></button>
          </div>
        </aside>
      </section>

      <section className="content-grid">
        <div className="schedule-section">
          <div className="section-heading">
            <div><span className="eyebrow">DAILY CUTS / 当日分镜</span><h2>沿着时间，进入风景</h2></div>
            <span className="kbd-tip">点击日期播放路线 · <kbd>←</kbd><kbd>→</kbd> 切换 · <kbd>空格</kbd> 暂停 / 继续</span>
          </div>
          <ol className="timeline">
            {selectedDay.activities.map((activity, index) => (
              <li key={`${activity.time}-${activity.title}`} className={activity.placeId === selectedPlaceId ? 'is-active' : ''}>
                <button onClick={() => activity.placeId && selectPlace(activity.placeId)} disabled={!activity.placeId} aria-label={activity.placeId ? `在地图中查看 ${activity.title}` : undefined}>
                  <span className="activity-time">{activity.time}</span>
                  <span className="activity-node"><i>{String(index + 1).padStart(2, '0')}</i></span>
                  <span className="activity-copy"><small>{activity.label}</small><strong>{activity.title}</strong><p>{activity.detail}</p></span>
                  {activity.placeId && <ArrowUpRight className="activity-arrow" size={20} />}
                </button>
              </li>
            ))}
          </ol>
          {selectedDay.hotel && <div className="hotel-strip"><Hotel size={18} /><span>落脚处</span><strong>{selectedDay.hotel}</strong></div>}
        </div>
        <PlacePanel place={selectedPlace} />
      </section>

      <footer>
        <span>探秘河西走廊 · HEXI CORRIDOR ROADBOOK</span>
        <p>地图数据 © OpenStreetMap contributors · 出发前请复核天气、路况与景区开放信息</p>
        <span>31°—41°N</span>
      </footer>
    </main>
  )
}

export default App
