import assert from 'node:assert/strict';
import { loadMenuModule } from './menu-script-runtime.mjs';

const { menuItemImage, validateMenuItemImage, readMenuItemImage } = loadMenuModule('lib/menu-item-image.ts');
const file = { type:'image/png', size:1024 };
assert.equal(menuItemImage.width,416);
assert.equal(menuItemImage.height,384);
assert.equal(validateMenuItemImage(file,{width:416,height:384}),null);
for (const dimensions of [{width:415,height:384},{width:416,height:383},{width:832,height:768},{width:1200,height:800}]) {
  assert.match(validateMenuItemImage(file,dimensions),/exactly 416 x 384/);
}
assert.match(validateMenuItemImage({...file,type:'image/gif'}),/format/);
assert.match(validateMenuItemImage({...file,size:0}),/empty/);
assert.equal(validateMenuItemImage({...file,size:2*1024*1024}),null);
assert.match(validateMenuItemImage({...file,size:2*1024*1024+1}),/exceeds 2 MB/);
const originalReader = globalThis.FileReader;
const originalImage = globalThis.Image;
let width=416,height=384,broken=false;
globalThis.FileReader = class { readAsDataURL() { this.result='data:image/png;base64,test'; this.onload(); } };
globalThis.Image = class {
  get naturalWidth() { return width; }
  get naturalHeight() { return height; }
  set src(value) { if(broken) this.onerror(); else this.onload(); }
};
try {
  assert.equal(await readMenuItemImage(file),'data:image/png;base64,test');
  width=100;height=100;
  await assert.rejects(readMenuItemImage(file),/Selected image: 100 x 100/);
  assert.equal(await readMenuItemImage(file,false),'data:image/png;base64,test','Variant images may use different dimensions');
  broken=true;
  await assert.rejects(readMenuItemImage(file),/damaged or invalid/);
} finally {
  if(originalReader===undefined) delete globalThis.FileReader; else globalThis.FileReader=originalReader;
  if(originalImage===undefined) delete globalThis.Image; else globalThis.Image=originalImage;
}
console.log('Passed: exact 416 x 384 dimensions, supported formats, exact 2 MB boundary, image decoding and damaged-image errors.');
