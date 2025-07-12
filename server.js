const express = require('express');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const os = require('os');
const https = require('https');

const app = express();
const port = 3333;

const PASSWORD = 'TvriKalbar1234!';

app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res, next) => {
  if (req.query.auth === PASSWORD) {
    next();
  } else {
    res.sendFile(__dirname + '/public/login.html');
  }
});

app.use(express.static('public'));

const server = app.listen(port, () => {
  console.log(`Server berjalan di http://localhost:${port}`);
});

const wss = new WebSocket.Server({ server });

function getLocalIp(callback) {
  return new Promise((resolve, reject) => {
    https.get('https://api.ipify.org', (res) => {
      let ip = '';
      res.on('data', chunk => ip += chunk);
      res.on('end', () => resolve(ip.trim()));
    }).on('error', (err) => {
      console.error('Gagal mendapatkan IP publik:', err);
      resolve('127.0.0.1');
    });
  });
}

// Data stream
const streamConfigs = {
  Kalbar: { in: 9001, out: 9101 },
  Kalteng: { in: 9003, out: 9303 },
  Kaltim: { in: 9005, out: 9505 },
  Kalsel: { in: 9007, out: 9707 },
  Kaltara: { in: 9009, out: 9909 }
};

const processes = {};

wss.on('connection', async ws => {
  const ip = await getLocalIp();
  ws.send(JSON.stringify({ type: 'ip', ip }));

  ws.on('message', msg => {
    const data = JSON.parse(msg);
    const region = data.region;

    if (!streamConfigs[region]) return;

    const inputPort = streamConfigs[region].in;
    const outputPort = streamConfigs[region].out;

    if (data.action === 'start' && !processes[region]) {
      const ffmpegProcess = spawn('ffmpeg', [
        '-loglevel', 'verbose',
        '-i', `srt://0.0.0.0:${inputPort}?mode=listener&timeout=3600000&linger=1`,
        '-c', 'copy',
        '-f', 'mpegts',
        `srt://0.0.0.0:${outputPort}?mode=listener`
      ]);

      processes[region] = ffmpegProcess;
      ws.send(JSON.stringify({ type: 'log', region, message: `[${region}] FFMPEG Proses dimulai\n` }));

      ffmpegProcess.stdout.on('data', chunk => {
        ws.send(JSON.stringify({ type: 'log', region, message: chunk.toString() }));
      });

      ffmpegProcess.stderr.on('data', chunk => {
        ws.send(JSON.stringify({ type: 'log', region, message: chunk.toString() }));
      });

      ffmpegProcess.on('close', code => {
        ws.send(JSON.stringify({ type: 'log', region, message: `[${region}] Proses selesai (exit ${code})\n` }));
        delete processes[region];
      });

    } else if (data.action === 'stop' && processes[region]) {
      processes[region].kill();
      delete processes[region];
      ws.send(JSON.stringify({ type: 'log', region, message: `[${region}] Proses dihentikan\n` }));
    }
  });
});
