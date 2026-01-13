// --- Configuration ---
const WIDTH = 1080;
const HEIGHT = 1980;

class App {
    constructor() {
        // State
        this.state = {
            triggers: [],
            recordedTriggers: [],
            images: [],
            textData: [],
            videoElement: null,
            isRunning: false,
            isRecording: false,
            triggerIndex: 0,
            imageIndex: 0,
            textIndex: 0,
            editMode: 'normal',
            scalingMode: 'fill',
            triggerSource: 'midi',
            sensitivity: 50,
            fontSize: 80,
            textStyle: 'word', // 'word' or 'paragraph'
            textAlign: 'justify',
            textPosition: 'center',
            textPadding: 50,
            textOutline: true,
            fontColor: '#ffffff',
            fontFamily: 'Inter',
            paragraphBuffer: [],
            paragraphLines: [],
            lastFontProps: '',
            imageStack: [], // { params, expiry, type, content }
            lastPeakTime: 0,
            eraseTime: 2000,
        };

        this.constants = {
            PEAK_COOLDOWN: 150
        };

        // Audio Context
        this.audioCtx = null;
        this.source = null;
        this.analyser = null;
        this.dataArray = null;

        // Elements
        this.els = {
            canvas: document.getElementById('visualizer'),
            ctx: document.getElementById('visualizer').getContext('2d'),
            audioPlayer: document.getElementById('audioPlayer'),
            startBtn: document.getElementById('startBtn'),
            stopBtn: document.getElementById('stopBtn'),
            processingOverlay: document.getElementById('processing-overlay'),
            inputs: {
                midi: document.getElementById('midiInput'),
                audio: document.getElementById('audioInput'),
                images: document.getElementById('imageInput'),
                video: document.getElementById('videoInput'),
                text: document.getElementById('textInput'),
                fontSize: document.getElementById('fontSize'),
                textStyle: document.getElementById('textStyle'),
                textAlign: document.getElementById('textAlign'),
                textPosition: document.getElementById('textPosition'),
                textPosition: document.getElementById('textPosition'),
                textPadding: document.getElementById('textPadding'),
                fontColor: document.getElementById('fontColor'),
                fontFamily: document.getElementById('fontFamily'),
                fontInput: document.getElementById('fontInput'),
                textOutline: document.getElementById('textOutline'),
                sensitivity: document.getElementById('sensitivity'),
                eraseTime: document.getElementById('eraseTime'),
                eraseTimeValue: document.getElementById('eraseTimeValue'),
            },
            recordBtn: document.getElementById('recordBtn'),
            tapBtn: document.getElementById('tapBtn'),
            triggerSourceSelect: document.getElementById('triggerSource'),
            editModeSelect: document.getElementById('editMode'),
            scalingRadios: document.getElementsByName('scaling'),
            activityItems: document.querySelectorAll('.activity-item[data-target]'),
            sidebarViews: document.querySelectorAll('.sidebar-view')
        };

        this.init();
    }

    init() {
        this.state.videoElement = document.createElement('video');
        this.state.videoElement.loop = true;
        this.state.videoElement.muted = true;
        this.state.videoElement.playsInline = true;

        this.bindEvents();
        this.setupTabs();
        this.initTrail();
        console.log("App Initialized");
    }

    bindEvents() {
        // Navigation
        this.els.activityItems.forEach(item => {
            item.addEventListener('click', () => this.switchTab(item));
        });

        // Controls
        this.els.startBtn.addEventListener('click', () => this.startSequence());
        this.els.stopBtn.addEventListener('click', () => this.stopSequence());
        if (this.els.recordBtn) this.els.recordBtn.addEventListener('click', () => this.startManualRecord());
        if (this.els.tapBtn) this.els.tapBtn.addEventListener('mousedown', () => this.recordTap());

        this.els.canvas.addEventListener('mousedown', () => {
            if (this.state.isRecording) this.recordTap();
        });
        window.addEventListener('keydown', (e) => {
            if (this.state.isRecording && e.code === 'Space') {
                e.preventDefault();
                this.recordTap();
            }
        });

        // Inputs
        this.els.inputs.audio.addEventListener('change', (e) => {
            if (e.target.files[0]) this.els.audioPlayer.src = URL.createObjectURL(e.target.files[0]);
        });

        this.els.inputs.video.addEventListener('change', (e) => {
            if (e.target.files[0]) {
                const url = URL.createObjectURL(e.target.files[0]);
                this.state.videoElement.src = url;
                this.state.videoElement.load();
            }
        });

        this.els.inputs.text.addEventListener('input', () => {
            const raw = this.els.inputs.text.value;
            this.state.textData = raw.trim().split(/\s+/).filter(w => w.length > 0);
        });

        this.els.inputs.fontSize.addEventListener('input', (e) => this.state.fontSize = parseInt(e.target.value));
        this.els.inputs.textStyle.addEventListener('change', (e) => {
            this.state.textStyle = e.target.value;
            this.updateConfigVisibility();
        });
        this.els.inputs.textAlign.addEventListener('change', (e) => this.state.textAlign = e.target.value);
        this.els.inputs.textPosition.addEventListener('change', (e) => this.state.textPosition = e.target.value);
        this.els.inputs.textPadding.addEventListener('input', (e) => this.state.textPadding = parseInt(e.target.value));
        this.els.inputs.fontColor.addEventListener('input', (e) => this.state.fontColor = e.target.value);
        this.els.inputs.textOutline.addEventListener('change', (e) => this.state.textOutline = e.target.checked);

        this.els.inputs.fontFamily.addEventListener('change', (e) => this.state.fontFamily = e.target.value);
        this.els.inputs.fontInput.addEventListener('change', (e) => this.loadCustomFont(e));

        this.els.triggerSourceSelect.addEventListener('change', (e) => {
            this.state.triggerSource = e.target.value;
            this.updateConfigVisibility();
        });

        this.els.editModeSelect.addEventListener('change', (e) => {
            this.state.editMode = e.target.value;
            this.updateConfigVisibility();
        });
        this.els.inputs.sensitivity.addEventListener('input', (e) => this.state.sensitivity = parseInt(e.target.value));

        if (this.els.inputs.eraseTime) {
            this.els.inputs.eraseTime.addEventListener('input', (e) => {
                const val = parseInt(e.target.value);
                this.state.eraseTime = val;
                if (this.els.inputs.eraseTimeValue) this.els.inputs.eraseTimeValue.textContent = val;
            });
        }

        this.els.scalingRadios.forEach(radio => {
            radio.addEventListener('change', (e) => this.state.scalingMode = e.target.value);
        });

        this.els.audioPlayer.onended = () => this.onAudioEnd();

        // Clear Buttons
        const clearAllBtn = document.getElementById('clearAllBtn');
        if (clearAllBtn) clearAllBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.clearAllAssets();
        });

        document.querySelectorAll('.clear-asset').forEach(icon => {
            icon.addEventListener('click', (e) => {
                e.stopPropagation();
                const targetId = icon.getAttribute('data-target');
                this.clearAsset(targetId);
            });
        });
    }

    setupTabs() {
        this.updateConfigVisibility();
    }

    switchTab(clickedItem) {
        this.els.activityItems.forEach(i => i.classList.remove('active'));
        this.els.sidebarViews.forEach(v => v.classList.remove('active'));
        clickedItem.classList.add('active');
        const targetId = clickedItem.getAttribute('data-target');
        const targetView = document.getElementById(targetId);
        if (targetView) targetView.classList.add('active');
    }

    updateConfigVisibility() {
        const source = this.state.triggerSource;
        const sensGroup = document.getElementById('sensitivity-group');
        const manualGroup = document.getElementById('manual-record-group');

        if (sensGroup) sensGroup.style.display = source === 'audio' ? 'block' : 'none';
        if (manualGroup) manualGroup.style.display = source === 'manual' ? 'block' : 'none';
        const midiGroup = document.getElementById('midi-input-group');
        if (midiGroup) midiGroup.style.display = source === 'midi' ? 'block' : 'none';

        const pOpts = document.getElementById('paragraph-options');
        if (pOpts) pOpts.style.display = (this.state.textStyle === 'paragraph' || this.state.textStyle === 'still') ? 'block' : 'none';

        const eraseGroup = document.getElementById('erase-time-group');
        if (eraseGroup) {
            eraseGroup.style.display = (this.state.editMode === 'overlap' || this.state.editMode === 'random') ? 'block' : 'none';
        }
    }

    clearAllAssets() {
        this.clearAsset('midiInput');
        this.clearAsset('audioInput');
        this.clearAsset('imageInput');
        this.clearAsset('videoInput');
    }

    clearAsset(targetId) {
        const input = document.getElementById(targetId);
        if (input) input.value = '';

        if (targetId === 'midiInput') {
            if (this.state.triggerSource === 'midi') {
                this.state.triggers = [];
            }
        } else if (targetId === 'audioInput') {
            this.els.audioPlayer.pause();
            this.els.audioPlayer.src = '';
            this.stopSequence();
        } else if (targetId === 'imageInput') {
            this.state.images = [];
        } else if (targetId === 'videoInput') {
            if (this.state.videoElement) {
                this.state.videoElement.pause();
                this.state.videoElement.removeAttribute('src');
                this.state.videoElement.load();
            }
        } else if (targetId === 'fontInput') {
            // Reset to default
            this.state.fontFamily = 'Inter';
            this.els.inputs.fontFamily.value = 'Inter';
            // Remove custom option if exists
            const customOpt = this.els.inputs.fontFamily.querySelector('option[value="CustomFont"]');
            if (customOpt) customOpt.remove();
        }
    }

    loadCustomFont(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const fontFace = new FontFace('CustomFont', evt.target.result);
                fontFace.load().then((loadedFace) => {
                    document.fonts.add(loadedFace);
                    // Add option and select it
                    let customOpt = this.els.inputs.fontFamily.querySelector('option[value="CustomFont"]');
                    if (!customOpt) {
                        customOpt = document.createElement('option');
                        customOpt.value = 'CustomFont';
                        this.els.inputs.fontFamily.appendChild(customOpt);
                    }
                    customOpt.textContent = `Custom (${file.name})`;
                    this.els.inputs.fontFamily.value = 'CustomFont';
                    this.state.fontFamily = 'CustomFont';
                    console.log("Custom font loaded");
                }).catch(err => {
                    console.error("Font loading error:", err);
                    alert("Failed to load font.");
                });
            } catch (err) {
                console.error("Font error:", err);
            }
        };
        reader.readAsArrayBuffer(file);
    }

    // Placeholder methods
    initTrail() {
        const trailCanvas = document.getElementById('trail-canvas');
        const trailCtx = trailCanvas.getContext('2d');
        let dots = [];

        function resizeTrail() {
            const rect = trailCanvas.parentElement.getBoundingClientRect();
            trailCanvas.width = rect.width;
            trailCanvas.height = rect.height;
        }
        window.addEventListener('resize', resizeTrail);
        resizeTrail();

        window.addEventListener('mousemove', (e) => {
            const rect = trailCanvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            dots.push({ x, y, size: Math.random() * 3 + 1, life: 1.0, decay: 0.03 });
        });

        function drawTrail() {
            trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
            for (let i = 0; i < dots.length; i++) {
                const d = dots[i];
                trailCtx.fillStyle = `rgba(255,255,255, ${d.life * 0.5})`;
                trailCtx.beginPath();
                trailCtx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
                trailCtx.fill();
                d.life -= d.decay;
                if (d.life <= 0) { dots.splice(i, 1); i--; }
            }
            requestAnimationFrame(drawTrail);
        }
        drawTrail();
    }

    updateTriggers() {
        const currentTime = this.els.audioPlayer.currentTime;
        let shouldTrigger = false;
        if (this.state.triggerSource === 'audio' && this.analyser) {
            this.analyser.getByteFrequencyData(this.dataArray);
            let sum = 0;
            for (let i = 0; i < this.dataArray.length; i++) sum += this.dataArray[i];
            const avg = sum / this.dataArray.length;
            const threshold = 150 - (this.state.sensitivity * 1.2);
            const now = performance.now();
            if (avg > threshold && (now - this.state.lastPeakTime) > this.constants.PEAK_COOLDOWN) {
                shouldTrigger = true;
                this.state.lastPeakTime = now;
            }
        } else {
            while (this.state.triggerIndex < this.state.triggers.length && this.state.triggers[this.state.triggerIndex].time <= currentTime) {
                shouldTrigger = true;
                this.state.triggerIndex++;
            }
        }
        if (shouldTrigger) this.triggerAction();
    }

    updateParagraphBuffer(word) {
        const ctx = this.els.ctx;
        ctx.font = `bold ${this.state.fontSize}px "${this.state.fontFamily}", sans-serif`;
        const padding = this.state.textPadding;
        const maxWidth = WIDTH - (padding * 2);

        // Create temp buffer with new word
        const nextBuffer = [...this.state.paragraphBuffer, word];

        // Calculate lines for the potential new buffer
        const lines = this.calculateLines(ctx, nextBuffer, maxWidth);

        if (lines.length > 5) {
            // Too long, reset
            this.state.paragraphBuffer = [word];
            this.state.paragraphLines = this.calculateLines(ctx, [word], maxWidth);
        } else {
            // Append
            this.state.paragraphBuffer.push(word);
            this.state.paragraphLines = lines;
        }

        // Mark current font props as valid for this cache
        this.state.lastFontProps = [this.state.fontSize, this.state.fontFamily, this.state.textPadding].join(',');
    }

    calculateLines(ctx, words, maxWidth) {
        if (words.length === 0) return [];
        let lines = [];
        let currentLine = [];
        let currentWidth = 0;
        const spaceWidth = ctx.measureText(' ').width;

        words.forEach(word => {
            const wordWidth = ctx.measureText(word).width;
            if (currentLine.length > 0 && currentWidth + spaceWidth + wordWidth > maxWidth) {
                lines.push(currentLine);
                currentLine = [word];
                currentWidth = wordWidth;
            } else {
                if (currentLine.length > 0) currentWidth += spaceWidth;
                currentLine.push(word);
                currentWidth += wordWidth;
            }
        });
        if (currentLine.length > 0) lines.push(currentLine);
        return lines;
    }

    drawParagraph(ctx, textItem) {
        // We use the current paragraph buffer instead of the specific text item content
        // The item passed is just a trigger to update, but we draw the buffer state
        // To avoid flickering, we rely on state.paragraphBuffer which is updated in triggerAction

        const words = this.state.paragraphBuffer;
        if (!words || words.length === 0) return;

        ctx.font = `bold ${this.state.fontSize}px "${this.state.fontFamily}", sans-serif`;
        ctx.textBaseline = 'middle';
        const padding = Math.max(this.state.textPadding, 20);
        const maxWidth = WIDTH - (padding * 2);
        const lineHeight = this.state.fontSize * 1.4;

        // Check cache validity
        const currentFontProps = [this.state.fontSize, this.state.fontFamily, this.state.textPadding].join(',');
        if (currentFontProps !== this.state.lastFontProps || !this.state.paragraphLines) {
            this.state.paragraphLines = this.calculateLines(ctx, words, maxWidth);
            this.state.lastFontProps = currentFontProps;
        }
        const lines = this.state.paragraphLines;
        const totalHeight = lines.length * lineHeight;

        // Vertical Alignment: Center the block in the screen (or follow Screen Alignment vertically?)
        // Standard VS Code 'Text Position' usually implied X axis, let's keep vertical centered for now
        let startY = (HEIGHT - totalHeight) / 2 + (lineHeight / 2);

        lines.forEach((lineWords, lineIdx) => {
            let y = startY + (lineIdx * lineHeight);

            const isLastLine = lineIdx === lines.length - 1;
            const lineStr = lineWords.join(' ');

            const isJustify = this.state.textAlign.startsWith('justify');

            if (isJustify && !isLastLine && lineWords.length > 1) {
                // Full Justy
                const totalWordWidth = lineWords.reduce((sum, w) => sum + ctx.measureText(w).width, 0);
                const totalSpace = maxWidth - totalWordWidth;
                const spacePerGap = totalSpace / (lineWords.length - 1);

                // Always start from padding for full justify fill
                let currentX = padding;

                lineWords.forEach((w) => {
                    this.drawText(ctx, w, currentX, y);
                    currentX += ctx.measureText(w).width + spacePerGap;
                });

            } else {
                let align = this.state.textAlign;

                // Fallbacks
                if (align === 'justify') align = 'left';
                if (align === 'justify-center') align = 'center';

                let tx = WIDTH / 2;

                if (align === 'center') {
                    tx = WIDTH / 2;
                    ctx.textAlign = 'center';
                } else if (align === 'left') {
                    tx = padding;
                    ctx.textAlign = 'left';
                } else if (align === 'right') {
                    tx = WIDTH - padding;
                    ctx.textAlign = 'right';
                }

                this.drawText(ctx, lineStr, tx, y);
            }
        });
    }

    drawText(ctx, text, x, y) {
        ctx.fillStyle = this.state.fontColor;
        if (this.state.textOutline) {
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.strokeText(text, x, y);
        }
        ctx.fillText(text, x, y);
    }

    drawStill(ctx) {
        const words = this.state.textData;
        if (!words || words.length === 0) return;

        ctx.font = `bold ${this.state.fontSize}px "${this.state.fontFamily}", sans-serif`;
        ctx.textBaseline = 'middle';
        const padding = Math.max(this.state.textPadding, 20);
        const maxWidth = WIDTH - (padding * 2);
        const lineHeight = this.state.fontSize * 1.4;

        const lines = this.calculateLines(ctx, words, maxWidth);
        const totalHeight = lines.length * lineHeight;

        let startY = (HEIGHT - totalHeight) / 2 + (lineHeight / 2);

        lines.forEach((lineWords, lineIdx) => {
            let y = startY + (lineIdx * lineHeight);
            const isLastLine = lineIdx === lines.length - 1;
            const lineStr = lineWords.join(' ');
            const isJustify = this.state.textAlign.startsWith('justify');

            if (isJustify && !isLastLine && lineWords.length > 1) {
                const totalWordWidth = lineWords.reduce((sum, w) => sum + ctx.measureText(w).width, 0);
                const totalSpace = maxWidth - totalWordWidth;
                const spacePerGap = totalSpace / (lineWords.length - 1);
                let currentX = padding;
                lineWords.forEach((w) => {
                    this.drawText(ctx, w, currentX, y);
                    currentX += ctx.measureText(w).width + spacePerGap;
                });
            } else {
                let align = this.state.textAlign;
                if (align === 'justify') align = 'left';
                if (align === 'justify-center') align = 'center';
                let tx = WIDTH / 2;
                if (align === 'center') {
                    tx = WIDTH / 2;
                    ctx.textAlign = 'center';
                } else if (align === 'left') {
                    tx = padding;
                    ctx.textAlign = 'left';
                } else if (align === 'right') {
                    tx = WIDTH - padding;
                    ctx.textAlign = 'right';
                }
                this.drawText(ctx, lineStr, tx, y);
            }
        });
    }

    triggerAction() {
        const now = performance.now();
        let newItem = null;
        const hasText = this.state.textData.length > 0;
        const hasImages = this.state.images.length > 0;

        if (hasText && this.state.textStyle !== 'still') {
            // Prevent text stacking: clear any existing text items
            this.state.imageStack = this.state.imageStack.filter(i => i.type !== 'text');

            const word = this.state.textData[this.state.textIndex % this.state.textData.length];
            newItem = {
                type: 'text',
                content: word,
                expiry: now + 999999999
            };
            this.state.textIndex++;

            if (this.state.textStyle === 'paragraph') {
                this.updateParagraphBuffer(word);
            }
        }
        if (hasImages) {
            const img = this.state.images[this.state.imageIndex % this.state.images.length];

            let params;
            if (this.state.editMode === 'random') {
                params = this.getRandomDrawParams(img);
            } else {
                params = this.getScaledDrawParams(img);
            }

            const imageItem = {
                type: 'image',
                params: params,
                expiry: (this.state.editMode === 'overlap' || this.state.editMode === 'random')
                    ? now + this.state.eraseTime
                    : now + 999999999
            };

            if (this.state.editMode === 'normal') this.state.imageStack = [];

            this.state.imageStack.push(imageItem);
            if (newItem) this.state.imageStack.push(newItem);
            this.state.imageIndex++;
        } else if (newItem) {
            if (this.state.editMode === 'normal') this.state.imageStack = [];
            this.state.imageStack.push(newItem);
        }
    }

    getRandomDrawParams(img) {
        // "Keep the images like this" implies smaller size (~450px scale relative to 1080px)
        // We'll scale them to be roughly 1/3 to 1/2 of the screen width to allow stacking
        const targetScale = 0.4;

        let w = img.width;
        let h = img.height;

        // Scale down if image is huge, or up if tiny, to target width relative to screen
        const scaleFactor = (WIDTH * targetScale) / w;
        w = w * scaleFactor;
        h = h * scaleFactor;

        // Random Position within bounds
        const maxX = WIDTH - w;
        const maxY = HEIGHT - h;

        // Allow slight bleed? User said "on the screen". Let's keep them fully on screen.
        const x = Math.random() * Math.max(0, maxX);
        const y = Math.random() * Math.max(0, maxY);

        return { img, w, h, x, y };
    }

    getScaledDrawParams(img) {
        const imgW = img.width;
        const imgH = img.height;
        const scaleW = WIDTH / imgW;
        const scaleH = HEIGHT / imgH;
        let baseScale = this.state.scalingMode === 'fill' ? Math.max(scaleW, scaleH) : Math.min(scaleW, scaleH);
        return {
            img: img,
            w: imgW * baseScale,
            h: imgH * baseScale,
            x: (WIDTH - (imgW * baseScale)) / 2,
            y: (HEIGHT - (imgH * baseScale)) / 2
        };
    }

    async startManualRecord() {
        if (!this.els.audioPlayer.src) return;

        // Countdown
        const overlay = this.els.processingOverlay;
        const text = overlay.querySelector('p');
        const originalText = text.textContent;
        overlay.classList.remove('hidden');

        for (let i = 3; i > 0; i--) {
            text.textContent = i.toString();
            text.style.fontSize = '80px';
            text.style.fontWeight = 'bold';
            await new Promise(r => setTimeout(r, 600)); // slightly faster beat
        }

        text.textContent = "GO!";
        await new Promise(r => setTimeout(r, 400));

        overlay.classList.add('hidden');
        text.style.fontSize = '';
        text.style.fontWeight = '';
        text.textContent = originalText;

        this.state.isRecording = true;
        this.state.isRunning = false;
        this.state.recordedTriggers = [];
        this.els.recordBtn.classList.add('hidden');
        this.els.tapBtn.classList.remove('hidden');
        this.els.audioPlayer.currentTime = 0;
        await this.els.audioPlayer.play();
    }

    recordTap() {
        const time = this.els.audioPlayer.currentTime;
        this.state.recordedTriggers.push({ time, velocity: 1 });
        const ctx = this.els.ctx;
        ctx.fillStyle = "rgba(255,255,255,0.2)";
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        setTimeout(() => {
            ctx.fillStyle = "#000";
            ctx.fillRect(0, 0, WIDTH, HEIGHT);
        }, 50);
    }

    onAudioEnd() {
        if (this.state.isRecording) {
            this.state.isRecording = false;
            this.els.recordBtn.classList.remove('hidden');
            this.els.tapBtn.classList.add('hidden');
            alert("Recording Complete. Switch Trigger Source to 'Manual' to use.");
        } else {
            this.stopSequence();
        }
    }

    utils_loadMidi(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const midi = new Midi(e.target.result);
                    const events = [];
                    midi.tracks.forEach(track => {
                        track.notes.forEach(note => events.push({
                            time: note.time,
                            velocity: note.velocity
                        }));
                    });
                    events.sort((a, b) => a.time - b.time);
                    resolve(events);
                } catch (err) { reject(err); }
            };
            reader.readAsArrayBuffer(file);
        });
    }

    utils_loadImages(fileList) {
        const promises = Array.from(fileList).map(file => {
            return new Promise((resolve) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.src = URL.createObjectURL(file);
            });
        });
        return Promise.all(promises);
    }

    async loadAssets() {
        if (this.els.inputs.images.files.length > 0) {
            this.state.images = await this.utils_loadImages(this.els.inputs.images.files);
        }
        if (this.state.triggerSource === 'midi' && this.els.inputs.midi.files.length > 0) {
            this.state.triggers = await this.utils_loadMidi(this.els.inputs.midi.files[0]);
        } else if (this.state.triggerSource === 'manual') {
            this.state.triggers = [...this.state.recordedTriggers];
        }
        if (this.state.triggerSource === 'audio') {
            if (!this.audioCtx) {
                this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                this.source = this.audioCtx.createMediaElementSource(this.els.audioPlayer);
                this.analyser = this.audioCtx.createAnalyser();
                this.analyser.fftSize = 256;
                this.source.connect(this.analyser);
                this.analyser.connect(this.audioCtx.destination);
                this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
            } else if (this.audioCtx.state === 'suspended') {
                await this.audioCtx.resume();
            }
        }
    }
    draw() {
        if (!this.state.isRunning) return;
        this.updateTriggers();
        const now = performance.now();
        this.state.imageStack = this.state.imageStack.filter(item => item.expiry > now);
        const ctx = this.els.ctx;

        // Draw Background (Video or Black)
        if (this.state.videoElement && !this.state.videoElement.paused) {
            const vParams = this.getScaledDrawParams(this.state.videoElement); // Reuse scaling logic
            // Assuming video element has width/height properties once loaded?
            // Video element usually needs videoWidth/videoHeight
            const vW = this.state.videoElement.videoWidth;
            const vH = this.state.videoElement.videoHeight;
            const scaleW = WIDTH / vW;
            const scaleH = HEIGHT / vH;
            let baseScale = this.state.scalingMode === 'fill' ? Math.max(scaleW, scaleH) : Math.min(scaleW, scaleH);

            const drawW = vW * baseScale;
            const drawH = vH * baseScale;
            const drawX = (WIDTH - drawW) / 2;
            const drawY = (HEIGHT - drawH) / 2;

            ctx.drawImage(this.state.videoElement, drawX, drawY, drawW, drawH);
        } else {
            ctx.fillStyle = "#000";
            ctx.fillRect(0, 0, WIDTH, HEIGHT);
        }

        this.state.imageStack.forEach(item => {
            if (item.type === 'image') {
                const { img, x, y, w, h } = item.params;
                ctx.drawImage(img, x, y, w, h);
            } else if (item.type === 'text') {
                if (this.state.textStyle === 'paragraph') {
                    this.drawParagraph(ctx, item);
                } else {

                    // Standard Word Mode
                    ctx.fillStyle = this.state.fontColor;
                    ctx.font = `bold ${this.state.fontSize}px "${this.state.fontFamily}", sans-serif`;
                    ctx.textAlign = 'center'; // Always enter for word mode as requested
                    ctx.textBaseline = 'middle';
                    const tx = WIDTH / 2;
                    const padding = this.state.textPadding;
                    const maxWidth = WIDTH - (padding * 2);

                    if (this.state.textOutline) {
                        ctx.strokeStyle = '#000';
                        ctx.lineWidth = 2;
                        ctx.strokeText(item.content, tx, HEIGHT / 2, maxWidth);
                    }
                    ctx.fillText(item.content, tx, HEIGHT / 2, maxWidth);
                }
            }
        });

        if (this.state.textStyle === 'still') {
            this.drawStill(ctx);
        }

        requestAnimationFrame(() => this.draw());
    }
    async startSequence() {
        if (this.state.isRunning) return;
        if (!this.els.audioPlayer.src) {
            alert("Please load an audio file first.");
            return;
        }
        this.els.processingOverlay.classList.remove('hidden');
        try {
            await this.loadAssets();
            this.state.triggerIndex = 0;
            this.state.imageIndex = 0;
            this.state.imageIndex = 0;
            this.state.textIndex = 0;
            this.state.paragraphBuffer = [];
            this.state.imageStack = [];
            this.state.isRunning = true;
            this.els.startBtn.classList.add('hidden');
            this.els.stopBtn.classList.remove('hidden');
            this.els.processingOverlay.classList.add('hidden');

            await this.els.audioPlayer.play();
            if (this.state.videoElement && this.state.videoElement.src) {
                this.state.videoElement.play().catch(e => console.error("Video play failed", e));
            }
            this.draw();
        } catch (e) {
            console.error(e);
            this.els.processingOverlay.classList.add('hidden');
            alert("Error: " + e.message);
        }
    }

    stopSequence() {
        this.state.isRunning = false;
        this.state.isRecording = false;
        this.els.audioPlayer.pause();
        this.els.audioPlayer.currentTime = 0;
        if (this.state.videoElement) {
            this.state.videoElement.pause();
            this.state.videoElement.currentTime = 0;
        }
        this.els.ctx.fillStyle = "#000";
        this.els.ctx.fillRect(0, 0, WIDTH, HEIGHT);
        this.els.startBtn.classList.remove('hidden');
        this.els.stopBtn.classList.add('hidden');
        if (this.els.recordBtn) {
            this.els.recordBtn.classList.remove('hidden');
            this.els.tapBtn.classList.add('hidden');
        }
    }
}

// Start App
window.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});