// 순수 계산 함수 모음 (화면·DB와 무관, 단위 시험 가능)

const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const utc = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
export const daysBetween = (a, b) => Math.round((utc(b) - utc(a)) / 86400000);

// 월요일 시작 주의 시작일(YYYY-MM-DD)
export function weekStart(s) {
  const t = new Date(utc(s));
  const dow = (t.getUTCDay() + 6) % 7; // 월=0
  t.setUTCDate(t.getUTCDate() - dow);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
const addDays = (s, n) => { const t = new Date(utc(s)); t.setUTCDate(t.getUTCDate() + n); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`; };

const isDone = (records, id) => records[id]?.read === 'done';

/* ---------- 읽기 목표 범위 ---------- */
// goalTarget: 'all' | 'selected' | 'recommended' | 'cat:문학' 등
export function targetBooks(books, gt, ids = []) {
  if (gt === 'custom') return books.filter((b) => ids.includes(b.id));
  if (gt === 'selected') return books.filter((b) => b.type === '선정');
  if (gt === 'recommended') return books.filter((b) => b.type === '권장');
  if (typeof gt === 'string' && gt.startsWith('cat:')) return books.filter((b) => b.cat === gt.slice(4));
  return books;
}
export function targetLabel(gt) {
  if (gt === 'custom') return '선택한 책';
  if (gt === 'selected') return '선정도서';
  if (gt === 'recommended') return '권장도서';
  if (typeof gt === 'string' && gt.startsWith('cat:')) return gt.slice(4) + ' 분류';
  return '전체 도서';
}
export function goalOptions(books) {
  const opts = [{ value: 'all', label: `전체 도서 (${books.length}권)` }, { value: 'custom', label: '직접 고르기 (책을 하나씩 추가)' }];
  const sel = targetBooks(books, 'selected').length, rec = targetBooks(books, 'recommended').length;
  if (sel) opts.push({ value: 'selected', label: `선정도서 전체 (${sel}권)` });
  if (rec) opts.push({ value: 'recommended', label: `권장도서 전체 (${rec}권)` });
  [...new Set(books.map((b) => b.cat).filter(Boolean))].forEach((c) => {
    opts.push({ value: 'cat:' + c, label: `${c} 분류 전체 (${targetBooks(books, 'cat:' + c).length}권)` });
  });
  return opts;
}

/* ---------- 읽기 페이스 ---------- */
export function computePace({ books, records, family, today }) {
  const target = targetBooks(books, family?.goalTarget, family?.goalBookIds || []);
  const total = target.length;
  const doneBooks = target.filter((b) => isDone(records, b.id));
  const done = doneBooks.length;
  const remaining = total - done;
  const ws = weekStart(today);
  const thisWeek = doneBooks.filter((b) => (records[b.id]?.done_date || '') >= ws).length;
  const base = { total, done, remaining, thisWeek, targetLabel: targetLabel(family?.goalTarget) };
  if (!family?.deadline) return { ...base, hasGoal: false };
  const days = daysBetween(today, family.deadline);
  if (total === 0) return { ...base, hasGoal: true, days, level: 'none', perWeek: 0 };
  if (remaining === 0) return { ...base, hasGoal: true, days, level: 'complete', perWeek: 0 };
  if (days < 0) return { ...base, hasGoal: true, days, level: 'over', perWeek: 0 };
  const weeksLeft = Math.max(1, Math.ceil((days + 1) / 7));
  const perWeek = Math.ceil(remaining / weeksLeft);
  const level = perWeek <= 1 ? 'easy' : perWeek <= 3 ? 'ok' : 'tight';
  return { ...base, hasGoal: true, days, weeksLeft, perWeek, level };
}

/* ---------- 배지 ---------- */
const CAT_ICON = { 문학: '📖', 과학: '🔬', 수학: '➗', 사회: '🌏', 인물: '🧑‍🏫' };

export function streakWeeks(records, today) {
  const weeks = new Set();
  Object.values(records).forEach((r) => { if (r?.read === 'done' && r.done_date) weeks.add(weekStart(r.done_date)); });
  let cur = weekStart(today);
  if (!weeks.has(cur)) cur = addDays(cur, -7); // 이번 주에 아직 없으면 지난주부터 센다
  let n = 0;
  while (weeks.has(cur)) { n++; cur = addDays(cur, -7); }
  return n;
}

export function computeBadges(books, records, today) {
  const done = books.filter((b) => isDone(records, b.id));
  const n = done.length;
  const out = [];
  [[1, '🌱', '첫 완독'], [3, '📗', '3권 달성'], [5, '⭐', '5권 달성'], [10, '🥉', '10권 달성'],
    [20, '🥈', '20권 달성'], [30, '🥇', '30권 달성'], [50, '💎', '50권 달성']].forEach(([t, icon, name]) => {
    out.push({ id: 'n' + t, icon, name, desc: `${t}권을 완독했어요`, earned: n >= t, progress: `${Math.min(n, t)}/${t}`, group: '권수' });
  });
  const sel = books.filter((b) => b.type === '선정');
  if (sel.length) {
    const d = sel.filter((b) => isDone(records, b.id)).length;
    out.push({ id: 'sel', icon: '🏆', name: '선정도서 마스터', desc: `선정도서 ${sel.length}권을 모두 읽었어요`, earned: d === sel.length, progress: `${d}/${sel.length}`, group: '도전' });
  }
  const cats = [...new Set(books.map((b) => b.cat))];
  cats.forEach((c) => {
    const arr = books.filter((b) => b.cat === c);
    if (arr.length < 3) return;
    const d = arr.filter((b) => isDone(records, b.id)).length;
    out.push({ id: 'cat-' + c, icon: CAT_ICON[c] || '📚', name: `${c} 박사`, desc: `${c} 책 ${arr.length}권을 모두 읽었어요`, earned: d === arr.length, progress: `${d}/${arr.length}`, group: '분류' });
  });
  const month = today.slice(0, 7);
  const mCount = done.filter((b) => (records[b.id]?.done_date || '').startsWith(month)).length;
  out.push({ id: 'month', icon: '🔥', name: '이달의 독서왕', desc: '이번 달에 4권 이상 완독했어요', earned: mCount >= 4, progress: `${Math.min(mCount, 4)}/4`, group: '꾸준함' });
  const st = streakWeeks(records, today);
  [[2, '🔁'], [4, '🚀'], [8, '🌟']].forEach(([t, icon]) => {
    out.push({ id: 'w' + t, icon, name: `${t}주 연속`, desc: `${t}주 연속으로 매주 한 권 이상 완독했어요`, earned: st >= t, progress: `${Math.min(st, t)}/${t}`, group: '꾸준함' });
  });
  return { badges: out, streak: st, doneCount: n, monthCount: mCount };
}

export const earnedIds = (res) => new Set(res.badges.filter((b) => b.earned).map((b) => b.id));

/* ---------- 학급 집계 (아이 이름 없이 숫자만) ---------- */
export const MIN_KIDS = 5;

export function aggregateClass(statDocs, books) {
  const kids = statDocs.length;
  const base = { kids, enough: kids >= MIN_KIDS, minKids: MIN_KIDS };
  if (!base.enough) return base;
  const totalDone = statDocs.reduce((s, d) => s + (d.done || 0), 0);
  const totalSel = statDocs.reduce((s, d) => s + (d.selDone || 0), 0);
  const reading = statDocs.reduce((s, d) => s + (d.reading || 0), 0);
  const cnt = {}, rcnt = {};
  statDocs.forEach((d) => {
    (d.doneIds || []).forEach((id) => { cnt[id] = (cnt[id] || 0) + 1; });
    (d.readingIds || []).forEach((id) => { rcnt[id] = (rcnt[id] || 0) + 1; });
  });
  const title = Object.fromEntries(books.map((b) => [b.id, b.title]));
  const top = (m, min) => Object.entries(m).filter(([id, c]) => c >= min && title[id]).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, c]) => ({ id, title: title[id], count: c }));
  return { ...base, totalDone, avgDone: Math.round((totalDone / kids) * 10) / 10, avgSel: Math.round((totalSel / kids) * 10) / 10, reading, popular: top(cnt, 2), nowReading: top(rcnt, 2).slice(0, 3) };
}

export function statPayload(books, records) {
  const doneIds = books.filter((b) => isDone(records, b.id)).map((b) => b.id);
  const readingIds = books.filter((b) => records[b.id]?.read === 'reading').map((b) => b.id);
  const selDone = books.filter((b) => b.type === '선정' && isDone(records, b.id)).length;
  return { done: doneIds.length, selDone, reading: readingIds.length, doneIds, readingIds };
}

export const titleKey = (t) => (t || '').toLowerCase().replace(/\s+/g, '');
