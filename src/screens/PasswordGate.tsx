import { useEffect, useState, type FormEvent } from 'react';
import { noteVisit } from '../visit/report';
import { normalizeJersey, normalizeNickname, normalizePin } from '../server/identity';
import {
  clearAnonymousProgress,
  isEmptyProgress,
  readAnonymousProgress,
  shouldDropAnonymous,
} from '../state/progress';
import type { PlayerSession } from '../state/SessionProgressStore';

type Props = { onUnlock: (session: PlayerSession) => void };

type Mode = 'enter' | 'create';

async function post(path: string, body: unknown): Promise<{ status: number; body: PlayerSession | { error?: string } | null }> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? (JSON.parse(text) as PlayerSession | { error?: string }) : null };
}

export default function PasswordGate({ onUnlock }: Props) {
  const [name, setName] = useState('');
  const [jersey, setJersey] = useState('');
  const [pin, setPin] = useState('');
  const [teamPassword, setTeamPassword] = useState('');
  const [mode, setMode] = useState<Mode>('enter');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    noteVisit({ screen: 'gate', mode: null, scenarioId: null, sheet: null });
  }, []);

  const nickname = normalizeNickname(name);
  const number = normalizeJersey(jersey);
  const code = normalizePin(pin);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!nickname || number == null || !code) {
      setError('Use your name, jersey number, and a 4-digit code.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (mode === 'enter') {
        const res = await post('/api/login', { nickname: name, jersey, pin });
        if (res.status === 200 && res.body && 'token' in res.body) {
          if (shouldDropAnonymous(true, readAnonymousProgress())) clearAnonymousProgress();
          onUnlock(res.body);
          return;
        }
        if (res.status === 401) setError('That code does not match.');
        else if (res.status === 404) setMode('create');
        else if (res.status === 429) setError('Too many tries. Wait a bit.');
        else setError('You need the internet to sign in.');
        return;
      }
      const local = readAnonymousProgress();
      const res = await post('/api/profiles', {
        nickname: name,
        jersey,
        pin,
        teamPassword,
        progress: isEmptyProgress(local) ? undefined : local,
      });
      if (res.status === 201 && res.body && 'token' in res.body) {
        if (!isEmptyProgress(local)) clearAnonymousProgress();
        onUnlock(res.body);
        return;
      }
      if (res.status === 401) setError('That team password does not match.');
      else if (res.status === 409) {
        setMode('enter');
        setError('That player already exists. Use their code.');
      } else if (res.status === 429) setError('Too many tries. Wait a bit.');
      else setError('You need the internet to sign in.');
    } catch {
      setError('You need the internet to sign in.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="screen on arena gate">
      <form className="gateCard" onSubmit={submit}>
        <h1>
          Hockey
          <br />
          <span className="y">Defence</span> Trainer
        </h1>
        <p className="gateSub">Type your name, jersey number, and 4-digit code.</p>
        <label className="gateLabel" htmlFor="gate-name">
          Name
        </label>
        <input
          id="gate-name"
          className="gateInput"
          autoComplete="off"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setMode('enter');
            setError('');
          }}
        />
        <label className="gateLabel" htmlFor="gate-jersey">
          Jersey number
        </label>
        <input
          id="gate-jersey"
          className="gateInput"
          inputMode="numeric"
          autoComplete="off"
          value={jersey}
          onChange={(e) => {
            setJersey(e.target.value);
            setMode('enter');
            setError('');
          }}
        />
        <label className="gateLabel" htmlFor="gate-pin">
          4-digit code
        </label>
        <input
          id="gate-pin"
          className="gateInput"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          value={pin}
          onChange={(e) => {
            setPin(e.target.value);
            setMode('enter');
            setError('');
          }}
        />
        {mode === 'create' && nickname && number != null ? (
          <>
            <p className="gateSub">
              New player: {nickname.display} #{number}. Ask a coach for the team password.
            </p>
            <label className="gateLabel" htmlFor="gate-team">
              Team password
            </label>
            <input
              id="gate-team"
              className="gateInput"
              type="password"
              autoComplete="off"
              value={teamPassword}
              onChange={(e) => {
                setTeamPassword(e.target.value);
                setError('');
              }}
            />
          </>
        ) : null}
        {error ? <p className="gateErr">{error}</p> : null}
        <button className="btn go gateBtn" type="submit" disabled={busy}>
          {mode === 'create' ? 'Create my profile' : "Let's play"}
        </button>
      </form>
    </section>
  );
}
