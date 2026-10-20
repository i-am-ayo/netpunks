export const LOCAL_ACCOUNT_COUNT = 20;

// Keep the existing A/B identities; expose the other funded accounts without resetting the chain.
const indices = [14, 15, 16, 17, 18, 19, ...Array.from({ length: 13 }, (_, index) => index + 1)];
export const DEMO_ACCOUNTS = Object.freeze(indices.map((index, position) => Object.freeze({ index, label: String.fromCharCode(65 + position) })));

export function parseDemoAccountIndex(value) {
  if (!/^(0|[1-9]\d*)$/.test(String(value))) return null;
  const index = Number(value);
  return Number.isInteger(index) && index >= 0 && index < LOCAL_ACCOUNT_COUNT ? index : null;
}
