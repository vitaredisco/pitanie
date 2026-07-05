/* ============================================================
   Nutrition Tracker — интерфейсная логика.
   Данные хранятся локально (localStorage). Ничего не уходит в сеть.
   ============================================================ */

const KEY = 'nt_v1';

// Персональные данные (профиль) НЕ хранятся в коде — только в памяти устройства
// (localStorage). На новом устройстве профиль вводится один раз в разделе «Профиль».
let S = load();          // всё состояние приложения
let curDate = todayStr();
let selected100 = null;  // выбранный продукт (значения на 100 г) для экрана добавления
let advSel100 = null;    // то же для советника

function todayStr(d) {
  d = d || new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || fresh(); }
  catch (e) { return fresh(); }
}
function fresh() { return { profile: null, days: {}, custom: [], weights: [] }; }
function save() { localStorage.setItem(KEY, JSON.stringify(S)); }
function day(date) {
  date = date || curDate;
  if (!S.days[date]) S.days[date] = { foods: [], steps: 0, workouts: [] };
  return S.days[date];
}

/* ---- навигация ---- */
function go(v) {
  ['diary', 'add', 'advisor', 'activity', 'weight', 'profile'].forEach(x => {
    const el = document.getElementById('view-' + x);
    if (el) el.classList.toggle('hidden', x !== v);
  });
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.dataset.v === v));
  window.scrollTo(0, 0);
  if (v === 'diary') renderDiary();
  if (v === 'profile') fillProfile();
  if (v === 'activity') renderActivity();
  if (v === 'weight') renderWeight();
  if (v === 'add') { selected100 = null; document.getElementById('manualTitle').textContent = 'Или введи вручную'; }
}
function shiftDay(n) {
  const d = new Date(curDate); d.setDate(d.getDate() + n);
  curDate = todayStr(d); renderDiary();
}
function toast(msg) {
  const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 1800);
}

/* ---- ДНЕВНИК ---- */
function renderDiary() {
  const has = !!S.profile;
  document.getElementById('noProfile').classList.toggle('hidden', has);
  document.getElementById('diaryBody').classList.toggle('hidden', !has);
  const d = new Date(curDate);
  document.getElementById('dayTitle').textContent =
    curDate === todayStr() ? 'Сегодня' : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  if (!has) return;

  const dd = day();
  const t = NT.computeTargets(S.profile, dd);
  const eaten = NT.sumDay(dd.foods);
  const left = t.kcal - eaten.kcal;

  document.getElementById('kcalLeft').textContent = Math.round(left);
  document.getElementById('kcalLeft').style.color = left < 0 ? 'var(--bad)' : 'var(--txt)';
  document.getElementById('kcalEaten').textContent = Math.round(eaten.kcal);
  document.getElementById('kcalGoal').textContent = t.kcal;

  setMacro('p', eaten.protein_g, t.protein_g);
  setMacro('f', eaten.fat_g, t.fat_g);
  setMacro('c', eaten.carb_g, t.carb_g);
  drawRing(eaten.kcal / t.kcal);

  // активность
  const actK = NT.stepsKcal(dd.steps || 0, S.profile.weightKg) +
    (dd.workouts || []).reduce((s, w) => s + (w.kcal || 0), 0);
  document.getElementById('stepsShow').textContent = dd.steps || 0;
  document.getElementById('woShow').textContent = (dd.workouts || []).length;
  document.getElementById('actKcal').textContent = Math.round(actK);

  // приёмы пищи
  const meals = { breakfast: 'Завтрак', lunch: 'Обед', dinner: 'Ужин', snack: 'Перекус' };
  let html = '';
  Object.keys(meals).forEach(m => {
    const items = dd.foods.filter(f => f.meal === m);
    if (!items.length) return;
    html += '<div class="mealhdr">' + meals[m] + '</div><div class="card" style="padding:6px 14px">';
    items.forEach((f, i) => {
      const idx = dd.foods.indexOf(f);
      html += '<div class="foodrow"><div><div class="nm">' + esc(f.name) + '</div>' +
        '<div class="meta">' + f.grams + ' г · Б' + Math.round(f.protein_g) + ' Ж' + Math.round(f.fat_g) + ' У' + Math.round(f.carb_g) + '</div></div>' +
        '<div class="row" style="gap:8px"><b>' + Math.round(f.kcal) + '</b><button class="del" onclick="delFood(' + idx + ')">✕</button></div></div>';
    });
    html += '</div>';
  });
  document.getElementById('mealsList').innerHTML = html || '<p class="sub">Пока ничего не добавлено.</p>';

  // подсказки
  const notes = t.notes.map(n => '<div class="note">' + n + '</div>').join('');
  document.getElementById('dayNotes').innerHTML = notes;
}
function setMacro(k, val, goal) {
  document.getElementById(k + 'V').textContent = Math.round(val) + '/' + goal;
  const pct = goal > 0 ? Math.min(100, val / goal * 100) : 0;
  const bar = document.getElementById(k + 'B');
  bar.style.width = pct + '%';
  bar.style.opacity = val > goal ? '1' : '.85';
  if (val > goal) bar.style.background = 'var(--bad)';
}
function drawRing(frac) {
  const c = document.getElementById('ring'), ctx = c.getContext('2d');
  const cx = 60, cy = 60, r = 48; ctx.clearRect(0, 0, 120, 120);
  ctx.lineWidth = 11; ctx.lineCap = 'round';
  ctx.strokeStyle = getCss('--card2'); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  const over = frac > 1;
  if (over) {
    ctx.strokeStyle = getCss('--bad');
  } else {
    const grad = ctx.createLinearGradient(0, 0, 120, 120);
    grad.addColorStop(0, getCss('--accent'));
    grad.addColorStop(1, getCss('--accent2'));
    ctx.strokeStyle = grad;
  }
  ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.min(frac, 1) * Math.PI * 2); ctx.stroke();
  ctx.fillStyle = getCss('--txt'); ctx.font = '600 20px -apple-system,sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(Math.round(frac * 100) + '%', cx, cy);
}
function getCss(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
function delFood(i) { day().foods.splice(i, 1); save(); renderDiary(); }

/* ---- ПОИСК И ДОБАВЛЕНИЕ ЕДЫ ---- */
function allFoods() { return FOODS.concat(S.custom || []); }
function matchFoods(q) {
  q = q.toLowerCase().trim(); if (!q) return [];
  return allFoods().filter(f =>
    f.n.toLowerCase().includes(q) || (f.g || []).some(g => g.includes(q))
  ).slice(0, 20);
}
function searchFood() {
  const q = document.getElementById('foodSearch').value;
  const res = matchFoods(q);
  document.getElementById('searchRes').innerHTML = res.map((f, i) =>
    '<div class="res" onclick="pickFood(' + allFoods().indexOf(f) + ')"><b>' + esc(f.n) + '</b>' +
    '<div class="k">' + f.k + ' ккал · Б' + f.p + ' Ж' + f.f + ' У' + f.c + ' (на 100 г)</div></div>'
  ).join('');
}
function pickFood(i) {
  const f = allFoods()[i]; selected100 = f;
  document.getElementById('mName').value = f.n;
  document.getElementById('mK').value = f.k;
  document.getElementById('mP').value = f.p;
  document.getElementById('mF').value = f.f;
  document.getElementById('mC').value = f.c;
  document.getElementById('foodSearch').value = '';
  document.getElementById('searchRes').innerHTML = '';
  document.getElementById('mGrams').focus();
  document.getElementById('manualTitle').textContent = 'Выбрано: ' + f.n;
  scaleFrom100();
}
function scaleFrom100() {
  const g = parseFloat(document.getElementById('mGrams').value);
  const k = parseFloat(document.getElementById('mK').value) || 0;
  const p = parseFloat(document.getElementById('mP').value) || 0;
  const f = parseFloat(document.getElementById('mF').value) || 0;
  const c = parseFloat(document.getElementById('mC').value) || 0;
  const box = document.getElementById('scaledPreview');
  if (!g || g <= 0) { box.classList.add('hidden'); return; }
  const m = g / 100;
  box.classList.remove('hidden');
  box.innerHTML = '<b>В порции ' + g + ' г:</b> ' + Math.round(k * m) + ' ккал · Б' +
    r1(p * m) + ' Ж' + r1(f * m) + ' У' + r1(c * m);
}
function addFood() {
  const name = document.getElementById('mName').value.trim();
  const g = parseFloat(document.getElementById('mGrams').value);
  if (!name) return toast('Введи название');
  if (!g || g <= 0) return toast('Введи, сколько грамм съедено');
  const m = g / 100;
  day().foods.push({
    name, grams: g, meal: document.getElementById('mMeal').value,
    kcal: (parseFloat(document.getElementById('mK').value) || 0) * m,
    protein_g: (parseFloat(document.getElementById('mP').value) || 0) * m,
    fat_g: (parseFloat(document.getElementById('mF').value) || 0) * m,
    carb_g: (parseFloat(document.getElementById('mC').value) || 0) * m
  });
  save();
  ['mName', 'mGrams', 'mK', 'mP', 'mF', 'mC'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('scaledPreview').classList.add('hidden');
  selected100 = null;
  toast('Добавлено в дневник');
  go('diary');
}
function saveCustom() {
  const name = document.getElementById('mName').value.trim();
  if (!name) return toast('Введи название продукта');
  S.custom.push({
    n: name, g: [name.toLowerCase()],
    k: parseFloat(document.getElementById('mK').value) || 0,
    p: parseFloat(document.getElementById('mP').value) || 0,
    f: parseFloat(document.getElementById('mF').value) || 0,
    c: parseFloat(document.getElementById('mC').value) || 0
  });
  save(); toast('Продукт сохранён в базу');
}

/* ---- КАМЕРА: ШТРИХ-КОД (Open Food Facts) и ЭТИКЕТКА (OCR) ---- */
let camReader = null, camControls = null, camStream = null, camMode = null, camTarget = 'add';

function openCam(title, shotBtn) {
  document.getElementById('camTitle').textContent = title;
  document.getElementById('camShot').classList.toggle('hidden', !shotBtn);
  document.getElementById('scanFrame').classList.toggle('hidden', shotBtn);
  document.getElementById('camModal').classList.remove('hidden');
}
function setCamStatus(t) { document.getElementById('camStatus').textContent = t; }
function stopCam() {
  if (camControls) { try { camControls.stop(); } catch (e) {} camControls = null; }
  if (camReader) { try { camReader.reset(); } catch (e) {} camReader = null; }
  if (camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null; }
  const v = document.getElementById('camVideo'); if (v) v.srcObject = null;
}
function closeCam() { stopCam(); document.getElementById('camModal').classList.add('hidden'); camMode = null; }

// Сканер с усиленными настройками: «стараться сильнее» + только продуктовые
// форматы (меньше ложных попыток → быстрее и надёжнее ловит).
function makeBarcodeReader() {
  const hints = new Map();
  hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
  hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
    ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.EAN_8,
    ZXing.BarcodeFormat.UPC_A, ZXing.BarcodeFormat.UPC_E,
    ZXing.BarcodeFormat.CODE_128, ZXing.BarcodeFormat.CODE_39,
    ZXing.BarcodeFormat.ITF
  ]);
  return new ZXing.BrowserMultiFormatReader(hints, 150);
}
async function openScan(target) {
  if (typeof ZXing === 'undefined') return toast('Библиотека сканера не загрузилась');
  camTarget = target || 'add';
  camMode = 'barcode';
  openCam('Штрих-код', false);
  setCamStatus('Запускаю камеру…');
  try {
    camReader = makeBarcodeReader();
    const video = document.getElementById('camVideo');
    camControls = await camReader.decodeFromConstraints(
      { video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } },
      video, (result) => { if (result) onBarcode(result.getText()); });
    setCamStatus('Держи штрих-код горизонтально в рамке, поближе');
  } catch (e) { setCamStatus('Камера недоступна: ' + e.message + '. Можно выбрать фото из галереи.'); }
}
async function onBarcode(code) {
  stopCam();
  setCamStatus('Код ' + code + ' — ищу в базе Open Food Facts…');
  try {
    const url = 'https://world.openfoodfacts.org/api/v2/product/' +
      encodeURIComponent(code) + '.json?fields=product_name,brands,nutriments';
    const d = await (await fetch(url)).json();
    if (!d.product || d.status === 0) throw new Error('нет в базе');
    const p = d.product, n = p.nutriments || {};
    const name = (p.product_name || ('Штрих-код ' + code)).trim() +
      (p.brands ? ' (' + p.brands.split(',')[0].trim() + ')' : '');
    fillFromNutriments(name, n, 'Из штрих-кода');
    closeCam(); toast('Найдено: ' + name);
    return true;
  } catch (e) {
    setCamStatus('Этого штрих-кода нет в базе. Введи вручную или наведи ещё раз.');
    if (camMode === 'barcode' && !document.getElementById('camModal').classList.contains('hidden')) {
      setTimeout(() => { if (camMode === 'barcode') openScan(camTarget); }, 2500);
    }
    return false;
  }
}
function fillFromNutriments(name, n, tag) {
  const kcal = Math.round(n['energy-kcal_100g'] || 0);
  const p = r1(n['proteins_100g'] || 0), fat = r1(n['fat_100g'] || 0), carb = r1(n['carbohydrates_100g'] || 0);
  if (camTarget === 'advisor') {   // экран «Совет» — можно ли съесть
    go('advisor');
    if (name) set('advSearch', name);
    set('advK', kcal); set('advF', fat); set('advC', carb);
    document.getElementById('advG').focus();  // осталось указать порцию
    return;
  }
  go('add');
  if (name) set('mName', name);
  set('mK', kcal); set('mP', p); set('mF', fat); set('mC', carb);
  document.getElementById('manualTitle').textContent = tag + ': ' + (name || 'проверь цифры');
  document.getElementById('mGrams').focus();
}
function fillFromLabel(x) {
  if (camTarget === 'advisor') {
    go('advisor');
    if (x.kcal != null) set('advK', Math.round(x.kcal));
    if (x.f != null) set('advF', r1(x.f));
    if (x.c != null) set('advC', r1(x.c));
    document.getElementById('advG').focus();
    return;
  }
  go('add');
  if (x.kcal != null) set('mK', Math.round(x.kcal));
  if (x.p != null) set('mP', r1(x.p));
  if (x.f != null) set('mF', r1(x.f));
  if (x.c != null) set('mC', r1(x.c));
  document.getElementById('manualTitle').textContent = 'Из этикетки — проверь цифры глазами!';
}

// ---- ЭТИКЕТКА через OCR (Tesseract) ----
async function openLabel(target) {
  camTarget = target || 'add';
  camMode = 'label';
  openCam('Фото этикетки', true);
  setCamStatus('Наведи на таблицу «пищевая ценность на 100 г» и нажми «Снять»');
  try {
    camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    const v = document.getElementById('camVideo'); v.srcObject = camStream; await v.play();
  } catch (e) { setCamStatus('Камера недоступна: ' + e.message + '. Выбери фото из галереи.'); }
}
function captureLabel() {
  const v = document.getElementById('camVideo'), c = document.getElementById('camCanvas');
  if (!v.videoWidth) return toast('Камера ещё не готова');
  c.width = v.videoWidth; c.height = v.videoHeight;
  c.getContext('2d').drawImage(v, 0, 0);
  runLabelOCR(c);
}
function pickPhoto() { document.getElementById('photoFile').click(); }
function onPhotoFile(ev) {
  const file = ev.target.files[0]; if (!file) return;
  const url = URL.createObjectURL(file);
  if (camMode === 'barcode') {
    const rdr = makeBarcodeReader();
    rdr.decodeFromImageUrl(url).then(res => onBarcode(res.getText()))
      .catch(() => setCamStatus('На фото не найден штрих-код. Сфоткай чётче и горизонтально.'));
  } else {
    const img = new Image();
    img.onload = () => { const c = document.getElementById('camCanvas'); c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0); runLabelOCR(c); };
    img.src = url;
  }
}
// Разбор КБЖУ из распознанного текста этикетки (эвристика, значения на 100 г).
function parseLabel(text) {
  const t = (text || '').toLowerCase().replace(/,/g, '.');
  const near = keys => {
    for (const k of keys) {
      const i = t.indexOf(k);
      if (i >= 0) {
        const m = t.slice(i + k.length, i + k.length + 40).match(/(\d+(?:\.\d+)?)/);
        if (m) return parseFloat(m[1]);
      }
    }
    return null;
  };
  // Калории: обычно число ПЕРЕД «kcal/ккал» (539 kcal); в США — «Calories 539» (число после).
  let kcal = null;
  const m1 = t.match(/(\d+(?:\.\d+)?)\s*(?:kcal|ккал)/);
  if (m1) kcal = parseFloat(m1[1]);
  else { const m2 = t.match(/(?:calories|калорийн)[^\d]{0,15}(\d+(?:\.\d+)?)/); if (m2) kcal = parseFloat(m2[1]); }
  return {
    // ключи: чешский, русский, английский, немецкий
    kcal: kcal,
    p: near(['bílkovin', 'bilkovin', 'белк', 'белок', 'protein', 'eiweiß', 'eiweiss', 'eiwei']),
    f: near(['tuky', 'tuk', 'жир', 'fett', 'fat']),
    c: near(['sacharid', 'углевод', 'kohlenhydr', 'kohlenh', 'carbohydr', 'carbo'])
  };
}
async function runLabelOCR(canvas) {
  if (typeof Tesseract === 'undefined') { setCamStatus('OCR не загрузился (нужен интернет). Введи вручную.'); return; }
  setCamStatus('Распознаю текст… это занимает несколько секунд');
  try {
    const { data } = await Tesseract.recognize(canvas, 'eng');
    const x = parseLabel(data.text);
    fillFromLabel(x);
    closeCam();
    toast(x.kcal != null ? 'Распознал — проверь и поправь' : 'Текст распознан частично, впиши сама');
  } catch (e) { setCamStatus('Не удалось распознать: ' + e.message); }
}

/* ---- СОВЕТНИК ---- */
function advSearchFood() {
  const q = document.getElementById('advSearch').value;
  const res = matchFoods(q);
  document.getElementById('advRes').innerHTML = res.map(f =>
    '<div class="res" onclick="advPick(' + allFoods().indexOf(f) + ')"><b>' + esc(f.n) + '</b>' +
    '<div class="k">' + f.k + ' ккал (на 100 г)</div></div>'
  ).join('');
}
function advPick(i) {
  const f = allFoods()[i];
  document.getElementById('advK').value = f.k;
  document.getElementById('advF').value = f.f;
  document.getElementById('advC').value = f.c;
  document.getElementById('advSearch').value = f.n;
  document.getElementById('advRes').innerHTML = '';
  document.getElementById('advG').focus();
}
function advScale() { /* значения на 100 г — пересчёт в runAdvice */ }
function runAdvice() {
  if (!S.profile) return toast('Сначала заполни профиль');
  const g = parseFloat(document.getElementById('advG').value) || 100;
  const m = g / 100;
  const cand = {
    kcal: (parseFloat(document.getElementById('advK').value) || 0) * m,
    protein_g: 0,
    fat_g: (parseFloat(document.getElementById('advF').value) || 0) * m,
    carb_g: (parseFloat(document.getElementById('advC').value) || 0) * m
  };
  const dd = day();
  const t = NT.computeTargets(S.profile, dd);
  const eaten = NT.sumDay(dd.foods);
  const a = NT.advise(t, eaten, cand);
  const emoji = a.tone === 'ok' ? '✅' : a.tone === 'warn' ? '⚠️' : '🛑';
  document.getElementById('adviceOut').innerHTML =
    '<div class="verdict ' + a.tone + '">' + emoji + ' ' + a.verdict +
    '<div class="sub" style="margin-top:8px">Порция ' + g + ' г ≈ ' + Math.round(cand.kcal) + ' ккал. ' +
    'Сейчас осталось: ' + Math.round(a.remaining.kcal) + ' ккал, жиров ' + r1(a.remaining.fat_g) +
    ' г, углеводов ' + r1(a.remaining.carb_g) + ' г.</div></div>';
}

/* ---- АКТИВНОСТЬ ---- */
function renderActivity() {
  const dd = day();
  document.getElementById('aSteps').value = dd.steps || '';
  stepsHint();
  renderWorkouts();
  renderWeekMuscles();
  renderBodyMap();
  renderCalendar();
}
function stepsHint() {
  if (!S.profile) return;
  const s = parseFloat(document.getElementById('aSteps').value) || 0;
  document.getElementById('stepsKcalHint').textContent =
    '≈ ' + Math.round(NT.stepsKcal(s, S.profile.weightKg)) + ' ккал к расходу';
}
function saveActivity() {
  day().steps = parseFloat(document.getElementById('aSteps').value) || 0;
  save(); stepsHint(); toast('Шаги сохранены');
}
function addWorkout() {
  if (!S.profile) return toast('Сначала заполни профиль');
  const type = document.getElementById('aType').value;
  const min = parseFloat(document.getElementById('aMin').value);
  if (!min || min <= 0) return toast('Введи минуты');
  const label = document.getElementById('aType').selectedOptions[0].text;
  const kcal = NT.workoutKcal(NT.MET[type], min, S.profile.weightKg);
  day().workouts.push({ name: label, min, kcal });
  save(); document.getElementById('aMin').value = '';
  renderWorkouts(); toast('Тренировка добавлена');
}
function renderWorkouts() {
  const dd = day();
  document.getElementById('woList').innerHTML = (dd.workouts || []).map((w, i) => {
    let detail = w.min + ' мин';
    if (w.kind === 'strength' && w.exercises) {
      detail = w.exercises.map(e => esc(e.name) + ' ' + e.sets + '×' + e.reps +
        (e.weight ? ' · ' + e.weight + ' кг' : '')).join('<br>');
    }
    return '<div class="foodrow"><div><div class="nm">' + esc(w.name) + ' · ' + w.min + ' мин</div>' +
      '<div class="meta">' + detail + '</div></div>' +
      '<div class="row" style="gap:8px"><b>+' + Math.round(w.kcal) + '</b><button class="del" onclick="delWorkout(' + i + ')">✕</button></div></div>';
  }).join('') || '<p class="sub">Пока пусто.</p>';
}
function delWorkout(i) { day().workouts.splice(i, 1); save(); renderWorkouts(); renderWeekMuscles(); }

/* ---- КОНСТРУКТОР СИЛОВОЙ ---- */
let session = [];        // упражнения текущей собираемой тренировки
let exPicked = null;     // выбранное из базы упражнение (для met)
function searchEx() {
  const q = document.getElementById('exSearch').value.toLowerCase().trim();
  const res = q ? EXERCISES.filter(e => e.n.toLowerCase().includes(q) || e.m.toLowerCase().includes(q)).slice(0, 12) : [];
  document.getElementById('exRes').innerHTML = res.map((e, i) =>
    '<div class="res" onclick="pickEx(' + EXERCISES.indexOf(e) + ')"><b>' + esc(e.n) + '</b>' +
    '<div class="k">' + e.m + '</div></div>'
  ).join('');
}
function pickEx(i) {
  exPicked = EXERCISES[i];
  document.getElementById('exSearch').value = exPicked.n;
  document.getElementById('exRes').innerHTML = '';
  document.getElementById('exSets').focus();
}
function addExercise() {
  const name = document.getElementById('exSearch').value.trim();
  if (!name) return toast('Выбери упражнение');
  const sets = parseInt(document.getElementById('exSets').value) || 0;
  const reps = parseInt(document.getElementById('exReps').value) || 0;
  if (!sets || !reps) return toast('Введи подходы и повторы');
  const met = (exPicked && exPicked.n === name) ? exPicked.met : 4.5; // 4.5 если ввела своё
  const m = (exPicked && exPicked.n === name) ? exPicked.m : 'Другое';
  session.push({ name, sets, reps, weight: parseFloat(document.getElementById('exW').value) || 0, met, m });
  ['exSearch', 'exSets', 'exReps', 'exW'].forEach(id => document.getElementById(id).value = '');
  exPicked = null;
  renderSession();
}
// Цвета групп мышц (единые по всему приложению)
const MUSCLE_COLORS = {
  'Ноги': '#3aa0ff', 'Ягодицы': '#4cc2a3', 'Икры': '#7ec8e3', 'Спина': '#a06cf0',
  'Грудь': '#e5624b', 'Плечи': '#e6a94c', 'Руки': '#f0a3c8', 'Пресс': '#8bd450', 'Другое': '#8b98a8'
};
function mColor(g) { return MUSCLE_COLORS[g] || '#8b98a8'; }

// Рисует разбор {группа:подходы} в элемент: полоса-распределение + строки с барами.
function renderMuscleBars(el, map, opts) {
  opts = opts || {};
  const groups = Object.keys(map).sort((a, b) => map[b] - map[a]);
  if (!groups.length) { el.innerHTML = opts.empty ? '<p class="sub">' + opts.empty + '</p>' : ''; return; }
  const total = groups.reduce((s, g) => s + map[g], 0);
  const max = Math.max.apply(null, groups.map(g => map[g]));
  const stacked = '<div class="mbar">' + groups.map(g =>
    '<span style="width:' + (map[g] / total * 100) + '%;background:' + mColor(g) + '"></span>').join('') + '</div>';
  const rows = groups.map(g =>
    '<div class="mrow"><span class="mdot" style="background:' + mColor(g) + '"></span>' +
    '<span class="mname">' + g + '</span>' +
    '<span class="mtrack"><span style="width:' + (map[g] / max * 100) + '%;background:' + mColor(g) + '"></span></span>' +
    '<span class="mcount">' + map[g] + ' подх.</span></div>').join('');
  el.innerHTML = stacked + rows;
}

function renderSession() {
  const list = document.getElementById('sessionList');
  const sum = document.getElementById('sessionSum');
  const mus = document.getElementById('sessionMuscles');
  if (!session.length) { list.innerHTML = ''; sum.innerHTML = ''; mus.innerHTML = ''; return; }
  list.innerHTML = session.map((e, i) =>
    '<div class="foodrow"><div class="nm"><span class="mdot" style="background:' + mColor(e.m) +
    ';display:inline-block;vertical-align:middle;margin-right:6px"></span>' + esc(e.name) + ' — ' + e.sets + '×' + e.reps +
    (e.weight ? ' · ' + e.weight + ' кг' : '') + '</div>' +
    '<button class="del" onclick="rmEx(' + i + ')">✕</button></div>'
  ).join('');
  renderMuscleBars(mus, NT.setsByMuscle([{ exercises: session }]));
  const est = NT.strengthSession(session, S.profile.weightKg);
  sum.innerHTML = '<div class="note">Оценка: ~' + est.min + ' мин, ~' + est.kcal +
    ' ккал (приблизительно). <br><button class="link" onclick="saveSession()">Сохранить тренировку в дневник →</button></div>';
}

// Суммарная нагрузка по группам за 7 дней до curDate включительно.
function weeklyMap() {
  const map = {};
  for (let i = 0; i < 7; i++) {
    const dt = new Date(curDate); dt.setDate(dt.getDate() - i);
    const daily = NT.setsByMuscle((S.days[todayStr(dt)] || {}).workouts);
    Object.keys(daily).forEach(g => map[g] = (map[g] || 0) + daily[g]);
  }
  return map;
}

/* ---- СИЛУЭТ ТЕЛА (тепловая карта проработанных мышц) ---- */
function hexA(hex, a) {
  const n = parseInt(hex.replace('#', ''), 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}
function muscleFill(g, sets) {
  if (!sets) return 'var(--card2)';
  return hexA(mColor(g), 0.3 + 0.7 * Math.min(1, sets / 12));  // 12 подх/нед = полный цвет
}
// Анатомические мышцы (slug из карты) → наши группы. Остальное (голова, кисти,
// стопы, шея, колени) — нейтральная «база тела».
const SLUG_GROUP = {
  quadriceps: 'Ноги', hamstring: 'Ноги', adductors: 'Ноги',
  gluteal: 'Ягодицы', calves: 'Икры', tibialis: 'Икры',
  'upper-back': 'Спина', 'lower-back': 'Спина', trapezius: 'Спина',
  chest: 'Грудь', deltoids: 'Плечи',
  biceps: 'Руки', triceps: 'Руки', forearm: 'Руки',
  abs: 'Пресс', obliques: 'Пресс'
};
function figureSVG(side, map) {
  const data = side === 'front' ? MMAP.front : MMAP.back;
  const vb = side === 'front' ? '-50 -40 734 1538' : '756 0 774 1448';
  let base = '', muscles = '';
  data.forEach(m => {
    const grp = SLUG_GROUP[m.s];
    const fill = grp ? muscleFill(grp, map[grp] || 0) : 'var(--line)';
    const op = grp ? '1' : '.5';
    const p = m.d.map(d => '<path d="' + d + '" fill="' + fill + '" opacity="' + op + '"/>').join('');
    if (grp) muscles += p; else base += p;
  });
  return '<svg viewBox="' + vb + '" class="bodyfig" preserveAspectRatio="xMidYMid meet" ' +
    'stroke="var(--bg)" stroke-width="2.5" stroke-linejoin="round">' + base + muscles + '</svg>';
}
function renderBodyMap() {
  const map = weeklyMap();
  document.getElementById('bodyMap').innerHTML =
    '<div class="bodywrap">' +
    '<div class="bodycol"><div class="bodylbl">Спереди</div>' + figureSVG('front', map) + '</div>' +
    '<div class="bodycol"><div class="bodylbl">Сзади</div>' + figureSVG('back', map) + '</div></div>';
}

/* ---- КАЛЕНДАРЬ ТРЕНИРОВОК ---- */
let calRef = null;
function calShift(n) {
  const d = new Date(calRef.y, calRef.m + n, 1);
  calRef = { y: d.getFullYear(), m: d.getMonth() };
  renderCalendar();
}
function pickCalDay(ds) { curDate = ds; renderActivity(); toast('День: ' + ds); }
function renderCalendar() {
  if (!calRef) { const d = new Date(curDate); calRef = { y: d.getFullYear(), m: d.getMonth() }; }
  const y = calRef.y, m = calRef.m;
  const first = new Date(y, m, 1);
  const monthName = first.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
  const startDow = (first.getDay() + 6) % 7;         // Пн = 0
  const daysIn = new Date(y, m + 1, 0).getDate();
  const dow = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  let cells = '';
  for (let i = 0; i < startDow; i++) cells += '<div class="cal-cell empty"></div>';
  for (let dn = 1; dn <= daysIn; dn++) {
    const ds = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(dn).padStart(2, '0');
    const dd = S.days[ds] || {};
    const groups = NT.musclesTrained(dd.workouts);
    const ate = (dd.foods || []).length > 0;
    const dots = groups.slice(0, 4).map(g => '<span class="cdot" style="background:' + mColor(g) + '"></span>').join('');
    cells += '<div class="cal-cell' + (ds === todayStr() ? ' today' : '') + (ds === curDate ? ' cur' : '') +
      '" onclick="pickCalDay(\'' + ds + '\')"><span class="cnum">' + dn + (ate ? '<i class="cate"></i>' : '') +
      '</span><div class="cdots">' + dots + '</div></div>';
  }
  document.getElementById('calendar').innerHTML =
    '<div class="cal-head"><button class="calnav" onclick="calShift(-1)">‹</button><b>' + monthName +
    '</b><button class="calnav" onclick="calShift(1)">›</button></div>' +
    '<div class="cal-grid">' + dow.map(x => '<div class="cal-dow">' + x + '</div>').join('') + cells + '</div>';
}

// Недельная нагрузка по группам + предупреждение о восстановлении.
function renderWeekMuscles() {
  const map = weeklyMap();
  renderMuscleBars(document.getElementById('weekMuscles'), map, { empty: 'За неделю силовых пока нет.' });

  // сравнение с предыдущим днём
  const today = NT.musclesTrained(day(curDate).workouts);
  const yd = new Date(curDate); yd.setDate(yd.getDate() - 1);
  const yest = NT.musclesTrained((S.days[todayStr(yd)] || {}).workouts);
  const overlap = today.filter(g => yest.includes(g));
  const note = document.getElementById('recoveryNote');
  if (overlap.length) {
    note.innerHTML = '<div class="verdict warn">⚠️ Вчера уже была нагрузка на: <b>' + overlap.join(', ') +
      '</b>. Мышцам нужно ~48 ч на восстановление — для роста лучше дать этим группам отдохнуть или сменить акцент.</div>';
  } else {
    note.innerHTML = '';
  }
}
function rmEx(i) { session.splice(i, 1); renderSession(); }
function saveSession() {
  if (!session.length) return;
  const est = NT.strengthSession(session, S.profile.weightKg);
  day().workouts.push({
    name: 'Силовая (' + session.length + ' упр.)', kind: 'strength',
    exercises: session.slice(), min: est.min, kcal: est.kcal
  });
  session = []; save(); renderSession(); renderWorkouts(); renderWeekMuscles();
  toast('Тренировка сохранена');
}

document.addEventListener('input', e => { if (e.target.id === 'aSteps') stepsHint(); });

/* ---- ПРОФИЛЬ ---- */
function fillProfile() {
  const p = S.profile;
  const def = { sex: 'f', age: '', heightCm: '', weightKg: '', bodyFatPct: '', leanMassKg: '',
    tdeeModel: 'baseline', activity: 'light', goal: 'maintain', proteinPerKg: 1.5, fatPerKg: 0.8 };
  const v = p || def;
  set('pSex', v.sex); set('pAge', v.age); set('pH', v.heightCm); set('pW', v.weightKg);
  set('pBF', v.bodyFatPct); set('pLBM', v.leanMassKg); set('pTdee', v.tdeeModel);
  set('pAct', v.activity); set('pGoal', v.goal); set('pProt', v.proteinPerKg); set('pFat', v.fatPerKg);
  toggleMult();
  if (p) previewTargets();
}
document.addEventListener('change', e => { if (e.target.id === 'pTdee') toggleMult(); });
function toggleMult() {
  document.getElementById('multWrap').classList.toggle('hidden',
    document.getElementById('pTdee').value !== 'multiplier');
}
function saveProfile() {
  const w = parseFloat(val('pW'));
  const h = parseFloat(val('pH'));
  const a = parseFloat(val('pAge'));
  if (!w || !h || !a) return toast('Заполни возраст, рост и вес');
  S.profile = {
    sex: val('pSex'), age: a, heightCm: h, weightKg: w,
    bodyFatPct: parseFloat(val('pBF')) || null,
    leanMassKg: parseFloat(val('pLBM')) || null,
    formula: 'auto',
    tdeeModel: val('pTdee'), activity: val('pAct'), goal: val('pGoal'),
    proteinPerKg: parseFloat(val('pProt')) || 1.5,
    fatPerKg: parseFloat(val('pFat')) || 0.8
  };
  save(); previewTargets(); toast('Профиль сохранён');
}
function previewTargets() {
  const t = NT.computeTargets(S.profile, day());
  const lbm = NT.leanMass(S.profile);
  document.getElementById('targetPreview').innerHTML =
    '<div class="verdict ok" style="margin-top:14px"><b>Твоя норма на день:</b><br>' +
    '🔥 ' + t.kcal + ' ккал &nbsp; · &nbsp; Б ' + t.protein_g + ' г · Ж ' + t.fat_g + ' г · У ' + t.carb_g + ' г' +
    '<div class="sub" style="margin-top:8px">Обмен покоя ' + t.bmr + ' ккал' +
    (lbm ? ' (Катч-МакАрдл, сухая масса ' + r1(lbm) + ' кг)' : ' (Mifflin-St Jeor)') +
    ' · расход ' + t.tdee + ' ккал.</div></div>' +
    t.notes.map(n => '<div class="note">' + n + '</div>').join('');
}

/* ---- ВЕС ---- */
function logWeight() {
  const kg = parseFloat(document.getElementById('wKg').value);
  if (!kg || kg <= 0) return toast('Введи вес');
  const ex = S.weights.find(x => x.date === curDate);
  if (ex) ex.kg = kg; else S.weights.push({ date: curDate, kg });
  save(); document.getElementById('wKg').value = '';
  renderWeight(); toast('Вес записан');
}
function renderWeight() {
  const trend = NT.weightTrend(S.weights);
  drawWeight(trend);
  const stat = document.getElementById('wStat');
  if (trend.length) {
    const last = trend[trend.length - 1];
    let change = '';
    if (trend.length >= 8) {
      const prev = trend[trend.length - 8].avg;
      const d = last.avg - prev;
      change = '<span class="pill">' + (d >= 0 ? '+' : '') + r1(d) + ' кг / нед</span>';
    }
    stat.innerHTML = '<span class="sub">Среднее: <b>' + last.avg + ' кг</b></span>' + change;
  } else stat.innerHTML = '<span class="sub">Пока нет записей.</span>';
  document.getElementById('wLog').innerHTML = [...S.weights].reverse().slice(0, 14).map(w =>
    '<div class="foodrow"><span class="nm">' + w.date + '</span><b>' + w.kg + ' кг</b></div>'
  ).join('');
}
function drawWeight(trend) {
  const c = document.getElementById('wChart'), ctx = c.getContext('2d');
  const W = c.width, H = c.height; ctx.clearRect(0, 0, W, H);
  if (trend.length < 2) { ctx.fillStyle = getCss('--dim'); ctx.font = '13px sans-serif';
    ctx.fillText('Записывай вес несколько дней — появится линия тренда', 10, H / 2); return; }
  const all = trend.flatMap(t => [t.kg, t.avg]);
  const min = Math.min(...all) - 0.5, max = Math.max(...all) + 0.5;
  const x = i => 30 + i / (trend.length - 1) * (W - 45);
  const y = v => H - 20 - (v - min) / (max - min) * (H - 35);
  // сырой вес — точки
  ctx.fillStyle = getCss('--dim');
  trend.forEach((t, i) => { ctx.beginPath(); ctx.arc(x(i), y(t.kg), 2.5, 0, Math.PI * 2); ctx.fill(); });
  // среднее — линия
  ctx.strokeStyle = getCss('--accent'); ctx.lineWidth = 2.5; ctx.beginPath();
  trend.forEach((t, i) => { const px = x(i), py = y(t.avg); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
  ctx.stroke();
}

/* ---- ДАННЫЕ ---- */
function exportData() {
  const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'lifestyle-backup-' + todayStr() + '.json'; a.click();
  toast('Файл бэкапа сохранён');
}
function importData(ev) {
  const file = ev.target.files[0]; if (!file) return;
  const rd = new FileReader();
  rd.onload = () => {
    try { S = JSON.parse(rd.result); save(); toast('Данные загружены'); go('diary'); }
    catch (e) { toast('Не удалось прочитать файл'); }
  };
  rd.readAsText(file);
}

/* ---- утилиты ---- */
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function r1(n) { return Math.round(n * 10) / 10; }
function set(id, v) { const e = document.getElementById(id); if (e) e.value = (v == null ? '' : v); }
function val(id) { return document.getElementById(id).value; }

/* ---- старт ---- */
if ('serviceWorker' in navigator && !location.search.includes('nosw')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
go('diary');
