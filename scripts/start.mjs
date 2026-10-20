process.env.NODE_ENV = 'production';
if (process.argv.includes('--sepolia')) process.env.APP_NETWORK = 'sepolia';
delete process.env.SEPOLIA_PRIVATE_KEY;
await import('../server/index.js');
