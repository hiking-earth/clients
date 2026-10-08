import texture from './earth-texture.json';

const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function decode(s:string){if(typeof uni!=='undefined'&&typeof uni.base64ToArrayBuffer==='function')return new Uint8Array(uni.base64ToArrayBuffer(s));const out=new Uint8Array(Math.floor(s.length*3/4));let bits=0,value=0,n=0;for(const c of s){const k=alphabet.indexOf(c);if(k<0)continue;value=(value<<6)|k;bits+=6;if(bits>=8){bits-=8;out[n++]=(value>>bits)&255;}}return out.subarray(0,n);}
const pixels=decode(texture.indices),palette=texture.palette;
/** Inverse orthographic sphere sampling, using NASA's geographic satellite composite. */
export function renderEarth(size:number,longitude:number,latitude:number){
 const data=new Uint8ClampedArray(size*size*4),half=size/2,rad=Math.PI/180,phi=latitude*rad,sp=Math.sin(phi),cp=Math.cos(phi);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const nx=(x+.5-half)/half,ny=(half-y-.5)/half,d=nx*nx+ny*ny;if(d>1)continue;
  const nz=Math.sqrt(1-d),lat=Math.asin(Math.max(-1,Math.min(1,ny*cp+nz*sp))),lon=longitude*rad+Math.atan2(nx,nz*cp-ny*sp);
  const u=((lon/(2*Math.PI)+.5)%1+1)%1,v=.5-lat/Math.PI;
  const index=pixels[Math.min(texture.height-1,Math.floor(v*texture.height))*texture.width+Math.floor(u*texture.width)]*3;
  const ocean=palette[index]<30&&palette[index+1]<30&&palette[index+2]<45;
  const diffuse=Math.max(0,-nx*.35+ny*.25+nz*.90),light=.32+.68*diffuse,atmosphere=Math.pow(1-nz,4)*.55,o=(y*size+x)*4;
  data[o]=(ocean?14:palette[index])*light*(1-atmosphere)+95*atmosphere;
  data[o+1]=(ocean?81:palette[index+1])*light*(1-atmosphere)+187*atmosphere;
  data[o+2]=(ocean?131:palette[index+2])*light*(1-atmosphere)+225*atmosphere;
  data[o+3]=Math.min(255,Math.max(0,(1-Math.sqrt(d))*half*255));
 }
 return data;
}
