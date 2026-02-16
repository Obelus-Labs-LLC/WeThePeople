export type ApiError = {
  status: number
  bodyText: string
}

const DEFAULT_BASE = 'http://localhost:8000'

export function apiBaseUrl(): string {
  const v = import.meta.env.VITE_API_BASE_URL
  return (typeof v === 'string' && v.trim().length > 0) ? v.trim().replace(/\/$/, '') : DEFAULT_BASE
}

export async function apiGetJson<T>(path: string): Promise<T> {
  const url = `${apiBaseUrl()}${path.startsWith('/') ? '' : '/'}${path}`
  const res = await fetch(url)
  if (!res.ok) {
    const bodyText = await res.text().catch(() => '')
    const err: ApiError = { status: res.status, bodyText }
    throw err
  }
  return (await res.json()) as T
}
