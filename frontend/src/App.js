import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';

import Sidebar from './components/Sidebar';
import Navbar from './components/Navbar';
import CommandPalette from './components/common/CommandPalette';

import LoginPage from './components/LoginPage';
import DashboardPage from './components/DashboardPage';
import TicketListPage from './components/TicketListPage';
import TicketDetailPage from './components/TicketDetailPage';
import CreateTicketPage from './components/CreateTicketPage';
import AdminPage from './components/AdminPage';
import NotificationsPage from './components/NotificationsPage';
import EscalationDashboardPage from './components/escalations/EscalationDashboardPage';
import EscalationPoliciesPage from './components/escalations/EscalationPoliciesPage';

function AppLayout() {
  const { user, loading } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#0b0f17] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-600"></div>
          <span className="text-sm text-slate-500">Restoring your session...</span>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0b0f17] text-slate-900 dark:text-slate-100 flex transition-colors">
      {/* Sidebar Navigation */}
      <Sidebar 
        collapsed={collapsed} 
        setCollapsed={setCollapsed} 
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
      />

      {/* Command Palette Modal (Ctrl+K) */}
      <CommandPalette 
        isOpen={commandPaletteOpen} 
        onClose={() => setCommandPaletteOpen(false)} 
      />

      {/* Main Content Area */}
      <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${collapsed ? 'ml-20' : 'ml-64'}`}>
        <Navbar onOpenCommandPalette={() => setCommandPaletteOpen(true)} />
        <main className="flex-1 p-6 md:p-8 max-w-7xl w-full mx-auto">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/tickets" element={<TicketListPage />} />
            <Route path="/tickets/new" element={<CreateTicketPage />} />
            <Route path="/tickets/:id" element={<TicketDetailPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/escalations/dashboard" element={<EscalationDashboardPage />} />
            <Route path="/escalations/policies" element={<EscalationPoliciesPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <ThemeProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/*" element={<AppLayout />} />
          </Routes>
        </AuthProvider>
      </ThemeProvider>
    </Router>
  );
}
