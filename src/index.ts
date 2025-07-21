import assert from "assert";
import moneroTs from "monero-ts";
import { connectWallet, disconnectWallet, getCurrentAccount, isWalletConnected, getProvider } from "./auth";
import { ethers } from "ethers";
import { createSwap, generateSecret, getSwapDetails, claimSwap, refundSwap } from "./contract";

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
  const exchangeRateElement = document.getElementById("exchange-rate") as HTMLElement;
  const networkFeeElement = document.getElementById("network-fee") as HTMLElement;
  const estimatedTimeElement = document.getElementById("estimated-time") as HTMLElement;
  const connectWalletBtn = document.querySelector(".connect-wallet") as HTMLButtonElement;
  
  // Initial values
  let currentFromCurrency = "usdc";
  let currentToCurrency = "xmr";
  let ethereumAddress: string | null = null;
  
  // Relayer usage will be determined automatically based on wallet balance
  let useRelayer = true; // Default to using relayer
  
  // Function to check wallet balance and determine if relayer should be used
  async function checkWalletBalanceForRelayer(): Promise<void> {
    if (!ethereumAddress) return;
    
    try {
      const provider = getProvider();
      if (!provider) return;
      
      const balance = await provider.getBalance(ethereumAddress);
      const balanceInEth = ethers.formatEther(balance);
      
      // If balance is zero, use relayer, otherwise don't use relayer
      useRelayer = balance === 0n;
      
      console.log(`Wallet balance: ${balanceInEth} ETH`);
      console.log(`Using relayer: ${useRelayer ? 'Yes' : 'No'} (determined by wallet balance)`);
      
      // Update network fee based on relayer usage
      updateNetworkFee();
    } catch (error) {
      console.error("Error checking wallet balance:", error);
    }
  }
  
  // Initial UI setup
  updateExchangeRate(currentFromCurrency, currentToCurrency);
  updateNetworkFee();
  
  // Event listeners
  connectWalletBtn.addEventListener("click", async () => {
    console.log("Connect wallet button clicked");
    try {
      // Show loading state
      connectWalletBtn.textContent = "Connecting...";
      connectWalletBtn.disabled = true;
      
      // Connect wallet
      ethereumAddress = await connectWallet();
      
      if (ethereumAddress) {
        console.log("Wallet connected:", ethereumAddress);
        // Update button text to show connected address
        connectWalletBtn.textContent = `${ethereumAddress.substring(0, 6)}...${ethereumAddress.substring(ethereumAddress.length - 4)}`;
        
        // Check wallet balance to determine if relayer should be used
        await checkWalletBalanceForRelayer();
        
        // Enable swap button if amount is valid
        updateSwapButtonState();
      } else {
        console.error("Failed to connect wallet");
        connectWalletBtn.textContent = "Connect Wallet";
      }
    } catch (error) {
      console.error("Error connecting wallet:", error);
      connectWalletBtn.textContent = "Connect Wallet";
    } finally {
      connectWalletBtn.disabled = false;
    }
  });
  
  // Listen for wallet account changes
  window.addEventListener("walletAccountChanged", async (event: any) => {
    const newAccount = event.detail;
    console.log("Wallet account changed:", newAccount);
    ethereumAddress = newAccount;
    
    if (newAccount) {
      connectWalletBtn.textContent = `${newAccount.substring(0, 6)}...${newAccount.substring(newAccount.length - 4)}`;
      // Check wallet balance to determine if relayer should be used
      await checkWalletBalanceForRelayer();
    } else {
      connectWalletBtn.textContent = "Connect Wallet";
    }
    
    // Update swap button state
    updateSwapButtonState();
  });
  
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
  
  // Listen for wallet chain changes
  window.addEventListener("walletChainChanged", (event: any) => {
    console.log("Wallet chain changed:", event.detail);
    // Reload the page as recommended by MetaMask
    window.location.reload();
  });
  
  // Swap button
  swapButton.addEventListener("click", async () => {
    if (swapButton.disabled) return;
    
    try {
      // Show loading state
      const originalText = swapButton.textContent;
      swapButton.textContent = "Creating swap...";
      swapButton.disabled = true;
      
      // Get the amount to swap
      const amount = parseFloat(fromAmount.value);
      if (isNaN(amount) || amount <= 0) {
        throw new Error("Please enter a valid amount");
      }
      
      // Get the receiver address for XMR
      const receiverAddress = document.getElementById("receiver-address") as HTMLInputElement;
      if (!receiverAddress.value) {
        throw new Error("Please enter a valid XMR wallet address");
      }
      
      // Generate a secret for the swap
      const { secret, secretHash } = generateSecret();
      console.log("Generated secret:", secret);
      console.log("Secret hash:", secretHash);
      
      // Get the signer
      const provider = getProvider();
      if (!provider) {
        throw new Error("No provider available");
      }
      const signer = await provider.getSigner();
      
      // Create the swap
      // Use a 24-hour timelock by default (in seconds)
      const timelock = 24 * 60 * 60;
      const swapId = await createSwap(signer, amount, secretHash, timelock);
      
      // Show success message with swap details
      const successMessage = `
        Swap created successfully!\n\n
        Swap ID: ${swapId}\n
        Amount: ${amount} USDC\n
        Secret: ${secret}\n
        Secret Hash: ${secretHash}\n\n
        IMPORTANT: Save this information! You will need the secret to claim your XMR.
      `;
      
      alert(successMessage);
      
      // Reset the form
      fromAmount.value = "";
      toAmount.value = "";
      receiverAddress.value = "";
      
      // Update button state
      updateSwapButtonState();
    } catch (error: any) {
      console.error("Error creating swap:", error);
      alert(`Error creating swap: ${error.message || error}`);
    } finally {
      // Reset button state
      swapButton.textContent = "Create Swap";
      swapButton.disabled = false;
    }
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
    // Determine fee based on relayer usage
    const fee = useRelayer ? 0.5 : 2.0; // Lower fee with relayer
    const time = useRelayer ? "5-15 minutes" : "30-60 minutes";
    
    networkFeeElement.textContent = `${fee} USDC`;
    estimatedTimeElement.textContent = time;
  }
  
  function updateSwapButtonState(): void {
    const fromValue = parseFloat(fromAmount.value) || 0;
    const walletConnected = ethereumAddress !== null;
    
    if (fromValue > 0 && walletConnected) {
      swapButton.disabled = false;
    } else {
      swapButton.disabled = true;
    }
    
    // Update swap button text based on wallet connection
    if (!walletConnected) {
      swapButton.textContent = "Connect wallet first";
    } else if (fromValue <= 0) {
      swapButton.textContent = "Enter amount";
    } else {
      swapButton.textContent = "Swap";
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