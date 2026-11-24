import React, { useEffect, useRef, useState } from 'react';
import { signOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebase';
import {
  addKid, regenConnectCode, renameKid, removeKid, regenInviteCode, setPin, addBook, deleteBook,
  importBooks, resetToTemplate, importLegacy, updateFamilyInfo,
} from './db';
import { CATS, KID_EMOJIS, parseCsv, downloadCsv } from './util';

function Section({ title, children, open: o = false }) {
  const [open, setOpen] = useState(o);
  return (
    <div className="glass card">
      <button className="btn block" style={{ textAlign: 'left' }} onClick={() => setOpen(!open)}>{open ? '▾' : '▸'} {title}</button>
      {open && <div style={{ marginTop: 10 }}>{children}</div>}
    </div>
  );
}

export default function Settings({ fid, family, kids, books, activeKid, user, say }) {
  const [priv, setPriv] = useState({});
  useEffect(() => onSnapshot(doc(db, 'families', fid, 'private', 'settings'), (s) => setPriv(s.data() || {}), () => {}), [fid]);
  const run = async (fn, okMsg) => {
    try { const r = await fn(); if (okMsg) say(okMsg); return r; }
    catch (e) { say('실패: ' + (e.message || e.code)); }
  };

  /* 아이 */
  const [kName, setKName] = useState(''); const [kEmoji, setKEmoji] = useState(KID_EMOJIS[1]);
  /* PIN */
  const [pin, setPinV] = useState('');
  /* 책 */
  const [nb, setNb] = useState({ type: '권장', cat: '문학', title: '' });
  const fileRef = useRef();
  const [csvInfo, setCsvInfo] = useState('');
  /* 가족 */
  const [fi, setFi] = useState({ name: family?.name || '', school: family?.school || '', className: family?.className || '' });
  const [legacyMsg, setLegacyMsg] = useState('');

  const nextOrder = books.length ? Math.max(...books.map((b) => b.order ?? 0)) + 1 : 0;

  async function onCsv(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const rows = parseCsv(await file.text());
    const head = rows[0]?.[0]?.trim();
    const body = ['구분', 'type'].includes(head) ? rows.slice(1) : rows;
    const parsed = [], bad = [];
    body.forEach((r, i) => {
      const type = (r[0] || '').trim(), cat = (r[1] || '').trim() || '기타', title = (r[2] || '').trim();
      if (!title || !['선정', '권장'].includes(type)) bad.push(i + 1); else parsed.push({ type, cat, title });
    });
    if (!parsed.length) { setCsvInfo('가져올 수 있는 줄이 없어요. 형식: 구분(선정/권장), 분류, 제목'); return; }
    if (!confirm(`${parsed.length}권을 목록에 추가할까요?` + (bad.length ? `\n(형식이 맞지 않아 건너뛴 줄: ${bad.length}개)` : ''))) return;
    await run(() => importBooks(fid, parsed, nextOrder), `${parsed.length}권을 추가했어요`);
    setCsvInfo(`${parsed.length}권 추가 완료` + (bad.length ? `, ${bad.length}줄 건너뜀` : ''));
  }

  return (
    <>
      <Section title="👧 아이 관리 · 연결 코드" open>
        {kids.map((k) => (
          <div className="kidrow" key={k.id}>
            <div className="row">
              <div className="grow" style={{ fontSize: '1.15rem' }}>{k.emoji} {k.name}</div>
              <button className="btn sm danger" onClick={() => confirm(`${k.name} 프로필과 읽기 기록을 모두 삭제할까요?`) && run(() => removeKid(fid, k), '삭제했어요')}>삭제</button>
            </div>
            <div className="muted" style={{ margin: '6px 0 4px' }}>아이 기기 연결 코드</div>
            <div className="code-box">{k.connectCode}</div>
            <button className="btn sm block" style={{ marginTop: 6 }}
              onClick={() => confirm('새 코드를 만들면 기존에 연결된 아이 기기가 모두 끊겨요. 계속할까요?') && run(() => regenConnectCode(fid, k), '새 코드를 만들었어요')}>코드 다시 만들기</button>
          </div>
        ))}
        <h3>아이 추가</h3>
        <input className="input" placeholder="이름(별명)" value={kName} onChange={(e) => setKName(e.target.value)} />
        <div className="chips" style={{ margin: '8px 0' }}>{KID_EMOJIS.map((e) => <button key={e} className={'chip' + (kEmoji === e ? ' on' : '')} onClick={() => setKEmoji(e)}>{e}</button>)}</div>
        <button className="btn primary block" onClick={async () => {
          if (!kName.trim()) return say('이름을 입력해 주세요');
          await run(() => addKid(fid, { name: kName.trim(), emoji: kEmoji, order: kids.length }), '아이를 추가했어요'); setKName('');
        }}>추가하기</button>
        <p className="muted">아이 기기에서 「아이 기기 연결」을 누르고 코드를 입력하면 그 아이의 읽기 상태만 바꿀 수 있어요.</p>
      </Section>

      <Section title="👪 보호자 초대 (배우자 등)">
        <p className="muted">상대방이 Google로 로그인한 뒤 「초대 코드로 참여」에 입력하면 같은 가족으로 연결돼요.</p>
        <div className="code-box">{priv.inviteCode || '...'}</div>
        <button className="btn sm block" style={{ marginTop: 6 }} onClick={() => run(() => regenInviteCode(fid, priv.inviteCode), '새 초대 코드를 만들었어요')}>코드 다시 만들기</button>
      </Section>

      <Section title="🔒 부모 모드 PIN">
        <p className="muted">{priv.pinHash ? '현재 PIN이 설정되어 있어요.' : '아직 PIN이 없어요.'} 아이 모드에서 부모 모드로 돌아올 때 필요해요.</p>
        <input className="input pin-input" type="password" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPinV(e.target.value.replace(/\D/g, ''))} placeholder="••••" />
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn primary grow" onClick={async () => { if (pin.length !== 4) return say('숫자 4자리를 입력해 주세요'); await run(() => setPin(fid, pin), 'PIN을 저장했어요'); setPinV(''); }}>저장</button>
          {priv.pinHash && <button className="btn grow danger" onClick={() => run(() => setPin(fid, ''), 'PIN을 해제했어요')}>PIN 해제</button>}
        </div>
      </Section>

      <Section title="📖 도서 목록 관리">
        <h3>책 한 권 추가</h3>
        <div className="row">
          <select className="input grow" value={nb.type} onChange={(e) => setNb({ ...nb, type: e.target.value })}><option>선정</option><option>권장</option></select>
          <select className="input grow" value={nb.cat} onChange={(e) => setNb({ ...nb, cat: e.target.value })}>{CATS.map((c) => <option key={c}>{c}</option>)}</select>
        </div>
        <input className="input" style={{ marginTop: 8 }} placeholder="책 제목" value={nb.title} onChange={(e) => setNb({ ...nb, title: e.target.value })} />
        <button className="btn primary block" style={{ marginTop: 8 }} onClick={async () => {
          if (!nb.title.trim()) return say('제목을 입력해 주세요');
          await run(() => addBook(fid, { ...nb, title: nb.title.trim() }, nextOrder), '추가했어요'); setNb({ ...nb, title: '' });
        }}>추가</button>

        <h3>CSV로 한꺼번에 추가</h3>
        <p className="muted">열 순서: 구분(선정/권장), 분류, 제목. 첫 줄 제목행은 있어도 없어도 돼요.</p>
        <div className="row">
          <button className="btn grow" onClick={() => downloadCsv('도서목록_양식.csv', [['구분', '분류', '제목'], ['선정', '문학', '예시 책 제목']])}>양식 받기</button>
          <button className="btn grow" onClick={() => fileRef.current.click()}>CSV 올리기</button>
        </div>
        <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={onCsv} />
        {csvInfo && <div className="ok">{csvInfo}</div>}

        <h3>템플릿</h3>
        <button className="btn block danger" onClick={() => confirm('현재 도서 목록을 모두 지우고 리라초 4학년 템플릿(73권)으로 바꿀까요?\n(도서 확보 상태는 초기화돼요. 읽기 기록은 남아요.)') && run(() => resetToTemplate(fid, books), '템플릿으로 바꿨어요')}>리라초 4학년 템플릿으로 되돌리기</button>

        <h3>현재 목록 ({books.length}권)</h3>
        <div className="booktbl">
          {books.map((b) => (
            <div className="it" key={b.id}>
              <span className={'badge ' + (b.type === '선정' ? 'sel' : 'rec')}>{b.type}</span>
              <span className="nm">{b.title}</span>
              <button className="btn sm danger" onClick={() => confirm(`「${b.title}」을(를) 삭제할까요?`) && run(() => deleteBook(fid, b.id), '삭제했어요')}>삭제</button>
            </div>
          ))}
        </div>
      </Section>

      <Section title="🏫 가족·학교 정보">
        <label className="f">가족 이름</label><input className="input" value={fi.name} onChange={(e) => setFi({ ...fi, name: e.target.value })} />
        <label className="f">학교</label><input className="input" value={fi.school} onChange={(e) => setFi({ ...fi, school: e.target.value })} />
        <label className="f">학년/학급</label><input className="input" value={fi.className} onChange={(e) => setFi({ ...fi, className: e.target.value })} />
        <button className="btn primary block" style={{ marginTop: 10 }} onClick={() => run(() => updateFamilyInfo(fid, fi), '저장했어요')}>저장</button>
      </Section>

      <Section title="📦 기존 앱 데이터 가져오기">
        <p className="muted">예전 「책은 내 친구」(Realtime Database)에 저장된 대출·읽기 기록을 현재 선택된 아이({kids.find((k) => k.id === activeKid)?.name || '-'})에게 불러와요. 리라초 템플릿 책과 id가 같은 항목만 가져옵니다.</p>
        <button className="btn block" onClick={async () => {
          if (!confirm('기존 데이터를 선택된 아이에게 가져올까요? 같은 책의 현재 기록은 덮어써져요.')) return;
          const n = await run(() => importLegacy(fid, activeKid, books));
          if (typeof n === 'number') setLegacyMsg(`${n}권의 기록을 확인해 가져왔어요.`);
        }}>기존 데이터 가져오기</button>
        {legacyMsg && <div className="ok">{legacyMsg}</div>}
      </Section>

      <div className="glass card">
        <p className="muted">로그인: {user.email}</p>
        <button className="btn block" onClick={() => signOut(auth)}>로그아웃</button>
      </div>
      <div className="pad-bottom" />
    </>
  );
}
