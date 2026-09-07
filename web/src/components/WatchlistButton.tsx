/** Star control. Persistence is localStorage — see lib/watchlist. */

export function WatchlistButton({
  id,
  name,
  watched,
  onToggle,
}: {
  id: string
  name: string
  watched: boolean
  onToggle: (id: string) => void
}) {
  return (
    <button
      className="star"
      data-on={watched}
      aria-pressed={watched}
      aria-label={watched ? `Remove ${name} from watchlist` : `Add ${name} to watchlist`}
      onClick={(e) => {
        e.stopPropagation()
        onToggle(id)
      }}
    >
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill={watched ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      >
        <path d="M12 2.5l2.9 6.1 6.6.9-4.8 4.6 1.2 6.6-5.9-3.2-5.9 3.2 1.2-6.6L2.5 9.5l6.6-.9z" />
      </svg>
    </button>
  )
}
