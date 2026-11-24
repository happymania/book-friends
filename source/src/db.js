import {
  doc, collection, getDoc, setDoc, updateDoc, deleteDoc, getDocs, query, where,
  writeBatch, serverTimestamp, deleteField,
} from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import { auth, db, firebaseConfig } from './firebase';
import { genCode, hashPin, today } from './util';
import { LIRA_G4 } from './template';

const fdoc = (fid, ...p) => doc(db, 'families', fid, ...p);
const fcol = (fid, ...p) => collection(db, 'families', fid, ...p);

async function commitChunks(ops) {
  // ops: [(batch) => void]  — 한 배치 최대 400건
  for (let i = 0; i < ops.length; i += 400) {
    const batch = writeBatch(db);
    ops.slice(i, i + 400).forEach((fn) => fn(batch));
    await batch.commit();
  }
}

/* ---------- 가족 만들기 / 참여 / 아이 연결 ---------- */
export async function createFamily(user, { familyName, school, className, useTemplate, kidName, kidEmoji, pin }) {
  const fid = doc(collection(db, 'families')).id;
  const kidId = doc(collection(db, 'families', fid, 'kids')).id;
  const connectCode = genCode(6);
  const inviteCode = genCode(6);

  await setDoc(fdoc(fid), {
    name: familyName, school: school || '', className: className || '',
    ownerUid: user.uid, createdAt: serverTimestamp(),
  });
  await setDoc(fdoc(fid, 'members', user.uid), {
    name: user.displayName || '', email: user.email || '', role: 'owner', createdAt: serverTimestamp(),
  });
  const pinHash = pin ? await hashPin(fid, pin) : '';
  const ops = [
    (b) => b.set(fdoc(fid, 'private', 'settings'), { pinHash, inviteCode }),
    (b) => b.set(fdoc(fid, 'kids', kidId), { name: kidName, emoji: kidEmoji, connectCode, order: 0, createdAt: serverTimestamp() }),
    (b) => b.set(doc(db, 'connectCodes', connectCode), { familyId: fid, kidId }),
    (b) => b.set(doc(db, 'invites', inviteCode), { familyId: fid }),
  ];
  if (useTemplate) {
    LIRA_G4.forEach((bk, i) => ops.push((b) => b.set(fdoc(fid, 'books', bk.id), { ...bk, order: i, lib: 'none' })));
  }
  await commitChunks(ops);
  await setDoc(doc(db, 'users', user.uid), { role: 'parent', familyId: fid, updatedAt: serverTimestamp() });
  return fid;
}

export async function joinFamily(user, rawCode) {
  const code = rawCode.trim().toUpperCase();
  const inv = await getDoc(doc(db, 'invites', code));
  if (!inv.exists()) throw new Error('초대 코드를 찾을 수 없어요. 다시 확인해 주세요.');
  const fid = inv.data().familyId;
  await setDoc(fdoc(fid, 'members', user.uid), {
    name: user.displayName || '', email: user.email || '', role: 'parent', code, createdAt: serverTimestamp(),
  });
  await setDoc(doc(db, 'users', user.uid), { role: 'parent', familyId: fid, updatedAt: serverTimestamp() });
  return fid;
}

export async function connectKidDevice(rawCode) {
  const code = rawCode.trim().toUpperCase();
  if (!auth.currentUser) await signInAnonymously(auth);
  const uid = auth.currentUser.uid;
  const snap = await getDoc(doc(db, 'connectCodes', code));
  if (!snap.exists()) throw new Error('연결 코드를 찾을 수 없어요. 부모님께 다시 확인해 보세요.');
  const { familyId, kidId } = snap.data();
  await setDoc(fdoc(familyId, 'devices', uid), { kidId, code, createdAt: serverTimestamp() });
  await setDoc(doc(db, 'users', uid), { role: 'kid', familyId, kidId, updatedAt: serverTimestamp() });
  return { familyId, kidId };
}

export async function disconnectKidDevice(familyId) {
  const uid = auth.currentUser.uid;
  await deleteDoc(fdoc(familyId, 'devices', uid)).catch(() => {});
  await deleteDoc(doc(db, 'users', uid)).catch(() => {});
}

/* ---------- 읽기/도서 상태 ---------- */
export function setLib(fid, bookId, lib) {
  return updateDoc(fdoc(fid, 'books', bookId), { lib });
}

export function setRead(fid, kidId, bookId, read, prevDate) {
  const done_date = read === 'done' ? (prevDate || today()) : '';
  return setDoc(fdoc(fid, 'kids', kidId, 'records', bookId), { read, done_date, updatedAt: serverTimestamp() }, { merge: true });
}

/* ---------- PIN ---------- */
export async function verifyPin(fid, pin) {
  const s = await getDoc(fdoc(fid, 'private', 'settings'));
  const h = s.exists() ? s.data().pinHash : '';
  if (!h) return true;
  return h === (await hashPin(fid, pin));
}
export async function hasPin(fid) {
  const s = await getDoc(fdoc(fid, 'private', 'settings'));
  return !!(s.exists() && s.data().pinHash);
}
export async function setPin(fid, pin) {
  const pinHash = pin ? await hashPin(fid, pin) : '';
  await setDoc(fdoc(fid, 'private', 'settings'), { pinHash }, { merge: true });
}

/* ---------- 아이 관리 ---------- */
export async function addKid(fid, { name, emoji, order }) {
  const kidId = doc(collection(db, 'families', fid, 'kids')).id;
  const connectCode = genCode(6);
  await setDoc(fdoc(fid, 'kids', kidId), { name, emoji, connectCode, order, createdAt: serverTimestamp() });
  await setDoc(doc(db, 'connectCodes', connectCode), { familyId: fid, kidId });
  return kidId;
}
export async function regenConnectCode(fid, kid) {
  const connectCode = genCode(6);
  await setDoc(doc(db, 'connectCodes', connectCode), { familyId: fid, kidId: kid.id });
  await updateDoc(fdoc(fid, 'kids', kid.id), { connectCode });
  if (kid.connectCode) await deleteDoc(doc(db, 'connectCodes', kid.connectCode)).catch(() => {});
  // 기존에 연결된 기기도 끊기
  const devs = await getDocs(query(fcol(fid, 'devices'), where('kidId', '==', kid.id)));
  await Promise.all(devs.docs.map((d) => deleteDoc(d.ref)));
  return connectCode;
}
export async function renameKid(fid, kidId, name, emoji) {
  await updateDoc(fdoc(fid, 'kids', kidId), { name, emoji });
}
export async function removeKid(fid, kid, classId) {
  if (classId) await deleteDoc(doc(db, 'classes', classId, 'stats', kid.id)).catch(() => {});
  const recs = await getDocs(fcol(fid, 'kids', kid.id, 'records'));
  await commitChunks(recs.docs.map((d) => (b) => b.delete(d.ref)));
  const devs = await getDocs(query(fcol(fid, 'devices'), where('kidId', '==', kid.id)));
  await Promise.all(devs.docs.map((d) => deleteDoc(d.ref)));
  if (kid.connectCode) await deleteDoc(doc(db, 'connectCodes', kid.connectCode)).catch(() => {});
  await deleteDoc(fdoc(fid, 'kids', kid.id));
}

/* ---------- 보호자 초대 ---------- */
export async function regenInviteCode(fid, oldCode) {
  const inviteCode = genCode(6);
  await setDoc(doc(db, 'invites', inviteCode), { familyId: fid });
  await setDoc(fdoc(fid, 'private', 'settings'), { inviteCode }, { merge: true });
  if (oldCode) await deleteDoc(doc(db, 'invites', oldCode)).catch(() => {});
  return inviteCode;
}

/* ---------- 도서 목록 관리 ---------- */
export async function addBook(fid, { type, title, cat }, order) {
  const id = 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  await setDoc(fdoc(fid, 'books', id), { id, type, title, cat, order, lib: 'none' });
}
export function deleteBook(fid, id) {
  return deleteDoc(fdoc(fid, 'books', id));
}
export async function importBooks(fid, rows, startOrder) {
  const ops = rows.map((r, i) => {
    const id = 'b' + Date.now().toString(36) + i.toString(36) + Math.random().toString(36).slice(2, 4);
    return (b) => b.set(fdoc(fid, 'books', id), { id, type: r.type, cat: r.cat, title: r.title, order: startOrder + i, lib: 'none' });
  });
  await commitChunks(ops);
}
export async function resetToTemplate(fid, existingBooks) {
  await commitChunks(existingBooks.map((bk) => (b) => b.delete(fdoc(fid, 'books', bk.id))));
  await commitChunks(LIRA_G4.map((bk, i) => (b) => b.set(fdoc(fid, 'books', bk.id), { ...bk, order: i, lib: 'none' })));
}
export async function updateFamilyInfo(fid, data) {
  await updateDoc(fdoc(fid), data);
}

/* ---------- 기존(Realtime DB) 데이터 가져오기 ---------- */
export async function importLegacy(fid, kidId, books) {
  const res = await fetch(`${firebaseConfig.databaseURL}/status.json`);
  if (!res.ok) throw new Error('기존 데이터를 읽지 못했어요. (' + res.status + ')');
  const data = (await res.json()) || {};
  const ids = new Set(books.map((b) => b.id));
  const ops = [];
  let n = 0;
  Object.entries(data).forEach(([id, s]) => {
    if (!ids.has(id) || !s) return;
    n++;
    if (s.lib && s.lib !== 'none') ops.push((b) => b.update(fdoc(fid, 'books', id), { lib: s.lib }));
    if (s.read && s.read !== 'none') {
      ops.push((b) => b.set(fdoc(fid, 'kids', kidId, 'records', id), {
        read: s.read, done_date: s.read === 'done' ? (s.done_date || '') : '', updatedAt: serverTimestamp(),
      }, { merge: true }));
    }
  });
  await commitChunks(ops);
  return n;
}

/* ---------- 학급 ---------- */
const cdoc = (cid, ...p) => doc(db, 'classes', cid, ...p);
const ccol = (cid, ...p) => collection(db, 'classes', cid, ...p);

// 반 만들기: 내 가족을 첫 구성원으로 등록하고 참여 코드를 발급
export async function createClass(user, fid, { name, school, className, chatUrl }) {
  const cid = doc(collection(db, 'classes')).id;
  const code = genCode(6);
  await setDoc(cdoc(cid), { name, school: school || '', className: className || '', code, ownerUid: user.uid, chatUrl: chatUrl || '', createdAt: serverTimestamp() });
  await setDoc(cdoc(cid, 'members', user.uid), { familyId: fid, code, createdAt: serverTimestamp() });
  await setDoc(doc(db, 'classCodes', code), { classId: cid });
  await updateDoc(fdoc(fid), { classId: cid, classCode: code, classShare: true });
  return cid;
}

// 코드로 반 참여
export async function joinClass(user, fid, rawCode) {
  const code = rawCode.trim().toUpperCase();
  const snap = await getDoc(doc(db, 'classCodes', code));
  if (!snap.exists()) throw new Error('학급 코드를 찾을 수 없어요. 다시 확인해 주세요.');
  const cid = snap.data().classId;
  await setDoc(cdoc(cid, 'members', user.uid), { familyId: fid, code, createdAt: serverTimestamp() });
  await updateDoc(fdoc(fid), { classId: cid, classCode: code, classShare: true });
  return cid;
}

// 배우자 등 같은 가족의 다른 보호자 계정이 처음 들어왔을 때 자동 참여
export async function ensureClassMember(user, fid, cid, code) {
  try {
    const me = await getDoc(cdoc(cid, 'members', user.uid));
    if (me.exists()) return true;
    if (!code) return false;
    await setDoc(cdoc(cid, 'members', user.uid), { familyId: fid, code, createdAt: serverTimestamp() });
    return true;
  } catch (e) {
    return false;
  }
}

// 반 나가기: 우리 가족의 통계·구성원 정보 삭제 후 가족 문서에서 학급 연결 해제
export async function leaveClass(user, fid, cid, kids) {
  await Promise.all(kids.map((k) => deleteDoc(cdoc(cid, 'stats', k.id)).catch(() => {})));
  // 우리 가족 나눔 글과 신청 정리
  const shares = await getDocs(query(ccol(cid, 'shares'), where('familyId', '==', fid)));
  for (const sh of shares.docs) await deleteShare(cid, sh.id);
  const mine = await getDocs(query(ccol(cid, 'members'), where('familyId', '==', fid)));
  const others = mine.docs.filter((d) => d.id !== user.uid);
  await Promise.all(others.map((d) => deleteDoc(d.ref)));
  await deleteDoc(cdoc(cid, 'members', user.uid));
  await updateDoc(fdoc(fid), { classId: deleteField(), classCode: deleteField(), classShare: deleteField() });
}

// 학급 단톡방(오픈채팅 등) 링크: https 주소만 허용, 반을 만든 사람만 수정
export function cleanChatUrl(raw) {
  const u = (raw || '').trim();
  if (!u) return '';
  if (!/^https:\/\/[^\s]{4,300}$/.test(u)) throw new Error('https:// 로 시작하는 링크를 입력해 주세요.');
  return u;
}
export function setClassChatUrl(cid, raw) {
  return updateDoc(cdoc(cid), { chatUrl: cleanChatUrl(raw) });
}

export function setClassShare(fid, on) {
  return updateDoc(fdoc(fid), { classShare: !!on });
}

/* ---------- 학급 통계(숫자만) ---------- */
export function syncStats(cid, fid, kidId, payload) {
  return setDoc(cdoc(cid, 'stats', kidId), { familyId: fid, ...payload, updatedAt: serverTimestamp() });
}
export function deleteStats(cid, kidId) {
  return deleteDoc(cdoc(cid, 'stats', kidId)).catch(() => {});
}

/* ---------- 책 나눔 ---------- */
export async function addShare(cid, fid, { kind, title, bookId, note, nickname }) {
  const ref = doc(ccol(cid, 'shares'));
  await setDoc(ref, {
    kind, title: title.trim().slice(0, 80), bookId: bookId || '', note: (note || '').trim().slice(0, 100),
    nickname: (nickname || '').trim().slice(0, 30), familyId: fid, status: 'open', createdAt: serverTimestamp(),
  });
  return ref.id;
}
export async function setShareStatus(cid, share, status) {
  const { id, ...rest } = share;
  await setDoc(cdoc(cid, 'shares', id), { ...rest, status });
}
export async function deleteShare(cid, sid) {
  const reqs = await getDocs(ccol(cid, 'shares', sid, 'requests')).catch(() => ({ docs: [] }));
  await Promise.all(reqs.docs.map((d) => deleteDoc(d.ref)));
  await deleteDoc(cdoc(cid, 'shares', sid));
}
export function requestShare(cid, sid, fid, { nickname, note }) {
  return setDoc(cdoc(cid, 'shares', sid, 'requests', fid), {
    familyId: fid, nickname: (nickname || '').trim().slice(0, 30), note: (note || '').trim().slice(0, 100), createdAt: serverTimestamp(),
  });
}
export function cancelRequest(cid, sid, fid) {
  return deleteDoc(cdoc(cid, 'shares', sid, 'requests', fid));
}
