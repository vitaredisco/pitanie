/* ============================================================
   Nutrition Tracker — расчётный движок (доказательная база)
   Все формулы вынесены отдельно, чтобы их можно было проверить
   независимо от интерфейса. Источники — в комментариях.
   ============================================================ */

const NT = {};

/* ---- 1. Обмен покоя (BMR / RMR) ------------------------------------ */
// Mifflin-St Jeor (1990) — самая точная популяционная формула без %жира.
// W кг, H см, A лет, sex 'f'|'m'
NT.bmrMifflin = function (W, H, A, sex) {
  const base = 10 * W + 6.25 * H - 5 * A;
  return sex === 'm' ? base + 5 : base - 161;
};

// Katch-McArdle — по безжировой массе (LBM), точнее при известном %жира.
// lbm — безжировая масса, кг
NT.bmrKatch = function (lbm) {
  return 370 + 21.6 * lbm;
};

// Cunningham — вариант для тренированных, чуть выше Katch.
NT.bmrCunningham = function (lbm) {
  return 500 + 22 * lbm;
};

// Выбор формулы: если есть достоверный %жира → Katch, иначе Mifflin.
NT.computeBMR = function (p) {
  const lbm = NT.leanMass(p);
  if (lbm != null && p.formula !== 'mifflin') {
    return p.formula === 'cunningham' ? NT.bmrCunningham(lbm) : NT.bmrKatch(lbm);
  }
  return NT.bmrMifflin(p.weightKg, p.heightCm, p.age, p.sex);
};

// Безжировая масса: приоритет — прямое значение из анализа тела,
// иначе из веса и %жира.
NT.leanMass = function (p) {
  if (p.leanMassKg && p.leanMassKg > 0) return p.leanMassKg;
  if (p.bodyFatPct && p.bodyFatPct > 0 && p.weightKg > 0) {
    return p.weightKg * (1 - p.bodyFatPct / 100);
  }
  return null;
};

/* ---- 2. Расход энергии (TDEE) -------------------------------------- */
// Множители активности к BMR (грубая оценка, ±200–500 ккал).
NT.ACTIVITY = {
  sedentary: 1.2,   // мало движения
  light: 1.375,     // лёгкая активность 1–3 дн/нед
  moderate: 1.55,   // 3–5 дн/нед
  high: 1.725,      // 6–7 дн/нед
  athlete: 1.9      // физ. работа + тренировки
};

// Калории на шаги: ~0.0005 ккал на шаг на кг веса (≈0.04 при 70 кг).
NT.stepsKcal = function (steps, weightKg) {
  return steps * 0.0005 * weightKg;
};

// Калории тренировки по MET: ккал = MET * 3.5 * кг / 200 * минуты
NT.workoutKcal = function (met, minutes, weightKg) {
  return (met * 3.5 * weightKg / 200) * minutes;
};

// MET распространённых активностей (Compendium 2024)
NT.MET = {
  walk_slow: 2.8, walk_mid: 3.5, walk_fast: 5.0,
  run: 11.0, strength_light: 3.5, strength_hard: 5.5,
  cycling_mid: 6.8, yoga: 3.0, hiit: 8.0, swim: 7.0
};

// Итоговый расход. Две модели:
//  'multiplier' — BMR × множитель (классика).
//  'baseline'   — BMR × 1.2 (быт) + шаги + тренировки поверх (ближе к NEAT-подходу).
NT.computeTDEE = function (p, day) {
  const bmr = NT.computeBMR(p);
  if (p.tdeeModel === 'baseline') {
    const steps = (day && day.steps) || 0;
    const workouts = (day && day.workouts) || [];
    const wKcal = workouts.reduce((s, w) => s + (w.kcal || 0), 0);
    return bmr * 1.2 + NT.stepsKcal(steps, p.weightKg) + wKcal;
  }
  const mult = NT.ACTIVITY[p.activity] || 1.2;
  return bmr * mult;
};

// Отдых между подходами по интенсивности (сек): тяжёлая база дольше.
NT.restSec = function (met) { return met >= 6 ? 120 : met >= 5 ? 90 : 60; };

// Оценка силовой сессии по упражнениям. Калории — приблизительная оценка
// через время под нагрузкой (работа ~3 сек/повтор + отдых), а не «точная».
// exercises: [{sets, reps, met}]. Возвращает {min, kcal}.
NT.strengthSession = function (exercises, bodyWeightKg) {
  let sec = 0, kcal = 0;
  (exercises || []).forEach(e => {
    const s = e.sets || 0, reps = e.reps || 0;
    const dur = s * (reps * 3 + NT.restSec(e.met));   // сек на упражнение
    sec += dur;
    kcal += NT.workoutKcal(e.met, dur / 60, bodyWeightKg);
  });
  return { min: Math.round(sec / 60), kcal: Math.round(kcal) };
};

// Разбор нагрузки по группам мышц: сумма подходов на группу.
// workouts — массив тренировок дня; учитываются силовые (с exercises[].m).
NT.setsByMuscle = function (workouts) {
  const map = {};
  (workouts || []).forEach(w => (w.exercises || []).forEach(e => {
    const g = e.m || 'Другое';
    map[g] = (map[g] || 0) + (e.sets || 0);
  }));
  return map;
};
// Список групп, которые тренировались (для проверки восстановления).
NT.musclesTrained = function (workouts) { return Object.keys(NT.setsByMuscle(workouts)); };

/* ---- 3. Цели по КБЖУ ---------------------------------------------- */
// Энергия макросов (Atwater)
NT.KCAL = { protein: 4, carb: 4, fat: 9, alcohol: 7 };

// Дефицит/профицит по режиму (доля от TDEE). Поддержание = 0.
NT.GOAL_ADJUST = { lose: -0.175, maintain: 0, gain: 0.10 };

// Расчёт дневных целей. Возвращает {kcal, protein_g, fat_g, carb_g, notes[]}
NT.computeTargets = function (p, day) {
  const notes = [];
  const tdee = NT.computeTDEE(p, day);
  const bmr = NT.computeBMR(p);
  const adjust = NT.GOAL_ADJUST[p.goal] != null ? NT.GOAL_ADJUST[p.goal] : 0;
  let kcal = tdee * (1 + adjust);

  // Пол по калориям — не ниже BMR (floor привязан к обмену, а не к мифу «1200»).
  if (kcal < bmr) {
    kcal = bmr;
    notes.push('Калории подняты до уровня обмена покоя — ниже опускаться нежелательно.');
  }

  const W = p.weightKg;
  // Белок: пользовательская уставка г/кг (дефолт 1.5). Научный оптимум для
  // сохранения/набора мышц выше (1.8–2.2), показываем как подсказку.
  const proteinPerKg = p.proteinPerKg || 1.5;
  let protein_g = proteinPerKg * W;
  if (proteinPerKg < 1.6) {
    notes.push('Белок ' + proteinPerKg + ' г/кг — рабочий минимум. Для набора мышц доказательный оптимум 1.8–2.2 г/кг.');
  }

  // Жир: пол = max(уставка·вес, 20% калорий). Безопасный минимум ~0.8 г/кг.
  const fatPerKg = p.fatPerKg || 0.8;
  let fat_g = fatPerKg * W;
  const fatFloorByKcal = (0.20 * kcal) / NT.KCAL.fat;
  if (fat_g < fatFloorByKcal) {
    fat_g = fatFloorByKcal;
    notes.push('Жиры подняты до 20% калорий — гормональный минимум для женщин.');
  }
  if (fatPerKg < 0.8) {
    notes.push('Жир ниже 0.8 г/кг рискован для гормонального фона — подняли к безопасному полу.');
  }

  // Углеводы — по остатку.
  const kcalFromPF = protein_g * NT.KCAL.protein + fat_g * NT.KCAL.fat;
  let carb_g = Math.max(0, (kcal - kcalFromPF) / NT.KCAL.carb);

  // Предупреждение о слишком низких углеводах в тренировочный день.
  const trained = day && day.workouts && day.workouts.length > 0;
  if (trained && carb_g < 3 * W) {
    notes.push('Углеводы ниже 3 г/кг в тренировочный день — может страдать качество тренировки.');
  }

  return {
    kcal: Math.round(kcal),
    protein_g: Math.round(protein_g),
    fat_g: Math.round(fat_g),
    carb_g: Math.round(carb_g),
    tdee: Math.round(tdee),
    bmr: Math.round(bmr),
    notes
  };
};

/* ---- 4. Итоги съеденного за день ---------------------------------- */
NT.sumDay = function (foods) {
  return (foods || []).reduce((a, f) => ({
    kcal: a.kcal + (f.kcal || 0),
    protein_g: a.protein_g + (f.protein_g || 0),
    fat_g: a.fat_g + (f.fat_g || 0),
    carb_g: a.carb_g + (f.carb_g || 0)
  }), { kcal: 0, protein_g: 0, fat_g: 0, carb_g: 0 });
};

/* ---- 5. Советник «влезает ли это?» -------------------------------- */
// candidate — {kcal, protein_g, fat_g, carb_g} порции.
// Возвращает вердикт с разбором по каждому макросу.
NT.advise = function (targets, eaten, candidate) {
  const rem = {
    kcal: targets.kcal - eaten.kcal,
    protein_g: targets.protein_g - eaten.protein_g,
    fat_g: targets.fat_g - eaten.fat_g,
    carb_g: targets.carb_g - eaten.carb_g
  };
  const afterKcal = rem.kcal - candidate.kcal;
  const afterFat = rem.fat_g - candidate.fat_g;
  const afterCarb = rem.carb_g - candidate.carb_g;

  const problems = [];
  if (afterKcal < 0) problems.push({ m: 'калориям', over: Math.round(-afterKcal), unit: 'ккал' });
  if (afterFat < -3) problems.push({ m: 'жирам', over: Math.round(-afterFat), unit: 'г' });
  if (afterCarb < -5) problems.push({ m: 'углеводам', over: Math.round(-afterCarb), unit: 'г' });

  let verdict, tone;
  if (problems.length === 0) {
    verdict = 'Влезает. После этого останется ' + Math.round(afterKcal) + ' ккал на день.';
    tone = 'ok';
  } else {
    const worst = problems.map(p => 'по ' + p.m + ' перебор на ' + p.over + ' ' + p.unit).join(', ');
    verdict = 'Перебор: ' + worst + '. ';
    tone = afterKcal < -150 ? 'bad' : 'warn';
    verdict += afterKcal < -150
      ? 'Заметно выбивает из нормы дня.'
      : 'Небольшой выход за рамки — решай сама.';
  }
  return { verdict, tone, remaining: rem, after: { kcal: afterKcal, fat: afterFat, carb: afterCarb } };
};

/* ---- 6. Вес: 7-дневное скользящее среднее ------------------------- */
// entries — [{date:'YYYY-MM-DD', kg:Number}] в любом порядке.
NT.weightTrend = function (entries) {
  const sorted = [...entries].filter(e => e.kg > 0).sort((a, b) => a.date < b.date ? -1 : 1);
  return sorted.map((e, i) => {
    const window = sorted.slice(Math.max(0, i - 6), i + 1);
    const avg = window.reduce((s, x) => s + x.kg, 0) / window.length;
    return { date: e.date, kg: e.kg, avg: Math.round(avg * 100) / 100 };
  });
};

if (typeof module !== 'undefined') module.exports = NT;
