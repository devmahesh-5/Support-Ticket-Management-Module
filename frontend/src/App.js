import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import Navbar from "./components/Navbar";
import LoginPage from "./components/LoginPage";
import DashboardPage from "./components/DashboardPage";
import TicketListPage from "./components/TicketListPage";
import TicketDetailPage from "./components/TicketDetailPage";
import CreateTicketPage from "./components/CreateTicketPage";
import AdminPage from "./components/AdminPage";
import NotificationsPage from "./components/NotificationsPage";

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="text-center py-5"><div className="spinner-border"></div></div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AppLayout() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return (
    <>
      <Navbar />
      <div className="container-fluid pb-4">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/tickets" element={<TicketListPage />} />
          <Route path="/tickets/new" element={<CreateTicketPage />} />
          <Route path="/tickets/:id" element={<TicketDetailPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </>
  );
}

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <div className="min-vh-100 bg-light">
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/*" element={<AppLayout />} />
          </Routes>
        </div>
      </AuthProvider>
    </Router>
  );
}
