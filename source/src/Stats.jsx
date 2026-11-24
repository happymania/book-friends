import React from 'react';
import { LIB, READ, downloadCsv, today } from './util';
import { computeBadges } from './logic';
import { Stars } from './BookList';

function Prog({ label, d, t, color }) {
  const pct = t ? Math.round((d / t) * 100) : 0;
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="stat-row"><span>{label}</span><span>{d} / {t}권 ({pct}%)</span></div>
      <div className="bar"><i style={{ width: pct + '%', background: color }} /></div>
    </div>
  );
}

export default function Stats({ books, records, kid, isParent, family }) {
  const rd = (b) => records[b.id]?.read || 'none';
  const by = (fn) => books.filter(fn);
  const sel = by((b) => b.type === '선정'), rec = by((b) => b.type === '권장');
  const dn = (arr) => arr.filter((b) => rd(b) === 'done').length;
  const cats = [...new Set(books.map((b) => b.cat))];
  const libCount = { borrowed: 0, returned: 0, purchased: 0, none: 0 };
  books.forEach((b) => { libCount[b.lib || 'none']++; });
  const dones = books.filter((b) => rd(b) === 'done')
    .map((b) => ({ ...b, date: records[b.id]?.done_date || '', rating: records[b.id]?.rating || 0, review: records[b.id]?.review || '' }))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const bd = computeBadges(books, records, today());
  const earnedN = bd.badges.filter((x) => x.earned).length;

  function exportCsv() {
    const rows = [['구분', '분류', '제목', '도서확보', '읽기상태', '완독일', '별점', '한줄평']];
    books.forEach((b) => rows.push([b.type, b.cat, b.title, LIB[b.lib || 'none'].label, READ[rd(b)].label.replace('!', ''), records[b.id]?.done_date || '', records[b.id]?.rating || '', records[b.id]?.review || '']));
    downloadCsv(`독서기록_${kid?.name || ''}_${today()}.csv`, rows);
  }

  return (
    <>
      <div className="glass card">
        <h2>{kid?.emoji} {kid?.name}의 독서 현황</h2>
        <Prog label="전체" d={dn(books)} t={books.length} color="linear-gradient(90deg,#ffd23f,#f2a900)" />
        <Prog label="선정도서" d={dn(sel)} t={sel.length} color="linear-gradient(90deg,#ff9b9b,#e05a5a)" />
        <Prog label="권장도서" d={dn(rec)} t={rec.length} color="linear-gradient(90deg,#8bbcff,#4b86e0)" />
      </div>
      <div className="glass card">
        <h2>🏅 배지 ({earnedN}/{bd.badges.length})</h2>
        <div className="streak">🔥 연속 읽기 <b>{bd.streak}주</b> · 이번 달 <b>{bd.monthCount}권</b></div>
        <div className="badges">
          {bd.badges.map((x) => (
            <div key={x.id} className={'bdg' + (x.earned ? ' on' : '')} title={x.desc}>
              <div className="e">{x.icon}</div>
              <div className="nm">{x.name}</div>
              <div className="pg">{x.earned ? '획득!' : x.progress}</div>
            </div>
          ))}
        </div>
        <p className="muted">배지는 완독 기록으로 자동 계산돼요. 완독을 취소하면 함께 사라져요.</p>
      </div>
      <div className="glass card">
        <h2>분류별 완독</h2>
        {cats.map((c) => { const arr = by((b) => b.cat === c); return <Prog key={c} label={c} d={dn(arr)} t={arr.length} color="linear-gradient(90deg,#9be3b4,#3ea96a)" />; })}
      </div>
      <div className="glass card">
        <h2>도서 확보 현황</h2>
        <div className="sum" style={{ marginBottom: 0 }}>
          {['borrowed', 'returned', 'purchased'].map((k) => (
            <div key={k} className="glass box"><div className="n">{libCount[k]}</div><div className="l">{LIB[k].icon} {LIB[k].label}</div></div>
          ))}
        </div>
        <p className="muted">아직 확보 안 한 책: {libCount.none}권</p>
      </div>
      <div className="glass card">
        <h2>완독 기록</h2>
        {dones.length === 0 ? <div className="empty">아직 완독한 책이 없어요. 첫 완독을 응원해요! 💪</div> : (
          <div className="donelist">
            {dones.map((b) => (
              <div className="it itrev" key={b.id}>
                <div className="itrow"><span>🏆 {b.title}</span><span className="d">{b.date || '날짜 미기록'}</span></div>
                {(b.rating > 0 || b.review) && <div className="reviewshow">{b.rating > 0 && <Stars value={b.rating} />}{b.review && <div>“{b.review}”</div>}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
      {isParent && <button className="btn block" onClick={exportCsv}>📥 CSV로 내보내기 (엑셀용)</button>}
      <div className="pad-bottom" />
    </>
  );
}
