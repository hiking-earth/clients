type Point = {x:number;y:number};
type Bounds = {left:number;top:number};
/** Convert platform touch or mouse coordinates into canvas-local coordinates. */
export function globePoint(event:any,bounds:Bounds,ending=false):Point|null {
 const touch=(ending?event.changedTouches:event.touches)?.[0];
 let x:unknown,y:unknown;
 if(touch){
  if(Number.isFinite(touch.x)&&Number.isFinite(touch.y)){x=touch.x;y=touch.y;}
  else if(Number.isFinite(touch.clientX)&&Number.isFinite(touch.clientY)){x=touch.clientX-bounds.left;y=touch.clientY-bounds.top;}
 } else if(Number.isFinite(event.offsetX)&&Number.isFinite(event.offsetY)){x=event.offsetX;y=event.offsetY;}
 else if(Number.isFinite(event.clientX)&&Number.isFinite(event.clientY)){x=event.clientX-bounds.left;y=event.clientY-bounds.top;}
 return typeof x==='number'&&typeof y==='number'&&Number.isFinite(x)&&Number.isFinite(y)?{x,y}:null;
}
