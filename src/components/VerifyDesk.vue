<script setup lang="ts">
// 操作页面 - 出车核验台：扫件逐件比对、问题退回待处理区、封车/解封登记
import { computed, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { useParcelStore } from "../packages/store";
import { useWaveStore } from "../archive/store";
import { evaluateWave, EMPTY_RESULT } from "../rules/verify";
import { formatIso } from "../archive/time";
import {
  ISSUE_TYPE_META,
  WAVE_STATUS_META,
  type IssueRecord,
  type ScanEntry
} from "../packages/types";

const parcelStore = useParcelStore();
const waveStore = useWaveStore();

const wave = computed(() => waveStore.selectedWave);
const evaluation = computed(() =>
  wave.value ? evaluateWave(wave.value, parcelStore.parcels) : EMPTY_RESULT
);
const activeScans = computed<ScanEntry[]>(
  () => wave.value?.scans.filter((scan) => scan.active) ?? []
);
const openIssues = computed<IssueRecord[]>(
  () => wave.value?.issues.filter((issue) => !issue.resolved) ?? []
);

const isOverdue = computed(() => {
  if (!wave.value || wave.value.status === "sealed") return false;
  return new Date(wave.value.plannedSealAt.replace(" ", "T")).getTime() < Date.now();
});

/** 必须执行过逐件核验、当前比对一致、无未处理问题才允许封车；解封后需重新核验 */
const canSeal = computed(() => {
  if (!wave.value || wave.value.status === "sealed") return false;
  if (wave.value.round < 1 || !evaluation.value.ready || openIssues.value.length !== 0) return false;
  const unsealedAt = wave.value.seal?.unsealedAt;
  if (unsealedAt) {
    return !!wave.value.verifiedAt && new Date(wave.value.verifiedAt).getTime() > new Date(unsealedAt).getTime();
  }
  return true;
});

function parcelZone(code: string): string {
  return parcelStore.find(code)?.zone ?? "—";
}

function manifestRowState(code: string): { label: string; type: "success" | "danger" } {
  if (evaluation.value.zone.includes(code)) return { label: "温区不符", type: "danger" };
  if (activeScans.value.some((scan) => scan.code === code)) return { label: "已上车", type: "success" };
  return { label: "缺件", type: "danger" };
}

function scanRowState(scan: ScanEntry): { label: string; type: "success" | "warning" | "info" | "danger" } {
  if (!scan.active) return { label: "已移下", type: "info" };
  if (evaluation.value.unknown.includes(scan.code)) return { label: "无资料", type: "info" };
  if (evaluation.value.extra.includes(scan.code)) return { label: "多件", type: "warning" };
  if (evaluation.value.zone.includes(scan.code)) return { label: "温区不符", type: "danger" };
  return { label: "正常", type: "success" };
}

/* ---------------- 扫件与核验动作 ---------------- */

const scanInput = ref("");

function onScan() {
  if (!wave.value) return;
  const result = waveStore.scanCode(wave.value.id, scanInput.value);
  if (!result.ok) {
    ElMessage.warning(result.message);
    return;
  }
  ElMessage.success(result.message);
  scanInput.value = "";
}

function onUnload(code: string) {
  if (!wave.value) return;
  const result = waveStore.unloadScan(wave.value.id, code);
  if (result.ok) ElMessage.success(result.message);
  else ElMessage.warning(result.message);
}

function onVerify() {
  if (!wave.value) return;
  const result = waveStore.verifyWave(wave.value.id, parcelStore.parcels);
  if (!result) return;
  if (result.ready) {
    ElMessage.success("逐件比对一致，确认无误后可封车");
  } else {
    ElMessage.error(`核验发现 ${result.issues.length} 处问题，波次已退回待处理区`);
  }
}

function onResolve(issue: IssueRecord) {
  if (!wave.value) return;
  const result = waveStore.resolveIssue(wave.value.id, issue.id);
  if (result.ok) ElMessage.success(result.message);
  else ElMessage.warning(result.message);
}

/* ---------------- 封车 / 解封 ---------------- */

const sealForm = reactive({ visible: false, operator: "值班站长" });

function openSeal() {
  if (!canSeal.value) {
    if (wave.value && openIssues.value.length > 0) ElMessage.warning("仍有问题未处理，不能封车");
    else if (wave.value && wave.value.seal?.unsealedAt) ElMessage.warning("解封后请重新执行逐件核验再封车");
    else if (wave.value && wave.value.round === 0) ElMessage.warning("请先执行逐件核验");
    else ElMessage.warning("扫码与清单未完全对上，不能封车");
    return;
  }
  sealForm.visible = true;
}

function confirmSeal() {
  if (!wave.value) return;
  const result = waveStore.sealWave(wave.value.id, sealForm.operator.trim(), parcelStore.parcels);
  if (!result.ok) {
    ElMessage.error(result.message);
    return;
  }
  ElMessage.success(result.message);
  sealForm.visible = false;
}

const unsealForm = reactive({ visible: false, reason: "", reviewer: "" });

function openUnseal() {
  unsealForm.reason = "";
  unsealForm.reviewer = "";
  unsealForm.visible = true;
}

function confirmUnseal() {
  if (!wave.value) return;
  const result = waveStore.unsealWave(wave.value.id, unsealForm.reason, unsealForm.reviewer);
  if (!result.ok) {
    ElMessage.warning(result.message);
    return;
  }
  ElMessage.success(result.message);
  unsealForm.visible = false;
}
</script>

<template>
  <section v-if="wave" class="verify-desk panel">
    <!-- 波次头 -->
    <div class="desk-head">
      <div>
        <h2>
          {{ wave.waveNo }}
          <el-tag :type="WAVE_STATUS_META[wave.status].type" size="small" class="ml-8">
            {{ WAVE_STATUS_META[wave.status].label }}
          </el-tag>
          <el-tag v-if="isOverdue" type="danger" size="small" class="ml-8">已过计划封车时刻</el-tag>
        </h2>
        <div class="meta-grid">
          <span>骑手：<b>{{ wave.rider }}</b></span>
          <span>车辆温区：<b>{{ wave.vehicleZone }}</b></span>
          <span>计划封车：<b>{{ wave.plannedSealAt }}</b></span>
          <span>核验轮次：<b>第 {{ wave.round }} 轮</b></span>
          <span>上次核验：<b>{{ formatIso(wave.verifiedAt) }}</b></span>
        </div>
      </div>
      <div class="head-actions">
        <el-button type="success" :disabled="!canSeal" @click="openSeal">确认无误 · 封车</el-button>
        <el-button v-if="wave.status === 'sealed'" type="warning" @click="openUnseal">登记解封</el-button>
      </div>
    </div>

    <!-- 封车信息 -->
    <el-alert
      v-if="wave.status === 'sealed' && wave.seal"
      type="success"
      :closable="false"
      show-icon
      class="seal-banner"
      :title="`已于 ${formatIso(wave.seal.sealedAt)} 由 ${wave.seal.sealedBy} 封车，共 ${wave.manifest.length} 件`"
    />
    <el-alert
      v-if="wave.seal?.unsealedAt"
      type="warning"
      :closable="false"
      show-icon
      class="seal-banner"
      :title="`解封记录：${formatIso(wave.seal.unsealedAt)} · 复核人 ${wave.seal.reviewer} · 原因：${wave.seal.unsealReason}`"
    />

    <!-- 扫件操作条 -->
    <div class="scan-bar">
      <el-input
        v-model="scanInput"
        :disabled="wave.status === 'sealed'"
        placeholder="扫描或输入包裹编号后上车"
        clearable
        @keyup.enter="onScan"
      />
      <el-button type="primary" :disabled="wave.status === 'sealed'" @click="onScan">扫件上车</el-button>
      <el-button :disabled="wave.status === 'sealed'" @click="onVerify">执行核验</el-button>
    </div>

    <!-- 实时比对结果 -->
    <div class="result-bar">
      <span class="result-item ok">对上 {{ evaluation.matched.length }}</span>
      <span class="result-item danger">缺件 {{ evaluation.missing.length }}</span>
      <span class="result-item warn">多件 {{ evaluation.extra.length }}</span>
      <span class="result-item danger">温区不符 {{ evaluation.zone.length }}</span>
      <span class="result-item info">无资料 {{ evaluation.unknown.length }}</span>
      <span class="result-tip">
        {{
          wave.status === "sealed"
            ? "波次已封车，修改需先登记解封"
            : evaluation.ready
              ? "扫码与清单一致"
              : "不一致，核验后退回待处理区"
        }}
      </span>
    </div>

    <!-- 待处理问题 -->
    <el-alert
      v-if="openIssues.length > 0"
      type="error"
      :closable="false"
      show-icon
      title="待处理问题（波次停在待处理区，原分配与已扫记录均保留）"
      class="issue-banner"
    >
      <ul class="issue-list">
        <li v-for="issue in openIssues" :key="issue.id">
          <el-tag :type="ISSUE_TYPE_META[issue.type].type" size="small">{{ ISSUE_TYPE_META[issue.type].label }}</el-tag>
          <span class="issue-msg">{{ issue.message }}<i>（第 {{ issue.round }} 轮）</i></span>
          <el-button
            v-if="issue.type === 'missing' && wave.status !== 'sealed'"
            size="small"
            @click="scanInput = issue.code"
          >填编号补扫</el-button>
          <el-button
            v-if="issue.type !== 'missing' && wave.status !== 'sealed'"
            size="small"
            @click="onUnload(issue.code)"
          >移下车</el-button>
          <el-button size="small" type="success" plain @click="onResolve(issue)">登记已处理</el-button>
        </li>
      </ul>
    </el-alert>

    <div class="desk-tables">
      <!-- 分单清单（原分配快照，不可改） -->
      <div class="table-box">
        <h3>分单清单（{{ wave.manifest.length }} 件 · 原分配快照）</h3>
        <el-table :data="wave.manifest" size="small">
          <el-table-column prop="code" label="包裹编号" width="108" />
          <el-table-column prop="zone" label="要求温区" width="80" />
          <el-table-column prop="rider" label="骑手" width="80" />
          <el-table-column label="核验状态" width="90">
            <template #default="{ row }">
              <el-tag :type="manifestRowState(row.code).type" size="small">
                {{ manifestRowState(row.code).label }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <!-- 已扫记录（移下也保留） -->
      <div class="table-box">
        <h3>已扫记录（{{ activeScans.length }} 件在车上 · 移出仍留痕）</h3>
        <el-table :data="wave.scans" size="small">
          <el-table-column prop="code" label="包裹编号" width="108" />
          <el-table-column label="包裹温区" width="80">
            <template #default="{ row }">{{ parcelZone(row.code) }}</template>
          </el-table-column>
          <el-table-column label="扫码时间" width="135">
            <template #default="{ row }">{{ formatIso(row.at) }}</template>
          </el-table-column>
          <el-table-column label="状态" width="80">
            <template #default="{ row }">
              <el-tag :type="scanRowState(row).type" size="small">{{ scanRowState(row).label }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="80">
            <template #default="{ row }">
              <el-button
                link
                type="danger"
                size="small"
                :disabled="!row.active || wave.status === 'sealed'"
                @click="onUnload(row.code)"
              >移下车</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>

    <!-- 问题处理留痕 -->
    <div class="table-box" v-if="wave.issues.length > 0">
      <h3>问题处理记录</h3>
      <el-table :data="wave.issues" size="small">
        <el-table-column label="轮次" width="64">
          <template #default="{ row }">第{{ row.round }}轮</template>
        </el-table-column>
        <el-table-column label="类型" width="80">
          <template #default="{ row }">
            <el-tag :type="ISSUE_TYPE_META[row.type].type" size="small">{{ ISSUE_TYPE_META[row.type].label }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="code" label="包裹编号" width="108" />
        <el-table-column prop="message" label="问题说明" min-width="200" />
        <el-table-column label="处理状态" width="150">
          <template #default="{ row }">
            <el-tag :type="row.resolved ? 'success' : 'danger'" size="small">
              {{ row.resolved ? `已处理 ${formatIso(row.resolvedAt)}` : "待处理" }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 审计时间线 -->
    <div class="table-box">
      <h3>操作审计</h3>
      <el-timeline class="audit-line">
        <el-timeline-item
          v-for="entry in wave.audit"
          :key="entry.id"
          :timestamp="`${formatIso(entry.at)}${entry.by ? ' · ' + entry.by : ''}`"
          placement="top"
          :type="entry.action === '封车' ? 'success' : entry.action === '解封' ? 'warning' : 'primary'"
        >
          <b>{{ entry.action }}</b>
          <span v-if="entry.detail" class="audit-detail">{{ entry.detail }}</span>
        </el-timeline-item>
      </el-timeline>
    </div>

    <!-- 封车确认 -->
    <el-dialog v-model="sealForm.visible" title="封车确认" width="420px">
      <p>扫码与分单清单逐件一致，封车后修改需登记解封原因和复核人。</p>
      <el-input v-model="sealForm.operator" placeholder="封车操作人" />
      <template #footer>
        <el-button @click="sealForm.visible = false">取消</el-button>
        <el-button type="success" @click="confirmSeal">确认封车</el-button>
      </template>
    </el-dialog>

    <!-- 解封登记 -->
    <el-dialog v-model="unsealForm.visible" title="登记解封" width="460px">
      <el-form label-width="72px">
        <el-form-item label="解封原因">
          <el-input v-model="unsealForm.reason" type="textarea" :rows="3" placeholder="如：客户改地址需取出包裹、装车清点后发现错件" />
        </el-form-item>
        <el-form-item label="复核人">
          <el-input v-model="unsealForm.reviewer" placeholder="填写复核人姓名" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="unsealForm.visible = false">取消</el-button>
        <el-button type="warning" @click="confirmUnseal">确认解封</el-button>
      </template>
    </el-dialog>
  </section>

  <section v-else class="verify-desk panel">
    <p class="empty">请在左侧选择或新建一个配送波次</p>
  </section>
</template>

<style scoped>
.desk-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  flex-wrap: wrap;
}
.desk-head h2 {
  margin: 0 0 10px;
  font-size: 20px;
}
.ml-8 {
  margin-left: 8px;
}
.meta-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  color: #536078;
  font-size: 13px;
}
.head-actions {
  display: flex;
  gap: 8px;
}
.seal-banner {
  margin-top: 14px;
}
.scan-bar {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 8px;
  margin: 16px 0 10px;
}
.result-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  padding: 10px 12px;
  border-radius: 8px;
  background: #f6f9fc;
}
.result-item {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 700;
}
.result-item.ok { background: #e7f6ee; color: #14724f; }
.result-item.danger { background: #fdece8; color: #c84b31; }
.result-item.warn { background: #fdf3e0; color: #b7791f; }
.result-item.info { background: #e8eef5; color: #445069; }
.result-tip {
  margin-left: auto;
  color: #69758c;
  font-size: 13px;
}
.issue-banner {
  margin-top: 14px;
}
.issue-list {
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 8px;
}
.issue-list li {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.issue-msg {
  font-size: 13px;
}
.issue-msg i {
  color: #8a95a8;
  font-style: normal;
}
.desk-tables {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
  gap: 14px;
  margin-top: 16px;
}
.table-box {
  margin-top: 16px;
}
.table-box h3 {
  margin: 0 0 8px;
  font-size: 14px;
  color: #445069;
}
.audit-line {
  margin-top: 14px;
  padding-left: 4px;
}
.audit-detail {
  margin-left: 8px;
  color: #69758c;
  font-size: 13px;
}
</style>
