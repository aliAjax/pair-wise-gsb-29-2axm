<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useDispatchStore } from "../stores/dispatch";
import { ZONE_LABELS, type ScanEvent, type TempZone, type Wave } from "../domain/types";
import { isOverdue, roundScans } from "../domain/rules";
import { fmtDateTime, fmtMinute, zoneLabel } from "../utils/format";

const props = defineProps<{ waveId: string }>();

const store = useDispatchStore();
const { packages } = storeToRefs(store);

const zones = Object.entries(ZONE_LABELS) as [TempZone, string][];

const scanCode = ref("");
const scanZone = ref<TempZone>("AMBIENT");
const scanInput = ref<HTMLInputElement | null>(null);
const flash = reactive({ text: "", tone: "" as "" | "ok" | "bad" });

const returnForm = reactive({ open: false, reason: "" });
const unsealForm = reactive({ open: false, reason: "", reviewer: "" });

const wave = computed<Wave | undefined>(() =>
  store.waves.find((item) => item.id === props.waveId)
);

const check = computed(() => (wave.value ? store.check(wave.value) : null));
const scans = computed(() => (wave.value ? roundScans(wave.value) : []));

const now = ref(Date.now());
const clockTimer = window.setInterval(() => (now.value = Date.now()), 1000);
onUnmounted(() => window.clearInterval(clockTimer));

const overdue = computed(() =>
  wave.value ? isOverdue(wave.value, new Date(now.value)) : false
);

function pkgOf(code: string) {
  return packages.value.find((pkg) => pkg.code === code);
}

function itemState(code: string): "matched" | "missing" {
  const hit = scans.value.some((e) => e.code === code && e.result === "OK");
  return hit ? "matched" : "missing";
}

function itemMatchedAt(code: string): string | undefined {
  return wave.value?.manifest.find((m) => m.packageCode === code)?.matchedAt;
}

function showFlash(text: string, tone: "ok" | "bad") {
  flash.text = text;
  flash.tone = tone;
  setTimeout(() => {
    if (flash.text === text) flash.text = "";
  }, 2600);
}

async function doScan() {
  if (!wave.value) return;
  try {
    const code = scanCode.value.trim().toUpperCase();
    store.scan(wave.value.id, scanCode.value, scanZone.value);
    scanCode.value = "";
    const event = wave.value.scans[wave.value.scans.length - 1] as ScanEvent;
    const ok = event.result === "OK";
    showFlash(`${code}　${event.detail}`, ok ? "ok" : "bad");
  } catch (e) {
    showFlash((e as Error).message, "bad");
  }
  await nextTick();
  scanInput.value?.focus();
}

function doReturn() {
  if (!wave.value) return;
  try {
    store.returnToPending(wave.value.id, returnForm.reason);
    returnForm.open = false;
    returnForm.reason = "";
    showFlash("已退回待处理区，原分配与扫件记录保留", "ok");
  } catch (e) {
    showFlash((e as Error).message, "bad");
  }
}

function doSeal() {
  if (!wave.value) return;
  try {
    store.seal(wave.value.id);
    showFlash("核验无误，已封车放行", "ok");
  } catch (e) {
    showFlash((e as Error).message, "bad");
  }
}

function doUnseal() {
  if (!wave.value) return;
  try {
    store.unseal(wave.value.id, unsealForm.reason, unsealForm.reviewer);
    unsealForm.open = false;
    unsealForm.reason = "";
    unsealForm.reviewer = "";
    showFlash("已登记解封，进入新一轮核验", "ok");
  } catch (e) {
    showFlash((e as Error).message, "bad");
  }
}

const RESULT_META: Record<ScanEvent["result"], { text: string; cls: string }> = {
  OK: { text: "对上", cls: "ok" },
  DUP: { text: "重复", cls: "warn" },
  EXTRA: { text: "多件", cls: "bad" },
  ZONE_MISMATCH: { text: "温区不符", cls: "bad" },
  UNKNOWN: { text: "未知件", cls: "bad" }
};

watch(
  wave,
  (value) => {
    if (value) {
      // 扫件温区默认与本车温区一致，可改成“错装到别的温区车”来演示拦截
      scanZone.value = value.zone;
    }
  },
  { immediate: true }
);

onMounted(() => {
  if (wave.value?.status === "PENDING") scanInput.value?.focus();
});
</script>

<template>
  <section v-if="wave && check" class="panel bench">
    <header class="bench-head">
      <div>
        <h2>
          出车核验台 · {{ wave.waveNo }}
          <span class="status" :data-state="wave.status">
            {{ wave.status === "SEALED" ? "已封车" : "待核验" }}
          </span>
        </h2>
        <p class="subtitle-line">
          骑手 <b>{{ wave.rider }}</b>
          ｜温区车
          <b class="zone-badge" :data-zone="wave.zone">{{ zoneLabel(wave.zone) }}</b>
          ｜计划封车
          <b :class="{ overdue }">{{ fmtMinute(wave.plannedSealAt) }}</b>
          <span v-if="overdue" class="overtime">已超过计划时刻</span>
        </p>
      </div>
    </header>

    <!-- 封车后的只读封条 -->
    <div v-if="wave.status === 'SEALED'" class="sealed-strip">
      <p>
        🔒 已于 {{ fmtDateTime(wave.seals[wave.seals.length - 1].sealedAt) }}
        由 {{ wave.seals[wave.seals.length - 1].sealedBy }} 封车，
        共 {{ wave.manifest.length }} 件全部核验一致。
      </p>
      <button type="button" class="secondary small" @click="unsealForm.open = !unsealForm.open">
        登记解封
      </button>
    </div>
    <form v-if="wave.status === 'SEALED' && unsealForm.open" class="inline-form" @submit.prevent="doUnseal">
      <label>
        解封原因
        <textarea v-model="unsealForm.reason" placeholder="如：客户临时改地址，需取回 YD100002" />
      </label>
      <label>
        复核人
        <input v-model="unsealForm.reviewer" placeholder="站长/复核人姓名" />
      </label>
      <button type="submit" class="danger">确认解封并重新核验</button>
    </form>

    <!-- 比对结论 -->
    <div class="check-summary" :data-pass="check.pass">
      <span class="summary-item">
        清单 <b>{{ check.total }}</b>
      </span>
      <span class="summary-item">
        已对上 <b class="ok-text">{{ check.matched }}</b>
      </span>
      <span class="summary-item">
        缺件 <b :class="check.missing.length ? 'bad-text' : ''">{{ check.missing.length }}</b>
      </span>
      <span class="summary-item">
        多件 <b :class="check.extra.length ? 'bad-text' : ''">{{ check.extra.length }}</b>
      </span>
      <span class="summary-item">
        温区不符
        <b :class="check.zoneMismatch.length ? 'bad-text' : ''">
          {{ check.zoneMismatch.length }}
        </b>
      </span>
      <span class="verdict">{{ check.pass ? "✅ 逐件一致，可以封车" : "⛔ 未通过，问题件回待处理区" }}</span>
    </div>

    <!-- 扫件区 -->
    <form v-if="wave.status === 'PENDING'" class="scan-box" @submit.prevent="doScan">
      <label class="scan-input">
        扫码 / 输入包裹编号
        <input
          ref="scanInput"
          v-model="scanCode"
          placeholder="如 YD100001，回车逐件核验"
          autocomplete="off"
        />
      </label>
      <label class="scan-zone">
        扫件温区
        <select v-model="scanZone">
          <option v-for="[value, label] in zones" :key="value" :value="value">
            {{ label }}车
          </option>
        </select>
      </label>
      <button type="submit">核验此件</button>
      <p v-if="flash.text" class="flash" :class="flash.tone">{{ flash.text }}</p>
    </form>

    <!-- 清单逐件比对 -->
    <h3 class="block-title">分配清单（原分单结果，只读保留）</h3>
    <div class="manifest">
      <div class="manifest-row manifest-head">
        <span>包裹编号</span>
        <span>收件地址</span>
        <span>要求温区</span>
        <span>状态</span>
        <span>扫件时刻</span>
      </div>
      <div
        v-for="item in wave.manifest"
        :key="item.packageCode"
        class="manifest-row"
        :data-state="itemState(item.packageCode)"
      >
        <span class="mono">{{ item.packageCode }}</span>
        <span>{{ pkgOf(item.packageCode)?.customer ?? "资料缺失" }}</span>
        <span>
          <span class="zone-tag" :data-zone="item.zone">{{ zoneLabel(item.zone) }}</span>
        </span>
        <span>
          <span class="pill" :class="itemState(item.packageCode)">
            {{ itemState(item.packageCode) === "matched" ? "已对上" : "缺件" }}
          </span>
        </span>
        <span class="dim">{{ fmtDateTime(itemMatchedAt(item.packageCode)) }}</span>
      </div>
    </div>

    <!-- 异常扫件：多件 / 温区不符 / 未知 -->
    <div v-if="check.extra.length || check.zoneMismatch.length" class="problem-box">
      <h3 class="block-title bad-text">问题件（不得装本车，回待处理区）</h3>
      <ul>
        <li v-for="event in [...check.extra, ...check.zoneMismatch]" :key="event.at + event.code">
          <span class="mono">{{ event.code }}</span>
          <span class="pill bad">{{ RESULT_META[event.result].text }}</span>
          <span class="dim">{{ event.detail }}</span>
        </li>
      </ul>
    </div>

    <!-- 本轮扫件流水 -->
    <h3 class="block-title">
      本轮已扫记录
      <button
        type="button"
        class="link-btn"
        :disabled="scans.length === 0 || wave.status !== 'PENDING'"
        @click="returnForm.open = !returnForm.open"
      >
        退回待处理区（重开一轮，记录保留）
      </button>
    </h3>
    <form v-if="returnForm.open" class="inline-form" @submit.prevent="doReturn">
      <label>
        退回原因
        <textarea v-model="returnForm.reason" placeholder="如：发现多件且来源波次待查，整单回待处理区" />
      </label>
      <button type="submit" class="danger">确认退回</button>
    </form>
    <div class="scan-log">
      <div v-if="scans.length === 0" class="empty">本轮还没有扫件记录</div>
      <div v-for="event in [...scans].reverse()" :key="event.at" class="log-line">
        <span class="dim">{{ fmtDateTime(event.at) }}</span>
        <span class="mono">{{ event.code }}</span>
        <span class="pill" :class="RESULT_META[event.result].cls">
          {{ RESULT_META[event.result].text }}
        </span>
        <span class="dim">{{ event.detail }}</span>
      </div>
    </div>

    <!-- 封车操作 -->
    <div v-if="wave.status === 'PENDING'" class="footer-actions">
      <button type="button" :disabled="!check.pass" @click="doSeal">
        确认无误，封车放行
      </button>
      <span v-if="!check.pass" class="dim">缺件 / 多件 / 温区不符未清零时无法封车</span>
    </div>
  </section>

  <section v-else class="panel empty-panel">
    <div class="empty">请选择左侧波次开始核验</div>
  </section>
</template>
