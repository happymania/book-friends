import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';

// 책 나눔 새 소식(신청·답장) 계산. 앱을 열었을 때만 확인해요.
export const ms = (t) => (t && t.toMillis ? t.toMillis() : 0);
export const noteTime = (r) => ms(r.noteAt) || ms(r.createdAt);
export const reqUnread = (r) => ms(r.posterSeenAt) < noteTime(r);          // 글쓴이가 아직 못 본 신청/수정
export const replyUnread = (r) => !!r.reply && ms(r.replySeenAt) < Math.max(ms(r.replyAt), 1); // 신청자가 아직 못 본 답장
export const noteEdited = (r) => !!r.noteAt && ms(r.noteAt) - ms(r.createdAt) > 2000;

export function useShareNews(cid, fid, shares, enabled) {
  const [map, setMap] = useState({});
  const key = shares.map((s) => `${s.id}${s.familyId === fid ? 'o' : 'x'}${s.status}`).join(',');
  useEffect(() => {
    setMap({});
    if (!enabled || !cid) return undefined;
    const offs = [];
    const e = () => {};
    shares.forEach((s) => {
      if (s.familyId === fid) {
        offs.push(onSnapshot(collection(db, 'classes', cid, 'shares', s.id, 'requests'),
          (snap) => setMap((m) => ({ ...m, [s.id]: { req: snap.docs.filter((d) => reqUnread(d.data())).length, reply: 0 } })), e));
      } else if (s.status !== 'done') {
        offs.push(onSnapshot(doc(db, 'classes', cid, 'shares', s.id, 'requests', fid),
          (snap) => setMap((m) => ({ ...m, [s.id]: { req: 0, reply: snap.exists() && replyUnread(snap.data()) ? 1 : 0 } })), e));
      }
    });
    return () => offs.forEach((o) => o());
    // eslint-disable-next-line
  }, [cid, fid, key, enabled]);
  const v = Object.values(map);
  return { req: v.reduce((a, x) => a + x.req, 0), reply: v.reduce((a, x) => a + x.reply, 0) };
}
