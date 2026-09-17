import { useState } from 'react';
import './App.css';
import Navbar from './components/Navbar';
import PatientDashboard from './components/PatientDashboard';
import DoctorDashboard from './components/DoctorDashboard';
import AdminDashboard from './components/AdminDashboard';
import RoleDemo from './components/RoleDemo';

function App() {
  const [activeTab, setActiveTab] = useState('patient'); // 'patient' | 'doctor' | 'admin' | 'roles'
  const [connectedWallet, setConnectedWallet] = useState(null);

  return (
    <div className="app-shell">
      <Navbar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        connectedWallet={connectedWallet}
        onWalletConnected={setConnectedWallet}
      />

      <main className="app-main-content">
        {activeTab === 'patient' && (
          <PatientDashboard connectedWallet={connectedWallet} />
        )}

        {activeTab === 'doctor' && (
          <DoctorDashboard connectedWallet={connectedWallet} />
        )}

        {activeTab === 'admin' && (
          <AdminDashboard />
        )}

        {activeTab === 'roles' && (
          <section className="portal-container">
            <RoleDemo />
          </section>
        )}
      </main>

      <footer className="app-footer">
        <div className="footer-content">
          <span>🔒 A Patient-Centric Blockchain-Based Framework with Layer-2 Integration for Secure and Scalable Healthcare Data Management</span>
          <div className="footer-links">
            <button
              className={`footer-role-btn ${activeTab === 'roles' ? 'active' : ''}`}
              onClick={() => setActiveTab('roles')}
            >
              Demo Identity Switcher
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
