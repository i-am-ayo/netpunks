import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { root } from '../shared/paths.js';

const catalog=JSON.parse(await readFile(path.join(root,'docs/classroom/exercises.json'),'utf8'));
const remaining=[];
for(const file of ['NetPunks.sol','NetPunksMarket.sol']){
  const source=await readFile(path.join(root,'contracts',file),'utf8');
  const code=source.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,'');
  for(const match of code.matchAll(/\b_exercise\s*\(\s*["']([NM]\d{2})["']\s*\)\s*;/g))remaining.push(match[1]);
}
if(remaining.length){
  console.error(`${remaining.length} exercises are still incomplete:`);
  for(const id of remaining){const exercise=catalog.find(row=>row.id===id);console.error(`  ${id}  ${exercise?.title || 'Unknown exercise'}  (${exercise?.file || 'contracts/'})`);}
  console.error('Replace each _exercise("ID"); using the English logic hints. Then compile and run the staged tests.');
  process.exitCode=1;
}else{
  console.log('No active placeholders found. Next: npm run test:contracts, then npm test.');
  console.log('This checks placeholders, not correctness. Deleting a placeholder alone does not satisfy the tests.');
}
