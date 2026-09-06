# versao.ps1 — cria uma VERSÃO de Raízes Cósmicas: tag no git + snapshot .zip
# fora do repositório + push das tags. É o backup manual de um comando.
#
#   .\versao.ps1 0.29.0 "Planeta água com criaturas de tentáculos"
#
# O snapshot vai para ..\raizes-backups\ (irmão do repo, fora do controle de
# versão) e é um zip só do que está versionado — restaurável sem git.

param(
  [Parameter(Mandatory=$true)][string]$Numero,   # ex: 0.29.0
  [Parameter(Mandatory=$true)][string]$Descricao
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $repo

# Não versiona por cima de trabalho não salvo: uma versão tem de ser um ponto
# fechado. Se há mudanças soltas, avisa e para.
$sujo = git status --porcelain
if ($sujo) {
  Write-Host "Há mudanças não commitadas. Faça commit antes de versionar:" -ForegroundColor Yellow
  git status -s
  exit 1
}

$tag = "v$Numero"
$existe = git tag -l $tag
if ($existe) { Write-Host "A tag $tag já existe." -ForegroundColor Red; exit 1 }

$hash  = (git rev-parse --short HEAD).Trim()
$stamp = Get-Date -Format "yyyy-MM-dd_HHmm"
$backups = Join-Path (Split-Path -Parent $repo) "raizes-backups"
New-Item -ItemType Directory -Force -Path $backups | Out-Null

# 1) tag anotada, com a identidade da Cris
git -c user.name="Cris" -c user.email="admcrisia@gmail.com" tag -a $tag -m "$tag — $Descricao"

# 2) snapshot zip do que está versionado
$zip = Join-Path $backups "${tag}_${stamp}_${hash}.zip"
git archive --format=zip -o $zip HEAD
$mb = [math]::Round((Get-Item $zip).Length / 1MB, 1)

# 3) publica commits e tags no online
$env:GIT_TERMINAL_PROMPT = "0"
git push origin main
git push origin $tag

Write-Host ""
Write-Host "Versão $tag criada." -ForegroundColor Green
Write-Host "  snapshot: $zip ($mb MB)"
Write-Host "  Anote no VERSOES.md a linha desta versão."
