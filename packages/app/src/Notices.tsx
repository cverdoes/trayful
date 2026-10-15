import { useEffect, useState } from 'react';
import { useStore } from './store';
import { keepTableInView } from './viewport';

/** Shown while the project files have errors; the table keeps the last good version. */
export function Problems() {
  const problems = useStore((s) => s.problems);
  if (!problems?.length) return null;
  return (
    <div className="problems" role="alert">
      <strong>The project files have errors.</strong> The table shows the last version that loaded;
      fix the files and save to update it.
      <pre>{problems.join('\n')}</pre>
    </div>
  );
}

/** Says what an agent or another player just did, so everyone can follow along. */
export function Activity() {
  const activity = useStore((s) => s.activity);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!activity) return;
    setVisible(true);
    if (activity.agent) keepTableInView();
    const timer = setTimeout(() => setVisible(false), 5000);
    return () => clearTimeout(timer);
  }, [activity]);
  if (!activity || !visible) return null;
  return (
    <div className="activity" role="status">
      <strong>{activity.name}</strong> {activity.text}
    </div>
  );
}

/** The latest error from the server, shown for a few seconds. */
export function ErrorToast() {
  const error = useStore((s) => s.error);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!error) return;
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 4000);
    return () => clearTimeout(timer);
  }, [error]);
  if (!error || !visible) return null;
  return (
    <div className="toast" role="alert">
      {error.message}
    </div>
  );
}
