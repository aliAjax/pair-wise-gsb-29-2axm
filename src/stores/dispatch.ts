import { defineStore } from "pinia";
import type {
  AuditLog,
  PackageInfo,
  ScanEvent,
  TempZone,
  Wave
} from "../domain/types";
import { checkWave, evaluateScan, sealBlockReason } from "../domain/rules";
import {
  appendLogs,
  loadLogs,
  loadOperator,
  loadPackages,
  loadWaves,
  resetArchive,
  saveOperator,
  savePackages,
  saveWaves
} from "../data/archive";
import { SEED_PACKAGES, SEED_RIDERS, SEED_WAVES } from "../domain/seed";

interface State {
  operator: string;
  packages: PackageInfo[];
  waves: Wave[];
  logs: AuditLog[];
}

let logSeq = loadLogs().reduce((max, log) => Math.max(max, log.id), 0);

export const useDispatchStore = defineStore("dispatch", {
  state: (): State => ({
    operator: loadOperator(),
    packages: loadPackages(),
    waves: loadWaves(),
    logs: loadLogs()
  }),

  getters: {
    riders: () => SEED_RIDERS,
    /** 可分配包裹：尚未出现在待核验波次清单中 */
    unassignedPackages(state) {
      const busy = new Set(
        state.waves
          .filter((wave) => wave.status === "PENDING")
          .flatMap((wave) => wave.manifest.map((item) => item.packageCode))
      );
      return state.packages.filter((pkg) => !busy.has(pkg.code));
    }
  },

  actions: {
    setOperator(name: string) {
      this.operator = name.trim();
      saveOperator(this.operator);
    },

    addPackage(pkg: Omit<PackageInfo, "createdAt">) {
      if (this.packages.some((item) => item.code === pkg.code)) {
        throw new Error("包裹编号已存在");
      }
      this.packages.push({ ...pkg, createdAt: new Date().toISOString() });
      savePackages(this.packages);
      this.trail("PACKAGE_ADD", undefined, undefined, `新增包裹 ${pkg.code}（${pkg.zone}）`);
    },

    createWave(input: {
      rider: string;
      zone: TempZone;
      plannedSealAt: string;
      codes: string[];
    }): string {
      if (!input.rider) throw new Error("请选择骑手");
      if (!input.plannedSealAt) throw new Error("请填写计划封车时刻");
      if (input.codes.length === 0) throw new Error("清单至少包含 1 个包裹");
      const wrong = input.codes
        .map((code) => this.packages.find((pkg) => pkg.code === code))
        .filter((pkg): pkg is PackageInfo => !!pkg && pkg.zone !== input.zone);
      if (wrong.length > 0) {
        throw new Error(
          `清单含非${input.zone}包裹：${wrong.map((pkg) => pkg.code).join("、")}`
        );
      }
      const now = new Date().toISOString();
      const wave: Wave = {
        id: crypto.randomUUID(),
        waveNo: this.nextWaveNo(),
        rider: input.rider,
        zone: input.zone,
        plannedSealAt: input.plannedSealAt,
        status: "PENDING",
        manifest: input.codes.map((code) => ({
          packageCode: code,
          zone: input.zone
        })),
        scans: [],
        roundStartedAt: now,
        seals: [],
        createdAt: now
      };
      this.waves.unshift(wave);
      saveWaves(this.waves);
      this.trail(
        "WAVE_CREATE",
        wave.waveNo,
        wave.rider,
        `建波 ${wave.waveNo}，${wave.manifest.length} 件，计划 ${input.plannedSealAt.replace("T", " ")} 封车`
      );
      return wave.id;
    },

    /** 扫一件；异常扫件同样记入已扫记录 */
    scan(waveId: string, rawCode: string, zone: TempZone) {
      const wave = this.mustGet(waveId);
      if (wave.status !== "PENDING") throw new Error("已封车波次不能扫件，请先登记解封");
      const code = rawCode.trim().toUpperCase();
      if (!code) throw new Error("请扫描或输入包裹编号");
      const pkg = this.packages.find((item) => item.code === code);
      const outcome = evaluateScan(wave, pkg, zone);
      const event: ScanEvent = {
        at: new Date().toISOString(),
        code,
        zone,
        result: outcome.result,
        detail: outcome.detail
      };
      wave.scans.push(event);
      if (outcome.result === "OK") {
        const item = wave.manifest.find((m) => m.packageCode === code);
        if (item) item.matchedAt = event.at;
      }
      saveWaves(this.waves);
      this.trail("SCAN", wave.waveNo, wave.rider, `${code} ${outcome.detail}`);
    },

    /**
     * 退回待处理区并开始新一轮核验：
     * 原分配（清单）与全部已扫记录保留，仅刷新本轮起点、清空本轮勾对痕迹。
     */
    returnToPending(waveId: string, reason: string) {
      const wave = this.mustGet(waveId);
      if (wave.status !== "PENDING") throw new Error("已封车波次请走解封流程");
      if (!reason.trim()) throw new Error("请填写退回原因");
      wave.roundStartedAt = new Date().toISOString();
      wave.manifest.forEach((item) => {
        item.matchedAt = undefined;
      });
      saveWaves(this.waves);
      this.trail("RETURN", wave.waveNo, wave.rider, `退回待处理区：${reason.trim()}`);
    },

    seal(waveId: string) {
      const wave = this.mustGet(waveId);
      const block = sealBlockReason(wave);
      if (block) throw new Error(block);
      if (!this.operator) throw new Error("请先填写当班操作人");
      wave.seals.push({
        sealedAt: new Date().toISOString(),
        sealedBy: this.operator
      });
      wave.status = "SEALED";
      saveWaves(this.waves);
      this.trail("SEAL", wave.waveNo, wave.rider, `封车放行，封车人 ${this.operator}`);
    },

    /** 封车后要改，只能登记解封原因和复核人 */
    unseal(waveId: string, reason: string, reviewer: string) {
      const wave = this.mustGet(waveId);
      if (wave.status !== "SEALED") throw new Error("波次未封车");
      if (!reason.trim()) throw new Error("请登记解封原因");
      if (!reviewer.trim()) throw new Error("请填写复核人");
      const latest = [...wave.seals].reverse().find((s) => !s.unsealedAt);
      if (!latest) throw new Error("找不到封车记录");
      latest.unsealedAt = new Date().toISOString();
      latest.unsealReason = reason.trim();
      latest.reviewer = reviewer.trim();
      wave.status = "PENDING";
      // 解封后重新核验：原清单与历史扫件保留，开新一轮
      wave.roundStartedAt = latest.unsealedAt;
      wave.manifest.forEach((item) => {
        item.matchedAt = undefined;
      });
      saveWaves(this.waves);
      this.trail(
        "UNSEAL",
        wave.waveNo,
        wave.rider,
        `解封：${reason.trim()}；复核人 ${reviewer.trim()}`
      );
    },

    check(wave: Wave) {
      return checkWave(wave);
    },

    resetAll(): string {
      resetArchive();
      this.packages = SEED_PACKAGES.map((pkg) => ({ ...pkg }));
      this.waves = SEED_WAVES.map((wave) => ({
        ...wave,
        manifest: wave.manifest.map((item) => ({ ...item })),
        scans: [],
        seals: []
      }));
      this.logs = [];
      logSeq = 0;
      return this.waves[0]?.id ?? "";
    },

    nextWaveNo(): string {
      const d = new Date();
      const day = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
        d.getDate()
      ).padStart(2, "0")}`;
      const prefix = `W${day}-`;
      const count =
        this.waves.filter((wave) => wave.waveNo.startsWith(prefix)).length + 1;
      return `${prefix}${String(count).padStart(2, "0")}`;
    },

    mustGet(waveId: string): Wave {
      const wave = this.waves.find((item) => item.id === waveId);
      if (!wave) throw new Error("波次不存在");
      return wave;
    },

    trail(
      action: AuditLog["action"],
      waveNo: string | undefined,
      rider: string | undefined,
      detail: string
    ) {
      const entry: AuditLog = {
        id: ++logSeq,
        at: new Date().toISOString(),
        action,
        waveNo,
        rider,
        detail,
        operator: this.operator || "未署名"
      };
      this.logs.unshift(entry);
      appendLogs([entry]);
    }
  }
});
