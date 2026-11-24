import React, { useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db, googleProvider } from './firebase';
import { createFamily, joinFamily, connectKidDevice } from './db';
import { KID_EMOJIS, contactHref, CONTACT_EMAIL } from './util';
import Main from './Main.jsx';

function Loading({ text = '불러오는 중...' }) {
  return <div className="wrap"><div className="glass hero"><div className="logo">📚</div><p>{text}</p></div></div>;
}

async function googleLogin(setErr) {
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (e) {
    if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') {
      try { await signInWithRedirect(auth, googleProvider); return; } catch (e2) { e = e2; }
    }
    if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') return;
    if (e.code === 'auth/unauthorized-domain') setErr('이 주소가 Firebase 승인 도메인에 없어요. 설정 안내서 3번을 확인해 주세요.');
    else if (e.code === 'auth/operation-not-allowed') setErr('Firebase에서 Google 로그인이 아직 켜지지 않았어요. 설정 안내서 2번을 확인해 주세요.');
    else setErr('로그인에 실패했어요: ' + (e.code || e.message));
  }
}

function Landing({ anonymousUser }) {
  const [mode, setMode] = useState('home'); // home | kid
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function connect() {
    if (code.trim().length < 6) { setErr('연결 코드 6자리를 입력해 주세요.'); return; }
    setBusy(true); setErr('');
    try { await connectKidDevice(code); }
    catch (e) {
      if (e.code === 'auth/operation-not-allowed') setErr('Firebase에서 익명 로그인이 아직 켜지지 않았어요. 설정 안내서 2번을 확인해 주세요.');
      else setErr(e.message || '연결에 실패했어요.');
    }
    setBusy(false);
  }

  if (mode === 'kid') {
    return (
      <div className="wrap">
        <div className="glass hero">
          <div className="logo">🔑</div>
          <h1>아이 기기 연결</h1>
          <p className="muted">부모님 앱의 설정 → 아이 관리에 있는 연결 코드 6자리를 입력하세요.</p>
          <input className="input code-input" value={code} maxLength={6} autoCapitalize="characters"
            onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABC123" />
          {err && <div className="err">{err}</div>}
          <button className="btn primary block" style={{ marginTop: 12 }} disabled={busy} onClick={connect}>{busy ? '연결 중...' : '연결하기'}</button>
          <button className="btn block" style={{ marginTop: 8 }} onClick={() => { setMode('home'); setErr(''); }}>뒤로</button>
        </div>
      </div>
    );
  }
  return (
    <div className="wrap">
      <div className="glass hero">
        <div className="logo">📚</div>
        <h1>책은 내 친구</h1>
        <p className="muted">필독서 읽기를 가족이 함께 관리해요</p>
        {err && <div className="err">{err}</div>}
        <button className="btn primary block" style={{ marginTop: 14 }} onClick={() => googleLogin(setErr)}>👨‍👩‍👧 부모님 · Google로 시작</button>
        <button className="btn block" style={{ marginTop: 10 }} onClick={() => setMode('kid')}>🧒 아이 기기 연결 (코드 입력)</button>
        {anonymousUser && <p className="muted" style={{ marginTop: 14 }}>연결이 해제된 기기예요. 코드를 다시 입력해 주세요.</p>}
        <p className="contact">문의: <a href={contactHref}>{CONTACT_EMAIL}</a></p>
      </div>
    </div>
  );
}

function Onboarding({ user }) {
  const [tab, setTab] = useState('create');
  const [f, setF] = useState({ familyName: '', school: '리라초등학교', className: '4학년', useTemplate: true, kidName: '', kidEmoji: KID_EMOJIS[0], pin: '' });
  const [joinCode, setJoinCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  async function create() {
    if (!f.familyName.trim() || !f.kidName.trim()) { setErr('가족 이름과 아이 이름을 입력해 주세요.'); return; }
    if (f.pin && !/^\d{4}$/.test(f.pin)) { setErr('PIN은 숫자 4자리여야 해요.'); return; }
    setBusy(true); setErr('');
    try { await createFamily(user, { ...f, familyName: f.familyName.trim(), kidName: f.kidName.trim() }); }
    catch (e) { setErr('만들기에 실패했어요: ' + (e.code || e.message)); setBusy(false); }
  }
  async function join() {
    if (joinCode.trim().length < 6) { setErr('초대 코드 6자리를 입력해 주세요.'); return; }
    setBusy(true); setErr('');
    try { await joinFamily(user, joinCode); }
    catch (e) { setErr(e.message || '참여에 실패했어요.'); setBusy(false); }
  }

  return (
    <div className="wrap">
      <div className="glass card" style={{ marginTop: 18 }}>
        <h1>환영해요! 👋</h1>
        <p className="muted">{user.displayName || user.email} 님, 가족을 만들거나 가족에 참여하세요.</p>
        <div className="tabs two">
          <button className={'tab' + (tab === 'create' ? ' on' : '')} onClick={() => { setTab('create'); setErr(''); }}>새 가족 만들기</button>
          <button className={'tab' + (tab === 'join' ? ' on' : '')} onClick={() => { setTab('join'); setErr(''); }}>초대 코드로 참여</button>
        </div>
        {tab === 'create' ? (
          <>
            <label className="f">가족 이름</label>
            <input className="input" value={f.familyName} onChange={(e) => set('familyName', e.target.value)} placeholder="예: 이씨네 독서왕" />
            <div className="row">
              <div className="grow"><label className="f">학교</label><input className="input" value={f.school} onChange={(e) => set('school', e.target.value)} /></div>
              <div className="grow"><label className="f">학년/학급</label><input className="input" value={f.className} onChange={(e) => set('className', e.target.value)} /></div>
            </div>
            <label className="f">아이 이름(별명)</label>
            <input className="input" value={f.kidName} onChange={(e) => set('kidName', e.target.value)} placeholder="예: 민준" />
            <label className="f">아이 캐릭터</label>
            <div className="chips">{KID_EMOJIS.map((e) => (
              <button key={e} className={'chip' + (f.kidEmoji === e ? ' on' : '')} onClick={() => set('kidEmoji', e)}>{e}</button>
            ))}</div>
            <label className="f">부모 모드 PIN (숫자 4자리, 나중에 설정 가능)</label>
            <input className="input" inputMode="numeric" maxLength={4} value={f.pin} onChange={(e) => set('pin', e.target.value.replace(/\D/g, ''))} placeholder="••••" />
            <label className="f" style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 44 }}>
              <input type="checkbox" checked={f.useTemplate} onChange={(e) => set('useTemplate', e.target.checked)} style={{ width: 24, height: 24 }} />
              리라초 4학년 필독서 73권 넣고 시작
            </label>
            {err && <div className="err">{err}</div>}
            <button className="btn primary block" disabled={busy} onClick={create}>{busy ? '만드는 중...' : '시작하기'}</button>
          </>
        ) : (
          <>
            <p className="muted">배우자 등 다른 보호자의 앱 → 설정 → 보호자 초대에 있는 코드를 입력하세요.</p>
            <input className="input code-input" value={joinCode} maxLength={6} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="ABC123" />
            {err && <div className="err">{err}</div>}
            <button className="btn primary block" style={{ marginTop: 12 }} disabled={busy} onClick={join}>{busy ? '확인 중...' : '참여하기'}</button>
          </>
        )}
        <button className="btn block" style={{ marginTop: 14 }} onClick={() => signOut(auth)}>로그아웃</button>
        <p className="contact">문의: <a href={contactHref}>{CONTACT_EMAIL}</a></p>
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(undefined);
  const [profile, setProfile] = useState(undefined);

  useEffect(() => onAuthStateChanged(auth, (u) => { setUser(u); if (!u) { setProfile(undefined); globalThis.__bfDeleting = false; } }), []);
  useEffect(() => {
    if (!user) return;
    setProfile(undefined);
    return onSnapshot(doc(db, 'users', user.uid),
      (s) => setProfile(s.exists() ? s.data() : null),
      () => setProfile(null));
  }, [user?.uid]);

  if (user === undefined) return <Loading />;
  if (!user) return <Landing />;
  if (profile === undefined) return <Loading />;
  if (user.isAnonymous) {
    return profile?.role === 'kid' ? <Main user={user} profile={profile} kidMode /> : <Landing anonymousUser />;
  }
  return profile?.familyId ? <Main user={user} profile={profile} /> : <Onboarding user={user} />;
}
