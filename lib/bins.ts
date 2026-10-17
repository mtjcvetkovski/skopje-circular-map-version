export const BIN_TYPES = ["paper", "plastic", "glass"] as const;
export type BinType = (typeof BIN_TYPES)[number];

export const FILL_LEVELS = ["empty", "half", "full"] as const;
export type FillLevel = (typeof FILL_LEVELS)[number];

export type RecyclingBin = {
  id: string;
  stationId?: string;
  type: BinType;
  fill: FillLevel;
  road: string;
  lat: number;
  lon: number;
  updatedAt: string;
};

export type BinReport = Pick<RecyclingBin, "fill" | "updatedAt">;

export function isBinType(value: unknown): value is BinType {
  return typeof value === "string" && (BIN_TYPES as readonly string[]).includes(value);
}

export function isFillLevel(value: unknown): value is FillLevel {
  return typeof value === "string" && (FILL_LEVELS as readonly string[]).includes(value);
}

export function normalizeBins(value: unknown): RecyclingBin[] {
  const records = Array.isArray(value)
    ? value
    : value && typeof value === "object" && Array.isArray((value as { bins?: unknown }).bins)
      ? (value as { bins: unknown[] }).bins
      : value && typeof value === "object" && Array.isArray((value as { BINS?: unknown }).BINS)
        ? (value as { BINS: unknown[] }).BINS
        : [];
  return records.flatMap((item): RecyclingBin[] => {
    if (!item || typeof item !== "object") return [];
    const bin = item as Record<string, unknown>;
    if (
      typeof bin.id !== "string" || !bin.id || !isBinType(bin.type) || !isFillLevel(bin.fill) ||
      typeof bin.road !== "string" || !Number.isFinite(bin.lat) || !Number.isFinite(bin.lon) ||
      typeof bin.updatedAt !== "string"
    ) return [];

    const lat = bin.lat as number;
    const lon = bin.lon as number;
    if (lat < 41.8 || lat > 42.2 || lon < 21.2 || lon > 21.7) return [];

    return [{
      id: bin.id,
      ...(typeof bin.stationId === "string" ? { stationId: bin.stationId } : {}),
      type: bin.type,
      fill: bin.fill,
      road: bin.road,
      lat,
      lon,
      updatedAt: bin.updatedAt,
    }];
  });
}

export function loadLocalBinReports(): Record<string, BinReport> {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem("skopje-circular-bin-reports") || "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const reports: Record<string, BinReport> = {};
    for (const [id, item] of Object.entries(value)) {
      if (!item || typeof item !== "object") continue;
      const report = item as Record<string, unknown>;
      if (isFillLevel(report.fill) && typeof report.updatedAt === "string") {
        reports[id] = { fill: report.fill, updatedAt: report.updatedAt };
      }
    }
    return reports;
  } catch {
    return {};
  }
}

export function saveLocalBinReport(id: string, report: BinReport) {
  try {
    const reports = loadLocalBinReports();
    window.localStorage.setItem("skopje-circular-bin-reports", JSON.stringify({ ...reports, [id]: report }));
  } catch {
    // The map still updates in memory if browser storage is disabled.
  }
}
