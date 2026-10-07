import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
export type MapShape={layer:string;type:2|3;paths:{x:number;y:number}[][];kind:string};
const LAYERS=['earth','landuse','water','buildings','roads','boundaries'];
/** Coordinates remain in tile units; no browser, network or font dependency. */
export function decodeMapShapes(data:ArrayBuffer):MapShape[]{
 if(data.byteLength<1||data.byteLength>8*1024*1024)throw new Error('地图瓦片容量无效');
 const tile=new VectorTile(new PbfReader(new Uint8Array(data))),shapes:MapShape[]=[];
 let points=0,features=0;
 for(const name of LAYERS){const layer=tile.layers[name];if(!layer)continue;
  if(!Number.isFinite(layer.extent)||layer.extent<1||layer.extent>65536||layer.length>12000)throw new Error('地图瓦片复杂度超过限制');
  for(let i=0;i<layer.length;i++){
   if(++features>12000)throw new Error('地图瓦片复杂度超过限制');
   const feature=layer.feature(i);if(feature.type!==2&&feature.type!==3)continue;
   const paths=feature.loadGeometry().map(path=>path.map(p=>{
    if(++points>100000||!Number.isFinite(p.x)||!Number.isFinite(p.y)||Math.abs(p.x)>layer.extent*8||Math.abs(p.y)>layer.extent*8)throw new Error('地图几何超出限制');
    return {x:p.x/layer.extent,y:p.y/layer.extent};
   }));
   shapes.push({layer:name,type:feature.type,paths,kind:String(feature.properties.kind||'')});
  }
 }
 return shapes;
}
export function mapTileCenter(longitude:number,latitude:number,z:number){
 if(!Number.isFinite(longitude)||!Number.isFinite(latitude)||longitude< -180||longitude>180||Math.abs(latitude)>85.05112878||!Number.isInteger(z)||z<0||z>15)throw new Error('地图中心无效');
 const size=2**z,lat=latitude*Math.PI/180;
 return {x:Math.min(size-1,Math.max(0,Math.floor((longitude+180)/360*size))),y:Math.min(size-1,Math.max(0,Math.floor((1-Math.asinh(Math.tan(lat))/Math.PI)/2*size)))};
}
