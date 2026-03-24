import type {
  StoreRequest,
  StoreResponse,
  SearchRequest,
  SearchResponse,
  HealthResponse,
  AutoTickResponse,
} from "./types.js";

export class MemoryDecayClient {
  private baseUrl: string;

  constructor(port: number = 8100) {
    this.baseUrl = `http://127.0.0.1:${port}`;
  }

  async health(): Promise<HealthResponse> {
    const res = await fetch(`${this.baseUrl}/health`);
    if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
    return res.json() as Promise<HealthResponse>;
  }

  async store(req: StoreRequest): Promise<StoreResponse> {
    const res = await fetch(`${this.baseUrl}/store`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    if (!res.ok) throw new Error(`Store failed: ${res.status}`);
    return res.json() as Promise<StoreResponse>;
  }

  async storeBatch(items: StoreRequest[]): Promise<{ ids: string[]; count: number }> {
    const res = await fetch(`${this.baseUrl}/store-batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(items),
    });
    if (!res.ok) throw new Error(`Store-batch failed: ${res.status}`);
    return res.json() as Promise<{ ids: string[]; count: number }>;
  }

  async search(req: SearchRequest): Promise<SearchResponse> {
    const res = await fetch(`${this.baseUrl}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    if (!res.ok) throw new Error(`Search failed: ${res.status}`);
    return res.json() as Promise<SearchResponse>;
  }

  async autoTick(): Promise<AutoTickResponse> {
    const res = await fetch(`${this.baseUrl}/auto-tick`, {
      method: "POST",
    });
    if (!res.ok) throw new Error(`Auto-tick failed: ${res.status}`);
    return res.json() as Promise<AutoTickResponse>;
  }
}
