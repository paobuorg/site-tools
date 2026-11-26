import { runPlanner, type PlannerValue } from "../lib/planners";

interface FieldSpec {
  name: string;
  type: string;
  required: boolean;
}

function parseArray(
  raw: string,
  kind: string,
): Array<Record<string, string | number | boolean>> {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.map((line, index) => {
    const cells = line.split(",").map((cell) => cell.trim());
    if (kind === "checkpoints") {
      if (cells.length < 2)
        throw new Error(`Checkpoint row ${index + 1}: use km,HH:MM.`);
      return { km: Number(cells[0]), cutoff: cells[1] } as Record<
        string,
        string | number | boolean
      >;
    }
    if (kind === "accessPoints") {
      if (cells.length < 2)
        throw new Error(
          `Access point row ${index + 1}: use km,name,crew,pacer.`,
        );
      return {
        km: Number(cells[0]),
        name: cells[1] ?? "",
        crew: cells[2] === "true",
        pacer: cells[3] === "true",
      } as Record<string, string | number | boolean>;
    }
    if (kind === "splits") {
      if (cells.length < 2)
        throw new Error(`Split row ${index + 1}: use km,elapsed minutes.`);
      return {
        km: Number(cells[0]),
        elapsedMinutes: Number(cells[1]),
      } as Record<string, string | number | boolean>;
    }
    if (kind === "items") {
      if (cells.length < 2)
        throw new Error(`Item row ${index + 1}: use name,grams.`);
      return { name: cells[0] ?? "", grams: Number(cells[1]) } as Record<
        string,
        string | number | boolean
      >;
    }
    return { value: line } as Record<string, string | number | boolean>;
  });
}

function fieldKind(name: string): string {
  if (name === "checkpoints") return "checkpoints";
  if (name === "accessPoints") return "accessPoints";
  if (name === "splits") return "splits";
  if (name === "mandatoryItems" || name === "optionalItems") return "items";
  return "plain";
}

const OUTPUT_KEY_LABELS: Record<string, Record<string, string>> = {
  zh: {
    checkpoints: "计时点明细",
    km: "公里",
    predictedClock: "预计到达",
    cutoffClock: "关门时刻",
    bufferMinutes: "余量（分钟）",
    name: "名称",
    arrivalClock: "预计到达",
    crewCallClock: "支援集合",
    fromName: "从",
    toName: "到",
    from: "从",
    to: "到",
    minutes: "间隔（分钟）",
    index: "周次",
    volumeKm: "周跑量（公里）",
    longRunKm: "最长跑（公里）",
    qualitySessions: "质量课（次）",
    intensityNote: "强度安排",
    warnings: "提示",
    day: "第几天",
    bodyMassKg: "体重（公斤）",
    eventDurationMinutes: "比赛时长（分钟）",
    loadWindowHours: "加载窗口（小时）",
    durationMinutes: "时长（分钟）",
    productCarbsGrams: "每份碳水（克）",
    servings: "份数",
    product: "产品",
    grams: "克数",
    mandatory: "强制装备",
    start: "起点",
    end: "终点",
    lat: "纬度",
    lon: "经度",
    elevationMeters: "海拔（米）",
    pointCount: "点数",
    splitKm: "分段（公里）",
    elapsed: "累计（分钟）",
    legKm: "区间（公里）",
    paceSeconds: "配速（秒/公里）",
    segments: "分段",
    weeks: "周次安排",
    schedule: "日程",
    totalGrams: "总重（克）",
    carriedGrams: "携带总重（克）",
    baseGrams: "基础重量（克）",
    percentOfBodyWeight: "占体重（%）",
  },
  en: {
    checkpoints: "Checkpoint details",
    km: "Km",
    predictedClock: "Predicted arrival",
    cutoffClock: "Cutoff",
    bufferMinutes: "Buffer (min)",
    name: "Name",
    arrivalClock: "Arrival",
    crewCallClock: "Crew call",
    fromName: "From",
    toName: "To",
    from: "From",
    to: "To",
    minutes: "Gap (min)",
    index: "Week",
    volumeKm: "Volume (km)",
    longRunKm: "Long run (km)",
    qualitySessions: "Quality sessions",
    intensityNote: "Intensity note",
    warnings: "Warnings",
    day: "Day",
    start: "Start",
    end: "End",
    lat: "Latitude",
    lon: "Longitude",
    elevationMeters: "Elevation (m)",
    pointCount: "Points",
    splitKm: "Split (km)",
    elapsed: "Elapsed (min)",
    paceSeconds: "Pace (s/km)",
  },
};

const ENUM_LABELS: Record<string, Record<string, string>> = {
  zh: {
    feasible: "可行",
    "at-risk": "有风险",
    infeasible: "不可行",
    fade: "后程掉速",
    "positive-split": "前快后慢",
    even: "均匀",
    maintained: "保持强度",
    high: "高",
    moderate: "中",
    low: "低",
    elevated: "偏高",
    spike: "骤增",
    typical: "正常",
    unknown: "未知",
    uphill: "上坡",
    downhill: "下坡",
    flat: "平路",
    hot: "热",
    "very-hot": "很热",
    extreme: "极端",
    cool: "凉爽",
    boston: "波士顿",
    comrades: "Comrades",
    M: "男",
    F: "女",
    marathon: "马拉松",
    half: "半程",
    ultra: "超马",
    "10k": "10 公里",
    "5k": "5 公里",
    km: "公里",
    mi: "英里",
    gpx: "GPX",
    geojson: "GeoJSON",
    road: "路跑",
    trail: "越野",
    cold: "冷",
    mild: "温和",
    rain: "雨",
    "under-3h": "3 小时以内",
    "3-6h": "3–6 小时",
    "over-6h": "6 小时以上",
    "distance-pace": "距离 + 配速",
    "distance-time": "距离 + 时间",
    "time-pace": "时间 + 配速",
    cycles: "循环次数",
    duration: "总时长",
    negative: "前慢后快",
  },
  en: {
    feasible: "Feasible",
    "at-risk": "At risk",
    infeasible: "Infeasible",
    fade: "Fade",
    "positive-split": "Positive split",
    even: "Even",
    high: "High",
    moderate: "Moderate",
    low: "Low",
    elevated: "Elevated",
    spike: "Spike",
    typical: "Typical",
    unknown: "Unknown",
    uphill: "Uphill",
    downhill: "Downhill",
    flat: "Flat",
    boston: "Boston",
    comrades: "Comrades",
    M: "Men",
    F: "Women",
    marathon: "Marathon",
    half: "Half marathon",
    ultra: "Ultra",
    "10k": "10K",
    "5k": "5K",
    km: "Kilometres",
    mi: "Miles",
    gpx: "GPX",
    geojson: "GeoJSON",
    road: "Road",
    trail: "Trail",
    cold: "Cold",
    mild: "Mild",
    rain: "Rain",
    "under-3h": "Under 3 h",
    "3-6h": "3–6 h",
    "over-6h": "Over 6 h",
    "distance-pace": "Distance + pace",
    "distance-time": "Distance + time",
    "time-pace": "Time + pace",
    cycles: "Cycles",
    duration: "Duration",
    negative: "Negative split",
  },
};

function outputKeyLabel(key: string, locale: string): string {
  return (
    OUTPUT_KEY_LABELS[locale]?.[key] ?? key.replace(/([a-z])([A-Z])/g, "$1 $2")
  );
}

function enumLabel(value: string, locale: string): string {
  return ENUM_LABELS[locale]?.[value] ?? value;
}

const PROSE_LABELS: Record<string, string> = {
  'Keep target pace unchanged; shorten session duration and the number of reps.': '保持目标配速，缩短单次时长与组数。',
  'Load is above 15% of body weight; review optional items and water plan.': '负重超过体重的 15%，请复核自选装备与补水计划。',
  'More than 2 litres carried; confirm aid-point spacing before accepting the weight.': '随身携带超过 2 升水，先确认补给点间距再接受这个重量。',
  'Only 1 crew-access point; gaps between crew stops cannot be checked.': '只有 1 个支援点，无法检查支援点之间的间隔。',
  'Taper window is shorter than the selected number of weeks.': '减量窗口短于所选周数。',
  'Peak weekly volume below 30 km is a low reference for a marathon taper.': '马拉松减量前周跑量低于 30 公里，参考价值有限。',
  'certified-course': '赛道未认证',
  time: '成绩未达标',
};

function formatScalar(value: unknown, locale: string): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean")
    return locale === "zh" ? (value ? "是" : "否") : value ? "yes" : "no";
  if (typeof value === "number")
    return Number.isInteger(value)
      ? String(value)
      : String(Math.round(value * 10) / 10);
  const text = enumLabel(String(value), locale);
  return locale === 'zh' ? PROSE_LABELS[text] ?? text : text;
}

function appendTable(
  container: HTMLElement,
  rows: Array<Record<string, unknown>>,
  locale: string,
): void {
  if (!rows.length) {
    container.textContent = "—";
    return;
  }
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const wrap = document.createElement("div");
  wrap.className = "plan-table-wrap";
  const table = document.createElement("table");
  table.className = "plan-table";
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const column of columns) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = outputKeyLabel(column, locale);
    headRow.appendChild(th);
  }
  head.appendChild(headRow);
  table.appendChild(head);
  const body = document.createElement("tbody");
  for (const row of rows) {
    const tr = document.createElement("tr");
    for (const column of columns) {
      const td = document.createElement("td");
      td.textContent = formatScalar(row[column], locale);
      tr.appendChild(td);
    }
    body.appendChild(tr);
  }
  table.appendChild(body);
  wrap.appendChild(table);
  container.appendChild(wrap);
}

function appendObject(
  container: HTMLElement,
  value: Record<string, unknown>,
  locale: string,
): void {
  const wrap = document.createElement("div");
  wrap.className = "plan-table-wrap";
  const table = document.createElement("table");
  table.className = "plan-table";
  const body = document.createElement("tbody");
  for (const [key, inner] of Object.entries(value)) {
    const tr = document.createElement("tr");
    const th = document.createElement("th");
    th.scope = "row";
    th.textContent = outputKeyLabel(key, locale);
    const td = document.createElement("td");
    td.textContent = formatScalar(inner, locale);
    tr.append(th, td);
    body.appendChild(tr);
  }
  table.appendChild(body);
  wrap.appendChild(table);
  container.appendChild(wrap);
}

function appendFormatted(
  container: HTMLElement,
  value: unknown,
  locale: string,
): void {
  if (Array.isArray(value)) {
    if (
      value.every(
        (item) => item && typeof item === "object" && !Array.isArray(item),
      )
    ) {
      appendTable(container, value as Array<Record<string, unknown>>, locale);
    } else if (value.length) {
      const list = document.createElement("ul");
      list.className = "plan-list";
      for (const item of value) {
        const li = document.createElement("li");
        li.textContent = formatScalar(item, locale);
        list.appendChild(li);
      }
      container.appendChild(list);
    } else {
      container.textContent = "—";
    }
    return;
  }
  if (value && typeof value === "object") {
    appendObject(container, value as Record<string, unknown>, locale);
    return;
  }
  container.textContent = formatScalar(value, locale);
}

export function initPlanTool(root: HTMLElement): void {
  const form = root.querySelector<HTMLFormElement>("[data-plan-form]");
  const error = root.querySelector<HTMLElement>("[data-plan-error]");
  const result = root.querySelector<HTMLElement>("[data-plan-result]");
  const output = root.querySelector<HTMLElement>("[data-plan-output]");
  const note = root.querySelector<HTMLElement>("[data-plan-note]");
  if (!form || !result || !output) return;
  const slug = root.dataset.slug ?? "";
  const locale = root.dataset.locale ?? "zh-CN";
  const specs = JSON.parse(root.dataset.fields ?? "[]") as FieldSpec[];
  const outputLabels = JSON.parse(root.dataset.outputs ?? "{}") as Record<
    string,
    string
  >;
  const lang = locale === "en" ? "en" : "zh";
  for (const option of form.querySelectorAll<HTMLOptionElement>(
    "select option",
  )) {
    option.textContent = enumLabel(option.value, lang);
  }
  const copy =
    locale === "zh-CN"
      ? {
          invalid: "请检查输入后重试。",
          note: "本工具只做算术与规则检查，不替代赛事规程、医疗建议或教练判断。",
          empty: "暂无结果。",
        }
      : {
          invalid: "Check the inputs and try again.",
          note: "This tool performs arithmetic and a rule check; it does not replace race rules, medical advice or a coach.",
          empty: "No result.",
        };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (error) {
      error.hidden = true;
      error.textContent = "";
    }
    const input: Record<string, PlannerValue> = {};
    try {
      for (const spec of specs) {
        const field = form.querySelector<
          HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
        >(`[name="${spec.name}"]`);
        if (!field) continue;
        if (spec.type === "array") {
          input[spec.name] = parseArray(field.value, fieldKind(spec.name));
        } else if (spec.type === "boolean") {
          input[spec.name] = (field as HTMLInputElement).checked;
        } else if (spec.type === "number") {
          input[spec.name] =
            field.value === ""
              ? spec.required
                ? Number.NaN
                : 0
              : Number(field.value);
        } else {
          input[spec.name] = field.value;
        }
      }
      const values = runPlanner(slug, input);
      output.replaceChildren();
      const lang = locale === "en" ? "en" : "zh";
      for (const [key, value] of Object.entries(values)) {
        const row = document.createElement("div");
        const dt = document.createElement("dt");
        dt.textContent = outputLabels[key] ?? outputKeyLabel(key, lang);
        const dd = document.createElement("dd");
        appendFormatted(dd, value, lang);
        row.append(dt, dd);
        output.appendChild(row);
      }
      if (note) note.textContent = copy.note;
      result.hidden = false;
    } catch (reason) {
      if (error) {
        error.textContent =
          reason instanceof Error ? reason.message : copy.invalid;
        error.hidden = false;
      }
      result.hidden = true;
    }
  });
}
