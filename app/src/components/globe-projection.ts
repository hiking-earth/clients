export function projectGlobe(lon:number,lat:number,centerLon:number,centerLat:number){
 const r=Math.PI/180,a=lat*r,b=centerLat*r,d=(lon-centerLon)*r;
 return {x:Math.cos(a)*Math.sin(d),y:Math.sin(a)*Math.cos(b)-Math.cos(a)*Math.cos(d)*Math.sin(b),z:Math.sin(a)*Math.sin(b)+Math.cos(a)*Math.cos(d)*Math.cos(b)};
}
export function rotateGlobe(lon:number,lat:number,dx:number,dy:number,scale:number){return {lon:((lon-dx/scale*70+540)%360)-180,lat:Math.max(-80,Math.min(80,lat+dy/scale*70))};}
