import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { imageSvg,metadataFor,MAX_SUPPLY,traitCounts } from '../shared/art.js';

test('all 10,000 original images are deterministic and visually unique',()=>{
  const hashes=new Set();
  for(let id=0;id<MAX_SUPPLY;id++){
    const svg=imageSvg(id).replace(/<title>.*?<\/title>/,'');
    hashes.add(createHash('sha256').update(svg).digest('hex'));
  }
  assert.equal(hashes.size,10000);
  assert.equal(imageSvg(42),imageSvg(42));
});
test('metadata, trait statistics and image URLs agree with the collection',()=>{
  const meta=metadataFor(42,'https://example.com/api/punks/');
  assert.equal(meta.image,'https://example.com/api/punks/42/image.svg');
  assert.equal(meta.name,'NETPUNK #42');
  assert.equal(meta.attributes.length,7);
  assert.equal(traitCounts['type:Human']+traitCounts['type:Zombie']+traitCounts['type:Alien'],10000);
});
