# Define the start folder
$startFolder = "C:\AAA\GitHub\XppTools\DEVTools"

# Get all subfolders except 'Description' folder
$subfolders = Get-ChildItem -Path $startFolder -Directory | Where-Object { $_.Name -ne 'Description' }

# Process each sub-folder
foreach ($folder in $subfolders) {
    # Get all folders that start with 'Ax'
    $axFolders = Get-ChildItem -Path $folder.FullName -Directory | Where-Object { $_.Name -like 'Ax*' }
    
    # For each 'Ax' folder
    foreach ($axFolder in $axFolders) {
        # Check if 'Delta' folder exists
        $deltaFolder = Join-Path -Path $axFolder.FullName -ChildPath "Delta"
        if (-not (Test-Path -Path $deltaFolder)) {
            # Create 'Delta' folder if it doesn't exist
            New-Item -Path $deltaFolder -ItemType Directory
        }
    }
}
