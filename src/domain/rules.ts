import type {
  ManifestItem,
  PackageInfo,
  ScanEvent,
  TempZone,
  Wave
} from "./types";

// 核验规则（纯函数）：扫件判定、本轮比对、封车条件。
// 不读取存储、不依赖页面，便于单独复核规则口径。

export interface ScanOutcome {
  result: ScanEvent["result"];
  detail: string;
}

export interface WaveCheck {
  total: number;
  matched: number;
  /** 清单有、本轮没扫到：缺件 */
  missing: ManifestItem[];
  /** 本轮扫到、不在清单：多件（含温区不符扫入的） */
  extra: ScanEvent[];
  /** 本轮扫到、包裹温区与波次温区不符 */
  zoneMismatch: ScanEvent[];
  /** 清单逐件已扫且无多件、无温区不符 */
  pass: boolean;
}

/**
 * 判定一次扫件。
 * @param zone 扫件时所处温区（扫码枪/车厢选择），用于提示实际装车温区
 */
export function evaluateScan(
  wave: Wave,
  pkg: PackageInfo | undefined,
  zone: TempZone
): ScanOutcome {
  if (!pkg) {
    return { result: "UNKNOWN", detail: "包裹编号不在包裹资料库中" };
  }
  // 冻品塞进常温车：包裹要求温区与波次温区不符
  if (pkg.zone !== wave.zone) {
    return {
      result: "ZONE_MISMATCH",
      detail: `温区不符：包裹要求${labelOf(pkg.zone)}，本波次为${labelOf(wave.zone)}车`
    };
  }
  const onManifest = wave.manifest.some((item) => item.packageCode === pkg.code);
  if (!onManifest) {
    return { result: "EXTRA", detail: "多件：该包裹不在本波次分配清单中" };
  }
  const roundStart = Date.parse(wave.roundStartedAt) || 0;
  const scannedThisRound = wave.scans
    .filter((event) => (Date.parse(event.at) || 0) >= roundStart)
    .some((event) => event.code === pkg.code && event.result === "OK");
  if (scannedThisRound) {
    return { result: "DUP", detail: "重复扫件：本包裹本轮已扫过" };
  }
  const zoneNote =
    zone !== wave.zone
      ? `（当前扫件温区显示为${labelOf(zone)}，请确认装在${labelOf(wave.zone)}车）`
      : "";
  return { result: "OK", detail: `核验通过${zoneNote}` };
}

/** 本轮（最近一次进入核验/退回待处理之后）的扫件记录 */
export function roundScans(wave: Wave): ScanEvent[] {
  const roundStart = Date.parse(wave.roundStartedAt) || 0;
  return wave.scans.filter((event) => (Date.parse(event.at) || 0) >= roundStart);
}

/** 本轮清单逐件比对结果：缺件 / 多件 / 温区不符 */
export function checkWave(wave: Wave): WaveCheck {
  const scans = roundScans(wave);
  const okCodes = new Set(
    scans.filter((event) => event.result === "OK").map((event) => event.code)
  );
  const matched = wave.manifest.filter((item) => okCodes.has(item.packageCode));
  const missing = wave.manifest.filter((item) => !okCodes.has(item.packageCode));
  const extra = scans.filter(
    (event) => event.result === "EXTRA" || event.result === "UNKNOWN"
  );
  const zoneMismatch = scans.filter((event) => event.result === "ZONE_MISMATCH");

  return {
    total: wave.manifest.length,
    matched: matched.length,
    missing,
    extra,
    zoneMismatch,
    // pass 只描述“本轮清单逐件一致”；是否允许封车由 sealBlockReason 另判状态
    pass:
      missing.length === 0 &&
      extra.length === 0 &&
      zoneMismatch.length === 0 &&
      wave.manifest.length > 0
  };
}

/** 封车前校验，返回不能封车的原因；通过返回 null */
export function sealBlockReason(wave: Wave): string | null {
  if (wave.status === "SEALED") return "该波次已封车";
  if (wave.manifest.length === 0) return "清单为空，无件可封";
  const check = checkWave(wave);
  if (check.missing.length > 0) {
    return `缺件 ${check.missing.length} 件：${check.missing
      .map((item) => item.packageCode)
      .join("、")}`;
  }
  if (check.extra.length > 0) {
    return `多件 ${check.extra.length} 件：${[...new Set(check.extra.map((e) => e.code))].join("、")}`;
  }
  if (check.zoneMismatch.length > 0) {
    return `温区不符 ${check.zoneMismatch.length} 件：${[
      ...new Set(check.zoneMismatch.map((e) => e.code))
    ].join("、")}`;
  }
  return null;
}

/** 是否晚于计划封车时刻 */
export function isOverdue(wave: Wave, now: Date): boolean {
  const planned = new Date(wave.plannedSealAt);
  return now.getTime() > planned.getTime();
}

function labelOf(zone: TempZone): string {
  return { AMBIENT: "常温", CHILLED: "冷藏", FROZEN: "冷冻" }[zone];
}
