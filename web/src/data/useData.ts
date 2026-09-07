/** Loading the static JSON bundles. */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Company, CompanyDetail, Meta } from './types'

/** Vite injects the Pages sub-path here; data lives beside the built assets. */
const BASE = import.meta.env.BASE_URL

export interface DataState {
  companies: Company[]
  meta: Meta | null
  loading: boolean
  error: string | null
}

export function useIndex(): DataState {
  const [state, setState] = useState<DataState>({
    companies: [],
    meta: null,
    loading: true,
    error: null,
  })

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const [indexRes, metaRes] = await Promise.all([
          fetch(`${BASE}data/index.json`),
          fetch(`${BASE}data/meta.json`),
        ])
        if (!indexRes.ok || !metaRes.ok) {
          throw new Error(
            `Data files not found (index ${indexRes.status}, meta ${metaRes.status}). ` +
              `Run the pipeline first: cd pipeline && python -m tracker.cli all`,
          )
        }
        const [companies, meta] = (await Promise.all([indexRes.json(), metaRes.json()])) as [
          Company[],
          Meta,
        ]
        if (!cancelled) setState({ companies, meta, loading: false, error: null })
      } catch (err) {
        if (!cancelled) {
          setState({
            companies: [],
            meta: null,
            loading: false,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return state
}

/**
 * Per-company detail, fetched on demand and cached for the session.
 *
 * A 404 here is expected and not an error: the exporter only writes detail
 * files for companies that have history or signals, so most companies legitimately
 * have none yet.
 */
export function useDetail(companyId: string | null) {
  const cache = useRef(new Map<string, CompanyDetail | null>())
  const [detail, setDetail] = useState<CompanyDetail | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (id: string) => {
    if (cache.current.has(id)) {
      setDetail(cache.current.get(id) ?? null)
      return
    }
    setLoading(true)
    try {
      const safe = id.replace(/:/g, '__').replace(/\//g, '_')
      const res = await fetch(`${BASE}data/details/${safe}.json`)
      const value = res.ok ? ((await res.json()) as CompanyDetail) : null
      cache.current.set(id, value)
      setDetail(value)
    } catch {
      cache.current.set(id, null)
      setDetail(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!companyId) {
      setDetail(null)
      return
    }
    void load(companyId)
  }, [companyId, load])

  return { detail, loading }
}
