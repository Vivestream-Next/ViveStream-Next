# ViveStream Next — AI Neural ASR & Audio Intelligence Roadmap

This roadmap outlines the architectural evolution of ViveStream Next's on-device AI transcription, lyrics synchronization, and vocal processing engine.

---

## 🎯 Executive Vision
While OpenAI's Whisper is an exceptional general-purpose model for Western speech, South Asian languages—specifically **Hindi (`hi`)** and **Bengali / Bangla (`bn`)**—require specialized acoustic modeling due to complex phonetic structures, speed of singing, musical accompaniment, and frequent code-switching (Hinglish/Banglish).

Our goal is to build an intelligent, multi-engine ASR hub inside ViveStream Next that runs completely offline with zero telemetry, scaled across Low-End, Mid-Range, and High-End hardware.

---

## 🗺️ Implementation Milestones

### Milestone 1: AI4Bharat IndicConformer & IndicWhisper (Q1)
- **Engine**: IIT Madras / AI4Bharat Hybrid CTC-RNNT Conformer.
- **Target Languages**: Hindi, Bengali (Bangla), Tamil, Telugu, Marathi, Gujarati, Punjabi, Urdu, Kannada, Malayalam (22 scheduled Indian languages).
- **Key Advantages**:
  - Trained on 10,000+ hours of verified Indian speech corpora (*KathBath*, *Shrutilipi*, *Nirantar*).
  - Native code-switching support (transcribes mixed English/Hindi/Bangla speech accurately).
  - Word Error Rate (WER) reduction from ~28% (vanilla Whisper) down to <8% on Indic audio.
- **Technical Architecture**:
  - Export ONNX / TensorRT / Candle runtime for `ai4bharat/indic-conformer-600m-multilingual`.
  - INT8 quantization via ONNX Runtime for smooth execution on 8GB RAM laptops.

---

### Milestone 2: Meta MMS (Massively Multilingual Speech) CTC Engine (Q2)
- **Engine**: Meta MMS-1B / MMS-300M (Wav2Vec2 backbone).
- **Target Languages**: 1,400+ world languages with dynamic language adapters (`hin`, `ben`, etc.).
- **Key Advantages**:
  - Non-autoregressive decoding (processes entire 4-minute songs in 1–3 seconds).
  - Extremely lightweight memory footprint (~600MB RAM for the 300M variant).
  - Perfect for low-end laptops and budget desktop PCs without a dedicated GPU.
- **Karaoke Syllable Alignment**:
  - CTC outputs continuous phonetic probability matrices, allowing millisecond-accurate word and syllable timestamps without timing drift.

---

### Milestone 3: Whisper Large-v3-Turbo & 4-Bit GGUF Quantization (Immediate)
- **Engine**: OpenAI Whisper Large-v3-Turbo (809M parameters).
- **Optimization**:
  - 4-layer decoder architecture (4x to 6x faster than legacy Large-v3).
  - Q4_K_M and Q5_K_M GGUF quantization using pure Rust Candle / Vulkan backend.
  - Drops memory requirement from ~4.5GB down to ~850MB VRAM/RAM.
- **Hardware Profile**: Instant transcription for English, Japanese, Korean, Spanish, French, German.

---

### Milestone 4: Intelligent Auto-Router & Hybrid Dual-Engine (Q3)
- **Automatic Language Identification (LID)**:
  - Fast 0.2s audio probe detects language and dialect.
  - Automatically routes Western tracks to **Whisper Large-v3-Turbo** and South Asian / Indian tracks to **AI4Bharat IndicConformer**.
- **Real-Time Word-Level Karaoke Alignment**:
  - CTC forced aligner computes syllable bounce coordinates for live lyrics playback.

---

## 💻 Hardware Tier Compatibility Matrix

| Hardware Tier | Recommended AI Model | Memory Usage | Expected Speed (4-Min Song) |
| :--- | :--- | :--- | :--- |
| **Low-End PC** (Intel Celeron / i3 / Core 2, 4–8GB RAM, iGPU) | **Meta MMS-300M** / Whisper Base (Q4) | ~450MB – 750MB | ~10 – 15 seconds (Realtime) |
| **Mid-Range PC** (i5 / Ryzen 5, 8–16GB RAM, GTX 1650 / RTX 3050) | **IndicConformer-600M** / Whisper Turbo | ~1.2GB – 2.0GB | ~2 – 4 seconds |
| **High-End PC** (i7 / i9 / Ryzen 7/9, 16–32GB RAM, RTX 3060/4070+) | Full Precision IndicConformer + CTC Alignment | ~2.5GB – 4.0GB | < 1 second (Sub-second) |

---

## 💰 Monetization & Pro Licensing Integration
- **Free Tier**: Whisper Tiny / Base models with standard LRC export.
- **6-Month Pro License ($9.99)**:
  - AI4Bharat IndicConformer & IndicWhisper.
  - Meta MMS Ultra-Fast Engine.
  - Whisper Large-v3-Turbo.
  - Batch Lyrics Studio processing (transcribe entire playlists in one click).
  - Syllable-level enhanced LRC / karaoke export.
