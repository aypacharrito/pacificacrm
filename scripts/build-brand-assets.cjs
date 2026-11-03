// Rebuild the established Pacifica mark in monochrome. Preserve its exact alpha
// silhouette; no redrawing, AI generation or color logo remains in runtime assets.
const fs=require('node:fs/promises'),path=require('node:path'),sharp=require('sharp');
const root=path.resolve(__dirname,'..'),source=path.join(root,'brand/pacifica-source-alpha.png');
async function write(file,data){await fs.mkdir(path.dirname(path.join(root,file)),{recursive:true});await fs.writeFile(path.join(root,file),data)}
(async()=>{
 try{await fs.access(source)}catch{await write('brand/pacifica-source-alpha.png',await fs.readFile(path.join(root,'public/pacifica-mark.png')))}
 const raw=await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 // The existing logo's alpha is the canonical shape, independent of its teal ink.
 const mark=async(color,size)=>{const pixels=Buffer.alloc(raw.info.width*raw.info.height*4);for(let i=0;i<pixels.length;i+=4){pixels[i]=pixels[i+1]=pixels[i+2]=color;pixels[i+3]=raw.data[i+3]}return sharp(pixels,{raw:raw.info}).resize(size,size,{fit:'contain',kernel:'lanczos3'}).png().toBuffer()};
 const black=await mark(0,1024),white=await mark(255,1024);
 const tile=await sharp({create:{width:1024,height:1024,channels:4,background:'#101216'}}).composite([{input:await sharp(white).resize(640).toBuffer(),gravity:'centre'}]).png().toBuffer();
 const transparent=async(size,ink)=>sharp({create:{width:1024,height:1024,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:await sharp(ink).resize(size).toBuffer(),gravity:'centre'}]).png().toBuffer();
 const assets={
  'public/pacifica-mark.png':await sharp(black).resize(512).png().toBuffer(),
  'mobile/assets/pacifica-mark.png':await sharp(black).resize(512).png().toBuffer(),
  'mobile/assets/icon.png':tile,'mobile/assets/adaptive-icon.png':await transparent(600,white),
  'mobile/assets/monochrome-icon.png':await transparent(600,white),
  'mobile/assets/splash-mark.png':black,'mobile/assets/splash-mark-dark.png':white,
  'mobile/assets/splash.png':black,'mobile/assets/notification-icon.png':await sharp(white).resize(96).png().toBuffer(),
  'desktop/assets/pacifica-mark.png':await sharp(white).resize(512).png().toBuffer(),
  'public/pacifica-icon-512.png':await sharp(tile).resize(512).png().toBuffer(),
  'public/pacifica-icon-512-maskable.png':await sharp(tile).resize(512).png().toBuffer(),
  'public/pacifica-icon-192.png':await sharp(tile).resize(192).png().toBuffer(),
  'public/favicon-32.png':await sharp(tile).resize(32).png().toBuffer(),
  'public/apple-touch-icon.png':await sharp(tile).resize(180).png().toBuffer(),
  'app/icon.png':await sharp(tile).resize(512).png().toBuffer(),
  'app/apple-icon.png':await sharp(tile).resize(180).png().toBuffer(),
 };
 const sizes=[16,32,48,64,128,256],frames=await Promise.all(sizes.map(s=>sharp(tile).resize(s).png().toBuffer()));
 const header=Buffer.alloc(6+16*sizes.length);header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);let offset=header.length;
 frames.forEach((data,i)=>{const at=6+i*16;header[at]=header[at+1]=sizes[i]===256?0:sizes[i];header.writeUInt16LE(1,at+4);header.writeUInt16LE(32,at+6);header.writeUInt32LE(data.length,at+8);header.writeUInt32LE(offset,at+12);offset+=data.length});
 const ico=Buffer.concat([header,...frames]);for(const name of ['public/favicon.ico','app/favicon.ico','desktop/assets/pacifica.ico'])assets[name]=ico;
 assets['public/favicon.svg']=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" rx="96" fill="#101216"/><image x="96" y="96" width="320" height="320" href="data:image/png;base64,${white.toString('base64')}"/></svg>`);
 for(const [file,data] of Object.entries(assets))await write(file,data);
 await write('brand/runtime-assets.json',JSON.stringify(Object.keys(assets),null,2));
 console.log('Rebuilt '+Object.keys(assets).length+' monochrome runtime assets from the existing Pacifica silhouette.');
})().catch(e=>{console.error(e);process.exitCode=1});
