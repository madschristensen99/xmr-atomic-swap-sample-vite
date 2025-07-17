import assert from "assert";
import moneroTs from "monero-ts";

// @ts-ignore
window.monero = moneroTs;

// Configuration
const STAGENET_NODE = "https://stagenet.xmr.ditatompel.com";
const STAGENET_NODE_PORT = 38089;
const CONTRACT_ADDRESS = "0xCa9209fAbc5B1fCF7935F99Ba588776222aB9c4c";
const USDC_CONTRACT_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"; // Sepolia USDC
const SWAPD_RPC_URL = "http://localhost:5000";

// Exchange rate - will be updated from API
let XMR_TO_USDC_RATE = 150; // Default fallback value

// CoinGecko API endpoints
const COINGECKO_API_BASE = "https://api.coingecko.com/api/v3";
const PRICE_ENDPOINT = `${COINGECKO_API_BASE}/simple/price?ids=monero&vs_currencies=usd&include_24hr_change=true`;

// Function to fetch current XMR price
async function fetchXmrPrice(): Promise<number | null> {
  try {
    const response = await fetch(PRICE_ENDPOINT);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    
    // CoinGecko returns price in USD, which we can use as USDC (approximately 1:1)
    const xmrUsdPrice = data.monero.usd;
    console.log(`Fetched XMR price: $${xmrUsdPrice} USD`);
    
    return xmrUsdPrice;
  } catch (error) {
    console.error("Failed to fetch XMR price:", error);
    return null;
  }
}

// Function to update price periodically
function startPriceUpdates(intervalMs = 60000) { // Default: update every minute
  // Initial fetch
  updateLivePrice();
  
  // Set interval for updates
  setInterval(updateLivePrice, intervalMs);
}

// Function to show the price is updating
function showPriceUpdating(isUpdating: boolean) {
  const indicator = document.getElementById('price-indicator');
  if (indicator) {
    if (isUpdating) {
      indicator.classList.add('updating');
    } else {
      indicator.classList.remove('updating');
    }
  }
}

// Update price and UI
async function updateLivePrice() {
  try {
    // Show updating indicator
    showPriceUpdating(true);
    
    const price = await fetchXmrPrice();
    if (price !== null) {
      XMR_TO_USDC_RATE = price;
      
      // Update UI if elements exist
      const exchangeRateElement = document.getElementById("exchange-rate");
      if (exchangeRateElement) {
        // Update the exchange rate display with live data
        const fromCurrencyElement = document.getElementById("from-currency");
        const toCurrencyElement = document.getElementById("to-currency");
        
        if (fromCurrencyElement && toCurrencyElement) {
          const fromCurrency = fromCurrencyElement.textContent?.trim().toLowerCase().includes("usdc") ? "usdc" : "xmr";
          const toCurrency = toCurrencyElement.textContent?.trim().toLowerCase().includes("usdc") ? "usdc" : "xmr";
          
          if (fromCurrency === "usdc" && toCurrency === "xmr") {
            exchangeRateElement.textContent = `1 USDC ≈ ${(1 / XMR_TO_USDC_RATE).toFixed(6)} XMR`;
          } else {
            exchangeRateElement.textContent = `1 XMR ≈ ${XMR_TO_USDC_RATE.toFixed(2)} USDC`;
          }
        }
      }
      
      // Recalculate amounts if needed
      const fromAmount = document.getElementById("from-amount") as HTMLInputElement;
      if (fromAmount && fromAmount.value) {
        // We'll recalculate in the main function context where calculateToAmount is defined
        const event = new Event('input', { bubbles: true });
        fromAmount.dispatchEvent(event);
      }
    }
  } catch (error) {
    console.error("Error updating price:", error);
  } finally {
    // Hide updating indicator when done (whether successful or not)
    showPriceUpdating(false);
  }
}

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

// Global type declarations
declare global {
  interface Window {
    monero: any;
    moneroWalletAddress: string;
  }
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
  // Update wallet info in the hidden section (for development purposes)
  document.getElementById("wallet_address")!.innerHTML = "Address: " + (await walletKeys.getAddress(0, 0));
  document.getElementById("wallet_seed_phrase")!.innerHTML = "Seed phrase: " + (await walletKeys.getSeed());
  document.getElementById("wallet_spend_key")!.innerHTML = "Spend key: " + (await walletKeys.getPrivateSpendKey());
  document.getElementById("wallet_view_key")!.innerHTML = "View key: " + (await walletKeys.getPrivateViewKey());
  
  // Store wallet address in a global variable for later use in the swap process
  window.moneroWalletAddress = await walletKeys.getAddress(0, 0);
}

function setupSwapInterface(walletKeys: MoneroWalletKeys): void {
  // Get UI elements
  const fromAmount = document.getElementById("from-amount") as HTMLInputElement;
  const toAmount = document.getElementById("to-amount") as HTMLInputElement;
  const fromCurrency = document.getElementById("from-currency") as HTMLDivElement;
  const toCurrency = document.getElementById("to-currency") as HTMLDivElement;
  const swapDirectionBtn = document.getElementById("swap-direction-btn") as HTMLButtonElement;
  const swapButton = document.getElementById("swap-button") as HTMLButtonElement;
  const useRelayer = document.getElementById("use-relayer") as HTMLInputElement;
  const exchangeRateElement = document.getElementById("exchange-rate") as HTMLElement;
  const networkFeeElement = document.getElementById("network-fee") as HTMLElement;
  const estimatedTimeElement = document.getElementById("estimated-time") as HTMLElement;
  const connectWalletBtn = document.querySelector(".connect-wallet") as HTMLButtonElement;
  
  // Initial values
  let currentFromCurrency = "usdc";
  let currentToCurrency = "xmr";
  
  // Initial UI setup
  updateExchangeRate(currentFromCurrency, currentToCurrency);
  updateNetworkFee();
  
  // Event listeners
  fromAmount.addEventListener("input", () => {
    calculateToAmount();
    updateSwapButtonState();
  });
  
  swapDirectionBtn.addEventListener("click", () => {
    // Swap currencies
    const tempCurrency = currentFromCurrency;
    currentFromCurrency = currentToCurrency;
    currentToCurrency = tempCurrency;
    
    // Update UI
    // The currency selectors are now divs, not select elements
    fromCurrency.innerHTML = `
      <img src="./assets/${currentFromCurrency === 'usdc' ? 'usdc.png' : 'monero.png'}" alt="${currentFromCurrency.toUpperCase()} icon" class="currency-icon" />
      ${currentFromCurrency.toUpperCase()}
    `;
    
    toCurrency.innerHTML = `
      <img src="./assets/${currentToCurrency === 'usdc' ? 'usdc.png' : 'monero.png'}" alt="${currentToCurrency.toUpperCase()} icon" class="currency-icon" />
      ${currentToCurrency.toUpperCase()}
    `;
    
    // Recalculate amounts
    calculateToAmount();
    updateExchangeRate(currentFromCurrency, currentToCurrency);
    updateNetworkFee();
  });
  
  // Since we're now using divs instead of select elements, we don't need the change event
  // The swap direction button handles the currency switching
  
  // Start live price updates (every 30 seconds)
  startPriceUpdates(30000);
  
  // Make sure we calculate the initial values
  calculateToAmount();
  updateExchangeRate(currentFromCurrency, currentToCurrency);
  updateNetworkFee();
  
  // Add event listener for the use relayer checkbox
  useRelayer.addEventListener("change", () => {
    updateNetworkFee();
  });
  
  // Connect wallet button event listener
  connectWalletBtn.addEventListener("click", async () => {
    // Placeholder for wallet connection logic
    alert("Ethereum wallet connection will be implemented in a future update.");
    connectWalletBtn.textContent = "Wallet Connected";
    connectWalletBtn.disabled = true;
    swapButton.disabled = false;
  });
  
  useRelayer.addEventListener("change", () => {
    updateNetworkFee();
  });
  
  // Connect wallet button
  connectWalletBtn.addEventListener("click", async () => {
    try {
      // For now, just show the wallet is connected
      connectWalletBtn.textContent = "Wallet Connected";
      connectWalletBtn.style.backgroundColor = "#4caf50";
      
      // Enable the swap button
      updateSwapButtonState();
      
      // In the future, this would connect to MetaMask for Ethereum wallet
      // For now, we're just using the Monero wallet we already created
    } catch (error) {
      console.error("Error connecting wallet:", error);
    }
  });
  
  // Swap button
  swapButton.addEventListener("click", () => {
    if (swapButton.disabled) return;
    
    // Show a simple alert for now
    alert(`Creating ${currentFromCurrency.toUpperCase()} to ${currentToCurrency.toUpperCase()} swap for ${fromAmount.value} ${currentFromCurrency.toUpperCase()}`);
    
    // In the future, this would initiate the actual swap process
  });
  
  // Helper functions
  function calculateToAmount(): void {
    const fromValue = parseFloat(fromAmount.value) || 0;
    let toValue = 0;
    
    if (currentFromCurrency === "usdc" && currentToCurrency === "xmr") {
      // USDC to XMR
      toValue = fromValue / XMR_TO_USDC_RATE;
    } else if (currentFromCurrency === "xmr" && currentToCurrency === "usdc") {
      // XMR to USDC
      toValue = fromValue * XMR_TO_USDC_RATE;
    }
    
    // Update to amount with 6 decimal precision
    toAmount.value = toValue.toFixed(6);
  }
  
  function updateExchangeRate(from: string, to: string): void {
    if (from === "usdc" && to === "xmr") {
      exchangeRateElement.textContent = `1 USDC ≈ ${(1 / XMR_TO_USDC_RATE).toFixed(6)} XMR`;  
    } else {
      exchangeRateElement.textContent = `1 XMR ≈ ${XMR_TO_USDC_RATE.toFixed(2)} USDC`;
    }
  }
  
  function updateNetworkFee(): void {
    // Mock network fee calculation
    const baseNetworkFee = 0.001; // Base fee in USDC
    const relayerFee = useRelayer.checked ? 0.005 : 0; // Additional fee for using relayer
    const totalFee = baseNetworkFee + relayerFee;
    
    networkFeeElement.textContent = `${totalFee.toFixed(4)} ${currentFromCurrency.toUpperCase()}`;
  }
  
  function updateSwapButtonState(): void {
    const fromValue = parseFloat(fromAmount.value) || 0;
    
    if (fromValue > 0) {
      swapButton.disabled = false;
    } else {
      swapButton.disabled = true;
    }
  }
  
  // Add bouncing animation to the gerbil
  const gerbilBounce = document.querySelector(".gerbil-bounce") as HTMLElement;
  if (gerbilBounce) {
    gerbilBounce.innerHTML = "🐹";
  }
  
  // Initial calculation
  calculateToAmount();
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
    const container = document.querySelector('.main-container');
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