// Simple ethers.js wallet connection implementation
import { ethers } from 'ethers';

// Global variables to track authentication state
let provider: ethers.BrowserProvider | null = null;
let signer: ethers.Signer | null = null;
let currentAccount: string | null = null;
let isConnected = false;

// Base Sepolia chain ID
const BASE_SEPOLIA_CHAIN_ID = '0x14a34';  // 84532 in decimal

// Connect to wallet
export async function connectWallet(): Promise<string | null> {
  try {
    console.log("Connecting to wallet...");
    
    // Check if MetaMask or other injected provider is available
    if (!window.ethereum) {
      console.error("No Ethereum provider found. Please install MetaMask or another wallet.");
      alert("No Ethereum wallet detected! Please install MetaMask or another compatible wallet.");
      return null;
    }
    
    // Create ethers provider
    provider = new ethers.BrowserProvider(window.ethereum);
    console.log("Provider created:", provider);
    
    // Request account access
    const accounts = await provider.send("eth_requestAccounts", []);
    console.log("Connected accounts:", accounts);
    
    if (accounts.length === 0) {
      console.error("No accounts found");
      return null;
    }
    
    currentAccount = accounts[0];
    
    // Get the signer
    signer = await provider.getSigner();
    console.log("Signer obtained:", signer);
    
    // Check if we're on Base Sepolia
    const network = await provider.getNetwork();
    const chainId = network.chainId.toString();
    console.log("Connected to chain ID:", chainId);
    
    if (chainId !== BigInt(BASE_SEPOLIA_CHAIN_ID).toString()) {
      console.warn(`Not connected to Base Sepolia. Current chain ID: ${chainId}`);
      
      // Prompt user to switch networks
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: BASE_SEPOLIA_CHAIN_ID }],
        });
      } catch (switchError: any) {
        // This error code indicates that the chain has not been added to MetaMask
        if (switchError.code === 4902) {
          try {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [
                {
                  chainId: BASE_SEPOLIA_CHAIN_ID,
                  chainName: 'Base Sepolia',
                  nativeCurrency: {
                    name: 'ETH',
                    symbol: 'ETH',
                    decimals: 18,
                  },
                  rpcUrls: ['https://sepolia.base.org'],
                  blockExplorerUrls: ['https://sepolia.basescan.org'],
                },
              ],
            });
          } catch (addError) {
            console.error("Failed to add Base Sepolia network:", addError);
          }
        } else {
          console.error("Failed to switch to Base Sepolia:", switchError);
        }
      }
    }
    
    // Set up listeners for account/chain changes
    setupEventListeners();
    
    isConnected = true;
    return currentAccount;
  } catch (error) {
    console.error("Error connecting to wallet:", error);
    return null;
  }
}

// Disconnect wallet (for UI purposes)
export function disconnectWallet(): void {
  provider = null;
  signer = null;
  currentAccount = null;
  isConnected = false;
  console.log("Wallet disconnected");
}

// Get current account
export function getCurrentAccount(): string | null {
  return currentAccount;
}

// Check if wallet is connected
export function isWalletConnected(): boolean {
  return isConnected;
}

// Get ethers provider
export function getProvider(): ethers.BrowserProvider | null {
  return provider;
}

// Get ethers signer
export function getSigner(): ethers.Signer | null {
  return signer;
}

// Setup event listeners for account and chain changes
function setupEventListeners(): void {
  if (!window.ethereum) return;
  
  window.ethereum.on('accountsChanged', (accounts: string[]) => {
    console.log("Accounts changed:", accounts);
    if (accounts.length === 0) {
      // User disconnected their wallet
      disconnectWallet();
    } else {
      currentAccount = accounts[0];
    }
    // Dispatch a custom event that the main app can listen for
    window.dispatchEvent(new CustomEvent('walletAccountChanged', { detail: accounts[0] }));
  });
  
  window.ethereum.on('chainChanged', (chainId: string) => {
    console.log("Chain changed:", chainId);
    // Dispatch a custom event that the main app can listen for
    window.dispatchEvent(new CustomEvent('walletChainChanged', { detail: chainId }));
    
    // Check if we're on Base Sepolia
    if (chainId !== BASE_SEPOLIA_CHAIN_ID) {
      console.warn("Not connected to Base Sepolia network");
    }
  });
}

// Fix TypeScript errors by declaring ethereum on window
declare global {
  interface Window {
    ethereum: any;
  }
}
