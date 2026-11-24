import React, { useEffect, useState } from 'react';

const SEEN_KEY = 'bf_notice_seen';
const getSeen = () => { try { return Number(localStorage.getItem(SEEN_KEY)) || 0; } catch { return 0; } };
const setSeen = (n) => { try { localStorage.setItem(SEEN_KEY, String(n)); } catch { /* 무시 */ } };

// 공지는 notices.json 파일에서 읽어요. 파일만 바꿔 올리면 앱 업데이트 없이 반영돼요.
export default function NoticeBar() {
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const [seen, setSeenState] = useState(getSeen());

  useEffect(() => {
    let dead = false;
    fetch(new URL('notices.json', location.href).href + '?t=' + Date.now(), { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => { if (!dead && Array.isArray(d)) setList(d.filter((x) => x && x.title).sort((a, b) => b.id - a.id)); })
      .catch(() => {});
    return () => { dead = true; };
  }, []);

  if (!list.length) return null;
  const unseen = list.filter((n) => n.id > seen).length;
  const close = () => { const max = Math.max(...list.map((n) => n.id)); setSeen(max); setSeenState(max); setOpen(false); };

  return (
    <>
      <button className={'noticebar' + (unseen ? ' new' : '')} onClick={() => setOpen(true)}>
        <span>📢 공지사항</span>
        {unseen > 0 ? <b className="dot">새 글 {unseen}</b> : <span className="muted">{list.length}건</span>}
      </button>
      {open && (
        <div className="overlay" onClick={close}>
          <div className="glass modal wide" onClick={(e) => e.stopPropagation()}>
            <h2>📢 공지사항</h2>
            {list.map((n) => (
              <div className="notice" key={n.id}>
                <div className="nt">{n.title}{n.id > seen && <b className="dot">NEW</b>}</div>
                <div className="muted">{n.date}</div>
                {(n.lines || []).map((l, i) => <p key={i}>{l}</p>)}
              </div>
            ))}
            <button className="btn primary block" onClick={close}>확인했어요</button>
          </div>
        </div>
      )}
    </>
  );
}
