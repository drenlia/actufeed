// Utilities for managing tabs configuration
import {
  MONTREAL_DEFAULT_SOURCES,
  CANADA_DEFAULT_SOURCES,
  TECH_DEFAULT_SOURCES,
  sourceToWebCatalogShape,
} from '../constants/defaultSources.js'

const TABS_KEY = 'newsfeed-tabs'
const ACTIVE_TAB_KEY = 'newsfeed-active-tab'
const TAB_FILTERS_KEY = 'newsfeed-tab-filters'

function newTabId() {
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/** Same three tabs + sources as a fresh install of the native app. */
function createFreshDefaultTabs() {
  return [
    {
      id: newTabId(),
      name: 'Montreal',
      sources: MONTREAL_DEFAULT_SOURCES.map(sourceToWebCatalogShape),
    },
    {
      id: newTabId(),
      name: 'Canada',
      sources: CANADA_DEFAULT_SOURCES.map(sourceToWebCatalogShape),
    },
    {
      id: newTabId(),
      name: 'Tech',
      sources: TECH_DEFAULT_SOURCES.map(sourceToWebCatalogShape),
    },
  ]
}

/**
 * Match or create a tab by display name (accent-insensitive) and set its sources.
 * @returns {{ nextTabs: object[], targetTabId: string, created: boolean }}
 */
export function upsertDefaultTab(tabs, displayName, sources) {
  const norm = (s) =>
    String(s)
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
  const n = norm(displayName)
  const existing = tabs.find((t) => norm(t.name) === n)
  if (existing) {
    return {
      nextTabs: tabs.map((t) => (t.id === existing.id ? { ...t, sources: [...sources] } : t)),
      targetTabId: existing.id,
      created: false,
    }
  }
  const newTab = {
    id: newTabId(),
    name: displayName,
    sources: [...sources],
  }
  return { nextTabs: [...tabs, newTab], targetTabId: newTab.id, created: true }
}

// Legacy empty tab (fallback only)
export const createDefaultTab = () => ({
  id: newTabId(),
  name: 'Montreal',
  sources: [],
})

// Load tabs from localStorage
export const loadTabs = () => {
  let tabs = []
  let needsSave = false
  
  try {
    const stored = localStorage.getItem(TABS_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (parsed && Array.isArray(parsed) && parsed.length > 0) {
        tabs = parsed.map((tab) => {
          if (tab && tab.name === 'Default') {
            needsSave = true
            return { ...tab, name: 'Montreal' }
          }
          return tab
        })
      }
    }
  } catch (error) {
    console.warn('Failed to load tabs from localStorage:', error)
  }
  
  const montrealDefaults = MONTREAL_DEFAULT_SOURCES.map(sourceToWebCatalogShape)

  // If no tabs exist, create Montreal + Canada + Tech (same as native app)
  if (tabs.length === 0) {
    tabs = createFreshDefaultTabs()
    needsSave = true
  } else {
    // Only inject Montréal defaults if:
    // 1. There's only one tab (legacy starter)
    // 2. That tab is named Montreal / Default / Montréal or has no name
    // 3. That tab has no sources
    if (tabs.length === 1) {
      const defaultTab = tabs[0]
      const isDefaultTab =
        defaultTab.name === 'Montreal' ||
        defaultTab.name === 'Montréal' ||
        defaultTab.name === 'Default' ||
        !defaultTab.name
      const hasNoSources =
        !defaultTab.sources || !Array.isArray(defaultTab.sources) || defaultTab.sources.length === 0

      if (isDefaultTab && hasNoSources) {
        needsSave = true
        tabs[0] = {
          ...defaultTab,
          sources: [...montrealDefaults],
        }
      }
    }
  }
  
  // Save tabs if we made any changes
  if (needsSave) {
    const saved = saveTabs(tabs)
    if (saved) {
    }
  }
  
  // Return tabs (with default sources injected if needed)
  return tabs.length > 0 ? tabs : [createDefaultTab()]
}

// Save tabs to localStorage
export const saveTabs = (tabs) => {
  try {
    localStorage.setItem(TABS_KEY, JSON.stringify(tabs))
    return true
  } catch (error) {
    console.error('Failed to save tabs to localStorage:', error)
    return false
  }
}

// Get active tab ID (optionally validate against tabs array)
export const getActiveTabId = (tabs = null) => {
  try {
    const stored = localStorage.getItem(ACTIVE_TAB_KEY)
    if (stored) {
      // If tabs array provided, validate the stored ID exists
      if (tabs && Array.isArray(tabs)) {
        if (tabs.find(t => t.id === stored)) {
          return stored
        }
        // Stored ID doesn't exist in tabs, return null
        return null
      }
      return stored
    }
  } catch (error) {
    console.warn('Failed to load active tab from localStorage:', error)
  }
  return null
}

// Set active tab ID
export const setActiveTabId = (tabId) => {
  try {
    localStorage.setItem(ACTIVE_TAB_KEY, tabId)
    return true
  } catch (error) {
    console.error('Failed to save active tab to localStorage:', error)
    return false
  }
}

/** Next tab in order; after the last tab, wraps to the first. */
export function getNextTabIdCyclicFromTabs(tabs, activeTabId) {
  if (!tabs || tabs.length === 0) return null
  const idx = tabs.findIndex((t) => t.id === activeTabId)
  const i = idx >= 0 ? idx : 0
  return tabs[(i + 1) % tabs.length].id
}

/** Uses stored tabs and active id (for keyboard handlers). */
export function getNextTabIdCyclic() {
  const tabs = loadTabs()
  if (!tabs.length) return null
  const currentId = getActiveTabId(tabs) || tabs[0].id
  return getNextTabIdCyclicFromTabs(tabs, currentId)
}

// Get filters for a specific tab
export const getTabFilters = (tabId) => {
  try {
    const stored = localStorage.getItem(TAB_FILTERS_KEY)
    if (stored) {
      const filters = JSON.parse(stored)
      return filters[tabId] || null
    }
  } catch (error) {
    console.warn('Failed to load tab filters from localStorage:', error)
  }
  return null
}

// Save filters for a specific tab
export const saveTabFilters = (tabId, filters) => {
  try {
    const stored = localStorage.getItem(TAB_FILTERS_KEY)
    const allFilters = stored ? JSON.parse(stored) : {}
    allFilters[tabId] = filters
    localStorage.setItem(TAB_FILTERS_KEY, JSON.stringify(allFilters))
    return true
  } catch (error) {
    console.error('Failed to save tab filters to localStorage:', error)
    return false
  }
}

// Create a new tab with a default name
export const createNewTab = (existingTabs) => {
  const tabNumber = existingTabs.length + 1
  return {
    id: `tab-${Date.now()}`,
    name: `Tab ${tabNumber}`,
    sources: []
  }
}

// Delete a tab (ensures at least one remains)
export const deleteTab = (tabs, tabId) => {
  if (tabs.length <= 1) {
    return tabs // Can't delete the last tab
  }
  return tabs.filter(tab => tab.id !== tabId)
}

// Update tab name
export const updateTabName = (tabs, tabId, newName) => {
  return tabs.map(tab => 
    tab.id === tabId ? { ...tab, name: newName.trim() || tab.name } : tab
  )
}

// Update tab sources
export const updateTabSources = (tabs, tabId, sources) => {
  return tabs.map(tab => 
    tab.id === tabId ? { ...tab, sources } : tab
  )
}

// Reorder tabs
export const reorderTabs = (tabs, fromIndex, toIndex) => {
  const newTabs = [...tabs]
  const [removed] = newTabs.splice(fromIndex, 1)
  newTabs.splice(toIndex, 0, removed)
  return newTabs
}
