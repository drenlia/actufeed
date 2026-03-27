export function HighlyRatedToggle({ active, onToggle, label }) {
  return (
    <button
      type="button"
      className={`highly-rated-toggle${active ? ' is-active' : ''}`}
      aria-pressed={active}
      aria-label={label}
      title={label}
      onClick={onToggle}
    >
      <svg className="highly-rated-toggle__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 2.5l2.36 5.52.34.8.87.13 5.97.87-4.32 4.21-.63.61.15.86 1.02 5.95-5.34-2.81-.76-.4-.76.4-5.34 2.81 1.02-5.95.15-.86-.63-.61-4.32-4.21 5.97-.87.87-.13.34-.8L12 2.5z"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinejoin="round"
          className="highly-rated-toggle__star-path"
        />
      </svg>
    </button>
  )
}
