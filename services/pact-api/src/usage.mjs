// Keep the existing response shape and the newest records. This ceiling includes
// ample room for the common envelope and stays below the fixed gateway's128KiB.
export function boundedUsage(buckets,reasons){
  const result={buckets:[],reasons:[]};let bytes=512,b=0,r=0;
  while(b<buckets.length||r<reasons.length){
    const kind=r>=reasons.length||b<buckets.length&&buckets[b].bucket>=reasons[r].bucket?'buckets':'reasons';
    const row=kind==='buckets'?buckets[b]:reasons[r];
    const size=Buffer.byteLength(JSON.stringify(row),'utf8')+1;
    if(bytes+size>96*1024)break;
    result[kind].push(row);bytes+=size;
    if(kind==='buckets')b++;else r++;
  }
  return result;
}
