export type EngineName = "google" | "indexnow" | "bing";

export type SubmissionResultDto = {
  id: string;
  engine: EngineName;
  status: "success" | "failed" | "skipped";
  httpStatus: number | null;
  message: string | null;
  accountLabel: string | null;
  createdAt: string;
};

export type SubmissionDto = {
  id: string;
  url: string;
  host: string;
  source: string;
  createdAt: string;
  results: SubmissionResultDto[];
};

export type SubmitSummary = {
  total: number;
  duplicatesRemoved: number;
  engines: Record<
    string,
    { success: number; failed: number; skipped: number }
  >;
  sampleErrors: string[];
};

export type StatsDto = {
  total: number;
  today: number;
  engines: Record<
    string,
    { success: number; failed: number; skipped: number }
  >;
  successRate: number | null;
  pipeline: {
    googleAccounts: number;
    googleDailyQuota: number;
    indexnowReady: boolean;
    bingReady: boolean;
  };
};

export type ServiceAccountDto = {
  id: string;
  label: string;
  clientEmail: string;
  projectId: string | null;
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
};

export type IndexNowKeyDto = {
  id: string;
  key: string;
  label: string | null;
  createdAt: string;
};

export async function api<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
  }
  return data as T;
}
