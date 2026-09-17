import { useState, useEffect } from 'react';

function Navbar({ activeTab, onSelectTab, connectedWallet, onWalletConnected }) {
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    if (window.ethereum && window.ethereum.selectedAddress) {
      onWalletConnected(window.ethereum.selectedAddress);
    }
  }, [onWalletConnected]);

  async function connectMetaMask() {
    if (!window.ethereum) {
      alert('MetaMask extension is not detected in your browser. You can still manually enter/link wallet addresses in each portal.');
      return;
    }
    setConnecting(true);
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      if (accounts && accounts.length > 0) {
        onWalletConnected(accounts[0]);
      }
    } catch (err) {
      console.error('MetaMask connection error:', err);
    } finally {
      setConnecting(false);
    }
  }

  function formatAddress(addr) {
    if (!addr) return '';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  }

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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '0.35rem 0.75rem', borderRadius: '9999px' }}>
          <span className="wallet-status-dot online"></span>
          <span style={{ fontSize: '0.74rem', fontWeight: '700', color: '#047857', letterSpacing: '0.03em' }}>POLYGON L2</span>
        </div>

        {connectedWallet ? (
          <div className="wallet-connected-pill" title={connectedWallet}>
            <span className="wallet-status-dot online"></span>
            <span className="wallet-addr">{formatAddress(connectedWallet)}</span>
          </div>
        ) : (
          <button className="connect-wallet-btn" onClick={connectMetaMask} disabled={connecting}>
            {connecting ? 'Connecting...' : '🦊 Connect MetaMask'}
          </button>
        )}
      </div>
    </nav>
  );
}

export default Navbar;
