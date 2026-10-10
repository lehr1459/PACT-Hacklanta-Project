$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
& (Join-Path $root '.tools/venv/Scripts/python.exe') -m unittest discover -s (Join-Path $root 'tests') -p 'test_*.py' -v
if($LASTEXITCODE -ne 0){throw 'Local LiteSVM tests failed'}
