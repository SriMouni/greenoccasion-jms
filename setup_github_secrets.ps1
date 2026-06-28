# This script uses the GitHub CLI (gh) to authenticate and upload your secrets to your repository.

Write-Output "Checking for GitHub CLI (gh)..."
if (!(Get-Command gh -ErrorAction SilentlyContinue)) {
    Write-Output "GitHub CLI not found. Please wait for the Winget installation to finish, or install it from https://cli.github.com/"
    exit
}

Write-Output "Setting GitHub Actions Secrets for the repository..."

gh secret set DB_USER --body "postgres"
gh secret set DB_PASSWORD --body "H2VKet9GDfxsgUNY231wqzg0"
gh secret set DB_NAME --body "library"
gh secret set DB_HOST --body "/cloudsql/greenoccasion-489916:us-central1:greenoccasion-db"
gh secret set GCS_BUCKET_NAME --body "greenoccasion-library-uploads"
gh secret set GCP_PROJECT_ID --body "greenoccasion-489916"

if (Test-Path "key.json") {
    cmd.exe /c "gh secret set GCP_CREDENTIALS_JSON < key.json"
    cmd.exe /c "gh secret set GCP_SA_KEY < key.json"
    Write-Output "Successfully uploaded GCP_CREDENTIALS_JSON and GCP_SA_KEY from key.json."
} else {
    Write-Warning "key.json file not found in this directory! Place your GCP Service Account JSON key here, then run one of: gh secret set GCP_CREDENTIALS_JSON < key.json  OR  gh secret set GCP_SA_KEY < key.json"
}

Write-Output ""
Write-Output "✅ Finished setting GitHub Secrets! Your automated CI/CD pipeline is now ready."
