import { useCallback, useMemo, useState } from 'react';
import GameApp from './screens/GameApp';
import PasswordGate from './screens/PasswordGate';
import { SessionProgressStore, type PlayerSession } from './state/SessionProgressStore';

export default function App() {
  const [session, setSession] = useState<PlayerSession | null>(null);
  const store = useMemo(
    () => (session ? new SessionProgressStore(session.token, session.nameKey, session.jersey, session.progress) : null),
    [session],
  );
  const leave = useCallback(() => {
    if (!session) return;
    void fetch('/api/logout', { method: 'POST', headers: { authorization: `Bearer ${session.token}` } });
    setSession(null);
  }, [session]);

  if (!session || !store) {
    return <PasswordGate onUnlock={setSession} />;
  }

  return <GameApp store={store} onSwitchPlayer={leave} />;
}
