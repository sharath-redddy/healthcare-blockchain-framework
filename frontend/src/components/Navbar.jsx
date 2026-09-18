import WalletConnect from './WalletConnect';

function Navbar({ activeTab, onSelectTab, connectedWallet, onWalletConnected, onWalletDisconnected }) {
  return (
    <nav className="navbar-container">
      <div className="navbar-brand">
        <div className="brand-logo-icon">🛡️</div>
        <div>
          <span className="brand-title">MedChain L2</span>
          <span className="brand-badge">Patient-Centric Security</span>
        </div>
      </div>

      <div className="navbar-tabs">
        <button
          className={`nav-tab-btn ${activeTab === 'patient' ? 'active' : ''}`}
          onClick={() => onSelectTab('patient')}
        >
          <span>👤</span> Patient Portal
        </button>
        <button
          className={`nav-tab-btn ${activeTab === 'doctor' ? 'active' : ''}`}
          onClick={() => onSelectTab('doctor')}
        >
          <span>🩺</span> Doctor Portal
        </button>
        <button
          className={`nav-tab-btn ${activeTab === 'admin' ? 'active' : ''}`}
          onClick={() => onSelectTab('admin')}
        >
          <span>🏥</span> Hospital Admin
        </button>
      </div>

      <div className="navbar-actions">
        <WalletConnect
          compact
          connectedWallet={connectedWallet}
          onConnected={onWalletConnected}
          onDisconnected={onWalletDisconnected}
        />
      </div>
    </nav>
  );
}

export default Navbar;

