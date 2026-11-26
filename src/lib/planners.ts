export type PlannerValue = string | number | boolean | Array<Record<string, string | number | boolean>>;

export interface PlannerOutput {
  [key: string]: unknown;
}

class PlannerError extends Error {}

const BOSTON_STANDARDS: Record<'M' | 'F', Array<{ maxAge: number; minutes: number }>> = {
  M: [
    { maxAge: 34, minutes: 175 },
    { maxAge: 39, minutes: 180 },
    { maxAge: 44, minutes: 185 },
    { maxAge: 49, minutes: 200 },
    { maxAge: 54, minutes: 205 },
    { maxAge: 59, minutes: 215 },
    { maxAge: 64, minutes: 230 },
    { maxAge: 69, minutes: 245 },
    { maxAge: 74, minutes: 260 },
    { maxAge: 79, minutes: 275 },
    { maxAge: 200, minutes: 290 },
  ],
  F: [
    { maxAge: 34, minutes: 205 },
    { maxAge: 39, minutes: 210 },
    { maxAge: 44, minutes: 215 },
    { maxAge: 49, minutes: 230 },
    { maxAge: 54, minutes: 235 },
    { maxAge: 59, minutes: 245 },
    { maxAge: 64, minutes: 260 },
    { maxAge: 69, minutes: 275 },
    { maxAge: 74, minutes: 290 },
    { maxAge: 79, minutes: 305 },
    { maxAge: 200, minutes: 320 },
  ],
};

function finite(value: unknown, label: string): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) throw new PlannerError(`${label}: enter a number.`);
  return n;
}

function ranged(value: unknown, label: string, min: number, max: number): number {
  const n = finite(value, label);
  if (n < min || n > max) throw new PlannerError(`${label}: use ${min}–${max}.`);
  return n;
}

function parseClock(value: unknown, label: string): number {
  const raw = String(value ?? '').trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) throw new PlannerError(`${label}: use HH:MM.`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) throw new PlannerError(`${label}: use 00:00–23:59.`);
  return hours * 60 + minutes;
}

function clock(totalMinutes: number): string {
  const wrapped = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const hours = Math.floor(wrapped / 60);
  const minutes = wrapped % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function rows(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) throw new PlannerError('Checkpoint rows: use one row per line, comma separated.');
  return value as Array<Record<string, unknown>>;
}

function cutoffPlanner(input: Record<string, PlannerValue>): PlannerOutput {
  const distanceKm = ranged(input.distanceKm, 'Course distance', 0.1, 500);
  const start = parseClock(input.startClock, 'Start time');
  const target = parseClock(input.targetFinish, 'Target finish');
  const finish = parseClock(input.finishCutoff, 'Finish cutoff');
  if (target <= start) throw new PlannerError('Target finish must be after the start.');
  if (finish < target) throw new PlannerError('Finish cutoff must not be earlier than target finish.');
  const checkpoints = rows(input.checkpoints).map((row) => ({
    km: ranged(row.km, 'Checkpoint km', 0, distanceKm),
    cutoff: parseClock(row.cutoff, 'Checkpoint cutoff'),
  }));
  const rawPace = ((target - start) * 60) / distanceKm;
  const requiredPaceSecondsPerKm = Math.round(rawPace);
  const cutoffPaceSecondsPerKm = Math.round(((finish - start) * 60) / distanceKm);
  const details = checkpoints.map((point) => {
    const predicted = start + (point.km * rawPace) / 60;
    const buffer = point.cutoff - predicted;
    return {
      km: point.km,
      predictedClock: clock(predicted),
      cutoffClock: clock(point.cutoff),
      bufferMinutes: Math.round(buffer),
      rawBuffer: buffer,
    };
  });
  const tightest = details.reduce<null | (typeof details)[number]>(
    (best, item) => (!best || item.rawBuffer < best.rawBuffer ? item : best),
    null,
  );
  const minBuffer = tightest?.rawBuffer ?? Number.POSITIVE_INFINITY;
  return {
    requiredPaceSecondsPerKm,
    cutoffPaceSecondsPerKm,
    tightestCheckpoint: tightest ? `km ${tightest.km}` : null,
    tightestBufferMinutes: tightest ? Math.round(tightest.rawBuffer) : finish - target,
    finishBufferMinutes: finish - target,
    verdict: minBuffer < 0 ? 'infeasible' : minBuffer < 15 ? 'at-risk' : 'feasible',
    checkpoints: details.map(({ rawBuffer, ...rest }) => rest),
  };
}

function crewPacerPlan(input: Record<string, PlannerValue>): PlannerOutput {
  const distanceKm = ranged(input.distanceKm, 'Course distance', 0.1, 500);
  const start = parseClock(input.startClock, 'Start time');
  const target = parseClock(input.targetFinish, 'Target finish');
  if (target <= start) throw new PlannerError('Target finish must be after the start.');
  const lead = ranged(input.crewLeadMinutes ?? 20, 'Crew lead', 0, 120);
  const points = rows(input.accessPoints).map((row, index) => {
    const km = ranged(row.km, `Row ${index + 1} km`, 0, distanceKm);
    const name = String(row.name ?? '').trim();
    if (!name) throw new PlannerError(`Row ${index + 1}: access point needs a name.`);
    return { km, name, crew: row.crew === true || row.crew === 'true', pacer: row.pacer === true || row.pacer === 'true' };
  });
  if (!points.length) throw new PlannerError('Add at least one access point.');
  for (let i = 1; i < points.length; i += 1) {
    if (points[i].km <= points[i - 1].km) throw new PlannerError('Access point km must increase strictly.');
  }
  const kmPerMinute = distanceKm / (target - start);
  const arrival = (km: number) => start + km / kmPerMinute;
  const handoffs = points
    .filter((point) => point.crew || point.pacer)
    .map((point) => ({
      name: point.name,
      km: point.km,
      arrivalClock: clock(arrival(point.km)),
      crewCallClock: clock(arrival(point.km) - lead),
    }));
  const pacerPoints = points.filter((point) => point.pacer);
  const pacerLegs = pacerPoints.slice(1).map((point, index) => ({
    fromName: pacerPoints[index].name,
    toName: point.name,
    km: round1(point.km - pacerPoints[index].km),
  }));
  const crewPoints = points.filter((point) => point.crew);
  const gaps = crewPoints.slice(1).map((point, index) => ({
    from: crewPoints[index].name,
    to: point.name,
    minutes: arrival(point.km) - arrival(crewPoints[index].km),
  }));
  const longest = gaps.reduce((max, gap) => Math.max(max, gap.minutes), 0);
  const warnings: string[] = [];
  for (const point of points) {
    if (!point.crew && !point.pacer) {
      warnings.push(`${point.name} (km ${point.km}) has neither crew access nor a pacer change; it will not appear in handoffs.`);
    }
  }
  for (const gap of gaps) {
    if (gap.minutes > 120) warnings.push(`Crew gap from ${gap.from} to ${gap.to} is ${Math.round(gap.minutes)} minutes; confirm staffing and supplies.`);
  }
  if (crewPoints.length === 1) warnings.push('Only 1 crew-access point; gaps between crew stops cannot be checked.');
  return { handoffs, pacerLegs, longestCrewGapMinutes: Math.round(longest), warnings };
}

function raceDayTimeline(input: Record<string, PlannerValue>): PlannerOutput {
  const start = parseClock(input.startClock, 'Start time');
  const wave = ranged(input.waveOffsetMinutes, 'Wave offset', 0, 90);
  const travel = ranged(input.travelMinutes, 'Travel', 0, 180);
  const checkin = ranged(input.checkinMinutes, 'Check-in', 0, 120);
  const bagDrop = ranged(input.bagDropMinutes, 'Bag drop', 0, 120);
  const warmup = ranged(input.warmupMinutes, 'Warm-up', 0, 60);
  const finishHours = ranged(input.finishTargetHours, 'Finish target', 0, 12);
  const effective = start + wave;
  const warmupAt = effective - warmup;
  const bagAt = warmupAt - bagDrop;
  const checkinAt = bagAt - checkin;
  const arriveAt = checkinAt - 10;
  const leaveAt = arriveAt - travel;
  const wakeAt = leaveAt - 90;
  const finishAt = effective + finishHours * 60;
  const milestone = (key: string, minutes: number) => ({ key, clock: clock(minutes), previousDay: minutes < 0 });
  const milestones = [
    milestone('wake', wakeAt),
    milestone('leave', leaveAt),
    milestone('arrive', arriveAt),
    milestone('checkin', checkinAt),
    milestone('bagDrop', bagAt),
    milestone('warmup', warmupAt),
    milestone('effectiveStart', effective),
    milestone('finish', finishAt),
  ];
  return {
    effectiveStartClock: clock(effective),
    wakeClock: clock(wakeAt),
    leaveClock: clock(leaveAt),
    arriveClock: clock(arriveAt),
    checkinClock: clock(checkinAt),
    bagDropClock: clock(bagAt),
    warmupClock: clock(warmupAt),
    finishClock: clock(finishAt),
    milestones,
  };
}

function qualifier(input: Record<string, PlannerValue>): PlannerOutput {
  const event = String(input.event);
  const sex = String(input.sex) as 'M' | 'F';
  if (!['boston', 'comrades'].includes(event)) throw new PlannerError('Event: choose boston or comrades.');
  if (!['M', 'F'].includes(sex)) throw new PlannerError('Sex category: choose M or F.');
  const age = ranged(input.ageOnRaceDay, 'Age', 18, 90);
  const time = ranged(input.qualifyingTimeMinutes, 'Qualifying time', 1, 600);
  const certified = input.qualifierCourseCertified === true || input.qualifierCourseCertified === 'true';
  let requirement = 300;
  if (event === 'boston') {
    const row = BOSTON_STANDARDS[sex].find((item) => age <= item.maxAge);
    requirement = row?.minutes ?? 290;
  }
  const buffer = requirement - time;
  const eligible = certified && time <= requirement;
  let missing: string | null = null;
  if (!eligible) missing = !certified ? 'certified-course' : 'time';
  return {
    requirementMinutes: requirement,
    bufferMinutes: Math.round(buffer),
    eligible,
    missing,
  };
}

function splitAnalyzer(input: Record<string, PlannerValue>): PlannerOutput {
  const points = rows(input.splits).map((row, index) => ({
    km: finite(row.km, `Row ${index + 1} km`),
    elapsed: finite(row.elapsedMinutes, `Row ${index + 1} elapsed`),
  }));
  if (points.length < 2 || points.length > 40) throw new PlannerError('Use 2–40 checkpoints.');
  for (let i = 0; i < points.length; i += 1) {
    if (points[i].km <= 0) throw new PlannerError('Checkpoint km must be positive.');
    if (points[i].elapsed <= 0) throw new PlannerError('Elapsed time must be positive.');
    if (i > 0 && points[i].km <= points[i - 1].km) throw new PlannerError('Checkpoint km must increase strictly.');
    if (i > 0 && points[i].elapsed < points[i - 1].elapsed) throw new PlannerError('Elapsed time must not decrease.');
  }
  const totalKm = points[points.length - 1].km;
  const totalMin = points[points.length - 1].elapsed;
  const halfKm = totalKm / 2;
  let halfMin = totalMin / 2;
  for (let i = 1; i < points.length; i += 1) {
    if (points[i].km >= halfKm) {
      const before = points[i - 1];
      const after = points[i];
      halfMin = before.elapsed + ((halfKm - before.km) / (after.km - before.km)) * (after.elapsed - before.elapsed);
      break;
    }
  }
  const firstPace = halfMin / halfKm;
  const secondPace = (totalMin - halfMin) / (totalKm - halfKm);
  const fade = round1((secondPace / firstPace - 1) * 100);
  const allPoints = [{ km: 0, elapsed: 0 }, ...points];
  const segmentPaces = allPoints.slice(1).map((point, index) => {
    const previous = allPoints[index];
    return (point.elapsed - previous.elapsed) / (point.km - previous.km);
  });
  const mean = segmentPaces.reduce((a, b) => a + b, 0) / segmentPaces.length;
  const variance = segmentPaces.reduce((sum, pace) => sum + (pace - mean) ** 2, 0) / segmentPaces.length;
  const variability = round1((Math.sqrt(variance) / mean) * 100);
  let fadePointKm: number | null = null;
  for (let i = 1; i < allPoints.length; i += 1) {
    const pace = (allPoints[i].elapsed - allPoints[i - 1].elapsed) / (allPoints[i].km - allPoints[i - 1].km);
    if (pace > totalMin / totalKm * 1.15) { fadePointKm = allPoints[i].km; break; }
  }
  return {
    firstHalfSeconds: Math.round(halfMin * 60),
    secondHalfSeconds: Math.round((totalMin - halfMin) * 60),
    fadePercent: fade,
    fadePointKm,
    variabilityPercent: variability,
    verdict: fade >= 8 ? 'fade' : fade >= 2 ? 'positive-split' : 'even',
    gapToTargetMinutes: round1(totalMin - Number(input.targetFinishMinutes)),
  };
}

function taperPlanner(input: Record<string, PlannerValue>): PlannerOutput {
  const peak = ranged(input.peakWeeklyKm, 'Peak weekly km', 1, 400);
  const long = ranged(input.peakLongRunKm, 'Peak long run', 0, 200);
  const quality = ranged(input.qualitySessionsPerWeek, 'Quality sessions', 1, 3);
  const taperWeeks = Number(input.taperWeeks);
  if (![2, 3].includes(taperWeeks)) throw new PlannerError('Taper weeks: choose 2 or 3.');
  const days = ranged(input.daysToRace, 'Days to race', 0, 28);
  const volumeRatios = taperWeeks === 3 ? [0.8, 0.6, 0.4] : [0.7, 0.45];
  const longRatios = taperWeeks === 3 ? [0.85, 0.65, 0.45] : [0.7, 0.5];
  const qualityPlan = taperWeeks === 3
    ? (quality === 1 ? [1, 1, 0] : [2, 2, 1])
    : (quality === 1 ? [1, 1] : [2, 1]);
  const weeks = volumeRatios.map((ratio, index) => ({
    index: index + 1,
    volumeKm: Math.round(peak * ratio),
    longRunKm: Math.round(long * longRatios[index]),
    qualitySessions: qualityPlan[index],
    intensityNote: 'Keep target pace unchanged; shorten session duration and the number of reps.',
  }));
  const warning: string[] = [];
  if (days < taperWeeks * 7) warning.push('Taper window is shorter than the selected number of weeks.');
  if (String(input.raceDistance) === 'marathon' && peak < 30) warning.push('Peak weekly volume below 30 km is a low reference for a marathon taper.');
  return {
    weeks,
    taperRatio: round1(volumeRatios[volumeRatios.length - 1] * 100),
    intensityRetention: 'maintained',
    warning: warning.length ? warning.join(' ') : null,
  };
}

function gearWeight(input: Record<string, PlannerValue>): PlannerOutput {
  const body = ranged(input.bodyWeightKg, 'Body weight', 30, 150);
  const pack = ranged(input.packWeightGrams, 'Pack weight', 0, 5000);
  const water = ranged(input.waterLiters, 'Water', 0, 5);
  const fuel = ranged(input.fuelGrams, 'Fuel', 0, 2000);
  const items = (value: unknown, label: string) => rows(value).map((row, index) => {
    const name = String(row.name ?? '').trim();
    if (!name || name.length > 40) throw new PlannerError(`${label} row ${index + 1}: name must be 1–40 characters.`);
    return { name, grams: ranged(row.grams, `${label} row ${index + 1} grams`, 0, 5000), mandatory: label === 'Mandatory' };
  });
  const mandatory = items(input.mandatoryItems, 'Mandatory');
  const optional = items(input.optionalItems, 'Optional');
  const mandatoryGrams = mandatory.reduce((sum, item) => sum + item.grams, 0);
  const optionalGrams = optional.reduce((sum, item) => sum + item.grams, 0);
  const base = mandatoryGrams + pack;
  const carried = base + optionalGrams + water * 1000 + fuel;
  const percent = round1((carried / (body * 1000)) * 100);
  const all = [...mandatory, ...optional];
  const heaviest = all.reduce<null | { name: string; grams: number; mandatory: boolean }>((best, item) => {
    if (!best || item.grams > best.grams || (item.grams === best.grams && item.mandatory && !best.mandatory)) return item;
    return best;
  }, null);
  const suggestions: string[] = [];
  if (percent > 15) suggestions.push('Load is above 15% of body weight; review optional items and water plan.');
  if (water > 2) suggestions.push('More than 2 litres carried; confirm aid-point spacing before accepting the weight.');
  return {
    mandatoryGrams,
    optionalGrams,
    baseGrams: base,
    carriedGrams: carried,
    totalGrams: carried,
    percentOfBodyWeight: percent,
    heaviestItem: heaviest?.name ?? '',
    suggestions,
  };
}

function heatAcclimation(input: Record<string, PlannerValue>): PlannerOutput {
  const wbgt = ranged(input.raceWbgtC, 'WBGT', 10, 40);
  const arrival = ranged(input.arrivalDaysBefore, 'Arrival days', 0, 21);
  const current = ranged(input.currentDailyHeatMinutes, 'Current daily heat', 0, 240);
  const planDays = ranged(input.planDays, 'Plan days', 10, 14);
  const session = ranged(input.sessionMinutes, 'Session minutes', 20, 120);
  const total = arrival * current;
  const planned = planDays * session;
  const shortfall = Math.max(0, planned - total);
  const schedule = Array.from({ length: planDays }, (_, index) => ({
    day: index + 1,
    minutes: index >= planDays - 2 ? Math.round(session * 0.6) : session,
  }));
  return {
    targetDays: planDays,
    dailyMinutesTarget: session,
    totalExposureMinutes: total,
    shortfallMinutes: shortfall,
    riskBand: wbgt >= 28 || shortfall > 300 ? 'high' : wbgt >= 25 || shortfall > 120 ? 'moderate' : 'low',
    schedule,
  };
}

const calculators: Record<string, (input: Record<string, PlannerValue>) => PlannerOutput> = {
  'cutoff-planner': cutoffPlanner,
  'crew-pacer-plan': crewPacerPlan,
  'race-day-timeline': raceDayTimeline,
  'race-qualifier-checker': qualifier,
  'result-split-analyzer': splitAnalyzer,
  'taper-planner': taperPlanner,
  'gear-weight-planner': gearWeight,
  'heat-acclimation-planner': heatAcclimation,
};

export function runPlanner(slug: string, input: Record<string, PlannerValue>): PlannerOutput {
  const calculator = calculators[slug];
  if (!calculator) throw new PlannerError('This tool is not wired yet.');
  return calculator(input);
}
