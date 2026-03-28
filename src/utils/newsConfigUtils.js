// Utilities for managing news configuration (stored in localStorage)
import newsSourcesDefault from '../news.json'
import { loadTabs, getActiveTabId, getTabFilters, saveTabs, setActiveTabId, saveTabFilters } from './tabsStorage'
import { loadSettingsPreferences, saveSettingsPreferences } from './settingsStorage'

const CONFIG_KEY = 'newsfeed-config'

// Load configuration from localStorage or return default
export const loadNewsConfig = () => {
  try {
    const stored = localStorage.getItem(CONFIG_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      // Validate structure
      if (parsed && parsed.sources && Array.isArray(parsed.sources)) {
        return parsed
      }
    }
  } catch (error) {
    console.warn('Failed to load news config from localStorage:', error)
  }
  
  // Return default from news.json
  return newsSourcesDefault
}

// Save configuration to localStorage
export const saveNewsConfig = (config) => {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
    return true
  } catch (error) {
    console.error('Failed to save news config to localStorage:', error)
    return false
  }
}

// Get unique cities from sources
export const getCitiesFromSources = (sources) => {
  const cities = new Set()
  sources.forEach(source => {
    if (source.region) {
      cities.add(source.region)
    }
  })
  return Array.from(cities).sort()
}

// Get sources for a specific city
export const getSourcesForCity = (sources, cityName) => {
  return sources.filter(source => 
    source.region && source.region.toLowerCase() === cityName.toLowerCase()
  )
}

// Remove sources for a city
export const removeSourcesForCity = (sources, cityName) => {
  return sources.filter(source => 
    !source.region || source.region.toLowerCase() !== cityName.toLowerCase()
  )
}

// Add sources for a city
export const addSourcesForCity = (sources, newSources) => {
  // Remove duplicates based on URL
  const existingUrls = new Set(sources.map(s => s.url))
  const uniqueNewSources = newSources.filter(s => !existingUrls.has(s.url))
  
  return [...sources, ...uniqueNewSources]
}

// Export full user configuration including tabs, settings, and sources
export const exportConfig = (config) => {
  // Collect all user data
  const tabs = loadTabs()
  const activeTabId = getActiveTabId(tabs)
  
  // Get filters for all tabs
  const tabFilters = {}
  tabs.forEach(tab => {
    const filters = getTabFilters(tab.id)
    if (filters) {
      tabFilters[tab.id] = filters
    }
  })
  
  const settingsPreferences = loadSettingsPreferences()
  
  // Create comprehensive export object
  const exportData = {
    version: '1.0',
    exportDate: new Date().toISOString(),
    sources: config.sources || [],
    tabs: tabs,
    activeTabId: activeTabId,
    tabFilters: tabFilters,
    settings: {
      selectedCountries: settingsPreferences.selectedCountries instanceof Set 
        ? Array.from(settingsPreferences.selectedCountries)
        : settingsPreferences.selectedCountries || [],
      subheaderCollapsed:
        typeof settingsPreferences.subheaderCollapsed === 'boolean'
          ? settingsPreferences.subheaderCollapsed
          : true,
      showToastMessages: settingsPreferences.showToastMessages !== undefined 
        ? settingsPreferences.showToastMessages 
        : false,
      mobileHeaderCompactToolbar:
        typeof settingsPreferences.mobileHeaderCompactToolbar === 'boolean'
          ? settingsPreferences.mobileHeaderCompactToolbar
          : true,
    }
  }
  
  const dataStr = JSON.stringify(exportData, null, 2)
  const dataBlob = new Blob([dataStr], { type: 'application/json' })
  const url = URL.createObjectURL(dataBlob)
  const link = document.createElement('a')
  link.href = url
  link.download = `newsfeed-backup-${new Date().toISOString().split('T')[0]}.json`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// Import configuration from JSON file (supports both old and new format)
export const importConfig = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result)
        
        // Check if it's the new comprehensive format (has version field)
        if (data.version && data.version === '1.0') {
          // New format: restore everything
          
          // 1. Restore sources config
          if (data.sources && Array.isArray(data.sources)) {
            saveNewsConfig({ sources: data.sources })
          }
          
          // 2. Restore tabs
          if (data.tabs && Array.isArray(data.tabs) && data.tabs.length > 0) {
            saveTabs(data.tabs)
          }
          
          // 3. Restore active tab
          if (data.activeTabId) {
            setActiveTabId(data.activeTabId)
          }
          
          // 4. Restore tab filters
          if (data.tabFilters && typeof data.tabFilters === 'object') {
            Object.keys(data.tabFilters).forEach(tabId => {
              saveTabFilters(tabId, data.tabFilters[tabId])
            })
          }
          
          // 5. Restore settings preferences
          if (data.settings) {
            const preferences = {
              selectedCountries: data.settings.selectedCountries 
                ? new Set(data.settings.selectedCountries)
                : new Set(),
              subheaderCollapsed:
                typeof data.settings.subheaderCollapsed === 'boolean'
                  ? data.settings.subheaderCollapsed
                  : true,
              showToastMessages: data.settings.showToastMessages !== undefined 
                ? data.settings.showToastMessages 
                : false,
              mobileHeaderCompactToolbar:
                typeof data.settings.mobileHeaderCompactToolbar === 'boolean'
                  ? data.settings.mobileHeaderCompactToolbar
                  : true,
            }
            saveSettingsPreferences(preferences)
          }
          
          // Return the sources config for compatibility with existing code
          resolve({ sources: data.sources || [] })
        } else if (data && data.sources && Array.isArray(data.sources)) {
          // Old format: just sources (backward compatibility)
          resolve(data)
        } else {
          reject(new Error('Invalid configuration format'))
        }
      } catch (error) {
        reject(error)
      }
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsText(file)
  })
}
