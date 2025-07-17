import assert from "assert";
import moneroTs from "monero-ts";

// @ts-ignore
window.monero = moneroTs;

// Configuration
const STAGENET_NODE = "https://stagenet.xmr.ditatompel.com";
const STAGENET_NODE_PORT = 38089;
const CONTRACT_ADDRESS = "0xCa9209fAbc5B1fCF7935F99Ba588776222aB9c4c";
const USDC_CONTRACT_ADDRESS = "0xda9d4f9b69ac6C22e444eD9aF0CfC043b7a7f53f"; // Sepolia USDC
const SWAPD_RPC_URL = "http://localhost:5000";

// Exchange rate (mock for now)
const XMR_TO_USDC_RATE = 150; // 1 XMR = 150 USDC

// Types
interface WalletData {
  seed: string;
  address: string;
  createdAt: string;
}

interface MoneroWalletKeys {
  getSeed(): Promise<string>;
  getAddress(accountIndex: number, addressIndex: number): Promise<string>;
  getPrivateSpendKey(): Promise<string>;
  getPrivateViewKey(): Promise<string>;
}

main();

async function main() {
  // Check if we have a wallet in localStorage
  const savedWallet = localStorage.getItem('xmrWallet');
  let walletKeys: MoneroWalletKeys;
  
  if (savedWallet) {
    try {
      // Restore wallet from saved data
      const walletData = JSON.parse(savedWallet) as WalletData;
      console.log("Restoring wallet from localStorage");
      // When restoring from seed, don't provide language parameter
      walletKeys = await moneroTs.createWalletKeys({
        networkType: moneroTs.MoneroNetworkType.STAGENET,
        seed: walletData.seed
      });
      console.log("Wallet restored successfully");
    } catch (error) {
      console.error("Error restoring wallet:", error);
      // If restoration fails, create a new wallet
      walletKeys = await createNewWallet();
    }
  } else {
    // Create a new wallet
    walletKeys = await createNewWallet();
  }

  // Display wallet information
  await updateWalletDisplay(walletKeys);
  
  // Setup UI controls
  setupSwapInterface(walletKeys);
  
  // Test connection to Monero node (don't block UI if it fails)
  testMoneroConnection().catch(error => {
    console.error("Monero connection error:", error);
    updateConnectionStatus(false, error.message);
  });
}

async function createNewWallet(): Promise<MoneroWalletKeys> {
  console.log("Creating new wallet");
  const walletKeys = await moneroTs.createWalletKeys({
    networkType: moneroTs.MoneroNetworkType.STAGENET,
    language: "English",
  });
  
  try {
    // Save wallet to localStorage
    const seed = await walletKeys.getSeed();
    const address = await walletKeys.getAddress(0, 0);
    
    // Store only what's needed to restore the wallet
    localStorage.setItem('xmrWallet', JSON.stringify({
      seed,
      address,
      createdAt: new Date().toISOString()
    }));
    
    console.log("Wallet saved to localStorage successfully");
  } catch (error) {
    console.error("Failed to save wallet to localStorage:", error);
  }
  
  return walletKeys;
}

async function updateWalletDisplay(walletKeys: MoneroWalletKeys): Promise<void> {
  document.getElementById("wallet_address")!.innerHTML = "Address: " + (await walletKeys.getAddress(0, 0));
  document.getElementById("wallet_seed_phrase")!.innerHTML = "Seed phrase: " + (await walletKeys.getSeed());
  document.getElementById("wallet_spend_key")!.innerHTML = "Spend key: " + (await walletKeys.getPrivateSpendKey());
  document.getElementById("wallet_view_key")!.innerHTML = "View key: " + (await walletKeys.getPrivateViewKey());
}

function setupSwapInterface(walletKeys: MoneroWalletKeys): void {
  // Get UI elements
  const fromAmount = document.getElementById("from-amount") as HTMLInputElement;
  const toAmount = document.getElementById("to-amount") as HTMLInputElement;
  const fromCurrency = document.getElementById("from-currency") as HTMLSelectElement;
  const toCurrency = document.getElementById("to-currency") as HTMLSelectElement;
  const swapDirectionBtn = document.getElementById("swap-direction-btn") as HTMLButtonElement;
  const swapButton = document.getElementById("swap-button") as HTMLButtonElement;
  const useRelayer = document.getElementById("use-relayer") as HTMLInputElement;
  const exchangeRate = document.getElementById("exchange-rate") as HTMLElement;
  const networkFee = document.getElementById("network-fee") as HTMLElement;
  
  // Set initial exchange rate
  updateExchangeRate(fromCurrency.value, toCurrency.value);
  
  // Add event listeners
  fromAmount.addEventListener("input", () => {
    calculateToAmount();
    updateSwapButtonState();
  });
  
  fromCurrency.addEventListener("change", () => {
    // Update the to currency to be the opposite
    toCurrency.value = fromCurrency.value === "usdc" ? "xmr" : "usdc";
    updateExchangeRate(fromCurrency.value, toCurrency.value);
    calculateToAmount();
    updateNetworkFee();
  });
  
  swapDirectionBtn.addEventListener("click", () => {
    // Swap the currencies
    const tempCurrency = fromCurrency.value;
    fromCurrency.value = toCurrency.value;
    toCurrency.value = tempCurrency;
    
    // Clear the amounts
    fromAmount.value = "";
    toAmount.value = "";
    
    // Update the exchange rate
    updateExchangeRate(fromCurrency.value, toCurrency.value);
    updateNetworkFee();
    updateSwapButtonState();
  });
  
  useRelayer.addEventListener("change", () => {
    updateNetworkFee();
  });
  
  swapButton.addEventListener("click", () => {
    // This would be replaced with actual swap logic
    alert("Swap functionality will be implemented in the next phase.");
  });
  
  // Helper functions
  function calculateToAmount(): void {
    const amount = parseFloat(fromAmount.value) || 0;
    let calculatedAmount = 0;
    
    if (fromCurrency.value === "usdc" && toCurrency.value === "xmr") {
      calculatedAmount = amount / XMR_TO_USDC_RATE;
    } else if (fromCurrency.value === "xmr" && toCurrency.value === "usdc") {
      calculatedAmount = amount * XMR_TO_USDC_RATE;
    }
    
    toAmount.value = calculatedAmount.toFixed(6);
  }
  
  function updateExchangeRate(from: string, to: string): void {
    if (from === "usdc" && to === "xmr") {
      exchangeRate.textContent = `1 USDC = ${(1 / XMR_TO_USDC_RATE).toFixed(6)} XMR`;
    } else if (from === "xmr" && to === "usdc") {
      exchangeRate.textContent = `1 XMR = ${XMR_TO_USDC_RATE.toFixed(2)} USDC`;
    }
  }
  
  function updateNetworkFee(): void {
    const relayerFee = useRelayer.checked ? 0.01 : 0;
    const baseFee = fromCurrency.value === "usdc" ? 0.005 : 0.001;
    const totalFee = baseFee + relayerFee;
    
    networkFee.textContent = `${totalFee.toFixed(6)} ${fromCurrency.value.toUpperCase()}`;
  }
  
  function updateSwapButtonState(): void {
    const amount = parseFloat(fromAmount.value) || 0;
    swapButton.disabled = amount <= 0;
    
    if (amount <= 0) {
      swapButton.textContent = "Enter an amount";
    } else {
      swapButton.textContent = "Connect Wallet to Swap";
    }
  }
  
  // Initialize
  updateNetworkFee();
  updateSwapButtonState();
}

async function testMoneroConnection(): Promise<void> {
  try {
    console.log(`Connecting to Monero stagenet node: ${STAGENET_NODE}`);
    
    // Try different connection methods
    let daemon;
    try {
      // First try with proxy to worker (which works better for browser CORS issues)
      daemon = await moneroTs.connectToDaemonRpc({
        uri: STAGENET_NODE,
        proxyToWorker: true
      });
    } catch (e) {
      console.log("Failed with proxyToWorker: true, trying without proxy");
      daemon = await moneroTs.connectToDaemonRpc({
        uri: STAGENET_NODE,
        proxyToWorker: false
      });
    }
    
    const height = await daemon.getHeight();
    console.log(`Connected to Monero stagenet node. Current height: ${height}`);
    
    updateConnectionStatus(true, height.toString());
  } catch (error: any) {
    console.error("Failed to connect to Monero node:", error);
    updateConnectionStatus(false, error.message || "Unknown error");
    throw error;
  }
}

function updateConnectionStatus(connected: boolean, message: string): void {
  const statusElement = document.getElementById('connection_status') || document.createElement('div');
  statusElement.id = 'connection_status';
  
  if (connected) {
    statusElement.className = 'connected';
    statusElement.innerHTML = `Connected to Monero stagenet node. Current height: ${message}`;
  } else {
    statusElement.className = 'error';
    statusElement.innerHTML = `Failed to connect to Monero node: ${message}`;
  }
  
  if (!document.getElementById('connection_status')) {
    const container = document.querySelector('.container');
    if (container) {
      container.appendChild(statusElement);
    } else {
      document.body.appendChild(statusElement);
    }
  }
}

async function testSampleCode() {

  console.log("Using monero-ts version: " + moneroTs.getVersion());

  // connect to mainnet daemon without worker proxy
  let daemon1 = await moneroTs.connectToDaemonRpc({server: "https://moneronode.org:18081", proxyToWorker: false});
  console.log("Daemon height 1: " + await daemon1.getHeight());

  // connect to mainnet daemon with worker proxy
  let daemon2 = await moneroTs.connectToDaemonRpc({server: "https://moneronode.org:18081", proxyToWorker: true});
  console.log("Daemon height 2: " + await daemon2.getHeight());

  // connect to a daemon
  console.log("Connecting to daemon");
  let daemon = await moneroTs.connectToDaemonRpc("http://localhost:28081");
  let height = await daemon.getHeight();            // 1523651
  let feeEstimate = await daemon.getFeeEstimate();  // 1014313512
  let txsInPool = await daemon.getTxPool();         // get transactions in the pool
  
  // create wallet from seed phrase using WebAssembly bindings to monero-project
  console.log("Creating wallet from seed phrase");
  let walletFull = await moneroTs.createWalletFull({
    password: "supersecretpassword123",
    networkType: moneroTs.MoneroNetworkType.TESTNET,
    seed: "silk mocked cucumber lettuce hope adrenalin aching lush roles fuel revamp baptism wrist long tender teardrop midst pastry pigment equip frying inbound pinched ravine frying",
    restoreHeight: 171,
    server: {
      uri: "http://localhost:28081",
      username: "superuser",
      password: "abctesting123"
    }
  });
  
  // synchronize with progress notifications
  console.log("Synchronizing wallet");
  await walletFull.sync(new class extends moneroTs.MoneroWalletListener {
    async onSyncProgress(height: number, startHeight: number, endHeight: number, percentDone: number, message: string) {
      //console.log("Sync progress: " + percentDone + "%");
    }
  });
  
  // synchronize in the background
  await walletFull.startSyncing(5000);
  
  // listen for incoming transfers
  let fundsReceived = false;
  await walletFull.addListener(new class extends moneroTs.MoneroWalletListener {
    async onOutputReceived(output: moneroTs.MoneroOutputWallet) {
      let amount = output.getAmount();
      let txHash = output.getTx().getHash();
      fundsReceived = true;
    }
  });

  // open wallet on monero-wallet-rpc
  console.log("Opening monero-wallet-rpc");
  let walletRpc = await moneroTs.connectToWalletRpc("http://localhost:28084", "rpc_user", "abc123");
  await walletRpc.openWallet("test_wallet_1", "supersecretpassword123");
  let primaryAddress = await walletRpc.getPrimaryAddress(); // 555zgduFhmKd2o8rPUz...
  await walletRpc.sync();                                   // synchronize with the network
  let balance = await walletRpc.getBalance();               // 533648366742
  let txs = await walletRpc.getTxs();                       // get transactions containing transfers to/from the wallet

  // send funds from RPC wallet to WebAssembly wallet
  console.log("Transferring funds from monero-wallet-rpc");
  let createdTx = await walletRpc.createTx({
    accountIndex: 0,
    address: await walletFull.getAddress(1, 0),
    amount: 5000000n, // amount to transfer in atomic units
    relay: false // create transaction and relay to the network if true
  });
  let fee = createdTx.getFee(); // "Are you sure you want to send... ?"
  await walletRpc.relayTx(createdTx); // relay the transaction
  
  // recipient receives unconfirmed funds within 5s seconds
  await new Promise(function(resolve) { setTimeout(resolve, 5000); });
  assert(fundsReceived);
  
  // close wallets
  console.log("Closing wallets");
  await walletFull.close();
  await walletRpc.close();
  console.log("Done running XMR sample app");
}