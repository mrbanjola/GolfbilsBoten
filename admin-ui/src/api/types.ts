export interface Location {
  value: string;
  label: string;
}

export interface PortfolioCategory {
  value: string;
  label: string;
}

export interface Constants {
  locations: Location[];
  portfolioCategories: PortfolioCategory[];
}

export interface Watch {
  id: number;
  query: string;
  max_price: number | null;
  min_price: number | null;
  location: string | null;
  ad_type: string | null;
  platforms: string | null;
  is_car: number;
  exclude_words: string | null;
  category: string | null;
  paused: number;
}

export interface AiSettings {
  enabled: boolean;
  model: string;
  batch_size: number;
  timeout_ms: number;
  system_prompt: string;
  global_rules: string;
  bot_analysis_prompt: string;
}

export interface FacebookStatus {
  hasSession: boolean;
  savedAt: string | null;
}

export interface Tag {
  data_name: string;
  label: string;
  type: 'condition' | 'detail';
  guidelines?: string | null;
}

export interface StatsData {
  total: number;
  today: number;
  perPlatform: { platform: string; count: number }[];
  perDay: { day: string; count: number }[];
  perWatch: { query: string; count: number }[];
  recent: RecentItem[];
}

export interface RecentItem {
  id: string;
  platform: string;
  title: string;
  price: number | null;
  url: string;
  image_url: string | null;
  first_seen_at: string;
  watch_query: string | null;
  condition: string | null;
  tags: string | null;
  claude_verdict: 'ja' | 'nej' | 'kanske' | null;
  claude_analysis: string | null;
}

export interface Cost {
  description: string;
  amount: number;
}

export interface PortfolioItem {
  id: number;
  listing_id: string;
  platform: string;
  title: string;
  url: string | null;
  purchase_price: number;
  sold_price: number | null;
  purchased_at: string | null;
  sold_at: string | null;
  watch_query: string | null;
  image_url: string | null;
  notes: string | null;
  category: string | null;
  condition: string | null;
  tags: string[] | null;
  costs: Cost[];
  bundle_id: number | null;
}

export interface Bundle {
  id: number;
  name: string;
  sold_price: number | null;
  sold_at: string | null;
  items: PortfolioItem[];
}

export interface AnalyticsData {
  byCategory: CategoryAnalytics[];
  byTag: TagAnalytics[];
}

export interface CategoryAnalytics {
  category: string | null;
  items: number;
  sold: number;
  invested_sold: number;
  revenue: number;
  avg_days: number | null;
}

export interface TagAnalytics {
  label: string;
  items: number;
  sold: number;
  invested_sold: number;
  revenue: number;
}

export interface PrefetchResult {
  platform: string | null;
  title: string | null;
  imageUrl: string | null;
}

export interface AnalyzeResponse {
  analysis: string;
}

export type AuctionReviewState = 'unreviewed' | 'interesting' | 'ignored';
export type AuctionStatus = 'active' | 'ended' | 'unknown';

export interface AuctionItem {
  platform: string;
  external_id: string;
  title: string;
  subtitle: string | null;
  current_price: number | null;
  currency: string;
  bid_count: number;
  auction_end: string | null;
  location: string | null;
  url: string;
  image_url: string | null;
  no_reserve: number;
  reserve_met: number;
  auction_status: AuctionStatus;
  review_state: AuctionReviewState;
  first_seen_at: string;
  last_seen_at: string;
  categories: string[];
  watch_queries: string[];
}

export interface AuctionListResponse {
  items: AuctionItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface AuctionSummary {
  active: number;
  interesting: number;
  ignored: number;
  ending_1h: number;
  ending_6h: number;
  ending_24h: number;
  last_updated_at: string | null;
  byCategory: { category: string; count: number; avg_price: number | null }[];
  byPlatform: { platform: string; count: number }[];
}
