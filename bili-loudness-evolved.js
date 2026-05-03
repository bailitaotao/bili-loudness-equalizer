exports.plugin = {
    name: 'loudness-equalizer-evolved',
    displayName: '视频音量均衡器',
    description: '通过 Web Audio API 压缩 Bilibili 视频中音频的动态范围，使不同视频或同一视频中差距过大的响度保持一致',
    author: 'Timothy Tao & Github Copilot',
    version: '0.2.0',
    setup: () => {
        // ==================== 全局状态 ====================
        const $ = s => document.querySelector(s);
        let audioCtx, sourceNode, compressorNode, gainNode, currentVideo;
        let isEnabled = true;  // 均衡器开关状态

        // ==================== 样式定义 ====================
        // 按钮样式 & 波形跳动动画
        const style = document.createElement('style');
        style.textContent = `
            @keyframes bili-eq-bounce { 50% { transform: scaleY(1.6) } }
            .bili-loudness-btn { color: hsla(0,0%,100%,.8); transition: color .3s; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; margin-right: 8px }
            .bili-loudness-btn:hover { color: #fff }
            .bili-loudness-btn.active { color: #00a1d6 !important }
            .bili-loudness-btn .bar { transform-origin: center bottom; transform-box: fill-box }
            .bili-loudness-btn.animating .bar { animation: bili-eq-bounce .4s ease-in-out }
            .bili-loudness-btn.animating .bar-2 { animation-delay: .1s }
            .bili-loudness-btn.animating .bar-3 { animation-delay: .2s }
        `;
        document.head.appendChild(style); // 修复：原脚本未挂载 style

        // 均衡器图标 SVG (三条波形柱)
        const iconSvg = `<svg viewBox="0 0 22 22" width="22" height="22"><path class="bar bar-1" d="M6 15V7a1 1 0 10-2 0v8a1 1 0 102 0z" fill="currentColor"/><path class="bar bar-2" d="M12 18V4a1 1 0 10-2 0v14a1 1 0 102 0z" fill="currentColor"/><path class="bar bar-3" d="M18 13V9a1 1 0 10-2 0v4a1 1 0 102 0z" fill="currentColor"/></svg>`;

        // ==================== UI 控制 ====================
        /** 更新按钮的激活状态和提示文字 */
        function updateBtnState() {
            const btn = $('.bili-loudness-btn');
            if (btn) {
                btn.classList.toggle('active', isEnabled);
                btn.title = `音量均衡: ${isEnabled ? '开' : '关'}`;
            }
        }

        // ==================== 音频处理 ====================
        /** 
         * 更新音频连接图
         */
        function updateAudioGraph() {
            if (!sourceNode || !audioCtx) return;
            try { sourceNode.disconnect() } catch {}
            try {
                sourceNode.connect(isEnabled ? compressorNode : audioCtx.destination);
            } catch {
                // 连接失败时回退到直通模式
                try { sourceNode.connect(audioCtx.destination) } catch {}
            }
            updateBtnState();
        }

        /** 
         * 初始化 Web Audio API 上下文
         */
        function initAudioContext() {
            if (audioCtx) return;
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            
            // 动态压缩器
            compressorNode = audioCtx.createDynamicsCompressor();
            compressorNode.threshold.value = -50;   // 阈值 -50dB
            compressorNode.knee.value = 40;         // 拐点
            compressorNode.ratio.value = 12;        // 压缩比 12:1
            compressorNode.attack.value = 0;        // 启动时间
            compressorNode.release.value = 0.25;    // 释放时间

            // 增益节点
            gainNode = audioCtx.createGain();
            compressorNode.connect(gainNode).connect(audioCtx.destination);
        }

        // ==================== 播放器集成 ====================
        /** 向控制栏添加均衡器开关按钮 */
        function tryAddControlBtn() {
            if ($('.bili-loudness-btn')) return;
            // 兼容新版 bpx 播放器和旧版播放器
            const rightControl = $('.bpx-player-control-bottom-right, .bilibili-player-video-control-bottom-right');
            if (!rightControl) return;

            const btn = document.createElement('div');
            btn.className = 'bpx-player-ctrl-btn bili-loudness-btn';
            btn.innerHTML = iconSvg;
            btn.onclick = () => {
                isEnabled = !isEnabled;
                updateAudioGraph();
                // 触发波形跳动动画
                btn.classList.remove('animating');
                void btn.offsetWidth;  // 强制重绘
                btn.classList.add('animating');
            };

            // 插入到音量按钮前面
            const anchor = rightControl.querySelector('.bpx-player-ctrl-volume, .bilibili-player-video-btn-volume');
            anchor ? rightControl.insertBefore(btn, anchor) : rightControl.appendChild(btn);
            updateBtnState();
        }

        // ==================== 视频处理 ====================
        /** 捕获视频元素并接入音频处理链 */
        function processVideo(video) {
            if (currentVideo === video) return;
            try { sourceNode?.disconnect() } catch {}
            currentVideo = video;
            initAudioContext();

            const setupNode = () => {
                try {
                    sourceNode = audioCtx.createMediaElementSource(video);
                    updateAudioGraph();
                } catch (e) {
                    console.error('Loudness Equalizer: failed to create source -', e);
                }
            };

            video.readyState >= 1 ? setupNode() : video.addEventListener('loadedmetadata', setupNode, { once: true });

            const resume = () => audioCtx?.state === 'suspended' && audioCtx.resume();
            video.addEventListener('play', resume);
            video.addEventListener('playing', resume);
        }

        // ==================== DOM 监听 ====================
        const observer = new MutationObserver(() => {
            tryAddControlBtn();
            const video = $('video');
            if (video) processVideo(video);
        });
        
        // 修复：原脚本定义了 observer 但并未启动监听
        observer.observe(document.body, { childList: true, subtree: true });
    }
};
