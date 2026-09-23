import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useAppConfig } from '../useAppConfig.js';
import { Card, Notice } from '../ui.jsx';
import DependentForm from '../DependentForm.jsx';

export default function Dashboard() {
  const { account, setAccount, logout } = useAuth();
  const cfg = useAppConfig();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  if (!account) return null;

  const { dependentLabel, dependentLabelPlural, cap, dependents, canAddDependent } = account;

  async function addDependent(name, grade) {
    const res = await api.addDependent(name, grade);
    setAccount(res.account);
    setAdding(false);
  }

  async function remove(id) {
    setError(null);
    try {
      const res = await api.removeDependent(id);
      setAccount(res.account);
    } catch (err) {
      setError(err.message || 'Could not remove.');
    }
  }

  async function copyLink(id) {
    setError(null);
    try {
      const { token } = await api.mcqShareLink(id);
      const url = `${window.location.origin}/share/${token}`;
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1500);
    } catch (err) {
      setError(err.message || 'Could not copy the link.');
    }
  }

  return (
    <Card>
      <div className="dashboard-head">
        <div>
          <h1 style={{ marginBottom: 2 }}>{account.name}</h1>
          <span className="pill">{account.role}</span>
        </div>
        <button className="btn ghost" onClick={logout}>
          Log out
        </button>
      </div>
      <p className="sub" style={{ marginTop: 12 }}>
        {account.whatsappNumber} · joined {new Date(account.createdAt + 'Z').toLocaleDateString()}
      </p>

      <div className="divider" />

      <div className="row-between">
        <strong>
          {dependentLabelPlural[0].toUpperCase() + dependentLabelPlural.slice(1)}
        </strong>
        <span className="pill">
          {dependents.length} / {cap}
        </span>
      </div>
      <p className="count-line">
        Free plan supports up to {cap} {dependentLabelPlural}.
      </p>

      {error && <Notice kind="error">{error}</Notice>}

      {dependents.length > 0 ? (
        <ul className="dep-list">
          {dependents.map((d) => (
            <li key={d.id}>
              <span>
                <span className="dep-name">{d.name}</span>{' '}
                <span className="dep-grade">· Grade {d.grade}</span>
              </span>
              <span className="dep-actions">
                <Link className="btn-link" to={`/quiz/${d.id}`}>
                  Practice
                </Link>
                <button className="btn-link" onClick={() => copyLink(d.id)}>
                  {copiedId === d.id ? 'Copied!' : 'Copy link'}
                </button>
                <button className="btn-link danger" onClick={() => remove(d.id)}>
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No {dependentLabelPlural} yet.</p>
      )}

      {adding ? (
        <>
          <div className="divider" />
          <DependentForm
            grades={cfg?.grades || []}
            label={dependentLabel[0].toUpperCase() + dependentLabel.slice(1)}
            onAdd={addDependent}
            submitText={`Add ${dependentLabel}`}
          />
          <div style={{ height: 8 }} />
          <button className="btn ghost" onClick={() => setAdding(false)}>
            Cancel
          </button>
        </>
      ) : canAddDependent ? (
        <button className="btn secondary" onClick={() => setAdding(true)}>
          Add {dependentLabel}
        </button>
      ) : (
        <Notice kind="info">
          You've reached the free-plan limit of {cap} {dependentLabelPlural}. Remove one to free a
          slot.
        </Notice>
      )}
    </Card>
  );
}
