import { CLASS_COLOR } from './types'

export const CLASS_COLOR_OPTIONS = [
  { value: '#5b8cff', label: 'Blue' },
  { value: '#38bdf8', label: 'Sky' },
  { value: '#2dd4bf', label: 'Teal' },
  { value: '#4ade80', label: 'Green' },
  { value: '#facc15', label: 'Yellow' },
  { value: '#fb923c', label: 'Orange' },
  { value: '#f87171', label: 'Red' },
  { value: '#f472b6', label: 'Pink' },
  { value: '#a78bfa', label: 'Purple' },
  { value: '#94a3b8', label: 'Slate' },
] as const

const CLASS_COLOR_SET = new Set<string>(CLASS_COLOR_OPTIONS.map((o) => o.value))

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

export function isValidClassColor(value: string): boolean {
  return HEX_COLOR.test(value)
}

export function normalizeClassColor(value: unknown): string {
  if (typeof value !== 'string') return CLASS_COLOR
  const normalized = value.trim().toLowerCase()
  if (!isValidClassColor(normalized)) return CLASS_COLOR
  return normalized
}

export function isPresetClassColor(value: string): boolean {
  return CLASS_COLOR_SET.has(value.toLowerCase())
}

export function classColorOrDefault(value: string | undefined): string {
  return value ? normalizeClassColor(value) : CLASS_COLOR
}

export function classColorWithAlpha(value: string, alpha: number): string {
  const normalized = normalizeClassColor(value)
  const r = Number.parseInt(normalized.slice(1, 3), 16)
  const g = Number.parseInt(normalized.slice(3, 5), 16)
  const b = Number.parseInt(normalized.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
