<script setup lang="ts">
// 操作页面 - 包裹资料维护：新增/查看/删除主数据，被波次引用的包裹保留留档不可删
import { computed, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { RIDERS, TEMP_ZONES } from "../packages/catalog";
import { useParcelStore } from "../packages/store";
import { useWaveStore } from "../archive/store";
import { formatIso } from "../archive/time";
import type { TempZone } from "../packages/types";

const visible = defineModel<boolean>({ required: true });

const parcelStore = useParcelStore();
const waveStore = useWaveStore();

const blank = () => ({ code: "", rider: RIDERS[0] as string, zone: TEMP_ZONES[0] as TempZone, address: "", slot: "" });
const form = reactive(blank());
const keyword = ref("");

function submit() {
  const error = parcelStore.addParcel({ ...form });
  if (error) {
    ElMessage.warning(error);
    return;
  }
  ElMessage.success(`包裹 ${form.code} 已录入资料库`);
  Object.assign(form, blank());
}

function remove(code: string) {
  if (waveStore.codeInUse(code)) {
    ElMessage.warning(`${code} 已进入波次清单，留档需要，不能删除`);
    return;
  }
  parcelStore.removeParcel(code);
  ElMessage.success(`${code} 已从资料库移除`);
}

const filtered = computed(() => {
  const key = keyword.value.trim();
  if (!key) return parcelStore.parcels;
  return parcelStore.parcels.filter(
    (parcel) => parcel.code.includes(key) || parcel.address.includes(key) || parcel.rider.includes(key)
  );
});
</script>

<template>
  <el-dialog v-model="visible" title="包裹资料库" width="760px">
    <div class="parcel-toolbar">
      <el-input v-model="keyword" placeholder="按编号 / 地址 / 骑手搜索" clearable class="parcel-search" />
      <span class="parcel-count">共 {{ filtered().length }} 件</span>
    </div>

    <el-form class="parcel-form" inline @submit.prevent="submit">
      <el-form-item>
        <el-input v-model="form.code" placeholder="包裹编号，如 PKG-1009" class="w-150" />
      </el-form-item>
      <el-form-item>
        <el-select v-model="form.rider" class="w-110">
          <el-option v-for="rider in RIDERS" :key="rider" :label="rider" :value="rider" />
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-select v-model="form.zone" class="w-100">
          <el-option v-for="zone in TEMP_ZONES" :key="zone" :label="zone" :value="zone" />
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-input v-model="form.address" placeholder="地址" class="w-150" />
      </el-form-item>
      <el-form-item>
        <el-input v-model="form.slot" placeholder="配送时段" class="w-110" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" native-type="submit">录入</el-button>
      </el-form-item>
    </el-form>

    <el-table :data="filtered()" size="small" max-height="360">
      <el-table-column prop="code" label="包裹编号" width="110" />
      <el-table-column prop="rider" label="分单骑手" width="90" />
      <el-table-column label="温区" width="80">
        <template #default="{ row }">
          <el-tag :type="row.zone === '常温' ? 'info' : row.zone === '冷藏' ? 'primary' : 'warning'" size="small">
            {{ row.zone }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="address" label="地址" min-width="150" />
      <el-table-column prop="slot" label="配送时段" width="110" />
      <el-table-column label="更新时间" width="140">
        <template #default="{ row }">{{ formatIso(row.updatedAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="80" fixed="right">
        <template #default="{ row }">
          <el-button
            link
            type="danger"
            size="small"
            :disabled="waveStore.codeInUse(row.code)"
            @click="remove(row.code)"
          >
            删除
          </el-button>
        </template>
      </el-table-column>
    </el-table>
    <p class="parcel-hint">已进入波次清单的包裹属于留档资料，不允许删除。</p>
  </el-dialog>
</template>

<style scoped>
.parcel-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.parcel-search {
  max-width: 280px;
}
.parcel-count {
  color: #69758c;
  font-size: 13px;
}
.parcel-form {
  padding: 12px;
  background: #f6f9fc;
  border-radius: 8px;
  margin-bottom: 12px;
}
.w-150 { width: 150px; }
.w-110 { width: 110px; }
.w-100 { width: 100px; }
.parcel-hint {
  margin: 10px 0 0;
  color: #69758c;
  font-size: 12px;
}
</style>
