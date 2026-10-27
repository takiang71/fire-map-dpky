# Register a Windows Task Scheduler job that runs scripts/sync_hotspots.js twice a day
# (06:00 after the ~01:30 night pass, 15:00 after the ~13:30 day pass). Missed runs start
# as soon as the PC is on again. Output goes to data/sync.log.
# Install:   powershell -ExecutionPolicy Bypass -File scripts\install_sync_task.ps1
# Remove:    powershell -ExecutionPolicy Bypass -File scripts\install_sync_task.ps1 -Remove
param([switch]$Remove)
$Name = 'FireMap DPKY - sync hotspots'
if ($Remove) { Unregister-ScheduledTask -TaskName $Name -Confirm:$false; Write-Output "removed: $Name"; return }

$Root = Split-Path -Parent $PSScriptRoot
$Node = (Get-Command node -ErrorAction Stop).Source
# conhost --headless keeps a console window from popping up while the user is working
$Action = New-ScheduledTaskAction -Execute 'conhost.exe' -Argument "--headless `"$Node`" scripts\sync_hotspots.js" -WorkingDirectory $Root
$Triggers = @((New-ScheduledTaskTrigger -Daily -At 06:00), (New-ScheduledTaskTrigger -Daily -At 15:00))
$Settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RunOnlyIfNetworkAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 1) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $Name -Action $Action -Trigger $Triggers -Settings $Settings -Description 'Fire map (DPKY forest complex): collect daily hotspots from Land Fire Alerts Thailand into index.html' -Force | Out-Null
Get-ScheduledTask -TaskName $Name | Get-ScheduledTaskInfo | Select-Object TaskName, NextRunTime
