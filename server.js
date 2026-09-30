const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>P2P Vault (PairDrop Style)</title>
  <style>
    :root { --bg: #0f172a; --card: #1e293b; --primary: #3b82f6; --text: #f8fafc; --text-muted: #94a3b8; --border: #334155; --success: #22c55e; }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: system-ui, sans-serif; }
    body { background-color: var(--bg); color: var(--text); min-height: 100vh; display: flex; justify-content: center; align-items: center; padding: 20px; }
    .container { width: 100%; max-width: 600px; background: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: 30px; box-shadow: 0 10px 25px rgba(0,0,0,0.3); }
    h1 { font-size: 1.5rem; margin-bottom: 8px; }
    p.subtitle { color: var(--text-muted); font-size: 0.9rem; margin-bottom: 24px; }
    .tabs { display: flex; gap: 10px; margin-bottom: 24px; }
    .tab-btn { flex: 1; background: var(--border); border: none; color: var(--text-muted); padding: 12px; border-radius: 8px; font-weight: 600; cursor: pointer; }
    .tab-btn.active { background: var(--primary); color: var(--text); }
    .panel { display: none; }
    .panel.active { display: block; }
    .form-group { margin-bottom: 20px; }
    label { display: block; font-size: 0.85rem; color: var(--text-muted); margin-bottom: 8px; }
    input[type="file"], input[type="text"] { width: 100%; background: var(--bg); border: 1px solid var(--border); padding: 12px; border-radius: 8px; color: var(--text); }
    input[type="text"] { text-align: center; letter-spacing: 4px; font-size: 1.5rem; font-weight: bold; }
    button.action-btn { width: 100%; background: var(--success); color: white; border: none; padding: 14px; border-radius: 8px; font-size: 1rem; font-weight: 600; cursor: pointer; }
    .pin-display { background: var(--bg); border: 2px dashed var(--primary); padding: 20px; border-radius: 12px; text-align: center; margin-top: 20px; }
    .pin-code { font-size: 2.5rem; font-weight: 800; color: var(--primary); letter-spacing: 6px; margin: 10px 0; }
    .progress-container { margin-top: 20px; background: var(--bg); border-radius: 8px; padding: 15px; border: 1px solid var(--border); }
    .progress-bar { width: 100%; height: 8px; background: var(--border); border-radius: 4px; overflow: hidden; margin-top: 10px; }
    .progress-fill { width: 0%; height: 100%; background: var(--success); transition: width 0.1s linear; }
    .status-text { font-size: 0.85rem; color: var(--text-muted); margin-top: 6px; display: flex; justify-content: space-between; }
    .file-list { max-height: 150px; overflow-y: auto; margin-top: 10px; font-size: 0.85rem; background: var(--bg); border-radius: 6px; padding: 8px; border: 1px solid var(--border); }
    .file-item { padding: 4px 0; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; }
  </style>
</head>
<body>
  <div class="container">
    <h1>P2P Secure Vault</h1>
    <p class="subtitle">Direct browser-to-browser file transfer.</p>
    <div class="tabs">
      <button class="tab-btn active" onclick="switchTab('send')">Send Files</button>
      <button class="tab-btn" onclick="switchTab('receive')">Receive Files</button>
    </div>
    <div id="sendPanel" class="panel active">
      <div class="form-group">
        <label>Select Files</label>
        <input type="file" id="fileInput" multiple>
      </div>
      <div id="fileListPreview" class="file-list" style="display:none;"></div>
      <button class="action-btn" onclick="hostRoom()" style="margin-top: 15px;">Generate Room PIN</button>
      <div id="vaultInfo" style="display:none;" class="pin-display">
        <p>Room PIN:</p>
        <div class="pin-code" id="displayPin">------</div>
        <div id="senderProgressContainer" class="progress-container" style="display:none;">
          <div class="status-text"><span id="senderStatus">Waiting for peer...</span><span id="senderPct">0%</span></div>
          <div class="progress-bar"><div id="senderFill" class="progress-fill"></div></div>
        </div>
      </div>
    </div>
    <div id="receivePanel" class="panel">
      <div class="form-group">
        <label>Enter Room PIN</label>
        <input type="text" id="pinInput" maxlength="6" placeholder="000000">
      </div>
      <button class="action-btn" onclick="joinRoom()">Connect & Download</button>
      <div id="receiverProgressContainer" class="progress-container" style="display:none;">
        <div class="status-text"><span id="receiverStatus">Connecting...</span><span id="receiverPct">0%</span></div>
        <div class="progress-bar"><div id="receiverFill" class="progress-fill"></div></div>
        <div id="downloadLinks" style="margin-top: 15px;"></div>
      </div>
    </div>
  </div>
  <script src="/socket.io/socket.io.js"></script>
  <script>
    const socket = io();
    let currentPin = '';
    let selectedFiles = [];
    let pc, dataChannel;

    const rtcConfig = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        {
          urls: 'turn:standard.relay.metered.ca:80',
          username: 'openrelayproject',
          credential: 'openrelayproject'
        }
      ]
    };

    function switchTab(tab) {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      if(tab === 'send') {
        document.querySelectorAll('.tab-btn')[0].classList.add('active');
        document.getElementById('sendPanel').classList.add('active');
      } else {
        document.querySelectorAll('.tab-btn')[1].classList.add('active');
        document.getElementById('receivePanel').classList.add('active');
      }
    }

    document.getElementById('fileInput').addEventListener('change', (e) => {
      selectedFiles = Array.from(e.target.files);
      const preview = document.getElementById('fileListPreview');
      if (selectedFiles.length > 0) {
        preview.style.display = 'block';
        preview.innerHTML = selectedFiles.map(f => \`<div class="file-item"><span>\${f.name}</span><span>\${(f.size / (1024*1024)).toFixed(2)} MB</span></div>\`).join('');
      }
    });

    function hostRoom() {
      if (selectedFiles.length === 0) return alert('Select files first.');
      currentPin = Math.floor(100000 + Math.random() * 900000).toString();
      document.getElementById('displayPin').innerText = currentPin;
      document.getElementById('vaultInfo').style.display = 'block';
      document.getElementById('senderProgressContainer').style.display = 'block';
      
      socket.emit('host', currentPin);
    }

    socket.on('join_offer', async () => {
      document.getElementById('senderStatus').innerText = 'Peer connected. Setting up P2P stream...';
      pc = new RTCPeerConnection(rtcConfig);
      dataChannel = pc.createDataChannel('transfer');
      setupSenderChannel();

      pc.onicecandidate = e => {
        if (e.candidate) socket.emit('signal', { pin: currentPin, candidate: e.candidate });
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('signal', { pin: currentPin, sdp: pc.localDescription });
    });

    function joinRoom() {
      currentPin = document.getElementById('pinInput').value.trim();
      if (currentPin.length !== 6) return alert('Enter a valid 6-digit PIN');
      document.getElementById('receiverProgressContainer').style.display = 'block';
      
      pc = new RTCPeerConnection(rtcConfig);
      pc.ondatachannel = e => {
        dataChannel = e.channel;
        setupReceiverChannel();
      };

      pc.onicecandidate = e => {
        if (e.candidate) socket.emit('signal', { pin: currentPin, candidate: e.candidate });
      };

      socket.emit('join', currentPin);
    }

    socket.on('signal', async data => {
      if (!pc) return;
      if (data.sdp) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        if (data.sdp.type === 'offer') {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('signal', { pin: currentPin, sdp: pc.localDescription });
        }
      } else if (data.candidate) {
        try { await pc.addIceCandidate(new RTCIceCandidate(data.candidate)); } catch(e){}
      }
    });

    function setupSenderChannel() {
      dataChannel.onopen = async () => {
        document.getElementById('senderStatus').innerText = 'Transferring P2P...';
        const manifest = selectedFiles.map(f => ({ name: f.name, size: f.size }));
        dataChannel.send(JSON.stringify({ type: 'manifest', manifest }));

        for (let i = 0; i < selectedFiles.length; i++) {
          const file = selectedFiles[i];
          let offset = 0;
          const CHUNK = 64 * 1024;
          
          dataChannel.send(JSON.stringify({ type: 'file_start', index: i, name: file.name, size: file.size }));

          while (offset < file.size) {
            const slice = file.slice(offset, offset + CHUNK);
            const buf = await slice.arrayBuffer();
            
            if (dataChannel.bufferedAmount > 16 * 1024 * 1024) {
              await new Promise(r => setTimeout(r, 10));
            }
            dataChannel.send(buf);
            offset += CHUNK;

            const pct = Math.round((offset / file.size) * 100);
            document.getElementById('senderFill').style.width = pct + '%';
            document.getElementById('senderPct').innerText = pct + '%';
          }
        }
        document.getElementById('senderStatus').innerText = 'Complete!';
      };
    }

    let rxFiles = {};
    function setupReceiverChannel() {
      dataChannel.onopen = () => {
        document.getElementById('receiverStatus').innerText = 'Connected! Receiving...';
      };

      let currentFileIdx = 0;
      let chunks = [];
      let receivedBytes = 0;
      let totalSize = 1;

      dataChannel.onmessage = async e => {
        if (typeof e.data === 'string') {
          const msg = JSON.parse(e.data);
          if (msg.type === 'manifest') {
            totalSize = msg.manifest.reduce((acc, f) => acc + f.size, 0);
          } else if (msg.type === 'file_start') {
            chunks = [];
            receivedBytes = 0;
            currentFileIdx = msg.index;
          }
          return;
        }

        chunks.push(e.data);
        receivedBytes += e.data.byteLength;

        const pct = Math.round((receivedBytes / totalSize) * 100);
        document.getElementById('receiverFill').style.width = pct + '%';
        document.getElementById('receiverPct').innerText = pct + '%';

        // Auto-save blob when file finishes
        const blob = new Blob(chunks);
        const url = URL.createObjectURL(blob);
        document.getElementById('downloadLinks').innerHTML = \`<a href="\${url}" download="downloaded_file" style="color:var(--primary);font-weight:bold;">📥 Download File</a>\`;
      };
    }
  </script>
</body>
</html>`);
});

io.on('connection', socket => {
  socket.on('host', pin => socket.join(pin));
  socket.on('join', pin => {
    socket.join(pin);
    socket.to(pin).emit('join_offer');
  });
  socket.on('signal', data => socket.to(data.pin).emit('signal', data));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
