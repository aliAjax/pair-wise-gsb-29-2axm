<script setup lang="ts">
import { computed, onUnmounted, reactive, ref } from "vue";
import { storeToRefs } from "pinia";
import { useDispatchStore } from "../stores/dispatch";
import { ZONE_LABELS, type TempZone } from "../domain/types";
import { checkWave, isOverdue } from "../domain/rules";
import { fmtMinute, zoneLabel } from "../utils/format";

const emit = defineEmits<{ open: [waveId: string] }>();
const props = defineProps<{ selectedId: string }>();

const store = useDispatchStore();
const { waves, riders } = storeToRefs(store);

const riderFilter = ref("全部骑手");
const keyword = ref("");
const showCreate = ref(false);
const error = ref("");

const zones = Object.entries(ZONE_LABELS) as [TempZone, string][];

const form = reactive({
  rider: riders.value[0],
  zone: "AMBIENT" as TempZone,
  plannedSealAt: "",
  codes: [] as string[]
});

const now = ref(Date.now());
const clockTimer = window.setInterval(() => (now.value = Date.now()), 1000);
onUnmounted(() => window.clearInterval(clockTimer));

const filtered = computed(() =>
  waves.value.filter((wave) => {
    if (riderFilter.value !== "全部骑手" && wave.rider !== riderFilter.value) {
      return false;
    }
    const kw = keyword.value.trim().toUpperCase();
    if (kw && !wave.waveNo.toUpperCase().includes(kw)) return false;
    return true;
  })
);

const candidates = computed(() =>
  store.unassignedPackages.filter((pkg) => pkg.zone === form.zone)
);

function toggleCode(code: string) {
  const index = form.codes.indexOf(code);
  if (index >= 0) form.codes.splice(index, 1);
  else form.codes.push(code);
}

function createWave() {
  error.value = "";
  try {
    const id = store.createWave({
      rider: form.rider,
      zone: form.zone,
      plannedSealAt: form.plannedSealAt,
      codes: form.codes
    });
    showCreate.value = false;
    form.zone = "AMBIENT";
    form.codes = [];
    form.plannedSealAt = "";
    emit("open", id);
  } catch (e) {
    error.value = (e as Error).message;
  }
}
</script>

<template>
  <section class="panel wave-list">
    <div class="toolbar">
      <h2>出车波次</h2>
      <button type="button" class="secondary small" @click="showCreate = !showCreate">
        {{ showCreate ? "收起" : "新建波次" }}
      </button>
    </div>

    <div class="filter-row">
      <select v-model="riderFilter">
        <option>全部骑手</option>
        <option v-for="rider in riders" :key="rider">{{ rider }}</option>
      </select>
      <input v-model="keyword" placeholder="按波次号搜索" />
    </div>

    <form v-if="showCreate" class="create-box" @submit.prevent="createWave">
      <label>
        骑手
        <select v-model="form.rider">
          <option v-for="rider in riders" :key="rider">{{ rider }}</option>
        </select>
      </label>
      <label>
        温区（本车温区）
        <select v-model="form.zone">
          <option v-for="[value, label] in zones" :key="value" :value="value">
            {{ label }}
          </option>
        </select>
      </label>
      <label>
        计划封车时刻
        <input v-model="form.plannedSealAt" type="datetime-local" required />
      </label>
      <div>
        <p class="pick-title">分配包裹（{{ form.codes.length }} 件，仅列同温区未分配件）</p>
        <div v-if="candidates.length === 0" class="hint">该温区没有可分配包裹</div>
        <label v-for="pkg in candidates" :key="pkg.code" class="pick-item">
          <input type="checkbox" :value="pkg.code" v-model="form.codes" />
          <span>{{ pkg.code }}</span>
          <span class="dim">{{ pkg.customer }}</span>
          <span class="zone-tag" :data-zone="pkg.zone">{{ zoneLabel(pkg.zone) }}</span>
        </label>
      </div>
      <p v-if="error" class="error-text">{{ error }}</p>
      <button type="submit">生成核验波次</button>
    </form>

    <div class="record-grid">
      <div v-if="filtered.length === 0" class="empty">暂无匹配波次</div>
      <article
        v-for="wave in filtered"
        :key="wave.id"
        class="record wave-card"
        :class="{ active: wave.id === props.selectedId }"
        @click="emit('open', wave.id)"
      >
        <div class="record-head">
          <p class="record-title">{{ wave.waveNo }}</p>
          <span class="status" :data-state="wave.status">
            {{ wave.status === "SEALED" ? "已封车" : "待核验" }}
          </span>
        </div>
        <div class="details">
          <span>骑手：{{ wave.rider }}</span>
          <span>
            温区：<b :data-zone="wave.zone">{{ zoneLabel(wave.zone) }}</b>
          </span>
          <span>
            进度：{{ checkWave(wave).matched }}/{{ checkWave(wave).total }}
          </span>
          <span :class="{ overdue: isOverdue(wave, new Date(now)) }">
            计划封车：{{ fmtMinute(wave.plannedSealAt) }}
          </span>
        </div>
        <div v-if="wave.seals.length" class="seal-note">
          封车 {{ wave.seals.length }} 次
          <template v-if="wave.seals[wave.seals.length - 1].unsealedAt">
            ，最近已解封（{{ wave.seals[wave.seals.length - 1].reviewer }} 复核）
          </template>
        </div>
      </article>
    </div>
  </section>
</template>
