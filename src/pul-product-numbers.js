// Normalize spoken Uzbek numbers in product labels, never in customer/source text.
const units={bir:1,ikki:2,uch:3,"to'rt":4,besh:5,olti:6,yetti:7,sakkiz:8,"to'qqiz":9};
const tens={"o'n":10,yigirma:20,"o'ttiz":30,qirq:40,ellik:50,oltmish:60,yetmish:70,sakson:80,"to'qson":90};
const u=Object.keys(units).join('|'),t=Object.keys(tens).join('|');
const pattern=new RegExp(`(?<![\\p{L}\\p{N}'])((?:(?:${u})\\s+)?yuz(?:\\s+(?:(?:${t})(?:\\s+(?:${u}))?|(?:${u})))?|(?:${t})(?:\\s+(?:${u}))?|(?:${u}))(?![\\p{L}\\p{N}'])(?!\\s+(?:ming|million|milliard)\\b)`,'giu');
export function numericProductName(name){
 return name.replace(/[‘’ʻʼ`]/g,"'").replace(pattern,value=>{
  let total=0;
  for(const word of value.toLowerCase().split(/\s+/)){if(word==='yuz')total=(total||1)*100;else total+=units[word]||tens[word]||0;}
  return String(total);
 });
}
export function numericProductPlan(plan){return plan.items?{...plan,items:plan.items.map(item=>({...item,name:numericProductName(item.name)}))}:plan;}
