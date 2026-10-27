import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const repository=fileURLToPath(new URL('../../',import.meta.url));
const windows={skip:process.platform!=='win32'};
const powershell=path.join(process.env.SystemRoot??'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
const quote=value=>"'"+value.replaceAll("'","''")+"'";
function temporary(t){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'pact integrity '));
  t.after(()=>{
    assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir())+path.sep));
    fs.rmSync(directory,{recursive:true,force:true});
  });
  return directory;
}
function run(code,cwd){
  const environment={};
  for(const name of ['SystemRoot','SYSTEMROOT','WINDIR','PATHEXT','ComSpec','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA'])if(process.env[name])environment[name]=process.env[name];
  environment.PATH=path.dirname(powershell)+path.delimiter+path.join(environment.SystemRoot??environment.SYSTEMROOT??'C:/Windows','System32');
  const output=execFileSync(powershell,['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand',Buffer.from(`
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
if($PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1){throw 'Windows PowerShell 5.1 required'}
${code}
`,'utf16le').toString('base64')],{cwd,env:environment,windowsHide:true,timeout:20000,maxBuffer:200000,encoding:'utf8'});
  assert.match(output,/PACT_INTEGRITY_PASS/);
}

for(const relative of ['solana/scripts/setup.ps1','solana/scripts/build.ps1','contracts/scripts/setup.ps1','contracts/scripts/artifact-evidence.ps1']){
  test(`${relative}: AST-extracted SHA256 works in Windows PowerShell 5.1 without module autoload`,windows,t=>{
    const directory=temporary(t);
    const vectors=[
      ['empty [literal].bin',Buffer.alloc(0),'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
      ['abc [literal].txt',Buffer.from('abc'),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
      ['binary [literal].bin',Buffer.from(Array.from({length:256},(_,i)=>i)),'40aff2e9d2d8922e47afd4648e6967497158785fbd1da870e7110266bf944880'],
    ];
    for(const [name,bytes]of vectors)fs.writeFileSync(path.join(directory,name),bytes);
    run(`
$PSModuleAutoLoadingPreference='None'
function Get-FileHash {throw 'Optional Get-FileHash must never run'}
$tokens=$null;$errors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile(${quote(path.join(repository,relative))},[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'Script parse error'}
$functions=$ast.FindAll({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Get-PactFileSha256'},$true)
if($functions.Count -ne 1){throw 'Expected exactly one integrity helper'}
# Only the function definition is evaluated: no build/setup/artifact statements.
. ([ScriptBlock]::Create($functions[0].Extent.Text))
${vectors.map(([name,,expected])=>`
$actual=Get-PactFileSha256 ${quote(name)}
if($actual -cne ${quote(expected)}){throw 'Known-vector hash mismatch'}
$absolute=Get-PactFileSha256 ${quote(path.join(directory,name))}
if($absolute -cne $actual){throw 'Literal absolute path mismatch'}
$exclusive=[IO.File]::Open(${quote(path.join(directory,name))},[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
$exclusive.Dispose()
`).join('')}
$failed=$false
try {Get-PactFileSha256 'missing [literal].bin' | Out-Null}catch{$failed=$true}
if(!$failed){throw 'Missing input must fail'}
$locked=${quote(path.join(directory,vectors[2][0]))}
$exclusive=[IO.File]::Open($locked,[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
try {
  $failed=$false
  try {Get-PactFileSha256 $locked | Out-Null}catch{$failed=$true}
  if(!$failed){throw 'Unreadable exclusively locked input must fail'}
}finally{$exclusive.Dispose()}
if((Get-PactFileSha256 $locked) -cne ${quote(vectors[2][2])}){throw 'Hash must recover after unreadable input'}
$exclusive=[IO.File]::Open($locked,[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
$exclusive.Dispose()
[Console]::WriteLine('PACT_INTEGRITY_PASS')
`,directory);
  });
}

for(const kind of ['solana','contracts'])for(const cached of [false,true]){
  test(`${kind} setup rejects tampered ${cached?'cached executables before later execution':'download before extraction'} with pins unchanged`,windows,t=>{
    const directory=temporary(t),workspace=path.join(directory,kind),scripts=path.join(workspace,'scripts');
    fs.mkdirSync(scripts,{recursive:true});
    const source=path.join(repository,kind,'scripts/setup.ps1'),script=path.join(scripts,'setup.ps1');
    fs.copyFileSync(source,script);
    const pinName=kind==='solana'?'toolchain.json':'dependencies.json',originalPins=fs.readFileSync(path.join(repository,kind,pinName)),pinFile=path.join(workspace,pinName);
    fs.writeFileSync(pinFile,originalPins);
    if(cached){
      const pins=JSON.parse(originalPins),names=kind==='solana'?Object.keys(pins.executables):Object.keys(pins.foundry.windowsExeSha256);
      for(const name of names){const filename=path.join(workspace,kind==='solana'?'.tools':'.tools/foundry-v1.8.5',name);fs.mkdirSync(path.dirname(filename),{recursive:true});fs.writeFileSync(filename,'TAMPERED_NOT_AN_EXECUTABLE');}
    }
    const expected=kind==='solana'?(cached?'Tool executable mismatch: rust/bin/cargo.exe':'Tool archive checksum mismatch'):(cached?'Foundry executable checksum mismatch: anvil.exe':'Foundry checksum mismatch');
    run(`
# Explicitly load ordinary setup cmdlets, then disable all automatic discovery.
Import-Module Microsoft.PowerShell.Management
Import-Module Microsoft.PowerShell.Utility
$PSModuleAutoLoadingPreference='None'
function Get-FileHash {throw 'Optional Get-FileHash must never run'}
$global:downloads=0;$global:extractions=0;$global:laterExecution=0
# Shadow every external/download step; this child can never fetch real tools.
function global:curl.exe {$global:downloads++;[IO.File]::WriteAllBytes([string]$args[-1],[byte[]](1,2,3));$global:LASTEXITCODE=0}
function global:Invoke-WebRequest {param($OutFile,[switch]$UseBasicParsing) $global:downloads++;[IO.File]::WriteAllBytes($OutFile,[byte[]](1,2,3))}
function global:tar.exe {$global:extractions++;throw 'Extraction must not run'}
function global:Expand-Archive {$global:extractions++;throw 'Extraction must not run'}
function global:git {$global:laterExecution++;throw 'Git must not run'}
function global:py {$global:laterExecution++;throw 'Python must not run'}
$message=$null
try {& ${quote(script)}}catch{$message=$_.Exception.Message}
if($message -cne ${quote(expected)}){throw ('Expected checksum rejection; observed: '+$message)}
if($global:downloads -ne ${cached?0:1}){throw 'Unexpected download count'}
if($global:extractions -ne 0 -or $global:laterExecution -ne 0){throw 'Tampered input reached a later operation'}
[Console]::WriteLine('PACT_INTEGRITY_PASS')
`,directory);
    assert.ok(fs.readFileSync(pinFile).equals(originalPins),'Fixture pin bytes must remain unchanged');
    assert.ok(fs.readFileSync(path.join(repository,kind,pinName)).equals(originalPins),'Repository pin bytes must remain unchanged');
  });
}

test('Solana setup extracts a verified archive without external tar or bzip2',windows,t=>{
  const directory=temporary(t),workspace=path.join(directory,'solana'),tools=path.join(workspace,'.tools');
  fs.mkdirSync(path.join(workspace,'scripts'),{recursive:true});fs.mkdirSync(tools);
  fs.copyFileSync(path.join(repository,'solana/scripts/setup.ps1'),path.join(workspace,'scripts/setup.ps1'));
  const payload=Buffer.from('synthetic archive payload\n');fs.writeFileSync(path.join(directory,'payload.txt'),payload);
  const archive=path.join(tools,'platform-tools-windows-x86_64.tar.bz2');
  const localPython=path.join(repository,'solana/.tools/venv/Scripts/python.exe');
  const python=fs.existsSync(localPython)?localPython:'python';
  execFileSync(python,['-c','import sys; assert sys.version_info[:3] == (3,13,5)'],{windowsHide:true,timeout:20000});
  execFileSync(python,['-m','venv','--without-pip',path.join(tools,'venv')],{windowsHide:true,timeout:20000});
  execFileSync(python,['-c',"import sys,tarfile; archive=tarfile.open(sys.argv[1],'w:bz2'); archive.add(sys.argv[2],arcname='payload.txt'); archive.close()",archive,path.join(directory,'payload.txt')],{windowsHide:true,timeout:20000});
  // Only this synthetic fixture has a synthetic archive pin; repository pins are untouched.
  const pins=JSON.parse(fs.readFileSync(path.join(repository,'solana/toolchain.json')));
  pins.platformTools.sha256=createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
  fs.writeFileSync(path.join(workspace,'toolchain.json'),JSON.stringify(pins));
  run(`
Import-Module Microsoft.PowerShell.Management
Import-Module Microsoft.PowerShell.Utility
$PSModuleAutoLoadingPreference='None'
function global:tar.exe {throw 'External tar must never run'}
function global:bzip2.exe {throw 'External bzip2 must never run'}
$message=$null
try {& ${quote(path.join(workspace,'scripts/setup.ps1'))}}catch{$message=$_.Exception.Message}
# Extraction succeeds; a deliberately absent compiler must still fail its unchanged pin gate.
if($message -cne 'Tool executable mismatch: rust/bin/cargo.exe'){throw ('Unexpected setup result: '+$message)}
[Console]::WriteLine('PACT_INTEGRITY_PASS')
`,directory);
  assert.ok(fs.readFileSync(path.join(tools,'payload.txt')).equals(payload));
});
