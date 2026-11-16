import { useState, type FormEvent } from 'react';
import { LogsTable } from './LogsTable';
import type { SessionView } from './format';

export function LogsPage() {
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionView[] | null>(null);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    let login: Response;
    try {
      login = await fetch('/api/logs/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password }),
      });
    } catch {
      setMessage('记录暂时读不出来');
      return;
    }
    if (login.status === 503) {
      setMessage('日志管理密码还没配置');
      return;
    }
    if (login.status === 401) {
      setMessage('密码不对');
      return;
    }
    if (!login.ok && login.status !== 204) {
      setMessage('记录暂时读不出来');
      return;
    }
    try {
      const listed = await fetch('/api/visits', { credentials: 'include' });
      if (!listed.ok) {
        setMessage('记录暂时读不出来');
        return;
      }
      const json = (await listed.json()) as { sessions: SessionView[]; storage?: string };
      if (json.storage === 'unconfigured') {
        setMessage('还没有连接数据库，所以访问没有保存。');
        return;
      }
      setSessions(json.sessions);
    } catch {
      setMessage('记录暂时读不出来');
    }
  }

  return (
    <main className="logPage">
      <h1>访问日志</h1>
      {sessions ? (
        <LogsTable sessions={sessions} timeZone={timeZone} />
      ) : (
        <form onSubmit={(event) => void submit(event)}>
          <label htmlFor="log-pass">管理密码</label>
          <input
            id="log-pass"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <button type="submit">打开</button>
          {message ? <p>{message}</p> : null}
        </form>
      )}
    </main>
  );
}
