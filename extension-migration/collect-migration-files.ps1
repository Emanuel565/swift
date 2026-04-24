param(
    [string]$OutputDir = 'migration-pack'
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$bundleRoot = Join-Path $repoRoot $OutputDir

$groups = @(
    @{
        Name       = 'docs'
        TrimPrefix = 'docs/'
        Files      = @(
            'docs/README.md',
            'docs/ARCHITECTURE.md',
            'docs/EXTENSION.md',
            'docs/GHOST_AUDIO.md',
            'docs/extension-migration/README.md',
            'docs/extension-migration/01-overview.md',
            'docs/extension-migration/02-permissions-and-manifest.md',
            'docs/extension-migration/03-message-flow.md',
            'docs/extension-migration/04-audio-pipeline.md',
            'docs/extension-migration/05-backend-contract.md',
            'docs/extension-migration/06-migration-checklist.md',
            'docs/extension-migration/07-file-collection.md'
        )
    },
    @{
        Name       = 'extension-runtime'
        TrimPrefix = 'extension/'
        Files      = @(
            'extension/manifest.json',
            'extension/background.js',
            'extension/offscreen.html',
            'extension/offscreen.js',
            'extension/popup.html',
            'extension/popup.js',
            'extension/content-meet.js'
        )
    },
    @{
        Name       = 'frontend-extension'
        TrimPrefix = 'src/'
        Files      = @(
            'src/pages/GhostExtensao.tsx',
            'src/pages/Transcricoes.tsx',
            'src/pages/ReuniaoAoVivo.tsx',
            'src/services/recordingsApi.ts',
            'src/services/liveTranscriptWs.ts',
            'src/index.css'
        )
    },
    @{
        Name       = 'frontend-reference'
        TrimPrefix = ''
        Files      = @(
            'index.html',
            'package.json',
            'vite.config.ts',
            'eslint.config.js',
            'postcss.config.js',
            'tailwind.config.js',
            'tsconfig.json',
            'tsconfig.app.json',
            'tsconfig.node.json'
        )
    },
    @{
        Name       = 'backend-ghost-audio'
        TrimPrefix = 'valorantapi/'
        Files      = @(
            'valorantapi/package.json',
            'valorantapi/src/app.js',
            'valorantapi/src/audioProtocol.js',
            'valorantapi/src/ghostAudioEngine.js',
            'valorantapi/src/transcriptionAdapter.js',
            'valorantapi/src/whisperAdapter.js',
            'valorantapi/src/transcriptStore.js',
            'valorantapi/src/db.js',
            'valorantapi/src/routes/recordings.js',
            'valorantapi/src/routes/transcripts.js'
        )
    }
)

if (Test-Path $bundleRoot) {
    Remove-Item -Recurse -Force $bundleRoot
}

New-Item -ItemType Directory -Path $bundleRoot | Out-Null

$copied = New-Object System.Collections.Generic.List[string]

foreach ($group in $groups) {
    foreach ($relativePath in $group.Files) {
        $sourcePath = Join-Path $repoRoot $relativePath
        if (-not (Test-Path $sourcePath)) {
            throw "Arquivo nao encontrado: $relativePath"
        }

        $targetRelativePath = if ($group.TrimPrefix -and $relativePath.StartsWith($group.TrimPrefix)) {
            $relativePath.Substring($group.TrimPrefix.Length)
        }
        else {
            $relativePath
        }

        $targetPath = Join-Path $bundleRoot (Join-Path $group.Name $targetRelativePath)
        $targetDir = Split-Path -Parent $targetPath
        if (-not (Test-Path $targetDir)) {
            New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
        }

        Copy-Item -Path $sourcePath -Destination $targetPath -Force
        $copied.Add((Join-Path $group.Name $targetRelativePath).Replace('\', '/')) | Out-Null
    }
}

$summary = @(
    '# Migration Pack',
    '',
    "Raiz do pacote: $OutputDir",
    '',
    'Buckets gerados:',
    '- docs',
    '- extension-runtime',
    '- frontend-extension',
    '- frontend-reference',
    '- backend-ghost-audio',
    '',
    'Arquivos copiados:'
) + ($copied | ForEach-Object { "- $_" })

Set-Content -Path (Join-Path $bundleRoot 'README.md') -Value $summary -Encoding UTF8

Write-Host "Pacote criado em: $bundleRoot"
Write-Host "Arquivos copiados: $($copied.Count)"