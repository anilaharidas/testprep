import { useNavigate } from 'react-router-dom';
import { Card } from '../ui.jsx';

export default function Welcome() {
  const nav = useNavigate();
  return (
    <Card>
      <h1>Get test-ready</h1>
      <p className="sub">
        A questionnaire app for high-school test prep. Practice yourself, or share a test link
        with your students or children — no profiles to set up. Free to use.
      </p>
      <button className="btn" onClick={() => nav('/register')}>
        Create an account
      </button>
      <div style={{ height: 10 }} />
      <button className="btn secondary" onClick={() => nav('/login')}>
        I already have an account
      </button>
      <p className="foot-links">
        Identity is verified with a one-time code on WhatsApp.
      </p>
    </Card>
  );
}
