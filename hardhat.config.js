import { defineConfig, configVariable } from 'hardhat/config';
import hardhatEthers from '@nomicfoundation/hardhat-ethers';
import { createRequire } from 'node:module';
import { LOCAL_ACCOUNT_COUNT } from './shared/demo-accounts.js';

const require = createRequire(import.meta.url);
export default defineConfig({
  plugins: [hardhatEthers],
  solidity: {
    version: '0.8.37',
    path: require.resolve('solc/soljson.js'),
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'cancun' },
  },
  networks: {
    hardhat: { type: 'edr-simulated', chainType: 'l1', chainId: 31337, accounts: { count: LOCAL_ACCOUNT_COUNT, accountsBalance: 10_000n * 10n ** 18n } },
    localhost: { type: 'http', chainType: 'l1', url: 'http://127.0.0.1:8545' },
    sepolia: {
      type: 'http', chainType: 'l1', chainId: 11155111,
      url: configVariable('SEPOLIA_RPC_URL'), accounts: [configVariable('SEPOLIA_PRIVATE_KEY')],
    },
  },
});
