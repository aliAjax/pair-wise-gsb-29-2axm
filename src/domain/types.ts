// 领域模型：包裹资料与出车波次。
// 本文件只描述数据结构，不关心存储方式与页面交互。

/** 温区：常温 / 冷藏 / 冷冻。扫件温区必须与波次温区一致。 */
export type TempZone = "AMBIENT" | "CHILLED" | "FROZEN";

export const ZONE_LABELS: Record<TempZone, string> = {
  AMBIENT: "常温",
  CHILLED: "冷藏",
  FROZEN: "冷冻"
};

/** 包裹资料（分单系统侧维护，核验台只读引用） */
export interface PackageInfo {
  /** 包裹编号，扫件条码 */
  code: string;
  /** 收件人 */
  customer: string;
  /** 要求温区 */
  zone: TempZone;
  createdAt: string;
}

/** 波次状态：待核验 → 已封车；发现问题退回待处理区后仍是待核验 */
export type WaveStatus = "PENDING" | "SEALED";

/** 清单项：分单结果的逐条副本，退回待处理也不删除 */
export interface ManifestItem {
  packageCode: string;
  /** 分单时包裹要求的温区（快照） */
  zone: TempZone;
  /** 本轮核验扫件成功时刻；未扫为 undefined */
  matchedAt?: string;
}

/** 一条扫件尝试（含异常扫件），逐件留痕 */
export interface ScanEvent {
  at: string;
  code: string;
  /** 扫件所在温区（扫码枪/保温车厢选择） */
  zone: TempZone;
  result: "OK" | "DUP" | "EXTRA" | "ZONE_MISMATCH" | "UNKNOWN";
  detail: string;
}

/** 封车 / 解封留痕 */
export interface SealRecord {
  sealedAt: string;
  sealedBy: string;
  /** 解封时刻；未解封为 undefined */
  unsealedAt?: string;
  unsealReason?: string;
  reviewer?: string;
}

/** 出车波次：一个骑手、一个温区、一张清单、一个计划封车时刻 */
export interface Wave {
  id: string;
  /** 波次号，如 W20260928-01 */
  waveNo: string;
  rider: string;
  zone: TempZone;
  /** 计划封车时刻（yyyy-MM-ddTHH:mm） */
  plannedSealAt: string;
  status: WaveStatus;
  manifest: ManifestItem[];
  scans: ScanEvent[];
  /** 本轮核验开始时刻（退回待处理后刷新），用于区分“本轮已扫”与历史扫件 */
  roundStartedAt: string;
  seals: SealRecord[];
  createdAt: string;
}

/** 操作日志：所有动作只追加，不修改、不删除 */
export interface AuditLog {
  id: number;
  at: string;
  action:
    | "WAVE_CREATE"
    | "SCAN"
    | "RETURN"
    | "SEAL"
    | "UNSEAL"
    | "PACKAGE_ADD";
  waveNo?: string;
  rider?: string;
  detail: string;
  operator: string;
}
