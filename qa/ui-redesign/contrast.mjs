export async function collectContrast(page){return page.evaluate(()=>{
 const parse=value=>{const numbers=value.match(/[\d.]+/g)?.map(Number);return numbers&&numbers.length>=3?numbers:null;};
 const luminance=color=>color.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
 const ratio=(a,b)=>{const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
 function background(el){let current=el;while(current){for(const pseudo of [null,'::before']){const style=getComputedStyle(current,pseudo);if(pseudo&&(style.content==='none'||style.content==='normal'))continue;const stops=style.backgroundImage.match(/rgba?\([\d.,\s]+\)/g)?.map(parse).filter(Boolean)??[];if(stops.length){if(stops.some(c=>c.length===4&&c[3]<1))return{manual:true,reason:'translucent gradient',value:style.backgroundImage};return{colors:stops,source:pseudo?'pseudo-element gradient':'gradient endpoints'};}const c=parse(style.backgroundColor);if(c&&(c.length===3||c[3]>=.999))return{colors:[c],source:pseudo?'pseudo-element opaque background':'opaque background'};}current=current.parentElement;}return{manual:true,reason:'no opaque background'};}
 const samples=[],manual=[];
 for(const el of document.querySelectorAll('button,a,label,p,small,span,b,strong,code,footer,dt,dd,li,h1,h2,h3,input,select,textarea')){
  const bounds=el.getBoundingClientRect(),style=getComputedStyle(el);if(!bounds.width||!bounds.height||style.visibility==='hidden'||el.matches(':disabled'))continue;
  const text=(el.getAttribute('aria-label')||[...el.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent).join('')||'').trim();
  const targets=[{type:'text',text,color:style.color,fontSize:style.fontSize,fontWeight:style.fontWeight}];
  if(el.matches('input[placeholder],textarea[placeholder]')){const placeholder=getComputedStyle(el,'::placeholder');targets.push({type:'placeholder',text:el.getAttribute('placeholder'),color:placeholder.color,fontSize:placeholder.fontSize,fontWeight:placeholder.fontWeight});}
  for(const target of targets){if(!target.text)continue;const bg=background(el),fg=parse(target.color),identity={tag:el.tagName,text:target.text.slice(0,90),type:target.type,foreground:target.color};if(!fg||bg.manual||style.opacity!=='1'){manual.push({...identity,background:bg});continue;}const size=parseFloat(target.fontSize),large=size>=24||(size>=18.66&&parseInt(target.fontWeight)>=700),minimum=large?3:4.5,value=Math.min(...bg.colors.map(c=>ratio(fg,c)));samples.push({...identity,ratio:value,required:minimum,background:bg,pass:value>=minimum});}
 }
 return{samples,belowThreshold:samples.filter(s=>!s.pass),manual};
});}
