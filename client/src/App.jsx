import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import { Shell } from './ui.jsx';
import Welcome from './screens/Welcome.jsx';
import Register from './screens/Register.jsx';
import Login from './screens/Login.jsx';
import Forgot from './screens/Forgot.jsx';
import Dashboard from './screens/Dashboard.jsx';
import PracticeNow from './screens/PracticeNow.jsx';
import ShareResults from './screens/ShareResults.jsx';
import SharedQuiz from './screens/SharedQuiz.jsx';
import OperatorPanel from './screens/OperatorPanel.jsx';

export default function App() {
  return (
    <Routes>
      {/* Operator panel — standalone, no user account, no app shell */}
      <Route path="/panel/:slug" element={<OperatorPanel />} />
      {/* Shareable practice link — standalone, no login required */}
      <Route path="/share/:token" element={<SharedQuiz />} />
      <Route path="*" element={<MainApp />} />
    </Routes>
  );
}

function MainApp() {
  const { loading, account } = useAuth();

  if (loading) {
    return (
      <Shell>
        <div className="center-loading">Loading…</div>
      </Shell>
    );
  }

  return (
    <Shell>
      <Routes>
        <Route path="/" element={account ? <Navigate to="/dashboard" replace /> : <Welcome />} />
        <Route path="/register" element={account ? <Navigate to="/dashboard" replace /> : <Register />} />
        <Route path="/login" element={account ? <Navigate to="/dashboard" replace /> : <Login />} />
        <Route path="/forgot" element={account ? <Navigate to="/dashboard" replace /> : <Forgot />} />
        <Route path="/dashboard" element={account ? <Dashboard /> : <Navigate to="/" replace />} />
        <Route path="/practice" element={account ? <PracticeNow /> : <Navigate to="/" replace />} />
        <Route path="/results" element={account ? <ShareResults /> : <Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}
