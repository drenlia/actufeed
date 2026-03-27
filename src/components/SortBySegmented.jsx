import { useId } from 'react'
import { translations } from '../constants/translations'

export function SortBySegmented({ sortBy, onSortChange, uiLanguage }) {
  const t = translations[uiLanguage]
  const labelId = useId()

  return (
    <div className="sort-by-field">
      <span className="sort-by-field__label" id={labelId}>
        {t.sortBy}
      </span>
      <div className="sort-segmented" role="radiogroup" aria-labelledby={labelId}>
        <button
          type="button"
          role="radio"
          aria-checked={sortBy === 'date'}
          className={`sort-segmented__btn${sortBy === 'date' ? ' is-active' : ''}`}
          onClick={() => onSortChange('date')}
        >
          {t.sortDate}
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={sortBy === 'popularity'}
          className={`sort-segmented__btn${sortBy === 'popularity' ? ' is-active' : ''}`}
          onClick={() => onSortChange('popularity')}
        >
          {t.sortPopularity}
        </button>
      </div>
    </div>
  )
}
