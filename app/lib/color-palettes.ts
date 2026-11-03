export const colorPalettes={system:{name:"Follow device",light:"#305c9c",dark:"#aac4ff"},blue:{name:"Blue",light:"#305c9c",dark:"#aac4ff"},teal:{name:"Teal",light:"#14685f",dark:"#8bd8c8"},violet:{name:"Violet",light:"#6842a3",dark:"#c9afff"},rose:{name:"Rose",light:"#9a385e",dark:"#f1acc7"},amber:{name:"Amber",light:"#805715",dark:"#e9c382"},slate:{name:"Graphite",light:"#4d5b70",dark:"#c0c9d7"}} as const;
export type ColorPalette=keyof typeof colorPalettes;
export function cleanColorPalette(value:unknown):ColorPalette{return typeof value==="string"&&Object.hasOwn(colorPalettes,value)?value as ColorPalette:"system"}
export function cleanAccent(value:unknown){return typeof value==="string"&&/^#[\da-f]{6}$/i.test(value)?value.toLowerCase():null}
const channel=(value:number)=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4;
export function luminance(hex:string){const rgb=[1,3,5].map(index=>channel(parseInt(hex.slice(index,index+2),16)/255));return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722}
export function colorContrast(a:string,b:string){const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
function mix(color:string,target:number,amount:number){return '#'+[1,3,5].map(index=>Math.round(parseInt(color.slice(index,index+2),16)*(1-amount)+target*amount).toString(16).padStart(2,'0')).join('')}
/** Keep arbitrary device accents readable on both the canvas and selected surfaces. */
export function paletteAccent(palette:ColorPalette,theme:"light"|"dark",deviceAccent?:unknown){let accent=palette==="system"?cleanAccent(deviceAccent)||colorPalettes.blue[theme]:colorPalettes[palette][theme];const background=theme==="dark"?"#252e3c":"#dce3ee";for(let step=0;step<20&&colorContrast(accent,background)<4.5;step++)accent=mix(accent,theme==="dark"?255:0,.12);return {accent,text:colorContrast(accent,"#101216")>=colorContrast(accent,"#ffffff")?"#101216":"#ffffff"}}
