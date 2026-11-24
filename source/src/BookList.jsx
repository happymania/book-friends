import React, { useMemo, useState } from 'react';
import { LIB, READ } from './util';

function hl(text, q) {
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  return <>{text.slice(0, i)}<mark>{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
}

export default function BookList({ books, records, isParent, onLib, onRead }) {
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
              </>
            )}
          </div>
        );
      })}
    </>
  );
}
