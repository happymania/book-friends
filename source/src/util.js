const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 헷갈리는 0,O,1,I,L 제외

export function genCode(len = 6) {
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => ALPHABET[n % ALPHABET.length]).join('');
}

export async function hashPin(familyId, pin) {
  const data = new TextEncoder().encode(`${familyId}:${pin}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function today() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export const LIB = {
  none: { label: '미확보', icon: '·' },
  borrowed: { label: '대출중', icon: '📚' },
  returned: { label: '반납완료', icon: '✅' },
  purchased: { label: '구매완료', icon: '🛒' },
};
export const READ = {
  none: { label: '안읽음', icon: '😴' },
  reading: { label: '읽는중', icon: '📖' },
  done: { label: '완독!', icon: '🏆' },
};
export const CATS = ['문학', '과학', '수학', '사회', '인물', '기타'];
export const KID_EMOJIS = ['🦊', '🐻', '🐰', '🐼', '🦁', '🐯', '🐸', '🐧', '🦄', '🐱'];

// ---- CSV ----
export function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

export function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadCsv(filename, rows) {
  const body = rows.map((r) => r.map(csvEscape).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

export const CONTACT_EMAIL = 'yclee729@gmail.com';
export const contactHref = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('[책은 내 친구] 문의')}`;

// 글자 크기: normal | lg | xl
const FS = ['normal', 'lg', 'xl'];
export function getFontSize() { try { const v = localStorage.getItem('bf_fs'); return FS.includes(v) ? v : 'normal'; } catch { return 'normal'; } }
export function applyFontSize(v) { document.documentElement.dataset.fs = v; try { localStorage.setItem('bf_fs', v); } catch { /* 무시 */ } }
export function nextFontSize() { const n = FS[(FS.indexOf(getFontSize()) + 1) % FS.length]; applyFontSize(n); return n; }
export const FS_LABEL = { normal: '보통', lg: '크게', xl: '아주 크게' };
