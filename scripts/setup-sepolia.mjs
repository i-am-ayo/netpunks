import { copyFile, chmod } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { root } from '../shared/paths.js';

const target = path.join(root, '.env.sepolia');
try {
  await copyFile(path.join(root, '.env.sepolia.example'), target, constants.COPYFILE_EXCL);
  await chmod(target, 0o600);
  console.log('Created .env.sepolia (owner read/write only). Fill in RPC, test-wallet key, and final metadata URI locally.');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('.env.sepolia already exists; its contents were preserved.');
}
