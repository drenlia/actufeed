// Utilities for extracting location information from sources
import { loadNewsConfig } from './newsConfigUtils'

// Country code to country name mapping
const COUNTRY_NAMES = {
  'CA': 'Canada',
  'US': 'United States',
  'AU': 'Australia',
  'GB': 'United Kingdom',
  'FR': 'France',
  'DE': 'Germany',
  'IT': 'Italy',
  'ES': 'Spain',
  'JP': 'Japan',
  'IN': 'India',
  'BR': 'Brazil',
  'MX': 'Mexico',
  'RU': 'Russia',
  'CN': 'China',
  'BD': 'Bangladesh',
  'ID': 'Indonesia',
  'IR': 'Iran',
  'IE': 'Ireland',
  'MM': 'Myanmar',
  'NG': 'Nigeria',
  'PK': 'Pakistan',
  'PH': 'Philippines',
  'PL': 'Poland',
  'ZA': 'South Africa',
  'UA': 'Ukraine',
  'HK': 'Hong Kong',
}

// Get location metadata for a news item based on its source
export const getLocationMetadata = (item) => {
  const config = loadNewsConfig()
  const source = config.sources.find(s => s.name === item.source)
  
  if (!source) {
    return {
      outlet: item.source || '',
      city: item.region || '',
      province: '',
      country: ''
    }
  }
  
  // Extract country from source URL or region
  let country = ''
  let province = ''
  let city = item.region || source.region || ''
  
  // Try to determine country from source URL
  const url = source.url || ''
  if (url.includes('.ca/') || url.includes('cbc.ca') || url.includes('ctvnews.ca')) {
    country = 'Canada'
  } else if (url.includes('.com/') || url.includes('.org/')) {
    // Could be US or other, try to determine from region or URL patterns
    if (url.includes('nytimes.com') || url.includes('cnn.com') || url.includes('washingtonpost.com')) {
      country = 'United States'
    } else if (source.region) {
      // Check if region contains state abbreviations (US)
      const usStates = ['CA', 'NY', 'TX', 'FL', 'IL', 'PA', 'OH', 'GA', 'NC', 'MI', 'WA', 'MA']
      if (usStates.some(state => source.region.includes(state))) {
        country = 'United States'
      }
    }
  } else if (url.includes('.fr/') || url.includes('lemonde.fr') || url.includes('lapresse.ca')) {
    country = 'France'
  } else if (url.includes('.co.uk/') || url.includes('.uk/') || url.includes('bbc.com')) {
    country = 'United Kingdom'
  } else if (url.includes('.au/') || url.includes('abc.net.au')) {
    country = 'Australia'
  }
  
  // Try to extract province/state from region
  if (source.region) {
    const regionParts = source.region.split(',')
    if (regionParts.length > 1) {
      // Second part is usually province/state
      province = regionParts[1].trim()
      // Third part might be country
      if (regionParts.length > 2 && !country) {
        country = regionParts[2].trim()
      }
    }
    
    // Extract city name (first part before comma)
    if (regionParts.length > 0) {
      city = regionParts[0].trim()
    }
  }
  
  // If we still don't have country, try to infer from city names
  if (!country) {
    const canadianCities = ['Toronto', 'Montreal', 'Vancouver', 'Ottawa', 'Calgary', 'Edmonton']
    const usCities = ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia']
    if (canadianCities.some(c => city.includes(c))) {
      country = 'Canada'
    } else if (usCities.some(c => city.includes(c))) {
      country = 'United States'
    }
  }
  
  return {
    outlet: item.source || '',
    city: city,
    province: province,
    country: country
  }
}

// Get all searchable text for an article including location metadata
export const getSearchableText = (item) => {
  const location = getLocationMetadata(item)
  
  // Combine all searchable fields
  const searchableParts = [
    item.title || '',
    item.description || '',
    item.descriptionFull || '',
    item.content || '',
    item.source || '', // Outlet
    item.region || '', // City
    location.city,
    location.province,
    location.country,
    (item.categories || []).join(' '),
    item.author || ''
  ]
  
  return searchableParts
    .filter(part => part && part.trim())
    .join(' ')
    .toLowerCase()
}
