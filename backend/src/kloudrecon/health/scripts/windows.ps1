# KloudRecon server health check for Windows: __OS_LABEL__
# Server: __SERVER_NAME__
#
# READ-ONLY. This script only reads information; it changes nothing on the server and sends
# nothing anywhere. It does not read passwords, files, registry secrets or command lines.
#
# How to run
#   1. Open Windows PowerShell on the server as Administrator.
#   2. Paste this whole script and press Enter. The update check can take one to three minutes.
#   3. The result (JSON) is copied to the clipboard and saved to %TEMP%\kloudrecon-health.json.
#   4. Paste it into KloudRecon: Server health > this server > Paste the output.

$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'

function Iso($d) { if ($d) { ([datetime]$d).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ') } else { $null } }
function Reg($path, $name) { (Get-ItemProperty -Path $path -Name $name -ErrorAction SilentlyContinue).$name }

$os  = Get-CimInstance Win32_OperatingSystem
$cs  = Get-CimInstance Win32_ComputerSystem
$cpu = @(Get-CimInstance Win32_Processor)
$since = (Get-Date).AddDays(-7)
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$elevated = ([Security.Principal.WindowsPrincipal]$identity).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

# ---- pending Windows updates (Windows Update agent, read-only search) ---------------------------
$updatesChecked = $false
$pending = @()
try {
    $session  = New-Object -ComObject Microsoft.Update.Session
    $searcher = $session.CreateUpdateSearcher()
    $found    = $searcher.Search("IsInstalled=0 and IsHidden=0 and Type='Software'")
    $updatesChecked = $true
    $pending = @($found.Updates | ForEach-Object {
        [ordered]@{
            title      = [string]$_.Title
            kb         = (@($_.KBArticleIDs) -join ',')
            severity   = [string]$_.MsrcSeverity
            categories = (@($_.Categories | ForEach-Object { $_.Name }) -join ', ')
            cves       = @($_.CveIDs)
            published  = if ($_.LastDeploymentChangeTime) { $_.LastDeploymentChangeTime.ToString('yyyy-MM-dd') } else { $null }
            reboot     = [bool]$_.RebootRequired
        }
    })
} catch { $updatesChecked = $false }

# ---- restart pending ---------------------------------------------------------------------------
$rebootReasons = @()
if (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending') { $rebootReasons += 'Component servicing' }
if (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired') { $rebootReasons += 'Windows Update' }
if (Reg 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager' 'PendingFileRenameOperations') { $rebootReasons += 'Pending file rename' }

# ---- event logs: errors of the last 7 days, grouped --------------------------------------------
$events = @()
$eventCounts = [ordered]@{}
foreach ($log in 'System', 'Application') {
    $rows = @(Get-WinEvent -FilterHashtable @{ LogName = $log; Level = 1, 2; StartTime = $since } -MaxEvents 3000 -ErrorAction SilentlyContinue)
    $warn = @(Get-WinEvent -FilterHashtable @{ LogName = $log; Level = 3; StartTime = $since } -MaxEvents 5000 -ErrorAction SilentlyContinue).Count
    $eventCounts[$log] = [ordered]@{
        critical = @($rows | Where-Object { $_.Level -eq 1 }).Count
        error    = @($rows | Where-Object { $_.Level -eq 2 }).Count
        warning  = $warn
    }
    $events += @($rows | Group-Object ProviderName, Id | Sort-Object Count -Descending | Select-Object -First 20 | ForEach-Object {
        $e = $_.Group[0]
        $msg = [string]$e.Message
        if ($msg.Length -gt 300) { $msg = $msg.Substring(0, 300) }
        [ordered]@{
            log      = $log
            source   = [string]$e.ProviderName
            id       = [int]$e.Id
            level    = if ($e.Level -eq 1) { 'critical' } else { 'error' }
            count    = [int]$_.Count
            last     = Iso $e.TimeCreated
            message  = ($msg -replace '\s+', ' ')
        }
    })
}

# ---- listening TCP ports (process name only, never the command line) ---------------------------
$listening = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Sort-Object LocalPort -Unique | Select-Object -First 80 | ForEach-Object {
        [ordered]@{
            port    = [int]$_.LocalPort
            address = [string]$_.LocalAddress
            process = [string](Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).ProcessName
        }
    })

$defender = Get-MpComputerStatus -ErrorAction SilentlyContinue
$tls = [ordered]@{}
foreach ($p in 'SSL 3.0', 'TLS 1.0', 'TLS 1.1', 'TLS 1.2') {
    $tls[$p] = Reg "HKLM:\SYSTEM\CurrentControlSet\Control\SecurityProviders\SCHANNEL\Protocols\$p\Server" 'Enabled'
}
$latestHotfix = @(Get-HotFix | Where-Object { $_.InstalledOn } | Sort-Object InstalledOn -Descending)

$result = [ordered]@{
    schema       = 'kloudrecon.windows.v1'
    server       = '__SERVER_NAME__'
    collected_at = Iso (Get-Date)
    elevated     = [bool]$elevated
    os = [ordered]@{
        caption      = [string]$os.Caption
        version      = [string]$os.Version
        build        = [string]$os.BuildNumber
        architecture = [string]$os.OSArchitecture
        hostname     = [string]$env:COMPUTERNAME
        domain       = [string]$cs.Domain
        domain_joined = [bool]$cs.PartOfDomain
        manufacturer = [string]$cs.Manufacturer
        model        = [string]$cs.Model
        install_date = Iso $os.InstallDate
        last_boot    = Iso $os.LastBootUpTime
        timezone     = [string](Get-TimeZone).Id
    }
    cpu = [ordered]@{
        name    = [string]$cpu[0].Name
        sockets = $cpu.Count
        cores   = [int](($cpu | Measure-Object NumberOfCores -Sum).Sum)
        logical = [int](($cpu | Measure-Object NumberOfLogicalProcessors -Sum).Sum)
        load_percent = [int](($cpu | Measure-Object LoadPercentage -Average).Average)
    }
    memory = [ordered]@{
        total_bytes = [int64]$os.TotalVisibleMemorySize * 1024
        free_bytes  = [int64]$os.FreePhysicalMemory * 1024
        pagefile_mb = [int](@(Get-CimInstance Win32_PageFileUsage | Measure-Object AllocatedBaseSize -Sum).Sum)
        pagefile_used_mb = [int](@(Get-CimInstance Win32_PageFileUsage | Measure-Object CurrentUsage -Sum).Sum)
    }
    disks = @(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | ForEach-Object {
        [ordered]@{ name = [string]$_.DeviceID; label = [string]$_.VolumeName; filesystem = [string]$_.FileSystem; size_bytes = [int64]$_.Size; free_bytes = [int64]$_.FreeSpace }
    })
    updates_checked = [bool]$updatesChecked
    pending_updates = $pending
    hotfixes = @($latestHotfix | Select-Object -First 40 | ForEach-Object {
        [ordered]@{ id = [string]$_.HotFixID; description = [string]$_.Description; installed_on = $_.InstalledOn.ToString('yyyy-MM-dd') }
    })
    reboot_pending = [bool]($rebootReasons.Count -gt 0)
    reboot_reasons = $rebootReasons
    services_stopped = @(Get-CimInstance Win32_Service -Filter "StartMode='Auto' AND State<>'Running'" | Select-Object -First 60 | ForEach-Object {
        [ordered]@{ name = [string]$_.Name; display_name = [string]$_.DisplayName; state = [string]$_.State; delayed = [bool]$_.DelayedAutoStart }
    })
    event_counts = $eventCounts
    events = $events
    firewall = @(Get-NetFirewallProfile -ErrorAction SilentlyContinue | ForEach-Object { [ordered]@{ profile = [string]$_.Name; enabled = [bool]$_.Enabled } })
    defender = if ($defender) { [ordered]@{
        available = $true
        service_enabled = [bool]$defender.AMServiceEnabled
        realtime = [bool]$defender.RealTimeProtectionEnabled
        signature_age_days = [int]$defender.AntivirusSignatureAge
        signatures_updated = Iso $defender.AntivirusSignatureLastUpdated
    } } else { [ordered]@{ available = $false } }
    smb1_enabled = (Get-SmbServerConfiguration -ErrorAction SilentlyContinue).EnableSMB1Protocol
    rdp = [ordered]@{
        enabled = ((Reg 'HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server' 'fDenyTSConnections') -eq 0)
        nla     = ((Reg 'HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server\WinStations\RDP-Tcp' 'UserAuthentication') -eq 1)
    }
    tls = $tls
    local_admins = @(Get-LocalGroupMember -Group 'Administrators' -ErrorAction SilentlyContinue | ForEach-Object { [ordered]@{ name = [string]$_.Name; type = [string]$_.ObjectClass } })
    listening = $listening
    roles = @(Get-WindowsFeature -ErrorAction SilentlyContinue | Where-Object { $_.Installed -and $_.FeatureType -eq 'Role' } | ForEach-Object { [string]$_.DisplayName })
    certificates_expiring = @(Get-ChildItem Cert:\LocalMachine\My -ErrorAction SilentlyContinue | Where-Object { $_.NotAfter -lt (Get-Date).AddDays(30) } | Select-Object -First 20 | ForEach-Object {
        [ordered]@{ subject = [string]$_.Subject; not_after = Iso $_.NotAfter }
    })
    account_policy = @(net accounts 2>$null | Where-Object { $_ -match ':' } | ForEach-Object { ($_ -replace '\s+', ' ').Trim() })
}

$json = $result | ConvertTo-Json -Depth 6
$path = Join-Path $env:TEMP 'kloudrecon-health.json'
$json | Out-File -FilePath $path -Encoding utf8
try { Set-Clipboard -Value $json } catch { }
$json
Write-Host ''
Write-Host "Done. The result is on the clipboard and saved to $path. Paste it into KloudRecon." -ForegroundColor Green
