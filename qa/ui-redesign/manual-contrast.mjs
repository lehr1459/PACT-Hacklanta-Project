import fs from 'node:fs';
const lum=rgb=>rgb.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
const ratio=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
// Both hero parents have opaque endpoints #152943/#0b1220. The
// translucent #20345085 child stop, its opaque #111c2e stop and
// every parent endpoint are component-wise no brighter than #203450.
// Using that brighter bound is conservative for all four light text colors.
const rows=[['THE PACT FLOW',[165,185,216]],['Nontransferable access',[158,175,201]],['A small setup',[232,240,255]],['No registration or database',[177,193,215]]].map(([text,foreground])=>({text,foreground,conservativeBackground:[32,52,80],ratio:ratio(foreground,[32,52,80]),minimum:4.5}));
const focus=[{context:'light panel',foreground:[37,99,235],background:[244,246,250]},{context:'navy header',foreground:[107,154,255],background:[11,18,32]}].map(row=>({...row,ratio:ratio(row.foreground,row.background),minimum:3}));
const result={method:'Conservative component-wise bound on explicitly inspected CSS gradient endpoints; focus actual context colors.',rows,focus};
fs.writeFileSync('web/test-results/ui-redesign/final/manual-contrast.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
if([...rows,...focus].some(row=>row.ratio<row.minimum))process.exitCode=1;
