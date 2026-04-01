// Utilities for managing tabs configuration
import { loadNewsConfig } from './newsConfigUtils.js'

const TABS_KEY = 'newsfeed-tabs'
const ACTIVE_TAB_KEY = 'newsfeed-active-tab'
const TAB_FILTERS_KEY = 'newsfeed-tab-filters'

// Default tab structure (Montreal preset sources in news.json)
export const createDefaultTab = () => ({
  id: `tab-${Date.now()}`,
  name: 'Montreal',
  sources: []
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
  
  // Get default sources from news.json
  let defaultSources = []
  try {
    const defaultConfig = loadNewsConfig()
    if (defaultConfig && defaultConfig.sources && defaultConfig.sources.length > 0) {
      defaultSources = defaultConfig.sources
    }
  } catch (error) {
    console.warn('Failed to load default sources:', error)
  }
  
  // If no tabs exist, create default tab with default sources
  if (tabs.length === 0) {
    if (defaultSources.length > 0) {
      const defaultTab = createDefaultTab()
      defaultTab.sources = defaultSources
      tabs = [defaultTab]
      needsSave = true
    } else {
      tabs = [createDefaultTab()]
    }
  } else {
    // Only inject default sources if:
    // 1. There's only one tab (the starter Montreal tab)
    // 2. That tab is named Montreal (legacy: Default, migrated above) or has no name
    // 3. That tab has no sources
    // This allows users to have empty tabs when there are multiple tabs
    if (tabs.length === 1) {
      const defaultTab = tabs[0]
      const isDefaultTab =
        defaultTab.name === 'Montreal' || defaultTab.name === 'Default' || !defaultTab.name
      const hasNoSources = !defaultTab.sources || 
                          !Array.isArray(defaultTab.sources) || 
                          defaultTab.sources.length === 0
      
      if (isDefaultTab && hasNoSources && defaultSources.length > 0) {
        // Inject default sources into the default tab only
        needsSave = true
        tabs[0] = {
          ...defaultTab,
          sources: [...defaultSources] // Create a copy to avoid reference issues
        }
      }
    }
    // If there are multiple tabs, don't auto-fill any of them
    // Users can manage their tabs independently
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
