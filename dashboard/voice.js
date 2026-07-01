// ============================================
// JARVIS OS - Voice Layer (Web Speech API)
// ============================================

class JarvisVoice {
  constructor(opts = {}) {
    this.lang = opts.lang || "vi-VN";
    this.onTranscript = opts.onTranscript || (() => {});
    this.onInterim = opts.onInterim || (() => {});
    this.onStart = opts.onStart || (() => {});
    this.onEnd = opts.onEnd || (() => {});
    this.onError = opts.onError || (() => {});

    this.recognition = null;
    this.synth = window.speechSynthesis;
    this.isListening = false;
    // Nhớ lựa chọn bật/tắt đọc qua reload (khách hàng nhiều khi không muốn có voice).
    this.ttsEnabled = (localStorage.getItem("jarvis.ttsEnabled") !== "0");
    this.vietnameseVoice = null;

    // Edge TTS backend (server)
    this.ttsBackend = opts.ttsBackend || "/tts"; // "/tts" hoặc null để dùng browser
    this.ttsVoice = opts.ttsVoice || "vi-VN-HoaiMyNeural"; // HoaiMy (nữ) | NamMinh (nam)
    this.ttsRate = opts.ttsRate || "+5%";
    this.currentAudio = null;
    this.ttsQueue = [];
    this.speechQueue = [];   // hàng đợi đọc nối tiếp (các bước trung gian + kết quả)
    this.isPlaying = false;

    // Audio analysis - cho hiệu ứng phát sáng theo âm thanh
    this.audioCtx = null;
    this.outAnalyser = null;   // âm Jarvis đọc (TTS)
    this.inAnalyser = null;    // âm mic (khi nghe)
    this.micStream = null;
    this._freqData = new Uint8Array(64);

    this._initRecognition();
    this._loadVoices();
  }

  _ensureCtx() {
    if (!this.audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AC();
    }
    if (this.audioCtx.state === "suspended") this.audioCtx.resume();
    return this.audioCtx;
  }

  async _startMicMeter() {
    try {
      const ctx = this._ensureCtx();
      if (!this.micStream) {
        this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      const src = ctx.createMediaStreamSource(this.micStream);
      const an = ctx.createAnalyser();
      an.fftSize = 128;
      src.connect(an);
      this.inAnalyser = an;
    } catch (e) { /* mic meter optional */ }
  }

  getInputLevel() {
    if (!this.inAnalyser || !this.isListening) return 0;
    this.inAnalyser.getByteFrequencyData(this._freqData);
    let s = 0;
    for (let i = 0; i < this._freqData.length; i++) s += this._freqData[i];
    return Math.min(1, (s / this._freqData.length) / 200);
  }

  getOutputLevel() {
    if (!this.outAnalyser) return 0;
    this.outAnalyser.getByteFrequencyData(this._freqData);
    let s = 0;
    for (let i = 0; i < this._freqData.length; i++) s += this._freqData[i];
    return Math.min(1, (s / this._freqData.length) / 180);
  }

  getLevel() {
    return Math.max(this.getInputLevel(), this.getOutputLevel());
  }

  _initRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      console.warn("Trình duyệt không hỗ trợ SpeechRecognition. Dùng Chrome hoặc Edge.");
      return;
    }

    this.recognition = new SR();
    this.recognition.lang = this.lang;
    this.recognition.continuous = true;       // nghe liên tục, không dừng giữa câu
    this.recognition.interimResults = true;
    this.recognition.maxAlternatives = 1;

    this.accumulatedTranscript = "";
    this.userStopped = false;                 // user chủ động dừng?
    this.silenceMs = 1500;                    // im lặng bao lâu thì tự gửi
    this._silenceTimer = null;

    this.recognition.onstart = () => {
      this.isListening = true;
      this.userStopped = false;
      this.accumulatedTranscript = "";
      this.onStart();
    };

    this.recognition.onresult = (event) => {
      let interim = "", final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += transcript;
        else interim += transcript;
      }
      if (final) this.accumulatedTranscript += final + " ";
      // Show user toàn bộ tích lũy + đoạn đang nghe
      const display = (this.accumulatedTranscript + interim).trim();
      if (display) {
        this.onInterim(display);
        // Reset đồng hồ im lặng - nói tiếp thì hoãn, im đủ lâu thì tự gửi
        clearTimeout(this._silenceTimer);
        this._silenceTimer = setTimeout(() => this.stopListening(), this.silenceMs);
      }
    };

    this.recognition.onerror = (event) => {
      // 'no-speech' không phải lỗi thật - auto-restart
      if (event.error === "no-speech" || event.error === "aborted") {
        return;
      }
      this.isListening = false;
      this.onError(event.error);
    };

    this.recognition.onend = () => {
      // Nếu user chưa chủ động dừng → tự restart (giữ session sống khi user dừng nghĩ)
      if (!this.userStopped) {
        try {
          this.recognition.start();
          return;
        } catch (e) {
          // start fail (đã đang chạy) - ignore
        }
      }
      this.isListening = false;
      // Gửi toàn bộ text đã tích luỹ khi user dừng
      const finalText = this.accumulatedTranscript.trim();
      if (finalText) this.onTranscript(finalText);
      this.onEnd();
    };
  }

  _loadVoices() {
    const load = () => {
      const voices = this.synth.getVoices();
      // Tìm giọng Vietnamese tốt nhất theo thứ tự ưu tiên
      this.vietnameseVoice =
        voices.find(v => v.lang === "vi-VN" && v.name.includes("Google")) ||
        voices.find(v => v.lang === "vi-VN") ||
        voices.find(v => v.lang.startsWith("vi")) ||
        null;
    };
    load();
    if (this.synth.onvoiceschanged !== undefined) {
      this.synth.onvoiceschanged = load;
    }
  }

  startListening() {
    if (!this.recognition) {
      this.onError("not-supported");
      return;
    }
    if (this.isListening) return;
    // Stop TTS đang đọc nếu user bấm nói
    this.synth.cancel();
    this.stopSpeaking();
    this._startMicMeter();  // bật đo âm mic cho hiệu ứng phát sáng
    try {
      this.recognition.start();
    } catch (e) {
      this.onError("start-failed: " + e.message);
    }
  }

  stopListening() {
    clearTimeout(this._silenceTimer);
    if (this.recognition && this.isListening) {
      this.userStopped = true;     // đánh dấu user chủ động dừng → không auto-restart
      this.recognition.stop();
    }
  }

  toggleListening() {
    if (this.isListening) this.stopListening();
    else this.startListening();
  }

  // Đọc NGAY: ngắt phần đang đọc + xoá hàng đợi, rồi đọc đoạn này.
  speak(text) {
    this.stopSpeaking();
    this.enqueueSpeak(text);
  }

  // Đọc NỐI TIẾP: thêm vào cuối hàng đợi, KHÔNG cắt ngang đoạn đang đọc.
  // Dùng cho các cập nhật ở bước trung gian (stream).
  enqueueSpeak(text) {
    if (!this.ttsEnabled) return;
    const clean = this._cleanForTTS(text);
    if (!clean) return;
    this.speechQueue.push(clean);
    if (!this.isPlaying) this._pumpQueue();
  }

  // Lấy đoạn kế trong hàng đợi để đọc; hết hàng đợi thì dừng.
  _pumpQueue() {
    if (!this.speechQueue || this.speechQueue.length === 0) { this.isPlaying = false; return; }
    this.isPlaying = true;
    const text = this.speechQueue.shift();
    if (this.ttsBackend) this._speakBackend(text);   // Edge TTS (giọng Việt chuẩn)
    else this._speakBrowser(text);                   // fallback Web Speech
  }

  _cleanForTTS(text) {
    return text
      .replace(/```[\s\S]*?```/g, " ")        // bỏ code block
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\*(.+?)\*/g, "$1")
      .replace(/`(.+?)`/g, "$1")
      .replace(/!\[.*?\]\(.*?\)/g, "")          // ảnh
      .replace(/\[(.+?)\]\(.+?\)/g, "$1")       // link → giữ chữ
      .replace(/^#{1,6}\s+/gm, "")              // heading
      .replace(/^\s*\d+[.)]\s+/gm, "")          // list số
      .replace(/^\s*[-*•]\s+/gm, "")            // list dấu đầu dòng
      .replace(/\s*[—–]\s*/g, ", ")             // gạch ngang em/en → phẩy (hết khựng)
      .replace(/\s*\|\s*/g, ", ")               // ô bảng markdown
      .replace(/\n{2,}/g, ". ")                 // đoạn mới → chấm
      .replace(/\n/g, ", ")                     // xuống dòng → phẩy (liền mạch, vẫn có nhịp thở)
      .replace(/\s*([,.])\s*([,.])/g, "$1")     // dồn dấu trùng (.,  ,. → .)
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  _chunkUrl(text) {
    return `${this.ttsBackend}?text=${encodeURIComponent(text)}&voice=${encodeURIComponent(this.ttsVoice)}&rate=${encodeURIComponent(this.ttsRate)}`;
  }

  async _speakBackend(text) {
    // KHÔNG stopSpeaking ở đây - hàng đợi (_pumpQueue) điều phối thứ tự đọc.
    // Đoạn to (đa số câu trả lời = 1 đoạn → đọc liền 1 mạch, không khoảng trống)
    this.ttsChunks = this._splitIntoChunks(text, 600);
    this._preloaded = null;
    this.isPlaying = true;
    this._playChunk(0);
  }

  _playChunk(i) {
    // Hết chunk của đoạn này → chuyển sang đoạn kế trong hàng đợi (không tự dừng).
    if (!this.ttsChunks || i >= this.ttsChunks.length) { this._pumpQueue(); return; }
    // Dùng audio đã preload nếu trùng index, không thì tạo mới
    let audio = (this._preloaded && this._preloaded.i === i) ? this._preloaded.audio
              : new Audio(this._chunkUrl(this.ttsChunks[i]));
    this._preloaded = null;
    this.currentAudio = audio;

    // Route analyser (cho hiệu ứng glow) chỉ khi context chạy + chưa route
    try {
      const ctx = this._ensureCtx();
      if (ctx && ctx.state === "running" && !audio.__routed) {
        audio.crossOrigin = "anonymous";
        const src = ctx.createMediaElementSource(audio);
        const an = ctx.createAnalyser();
        an.fftSize = 128;
        src.connect(an);
        an.connect(ctx.destination);
        this.outAnalyser = an;
        audio.__routed = true;
      }
    } catch (e) { /* phát thẳng vẫn ổn */ }

    // PRELOAD đoạn kế tiếp ngay khi đoạn này bắt đầu → khi hết là phát liền, không trống
    if (i + 1 < this.ttsChunks.length) {
      const na = new Audio(this._chunkUrl(this.ttsChunks[i + 1]));
      na.preload = "auto";
      try { na.load(); } catch (e) {}
      this._preloaded = { i: i + 1, audio: na };
    }

    audio.onended = () => this._playChunk(i + 1);
    // Lỗi đoạn này → đọc bằng browser rồi đọc tiếp các chunk còn lại của đoạn.
    audio.onerror = () => { this._speakBrowser(this.ttsChunks[i], () => this._playChunk(i + 1)); };
    audio.play().catch(() => this._speakBrowser(this.ttsChunks[i], () => this._playChunk(i + 1)));
  }

  // onDone: gọi khi đọc xong đoạn (mặc định: lấy đoạn kế trong hàng đợi).
  _speakBrowser(text, onDone) {
    const done = onDone || (() => this._pumpQueue());
    const chunks = this._splitIntoChunks(text, 200);
    let idx = 0;
    const playNext = () => {
      if (idx >= chunks.length) { done(); return; }
      const utter = new SpeechSynthesisUtterance(chunks[idx++]);
      utter.lang = this.lang;
      if (this.vietnameseVoice) utter.voice = this.vietnameseVoice;
      utter.rate = 1.05;
      utter.onend = playNext;
      utter.onerror = playNext;
      this.synth.speak(utter);
    };
    playNext();
  }

  stopSpeaking() {
    this.synth.cancel();
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }
    if (this._preloaded && this._preloaded.audio) {
      try { this._preloaded.audio.pause(); } catch (e) {}
    }
    this._preloaded = null;
    this.ttsChunks = null;
    this.ttsQueue = [];
    this.speechQueue = [];
    this.isPlaying = false;
  }

  setVoice(voiceName) {
    this.ttsVoice = voiceName;
  }

  setRate(rate) {
    this.ttsRate = rate;
  }

  setRecognitionLang(lang) {
    this.lang = lang;
    if (this.recognition) this.recognition.lang = lang;
  }

  toggleTTS() {
    this.ttsEnabled = !this.ttsEnabled;
    try { localStorage.setItem("jarvis.ttsEnabled", this.ttsEnabled ? "1" : "0"); } catch (e) {}
    if (!this.ttsEnabled) this.stopSpeaking();
    return this.ttsEnabled;
  }

  _splitIntoChunks(text, maxLen) {
    const sentences = text.match(/[^.!?]+[.!?]+|\s*[^.!?]+$/g) || [text];
    const chunks = [];
    let current = "";
    for (const s of sentences) {
      if ((current + s).length > maxLen && current) {
        chunks.push(current.trim());
        current = s;
      } else {
        current += s;
      }
    }
    if (current.trim()) chunks.push(current.trim());
    return chunks.filter(c => c.length > 0);
  }

  isSpeaking() {
    return this.isPlaying || (this.synth && this.synth.speaking);
  }

  isSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }
}

window.JarvisVoice = JarvisVoice;
