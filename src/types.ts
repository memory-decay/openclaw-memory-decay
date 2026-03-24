export interface StoreRequest {
  text: string;
  importance?: number;
  category?: string;
  mtype?: string;
  associations?: string[];
  speaker?: string;
}

export interface StoreResponse {
  id: string;
  text: string;
  tick: number;
}

export interface SearchRequest {
  query: string;
  top_k?: number;
}

export interface SearchResult {
  id: string;
  text: string;
  score: number;
  storage_score: number;
  retrieval_score: number;
  category: string;
  created_tick: number;
  speaker?: string;
}

export interface SearchResponse {
  results: SearchResult[];
}

export interface HealthResponse {
  status: string;
  current_tick: number;
}

export interface AutoTickResponse {
  ticks_applied: number;
  current_tick: number;
  elapsed_seconds: number;
}

export type Freshness = "fresh" | "normal" | "stale";

export function toFreshness(storageScore: number): Freshness {
  if (storageScore > 0.7) return "fresh";
  if (storageScore > 0.3) return "normal";
  return "stale";
}
