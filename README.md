# Fun Gerbil XMR-USDC Atomic Swap Frontend

## Description

This project is a frontend application for the XMR-USDC atomic swap protocol, featuring the Fun Gerbil branding. It provides a user-friendly interface for users to participate in trustless atomic swaps between Monero (XMR) and USDC (an ERC20 token on Ethereum).

## Features

- Modern swap interface for USDC ↔ XMR exchanges with Fun Gerbil branding
- Cohesive UI design with coral, turquoise, and mango color scheme
- Fun Gerbil mascot and branded assets throughout the interface
- Intuitive swap process with visual stage indicators
- Monero wallet creation and management with localStorage persistence
- Connection to Monero stagenet node
- Swap direction toggle functionality
- Relayer option for anonymous funding
- Responsive design for various screen sizes

## Running the Application

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

Open the browser to http://localhost:5173/ or the port shown in the terminal.

## Current Implementation

- Created a modern swap interface with USDC ↔ XMR direction switching
- Implemented Fun Gerbil branding with cohesive color scheme and assets
- Added Fun Gerbil mascot and visual elements throughout the UI
- Created visual swap stage indicators (Create, Fund, Confirm, Complete)
- Implemented Monero wallet creation and storage in localStorage
- Connected to Monero stagenet node for blockchain synchronization
- Added UI for relayer-based transactions
- Implemented mock exchange rate calculations
- Designed responsive layout for various screen sizes

## Next Steps

1. **Ethereum Integration**
   - Implement ethers.js for Ethereum wallet connections
   - Add MetaMask integration for wallet management
   - Implement contract calls to the SwapCreator contract
   - Handle transaction signing and confirmation

2. **Dynamic Live Price Feed**
   - Integrate with cryptocurrency price APIs
   - Implement real-time price updates
   - Add price charts and historical data

3. **Backend Integration**
   - Connect to swapd instances for offer discovery
   - Implement swap initiation and monitoring
   - Add transaction status tracking
   - Implement error handling and recovery mechanisms

4. **Enhanced User Experience**
   - Add swap history and transaction tracking
   - Implement user settings and preferences
   - Add dark mode toggle
   - Improve accessibility features

## Integration Specification

### Overview

The frontend will interact with the atomic-swap backend (`swapd`) via its JSON-RPC API. Additionally, it will use ethers.js to interact with Ethereum smart contracts directly for certain operations. The frontend will support both maker and taker roles in the swap process.

### Dependencies

- **monero-ts**: For Monero wallet operations
- **ethers.js**: For Ethereum wallet and contract interactions
- **axios**: For making HTTP requests to the swapd JSON-RPC API

### Frontend Components

1. **Wallet Management**
   - Connect to Ethereum wallet (MetaMask)
   - Create/import Monero wallet
   - Display balances for both ETH/ERC20 and XMR

2. **Offer Management**
   - Create swap offers (maker)
   - Browse available offers (taker)
   - Filter offers by parameters (min/max amount, exchange rate)

3. **Swap Execution**
   - Initiate swap (taker)
   - Monitor swap progress
   - Display swap history

4. **Settings**
   - Configure RPC endpoints
   - Set network parameters (mainnet, testnet, stagenet)

### Backend Integration

#### Security-First Architecture

The frontend follows a security-first architecture where:

1. **Direct Contract Interaction**: The frontend interacts directly with Ethereum contracts using ethers.js, typically through a wallet like MetaMask.

2. **Minimal Backend Communication**: The frontend communicates with `swapd` instances only for necessary operations like discovering offers and initiating swaps, but not for sensitive wallet operations.

3. **External Monero Wallet**: Instead of integrating directly with the Monero wallet, the frontend provides an interface for users to input their Monero wallet address for receiving XMR or specifying a refund address.

#### Limited JSON-RPC API Usage

The frontend will interact with only the following essential `swapd` RPC endpoints:

1. **Discovery and Offer Management**
   - `discover`: Find peers offering swaps
   - `query`: Query a peer for their offers
   - `take`: Accept an existing swap offer

2. **Swap Status**
   - `swapStatus`: Get the status of ongoing swaps

#### Smart Contract Interaction

For direct interaction with the Ethereum smart contracts, the frontend will:

1. Connect to the deployed `SwapCreator` contract
2. Monitor contract events for swap-related activities
3. Approve ERC20 token transfers when necessary
4. Verify contract state during critical swap phases

### User Flow

#### Maker Flow (XMR → ETH)

1. Connect Ethereum wallet and import/create Monero wallet
2. Configure swap parameters (min/max XMR amount, exchange rate)
3. Create and publish offer
4. Wait for taker to accept offer
5. Execute swap protocol when offer is taken
6. Receive ETH/ERC20 upon successful completion

#### Taker Flow (ETH → XMR)

1. Connect Ethereum wallet and import/create Monero wallet
2. Browse available offers
3. Select and take an offer
4. Approve ETH/ERC20 transfer
5. Execute swap protocol
6. Receive XMR upon successful completion

### Security Considerations

1. Private keys never leave the client
2. All sensitive operations happen locally
3. Verify contract addresses and transaction parameters
4. Implement proper error handling for failed swaps
5. Provide recovery options for interrupted swaps

### Future Enhancements

1. Support for multiple ERC20 tokens
2. Integration with Fusion+ and Limit Order Protocol
3. Dutch auction mechanism for dynamic pricing
4. Mobile-friendly responsive design
5. Localization support