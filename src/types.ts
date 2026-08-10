export type Coordinates = [number, number]

declare global {
  interface Window {
    routesByDay?: Map<string, RouteLeg[]>
  }
}

export type PlaceKind = 'city' | 'culture' | 'nature' | 'landmark' | 'hotel' | 'transport'

export interface Inspiration {
  title: string
  author: string
  url: string
  note: string
}

export interface Place {
  id: string
  name: string
  shortName?: string
  kind: PlaceKind
  coordinates: Coordinates
  caption: string
  image: string
  imageCredit: string
  imageSource: Inspiration
  navHint?: string
  stay?: string
  inspiration?: Inspiration
}

export interface Activity {
  time: string
  label: string
  title: string
  detail: string
  placeId?: string
}

export interface TripDay {
  id: string
  date: string
  weekday: string
  dayNumber: string
  city: string
  subtitle: string
  drive?: string
  distance?: string
  hotel?: string
  phase: 'prologue' | 'road'
  placeIds: string[]
  activities: Activity[]
  accent: string
}

export interface RouteLeg {
  id: string
  dayId: string
  from: string
  to: string
  distanceKm: number
  durationMinutes: number
  coordinates: Coordinates[]
}

export interface PlaybackCursor {
  dayId: string
  legIndex: number
  legProgress: number
}
