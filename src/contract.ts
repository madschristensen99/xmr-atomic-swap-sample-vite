import { ethers } from "ethers";
import { getProvider } from "./auth";

// SwapCreator contract address on Base Sepolia
export const SWAP_CREATOR_ADDRESS = "0xCa9209fAbc5B1fCF7935F99Ba588776222aB9c4c";

// SwapCreator contract ABI (Application Binary Interface)
// This is a simplified ABI with just the functions we need
export const SWAP_CREATOR_ABI = [
  // Create a new swap
  "function createSwap(address _token, uint256 _amount, bytes32 _secretHash, uint256 _timelock) external returns (uint256)",
  
  // Claim tokens from a swap using the secret
  "function claimSwap(uint256 _swapId, bytes32 _secret) external",
  
  // Refund a swap after timelock expires
  "function refundSwap(uint256 _swapId) external",
  
  // Get swap details
  "function swaps(uint256 _swapId) external view returns (address initiator, address token, uint256 amount, bytes32 secretHash, uint256 timelock, bool claimed, bool refunded)",
  
  // Events
  "event SwapCreated(uint256 indexed swapId, address indexed initiator, address indexed token, uint256 amount, bytes32 secretHash, uint256 timelock)",
  "event SwapClaimed(uint256 indexed swapId, bytes32 secret)",
  "event SwapRefunded(uint256 indexed swapId)"
];

// USDC token address on Base Sepolia
export const USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

// USDC token ABI (simplified)
export const USDC_ABI = [
  // Standard ERC20 functions
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
  "function symbol() external view returns (string)"
];

// Interface for swap details
export interface SwapDetails {
  initiator: string;
  token: string;
  amount: bigint;
  secretHash: string;
  timelock: bigint;
  claimed: boolean;
  refunded: boolean;
}

/**
 * Get a contract instance for the SwapCreator
 */
export function getSwapCreatorContract(signerOrProvider: ethers.Signer | ethers.Provider): ethers.Contract {
  return new ethers.Contract(SWAP_CREATOR_ADDRESS, SWAP_CREATOR_ABI, signerOrProvider);
}

/**
 * Get a contract instance for USDC
 */
export function getUSDCContract(signerOrProvider: ethers.Signer | ethers.Provider): ethers.Contract {
  return new ethers.Contract(USDC_ADDRESS, USDC_ABI, signerOrProvider);
}

/**
 * Create a new swap
 * @param signer The signer to use for the transaction
 * @param amount Amount of USDC to swap (in USDC units, not wei)
 * @param secretHash Hash of the secret used for the swap
 * @param timelock Timelock in seconds
 * @returns The swap ID
 */
export async function createSwap(
  signer: ethers.Signer,
  amount: number,
  secretHash: string,
  timelock: number
): Promise<number> {
  try {
    // Get contract instances
    const swapCreator = getSwapCreatorContract(signer);
    const usdc = getUSDCContract(signer);
    
    // Get USDC decimals
    const decimals = await usdc.decimals();
    
    // Convert amount to USDC units with proper decimals
    const amountInUSDC = ethers.parseUnits(amount.toString(), decimals);
    
    // Check USDC balance
    const address = await signer.getAddress();
    const balance = await usdc.balanceOf(address);
    
    if (balance < amountInUSDC) {
      throw new Error(`Insufficient USDC balance. You have ${ethers.formatUnits(balance, decimals)} USDC, but need ${amount} USDC.`);
    }
    
    // Check allowance
    const allowance = await usdc.allowance(address, SWAP_CREATOR_ADDRESS);
    
    // If allowance is insufficient, approve the SwapCreator to spend USDC
    if (allowance < amountInUSDC) {
      console.log("Approving USDC transfer...");
      const approveTx = await usdc.approve(SWAP_CREATOR_ADDRESS, amountInUSDC);
      await approveTx.wait();
      console.log("USDC approved for transfer");
    }
    
    // Calculate timelock timestamp (current time + timelock seconds)
    const timelockTimestamp = Math.floor(Date.now() / 1000) + timelock;
    
    // Create the swap
    console.log("Creating swap...");
    const tx = await swapCreator.createSwap(USDC_ADDRESS, amountInUSDC, secretHash, timelockTimestamp);
    const receipt = await tx.wait();
    
    // Find the SwapCreated event to get the swap ID
    const swapCreatedEvent = receipt.logs
      .map((log: any) => {
        try {
          return swapCreator.interface.parseLog(log);
        } catch (e) {
          return null;
        }
      })
      .find((event: any) => event && event.name === "SwapCreated");
    
    if (!swapCreatedEvent) {
      throw new Error("Failed to find SwapCreated event in transaction receipt");
    }
    
    const swapId = Number(swapCreatedEvent.args.swapId);
    console.log(`Swap created with ID: ${swapId}`);
    
    return swapId;
  } catch (error) {
    console.error("Error creating swap:", error);
    throw error;
  }
}

/**
 * Get details of a swap
 * @param swapId The ID of the swap
 * @returns The swap details
 */
export async function getSwapDetails(swapId: number): Promise<SwapDetails> {
  try {
    const provider = getProvider();
    if (!provider) {
      throw new Error("No provider available");
    }
    
    const swapCreator = getSwapCreatorContract(provider);
    const swapDetails = await swapCreator.swaps(swapId);
    
    return {
      initiator: swapDetails.initiator,
      token: swapDetails.token,
      amount: swapDetails.amount,
      secretHash: swapDetails.secretHash,
      timelock: swapDetails.timelock,
      claimed: swapDetails.claimed,
      refunded: swapDetails.refunded
    };
  } catch (error) {
    console.error("Error getting swap details:", error);
    throw error;
  }
}

/**
 * Claim tokens from a swap using the secret
 * @param signer The signer to use for the transaction
 * @param swapId The ID of the swap
 * @param secret The secret to claim the swap
 */
export async function claimSwap(
  signer: ethers.Signer,
  swapId: number,
  secret: string
): Promise<void> {
  try {
    const swapCreator = getSwapCreatorContract(signer);
    
    console.log("Claiming swap...");
    const tx = await swapCreator.claimSwap(swapId, secret);
    await tx.wait();
    
    console.log(`Swap ${swapId} claimed successfully`);
  } catch (error) {
    console.error("Error claiming swap:", error);
    throw error;
  }
}

/**
 * Refund a swap after timelock expires
 * @param signer The signer to use for the transaction
 * @param swapId The ID of the swap
 */
export async function refundSwap(
  signer: ethers.Signer,
  swapId: number
): Promise<void> {
  try {
    const swapCreator = getSwapCreatorContract(signer);
    
    // Get swap details to check timelock
    const swapDetails = await getSwapDetails(swapId);
    const currentTime = Math.floor(Date.now() / 1000);
    
    if (currentTime < Number(swapDetails.timelock)) {
      throw new Error(`Timelock not expired yet. Expires at ${new Date(Number(swapDetails.timelock) * 1000).toLocaleString()}`);
    }
    
    console.log("Refunding swap...");
    const tx = await swapCreator.refundSwap(swapId);
    await tx.wait();
    
    console.log(`Swap ${swapId} refunded successfully`);
  } catch (error) {
    console.error("Error refunding swap:", error);
    throw error;
  }
}

/**
 * Generate a random secret for the swap
 * @returns An object containing the secret and its hash
 */
export function generateSecret(): { secret: string; secretHash: string } {
  // Generate a random 32-byte secret
  const secret = ethers.hexlify(ethers.randomBytes(32));
  
  // Hash the secret using keccak256
  const secretHash = ethers.keccak256(secret);
  
  return { secret, secretHash };
}
