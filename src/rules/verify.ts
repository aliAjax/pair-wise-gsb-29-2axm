// 核验规则层：温区装载约束 + 逐件比对逻辑，纯函数、不碰存储
import type { IssueType, Parcel, TempZone, Wave } from "../packages/types";

/** 车厢温区允许装载的包裹温区：冷藏车可带常温，冷冻车可带冷藏与常温 */
export const ZONE_LOADABLE: Record<TempZone, readonly TempZone[]> = {
  常温: ["常温"],
  冷藏: ["常温", "冷藏"],
  冷冻: ["常温", "冷藏", "冷冻"]
};

export function canLoad(vehicleZone: TempZone, parcelZone: TempZone): boolean {
  return ZONE_LOADABLE[vehicleZone].includes(parcelZone);
}

export interface IssueDraft {
  type: IssueType;
  code: string;
  message: string;
}

export interface VerifyResult {
  issues: IssueDraft[];
  missing: string[];
  extra: string[];
  zone: string[];
  unknown: string[];
  matched: string[];
  ready: boolean;
}

export const EMPTY_RESULT: VerifyResult = {
  issues: [],
  missing: [],
  extra: [],
  zone: [],
  unknown: [],
  matched: [],
  ready: false
};

/**
 * 把波次当前在车上的扫码记录与清单逐件比对。
 * 只统计 active 的扫码记录；移出车厢的记录视为历史留痕，不参与比对。
 */
export function evaluateWave(wave: Wave, parcels: Parcel[]): VerifyResult {
  const manifestCodes = wave.manifest.map((item) => item.code);
  // 同一件包裹在车上只算一次（重复扫码不去重会虚增计数）
  const scannedCodes = [...new Set(wave.scans.filter((scan) => scan.active).map((scan) => scan.code))];
  const scannedSet = new Set(scannedCodes);

  const missing = manifestCodes.filter((code) => !scannedSet.has(code));
  const extra: string[] = [];
  const zone: string[] = [];
  const unknown: string[] = [];
  const matched: string[] = [];

  for (const code of scannedCodes) {
    const parcel = parcels.find((item) => item.code === code);
    if (!parcel) {
      unknown.push(code);
      continue;
    }
    if (!manifestCodes.includes(code)) {
      extra.push(code);
      continue;
    }
    if (!canLoad(wave.vehicleZone, parcel.zone)) {
      zone.push(code);
      continue;
    }
    matched.push(code);
  }

  const issues: IssueDraft[] = [
    ...missing.map((code) => ({
      type: "missing" as const,
      code,
      message: `清单内包裹 ${code} 未扫到，缺件`
    })),
    ...extra.map((code) => ({
      type: "extra" as const,
      code,
      message: `${code} 不在本波次清单（分单骑手：${parcels.find((p) => p.code === code)?.rider ?? "未知"}），多件`
    })),
    ...zone.map((code) => {
      const parcel = parcels.find((p) => p.code === code);
      return {
        type: "zone" as const,
        code,
        message: `${code} 要求${parcel?.zone ?? "未知"}温区，不能装进${wave.vehicleZone}车`
      };
    }),
    ...unknown.map((code) => ({
      type: "unknown" as const,
      code,
      message: `${code} 在包裹资料库中不存在，无法核对`
    }))
  ];

  return {
    issues,
    missing,
    extra,
    zone,
    unknown,
    matched,
    ready: issues.length === 0 && manifestCodes.length > 0
  };
}

/** 当前是否仍有未处理的问题（决定波次是否停在待处理区） */
export function hasOpenIssues(wave: Wave): boolean {
  return wave.issues.some((issue) => !issue.resolved);
}
