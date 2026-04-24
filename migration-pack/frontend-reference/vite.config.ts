import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import os from 'os'
import { exec } from 'child_process'

// Variável de cache fora do ciclo de requisição
let cachedHardwareData: any = null;

const hardwareBackendPlugin = () => ({
  name: 'hardware-api',
  configureServer(server: any) {
    server.middlewares.use('/api/hardware', async (_req: any, res: any, next: any) => {
      try {
        res.setHeader('Content-Type', 'application/json');

        // Retorna o cache imediatamente se já existir
        if (cachedHardwareData) {
          return res.end(JSON.stringify(cachedHardwareData));
        }

        const cpus = os.cpus();
        const cpuModel = cpus.length > 0 ? cpus[0].model : 'Processador Desconhecido';
        const totalMemGB = Math.round(os.totalmem() / (1024 * 1024 * 1024));
        const osRelease = os.release();
        // Windows 11 has build number >= 22000; os.release() returns '10.0.BBBBB'
        const buildNumber = parseInt(osRelease.split('.')[2] ?? '0', 10);
        const windowsLabel = buildNumber >= 22000 ? 'Windows 11' : 'Windows 10';

        const runCmd = (cmd: string): Promise<string> => {
          return new Promise((resolve) => {
            exec(cmd, { timeout: 2000, windowsHide: true }, (err, stdout) => {
              if (err) resolve('');
              else resolve(stdout.toString());
            });
          });
        };

        // 1. GPU WMI + Monitor Specs
        const gpuJson = await runCmd('powershell -Command "Get-CimInstance Win32_VideoController | Select-Object Name, DriverVersion, CurrentRefreshRate, CurrentHorizontalResolution, CurrentVerticalResolution | ConvertTo-Json"');
        let gpuName = 'Placa Gráfica Padrão';
        let driverVersion = 'Driver WDDM Core';
        let monitorInfo = 'Não detectado nativamente';
        try {
          if (gpuJson) {
            const gpus = JSON.parse(gpuJson);
            const primaryGpu = Array.isArray(gpus) ? gpus[0] : gpus;
            if (primaryGpu?.Name) gpuName = primaryGpu.Name;
            if (primaryGpu?.DriverVersion) driverVersion = `Game Ready Driver (v${primaryGpu.DriverVersion.split('.').slice(-2).join('.')})`;
            if (primaryGpu?.CurrentRefreshRate) {
              monitorInfo = `${primaryGpu.CurrentHorizontalResolution}x${primaryGpu.CurrentVerticalResolution} @ ${primaryGpu.CurrentRefreshRate}Hz Fast-Render`;
            }
          }
        } catch (e) { }

        // 2. Nvidia SMI ReSize BAR
        let resizeBar = '';
        if (gpuName.toLowerCase().includes('nvidia')) {
          const smiOut = await runCmd('nvidia-smi -q -d MEMORY');
          if (smiOut) {
            const fbMatch = smiOut.match(/FB Memory Usage[\s\S]*?Total\s*:\s*(\d+) MiB/);
            const barMatch = smiOut.match(/BAR1 Memory Usage[\s\S]*?Total\s*:\s*(\d+) MiB/);
            if (fbMatch && barMatch) {
              const fbSize = parseInt(fbMatch[1]);
              const barSize = parseInt(barMatch[1]);
              if (barSize >= fbSize * 0.9) resizeBar = ' (ReSize BAR/SAM Ativado)';
              else resizeBar = ' (ReSize BAR Desativado!)';
            }
          }
        }

        // 3. RAM Physical Sticks WMI
        const ramJson = await runCmd('powershell -Command "Get-CimInstance Win32_PhysicalMemory | Select-Object Capacity, Speed | ConvertTo-Json"');
        let ramDetails = `${totalMemGB}GB Total Detectada (Leitura Base)`;
        try {
          if (ramJson) {
            const rams = JSON.parse(ramJson);
            const ramArray = Array.isArray(rams) ? rams : [rams];
            if (ramArray.length > 0) {
              const count = ramArray.length;
              const speed = ramArray[0]?.Speed || 2666;
              const isDual = count >= 2 ? 'Dual Channel' : 'Single Channel';
              const isXmp = speed >= 3000 ? 'XMP Ativo' : (speed <= 2666 ? 'Sem XMP' : 'Modo Padrão');
              ramDetails = `${totalMemGB}GB (${count} pentes nativos) | ${isDual} | ${isXmp} @ ${speed} MT/s`;
            }
          }
        } catch (e) { }

        // 4. Deep System Check (Game Mode, HAGS, Refresh Rate, L3)
        const gameModeStr = await runCmd('powershell -Command "Get-ItemProperty -Path \'HKCU:\\Software\\Microsoft\\GameBar\' -Name \'AutoGameModeEnabled\' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty AutoGameModeEnabled"');
        const hagsStr = await runCmd('powershell -Command "Get-ItemProperty -Path \'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers\' -Name \'HwSchMode\' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty HwSchMode"');

        const gameMode = gameModeStr.trim() === '1' ? 'GameMode:ON' : 'GameMode:OFF';
        const hags = hagsStr.trim() === '2' ? 'HAGS:ON' : 'HAGS:OFF';

        const refreshRateJson = await runCmd('powershell -Command "Get-CimInstance Win32_VideoController | Select-Object CurrentRefreshRate | ConvertTo-Json"');
        let refreshRate = 60;
        try {
          const rr = JSON.parse(refreshRateJson);
          refreshRate = Array.isArray(rr) ? (rr[0]?.CurrentRefreshRate || 60) : (rr.CurrentRefreshRate || 60);
        } catch (e) { }

        const maxRefreshJson = await runCmd('powershell -Command "(Get-CimInstance CIM_VideoControllerResolution -ErrorAction SilentlyContinue | Measure-Object -Property RefreshRate -Maximum).Maximum"');
        const maxRefresh = parseInt(maxRefreshJson.trim()) || refreshRate;

        const l3CacheJson = await runCmd('powershell -Command "Get-CimInstance Win32_Processor | Select-Object L3CacheSize | ConvertTo-Json"');
        let l3Cache = 0;
        try {
          const l3 = JSON.parse(l3CacheJson);
          l3Cache = Array.isArray(l3) ? (l3[0]?.L3CacheSize || 0) : (l3.L3CacheSize || 0);
        } catch (e) { }

        // 5. Mouse e Teclado avançado (Busca direto na entidade USB/HID pra tirar genéricos)
        const itemsJson = await runCmd('powershell -NoProfile -Command "Get-CimInstance Win32_PnPEntity | Where-Object { $_.Name -ne $null -and ($_.PNPClass -eq \'Mouse\' -or $_.PNPClass -eq \'Keyboard\') } | Select-Object Name, PNPClass | ConvertTo-Json -Compress"');

        let mouseDevice = 'Mouse HID Padrão';
        let keyboardDevice = 'Teclado HID Padrão';

        try {
          if (itemsJson.trim()) {
            const parsed = JSON.parse(itemsJson);
            const arr = Array.isArray(parsed) ? parsed : [parsed];
            const blacklist = /compatível|padrão|standard|hid|dispositivo|generic/i;

            const realMice = arr.filter((x: any) => x.PNPClass === 'Mouse' && !blacklist.test(x.Name));
            if (realMice.length > 0) mouseDevice = realMice[0].Name;

            const realKb = arr.filter((x: any) => x.PNPClass === 'Keyboard' && !blacklist.test(x.Name));
            if (realKb.length > 0) keyboardDevice = realKb[0].Name;
          }
        } catch (e) { }

        // --- SISTEMA DE DETECÇÃO DE GARGALOS (ANOMALIAS TÁTICAS) ---
        const anomalies: string[] = [];

        // 1. Verificacao HZ (Refresh rate capado)
        if (maxRefresh > refreshRate && (maxRefresh - refreshRate) > 10) {
          anomalies.push(`Monitor Limitado: Operando a ${refreshRate}Hz mas suporta até ${maxRefresh}Hz. Ajuste no Windows!`);
        }

        // 2. RAM (Canal e Velocidade)
        if (ramDetails.includes('Single Channel') && totalMemGB >= 16) {
          anomalies.push(`Gargalo de RAM: Single Channel detectado. Perda de até 25% de FPS no Valorant.`);
        }
        if (ramDetails.includes('Sem XMP')) {
          anomalies.push(`RAM Base Clock: XMP/DOCP possivelmente desligado na BIOS.`);
        }

        // 3. GPU Game Bar and HAGS (Kernel)
        if (gameModeStr.trim() !== '1') {
          anomalies.push(`Windows Game Mode Desligado: Menor prioridade para o processo do Valorant.`);
        }
        if (hagsStr.trim() !== '2' && gpuName.includes('NVIDIA')) {
          anomalies.push(`HAGS Desligado: Agendamento de GPU pelo Hardware melhora input lag na série RTX/GTX 10+`);
        }

        const data = {
          cpu: `${cpuModel.trim()} (L3: ${l3Cache}MB)`,
          gpu: `${gpuName}${resizeBar}`,
          driver: driverVersion,
          ram: ramDetails,
          monitor: `${monitorInfo} @ ${refreshRate}Hz`,
          mouse: mouseDevice,
          keyboard: keyboardDevice,
          os: `${windowsLabel} (Build ${buildNumber}) — Kernel: ${gameMode} | ${hags}`,
          anomalies // NOVO: Manda as anomalias detectadas pro Front-End
        };

        // Salva os dados processados no cache
        cachedHardwareData = data;

        res.end(JSON.stringify(data));
      } catch (err) {
        console.error('Sysinfo Error:', err);
        next(err);
      }
    });
  }
});

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), hardwareBackendPlugin()],
  server: {
    proxy: {
      '/ws/audio': {
        target: 'ws://127.0.0.1:3000',
        ws: true,
      },
      '/ws/live-transcripts': {
        target: 'ws://127.0.0.1:3000',
        ws: true,
      },
      '/ws': {
        target: 'ws://127.0.0.1:3000',
        ws: true,
      },
      '/api/transcripts': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
      '/api/recordings': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
      '/api/auth': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/auth/, '/auth'),
      },
      '/api/valorant': {
        target: 'https://api.henrikdev.xyz',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/valorant/, '')
      },
      '/api/tracker': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/tracker/, '')
      },
      '/api/ollama': {
        target: 'http://127.0.0.1:11434',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/ollama/, '')
      }
    }
  }
})