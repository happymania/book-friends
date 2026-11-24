import React, { useEffect, useMemo, useRef, useState } from 'react';
import { signOut } from 'firebase/auth';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebase';
import { hasPin, verifyPin, setLib, setRead, disconnectKidDevice, ensureClassMember, syncStats, deleteStats, resetMyProfile } from './db';
import { computePace, computeBadges, earnedIds, statPayload, titleKey } from './logic';
import { today, nextFontSize, getFontSize, FS_LABEL } from './util';
import BookList from './BookList.jsx';
import Stats from './Stats.jsx';
import Settings from './Settings.jsx';
import ClassTab from './Class.jsx';

const ls = {
  get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* 무시 */ } },
};

export default function Main({ user, profile, kidMode }) {
  const fid = profile.familyId;
  const [family, setFamily] = useState(null);
  const [books, setBooks] = useState([]);
  const [kids, setKids] = useState([]);
  const [records, setRecords] = useState({});
  const [activeKid, setActiveKid] = useState(kidMode ? profile.kidId : ls.get('bf_kid', ''));
  const [mode, setMode] = useState(kidMode ? 'child' : ls.get('bf_mode', 'parent'));
  const [tab, setTab] = useState('books');
  const [toast, setToast] = useState('');
  const [cheer, setCheer] = useState(null);
  const [pinAsk, setPinAsk] = useState(false);
  const [loadErr, setLoadErr] = useState('');
  const [recKid, setRecKid] = useState('');
  const [gone, setGone] = useState(false);
  const [fs, setFs] = useState(getFontSize());
  const [classReady, setClassReady] = useState(false);
  const [shares, setShares] = useState([]);
  const toastTimer = useRef();
  const lastStat = useRef('');

  const say = (m) => { setToast(m); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 2200); };

  // 실시간 구독
  useEffect(() => {
    const onErr = (e) => { if (!globalThis.__bfDeleting) setLoadErr('데이터를 불러오지 못했어요: ' + (e.code || e.message)); };
    const onFamErr = (e) => {
      if (globalThis.__bfDeleting) return;
      if (e.code === 'permission-denied') setGone(true); else onErr(e);
    };
    const offs = [
      onSnapshot(doc(db, 'families', fid), (s) => { if (!s.exists() && !s.metadata.fromCache && !globalThis.__bfDeleting) setGone(true); setFamily(s.exists() ? { id: s.id, ...s.data() } : null); }, onFamErr),
      onSnapshot(collection(db, 'families', fid, 'books'), (s) => {
        setBooks(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
      }, onErr),
    ];
    if (kidMode) {
      offs.push(onSnapshot(doc(db, 'families', fid, 'kids', profile.kidId), (s) => setKids(s.exists() ? [{ id: s.id, ...s.data() }] : []), onErr));
    } else {
      offs.push(onSnapshot(collection(db, 'families', fid, 'kids'), (s) => {
        setKids(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
      }, onErr));
    }
    return () => offs.forEach((f) => f());
  }, [fid, kidMode, profile.kidId]);

  // 아이 선택 보정
  useEffect(() => {
    if (kidMode) return;
    if (kids.length && !kids.find((k) => k.id === activeKid)) setActiveKid(kids[0].id);
  }, [kids, activeKid, kidMode]);
  useEffect(() => { if (!kidMode && activeKid) ls.set('bf_kid', activeKid); }, [activeKid, kidMode]);

  // 선택된 아이의 기록
  useEffect(() => {
    setRecords({});
    setRecKid('');
    if (!activeKid) return;
    return onSnapshot(collection(db, 'families', fid, 'kids', activeKid, 'records'), (s) => {
      const m = {};
      s.docs.forEach((d) => { m[d.id] = d.data(); });
      setRecords(m);
      setRecKid(activeKid);
    }, (e) => { if (!globalThis.__bfDeleting) setLoadErr('기록을 불러오지 못했어요: ' + (e.code || e.message)); });
  }, [fid, activeKid]);

  const cid = family?.classId || '';
  const classCode = family?.classCode || '';

  // 학급 연결: 같은 가족의 다른 보호자 계정은 처음 열 때 자동으로 반 구성원이 됨
  useEffect(() => {
    setClassReady(false);
    setShares([]);
    if (!cid) return;
    if (kidMode) return; // 아이 기기는 학급 정보를 볼 수 없음
    let off = () => {};
    let dead = false;
    ensureClassMember(user, fid, cid, classCode).then((ok) => {
      if (dead) return;
      setClassReady(ok);
      if (ok) off = onSnapshot(collection(db, 'classes', cid, 'shares'), (s) => setShares(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => {});
    });
    return () => { dead = true; off(); };
  }, [cid, classCode, fid, kidMode, user]);

  // 학급 집계용 숫자(이름 없음) 동기화
  useEffect(() => {
    if (!cid || !activeKid || recKid !== activeKid || !books.length) return;
    if (!kidMode && !classReady) return;
    const share = family?.classShare !== false;
    const payload = statPayload(books, records);
    const key = cid + '|' + activeKid + '|' + share + '|' + JSON.stringify(payload);
    if (key === lastStat.current) return;
    const t = setTimeout(() => {
      lastStat.current = key;
      if (share) syncStats(cid, fid, activeKid, payload).catch(() => { lastStat.current = ''; });
      else if (!kidMode) deleteStats(cid, activeKid);
    }, 900);
    return () => clearTimeout(t);
  }, [cid, fid, activeKid, recKid, books, records, family?.classShare, classReady, kidMode]);

  const pace = useMemo(() => computePace({ books, records, family, today: today() }), [books, records, family]);

  // 우리 반에서 나눔 중인 책(아직 없는 책에만 표시)
  const shareHints = useMemo(() => {
    const m = {};
    if (!classReady) return m;
    const offers = shares.filter((x) => x.kind === 'offer' && x.status === 'open' && x.familyId !== fid);
    books.forEach((b) => {
      if ((b.lib || 'none') !== 'none') return;
      const n = offers.filter((x) => x.bookId === b.id || titleKey(x.title) === titleKey(b.title)).length;
      if (n) m[b.id] = n;
    });
    return m;
  }, [shares, books, fid, classReady]);

  const kid = kids.find((k) => k.id === activeKid);
  const isParent = !kidMode && mode === 'parent';

  async function switchMode(next) {
    if (next === 'child') { setMode('child'); ls.set('bf_mode', 'child'); setTab('books'); return; }
    if (await hasPin(fid)) setPinAsk(true);
    else { setMode('parent'); ls.set('bf_mode', 'parent'); }
  }

  const onLib = (b, val) => {
    const next = b.lib === val ? 'none' : val;
    setLib(fid, b.id, next).catch((e) => say('저장 실패: ' + (e.code || e.message)));
    say(next === 'none' ? '도서 상태 초기화' : '저장했어요');
  };
  const onRead = (b, val) => {
    const cur = records[b.id]?.read || 'none';
    const next = cur === val ? 'none' : val;
    setRead(fid, activeKid, b.id, next, records[b.id]?.done_date).catch((e) => say('저장 실패: ' + (e.code || e.message)));
    if (next === 'done') {
      const after = { ...records, [b.id]: { ...records[b.id], read: 'done', done_date: records[b.id]?.done_date || today() } };
      const before = earnedIds(computeBadges(books, records, today()));
      const res = computeBadges(books, after, today());
      setCheer({ title: b.title, badges: res.badges.filter((x) => x.earned && !before.has(x.id)) });
    }
    else say(next === 'reading' ? '📖 지금 읽는 중!' : '상태 초기화');
  };

  const tabs = isParent ? ['books', 'stats', 'class', 'settings'] : ['books', 'stats'];
  const tabLabel = { books: '📚 책', stats: '📊 통계', class: '🏫 학급', settings: '⚙️ 설정' };

  if (gone) {
    return (
      <div className="wrap"><div className="glass card">
        <h2>{kidMode ? '연결이 해제되었어요' : '이 가족에 더 이상 접근할 수 없어요'}</h2>
        <p>{kidMode ? '부모님이 가족 정보를 지웠거나 기기 연결을 해제했어요.' : '가족이 삭제되었거나 보호자에서 제외되었을 수 있어요.'}</p>
        <button className="btn primary block" onClick={async () => {
          await resetMyProfile(auth.currentUser.uid);
          if (kidMode) await signOut(auth); else location.reload();
        }}>{kidMode ? '확인' : '처음 화면으로'}</button>
      </div></div>
    );
  }

  if (loadErr) {
    return <div className="wrap"><div className="glass card"><h2>앗, 문제가 생겼어요</h2><p className="err">{loadErr}</p>
      <p className="muted">보안 규칙이 배포되지 않았거나 접근 권한이 없을 수 있어요.</p>
      <button className="btn block" onClick={() => location.reload()}>다시 시도</button>
      <button className="btn block" style={{ marginTop: 8 }} onClick={() => signOut(auth)}>로그아웃</button></div></div>;
  }

  return (
    <div className="wrap">
      <div className="glass top">
        <div className="row">
          <div className="grow">
            <div className="title">📚 {family?.name || '책은 내 친구'}</div>
            <div className="muted">{family?.school} {family?.className}</div>
          </div>
          <button className="fsbtn" onClick={() => setFs(nextFontSize())} aria-label="글자 크기 바꾸기">가 {FS_LABEL[fs]}</button>
          <span className="modebadge">{kidMode ? '아이 기기' : isParent ? '부모 모드' : '아이 모드'}</span>
        </div>
        {!kidMode && (
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn sm grow" onClick={() => switchMode(isParent ? 'child' : 'parent')}>
              {isParent ? '🧒 아이 모드로 전환' : '🔒 부모 모드로 전환'}
            </button>
          </div>
        )}
        {!kidMode && kids.length > 0 && (
          <div className="chips" style={{ marginTop: 6 }}>
            {kids.map((k) => (
              <button key={k.id} className={'chip' + (k.id === activeKid ? ' on' : '')} onClick={() => setActiveKid(k.id)}>{k.emoji} {k.name}</button>
            ))}
          </div>
        )}
        {kidMode && kid && <div style={{ marginTop: 6, fontSize: '1.2rem' }}>{kid.emoji} {kid.name}의 독서 기록</div>}
      </div>

      <div className="tabs" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0,1fr))` }}>
        {tabs.map((t) => <button key={t} className={'tab' + (tab === t ? ' on' : '')} onClick={() => setTab(t)}>{tabLabel[t]}</button>)}
      </div>

      {!kid && !kidMode ? (
        <div className="glass card empty">아이 프로필이 없어요. 설정 탭에서 추가해 주세요.</div>
      ) : tab === 'books' ? (
        <BookList books={books} records={records} isParent={isParent} onLib={onLib} onRead={onRead} pace={pace} shareHints={shareHints} goToSettings={isParent ? () => setTab('settings') : null} goToClass={isParent ? () => setTab('class') : null} />
      ) : tab === 'stats' ? (
        <Stats books={books} records={records} kid={kid} isParent={isParent} family={family} />
      ) : tab === 'class' ? (
        <ClassTab user={user} fid={fid} family={family} kids={kids} books={books} records={records} shares={shares} classReady={classReady} say={say} />
      ) : (
        <Settings fid={fid} family={family} pace={pace} kids={kids} books={books} activeKid={activeKid} user={user} say={say} />
      )}

      {kidMode && (
        <p className="center muted" style={{ marginTop: 20 }}>
          <button className="btn sm" onClick={async () => { if (confirm('이 기기의 연결을 해제할까요?')) { await disconnectKidDevice(fid); await signOut(auth); } }}>연결 해제</button>
        </p>
      )}

      {pinAsk && <PinModal onCancel={() => setPinAsk(false)} onCheck={async (pin) => {
        if (await verifyPin(fid, pin)) { setPinAsk(false); setMode('parent'); ls.set('bf_mode', 'parent'); return true; }
        return false;
      }} />}
      {cheer && (
        <div className="overlay" onClick={() => setCheer(null)}>
          <div className="glass modal">
            <div className="big-emoji">🎉</div>
            <h2>완독 축하해요!</h2>
            <p>「{cheer.title}」를 다 읽었어요. 정말 대단해요! 🏆</p>
            {cheer.badges.length > 0 && (
              <div className="newbadges">
                <div className="muted">새 배지를 얻었어요!</div>
                {cheer.badges.map((x) => <div className="nb" key={x.id}><span className="e">{x.icon}</span> {x.name}</div>)}
              </div>
            )}
            <button className="btn primary block" onClick={() => setCheer(null)}>고마워요</button>
          </div>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function PinModal({ onCheck, onCancel }) {
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  async function submit() {
    if (pin.length !== 4) return;
    const ok = await onCheck(pin);
    if (!ok) { setErr('PIN이 맞지 않아요.'); setPin(''); }
  }
  return (
    <div className="overlay">
      <div className="glass modal">
        <div className="big-emoji">🔒</div>
        <h2>부모 모드 PIN</h2>
        <input className="input pin-input" type="password" inputMode="numeric" maxLength={4} autoFocus value={pin}
          onChange={(e) => { setPin(e.target.value.replace(/\D/g, '')); setErr(''); }}
          onKeyDown={(e) => e.key === 'Enter' && submit()} />
        {err && <div className="err">{err}</div>}
        <button className="btn primary block" style={{ marginTop: 12 }} onClick={submit}>확인</button>
        <button className="btn block" style={{ marginTop: 8 }} onClick={onCancel}>취소</button>
      </div>
    </div>
  );
}
