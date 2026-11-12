// Голосовой чат «В Точку»: «нажми и говори», звук идёт напрямую между телефонами (WebRTC).
// Сервер только передаёт служебные сообщения для соединения. Ретранслятор (TURN) можно добавить позже.
'use strict';
(function (root) {
  const ICE = [{ urls: 'stun:stun.cloudflare.com:3478' }, { urls: 'stun:stun.l.google.com:19302' }];
  let myPid = null, send = null, onLevel = () => {}, onState = () => {};
  const peers = new Map();       // pid → { pc, tr, audio, pending, analyser }
  const muted = new Set();       // pid, которых я не слышу
  let mic = null, micTrack = null, talking = false, ac = null, micAnalyser = null, meterRaf = 0;
  let extraIce = [];

  function ensureCtx() {
    if (!ac) { const AC = root.AudioContext || root.webkitAudioContext; if (AC) ac = new AC(); }
    if (ac && ac.state !== 'running') ac.resume().catch(() => {});
    return ac;
  }
  function analyserFor(stream) {
    const ctx = ensureCtx();
    if (!ctx) return null;
    try {
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser(); an.fftSize = 512;
      src.connect(an);
      return an;
    } catch { return null; }
  }
  const buf = new Uint8Array(512);
  function levelOf(an) {
    if (!an) return 0;
    an.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < an.fftSize; i++) { const x = (buf[i] - 128) / 128; sum += x * x; }
    return Math.sqrt(sum / an.fftSize);
  }
  function meter() {
    for (const [pid, p] of peers) onLevel(pid, muted.has(pid) ? 0 : levelOf(p.analyser));
    onLevel(myPid, talking ? levelOf(micAnalyser) : 0);
    meterRaf = requestAnimationFrame(meter);
  }

  function attachAudio(pid, stream) {
    const p = peers.get(pid);
    if (!p) return;
    if (!p.audio) {
      p.audio = document.createElement('audio');
      p.audio.autoplay = true; p.audio.playsInline = true;
      p.audio.style.display = 'none';
      document.body.appendChild(p.audio);
    }
    p.audio.srcObject = stream;
    p.audio.muted = muted.has(pid);
    p.audio.play().catch(() => {});
    p.analyser = analyserFor(stream);
    if (!meterRaf) meterRaf = requestAnimationFrame(meter);
  }

  function createPeer(pid, initiator) {
    const pc = new RTCPeerConnection({ iceServers: ICE.concat(extraIce) });
    // Аудиоканал создаёт только инициатор; отвечающий берёт канал из полученного предложения.
    const tr = initiator ? pc.addTransceiver('audio', { direction: 'sendrecv' }) : null;
    if (tr && micTrack) tr.sender.replaceTrack(micTrack).catch(() => {});
    const p = { pc, tr, audio: null, pending: [], analyser: null, initiator };
    peers.set(pid, p);
    pc.onicecandidate = e => { if (e.candidate) send(pid, { cand: e.candidate }); };
    pc.ontrack = e => attachAudio(pid, e.streams[0] || new MediaStream([e.track]));
    pc.onconnectionstatechange = () => {
      onState(pid, pc.connectionState);
      if (pc.connectionState === 'failed') drop(pid);
    };
    if (initiator) {
      (async () => {
        try { await pc.setLocalDescription(await pc.createOffer()); send(pid, { sdp: pc.localDescription }); } catch (e) { console.warn('offer', e); }
      })();
    }
    return p;
  }
  function drop(pid) {
    const p = peers.get(pid);
    if (!p) return;
    try { p.pc.close(); } catch {}
    if (p.audio) { p.audio.srcObject = null; p.audio.remove(); }
    peers.delete(pid);
    onLevel(pid, 0);
  }
  async function flush(p) {
    for (const c of p.pending.splice(0)) { try { await p.pc.addIceCandidate(c); } catch {} }
  }

  const Voice = {
    supported: typeof RTCPeerConnection !== 'undefined' && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
    init(opts) { send = opts.send; onLevel = opts.onLevel || onLevel; onState = opts.onState || onState; },
    setIce(list) { extraIce = Array.isArray(list) ? list : []; },
    // Список живых игроков за столом (кроме меня): с кем держать соединение.
    sync(pid, others) {
      if (!Voice.supported || !send) return;
      myPid = pid;
      const want = new Set(others);
      for (const id of [...peers.keys()]) if (!want.has(id)) drop(id);
      // Соединение начинает тот, у кого pid меньше, — так нет встречных предложений.
      for (const id of want) if (!peers.has(id) && myPid < id) createPeer(id, true);
    },
    async onSignal(from, data) {
      if (!Voice.supported || !data) return;
      let p = peers.get(from);
      try {
        if (data.sdp && data.sdp.type === 'offer') {
          if (p) drop(from);
          p = createPeer(from, false);
          await p.pc.setRemoteDescription(data.sdp);
          p.tr = p.pc.getTransceivers()[0];
          if (p.tr) { p.tr.direction = 'sendrecv'; if (micTrack) await p.tr.sender.replaceTrack(micTrack).catch(() => {}); }
          await flush(p);
          await p.pc.setLocalDescription(await p.pc.createAnswer());
          send(from, { sdp: p.pc.localDescription });
        } else if (data.sdp && p) {
          await p.pc.setRemoteDescription(data.sdp);
          await flush(p);
        } else if (data.cand) {
          if (!p) return;
          if (p.pc.remoteDescription) await p.pc.addIceCandidate(data.cand).catch(() => {});
          else p.pending.push(data.cand);
        }
      } catch (e) { console.warn('rtc', e); }
    },
    async startTalk() {
      if (!Voice.supported) return 'unsupported';
      ensureCtx();
      if (!micTrack) {
        try {
          mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        } catch { return 'denied'; }
        micTrack = mic.getAudioTracks()[0];
        micAnalyser = analyserFor(mic);
        for (const p of peers.values()) if (p.tr) p.tr.sender.replaceTrack(micTrack).catch(() => {});
        if (!meterRaf) meterRaf = requestAnimationFrame(meter);
      }
      micTrack.enabled = true;
      talking = true;
      return 'ok';
    },
    stopTalk() { talking = false; if (micTrack) micTrack.enabled = false; },
    isTalking: () => talking,
    setMuted(pid, m) { if (m) muted.add(pid); else muted.delete(pid); const p = peers.get(pid); if (p && p.audio) p.audio.muted = m; },
    // На iPhone звук запускается только после касания — вызываем при любом нажатии.
    unlock() { ensureCtx(); for (const p of peers.values()) if (p.audio && p.audio.paused) p.audio.play().catch(() => {}); },
    stopAll() { for (const id of [...peers.keys()]) drop(id); if (mic) mic.getTracks().forEach(t => t.stop()); mic = null; micTrack = null; talking = false; },
    peersInfo: () => [...peers].map(([pid, p]) => ({ pid, state: p.pc.connectionState })),
  };
  root.Voice = Voice;
})(typeof self !== 'undefined' ? self : this);
