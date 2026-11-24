import React, { useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import {
  createClass, joinClass, findClass, setNameOpen, leaveClass, setClassShare, setClassChatUrl, cleanChatUrl, addShare, setShareStatus, deleteShare,
  requestShare, cancelRequest, replyRequest, updateRequestNote, markPosterSeen, markReplySeen,
} from './db';
import { ms, noteTime, reqUnread, replyUnread, noteEdited } from './useShareNews';
import { aggregateClass, statPayload, MIN_KIDS } from './logic';
import { ShareSteps } from './Help.jsx';
import { CHAT_ENABLED } from './util';

const fmt = (t) => { const d = t?.toDate ? t.toDate() : null; return d ? `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : ''; };

const KIND = { offer: { label: '나눔', icon: '🎁', btn: '받고 싶어요' }, want: { label: '구해요', icon: '🙋', btn: '빌려줄 수 있어요' } };

export default function ClassTab({ user, fid, family, kids, books, records, shares, classReady, say, focus, news }) {
  const cid = family?.classId;
  if (!cid) return <Start user={user} fid={fid} family={family} say={say} />;
  return <Joined user={user} fid={fid} family={family} kids={kids} books={books} records={records} shares={shares} classReady={classReady} say={say} cid={cid} focus={focus} news={news} />;
}

/* ---------- 반 만들기 / 참여 ---------- */
function Start({ user, fid, family, say }) {
  const [schoolIn, setSchoolIn] = useState(family?.school || '');
  const school = schoolIn.trim();
  const [grade, setGrade] = useState('');
  const [num, setNum] = useState('');
  const [found, setFound] = useState(undefined); // undefined: 아직 확인 안 함, null: 없음, 객체: 있음
  const [busy, setBusy] = useState(false);
  const digits = (v) => v.replace(/\D/g, '').slice(0, 2);
  const g = Number(grade), n = Number(num);
  const valid = !!school && g >= 1 && g <= 6 && n >= 1 && n <= 30;
  const hint = (grade && (g < 1 || g > 6)) ? '학년은 1~6 사이 숫자로 적어 주세요.'
      : (num && (n < 1 || n > 30)) ? '반은 1~30 사이 숫자로 적어 주세요.' : '';
  const run = async (fn, ok) => {
    setBusy(true);
    try { await fn(); if (ok) say(ok); } catch (e) { say('실패: ' + (e.message || e.code)); }
    setBusy(false);
  };
  const check = () => run(async () => { setFound(await findClass(school, g, n)); });
  return (
    <>
      <div className="glass card">
        <h2>🏫 우리 반 함께 읽기</h2>
        <p>같은 반 친구들과 <b>읽은 권수 평균</b>과 <b>인기 책</b>을 함께 보고, 다 읽은 책은 서로 나눌 수 있어요.</p>
        <ul className="plain">
          <li>어린이 이름은 공개되지 않아요. 숫자와 책 제목만 모아서 보여줘요.</li>
          <li>순위나 비교는 없어요. 참여 5명 이상부터 평균을 보여줘요.</li>
          <li>언제든 반에서 나가면 우리 집 정보가 모두 지워져요.</li>
        </ul>
        <p className="muted">반에는 어린이 폰이 아니라 부모 계정으로만 들어갈 수 있어요. 자세한 설명은 설정의 「사용 방법」에 있어요.</p>
      </div>
      <div className="glass card">
        <h2>우리 반 입력</h2>
        <p className="muted" style={{ marginTop: 0 }}>학교 이름은 같은 반 학부모와 똑같이 정확하게 적어 주세요. 학년과 반은 숫자만 적으면 같은 반과 자동으로 연결돼요.</p>
        <div className="classrow">
          <div className="school-box"><label className="f">학교 *</label>
            <input className="input" placeholder="예: 리라초등학교" maxLength={20} value={schoolIn}
              onChange={(e) => { setSchoolIn(e.target.value); setFound(undefined); }} /></div>
          <div><label className="f">학년 *</label>
            <input className="input num-input" inputMode="numeric" placeholder="4" maxLength={2} value={grade}
              onChange={(e) => { setGrade(digits(e.target.value)); setFound(undefined); }} /></div>
          <div><label className="f">반 *</label>
            <input className="input num-input" inputMode="numeric" placeholder="3" maxLength={2} value={num}
              onChange={(e) => { setNum(digits(e.target.value)); setFound(undefined); }} /></div>
        </div>
        {hint && <p className="err" style={{ marginTop: 6 }}>{hint}</p>}
        <button className="btn primary block" style={{ marginTop: 8 }} disabled={busy || !valid} onClick={check}>우리 반 확인하기</button>
      </div>
      {found !== undefined && (
        <div className="glass card">
          {found && found.open && (<>
            <h2>✅ {found.name}</h2>
            <p>같은 반이 이미 있어요. 아래 버튼으로 바로 참여할 수 있어요.</p>
            <button className="btn primary block" disabled={busy}
              onClick={() => run(() => joinClass(user, fid, found.code), '반에 참여했어요')}>이 반에 참여하기</button>
          </>)}
          {found && !found.open && (<>
            <h2>🔒 {found.name}</h2>
            <p>이 반은 지금 새 참여를 받지 않아요. 반을 만든 학부모에게 문의해 주세요.</p>
          </>)}
          {found === null && (<>
            <h2>🆕 {school} {g}학년 {n}반</h2>
            <p>아직 만들어진 반이 없어요. 우리 반에서 처음이라면 반을 만들어 주세요. 다른 학부모는 같은 학년·반을 입력하면 바로 들어와요.</p>
            {!CHAT_ENABLED && <p className="muted">💬 학급 단톡방은 정책상 사용하지 않습니다.</p>}
            <button className="btn block" disabled={busy}
              onClick={() => run(() => createClass(user, fid, { school, grade: g, num: n }), '반을 만들었어요')}>이 반 만들기</button>
          </>)}
        </div>
      )}
    </>
  );
}

/* ---------- 초대 버튼: 공유 창(없으면 복사)으로 초대 문구 보내기 ---------- */
function InviteBtn({ name, say }) {
  const url = location.origin + location.pathname;
  const text = `「책은 내 친구」 ${name || '우리 반'} 함께 읽기에 초대해요 📚\n\n1) 앱 열기: ${url}\n2) 구글 로그인 → 「학급」 탭\n3) 학교 이름과 학년·반 숫자를 입력하고 「우리 반 확인하기」 → 「이 반에 참여하기」\n\n※ 반을 새로 만들지 말고 참여해 주세요.`;
  const go = async () => {
    try {
      if (navigator.share) { await navigator.share({ text }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(text); say('초대 문구를 복사했어요. 메시지에 붙여 넣어 보내 주세요.'); }
    catch (e) { say('복사하지 못했어요. 앱 주소를 직접 알려 주세요.'); }
  };
  return <button className="btn primary block" style={{ marginTop: 8 }} onClick={go}>📨 같은 반 학부모 초대하기</button>;
}

/* ---------- 방장: 같은 반 참여 받기 켜기/끄기 ---------- */
function OpenToggle({ cid, cls, say }) {
  const [busy, setBusy] = useState(false);
  const [g, setG] = useState('');
  const [n, setN] = useState('');
  const digits = (v) => v.replace(/\D/g, '').slice(0, 2);
  const open = cls?.nameOpen === true;
  const legacy = !cls?.key;
  const ok = !legacy || (Number(g) >= 1 && Number(g) <= 6 && Number(n) >= 1 && Number(n) <= 30);
  const flip = async (v) => {
    setBusy(true);
    try { await setNameOpen(cid, cls, v, legacy ? { grade: g, num: n } : undefined); say(v ? '같은 반 참여를 켰어요' : '새 참여를 막았어요'); }
    catch (e) { say('실패: ' + (e.message || e.code)); }
    setBusy(false);
  };
  return (
    <div className="glass card">
      <h2>🔓 같은 반 참여 받기</h2>
      {legacy && (<>
        <p className="muted" style={{ marginTop: 0 }}>이 반은 학년·반 숫자가 아직 없어요. 한 번만 적어 주세요.</p>
        <div className="classrow two">
          <div><label className="f">학년 *</label><input className="input num-input" inputMode="numeric" placeholder="4" maxLength={2} value={g} onChange={(e) => setG(digits(e.target.value))} /></div>
          <div><label className="f">반 *</label><input className="input num-input" inputMode="numeric" placeholder="3" maxLength={2} value={n} onChange={(e) => setN(digits(e.target.value))} /></div>
        </div>
      </>)}
      <label className="switch">
        <input type="checkbox" checked={open} disabled={busy || (!open && !ok)} onChange={(e) => flip(e.target.checked)} />
        <span>같은 학교·학년·반을 입력한 학부모가 바로 들어올 수 있게 하기</span>
      </label>
      <p className="muted">우리 반 학부모가 다 모였다면 꺼 두세요. 끄면 새로 들어오려는 사람은 참여할 수 없어요.</p>
    </div>
  );
}

/* ---------- 참여 중 ---------- */
function Joined({ user, fid, family, kids, books, records, shares, classReady, say, cid, focus, news }) {
  const [cls, setCls] = useState(null);
  const [stats, setStats] = useState([]);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState(focus === 'board' ? 'board' : 'summary');
  const newCount = (news?.req || 0) + (news?.reply || 0);

  useEffect(() => {
    if (!classReady) return;
    const e = (x) => setErr('학급 정보를 불러오지 못했어요: ' + (x.code || x.message));
    const a = onSnapshot(doc(db, 'classes', cid), (s) => setCls(s.exists() ? { id: s.id, ...s.data() } : null), e);
    const b = onSnapshot(collection(db, 'classes', cid, 'stats'), (s) => setStats(s.docs.map((d) => d.data())), e);
    return () => { a(); b(); };
  }, [cid, classReady]);

  if (!classReady) return <div className="glass card empty">학급에 연결하는 중이에요…<br /><span className="muted">잠시 후에도 안 보이면 다시 열어 주세요.</span></div>;
  if (err) return <div className="glass card"><p className="err">{err}</p><LeaveBtn user={user} fid={fid} cid={cid} kids={kids} say={say} /></div>;

  const agg = aggregateClass(stats, books);
  return (
    <>
      <div className="glass card">
        <div className="row">
          <div className="grow"><h2 style={{ marginBottom: 2 }}>🏫 {cls?.name || '우리 반'}</h2>
            <div className="muted">참여 중인 어린이 {stats.length}명</div></div>
        </div>
        <div className="chips" style={{ marginTop: 8 }}>
          {[['summary', '📊 반 현황'], ['board', '🤝 책 나눔'], ['more', '⚙️ 설정']].map(([k, l]) => (
            <button key={k} className={'chip' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>{l}{k === 'board' && newCount > 0 && <b className="dot">{newCount}</b>}</button>
          ))}
        </div>
      </div>

      {tab === 'summary' && <Summary agg={agg} books={books} records={records} family={family} />}
      {tab === 'board' && <Board cid={cid} fid={fid} family={family} books={books} shares={shares} say={say} chatUrl={cls?.chatUrl} />}
      {tab === 'more' && (
        <>
          <div className="glass card">
            <h2>같은 반 학부모 초대</h2>
            <p className="muted" style={{ marginTop: 0 }}>다른 학부모는 학급 탭에서 학교 이름과 학년·반 숫자를 입력하면 이 반에 바로 들어와요. 반을 새로 만들지 않게 안내해 주세요.</p>
            <InviteBtn name={cls?.name} say={say} />
            <p className="muted" style={{ marginBottom: 0 }}>누르면 카카오톡·문자 등으로 앱 주소와 가입 방법을 보낼 수 있어요. 공유 창이 안 뜨면 안내 문구가 복사되니 메시지에 붙여 넣어 주세요.</p>
          </div>
          {cls?.ownerUid === user.uid && <OpenToggle cid={cid} cls={cls} say={say} />}
          {CHAT_ENABLED && <ChatLink cls={cls} cid={cid} isOwner={cls?.ownerUid === user.uid} say={say} />}
          {!CHAT_ENABLED && (
            <div className="glass card">
              <h2>💬 학급 단톡방</h2>
              <p className="muted">정책상 사용하지 않습니다.</p>
            </div>
          )}
          <div className="glass card">
            <h2>내 기록 공유</h2>
            <label className="switch">
              <input type="checkbox" checked={family?.classShare !== false} onChange={(e) => setClassShare(fid, e.target.checked).then(() => say(e.target.checked ? '공유를 켰어요' : '공유를 껐어요. 우리 집 숫자가 반 집계에서 빠져요.')).catch((x) => say('실패: ' + (x.code || x.message)))} />
              <span>우리 어린이의 읽은 권수·책 목록을 반 집계에 포함</span>
            </label>
            <p className="muted">공유해도 어린이 이름·메모는 보이지 않아요.</p>
          </div>
          <div className="glass card"><LeaveBtn user={user} fid={fid} cid={cid} kids={kids} say={say} /></div>
        </>
      )}
      <div className="pad-bottom" />
    </>
  );
}

function ChatLink({ cls, cid, isOwner, say }) {
  const [v, setV] = useState(cls?.chatUrl || '');
  useEffect(() => { setV(cls?.chatUrl || ''); }, [cls?.chatUrl]);
  return (
    <div className="glass card">
      <h2>💬 학급 단톡방</h2>
      {isOwner ? (
        <>
          <input className="input" placeholder="https://open.kakao.com/..." value={v} onChange={(e) => setV(e.target.value)} />
          <button className="btn primary block" style={{ marginTop: 8 }}
            onClick={() => setClassChatUrl(cid, v).then(() => say('저장했어요')).catch((e) => say(e.message || '실패'))}>저장</button>
          <p className="muted">비우면 링크가 사라져요. 반을 만든 사람만 바꿀 수 있어요.</p>
        </>
      ) : cls?.chatUrl ? <p className="muted">등록된 단톡방이 있어요. 책 나눔 탭에서 열 수 있어요.</p>
        : <p className="muted">아직 등록된 단톡방이 없어요. 반을 만든 분께 링크 등록을 부탁해 보세요.</p>}
    </div>
  );
}

function LeaveBtn({ user, fid, cid, kids, say }) {
  return (
    <button className="btn block danger" onClick={async () => {
      if (!confirm('이 반에서 나갈까요?\n우리 집이 올린 집계 숫자와 나눔 글이 모두 삭제돼요.')) return;
      try { await leaveClass(user, fid, cid, kids); say('반에서 나왔어요'); } catch (e) { say('실패: ' + (e.message || e.code)); }
    }}>이 반에서 나가기</button>
  );
}

/* ---------- 반 현황 ---------- */
function Summary({ agg, books, records, family }) {
  const mine = useMemo(() => statPayload(books, records), [books, records]);
  if (!agg.enough) {
    return (
      <div className="glass card">
        <h2>반 평균 읽은 권수</h2>
        <div className="empty">참여 어린이가 {MIN_KIDS}명 이상 모이면 평균과 인기 책을 보여드려요.<br />
          <b>지금 {agg.kids}명</b> 참여 중이에요. 코드를 친구들에게 알려 주세요! 📣</div>
        <p className="muted">적은 인원에서는 누가 몇 권 읽었는지 짐작할 수 있어서 숨겨 둬요.</p>
      </div>
    );
  }
  return (
    <>
      <div className="glass card">
        <h2>반 평균 읽은 권수</h2>
        <div className="sum" style={{ marginBottom: 0 }}>
          <div className="glass box"><div className="n">{agg.avgDone}</div><div className="l">평균 완독(권)</div></div>
          <div className="glass box"><div className="n" style={{ color: 'var(--green)' }}>{agg.avgSel}</div><div className="l">평균 선정도서</div></div>
          <div className="glass box"><div className="n" style={{ color: 'var(--blue)' }}>{agg.reading}</div><div className="l">지금 읽는 중</div></div>
        </div>
        <p className="muted">우리 어린이는 {mine.done}권 (선정 {mine.selDone}권). 비교보다 함께 읽는 즐거움을 위한 숫자예요.</p>
      </div>
      <div className="glass card">
        <h2>🔥 반에서 많이 읽은 책</h2>
        {agg.popular.length === 0 ? <div className="empty">아직 2명 이상 읽은 책이 없어요.</div> : (
          <div className="donelist">
            {agg.popular.map((p, i) => <div className="it" key={p.id}><span>{i + 1}. {p.title}</span><span className="d">{p.count}명</span></div>)}
          </div>
        )}
      </div>
      {agg.nowReading.length > 0 && (
        <div className="glass card">
          <h2>📖 요즘 읽는 책</h2>
          <div className="donelist">
            {agg.nowReading.map((p) => <div className="it" key={p.id}><span>{p.title}</span><span className="d">{p.count}명</span></div>)}
          </div>
        </div>
      )}
    </>
  );
}

/* ---------- 책 나눔 게시판 ---------- */
function Board({ cid, fid, family, books, shares, say, chatUrl }) {
  const [filter, setFilter] = useState('offer');
  const [adding, setAdding] = useState(false);
  const list = shares
    .filter((s) => (filter === 'mine' ? s.familyId === fid : s.kind === filter))
    .sort((a, b) => (a.status === 'done') - (b.status === 'done') || (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  return (
    <>
      <div className="glass card">
        <div className="chips">
          {[['offer', '🎁 나눔'], ['want', '🙋 구해요'], ['mine', '내 글']].map(([k, l]) => (
            <button key={k} className={'chip' + (filter === k ? ' on' : '')} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
        <button className="btn primary block" style={{ marginTop: 8 }} onClick={() => setAdding(!adding)}>{adding ? '닫기' : '✏️ 글 올리기'}</button>
        {CHAT_ENABLED && chatUrl && /^https:\/\//.test(chatUrl) && (
          <a className="btn block chatlink" href={chatUrl} target="_blank" rel="noopener noreferrer">💬 학급 단톡방 열기 (연락은 여기서)</a>
        )}
        <div className="meetnote">📌 약속한 시간에 학교에서 만나 <b>어린이끼리 주고 받아요.</b></div>
        <details className="help-item" open={shares.length === 0}>
          <summary>❓ 책 나눔은 이렇게 해요</summary>
          <div className="help-body"><ShareSteps /></div>
        </details>
      </div>
      {adding && <ShareForm cid={cid} fid={fid} family={family} books={books} say={say} onDone={() => setAdding(false)} />}
      {list.length === 0 && <div className="glass card empty">아직 글이 없어요.</div>}
      {list.map((s) => <ShareItem key={s.id} cid={cid} fid={fid} family={family} share={s} say={say} />)}
    </>
  );
}

function ShareForm({ cid, fid, family, books, say, onDone }) {
  const [f, setF] = useState({ kind: 'offer', title: '', note: '', nickname: family?.name || '' });
  const [busy, setBusy] = useState(false);
  const match = books.find((b) => b.title.replace(/\s+/g, '') === f.title.replace(/\s+/g, ''));
  async function save() {
    if (!f.title.trim()) return say('책 제목을 입력해 주세요');
    setBusy(true);
    try { await addShare(cid, fid, { ...f, bookId: match?.id || '' }); say('올렸어요'); onDone(); }
    catch (e) { say('실패: ' + (e.message || e.code)); }
    setBusy(false);
  }
  return (
    <div className="glass card">
      <h2>글 올리기</h2>
      <div className="chips">
        {Object.entries(KIND).map(([k, v]) => <button key={k} className={'chip' + (f.kind === k ? ' on' : '')} onClick={() => setF({ ...f, kind: k })}>{v.icon} {v.label}</button>)}
      </div>
      <label className="f">책 제목</label>
      <input className="input" list="bf-books" maxLength={80} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="목록에서 고르거나 직접 입력" />
      <datalist id="bf-books">{books.map((b) => <option key={b.id} value={b.title} />)}</datalist>
      <div className="meetnote">📌 약속한 시간에 학교에서 만나 어린이끼리 주고 받아요. 만날 시간·장소는 신청 메모와 답장으로 정해요.</div>
      <label className="f">한마디 (선택, 100자)</label>
      <input className="input" maxLength={100} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="예: 깨끗해요. 다음 주까지 가능" />
      <label className="f">표시 이름 (30자)</label>
      <input className="input" maxLength={30} value={f.nickname} onChange={(e) => setF({ ...f, nickname: e.target.value })} />
      <button className="btn primary block" style={{ marginTop: 10 }} disabled={busy} onClick={save}>올리기</button>
    </div>
  );
}

function ReqRow({ r, cid, sid, say, isNew }) {
  const [v, setV] = useState('');
  const [open, setOpen] = useState(false);
  const send = async () => {
    try { await replyRequest(cid, sid, r.familyId, v); say('답장을 보냈어요'); setOpen(false); setV(''); }
    catch (e) { say('실패: ' + (e.message || e.code)); }
  };
  return (
    <div className="it reqrow">
      <div><b>{r.nickname || '이웃'}</b>{r.note ? `: ${r.note}` : ''}
        {isNew && <b className="dot">NEW</b>}{noteEdited(r) && <span className="edited">✏️ 수정됨 ({fmt(r.noteAt)})</span>}</div>
      {r.reply && <div className="muted">내 답장: {r.reply} <span className={'seen' + (replyUnread(r) ? '' : ' on')}>{replyUnread(r) ? '⏳ 아직 안 읽음' : '👀 읽음'}</span></div>}
      {open ? (
        <div style={{ marginTop: 6 }}>
          <input className="input" maxLength={100} placeholder="예: 월요일 학교에서 나눔해요~" value={v} onChange={(e) => setV(e.target.value)} />
          <div className="row" style={{ marginTop: 6 }}>
            <button className="btn sm primary grow" onClick={send}>보내기</button>
            <button className="btn sm" onClick={() => setOpen(false)}>닫기</button>
          </div>
        </div>
      ) : <button className="btn sm" style={{ marginTop: 6 }} onClick={() => { setV(r.reply || ''); setOpen(true); }}>{r.reply ? '답장 고치기' : '💬 답장하기'}</button>}
    </div>
  );
}

function MyReq({ myReq, cid, sid, fid, say, onCancel, replyNew }) {
  const [v, setV] = useState('');
  const [open, setOpen] = useState(false);
  const send = async () => {
    try { await updateRequestNote(cid, sid, fid, v); say('메모를 남겼어요'); setOpen(false); }
    catch (e) { say('실패: ' + (e.message || e.code)); }
  };
  return (
    <div style={{ marginTop: 8 }}>
      <div className="ok">✔ 신청했어요. 글쓴이의 답장은 이 화면에 떠요. (앱을 열어 확인해 주세요)</div>
      {myReq.note && <div className="muted">내 메모: {myReq.note} <span className={'seen' + (reqUnread(myReq) ? '' : ' on')}>{reqUnread(myReq) ? '⏳ 아직 안 읽었어요' : '👀 글쓴이가 읽었어요'}</span></div>}
      {myReq.reply ? <div className="replybox">💬 글쓴이 답장: {myReq.reply}{replyNew && <b className="dot">NEW</b>}</div> : <div className="muted">아직 답장이 없어요.</div>}
      {open ? (
        <div style={{ marginTop: 6 }}>
          <input className="input" maxLength={100} placeholder="메모 남기기 (100자)" value={v} onChange={(e) => setV(e.target.value)} />
          <div className="row" style={{ marginTop: 6 }}>
            <button className="btn sm primary grow" onClick={send}>보내기</button>
            <button className="btn sm" onClick={() => setOpen(false)}>닫기</button>
          </div>
        </div>
      ) : (
        <div className="row" style={{ marginTop: 6 }}>
          <button className="btn sm grow" onClick={() => { setV(myReq.note || ''); setOpen(true); }}>메모 고쳐 보내기</button>
          <button className="btn sm" onClick={onCancel}>신청 취소</button>
        </div>
      )}
    </div>
  );
}

function ShareItem({ cid, fid, family, share, say }) {
  const mineOwn = share.familyId === fid;
  const k = KIND[share.kind] || KIND.offer;
  const [reqs, setReqs] = useState([]);
  const [myReq, setMyReq] = useState(null);
  const [ask, setAsk] = useState(false);
  const [note, setNote] = useState('');
  const done = share.status === 'done';
  const [newReq, setNewReq] = useState({});
  const [replyNew, setReplyNew] = useState(false);
  const marked = useRef(new Set());

  useEffect(() => {
    const e = () => {};
    if (mineOwn) return onSnapshot(collection(db, 'classes', cid, 'shares', share.id, 'requests'), (s) => setReqs(s.docs.map((d) => d.data())), e);
    return onSnapshot(doc(db, 'classes', cid, 'shares', share.id, 'requests', fid), (s) => setMyReq(s.exists() ? s.data() : null), e);
  }, [cid, share.id, fid, mineOwn]);

  // 새 신청: 화면에 보이고 3초 뒤 '읽음'으로 기록 (이 화면을 벗어나기 전까지 NEW는 유지)
  useEffect(() => {
    if (!mineOwn) return undefined;
    const un = reqs.filter(reqUnread);
    if (!un.length) return undefined;
    setNewReq((f) => { const n = { ...f }; un.forEach((r) => { n[r.familyId] = true; }); return n; });
    const t = setTimeout(() => un.forEach((r) => {
      const k = r.familyId + ':' + noteTime(r);
      if (marked.current.has(k)) return;
      marked.current.add(k);
      markPosterSeen(cid, share.id, r.familyId).catch(() => marked.current.delete(k));
    }), 3000);
    return () => clearTimeout(t);
  }, [reqs, mineOwn, cid, share.id]);
  // 새 답장: 신청자가 화면에서 보고 3초 뒤 '읽음'으로 기록
  useEffect(() => {
    if (mineOwn || !myReq || !replyUnread(myReq)) return undefined;
    setReplyNew(true);
    const k = 'reply:' + ms(myReq.replyAt) + ':' + myReq.reply;
    const t = setTimeout(() => {
      if (marked.current.has(k)) return;
      marked.current.add(k);
      markReplySeen(cid, share.id, fid).catch(() => marked.current.delete(k));
    }, 3000);
    return () => clearTimeout(t);
  }, [myReq, mineOwn, cid, share.id, fid]);

  const run = async (fn, ok) => { try { await fn(); if (ok) say(ok); } catch (e) { say('실패: ' + (e.message || e.code)); } };

  return (
    <div className={'glass bk share' + (done ? ' done' : '')}>
      <div><span className={'badge ' + (share.kind === 'offer' ? 'sel' : 'rec')}>{k.icon} {k.label}</span>{done && <span className="badge cat">완료</span>}</div>
      <div className="t">{share.title}</div>
      {share.note && <div className="muted" style={{ marginBottom: 4 }}>{share.note}</div>}
      <div className="muted">{share.nickname || '이웃'}{mineOwn ? ' (우리 집)' : ''}</div>

      {mineOwn ? (
        <>
          {reqs.length > 0 && (
            <div className="reqs">
              <div className="label-row">신청 {reqs.length}건 · 답장 메모를 남기고, 책은 학교에서 어린이끼리 주고 받아요</div>
              {reqs.map((r) => <ReqRow key={r.familyId} r={r} cid={cid} sid={share.id} say={say} isNew={!!newReq[r.familyId]} />)}
            </div>
          )}
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn sm grow" onClick={() => run(() => setShareStatus(cid, share, done ? 'open' : 'done'), done ? '다시 열었어요' : '완료 처리했어요')}>{done ? '다시 열기' : '✅ 나눔 완료'}</button>
            <button className="btn sm danger" onClick={() => confirm('이 글을 삭제할까요?') && run(() => deleteShare(cid, share.id), '삭제했어요')}>삭제</button>
          </div>
        </>
      ) : done ? null : myReq ? (
        <MyReq myReq={myReq} cid={cid} sid={share.id} fid={fid} say={say} replyNew={replyNew} onCancel={() => run(() => cancelRequest(cid, share.id, fid), '신청을 취소했어요')} />
      ) : ask ? (
        <div style={{ marginTop: 8 }}>
          <div className="muted" style={{ marginBottom: 6 }}>📌 책은 학교에서 만나서 주고 받아요. 언제 어디서 만날지 적어 주세요.</div>
          <input className="input" maxLength={100} placeholder="예: 정빈이 엄마에요. 다음 주 월요일에 가능해요!" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn primary grow" onClick={() => run(async () => { await requestShare(cid, share.id, fid, { nickname: family?.name || '', note }); setAsk(false); setNote(''); }, '신청했어요')}>보내기</button>
            <button className="btn" onClick={() => setAsk(false)}>취소</button>
          </div>
        </div>
      ) : (
        <button className="btn sm block" style={{ marginTop: 8 }} onClick={() => setAsk(true)}>{k.btn}</button>
      )}
    </div>
  );
}
