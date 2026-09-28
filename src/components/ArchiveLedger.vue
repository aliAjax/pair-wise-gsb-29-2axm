<script setup lang="ts">
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import { useDispatchStore } from "../stores/dispatch";
import type { AuditLog } from "../domain/types";
import { checkWave, roundScans } from "../domain/rules";
import { ACTION_LABELS, download, fmtDateTime, fmtMinute, zoneLabel } from "../utils/format";
import { exportArchive } from "../data/archive";

const emit = defineEmits<{ reset: [waveId: string] }>();

const store = useDispatchStore();
const { logs, waves } = storeToRefs(store);

const riderFilter = ref("全部骑手");
const waveNoFilter = ref("");
const tab = ref<"waves" | "logs">("waves");
const actionFilter = ref<"ALL" | AuditLog["action"]>("ALL");

const riderOptions = computed(() => [
  "全部骑手",
  ...new Set(waves.value.map((wave) => wave.rider))
]);

const actionOptions = Object.entries(ACTION_LABELS) as [AuditLog["action"], string][];

const SCAN_RESULT_LABELS: Record<string, string> = {
  OK: "对上",
  DUP: "重复",
  EXTRA: "多件",
  ZONE_MISMATCH: "温区不符",
  UNKNOWN: "未知件"
};

function matchRider(rider: string | undefined): boolean {
  return riderFilter.value === "全部骑手" || rider === riderFilter.value;
}

function matchWaveNo(no: string | undefined): boolean {
  const kw = waveNoFilter.value.trim().toUpperCase();
  return !kw || !!no?.toUpperCase().includes(kw);
}

const filteredWaves = computed(() =>
  waves.value.filter((wave) => matchRider(wave.rider) && matchWaveNo(wave.waveNo))
);

const filteredLogs = computed(() =>
  logs.value.filter((log) => {
    if (!matchRider(log.rider)) return false;
    if (!matchWaveNo(log.waveNo)) return false;
    if (actionFilter.value !== "ALL" && log.action !== actionFilter.value) return false;
    return true;
  })
);

function doExport() {
  const stamp = new Date()
    .toISOString()
    .slice(0, 16)
    .replace(/[:T]/g, "-");
  download(`dispatch-check-${stamp}.json`, exportArchive());
}

function resetAll() {
  if (window.confirm("清空全部本地留档并恢复演示数据？此操作不可恢复。")) {
    const firstId = store.resetAll();
    emit("reset", firstId);
  }
}
</script>

<template>
  <section class="panel">
    <div class="toolbar">
      <h2>本地留档台账</h2>
      <div class="actions">
        <button type="button" class="secondary small" @click="doExport">导出留档 JSON</button>
        <button type="button" class="danger small" @click="resetAll">重置演示数据</button>
      </div>
    </div>

    <div class="filter-row">
      <select v-model="riderFilter">
        <option v-for="rider in riderOptions" :key="rider">{{ rider }}</option>
      </select>
      <input v-model="waveNoFilter" placeholder="按波次号核对" />
    </div>

    <div class="tabs">
      <button
        type="button"
        class="tab"
        :class="{ on: tab === 'waves' }"
        @click="tab = 'waves'"
      >
        波次归档（{{ filteredWaves.length }}）
      </button>
      <button
        type="button"
        class="tab"
        :class="{ on: tab === 'logs' }"
        @click="tab = 'logs'"
      >
        操作日志（{{ filteredLogs.length }}）
      </button>
    </div>

    <!-- 波次归档：按骑手+波次核对 -->
    <div v-if="tab === 'waves'" class="ledger-waves">
      <div v-if="filteredWaves.length === 0" class="empty">暂无匹配波次</div>
      <article v-for="wave in filteredWaves" :key="wave.id" class="ledger-wave">
        <header>
          <div>
            <b class="mono">{{ wave.waveNo }}</b>
            <span class="status" :data-state="wave.status">
              {{ wave.status === "SEALED" ? "已封车" : "待核验" }}
            </span>
          </div>
          <div class="dim">
            {{ wave.rider }} ｜ {{ zoneLabel(wave.zone) }}车 ｜
            计划 {{ fmtMinute(wave.plannedSealAt) }} 封车 ｜
            清单 {{ checkWave(wave).total }} 件，本轮已对上 {{ checkWave(wave).matched }} 件
          </div>
        </header>

        <details>
          <summary>清单与扫件明细（{{ roundScans(wave).length }} 条本轮记录 / 历史共 {{ wave.scans.length }} 条）</summary>
          <ul class="ledger-items">
            <li v-for="item in wave.manifest" :key="item.packageCode">
              <span class="mono">{{ item.packageCode }}</span>
              <span class="zone-tag" :data-zone="item.zone">{{ zoneLabel(item.zone) }}</span>
              <span class="dim">
                最近对上：{{ fmtDateTime(item.matchedAt) }}
              </span>
            </li>
          </ul>
          <ul class="ledger-scans">
            <li v-for="event in wave.scans" :key="event.at">
              <span class="dim">{{ fmtDateTime(event.at) }}</span>
              <span class="mono">{{ event.code }}</span>
              <span class="pill" :class="event.result === 'OK' ? 'ok' : 'bad'">
                {{ SCAN_RESULT_LABELS[event.result] }}
              </span>
              <span class="dim">{{ event.detail }}</span>
            </li>
          </ul>
        </details>

        <div v-if="wave.seals.length" class="ledger-seals">
          <p v-for="(seal, index) in wave.seals" :key="index">
            封车 {{ fmtDateTime(seal.sealedAt) }} 由 {{ seal.sealedBy }}；
            <template v-if="seal.unsealedAt">
              解封 {{ fmtDateTime(seal.unsealedAt) }}，原因：{{ seal.unsealReason }}，
              复核人 {{ seal.reviewer }}
            </template>
            <template v-else>当前封条生效中</template>
          </p>
        </div>
      </article>
    </div>

    <!-- 操作日志：只追加 -->
    <div v-else>
      <div class="filter-row">
        <select v-model="actionFilter">
          <option value="ALL">全部动作</option>
          <option v-for="[value, label] in actionOptions" :key="value" :value="value">
            {{ label }}
          </option>
        </select>
      </div>
      <div class="log-table">
        <div v-if="filteredLogs.length === 0" class="empty">暂无日志</div>
        <div v-for="log in filteredLogs" :key="log.id" class="log-row">
          <span class="dim">{{ fmtDateTime(log.at) }}</span>
          <span class="action-tag" :data-action="log.action">{{ ACTION_LABELS[log.action] }}</span>
          <span class="mono">{{ log.waveNo ?? "—" }}</span>
          <span>{{ log.rider ?? "—" }}</span>
          <span class="log-detail">{{ log.detail }}</span>
          <span class="dim">操作人 {{ log.operator }}</span>
        </div>
      </div>
    </div>
  </section>
</template>
