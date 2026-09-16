// Browser-extension wallet connections.
// Ethereum: EIP-6963 multi-injected provider discovery, with a window.ethereum fallback.
// Solana:   Wallet Standard discovery, with legacy window.* provider fallbacks.
import { getWallets } from '@wallet-standard/app';

const STORAGE_KEY = 'alphard:wallet';
const $ = (id) => document.getElementById(id);

const INSTALL = {
  evm: [
    { name: 'MetaMask', url: 'https://metamask.io/download/' },
    { name: 'Rabby', url: 'https://rabby.io/' },
    { name: 'Coinbase Wallet', url: 'https://www.coinbase.com/wallet/downloads' },
    { name: 'Phantom', url: 'https://phantom.com/download' }
  ],
  sol: [
    { name: 'Phantom', url: 'https://phantom.com/download' },
    { name: 'Solflare', url: 'https://solflare.com/download' },
    { name: 'Backpack', url: 'https://backpack.app/download' }
  ]
};

const EVM_CHAINS = {
  1: 'Ethereum', 10: 'Optimism', 56: 'BNB Chain', 137: 'Polygon', 8453: 'Base', 42161: 'Arbitrum', 43114: 'Avalanche', 11155111: 'Sepolia'
};

const fallbackIcon = (letter) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#1a1d29"/><text x="16" y="21" font-family="monospace" font-size="14" fill="#ff8a3d" text-anchor="middle">${letter}</text></svg>`)}`;

/* ---------------- Discovery ---------------- */
const evmWallets = new Map(); // key -> { key, name, icon, provider }
const solWallets = new Map(); // key -> { key, name, icon, standard?, legacy? }

function addEvm(key, name, icon, provider) {
  if (!provider || [...evmWallets.values()].some((w) => w.provider === provider)) return;
  evmWallets.set(key, { key, name, icon: icon || fallbackIcon(name[0]), provider });
  render();
}

window.addEventListener('eip6963:announceProvider', (e) => {
  const { info, provider } = e.detail || {};
  if (!info || !provider) return;
  addEvm(`evm:${info.rdns || info.uuid}`, info.name, info.icon, provider);
});
window.dispatchEvent(new Event('eip6963:requestProvider'));

function legacyEvmName(p) {
  if (p.isRabby) return 'Rabby';
  if (p.isPhantom) return 'Phantom';
  if (p.isBraveWallet) return 'Brave Wallet';
  if (p.isCoinbaseWallet) return 'Coinbase Wallet';
  if (p.isOkxWallet || p.isOKExWallet) return 'OKX Wallet';
  if (p.isTrust || p.isTrustWallet) return 'Trust Wallet';
  if (p.isRainbow) return 'Rainbow';
  if (p.isMetaMask) return 'MetaMask';
  return 'Browser Wallet';
}

// Wallets that don't implement EIP-6963 still inject window.ethereum (sometimes a providers[] array).
function scanLegacyEvm() {
  const eth = window.ethereum;
  if (!eth) return;
  const list = Array.isArray(eth.providers) && eth.providers.length ? eth.providers : [eth];
  for (const p of list) {
    const name = legacyEvmName(p);
    // Skip if a 6963 wallet with the same name was already announced
    if ([...evmWallets.values()].some((w) => w.name === name)) continue;
    addEvm(`evm:legacy:${name}`, name, null, p);
  }
}

function addSol(key, entry) {
  if ([...solWallets.values()].some((w) => w.name === entry.name)) return;
  solWallets.set(key, { key, ...entry, icon: entry.icon || fallbackIcon(entry.name[0]) });
  render();
}

const isSolanaStandard = (w) =>
  w.chains?.some((c) => c.startsWith('solana:')) && w.features['standard:connect'];

const { get: getStd, on: onStd } = getWallets();
function registerStd(wallets) {
  for (const w of wallets) if (isSolanaStandard(w)) addSol(`sol:${w.name}`, { name: w.name, icon: w.icon, standard: w });
}
registerStd(getStd());
onStd('register', (...wallets) => registerStd(wallets));

function scanLegacySol() {
  const legacy = [
    ['Phantom', window.phantom?.solana],
    ['Solflare', window.solflare],
    ['Backpack', window.backpack],
    ['Brave Wallet', window.braveSolana],
    ['Coinbase Wallet', window.coinbaseSolana],
    ['Glow', window.glowSolana],
    ['OKX Wallet', window.okxwallet?.solana]
  ];
  for (const [name, p] of legacy) if (p?.connect) addSol(`sol:legacy:${name}`, { name, legacy: p });
}

/* ---------------- State ---------------- */
let session = null; // { chain: 'evm'|'sol', key, name, icon, address, network, cleanup }

function save() {
  try {
    session ? localStorage.setItem(STORAGE_KEY, JSON.stringify({ chain: session.chain, name: session.name })) : localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

function setError(msg) { $('wallet-error').textContent = msg || ''; }

function friendlyError(err) {
  const code = err?.code;
  const msg = err?.message || String(err);
  if (code === 4001 || /reject|denied|cancel/i.test(msg)) return 'Request cancelled in the wallet.';
  if (code === -32002) return 'A request is already pending — open your wallet extension.';
  return msg.length > 140 ? msg.slice(0, 140) + '…' : msg;
}

async function connectEvm(w, { silent = false } = {}) {
  const p = w.provider;
  const accounts = await p.request({ method: silent ? 'eth_accounts' : 'eth_requestAccounts' });
  if (!accounts?.length) throw new Error('No account returned.');
  let network = 'EVM';
  try { const id = parseInt(await p.request({ method: 'eth_chainId' }), 16); network = EVM_CHAINS[id] || `Chain ${id}`; } catch {}

  const onAccounts = (accs) => (accs?.length ? update({ address: accs[0] }) : disconnect(false));
  const onChain = (hex) => { const id = parseInt(hex, 16); update({ network: EVM_CHAINS[id] || `Chain ${id}` }); };
  p.on?.('accountsChanged', onAccounts);
  p.on?.('chainChanged', onChain);

  setSession({
    chain: 'evm', key: w.key, name: w.name, icon: w.icon, address: accounts[0], network,
    cleanup: async (revoke) => {
      p.removeListener?.('accountsChanged', onAccounts);
      p.removeListener?.('chainChanged', onChain);
      if (revoke) { try { await p.request({ method: 'wallet_revokePermissions', params: [{ eth_accounts: {} }] }); } catch {} }
    }
  });
}

async function connectSol(w, { silent = false } = {}) {
  if (w.standard) {
    const std = w.standard;
    const { accounts } = await std.features['standard:connect'].connect(silent ? { silent: true } : undefined);
    const acc = accounts?.[0] || std.accounts?.[0];
    if (!acc) throw new Error('No account returned.');
    const off = std.features['standard:events']?.on('change', ({ accounts: next }) => {
      if (!next) return;
      next.length ? update({ address: next[0].address }) : disconnect(false);
    });
    setSession({
      chain: 'sol', key: w.key, name: w.name, icon: w.icon, address: acc.address, network: 'Solana',
      cleanup: async () => { off?.(); try { await std.features['standard:disconnect']?.disconnect(); } catch {} }
    });
  } else {
    const p = w.legacy;
    const res = await p.connect(silent ? { onlyIfTrusted: true } : undefined);
    const pk = res?.publicKey || p.publicKey;
    if (!pk) throw new Error('No account returned.');
    const onChange = (next) => (next ? update({ address: next.toString() }) : disconnect(false));
    p.on?.('accountChanged', onChange);
    setSession({
      chain: 'sol', key: w.key, name: w.name, icon: w.icon, address: pk.toString(), network: 'Solana',
      cleanup: async () => { p.off?.('accountChanged', onChange) ?? p.removeListener?.('accountChanged', onChange); try { await p.disconnect(); } catch {} }
    });
  }
}

function setSession(s) { session = s; save(); render(); }
function update(patch) { if (session) { Object.assign(session, patch); render(); } }

async function disconnect(revoke = true) {
  const s = session;
  session = null;
  save();
  render();
  if (s?.cleanup) await s.cleanup(revoke);
}

async function connect(chain, key, button) {
  setError('');
  const w = (chain === 'evm' ? evmWallets : solWallets).get(key);
  if (!w) return;
  if (session) await disconnect(false);
  button?.classList.add('busy');
  try {
    chain === 'evm' ? await connectEvm(w) : await connectSol(w);
  } catch (err) {
    setError(friendlyError(err));
  } finally {
    button?.classList.remove('busy');
  }
}

/* ---------------- UI ---------------- */
const short = (a) => (a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

function renderList(el, wallets, chain) {
  const items = [...wallets.values()];
  if (!items.length) {
    el.innerHTML = `<li class="wallet-empty mono">No ${chain === 'evm' ? 'Ethereum' : 'Solana'} extension found. Install one:
      ${INSTALL[chain].map((i) => `<a href="${i.url}" target="_blank" rel="noopener">${i.name} ↗</a>`).join('')}</li>`;
    return;
  }
  el.innerHTML = items.map((w) => {
    const active = session && session.chain === chain && session.key === w.key;
    return `<li><button class="wallet-item${active ? ' active' : ''}" data-chain="${chain}" data-key="${encodeURIComponent(w.key)}">
      <img src="${escapeHtml(w.icon)}" alt="" /><span class="wi-name">${escapeHtml(w.name)}</span>
      <span class="mono wi-state">${active ? 'Connected' : 'Detected'}</span></button></li>`;
  }).join('');
}

function escapeHtml(s) { return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }

function render() {
  const lists = $('wallet-list-evm');
  if (!lists) return;
  renderList($('wallet-list-evm'), evmWallets, 'evm');
  renderList($('wallet-list-sol'), solWallets, 'sol');

  const btn = $('wallet-btn');
  $('wallet-btn-label').textContent = session ? short(session.address) : 'Connect wallet';
  btn.classList.toggle('connected', !!session);

  $('wallet-connected').hidden = !session;
  $('wallet-title').textContent = session ? 'Your wallet' : 'Connect a wallet';
  if (session) {
    $('wc-icon').src = session.icon;
    $('wc-meta').textContent = `${session.name} · ${session.network}`;
    $('wc-address').textContent = session.address;
  }
}

function openModal() {
  scanLegacyEvm();
  scanLegacySol();
  window.dispatchEvent(new Event('eip6963:requestProvider'));
  render();
  $('wallet-modal').classList.add('open');
  $('wallet-modal').setAttribute('aria-hidden', 'false');
}
function closeModal() {
  $('wallet-modal').classList.remove('open');
  $('wallet-modal').setAttribute('aria-hidden', 'true');
  setError('');
}

export function initWallet() {
  $('wallet-btn').addEventListener('click', openModal);
  document.querySelectorAll('[data-wallet-close]').forEach((el) => el.addEventListener('click', closeModal));
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('wallet-modal').classList.contains('open')) closeModal(); });

  $('wallet-lists').addEventListener('click', (e) => {
    const b = e.target.closest('.wallet-item');
    if (b) connect(b.dataset.chain, decodeURIComponent(b.dataset.key), b);
  });
  $('wc-disconnect').addEventListener('click', () => disconnect(true));
  $('wc-copy').addEventListener('click', async (e) => {
    if (!session) return;
    try { await navigator.clipboard.writeText(session.address); e.currentTarget.textContent = 'Copied'; }
    catch { e.currentTarget.textContent = 'Copy failed'; }
    const t = e.currentTarget; setTimeout(() => (t.textContent = 'Copy address'), 1400);
  });

  render();

  // Silently restore the last connection once extensions have had a moment to inject.
  setTimeout(async () => {
    scanLegacyEvm();
    scanLegacySol();
    let saved;
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch {}
    if (!saved) return;
    const pool = saved.chain === 'evm' ? evmWallets : solWallets;
    const w = [...pool.values()].find((x) => x.name === saved.name);
    if (!w) return;
    try { saved.chain === 'evm' ? await connectEvm(w, { silent: true }) : await connectSol(w, { silent: true }); }
    catch { try { localStorage.removeItem(STORAGE_KEY); } catch {} }
  }, 600);
}
