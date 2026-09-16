param([Parameter(Mandatory=$true)][string]$OutputDirectory)
# Offline source recordings from the same installed Windows voice used by the page.
# No credentials, network synthesis, system voice changes or microphone access.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$taskOutput = [IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Force -Path $taskOutput | Out-Null
$lines = (& node -e "process.stdout.write(JSON.stringify(require('./assets/cheeky-lines.js')))" | ConvertFrom-Json)
Add-Type -AssemblyName System.Speech
$speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
    $speaker.SelectVoice('Microsoft George')
    $speaker.Rate = -1
    $format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(24000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
    foreach ($entry in $lines.PSObject.Properties) {
        $speaker.SetOutputToWaveFile((Join-Path $taskOutput ($entry.Name + '.wav')), $format)
        $speaker.Speak([string]$entry.Value)
        $speaker.SetOutputToNull()
    }
} finally { $speaker.Dispose() }
Write-Output 'Recorded 16 lines offline with Microsoft George, 24 kHz mono PCM.'
