import type { TabKey } from '../components/NavTabs'

export type HomeOrderFilter = 'all' | 'pending' | 'dispatched' | 'returned' | 'expiring'
export type HomeInventoryFilter = 'all' | 'idle' | 'renting'

export type HomeNavigationTarget =
  | { tab: 'orders'; filter?: HomeOrderFilter; date?: string }
  | { tab: 'inventory'; filter?: HomeInventoryFilter }
  | { tab: TabKey }
