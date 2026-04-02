// Load city news outlets from JSON file
import cityNewsData from '../data/cityNewsOutlets.json'

// Legacy format for backward compatibility
export const CITY_NEWS_OUTLETS = {
  'Toronto': {
    'CA': [
      { name: 'CBC Toronto', url: 'https://www.cbc.ca/cmlink/rss-canada-toronto', language: 'en' },
      { name: 'CTV News Toronto', url: 'https://toronto.ctvnews.ca/rss/ctv-news-toronto-1.822293', language: 'en' },
      { name: 'Toronto Star', url: 'https://www.thestar.com/rss.articles.topstories.html', language: 'en' },
      { name: 'Toronto Sun', url: 'https://torontosun.com/feed', language: 'en' },
      { name: 'CP24', url: 'https://www.cp24.com/rss.ctvnews.1.822293', language: 'en' },
      { name: 'Global News Toronto', url: 'https://globalnews.ca/toronto/feed/', language: 'en' },
      { name: 'CityNews Toronto', url: 'https://toronto.citynews.ca/feed/', language: 'en' },
      { name: 'CBC News Toronto', url: 'https://www.cbc.ca/cmlink/rss-canada-toronto', language: 'en' },
    ]
  },
  'Montreal': {
    'CA': [
      { name: 'CBC Montreal', url: 'https://www.cbc.ca/webfeed/rss/rss-canada-montreal', language: 'en' },
      { name: 'Montreal Gazette', url: 'https://montrealgazette.com/feed', language: 'en' },
      { name: 'CTV News Montreal', url: 'https://montreal.ctvnews.ca/rss/ctv-montreal-news-1.822294', language: 'en' },
      { name: 'Radio-Canada En-bref', url: 'https://ici.radio-canada.ca/info/rss/info/en-bref', language: 'fr' },
      { name: 'La Presse', url: 'https://www.lapresse.ca/actualites/rss', language: 'fr' },
      { name: 'Le Devoir', url: 'https://www.ledevoir.com/rss/manchettes.xml', language: 'fr' },
      { name: 'Journal de Montréal', url: 'https://www.journaldemontreal.com/rss.xml', language: 'fr' },
    ]
  },
  'Vancouver': {
    'CA': [
      { name: 'CBC Vancouver', url: 'https://www.cbc.ca/cmlink/rss-canada-vancouver', language: 'en' },
      { name: 'CTV News Vancouver', url: 'https://bc.ctvnews.ca/rss/ctv-news-vancouver-1.822295', language: 'en' },
      { name: 'Vancouver Sun', url: 'https://vancouversun.com/feed', language: 'en' },
      { name: 'The Province', url: 'https://theprovince.com/feed', language: 'en' },
      { name: 'Global News BC', url: 'https://globalnews.ca/british-columbia/feed/', language: 'en' },
    ]
  },
  'Calgary': {
    'CA': [
      { name: 'CBC Calgary', url: 'https://www.cbc.ca/cmlink/rss-canada-calgary', language: 'en' },
      { name: 'CTV News Calgary', url: 'https://calgary.ctvnews.ca/rss/ctv-news-calgary-1.822296', language: 'en' },
      { name: 'Calgary Herald', url: 'https://calgaryherald.com/feed', language: 'en' },
      { name: 'Global News Calgary', url: 'https://globalnews.ca/calgary/feed/', language: 'en' },
    ]
  },
  'Ottawa': {
    'CA': [
      { name: 'CBC Ottawa', url: 'https://www.cbc.ca/cmlink/rss-canada-ottawa', language: 'en' },
      { name: 'CTV News Ottawa', url: 'https://ottawa.ctvnews.ca/rss/ctv-news-ottawa-1.822297', language: 'en' },
      { name: 'Ottawa Citizen', url: 'https://ottawacitizen.com/feed', language: 'en' },
      { name: 'Global News Ottawa', url: 'https://globalnews.ca/ottawa/feed/', language: 'en' },
    ]
  },
  'Edmonton': {
    'CA': [
      { name: 'CBC Edmonton', url: 'https://www.cbc.ca/cmlink/rss-canada-edmonton', language: 'en' },
      { name: 'CTV News Edmonton', url: 'https://edmonton.ctvnews.ca/rss/ctv-news-edmonton-1.822298', language: 'en' },
      { name: 'Edmonton Journal', url: 'https://edmontonjournal.com/feed', language: 'en' },
      { name: 'Global News Edmonton', url: 'https://globalnews.ca/edmonton/feed/', language: 'en' },
    ]
  },
  // US Cities
  'New York': {
    'US': [
      { name: 'New York Times', url: 'https://www.nytimes.com/svc/collections/v1/publish/https://www.nytimes.com/section/world/rss.xml', language: 'en' },
      { name: 'NY Daily News', url: 'https://www.nydailynews.com/arc/outboundfeeds/rss/', language: 'en' },
      { name: 'NY Post', url: 'https://nypost.com/feed/', language: 'en' },
      { name: 'CNN New York', url: 'https://www.cnn.com/rss/edition.rss', language: 'en' },
    ]
  },
  'Los Angeles': {
    'US': [
      { name: 'Los Angeles Times', url: 'https://www.latimes.com/rss2.0.xml', language: 'en' },
      { name: 'LA Daily News', url: 'https://www.dailynews.com/feed/', language: 'en' },
      { name: 'KTLA', url: 'https://ktla.com/feed/', language: 'en' },
    ]
  },
  'Chicago': {
    'US': [
      { name: 'Chicago Tribune', url: 'https://www.chicagotribune.com/arc/outboundfeeds/rss/', language: 'en' },
      { name: 'Chicago Sun-Times', url: 'https://chicago.suntimes.com/feed/', language: 'en' },
    ]
  },
}

// Get known news outlets for a city from JSON file (city-specific only)
export const getKnownOutletsForCity = (cityName, countryCode) => {
  if (!cityName || cityName.trim() === '') {
    // No city specified - return empty (use getNationalFeedsForCountry instead)
    return []
  }
  
  const normalizedCityName = cityName.split(',')[0].trim() // Remove state/province if present
  
  // Try to find city in JSON data
  const cityData = cityNewsData.cities[normalizedCityName]
  if (cityData && cityData.country === countryCode) {
    // Convert JSON format to expected format
    return cityData.outlets.map(outlet => ({
      name: outlet.name,
      url: outlet.url,
      language: outlet.language || 'en'
    }))
  }
  
  // Fallback to legacy format if needed
  const outlets = CITY_NEWS_OUTLETS[normalizedCityName]
  if (outlets && outlets[countryCode]) {
    return outlets[countryCode]
  }
  
  return []
}

// Get national/international feeds for a country (feeds with country name as key)
export const getNationalFeedsForCountry = (countryCode) => {
  const outlets = []
  
  // Map of country codes to possible country name keys in the database
  const countryNameMap = {
    'CA': ['Canada'],
    'US': ['United States'],
    'AU': ['Australia'],
    'GB': ['United Kingdom'],
    'FR': ['France'],
    'DE': ['Germany'],
    'IT': ['Italy'],
    'ES': ['Spain'],
    'JP': ['Japan'],
    'IN': ['India'],
    'BR': ['Brazil'],
    'MX': ['Mexico'],
    'RU': ['Russia'],
    'CN': ['China'],
    'BD': ['Bangladesh'],
    'ID': ['Indonesia'],
    'IR': ['Iran'],
    'IE': ['Ireland'],
    'MM': ['Myanmar (Burma)'],
    'NG': ['Nigeria'],
    'PK': ['Pakistan'],
    'PH': ['Philippines'],
    'PL': ['Poland'],
    'ZA': ['South Africa'],
    'UA': ['Ukraine'],
    'HK': ['Hong Kong SAR China'],
  }
  
  const possibleCountryKeys = countryNameMap[countryCode] || []
  
  // Find entries that match country name exactly
  Object.entries(cityNewsData.cities).forEach(([key, data]) => {
    if (data.country === countryCode) {
      // Check if key exactly matches a country name
      const isCountryLevel = possibleCountryKeys.some(countryName => 
        key === countryName
      )
      
      // Only include country-level entries (not cities)
      if (isCountryLevel) {
        data.outlets.forEach(outlet => {
          outlets.push({
            name: outlet.name,
            url: outlet.url,
            language: outlet.language || 'en'
          })
        })
      }
    }
  })
  
  return outlets
}

// Get all available cities/regions from the database
export const getAllAvailableCities = () => {
  return Object.keys(cityNewsData.cities).sort()
}

// Get all feeds for a specific city/region key
export const getFeedsByCityKey = (cityKey) => {
  const cityData = cityNewsData.cities[cityKey]
  if (cityData) {
    return cityData.outlets.map(outlet => ({
      name: outlet.name,
      url: outlet.url,
      language: outlet.language || 'en',
      type: outlet.type || 'online'
    }))
  }
  return []
}

// Try to find news outlets via Wikipedia
export const findNewsOutletsViaWikipedia = async (cityName, countryCode) => {
  try {
    // Search Wikipedia for city page
    const searchUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cityName)}`
    
    const response = await fetch(searchUrl)
    if (!response.ok) return []
    
    const data = await response.json()
    const extract = data.extract || ''
    
    // Look for common news outlet patterns in the extract
    const newsPatterns = [
      /([A-Z][a-z]+ (?:Times|Sun|Star|Herald|Journal|Post|Gazette|News|Tribune))/gi,
      /(CBC|CTV|Global News|CNN|BBC|Reuters)/gi,
    ]
    
    const foundOutlets = []
    newsPatterns.forEach(pattern => {
      const matches = extract.match(pattern)
      if (matches) {
        matches.forEach(match => {
          if (!foundOutlets.includes(match)) {
            foundOutlets.push(match)
          }
        })
      }
    })
    
    return foundOutlets
  } catch (error) {
    console.debug('Wikipedia search failed:', error)
    return []
  }
}
