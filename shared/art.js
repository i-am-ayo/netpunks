// Original deterministic 24 x 24 pixel artwork. No CryptoPunks assets are used.
export const MAX_SUPPLY = 10_000;
const skins = ['#bf8668', '#e1b28a', '#8c5e4a', '#edc7a0', '#c99575', '#b5c6a6', '#8bbdc5'];
const hairColors = ['#36302f', '#795747', '#e6b44f', '#c37a73', '#c8d6bf', '#4a6257'];
const backgrounds = ['#c6d9cf', '#d4cde4', '#d7bdad', '#bfd3e2', '#e3cfac', '#c8cfb5', '#c8cbd5', '#dfc5ce'];
export const TYPES = ['Human', 'Zombie', 'Alien'];
export const HAIR = ['Crop', 'Mohawk', 'Bob', 'Cap', 'Beanie', 'Wild', 'Bald', 'Side part'];
export const EYES = ['Classic', 'Shades', 'Round glasses', '3D glasses', 'Eye patch'];

export function traitsFor(id) {
  const n = Number(id);
  const type = n % 97 === 0 ? 'Alien' : n % 23 === 0 ? 'Zombie' : 'Human';
  // Mixed-radix traits make all 10,000 combinations unique.
  return {
    type, hair: HAIR[n % 8], eyes: EYES[Math.floor(n / 8) % 5],
    skin: Math.floor(n / 40) % 7, hairColor: Math.floor(n / 280) % 6,
    background: Math.floor(n / 1680) % 8, earring: n % 11 === 0,
  };
}

export function imageSvg(id) {
  const n = Number(id), t = traitsFor(n);
  const bg = backgrounds[(t.background + n * 3) % backgrounds.length];
  const skin = t.type === 'Alien' ? '#8bbdc5' : t.type === 'Zombie' ? '#a6b58b' : skins[t.skin];
  const hair = hairColors[t.hairColor];
  const dark = '#302c30', shade = '#9a6550', shirt = ['#3e5158', '#a3aaa1', '#93676d', '#505e91', '#dbd5bb'][n % 5];
  const shapes = [];
  const rect = (x,y,w,h,c) => shapes.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`);
  rect(0,0,24,24,bg);
  rect(5,22,16,2,shirt); rect(7,21,12,1,shirt); rect(10,18,5,5,dark); rect(11,18,3,4,skin);
  rect(8,5,9,15,dark); rect(7,7,11,10,dark); rect(8,7,9,11,skin); rect(9,6,7,1,skin);
  rect(7,11,2,4,skin); rect(16,10,2,5,skin); rect(16,12,1,2,shade);
  rect(9,17,7,2,skin); rect(10,19,5,1,dark); rect(9,16,1,2,shade);
  rect(13,12,1,3,shade); rect(13,14,2,1,dark); rect(11,17,3,1,dark);
  rect(10,10,2,1,dark); rect(15,10,1,1,dark);
  rect(10,11,1,1,'#f6edd9'); rect(15,11,1,1,'#f6edd9');
  if (t.eyes === 'Shades') { rect(8,10,9,1,dark); rect(9,11,4,2,dark); rect(14,11,3,2,dark); rect(10,11,2,1,'#5a676c'); }
  if (t.eyes === 'Round glasses') { rect(9,10,4,3,dark); rect(14,10,4,3,dark); rect(13,11,1,1,dark); rect(10,11,2,1,'#b6c3b9'); rect(15,11,2,1,'#b6c3b9'); }
  if (t.eyes === '3D glasses') { rect(8,10,10,3,'#f4ecda'); rect(9,11,3,1,'#d5757b'); rect(14,11,3,1,'#5b98a9'); }
  if (t.eyes === 'Eye patch') { rect(8,9,8,1,dark); rect(9,10,4,3,dark); }
  if (t.hair === 'Crop') { rect(8,5,9,3,hair); rect(7,7,2,3,hair); rect(16,7,2,2,hair); }
  if (t.hair === 'Mohawk') { rect(11,2,3,5,hair); rect(12,1,1,2,hair); rect(10,5,5,2,hair); }
  if (t.hair === 'Bob') { rect(7,4,11,4,hair); rect(6,7,3,10,hair); rect(17,7,2,11,hair); rect(9,7,3,1,hair); }
  if (t.hair === 'Cap') { rect(8,4,9,3,shirt); rect(7,6,13,2,shirt); rect(14,4,1,2,'#f0e6c9'); }
  if (t.hair === 'Beanie') { rect(9,3,7,1,hair); rect(7,4,11,3,hair); rect(7,7,11,2,shirt); }
  if (t.hair === 'Wild') { rect(6,4,13,3,hair); rect(7,3,3,2,hair); rect(12,2,3,3,hair); rect(17,3,2,4,hair); rect(6,7,3,3,hair); rect(17,7,2,3,hair); }
  if (t.hair === 'Side part') { rect(8,4,9,3,hair); rect(7,6,3,4,hair); rect(10,7,4,1,hair); rect(16,6,2,3,hair); }
  if (t.earring) { rect(7,14,1,3,'#e8bc57'); rect(8,16,1,1,'#e8bc57'); }
  // A woven, 14-bit shirt signature also guarantees visually unique artwork.
  for (let bit=0;bit<14;bit++) if ((n >> bit) & 1) rect(7 + bit % 7, 22 + Math.floor(bit/7), 1, 1, '#d6d8cb');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="480" height="480" shape-rendering="crispEdges"><title>NETPUNK #${n}</title>${shapes.join('')}</svg>`;
}

export function metadataFor(id, imageBase = '/api/punks/') {
  const t = traitsFor(id);
  return {
    name: `NETPUNK #${id}`, description: 'An original 24 × 24 pixel identity from the NETPUNKS collection.',
    image: `${imageBase}${id}/image.svg`,
    attributes: [
      { trait_type: 'Type', value: t.type }, { trait_type: 'Hair', value: t.hair },
      { trait_type: 'Eyes', value: t.eyes }, { trait_type: 'Skin', value: t.skin },
      { trait_type: 'Hair color', value: t.hairColor }, { trait_type: 'Background', value: t.background },
      { trait_type: 'Earring', value: t.earring ? 'Gold' : 'None' },
    ],
  };
}

export const traitCounts = (() => {
  const counts = {};
  for (let i=0;i<MAX_SUPPLY;i++) {
    const t=traitsFor(i);
    for (const key of ['type','hair','eyes']) counts[`${key}:${t[key]}`] = (counts[`${key}:${t[key]}`] || 0) + 1;
  }
  return counts;
})();
