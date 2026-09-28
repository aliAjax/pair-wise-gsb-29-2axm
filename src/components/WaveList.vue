<script setup lang="ts">
// 操作页面 - 波次列表与新建：按骑手/状态过滤，重开页面后仍可按骑手和波次核对
import { computed, reactive, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import { RIDERS, TEMP_ZONES } from "../packages/catalog";
import { useParcelStore } from "../packages/store";
import { useWaveStore } from "../archive/store";
import { canLoad } from "../rules/verify";
import { hoursFromNow } from "../archive/time";
import { WAVE_STATUS_META, type TempZone, type WaveStatus } from "../packages/types";

const waveStore = useWaveStore();
const parcelStore = useParcelStore();

const riderFilter = ref("全部骑手");
const statusFilter = ref("全部状态");

const STATUS_OPTIONS: Array<WaveStatus> = ["verifying", "pending", "sealed"];

const filteredWaves = computed(() =>
  waveStore.waves.filter((wave) => {
    if (riderFilter.value !== "全部骑手" && wave.rider !== riderFilter.value) return false;
    if (statusFilter.value !== "全部状态" && wave.status !== statusFilter.value) return false;
    return true;
  })
);

function isOverdue(wave: { plannedSealAt: string; status: WaveStatus }): boolean {
  if (wave.status === "sealed") return false;
  return new Date(wave.plannedSealAt.replace(" ", "T")).getTime() < Date.now();
}

/* ---------------- 新建波次 ---------------- */

const createVisible = ref(false);
const blankForm = () => ({
  rider: RIDERS[0] as string,
  vehicleZone: TEMP_ZONES[0] as TempZone,
  plannedSealAt: hoursFromNow(2),
  codes: [] as string[]
});
const createForm = reactive(blankForm());

const riderParcels = computed(() => parcelStore.parcels.filter((parcel) => parcel.rider === createForm.rider));

watch(createVisible, (visible) => {
  if (visible) Object.assign(createForm, blankForm());
});

function openCreate() {
  createVisible.value = true;
}

function submitCreate() {
  const result = waveStore.createWave({ ...createForm }, parcelStore.parcels);
  if (!result.ok) {
    ElMessage.warning(result.message);
    return;
  }
  ElMessage.success(result.message);
  riderFilter.value = createForm.rider;
  statusFilter.value = "全部状态";
  createVisible.value = false;
}

function scannedCount(wave: { scans: Array<{ active: boolean }> }): number {
  return wave.scans.filter((scan) => scan.active).length;
}
</script>

<template>
  <section class="wave-list panel">
    <div class="panel-head">
      <h2>配送波次</h2>
      <el-button type="primary" size="small" @click="openCreate">新建波次</el-button>
    </div>

    <div class="filters">
      <el-select v-model="riderFilter" size="small">
        <el-option label="全部骑手" value="全部骑手" />
        <el-option v-for="rider in RIDERS" :key="rider" :label="rider" :value="rider" />
      </el-select>
      <el-select v-model="statusFilter" size="small">
        <el-option label="全部状态" value="全部状态" />
        <el-option v-for="status in STATUS_OPTIONS" :key="status" :label="WAVE_STATUS_META[status].label" :value="status" />
      </el-select>
    </div>

    <div class="wave-cards">
      <p v-if="filteredWaves.length === 0" class="empty">没有符合条件的波次</p>
      <button
        v-for="wave in filteredWaves"
        :key="wave.id"
        type="button"
        class="wave-card"
        :class="{ active: waveStore.selectedId === wave.id, sealed: wave.status === 'sealed' }"
        @click="waveStore.select(wave.id)"
      >
        <div class="wave-card-head">
          <span class="wave-no">{{ wave.waveNo }}</span>
          <el-tag :type="WAVE_STATUS_META[wave.status].type" size="small">
            {{ WAVE_STATUS_META[wave.status].label }}
          </el-tag>
        </div>
        <div class="wave-meta">
          <span>{{ wave.rider }}</span>
          <el-tag size="small" effect="plain">{{ wave.vehicleZone }}车</el-tag>
          <span class="wave-count">清单 {{ wave.manifest.length }} / 已扫 {{ scannedCount(wave) }}</span>
        </div>
        <div class="wave-foot">
          <span>计划封车 {{ wave.plannedSealAt }}</span>
          <span v-if="isOverdue(wave)" class="overdue">已过计划时刻</span>
        </div>
      </button>
    </div>

    <el-dialog v-model="createVisible" title="新建配送波次" width="600px">
      <el-form label-width="100px">
        <el-form-item label="骑手">
          <el-select v-model="createForm.rider">
            <el-option v-for="rider in RIDERS" :key="rider" :label="rider" :value="rider" />
          </el-select>
        </el-form-item>
        <el-form-item label="车辆温区">
          <el-radio-group v-model="createForm.vehicleZone">
            <el-radio-button v-for="zone in TEMP_ZONES" :key="zone" :value="zone">{{ zone }}</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="计划封车时刻">
          <el-date-picker
            v-model="createForm.plannedSealAt"
            type="datetime"
            format="YYYY-MM-DD HH:mm"
            value-format="YYYY-MM-DD HH:mm"
            placeholder="选择计划封车时刻"
          />
        </el-form-item>
        <el-form-item :label="`清单（${createForm.codes.length} 件）`">
          <el-checkbox-group v-model="createForm.codes" class="parcel-picks">
            <el-checkbox v-for="parcel in riderParcels" :key="parcel.code" :value="parcel.code">
              <span class="pick-code">{{ parcel.code }}</span>
              <el-tag size="small" :type="parcel.zone === '常温' ? 'info' : parcel.zone === '冷藏' ? 'primary' : 'warning'">
                {{ parcel.zone }}
              </el-tag>
              <el-tag
                v-if="!canLoad(createForm.vehicleZone, parcel.zone)"
                size="small"
                type="danger"
              >
                与{{ createForm.vehicleZone }}车温区不符
              </el-tag>
              <span class="pick-address">{{ parcel.address }}</span>
            </el-checkbox>
          </el-checkbox-group>
          <p v-if="riderParcels.length === 0" class="empty">该骑手名下暂无分单包裹，请先在包裹资料库录入</p>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" @click="submitCreate">创建波次</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<style scoped>
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.panel-head h2 {
  margin: 0;
  font-size: 18px;
}
.filters {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 12px;
}
.wave-cards {
  display: grid;
  gap: 10px;
}
.wave-card {
  text-align: left;
  width: 100%;
  padding: 12px;
  border-radius: 8px;
  border: 1px solid #dfe7f1;
  background: #fbfcfe;
  color: #172033;
  cursor: pointer;
  display: grid;
  gap: 8px;
  transition: border-color .15s;
}
.wave-card:hover {
  border-color: #176b87;
}
.wave-card.active {
  border-color: #176b87;
  box-shadow: 0 0 0 2px rgba(23, 107, 135, .15);
}
.wave-card.sealed {
  background: #f3faf6;
}
.wave-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.wave-no {
  font-weight: 700;
  font-size: 15px;
}
.wave-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  color: #536078;
  font-size: 13px;
}
.wave-count {
  margin-left: auto;
}
.wave-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #69758c;
  font-size: 12px;
}
.overdue {
  color: #c84b31;
  font-weight: 700;
}
.parcel-picks {
  display: grid;
  gap: 6px;
  max-height: 240px;
  overflow-y: auto;
  padding: 8px;
  border: 1px solid #dfe7f1;
  border-radius: 8px;
}
.pick-code {
  margin-right: 6px;
  font-weight: 600;
}
.pick-address {
  margin-left: 8px;
  color: #69758c;
  font-size: 12px;
}
</style>
