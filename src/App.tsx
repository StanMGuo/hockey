import { useState } from 'react';
import { isGateUnlocked } from './auth/gate';
import GameApp from './screens/GameApp';
import PasswordGate from './screens/PasswordGate';

export default function App() {
  const [unlocked, setUnlocked] = useState(() => isGateUnlocked());

  if (!unlocked) {
    return <PasswordGate onUnlock={() => setUnlocked(true)} />;
  }

  return <GameApp />;
}
