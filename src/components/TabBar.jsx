import { useState, useRef, useEffect, useCallback } from 'react'
import { setActiveTabId } from '../utils/tabsStorage'

/** 1×1 transparent GIF — use as drag image so the browser does not show a “ghost” snapping back. */
const EMPTY_DRAG_IMAGE = (() => {
  if (typeof Image === 'undefined') return null
  const img = new Image()
  img.src =
    'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
  return img
})()

/**
 * Shared tab strip: same look/position as the main feed (`tab-navigation`).
 * Feed mode: simple pills, hide when only one tab.
 * Settings mode: optional reorder (DnD), delete, create, always visible (including single tab).
 */
export const TabBar = ({
  tabs = [],
  activeTabId,
  onTabClick,
  onTabRename,
  alwaysShow = false,
  allowDelete = false,
  onTabDelete,
  allowReorder = false,
  onReorder,
  showCreateButton = false,
  onCreateTab,
  createTabLabel = '+',
  tabsListAriaLabel = 'Tabs',
  deleteTabTitle = 'Delete tab',
}) => {
  const [editingTabId, setEditingTabId] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [draggedTabIndex, setDraggedTabIndex] = useState(null)
  const inputRef = useRef(null)

  const extended = allowDelete || allowReorder

  if (!tabs?.length) {
    return null
  }

  if (!alwaysShow && tabs.length <= 1) {
    return null
  }

  const handleTabActivate = (tabId) => {
    if (editingTabId === tabId) return
    setActiveTabId(tabId)
    onTabClick?.(tabId)
  }

  const handleDoubleClick = (tabId, tabName, e) => {
    e.preventDefault()
    e.stopPropagation()
    setEditingTabId(tabId)
    setEditValue(tabName)
  }

  const handleSave = useCallback(
    (tabId, valueToSave = null) => {
      const value = valueToSave !== null ? valueToSave : editValue
      const trimmedValue = value.trim()
      const tab = tabs.find((t) => t.id === tabId)
      if (trimmedValue && trimmedValue !== tab?.name) {
        onTabRename?.(tabId, trimmedValue)
      }
      setEditingTabId(null)
      setEditValue('')
    },
    [editValue, tabs, onTabRename]
  )

  const handleCancel = () => {
    setEditingTabId(null)
    setEditValue('')
  }

  const handleKeyDown = (e, tabId) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSave(tabId)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      handleCancel()
    }
  }

  useEffect(() => {
    if (editingTabId && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingTabId])

  useEffect(() => {
    if (!editingTabId) return

    const handleClickOutside = (e) => {
      if (inputRef.current && !inputRef.current.contains(e.target)) {
        handleSave(editingTabId, inputRef.current.value)
      }
    }

    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 0)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [editingTabId, handleSave])

  const handleDragStart = (e, index) => {
    if (!allowReorder || tabs.length <= 1) return
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', tabs[index]?.id ?? String(index))
    if (EMPTY_DRAG_IMAGE) {
      try {
        e.dataTransfer.setDragImage(EMPTY_DRAG_IMAGE, 0, 0)
      } catch {
        /* setDragImage unsupported or failed */
      }
    }
    setDraggedTabIndex(index)
  }

  const handleDragOver = (e, index) => {
    if (!allowReorder || draggedTabIndex === null || draggedTabIndex === index) return
    e.preventDefault()
    onReorder?.(draggedTabIndex, index)
    setDraggedTabIndex(index)
  }

  const handleDragEnd = () => {
    setDraggedTabIndex(null)
  }

  const renderTab = (tab, index) => {
    const isActive = activeTabId === tab.id
    const isEditing = editingTabId === tab.id
    const canDrag = allowReorder && tabs.length > 1
    const showClose = allowDelete && tabs.length > 1

    if (!extended) {
      if (isEditing) {
        return (
          <input
            key={tab.id}
            ref={inputRef}
            type="text"
            className="tab-nav-item tab-nav-item-editing"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, tab.id)}
            onBlur={() => {
              if (inputRef.current) {
                handleSave(tab.id, inputRef.current.value)
              }
            }}
            onClick={(e) => e.stopPropagation()}
          />
        )
      }
      return (
        <button
          key={tab.id}
          type="button"
          className={`tab-nav-item ${isActive ? 'active' : ''}`}
          onClick={() => handleTabActivate(tab.id)}
          onDoubleClick={(e) => handleDoubleClick(tab.id, tab.name, e)}
        >
          {tab.name}
        </button>
      )
    }

    if (isEditing) {
      return (
        <div key={tab.id} className="tab-nav-item-group tab-nav-item-group--editing">
          <input
            ref={inputRef}
            type="text"
            className="tab-nav-item tab-nav-item-editing tab-nav-item-editing--inline"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, tab.id)}
            onBlur={() => {
              if (inputRef.current) {
                handleSave(tab.id, inputRef.current.value)
              }
            }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )
    }

    return (
      <div
        key={tab.id}
        className={`tab-nav-item-group ${isActive ? 'active' : ''} ${draggedTabIndex === index ? 'dragging' : ''}`}
        draggable={canDrag}
        onDragStart={(e) => handleDragStart(e, index)}
        onDragOver={(e) => handleDragOver(e, index)}
        onDragEnd={handleDragEnd}
        role="presentation"
      >
        <button
          type="button"
          className="tab-nav-item tab-nav-item--segment"
          onClick={() => handleTabActivate(tab.id)}
          onDoubleClick={(e) => handleDoubleClick(tab.id, tab.name, e)}
        >
          {tab.name}
        </button>
        {showClose && (
          <button
            type="button"
            className="tab-nav-item-close"
            onClick={(e) => {
              e.stopPropagation()
              onTabDelete?.(tab.id)
            }}
            title={deleteTabTitle}
            aria-label={deleteTabTitle}
          >
            ×
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="tab-navigation">
      <div className="tab-nav-container" role="tablist" aria-label={tabsListAriaLabel}>
        {tabs.map((tab, index) => renderTab(tab, index))}
        {showCreateButton && onCreateTab && (
          <button type="button" className="tab-nav-add-btn" onClick={onCreateTab}>
            + {createTabLabel}
          </button>
        )}
      </div>
    </div>
  )
}
