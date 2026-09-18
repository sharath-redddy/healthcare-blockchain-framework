/**
 * WalletConnect.jsx
 *
 * Reusable MetaMask wallet connection widget. Shows:
 *  - "Connect MetaMask" button when not connected
 *  - Connected wallet address (shortened) with online indicator
 *  - Network name / chain ID
 *  - "Wrong Network" warning + "Switch Network" button if on wrong chain
 *  - "Disconnect" option (clears local state — MetaMask stays connected)
 *
 * Props:
 *   onConnected(verifiedAddress: string) — called after full signed-challenge auth
 *   onDisconnected()                     — called when user disconnects
 *   connectedWallet: string | null        — currently authenticated wallet (from parent)
 *   compact: bool                         — if true, renders a pill-only view (for Navbar)
 */

import { useState, useEffect, useCallback } from 'react';
import {
  isMetaMaskInstalled,
  connectWallet,
  getCurrentChainId,
  ensureCorrectNetwork,
  getAuthenticatedWallet,
  getConnectedAccounts,
} from '../services/web3Service';

const CHAIN_NAMES = {
  1: 'Ethereum Mainnet',
  5: 'Goerli Testnet',
  11155111: 'Sepolia Testnet',
  137: 'Polygon Mainnet',
  80001: 'Polygon Mumbai',
  80002: 'Polygon Amoy',
  31337: 'Hardhat Local',
  1337: 'Localhost',
};

const EXPECTED_CHAIN_ID = import.meta.env.VITE_CHAIN_ID
  ? parseInt(import.meta.env.VITE_CHAIN_ID, 10)
  : 31337;

function formatAddress(addr) {
  if (!addr) return '';
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function WalletConnect({ onConnected, onDisconnected, connectedWallet, compact = false }) {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [switchingNetwork, setSwitchingNetwork] = useState(false);

  const refreshChainId = useCallback(async () => {
    const id = await getCurrentChainId();
    setChainId(id);
  }, []);

  // On mount: check if MetaMask is already connected and what network we're on
  useEffect(() => {
    refreshChainId();

    if (!isMetaMaskInstalled()) return;

    // Listen for account changes
    const handleAccountsChanged = (accounts) => {
      if (!accounts || accounts.length === 0) {
        if (onDisconnected) onDisconnected();
      }
    };

    // Listen for chain changes
    const handleChainChanged = () => {
      refreshChainId();
    };

    window.ethereum.on('accountsChanged', handleAccountsChanged);
    window.ethereum.on('chainChanged', handleChainChanged);

    return () => {
      if (window.ethereum.removeListener) {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
        window.ethereum.removeListener('chainChanged', handleChainChanged);
      }
    };
  }, [onDisconnected, refreshChainId]);

  async function handleConnect() {
    setError(null);
    setConnecting(true);
    try {
      // Full signed-challenge authentication flow
      const verifiedAddress = await getAuthenticatedWallet();
      await refreshChainId();
      if (onConnected) onConnected(verifiedAddress);
    } catch (err) {
      setError(err.message);
    } finally {
      setConnecting(false);
    }
  }

  async function handleSwitchNetwork() {
    setError(null);
    setSwitchingNetwork(true);
    try {
      await ensureCorrectNetwork();
      await refreshChainId();
    } catch (err) {
      setError(err.message);
    } finally {
      setSwitchingNetwork(false);
    }
  }

  function handleDisconnect() {
    if (onDisconnected) onDisconnected();
  }

  const isWrongNetwork = chainId !== null && chainId !== EXPECTED_CHAIN_ID;
  const networkName = chainId ? (CHAIN_NAMES[chainId] || `Chain ${chainId}`) : 'Unknown Network';
  const expectedNetworkName = CHAIN_NAMES[EXPECTED_CHAIN_ID] || `Chain ${EXPECTED_CHAIN_ID}`;

  if (compact) {
    // ── Compact / Navbar variant ──────────────────────────────────────
    return (
      <div className="wallet-connect-compact">
        {/* Network badge */}
        <div
          className={`network-pill ${isWrongNetwork ? 'network-wrong' : 'network-ok'}`}
          title={isWrongNetwork ? `Wrong network! Expected: ${expectedNetworkName}` : networkName}
        >
          <span className={`wallet-status-dot ${isWrongNetwork ? 'wrong' : 'online'}`} />
          <span className="network-label">
            {isWrongNetwork ? '⚠ Wrong Network' : networkName}
          </span>
        </div>

        {/* Wallet status */}
        {connectedWallet ? (
          <div className="wallet-connected-group">
            <div className="wallet-connected-pill" title={connectedWallet}>
              <span className="wallet-status-dot online" />
              <span className="wallet-addr">{formatAddress(connectedWallet)}</span>
            </div>
            {isWrongNetwork && (
              <button
                className="switch-network-btn"
                onClick={handleSwitchNetwork}
                disabled={switchingNetwork}
              >
                {switchingNetwork ? 'Switching...' : 'Switch'}
              </button>
            )}
            <button className="disconnect-btn" onClick={handleDisconnect} title="Disconnect wallet">
              ✕
            </button>
          </div>
        ) : (
          <button className="connect-wallet-btn" onClick={handleConnect} disabled={connecting}>
            {connecting ? (
              <>
                <span className="btn-spinner" />
                Authenticating...
              </>
            ) : (
              '🦊 Connect MetaMask'
            )}
          </button>
        )}

        {error && <div className="wallet-error-toast">{error}</div>}
      </div>
    );
  }

  // ── Full / Card variant ───────────────────────────────────────────────
  return (
    <div className="wallet-connect-card">
      <div className="wallet-connect-header">
        <span className="wallet-connect-icon">🦊</span>
        <div>
          <h4>MetaMask Wallet</h4>
          <p className="wallet-connect-sub">
            Authenticate with a cryptographic signature — no password needed.
          </p>
        </div>
      </div>

      {!isMetaMaskInstalled() && (
        <div className="wallet-no-metamask">
          <p>
            MetaMask is not installed.{' '}
            <a
              href="https://metamask.io/download/"
              target="_blank"
              rel="noreferrer"
              className="metamask-install-link"
            >
              Install MetaMask
            </a>{' '}
            to enable blockchain wallet features.
          </p>
          <p className="wallet-no-metamask-note">
            You can still use the system with manual wallet address entry.
          </p>
        </div>
      )}

      {isMetaMaskInstalled() && !connectedWallet && (
        <div className="wallet-connect-cta">
          <button
            className="portal-btn-primary wallet-auth-btn"
            onClick={handleConnect}
            disabled={connecting}
          >
            {connecting ? (
              <>
                <span className="btn-spinner" />
                &nbsp;Authenticating with MetaMask...
              </>
            ) : (
              '🔐 Sign In with MetaMask'
            )}
          </button>
          <p className="wallet-auth-hint">
            You will be asked to sign a one-time message. This does not cost gas or create a transaction.
          </p>
        </div>
      )}

      {connectedWallet && (
        <div className="wallet-connected-info">
          <div className="wallet-address-row">
            <span className="wallet-status-dot online" />
            <code className="wallet-full-address">{connectedWallet}</code>
          </div>

          <div className="wallet-network-row">
            <strong>Network:</strong>
            {isWrongNetwork ? (
              <span className="network-wrong-badge">
                ⚠ {networkName} (expected {expectedNetworkName})
              </span>
            ) : (
              <span className="network-ok-badge">✅ {networkName}</span>
            )}
          </div>

          {isWrongNetwork && (
            <button
              className="portal-btn-secondary"
              onClick={handleSwitchNetwork}
              disabled={switchingNetwork}
            >
              {switchingNetwork ? 'Switching...' : `Switch to ${expectedNetworkName}`}
            </button>
          )}

          <button className="portal-btn-danger disconnect-full-btn" onClick={handleDisconnect}>
            Disconnect Wallet
          </button>
        </div>
      )}

      {error && (
        <div className="portal-alert alert-error" style={{ marginTop: '0.75rem', fontSize: '0.82rem' }}>
          ⚠️ {error}
          <button
            onClick={() => setError(null)}
            style={{ marginLeft: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

export default WalletConnect;
