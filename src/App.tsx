import { Routes, Route, Navigate, useParams, useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Board from './pages/Board';
import JobDetailPage from './pages/JobDetail';
import Admin from './pages/Admin';
import Settings from './pages/Settings';
import Archived from './pages/Archived';
import RiggingSchedule from './pages/RiggingSchedule';
import VehicleBookings from './pages/VehicleBookings';
import Activity from './pages/Activity';
import Orders from './pages/Orders';
import QuoteSizes from './pages/QuoteSizes';
import JoblioAi from './pages/JoblioAi';
import Setup from './pages/Setup';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import UpdateNotification from './components/UpdateNotification';
import RiggingAlertNotification from './components/RiggingAlertNotification';
import InstallDayPopup from './components/InstallDayPopup';
import GlobalSearch from './components/GlobalSearch';
import WhatsNew from './components/WhatsNew';
import TitlebarDrag from './components/TitlebarDrag';

function JobDetailRoute() {
  const { id } = useParams();
  const navigate = useNavigate();

  function handleClose() {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/board');
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <JobDetailPage jobId={parseInt(id!, 10)} onClose={handleClose} />
      </div>
    </div>
  );
}

export default function App() {
  const { loading, session } = useAuth();

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-canvas">
        <TitlebarDrag />
        <div className="flex flex-col items-center gap-3">
          <div className="h-9 w-9 rounded-full border-2 border-ink-10 border-t-brand animate-spin" />
          <p className="text-sm text-ink-55">Loading Joblio…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full">
      <Routes>
        <Route path="/setup" element={<Setup />} />
        <Route path="/login" element={<Login />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <div className="relative h-full">
                <div className="relative flex h-full flex-col bg-canvas">
                  <Navbar />
                  <main className="min-h-0 flex-1 overflow-hidden">
                    <Routes>
                      <Route path="/" element={<Board />} />
                      <Route path="/board" element={<Board />} />
                      <Route path="/jobs/:id" element={<JobDetailRoute />} />
                      <Route path="/admin" element={<Admin />} />
                      <Route path="/archived" element={<Archived />} />
                      <Route path="/vehicles" element={<VehicleBookings />} />
                      <Route path="/vehicle-bookings" element={<Navigate to="/vehicles" replace />} />
                      <Route path="/rigging" element={<RiggingSchedule />} />
                      <Route path="/installs" element={<Navigate to="/rigging?tab=installs" replace />} />
                      <Route path="/calendar" element={<Navigate to="/rigging" replace />} />
                      <Route path="/activity" element={<Activity />} />
                      <Route path="/orders" element={<Orders />} />
                      <Route path="/quote-sizes" element={<QuoteSizes />} />
                      <Route path="/ai" element={<JoblioAi />} />
                      <Route path="/estimates" element={<Navigate to="/ai" replace />} />
                      <Route path="/settings" element={<Settings />} />
                      <Route path="*" element={<Navigate to="/board" replace />} />
                    </Routes>
                  </main>
                </div>
                <InstallDayPopup />
                <GlobalSearch />
                {session && <WhatsNew />}
              </div>
            </ProtectedRoute>
          }
        />
      </Routes>
      {/* Mounted at app root so IPC alerts are received even before Board mounts;
          portals to document.body so Board stacking contexts cannot bury the toast. */}
      <RiggingAlertNotification />
      <UpdateNotification />
    </div>
  );
}
