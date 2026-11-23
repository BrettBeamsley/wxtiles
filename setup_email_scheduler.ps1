# PowerShell script to setup Windows Task Scheduler for Route Forecast PDF emails
# Run this with admin privileges to register the scheduled task

# Configuration
$taskName = "WxTiles_RouteForecasetEmailScheduler"
$taskDescription = "Automated Route Forecast PDF generation and email delivery (4x daily)"
$scriptPath = Join-Path $PSScriptRoot "email_scheduler.py"
$logFile = Join-Path $PSScriptRoot "task_scheduler.log"

# Task Scheduler times: 6 AM, 12 PM, 6 PM, Midnight
$scheduleTimes = @("06:00:00", "12:00:00", "18:00:00", "00:00:00")

Write-Host "WxTiles Route Forecast Email Scheduler Setup" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan

# Check if running as admin
$currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
$isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "ERROR: This script must be run as Administrator" -ForegroundColor Red
    Write-Host "Please right-click PowerShell and select 'Run as Administrator'" -ForegroundColor Yellow
    exit 1
}

# Check if Python is available
try {
    $pythonVersion = & python --version 2>&1
    Write-Host "✓ Python found: $pythonVersion" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Python not found in PATH" -ForegroundColor Red
    Write-Host "Please install Python 3.7+ and add it to your PATH" -ForegroundColor Yellow
    exit 1
}

# Check if config file exists
if (-not (Test-Path (Join-Path $PSScriptRoot "email_scheduler_config.json"))) {
    Write-Host "ERROR: email_scheduler_config.json not found" -ForegroundColor Red
    Write-Host "Please ensure configuration file exists before setting up the scheduler" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "Configuration:" -ForegroundColor Cyan
Write-Host "  Script: $scriptPath"
Write-Host "  Config: $(Join-Path $PSScriptRoot 'email_scheduler_config.json')"
Write-Host "  Log: $logFile"
Write-Host "  Schedule Times: $($scheduleTimes -join ', ')"
Write-Host ""

$confirmSetup = Read-Host "Do you want to create the scheduled task? (Y/N)"
if ($confirmSetup -ne "Y") {
    Write-Host "Setup cancelled" -ForegroundColor Yellow
    exit 0
}

# Remove existing task if it exists
Write-Host ""
Write-Host "Checking for existing task..." -ForegroundColor Cyan
try {
    $existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($existingTask) {
        Write-Host "Found existing task. Removing..." -ForegroundColor Yellow
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
        Write-Host "✓ Existing task removed"
    }
} catch {
    Write-Host "No existing task found"
}

# Create new task
Write-Host ""
Write-Host "Creating scheduled task..." -ForegroundColor Cyan

# Task action: run Python script
$action = New-ScheduledTaskAction `
    -Execute "python" `
    -Argument "`"$scriptPath`"" `
    -WorkingDirectory $PSScriptRoot

# Task trigger: at specified times
$triggers = @()
foreach ($time in $scheduleTimes) {
    $triggers += New-ScheduledTaskTrigger -Daily -At $time
}

# Task settings
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable `
    -RunOnlyIfIdle:$false

# Principal (run as SYSTEM or current user)
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

# Register task
try {
    Register-ScheduledTask `
        -TaskName $taskName `
        -Action $action `
        -Trigger $triggers `
        -Settings $settings `
        -Principal $principal `
        -Description $taskDescription `
        -Force | Out-Null
    
    Write-Host "✓ Scheduled task created successfully" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Failed to create scheduled task: $_" -ForegroundColor Red
    exit 1
}

# Verify task creation
Write-Host ""
Write-Host "Verifying task..." -ForegroundColor Cyan
$createdTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue

if ($createdTask) {
    Write-Host "✓ Task verified and ready" -ForegroundColor Green
    Write-Host ""
    Write-Host "Scheduled task details:" -ForegroundColor Cyan
    Write-Host "  Task Name: $taskName"
    Write-Host "  Status: $(if ($createdTask.State -eq 'Ready') { 'Enabled' } else { $createdTask.State })"
    Write-Host "  Next Run: $($createdTask.Triggers | ForEach-Object { $_.StartBoundary })"
} else {
    Write-Host "ERROR: Task could not be verified" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Update email_scheduler_config.json with your SMTP credentials"
Write-Host "  2. Set the route waypoints and recipient email in the config"
Write-Host "  3. Set 'enabled': true in the config to activate the scheduler"
Write-Host "  4. The task will run automatically at: $($scheduleTimes -join ', ')"
Write-Host "  5. Check task scheduler history for execution logs"
Write-Host ""
Write-Host "To view the task in Windows Task Scheduler:"
Write-Host "  taskschd.msc -> Task Scheduler Library -> $taskName"
Write-Host ""
Write-Host "To remove the task later, run:"
Write-Host "  Unregister-ScheduledTask -TaskName '$taskName' -Confirm:`$false"
