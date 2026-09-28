// 波次工作流状态：建波次、扫件、核验退回、封车/解封，所有动作写入留档
import { computed, ref } from "vue";
import { defineStore } from "pinia";
import type {
  AuditEntry,
  IssueRecord,
  ManifestItem,
  Parcel,
  ScanEntry,
  TempZone,
  Wave
} from "../packages/types";
import { ISSUE_TYPE_META } from "../packages/types";
import { loadWaves, saveWaves } from "../archive/waves";
import { newId, nowText } from "../archive/time";
import { evaluateWave, hasOpenIssues, type VerifyResult } from "../rules/verify";

export interface CreateWaveInput {
  rider: string;
  vehicleZone: TempZone;
  plannedSealAt: string;
  codes: string[];
}

export interface ActionResult {
  ok: boolean;
  message: string;
}

function appendAudit(wave: Wave, action: AuditEntry["action"], detail?: string, by?: string) {
  const entry: AuditEntry = {
    id: newId("audit"),
    at: new Date().toISOString(),
    action,
    ...(by ? { by } : {}),
    ...(detail ? { detail } : {})
  };
  wave.audit.push(entry);
}

export const useWaveStore = defineStore("waves", () => {
  const waves = ref<Wave[]>(loadWaves());
  const selectedId = ref<string | null>(waves.value[0]?.id ?? null);

  const selectedWave = computed<Wave | null>(
    () => waves.value.find((wave) => wave.id === selectedId.value) ?? null
  );

  function persist() {
    saveWaves(waves.value);
  }

  function select(id: string) {
    selectedId.value = id;
  }

  /** 包裹是否已进入某个波次清单（被引用后不允许删除资料） */
  function codeInUse(code: string): boolean {
    return waves.value.some((wave) => wave.manifest.some((item) => item.code === code));
  }

  function createWave(input: CreateWaveInput, parcels: Parcel[]): ActionResult {
    const riderParcels = parcels.filter((parcel) => parcel.rider === input.rider);
    const validCodes = new Set(riderParcels.map((parcel) => parcel.code));
    const codes = [...new Set(input.codes.filter((code) => validCodes.has(code)))];
    if (codes.length === 0) {
      return { ok: false, message: "请至少勾选一件该骑手名下的包裹" };
    }

    const manifest: ManifestItem[] = codes.map((code) => {
      const parcel = riderParcels.find((item) => item.code === code)!;
      return { code: parcel.code, rider: parcel.rider, zone: parcel.zone };
    });

    const date = nowText().slice(0, 10).replace(/-/g, "");
    const riderSeq = waves.value.filter((wave) => wave.rider === input.rider).length + 1;
    const waveNo = `W${date}-${input.rider.replace("骑手", "")}${String(riderSeq).padStart(2, "0")}`;

    const wave: Wave = {
      id: newId("wave"),
      waveNo,
      rider: input.rider,
      vehicleZone: input.vehicleZone,
      plannedSealAt: input.plannedSealAt,
      manifest,
      scans: [],
      issues: [],
      audit: [],
      status: "verifying",
      round: 0,
      createdAt: new Date().toISOString()
    };
    appendAudit(wave, "创建波次", `清单 ${manifest.length} 件，${input.vehicleZone}车，计划封车 ${input.plannedSealAt}`);
    waves.value.unshift(wave);
    selectedId.value = wave.id;
    persist();
    return { ok: true, message: `已创建波次 ${waveNo}` };
  }

  /** 扫件上车；返回 {ok:false} 表示重复扫码等提示 */
  function scanCode(waveId: string, rawCode: string): ActionResult {
    const wave = waves.value.find((item) => item.id === waveId);
    if (!wave) return { ok: false, message: "波次不存在" };
    if (wave.status === "sealed") return { ok: false, message: "波次已封车，需登记解封后才能继续扫件" };

    const code = rawCode.trim();
    if (!code) return { ok: false, message: "请输入或扫描包裹编号" };
    if (wave.scans.some((scan) => scan.code === code && scan.active)) {
      return { ok: false, message: `${code} 已在车上，请勿重复扫码` };
    }

    const entry: ScanEntry = { id: newId("scan"), code, at: new Date().toISOString(), active: true };
    wave.scans.push(entry);
    persist();
    return { ok: true, message: `${code} 已上车（当前 ${wave.scans.filter((s) => s.active).length} 件）` };
  }

  /** 把包裹移出车厢：扫码记录保留，仅标记为失效 */
  function unloadScan(waveId: string, code: string): ActionResult {
    const wave = waves.value.find((item) => item.id === waveId);
    if (!wave) return { ok: false, message: "波次不存在" };
    if (wave.status === "sealed") return { ok: false, message: "已封车，需先登记解封" };

    const scan = wave.scans.find((item) => item.code === code && item.active);
    if (!scan) return { ok: false, message: `${code} 不在车上` };
    scan.active = false;
    scan.deactivatedAt = new Date().toISOString();
    persist();
    return { ok: true, message: `${code} 已移下车，扫码记录保留` };
  }

  /** 执行逐件核验；有问题则整波退回待处理区，原分配与已扫记录均保留 */
  function verifyWave(waveId: string, parcels: Parcel[]): VerifyResult | null {
    const wave = waves.value.find((item) => item.id === waveId);
    if (!wave || wave.status === "sealed") return null;

    const result = evaluateWave(wave, parcels);
    wave.round += 1;
    wave.verifiedAt = new Date().toISOString();

    for (const draft of result.issues) {
      const record: IssueRecord = {
        id: newId("issue"),
        round: wave.round,
        type: draft.type,
        code: draft.code,
        message: draft.message,
        at: new Date().toISOString(),
        resolved: false
      };
      wave.issues.push(record);
    }

    if (result.ready) {
      wave.status = "verifying";
      appendAudit(wave, "执行核验", `第 ${wave.round} 轮：逐件比对一致，允许封车`);
    } else {
      wave.status = "pending";
      const summary = result.issues
        .map((issue) => `${ISSUE_TYPE_META[issue.type].label} ${issue.code}`)
        .join("、");
      appendAudit(wave, "执行核验", `第 ${wave.round} 轮：发现 ${result.issues.length} 处问题（${summary}）`);
      appendAudit(wave, "退回待处理区", "原分配清单与已扫记录保留，处理后可重新核验");
    }
    persist();
    return result;
  }

  /** 单条问题处理完成（补扫/移下/换车等由扫件动作完成，此处登记处理结果） */
  function resolveIssue(waveId: string, issueId: string): ActionResult {
    const wave = waves.value.find((item) => item.id === waveId);
    if (!wave) return { ok: false, message: "波次不存在" };
    const issue = wave.issues.find((item) => item.id === issueId);
    if (!issue) return { ok: false, message: "问题记录不存在" };
    if (issue.resolved) return { ok: false, message: "该问题已处理" };

    issue.resolved = true;
    issue.resolvedAt = new Date().toISOString();

    if (!hasOpenIssues(wave)) {
      wave.status = "verifying";
      appendAudit(wave, "执行核验", "上一轮问题已全部处理，请重新执行核验");
    }
    persist();
    return { ok: true, message: `${ISSUE_TYPE_META[issue.type].label} ${issue.code} 已登记处理` };
  }

  /** 确认无误后封车 */
  function sealWave(waveId: string, operator: string, parcels: Parcel[]): ActionResult {
    const wave = waves.value.find((item) => item.id === waveId);
    if (!wave) return { ok: false, message: "波次不存在" };
    if (wave.status === "sealed") return { ok: false, message: "波次已封车" };
    if (hasOpenIssues(wave)) return { ok: false, message: "仍有问题未处理，不能封车" };

    const result = evaluateWave(wave, parcels);
    if (!result.ready) {
      const detail = result.issues.map((issue) => ISSUE_TYPE_META[issue.type].label).join("、");
      return { ok: false, message: `核验未通过（${detail || "清单为空"}），已退回待处理区后再处理` };
    }

    // 解封后必须重新执行过核验，verifiedAt 才会晚于解封时间
    const unsealedAt = wave.seal?.unsealedAt;
    if (unsealedAt && (!wave.verifiedAt || new Date(wave.verifiedAt).getTime() <= new Date(unsealedAt).getTime())) {
      return { ok: false, message: "解封后请重新执行逐件核验再封车" };
    }

    wave.status = "sealed";
    wave.seal = { sealedAt: new Date().toISOString(), sealedBy: operator || "值班站长" };
    appendAudit(wave, "封车", `${wave.waveNo} 确认无误封车，共 ${wave.manifest.length} 件`, operator || "值班站长");
    persist();
    return { ok: true, message: `${wave.waveNo} 已封车，允许出车` };
  }

  /** 封车后的任何修改只能登记解封原因和复核人 */
  function unsealWave(waveId: string, reason: string, reviewer: string): ActionResult {
    const wave = waves.value.find((item) => item.id === waveId);
    if (!wave) return { ok: false, message: "波次不存在" };
    if (wave.status !== "sealed") return { ok: false, message: "波次未封车，无需解封" };
    if (!reason.trim()) return { ok: false, message: "请填写解封原因" };
    if (!reviewer.trim()) return { ok: false, message: "请填写复核人" };

    const at = new Date().toISOString();
    wave.status = "verifying";
    wave.seal = { ...wave.seal!, unsealedAt: at, unsealReason: reason.trim(), reviewer: reviewer.trim() };
    appendAudit(wave, "解封", `解封原因：${reason.trim()}`, reviewer.trim());
    persist();
    return { ok: true, message: "已解封，可调整后重新核验封车" };
  }

  return {
    waves,
    selectedId,
    selectedWave,
    select,
    codeInUse,
    createWave,
    scanCode,
    unloadScan,
    verifyWave,
    resolveIssue,
    sealWave,
    unsealWave
  };
});
