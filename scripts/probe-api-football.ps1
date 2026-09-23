<#
  R0 - API-Football schema probe.

  Dumps one raw response per endpoint into tests/fixtures/api-football/ so the
  exact field names can be read off real data instead of guessed. Those files
  are committed and become the offline fixtures for the ingest jobs.

  Costs about 9 requests. Free tier is 100/day, 30/minute.

  NOTE: this file is deliberately pure ASCII. PowerShell 5.1 reads a BOM-less
  file as Windows-1252, which turns a UTF-8 em-dash into a smart quote and
  breaks the parser. Do not paste typographic punctuation into this script.

  RUN IT LIKE THIS (PowerShell, from the repo root). The key stays in your
  shell - never in the repo, never in a file, never in a URL:

      $env:API_FOOTBALL_KEY = "<paste your key>"
      .\scripts\probe-api-football.ps1

  Probe a different competition:

      .\scripts\probe-api-football.ps1 -LeagueId 39 -Season 2025
#>
param(
  [int]$LeagueId  = 71,      # 71 = Brasileirao Serie A (confirmed by probe)
  # Season 2024, not 2026, on purpose. The FREE plan only serves seasons
  # 2022-2024: anything newer returns results:0 with
  #   errors: { plan: "Free plans do not have access to this season..." }
  # Pass -Season 2026 once the account is on Pro.
  [int]$Season    = 2024,
  # Fixture window. Defaults to an April sample; pass -From/-To to probe the
  # exact window a cron job is using, so the two can be compared directly.
  [string]$From   = "",
  [string]$To     = "",
  [string]$OutDir = "tests/fixtures/api-football"
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

# PowerShell 5.1 still negotiates TLS 1.0 by default on some Windows builds;
# api-sports.io requires 1.2 and the failure looks like a connection reset.
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$key = $env:API_FOOTBALL_KEY
if ([string]::IsNullOrWhiteSpace($key)) {
  Write-Host "API_FOOTBALL_KEY is not set in this shell." -ForegroundColor Red
  Write-Host 'Run:  $env:API_FOOTBALL_KEY = "<your key>"   then re-run this script.'
  exit 1
}

$BaseUrl = "https://v3.football.api-sports.io"
$Headers = @{ "x-apisports-key" = $key }

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$script:Calls     = 0
$script:Failures  = 0
$script:Remaining = "?"

# Builds "a=1&b=2". The only literal ampersand in this file is single-quoted,
# so it can never be read as the reserved & operator.
# Takes IDictionary (not hashtable) so [ordered]@{} keeps its insertion order
# and the URLs are reproducible run to run.
function Build-Query {
  param([System.Collections.IDictionary]$Params)
  if (-not $Params -or $Params.Count -eq 0) { return "" }
  $pairs = foreach ($k in $Params.Keys) { "{0}={1}" -f $k, $Params[$k] }
  return ($pairs -join '&')
}

function Invoke-Probe {
  param(
    [Parameter(Mandatory=$true)][string]$Name,
    [Parameter(Mandatory=$true)][string]$Path,
    [System.Collections.IDictionary]$Params
  )

  Start-Sleep -Milliseconds 2500          # stay well under 30 req/min

  $query = Build-Query -Params $Params
  $url   = if ($query) { "$BaseUrl/$Path" + "?" + $query } else { "$BaseUrl/$Path" }

  # Safe to print: the key travels in a header, never in the URL.
  Write-Host ("  -> {0,-22} /{1}{2}" -f $Name, $Path, $(if ($query) { "?$query" } else { "" }))

  try {
    $resp = Invoke-WebRequest -Uri $url -Headers $Headers -Method GET `
                              -UseBasicParsing -TimeoutSec 30
  } catch {
    $script:Failures++
    # A bad or missing key comes back as HTTP 403 - it does NOT arrive as a
    # 200 with an `errors` object, so this branch must be loud.
    $status = $null
    if ($_.Exception.PSObject.Properties.Name -contains 'Response' -and $_.Exception.Response) {
      try { $status = [int]$_.Exception.Response.StatusCode } catch { }
    }
    Write-Host "     FAILED$(if ($status) { " (HTTP $status)" }): $($_.Exception.Message)" -ForegroundColor Red
    if ($status -eq 403) {
      Write-Host "     -> 403 usually means the key is wrong, expired, or not active yet." -ForegroundColor Yellow
    } elseif ($status -eq 429) {
      Write-Host "     -> 429 means the daily or per-minute quota is used up." -ForegroundColor Yellow
    }
    return $null
  }

  $script:Calls++

  # Invoke-WebRequest headers are a hashtable in 5.1; values may be string[].
  if ($resp.Headers.ContainsKey('x-ratelimit-requests-remaining')) {
    $script:Remaining = @($resp.Headers['x-ratelimit-requests-remaining'])[0]
  }

  # Save the RAW body, not a re-serialised copy: the fixture should be byte-for
  # byte what the API sent. Written without a BOM so JSON parsers stay happy.
  $file = Join-Path $OutDir "$Name.json"
  [IO.File]::WriteAllText($file, $resp.Content, (New-Object Text.UTF8Encoding $false))

  $json = $null
  try { $json = $resp.Content | ConvertFrom-Json } catch {
    # NOT a corrupt file. PowerShell 5.1's ConvertFrom-Json cannot build a
    # PSCustomObject property whose name is the empty string, and API-Football
    # uses "" as the "minute unknown" bucket in teams/statistics cards. The raw
    # body was already saved above and parses fine in JavaScript.
    Write-Host "     (saved OK - PS 5.1 could not parse it; empty-string key, harmless)" -ForegroundColor DarkYellow
    return $null
  }

  # API-Football answers HTTP 200 even when the request was wrong; real problems
  # land in `errors`, which is an empty ARRAY on success and an OBJECT on failure.
  $errs = $null
  if ($json.PSObject.Properties.Name -contains 'errors') { $errs = $json.errors }
  if ($errs -and -not ($errs -is [array])) {
    $names = @($errs.PSObject.Properties.Name)
    if ($names.Count -gt 0) {
      Write-Host "     API error: $($errs | ConvertTo-Json -Compress)" -ForegroundColor Yellow
    }
  }

  $count = 0
  if ($json.PSObject.Properties.Name -contains 'results') { $count = $json.results }
  Write-Host ("     results={0}  saved={1}" -f $count, $file) -ForegroundColor DarkGray

  return $json
}

Write-Host ""
Write-Host "R0 probe - league $LeagueId, season $Season" -ForegroundColor Cyan
Write-Host ""

Invoke-Probe -Name "leagues"   -Path "leagues"   -Params ([ordered]@{ id = $LeagueId }) | Out-Null
$teams = Invoke-Probe -Name "teams" -Path "teams" -Params ([ordered]@{ league = $LeagueId; season = $Season })
Invoke-Probe -Name "standings" -Path "standings" -Params ([ordered]@{ league = $LeagueId; season = $Season }) | Out-Null

# Derive a real team id rather than hardcoding one.
$teamId = $null
if ($teams -and $teams.results -gt 0) {
  $teamId = $teams.response[0].team.id
  Write-Host "  (using team id $teamId for team-scoped probes)" -ForegroundColor DarkGray
}

if ($teamId) {
  Invoke-Probe -Name "teams_statistics" -Path "teams/statistics" `
               -Params ([ordered]@{ league = $LeagueId; season = $Season; team = $teamId }) | Out-Null
  Invoke-Probe -Name "coachs" -Path "coachs" -Params ([ordered]@{ team = $teamId }) | Out-Null
} else {
  Write-Host "  (no teams returned - skipping team-scoped probes)" -ForegroundColor Yellow
}

# from/to, NOT next/last. The free plan rejects the Next and Last parameters
# outright ("Free plans do not have access to the Next parameter"), and the
# ingest job uses date ranges anyway, so probe what production actually calls.
$from = if ($From) { $From } else { "$Season-04-01" }
$to   = if ($To)   { $To }   else { "$Season-04-30" }
$fx = Invoke-Probe -Name "fixtures_range" -Path "fixtures" `
                   -Params ([ordered]@{ league = $LeagueId; season = $Season; from = $from; to = $to })

# Same window WITHOUT season, mirroring the job's fallback, so we can see
# whether season is the discriminator or the window itself is empty.
Invoke-Probe -Name "fixtures_range_noseason" -Path "fixtures" `
             -Params ([ordered]@{ league = $LeagueId; from = $from; to = $to }) | Out-Null

# Fixture statistics need a FINISHED fixture or they come back empty.
$fid = $null
if ($fx -and $fx.results -gt 0) {
  foreach ($f in $fx.response) {
    if ($f.fixture.status.short -eq 'FT') { $fid = $f.fixture.id; break }
  }
  if (-not $fid) { $fid = $fx.response[0].fixture.id }
}
if ($fid) {
  Write-Host "  (using fixture id $fid for fixture statistics)" -ForegroundColor DarkGray
  Invoke-Probe -Name "fixtures_statistics" -Path "fixtures/statistics" `
               -Params ([ordered]@{ fixture = $fid }) | Out-Null
} else {
  Write-Host "  (no fixture in $from..$to - skipping fixture statistics)" -ForegroundColor Yellow
}

Invoke-Probe -Name "players_page1" -Path "players" `
             -Params ([ordered]@{ league = $LeagueId; season = $Season; page = 1 }) | Out-Null

Write-Host ""
if ($script:Calls -eq 0) {
  # Every single request failed. Exit non-zero so this can never be mistaken
  # for a successful run that simply found no data.
  Write-Host "PROBE FAILED - no successful requests ($($script:Failures) attempts)." -ForegroundColor Red
  Write-Host "Nothing was written. Check API_FOOTBALL_KEY, then re-run." -ForegroundColor Red
  exit 1
}

if ($script:Failures -gt 0) {
  Write-Host "$($script:Failures) probe(s) failed - the fixtures below are incomplete." -ForegroundColor Yellow
}

Write-Host "Done. $($script:Calls) requests used. Quota remaining today: $($script:Remaining)" -ForegroundColor Green
Write-Host "Fixtures written to $OutDir"
Write-Host ""
Write-Host "Next: commit these files, then tell Claude the probe is done." -ForegroundColor Cyan
exit 0
