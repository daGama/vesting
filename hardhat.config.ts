require('dotenv').config();
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomiclabs/hardhat-solhint";
import { ethers } from 'ethers';
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const INFURA_KEY = process.env.INFURA_KEY || "";
const ETHERSCAN_KEY = process.env.ETHERSCAN_KEY || "";
const ARBISCAN_KEY = process.env.ARBISCAN_KEY || "";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      viaIR: true,
      optimizer: {
        enabled: true,
        runs: 100,
      },
    }
  },
  sourcify: {
    enabled: true
  },
  defaultNetwork: "hardhat",
  networks: {
    //mainnet
    // mainnet: {
    //   url: `https://mainnet.infura.io/v3/${INFURA_KEY}`,
    //   accounts: [PRIVATE_KEY]
    // },
    // polygon: {
    //   url: `https://polygon-mainnet.infura.io/v3/${INFURA_KEY}`,
    //   accounts: [PRIVATE_KEY]
    // },
    arbitrum: {
      url: `https://arbitrum-mainnet.infura.io/v3/${INFURA_KEY}`,
      accounts: [PRIVATE_KEY]
    },
    // //testnet
    // sepolia: {
    //   url: `https://sepolia.infura.io/v3/${INFURA_KEY}`,
    //   accounts: [PRIVATE_KEY]
    // },
    // mumbai: {
    //   url: `https://polygon-mumbai.infura.io/v3/${INFURA_KEY}`,
    //   accounts: [PRIVATE_KEY]
    // }
    arbitrumSepolia: {
      url: `https://arbitrum-sepolia.infura.io/v3/${INFURA_KEY}`,
      accounts: [PRIVATE_KEY]
    },
  },
  etherscan: {
      apiKey: {
        arbitrum: ARBISCAN_KEY,
        arbitrumSepolia: ARBISCAN_KEY,
    }
  
  }
};

export default config;
