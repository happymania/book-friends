import React, { useEffect, useMemo, useState } from 'react';
import { LIB, READ } from './util';
import { goalOptions } from './logic';

function hl(text, q) {
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  return <>{text.slice(0, i)}<mark>{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
}

export function Stars({ value = 0, onPick }) {
  return (
    <span className="stars" role={onPick ? 'group' : 'img'} aria-label={`별점 ${value}점`}>
      {[1, 2, 3, 4, 5].map((n) => onPick
        ? <button key={n} type="button" className={'star' + (n <= value ? ' on' : '')} aria-label={`${n}점`} onClick={() => onPick(n === value ? 0 : n)}>★</button>
        : <i key={n} className={'star ro' + (n <= value ? ' on' : '')}>★</i>)}
    </span>
  );
}

// 완독한 책의 별점과 한줄평 (입력은 부모 모드에서만)
function ReviewBox({ rec, onSave }) {
  const [text, setText] = useState(rec?.review || '');
  useEffect(() => { setText(rec?.review || ''); }, [rec?.review]);
  const dirty = text.trim() !== (rec?.review || '');
  return (
    <div className="reviewbox">
      <div className="label-row">별점과 한줄평</div>
      <div className="row starrow">
        <Stars value={rec?.rating || 0} onPick={(n) => onSave({ rating: n })} />
        {(rec?.review || rec?.rating > 0) && (
          <button className="btn sm danger" style={{ marginLeft: 'auto' }}
            onClick={() => confirm('별점과 한줄평을 모두 지울까요?') && onSave({ rating: 0, review: '' })}>🗑 삭제</button>
        )}
      </div>
      <div className="row" style={{ marginTop: 6 }}>
        <input className="input grow" maxLength={100} placeholder="읽고 어땠는지 한 줄로 남겨 보세요" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn sm primary" disabled={!dirty} onClick={() => onSave({ review: text })}>{rec?.review ? '수정' : '저장'}</button>
      </div>
    </div>
  );
}

const PACE_MSG = {
  complete: ['🎉', '목표를 모두 달성했어요! 정말 대단해요.'],
  over: ['⏰', '마감일이 지났어요. 남은 책은 천천히 이어서 읽어 봐요.'],
  easy: ['😊', '여유 있어요. 일주일에 1권이면 충분해요.'],
  ok: ['👍', '좋은 페이스예요. 꾸준히만 가면 돼요.'],
  tight: ['🔥', '조금 서둘러야 해요. 이번 주 목표를 정해 볼까요?'],
  none: ['📚', '목표로 삼을 책이 없어요.'],
};

export function GoalForm({ family, books, onGoal, onClose }) {
  const [deadline, setDeadline] = useState(family?.deadline || '');
  const [target, setTarget] = useState(family?.goalTarget || 'all');
  const [ids, setIds] = useState(family?.goalBookIds || []);
  const custom = target === 'custom';
  const byId = Object.fromEntries(books.map((b) => [b.id, b]));
  const chosen = ids.filter((id) => byId[id]);
  const rest = books.filter((b) => !chosen.includes(b.id));
  return (
    <div className="goalform">
      <label className="f">목표 범위</label>
      <select className="input" value={target} onChange={(e) => setTarget(e.target.value)}>
        {goalOptions(books).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {custom && (
        <div className="picker">
          <label className="f">책 고르기 (고르면 아래에 추가돼요)</label>
          <select className="input" value="" onChange={(e) => { if (e.target.value) setIds([...chosen, e.target.value]); }}>
            <option value="">{rest.length ? '▾ 책을 골라 주세요' : '추가할 책이 없어요'}</option>
            {rest.map((b) => <option key={b.id} value={b.id}>{`[${b.type}] ${b.title}`}</option>)}
          </select>
          <div className="pickchips">
            {chosen.length === 0 && <span className="muted">아직 고른 책이 없어요.</span>}
            {chosen.map((id) => (
              <span className="pickchip" key={id}>{byId[id].title}
                <button type="button" aria-label={`${byId[id].title} 빼기`} onClick={() => setIds(chosen.filter((x) => x !== id))}>✕</button>
              </span>
            ))}
          </div>
          <div className="muted">고른 책 {chosen.length}권</div>
        </div>
      )}
      <label className="f">마감일</label>
      <input className="input" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn primary grow" disabled={!deadline || (custom && chosen.length === 0)} onClick={() => { onGoal({ deadline, goalTarget: target, goalBookIds: chosen }); onClose?.(); }}>저장</button>
        {family?.deadline && <button className="btn grow danger" onClick={() => { onGoal({ deadline: '', goalTarget: target, goalBookIds: chosen }); onClose?.(); }}>해제</button>}
        {onClose && <button className="btn grow" onClick={onClose}>닫기</button>}
      </div>
    </div>
  );
}

function PaceCard({ pace, family, books, onGoal }) {
  const [edit, setEdit] = useState(false);
  if (!pace.hasGoal) {
    return (
      <div className="glass card pace">
        <div className="row"><div className="grow"><b>🎯 읽기 목표</b><div className="muted">마감일을 정하면 일주일에 몇 권씩 읽어야 하는지 알려 드려요.</div></div>
          {!edit && <button className="btn sm" onClick={() => setEdit(true)}>정하기</button>}</div>
        {edit && <GoalForm family={family} books={books} onGoal={onGoal} onClose={() => setEdit(false)} />}
      </div>
    );
  }
  const [icon, msg] = PACE_MSG[pace.level] || PACE_MSG.ok;
  const pct = pace.total ? Math.round((pace.done / pace.total) * 100) : 0;
  return (
    <div className={'glass card pace lv-' + pace.level}>
      <div className="stat-row"><b>🎯 {pace.targetLabel} 목표</b><span>{pace.done} / {pace.total}권 ({pct}%)</span></div>
      <div className="bar"><i style={{ width: pct + '%', background: 'linear-gradient(90deg,#ffd23f,#f2a900)' }} /></div>
      <div className="pace-msg">{icon} {msg}</div>
      {pace.level !== 'complete' && pace.level !== 'over' && pace.level !== 'none' && (
        <div className="muted">마감까지 {pace.days}일 · 남은 책 {pace.remaining}권 → <b>일주일에 {pace.perWeek}권</b> (이번 주 {pace.thisWeek}권 완독)</div>
      )}
      {!edit && <button className="btn sm" style={{ marginTop: 8 }} onClick={() => setEdit(true)}>목표 고치기</button>}
      {edit && <GoalForm family={family} books={books} onGoal={onGoal} onClose={() => setEdit(false)} />}
    </div>
  );
}

export default function BookList({ books, records, isParent, onLib, onRead, onReview, onGoal, family, pace, shareHints = {}, goToClass }) {
  const [type, setType] = useState('전체');
  const [status, setStatus] = useState('전체');
  const [q, setQ] = useState('');

  const rd = (b) => records[b.id]?.read || 'none';
  const sum = useMemo(() => {
    let reading = 0, done = 0;
    books.forEach((b) => { const r = records[b.id]?.read; if (r === 'reading') reading++; else if (r === 'done') done++; });
    return { total: books.length, reading, done };
  }, [books, records]);

  const list = books.filter((b) => {
    if (type !== '전체' && b.type !== type) return false;
    const r = rd(b);
    if (status === '안읽음' && r !== 'none') return false;
    if (status === '읽는중' && r !== 'reading') return false;
    if (status === '완독' && r !== 'done') return false;
    if (q && !b.title.toLowerCase().includes(q.trim().toLowerCase())) return false;
    return true;
  });

  return (
    <>
      {pace && <PaceCard pace={pace} family={family} books={books} onGoal={onGoal} />}
      <div className="sum">
        <div className="glass box"><div className="n">{sum.total - sum.reading - sum.done}</div><div className="l">안 읽음</div></div>
        <div className="glass box"><div className="n" style={{ color: 'var(--blue)' }}>{sum.reading}</div><div className="l">읽는 중</div></div>
        <div className="glass box"><div className="n" style={{ color: 'var(--green)' }}>{sum.done}</div><div className="l">완독</div></div>
      </div>

      <div className="search">
        <input className="input" placeholder="🔍 책 제목 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        {q && <button className="x" onClick={() => setQ('')} aria-label="검색어 지우기">✕</button>}
      </div>
      <div className="chips">
        {['전체', '선정', '권장'].map((t) => <button key={t} className={'chip' + (type === t ? ' on' : '')} onClick={() => setType(t)}>{t === '전체' ? '전체' : t + '도서'}</button>)}
      </div>
      <div className="chips" style={{ marginBottom: 8 }}>
        {['전체', '안읽음', '읽는중', '완독'].map((t) => <button key={t} className={'chip' + (status === t ? ' on' : '')} onClick={() => setStatus(t)}>{t}</button>)}
      </div>
      <div className="muted" style={{ margin: '4px 4px 8px' }}>{list.length}권 표시 중</div>

      {list.length === 0 && <div className="glass card empty">{books.length === 0 ? '도서 목록이 비어 있어요. 부모 모드 설정에서 책을 추가해 주세요.' : '조건에 맞는 책이 없어요 😢'}</div>}

      {list.map((b) => {
        const r = rd(b);
        const cls = 'glass bk' + (r === 'done' ? ' s-done' : r === 'reading' ? ' s-rdg' : '');
        const lib = b.lib || 'none';
        return (
          <div key={b.id} className={cls}>
            <div>
              <span className={'badge ' + (b.type === '선정' ? 'sel' : 'rec')}>{b.type}</span>
              <span className="badge cat">{b.cat}</span>
            </div>
            <div className="t">{hl(b.title, q.trim())}</div>
            {isParent ? (
              <>
                {shareHints[b.id] > 0 && r !== 'done' && (
                  <button className="sharetag" onClick={goToClass}>🤝 우리 반 나눔 {shareHints[b.id]}건 · 보러 가기</button>
                )}
                <div className="label-row">도서 확보</div>
                <div className="btns">
                  {['borrowed', 'returned', 'purchased'].map((k) => (
                    <button key={k} className={'pb ' + ({ borrowed: 'lb', returned: 'lr', purchased: 'lp' })[k] + (lib === k ? ' on' : '')} onClick={() => onLib(b, k)}>{LIB[k].icon} {LIB[k].label}</button>
                  ))}
                </div>
                <div className="label-row">읽기 상태</div>
                <div className="btns two">
                  <button className={'pb ri' + (r === 'reading' ? ' on' : '')} onClick={() => onRead(b, 'reading')}>📖 읽는중</button>
                  <button className={'pb rd' + (r === 'done' ? ' on' : '')} onClick={() => onRead(b, 'done')}>🏆 완독!</button>
                </div>
                {r === 'done' && (records[b.id]?.rating > 0 || records[b.id]?.review) && (
                  <div className="reviewshow">{records[b.id].rating > 0 && <Stars value={records[b.id].rating} />}{records[b.id].review && <div>“{records[b.id].review}”</div>}</div>
                )}
                {r === 'done' && !(records[b.id]?.rating > 0 || records[b.id]?.review) && (
                  <div className="muted" style={{ marginTop: 6 }}>📝 별점과 한줄평은 「어린이 모드」에서 남겨요.</div>
                )}
              </>
            ) : (
              <>
                {lib !== 'none' && <span className={'libtag ' + lib}>{LIB[lib].icon} {LIB[lib].label}</span>}
                <div className="btns">
                  {['none', 'reading', 'done'].map((k, i) => (
                    <button key={k} className={'kb k' + i + (r === k ? ' on' : '')} onClick={() => (k === 'none' ? (r !== 'none' && onRead(b, r)) : onRead(b, k))}>
                      <span className="e">{READ[k].icon}</span>{READ[k].label}
                    </button>
                  ))}
                </div>
                {r === 'done' && records[b.id]?.done_date && <div className="muted" style={{ marginTop: 6 }}>🗓 {records[b.id].done_date}에 완독</div>}
                {r === 'done' && <ReviewBox rec={records[b.id]} onSave={(p) => onReview(b, p)} />}
              </>
            )}
          </div>
        );
      })}
    </>
  );
}
