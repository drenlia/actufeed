# User Guide

This guide explains all features and options available in ACTUFEED.

## News Feed Page

### Header

- **Language Toggle**: Click the language badge (FR/EN) in the top right to switch the interface language
- **Settings Button**: Opens the Settings page to manage tabs, sources, and preferences
- **Tab Navigation**: 
  - Click a tab to switch between different news source configurations
  - Double-click a tab name to rename it

### Subheader Controls

The subheader contains filtering and control options. In the header, click the **filter icon** (three horizontal bars) to show or hide it: **accent color** when the subheader is visible, **muted gray** when it is hidden.

#### VIEW Section
- **All News**: Show all articles regardless of language
- **French**: Show only French-language articles
- **English**: Show only English-language articles

#### FILTER Section
- **Category Dropdown**: 
  - Click to open the category filter menu
  - Use the search bar inside to find specific categories
  - Select multiple categories to filter articles
  - Categories are displayed in multiple columns for easy browsing
- **Sort By**: 
  - **Date**: Sort articles by publication date (newest first)
  - **Popularity**: Sort articles by popularity score
- **Highly Rated**: Checkbox to show only articles with high popularity scores

#### REFRESH Section
- **Refresh Button**: Manually fetch the latest articles from all sources
- **Auto**: Checkbox to enable automatic refresh every 5 minutes

#### SEARCH Section
- **Search Bar**: Type keywords to search across article titles and descriptions
  - Search is case-insensitive
  - Click the × button to clear the search
- **Clear All Filters**: Reset all filters (language, categories, search, sort) to default

### News Articles

Each article card displays:
- **Thumbnail Image**: Article image if available
- **Title**: Opens the full article on that news source’s website in a new tab
- **Source**: News outlet name
- **Description**: Article preview; when **more…** is shown, click it to expand the full text when the feed provides it
- **Publication Date**: When the article was published
- **Language Badge**: FR or EN indicator
- **Popularity Rating**: Score based on social shares and engagement
- **Categories**: Topic tags (if available)

**New Articles**: Articles that haven't been seen before are highlighted with a yellow background.

**Fetch status alerts** (optional): 
- Small banners that can appear after articles are fetched (enable **Show fetch banners** in Settings)
- They show success or failure per source
- Drag a banner to the **right** to dismiss it; they also fade on their own after a few seconds

## Settings Page

Access the Settings page by clicking the **Settings** button in the top right of the News Feed page.

### Tab Management

When you have multiple tabs:
- **Create Tab**: Click the "+ Create Tab" button to add a new tab
- **Switch Tabs**: Click a tab name to make it active
- **Rename Tab**: Double-click a tab name to edit it inline
- **Delete Tab**: Click the × button on a tab (cannot delete the last tab)
- **Reorder Tabs**: Drag tabs to change their order

**Note**: News articles are locally cached. When you add or remove sources, you may need to refresh the page to see updated articles.

### Fetch messages toggle

- **Show fetch banners**: Turns the optional status banners on or off after sources are fetched
- The choice is saved automatically for next time

### Country Filter Sidebar

- **Search Countries**: Use the search box to find specific countries
- **Select Countries**: Click country pills to filter available sources by country
- **Clear Filters**: Button appears when countries are selected to remove all country filters
- Country pills show the number of available sources in parentheses

### Manual feed addition (RSS or Atom)

1. **Enter feed URL**: Paste an RSS 2.0 or Atom URL (many YouTube channels use Atom: `feeds/videos.xml?channel_id=…`)
2. **Validate Feed**: Click "Validate & Add Feed" to check if the feed is valid
3. **Edit Feed Title**: After validation, you can edit the feed title before adding
4. **Add Feed**: Click "Add Selected" to add the validated feed to your active sources

The validation shows:
- Feed validity status
- Feed title (editable)
- Feed description
- Detected language
- Number of items found

### Source Management

#### Available Sources (Left Column)
- **Search**: Use the search bar to find sources by outlet name, city, country, or province
- **Select Sources**: 
  - Check the boxes next to sources you want to add
  - Use "Select All" / "Deselect All" to manage selections
- **Add Selected**: Button appears when sources are selected, showing the count
- **Individual Toggle**: Click the + button on any source to add it immediately
- **Active Indicator**: Sources already in your active list show a ✓ badge

#### Active Sources (Right Column)
- **View All Active Sources**: See all sources currently configured for the active tab
- **Select Sources**: 
  - Check boxes to select multiple sources
  - Use "Select All" / "Deselect All" for bulk operations
- **Remove Selected**: Button appears when sources are selected, showing the count
- **Copy URL**: Click anywhere on an active source card to copy its URL to clipboard
- **Remove Source**: Click the × button on any source to remove it

### Backup and Restore

**Export** downloads a single backup file to your computer (usually your Downloads folder—your browser decides). **Import** reads that file back in. Typical reasons:
- Keep a copy before big changes
- Move your setup to another device or browser
- Recover if browser data is lost
- Share the same layout with someone else

#### Exporting Your Configuration

1. **Go to Settings**: Click the Settings button in the top right
2. **Scroll to Bottom**: Navigate to the "Import/Export" section at the bottom of the Settings page
3. **Click "Export Configuration"**: Your browser saves a file such as `newsfeed-backup-YYYY-MM-DD.json` on disk

**What Gets Exported:**
- All your custom tabs and their names
- All RSS feed sources configured for each tab
- Your active tab selection
- Category, language, date, and search filters for each tab
- Your settings preferences (selected countries, fetch-messages toggle, subheader collapsed state)

**Note**: Cached news articles are NOT exported (they will be re-fetched automatically when you restore).

#### Importing/Restoring Your Configuration

1. **Go to Settings**: Click the Settings button in the top right
2. **Scroll to Bottom**: Navigate to the "Import/Export" section
3. **Click "Import Configuration"**: This opens a file picker
4. **Select Your Backup File**: Choose the `newsfeed-backup-*.json` file you previously exported
5. **Wait for Confirmation**: You'll see a success message, and the page will automatically reload after 1 second

**What Gets Restored:**
- All tabs are recreated with their original names and sources
- Your active tab is restored
- All tab filters are restored
- Your settings preferences are restored

**Important Notes:**
- Importing will **replace** your current configuration. Make sure to export your current setup first if you want to keep it.
- The application supports both the new backup format (v1.0) and the old format (sources only) for backward compatibility.
- After importing, the page will reload to apply all changes.
- If you import a backup that has tabs with sources that no longer exist, those sources will still be restored but may not fetch articles if the RSS feed is unavailable.

## Tips and Best Practices

1. **Organize with Tabs**: Create separate tabs for different topics (e.g., "Local News", "Technology", "Sports")

2. **Use Country Filters**: When searching for sources, filter by country to find region-specific news outlets

3. **Category Filtering**: Use categories to focus on specific topics across all your sources

4. **Search Efficiently**: The search bar searches across titles and descriptions, so use specific keywords

5. **Auto-Refresh**: Enable auto-refresh to keep your feed updated automatically, or disable it to save bandwidth

6. **Fetch alerts**: Turn off **Show fetch banners** if banners annoy you, or leave them on to see whether each source loaded OK

7. **Cache Awareness**: Remember that articles are cached. After adding or removing sources, refresh the page to see changes

8. **Tab Management**: Use descriptive tab names and organize them by dragging to match your workflow

9. **Manual feeds**: You can add valid RSS or Atom feeds manually, even if they're not in the pre-configured list

10. **Source URLs**: Click on active sources in Settings to quickly copy their URLs for sharing or backup
