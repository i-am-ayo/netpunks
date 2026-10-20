import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { imageSvg, metadataFor, MAX_SUPPLY } from '../shared/art.js';
import { root } from '../shared/paths.js';
const output = path.join(root, 'exported-assets');
const imageBase = process.env.IMAGE_BASE_URL;
if (!imageBase || !imageBase.endsWith('/')) throw new Error('Set IMAGE_BASE_URL to the final image directory URL ending in /.');
await mkdir(path.join(output, 'images'), { recursive: true });
await mkdir(path.join(output, 'metadata'), { recursive: true });
for (let id=0;id<MAX_SUPPLY;id++) {
  const metadata = metadataFor(id);
  metadata.image = `${imageBase}${id}.svg`;
  await writeFile(path.join(output,'images',`${id}.svg`),imageSvg(id));
  await writeFile(path.join(output,'metadata',`${id}`),JSON.stringify(metadata));
}
console.log(`Exported ${MAX_SUPPLY} original images and metadata files to ${output}`);
