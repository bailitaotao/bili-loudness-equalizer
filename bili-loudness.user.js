// ==UserScript==
// @name         Bilibili 视频音量均衡器
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  通过 Web Audio API 压缩 Bilibili 视频中音频的动态范围，使不同视频或同一视频中差距过大的响度保持一致
// @author       Timothy Tao & Github Copilot
// @match        *://www.bilibili.com/video/*
// @match        *://www.bilibili.com/bangumi/play/*
// @match        *://live.bilibili.com/*
// @match        *://www.bilibili.com/list/*
// @icon         https://www.bilibili.com/favicon.ico
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    console.log('[Bilibili Loudness Equalizer] Script started.');

    let audioCtx;
    let sourceNode;
    let compressorNode;
    let gainNode;
    let currentVideoElement = null;
    let isEnabled = true; // 默认开启

    // 添加样式
    function addStyles() {
        const style = document.createElement('style');
        style.textContent = `
            @keyframes bili-eq-bounce {
                0% { transform: scaleY(1); }
                50% { transform: scaleY(1.6); }
                100% { transform: scaleY(1); }
            }
            .bili-loudness-btn {
                color: hsla(0,0%,100%,.8); /* Bilibili 默认图标颜色 */
                transition: color 0.3s;
            }
            .bili-loudness-btn:hover {
                color: #fff;
            }
            .bili-loudness-btn.active {
                color: #00a1d6 !important; /* 开启时蓝色 */
            }
            .bili-loudness-btn svg {
                fill: currentColor; /* 跟随文字颜色 */
            }
            .bili-loudness-btn .bar {
                transform-origin: center bottom; /* 底部对齐缩放 */
                transform-box: fill-box; /* 确保变换基于路径自身 */
            }
            .bili-loudness-btn.animating .bar {
                animation: bili-eq-bounce 0.4s ease-in-out;
            }
            .bili-loudness-btn.animating .bar-1 { animation-delay: 0s; }
            .bili-loudness-btn.animating .bar-2 { animation-delay: 0.1s; }
            .bili-loudness-btn.animating .bar-3 { animation-delay: 0.2s; }
        `;
        document.head.appendChild(style);
    }

    // 图标 SVG (分离的波形图)
    const iconSvg = `
        <svg viewBox="0 0 22 22" width="22" height="22" xmlns="http://www.w3.org/2000/svg">
            <path class="bar bar-1" d="M6 15V7C6 6.44772 5.55228 6 5 6C4.44772 6 4 6.44772 4 7V15C4 15.5523 4.44772 16 5 16C5.55228 16 6 15.5523 6 15Z" fill="currentColor"/>
            <path class="bar bar-2" d="M12 18V4C12 3.44772 11.5523 3 11 3C10.4477 3 10 3.44772 10 4V18C10 18.5523 10.4477 19 11 19C11.5523 19 12 18.5523 12 18Z" fill="currentColor"/>
            <path class="bar bar-3" d="M18 13V9C18 8.44772 17.5523 8 17 8C16.4477 8 16 8.44772 16 9V13C16 13.5523 16.4477 14 17 14C17.5523 14 18 13.5523 18 13Z" fill="currentColor"/>
        </svg>
    `;

    // 尝试添加控制按钮到播放器控制栏
    function tryAddControlBtn() {
        // 如果按钮已存在，直接返回
        if (document.querySelector('.bili-loudness-btn')) return;

        // 查找控制栏右侧容器 (兼容新旧版播放器)
        const rightControl = document.querySelector('.bpx-player-control-bottom-right') || 
                             document.querySelector('.bilibili-player-video-control-bottom-right');
        
        if (rightControl) {
            const btn = document.createElement('div');
            btn.className = 'bpx-player-ctrl-btn bili-loudness-btn';
            btn.style.cssText = 'display: inline-flex; align-items: center; justify-content: center; cursor: pointer; margin-right: 8px;';
            btn.innerHTML = iconSvg;
            
            // 添加提示 (Tooltip)
            btn.setAttribute('aria-label', '音量均衡');
            btn.title = isEnabled ? '音量均衡: 开' : '音量均衡: 关';

            btn.onclick = () => {
                isEnabled = !isEnabled;
                updateBtnState(btn);
                updateAudioGraph();
                
                // 触发动画
                btn.classList.remove('animating');
                void btn.offsetWidth; // 触发重绘
                btn.classList.add('animating');
            };

            // 插入位置：优先放在音量前面，否则直接追加到末尾
            const anchor = rightControl.querySelector('.bpx-player-ctrl-volume') || 
                           rightControl.querySelector('.bilibili-player-video-btn-volume');
            
            if (anchor) {
                rightControl.insertBefore(btn, anchor);
            } else {
                rightControl.appendChild(btn);
            }
            
            updateBtnState(btn);
            console.log('[Bilibili Loudness Equalizer] Control button added.');
        }
    }

    // 更新按钮状态 (颜色/提示)
    function updateBtnState(btnElement) {
        const btn = btnElement || document.querySelector('.bili-loudness-btn');
        if (!btn) return;

        if (isEnabled) {
            btn.classList.add('active');
            btn.title = '音量均衡: 开';
        } else {
            btn.classList.remove('active');
            btn.title = '音量均衡: 关';
        }
    }

    // 更新音频连接图
    function updateAudioGraph() {
        if (!sourceNode || !audioCtx) return;

        try {
            // 先断开所有连接
            sourceNode.disconnect();
        } catch (e) {
            // 忽略断开连接时的错误
        }

        if (isEnabled) {
            // 开启模式：Source -> Compressor -> Gain -> Destination
            // Compressor -> Gain -> Destination 已经在 initAudioContext 中连接好了
            // 这里只需要连接 Source -> Compressor
            sourceNode.connect(compressorNode);
            console.log('[Bilibili Loudness Equalizer] Enabled: Source -> Compressor');
        } else {
            // 关闭模式：Source -> Destination (直通)
            sourceNode.connect(audioCtx.destination);
            console.log('[Bilibili Loudness Equalizer] Disabled: Source -> Destination');
        }
        
        // 确保按钮状态同步
        updateBtnState();
    }

    // 初始化 AudioContext
    function initAudioContext() {
        if (!audioCtx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            audioCtx = new AudioContext();
            
            // 创建压缩器节点 (DynamicsCompressorNode)
            // 作用：降低大音量的部分，保留小音量的部分，从而减小动态范围
            compressorNode = audioCtx.createDynamicsCompressor();
            compressorNode.threshold.setValueAtTime(-50, audioCtx.currentTime); // 阈值：超过 -50dB 开始压缩
            compressorNode.knee.setValueAtTime(40, audioCtx.currentTime);       // 拐点：平滑过渡
            compressorNode.ratio.setValueAtTime(12, audioCtx.currentTime);      // 比率：压缩比 12:1
            compressorNode.attack.setValueAtTime(0, audioCtx.currentTime);      // 启动时间：立即响应
            compressorNode.release.setValueAtTime(0.25, audioCtx.currentTime);  // 释放时间

            // 创建增益节点 (GainNode)
            // 作用：因为压缩器降低了整体音量，需要用增益把音量补回来 (Makeup Gain)
            gainNode = audioCtx.createGain();
            gainNode.gain.setValueAtTime(1.0, audioCtx.currentTime); // 初始增益，可以根据需要调整，例如 2.0 或 3.0

            // 连接处理链: Compressor -> Gain -> Destination (扬声器)
            compressorNode.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            
            console.log('[Bilibili Loudness Equalizer] AudioContext initialized.');
        }
    }

    // 处理视频元素
    function processVideoElement(video) {
        if (currentVideoElement === video) return; // 已经处理过该元素
        
        // 如果之前有连接其他视频，先断开（虽然 Bilibili 通常是销毁旧的 video 标签）
        if (sourceNode) {
            try {
                sourceNode.disconnect();
            } catch (e) {
                console.warn('[Bilibili Loudness Equalizer] Failed to disconnect old source:', e);
            }
        }

        currentVideoElement = video;
        console.log('[Bilibili Loudness Equalizer] New video element detected:', video);

        // 确保 video 允许跨域音频数据 (Web Audio API 需要)
        // 注意：修改 crossOrigin 可能会导致视频重新加载，但在 Bilibili 上通常流媒体已经支持
        if (!video.crossOrigin) {
            video.crossOrigin = "anonymous";
        }

        initAudioContext();

        try {
            // 创建媒体源节点
            sourceNode = audioCtx.createMediaElementSource(video);
            // 根据当前状态连接
            updateAudioGraph();
        } catch (err) {
            // 有时如果 video 已经被其他节点连接过，再次 createMediaElementSource 会报错
            console.error('[Bilibili Loudness Equalizer] Error connecting audio source:', err);
        }

        // 监听播放事件以恢复 AudioContext (浏览器通常禁止自动播放音频上下文)
        video.addEventListener('play', () => {
            if (audioCtx.state === 'suspended') {
                audioCtx.resume().then(() => {
                    console.log('[Bilibili Loudness Equalizer] AudioContext resumed.');
                });
            }
        });
    }

    // 观察 DOM 变化，查找 <video> 标签
    const observer = new MutationObserver((mutations) => {
        // 每次 DOM 变化都尝试添加按钮 (因为播放器可能会重绘)
        tryAddControlBtn();

        for (const mutation of mutations) {
            if (mutation.addedNodes.length) {
                // 检查新增节点是否是 video
                for (const node of mutation.addedNodes) {
                    if (node.nodeName === 'VIDEO') {
                        processVideoElement(node);
                        return;
                    }
                    // 检查新增节点的子节点是否有 video (例如容器被替换)
                    if (node.querySelectorAll) {
                        const video = node.querySelector('video');
                        if (video) {
                            processVideoElement(video);
                            return;
                        }
                    }
                }
            }
        }
    });

    // 开始观察
    function startObserving() {
        const target = document.body; // 监听整个 body，因为 Bilibili 是 SPA
        observer.observe(target, {
            childList: true,
            subtree: true
        });

        // 检查页面上是否已经存在的 video
        const existingVideo = document.querySelector('video');
        if (existingVideo) {
            processVideoElement(existingVideo);
        }
        
        // 尝试添加按钮
        tryAddControlBtn();
    }

    // 页面加载完成后启动
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            addStyles();
            startObserving();
        });
    } else {
        addStyles();
        startObserving();
    }

})();
