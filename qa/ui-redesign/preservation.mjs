// Independent read-only preservation check. Writes no reports or build output.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
const root=path.resolve(import.meta.dirname,'../..');
const require=createRequire(path.join(root,'web/package.json'));
const ts=require('typescript');
const baseline=JSON.parse(fs.readFileSync(path.join(root,'.deployment-candidates/ui-redesign/baseline.json'),'utf8'));
const presentation=new Set(['web/components/solana-app.tsx','web/components/solana-wallet.tsx','web/components/integration-wizard.tsx','web/app/base/page.tsx','web/app/globals.css','web/app/integrate/integrate.css']);
const coordination=new Set(['docs/DECISIONS.md','docs/STATUS.md','docs/HANDOFF.md']);
const failures=[],comparisons=[];
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024}).trimEnd();
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const printer=ts.createPrinter({newLine:ts.NewLineKind.LineFeed,removeComments:true});
function semantic(source,file){
 const tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 if(tree.parseDiagnostics.length)throw Error('TypeScript parse error');
 const stripped=node=>ts.transform(node,[context=>{
  const visit=n=>ts.isJsxElement(n)||ts.isJsxSelfClosingElement(n)||ts.isJsxFragment(n)?ts.factory.createIdentifier('__PRESENTATION__'):ts.visitEachChild(n,visit,context);
  return n=>ts.visitNode(n,visit);
 }]);
 const print=node=>{const transformed=stripped(node);try{return printer.printNode(ts.EmitHint.Unspecified,transformed.transformed[0],tree);}finally{transformed.dispose();}};
 const transformed=stripped(tree);let runtime;try{runtime=printer.printFile(transformed.transformed[0]);}finally{transformed.dispose();}
 const expressions=[],controls=[],accessible=[];
 const name=n=>n.getText(tree);
 const controlTags=new Set(['a','button','input','textarea','select','option','form']);
 function visit(node){
  if(ts.isJsxExpression(node)&&node.expression){const parent=node.parent;if(!(ts.isJsxAttribute(parent)&&['className','style'].includes(name(parent.name))))expressions.push(print(node.expression));}
  if(ts.isJsxOpeningElement(node)||ts.isJsxSelfClosingElement(node)){
   const tag=name(node.tagName),attrs=node.attributes.properties;
   const attributes=attrs.filter(a=>!ts.isJsxAttribute(a)||!['className','style'].includes(name(a.name))).map(a=>print(a)).sort();
   if(controlTags.has(tag)||/^[A-Z]/.test(tag)){
    let text='';if(ts.isJsxOpeningElement(node)&&ts.isJsxElement(node.parent))text=node.parent.children.filter(ts.isJsxText).map(n=>n.text.replace(/\s+/g,' ').trim()).filter(Boolean).join(' ');
    controls.push(JSON.stringify({tag,attributes,text}));
   }
   for(const a of attrs)if(ts.isJsxAttribute(a)&&['role','aria-label','aria-labelledby','aria-live','data-testid','id'].includes(name(a.name)))accessible.push(print(a));
  }
  ts.forEachChild(node,visit);
 }
 visit(tree);return{runtime,expressions:expressions.sort(),controls:controls.sort(),accessible:accessible.sort()};
}
for(const item of baseline.files){
 const filename=path.join(root,item.path);if(!fs.existsSync(filename)){failures.push({file:item.path,reason:'baseline file missing'});continue;}
 const current=fs.readFileSync(filename),unchanged=hash(current)===item.sha256;
 if(unchanged&&presentation.has(item.path)&&item.path.endsWith('.tsx')){try{semantic(current.toString('utf8'),item.path);}catch(e){failures.push({file:item.path,reason:'Baseline AST inventory failed: '+e.message});}}
 if(unchanged){comparisons.push({file:item.path,mode:'exact-hash',pass:true});continue;}
 if(coordination.has(item.path)){comparisons.push({file:item.path,mode:'authorized-documentation',pass:true});continue;}
 if(!presentation.has(item.path)){failures.push({file:item.path,reason:'protected hash changed'});continue;}
 if(item.path.endsWith('.css')){comparisons.push({file:item.path,mode:'presentation-CSS',pass:true});continue;}
 try{
  const before=semantic(git('show',baseline.baselineCommit+':'+item.path),item.path),after=semantic(current.toString('utf8'),item.path);
  for(const invariant of ['runtime','expressions','controls','accessible'])if(JSON.stringify(before[invariant])!==JSON.stringify(after[invariant]))failures.push({file:item.path,reason:'AST '+invariant+' changed',beforeCount:Array.isArray(before[invariant])?before[invariant].length:undefined,afterCount:Array.isArray(after[invariant])?after[invariant].length:undefined});
  comparisons.push({file:item.path,mode:'AST-runtime-and-controls',pass:!failures.some(f=>f.file===item.path)});
 }catch(e){failures.push({file:item.path,reason:'AST check failed: '+e.message});}
}
const tags=git('show-ref','--tags').split(/\r?\n/).filter(Boolean);for(const tag of baseline.tags)if(!tags.includes(tag))failures.push({file:'Git tags',reason:'protected tag changed: '+tag});
const branch=git('branch','--show-current');if(branch!==baseline.branch)failures.push({file:'Git branch',reason:'unexpected branch: '+branch});
let artifactsPassed=0;for(const artifact of baseline.servingArtifacts??[]){const filename=path.join(root,artifact.path);if(!fs.existsSync(filename)||hash(fs.readFileSync(filename))!==artifact.sha256)failures.push({file:artifact.path,reason:'protected serving artifact changed'});else artifactsPassed++;}
let saturdayPassed=0,saturdayTotal=0;if(process.argv.includes('--saturday')){const entries=JSON.parse(fs.readFileSync(path.join(root,'.deployment-candidates/ui-redesign/saturday-baseline.json'),'utf8').replace(/^\uFEFF/,''));saturdayTotal=entries.length;for(const entry of entries){const filename=path.resolve(entry.Path);const intendedRoot=path.resolve('C:/Hackathon/saturday-lights');if(!filename.toLowerCase().startsWith(intendedRoot.toLowerCase()+path.sep)||/(?:^|[\\/])(?:\.env(?!\.example$)|[^\\/]*(?:private.?key|keypair|credentials)[^\\/]*\.(?:json|pem|key|txt|env))$/i.test(filename)){failures.push({file:entry.Path,reason:'external hash target is outside public preservation scope'});continue;}if(!fs.existsSync(filename)||hash(fs.readFileSync(filename)).toLowerCase()!==entry.Sha256.toLowerCase())failures.push({file:entry.Path,reason:'protected Saturday hash changed'});else saturdayPassed++;}}
console.log(JSON.stringify({baselineCommit:baseline.baselineCommit,originalCommit:baseline.originalCommit,branch,baselineFiles:baseline.files.length,protectedTags:baseline.tags.length,servingArtifacts:{passed:artifactsPassed,total:(baseline.servingArtifacts??[]).length},saturday:{passed:saturdayPassed,total:saturdayTotal},pass:failures.length===0,comparisons:process.argv.includes('--summary')?{exactHash:comparisons.filter(c=>c.mode==='exact-hash').length,presentation:comparisons.filter(c=>c.mode.startsWith('AST')||c.mode==='presentation-CSS'),documentation:comparisons.filter(c=>c.mode==='authorized-documentation')}:comparisons,failures,limitations:['Static preservation does not verify visual quality, CSS accessibility or runtime browser behavior.','Changed control text/conditional JSX requires explicit review; it is not silently accepted.','This check reads public baseline files only and performs no build or transaction.']},null,2));
process.exitCode=failures.length?1:0;
