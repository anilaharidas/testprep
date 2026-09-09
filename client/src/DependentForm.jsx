import { useState } from 'react';

/** name + grade entry. onAdd returns a promise; clears on success. */
export default function DependentForm({ grades, label, onAdd, disabled, submitText = 'Save' }) {
  const [name, setName] = useState('');
  const [grade, setGrade] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onAdd(name.trim(), grade);
      setName('');
      setGrade('');
    } catch (err) {
      setError(err.message || 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      {error && <div className="notice error">{error}</div>}
      <label className="field">
        {label} name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Full name"
          disabled={disabled || busy}
        />
      </label>
      <label className="field">
        Grade
        <select value={grade} onChange={(e) => setGrade(e.target.value)} disabled={disabled || busy}>
          <option value="">Select grade</option>
          {grades.map((g) => (
            <option key={g} value={g}>
              Grade {g}
            </option>
          ))}
        </select>
      </label>
      <button className="btn" type="submit" disabled={disabled || busy || !name.trim() || !grade}>
        {busy ? 'Saving…' : submitText}
      </button>
    </form>
  );
}
