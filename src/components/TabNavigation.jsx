import { TabBar } from './TabBar'

/** Main feed tab strip — same chrome as Settings; hidden when only one tab. */
export const TabNavigation = ({
  tabs,
  activeTabId,
  onTabClick,
  onTabRename,
  activeTabArticleCount,
  activeTabCountAriaLabel,
  tabCountsById,
}) => (
  <TabBar
    tabs={tabs}
    activeTabId={activeTabId}
    onTabClick={onTabClick}
    onTabRename={onTabRename}
    alwaysShow={false}
    activeTabArticleCount={activeTabArticleCount}
    activeTabCountAriaLabel={activeTabCountAriaLabel}
    tabCountsById={tabCountsById}
  />
)
