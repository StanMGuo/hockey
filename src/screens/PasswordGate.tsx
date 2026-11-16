import { useEffect, useState, type FormEvent } from 'react';
import { checkPassword, unlockGate } from '../auth/gate';
import { noteVisit } from '../visit/report';

type Props = { onUnlock: () => void };

export default function PasswordGate({ onUnlock }: Props) {
  const [value, setValue] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    noteVisit({ screen: 'gate', mode: null, scenarioId: null, sheet: null });
  }, []);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (checkPassword(value)) {
      unlockGate();
      onUnlock();
      return;
    }
    setError(true);
    setValue('');
  }

  return (
    <section className="screen on arena gate">
      <form className="gateCard" onSubmit={submit}>
        <h1>
          Hockey
          <br />
          <span className="y">Defence</span> Trainer
        </h1>
        <p className="gateSub">Enter the access password to continue.</p>
        <label className="gateLabel" htmlFor="gate-pass">
          Password
        </label>
        <input
          id="gate-pass"
          className="gateInput"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(false);
          }}
        />
        {error ? <p className="gateErr">Wrong password. Try again.</p> : null}
        <button className="btn go gateBtn" type="submit">
          Unlock
        </button>
      </form>
    </section>
  );
}
