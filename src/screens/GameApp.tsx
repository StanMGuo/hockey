import { useEffect, useRef } from 'react';
import { createGame } from './gameController';
import { LocalStorageProgressStore } from '../state/LocalStorageProgressStore';
import type { ProgressStore } from '../state/ProgressStore';

type Props = { store?: ProgressStore };

/**
 * React is only the shell: it renders the baseline DOM structure
 * (#home, #play, #sheet) once, and the imperative game controller drives it.
 */
export default function GameApp({ store }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const destroy = createGame(root, store ?? new LocalStorageProgressStore());
    return destroy;
  }, [store]);

  return (
    <div ref={rootRef} style={{ display: 'contents' }}>
      {/* ================= HOME ================= */}
      <section id="home" className="screen on arena">
        <div className="homeInner">
          <div className="brand">
            <svg className="logo" viewBox="0 0 100 100" aria-hidden="true">
              <defs>
                <linearGradient id="lg1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#3f8cff" />
                  <stop offset="1" stopColor="#1449b8" />
                </linearGradient>
              </defs>
              <path
                d="M50 4 L88 18 V48 C88 72 70 88 50 96 C30 88 12 72 12 48 V18 Z"
                fill="url(#lg1)"
                stroke="#fff"
                strokeWidth="4"
              />
              <path d="M30 70 L58 26" stroke="#ffd23f" strokeWidth="7" strokeLinecap="round" />
              <path d="M30 70 L44 72" stroke="#ffd23f" strokeWidth="9" strokeLinecap="round" />
              <ellipse cx="64" cy="68" rx="11" ry="5" fill="#111" />
              <rect x="53" y="62" width="22" height="6" fill="#111" />
              <ellipse cx="64" cy="62" rx="11" ry="5" fill="#3a3a3a" />
            </svg>
            <h1>
              Hockey
              <br />
              <span className="y">Defence</span> Trainer
            </h1>
            <p className="sub">Learn where to go. Protect the ice. Help your team!</p>
            <div className="ladder" id="ladder"></div>
            <div className="donecount" id="doneCount"></div>
          </div>
          <div>
            <div className="bigBtns">
              <button className="big learn" id="hLearn">
                <span className="bi">👀</span>
                <span>
                  <span className="bt">LEARN</span>
                  <span className="bs">Show me where to go</span>
                </span>
              </button>
              <button className="big practice" id="hPractice">
                <span className="bi">🏒</span>
                <span>
                  <span className="bt">PRACTICE</span>
                  <span className="bs">Can you find the spots?</span>
                </span>
              </button>
              <button className="big game" id="hGame">
                <span className="bi">🏆</span>
                <span>
                  <span className="bt">GAME CHALLENGE</span>
                  <span className="bs">The puck keeps moving!</span>
                </span>
              </button>
            </div>
            <div className="homeFoot" style={{ marginTop: 12 }}>
              <button className="small" id="hHow">
                ❓ How to play
              </button>
              <button className="small" id="hSet">
                ⚙️ Settings
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ================= PLAY ================= */}
      <section id="play" className="screen arena">
        <div id="rinkWrap">
          <svg
            id="rink"
            xmlns="http://www.w3.org/2000/svg"
            preserveAspectRatio="xMidYMid meet"
            viewBox="-27 -46 105 92"
          ></svg>
          <div id="flash">
            <div className="fl"></div>
          </div>
          <div id="confetti"></div>
        </div>
        <aside id="panel">
          <div className="phead">
            <button className="ib" id="bHome" aria-label="Home">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="#fff"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 11 12 3l9 8" />
                <path d="M5 10v10h5v-6h4v6h5V10" />
              </svg>
            </button>
            <div className="ptitle">
              <div id="pMode">LEARN</div>
              <div id="pInfo"></div>
            </div>
            <button className="ib" id="bReset" aria-label="Start over">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="#fff"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 12a8 8 0 1 0 3-6.2" />
                <path d="M4 4v5h5" />
              </svg>
            </button>
          </div>
          <div id="banner" className="banner us">
            <span className="bpuck"></span>
            <span id="bText"></span>
          </div>
          <div id="prompt"></div>
          <div id="rows"></div>
          <div id="overall"></div>
          <div id="actions"></div>
        </aside>
      </section>

      <div id="sheet">
        <div className="card" id="card"></div>
      </div>
    </div>
  );
}
