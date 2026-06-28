param(
  [ValidateSet("openalex", "fixture")]
  [string]$SourceMode = "openalex",

  [int]$PerPage = 10,

  [switch]$DownloadFiles
)

$base = "http://localhost:3001"
$topicText = "carbon emission"
$limit = 3

function Write-Section($title) {
  Write-Host ""
  Write-Host "=== $title ===" -ForegroundColor Cyan
}

function Wait-JobDone($jobId, $label) {
  do {
    Start-Sleep -Seconds 2
    $status = Invoke-RestMethod "$base/api/jobs/$jobId/status"

    $line = "{0,-10} {1,-10} {2,3}%  {3}" -f `
      $label, $status.status, $status.progress, $status.message

    Write-Host $line
  } while ($status.status -eq "queued" -or $status.status -eq "running")

  if ($status.status -ne "completed") {
    Write-Section "$label Failed"
    $status | ConvertTo-Json -Depth 8
    throw "$label failed"
  }

  return $status
}

Write-Section "Discovery"
$dBody = @{
  topicText = $topicText
  limit = $limit
} | ConvertTo-Json

$d = Invoke-RestMethod -Method Post -Uri "$base/api/jobs/discover-subtopics" `
  -ContentType "application/json" `
  -Body $dBody

Write-Host "Job ID: $($d.jobId)"
$discoveryStatus = Wait-JobDone $d.jobId "Discovery"

$ids = @()
if ($discoveryStatus.result -and $discoveryStatus.result.subtopicIds) {
  $ids = @($discoveryStatus.result.subtopicIds | Select-Object -First 1)
}

if ($ids.Count -eq 0) {
  $discoveryStatus | ConvertTo-Json -Depth 8
  throw "No subtopic IDs found."
}

Write-Section "Selected Subtopic"
$subtopics = @(Invoke-RestMethod "$base/api/subtopics?jobId=$($d.jobId)")
$selectedSubtopics = @($subtopics | Where-Object { $ids -contains $_.id })

if ($selectedSubtopics.Count -gt 0) {
  $selectedSubtopics |
    Select-Object id, name, provider, providerTopicId, paperCount, confidence |
    Format-Table -AutoSize
} else {
  $ids | ForEach-Object { Write-Host $_ }
}

Write-Section "Ingest"
$iBody = @{
  discoveryJobId = $d.jobId
  subtopicIds = $ids
  sourceMode = $SourceMode
  perPage = $PerPage
  downloadFiles = [bool]$DownloadFiles
} | ConvertTo-Json -Depth 5

$i = Invoke-RestMethod -Method Post -Uri "$base/api/jobs/ingest-papers" `
  -ContentType "application/json" `
  -Body $iBody

Write-Host "Job ID: $($i.jobId)"
Write-Host "Source: $SourceMode"
Write-Host "Per Page: $PerPage"
Write-Host "Download Files: $([bool]$DownloadFiles)"

$ingestStatus = Wait-JobDone $i.jobId "Ingest"

Write-Section "Ingest Result"
$result = $ingestStatus.result

@(
  [pscustomobject]@{ Metric = "Fetched"; Count = $result.fetchedCount }
  [pscustomobject]@{ Metric = "Ingested"; Count = $result.ingestedCount }
  [pscustomobject]@{ Metric = "Inserted"; Count = $result.insertedCount }
  [pscustomobject]@{ Metric = "Updated"; Count = $result.updatedCount }
  [pscustomobject]@{ Metric = "Duplicates"; Count = $result.duplicateCount }
  [pscustomobject]@{ Metric = "Skipped Licenses"; Count = $result.skippedCount }
  [pscustomobject]@{ Metric = "Downloaded PDFs"; Count = $result.downloadedCount }
  [pscustomobject]@{ Metric = "Download Failed"; Count = $result.downloadFailedCount }
  [pscustomobject]@{ Metric = "Failed Papers"; Count = $result.failedCount }
) | Format-Table -AutoSize

Write-Section "Final Status"
Write-Host "Status: $($ingestStatus.status)"
Write-Host "Job ID:  $($ingestStatus.id)"
Write-Section "Skipped Records"

$skippedRecords = @(Invoke-RestMethod "$base/api/jobs/$($ingestStatus.id)/skipped-records")

if ($skippedRecords.Count -eq 0) {
  Write-Host "No skipped records."
} else {
  $skippedRecords |
    Select-Object reason, title, doi, providerSourceId, sourceUrl |
    Format-Table -AutoSize
}