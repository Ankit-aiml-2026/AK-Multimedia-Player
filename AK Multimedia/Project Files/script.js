document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const folderInput = document.getElementById('folder-input');
    const audioModeBtn = document.getElementById('audio-mode-btn');
    const videoModeBtn = document.getElementById('video-mode-btn');
    const playlistUl = document.getElementById('playlist-ul');
    const playlistCount = document.getElementById('playlist-count');
    const searchInput = document.getElementById('search-input');
    
    const visualizer = document.getElementById('visualizer');
    const videoContainer = document.getElementById('video-container');
    const videoPlayer = document.getElementById('video-player');
    const fullscreenBtn = document.getElementById('fullscreen-btn');
    const nowPlayingTitle = document.getElementById('now-playing-title');
    const mediaSpinIcon = document.getElementById('media-spin-icon');
    
    const skipBackBtn = document.getElementById('skip-back-btn');
    const skipForwardBtn = document.getElementById('skip-forward-btn');
    const skipDurationSelect = document.getElementById('skip-duration-select');
    
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const closePlaylistBtn = document.getElementById('close-playlist-btn');
    const playlistPanel = document.getElementById('playlist-panel');

    const playPauseBtn = document.getElementById('play-pause-btn');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const progressBar = document.getElementById('progress-bar');
    const progressFill = document.getElementById('progress-fill');
    const currentTimeEl = document.getElementById('current-time');
    const totalTimeEl = document.getElementById('total-time');
    
    // Video specific controls
    const videoControls = document.getElementById('video-controls');
    const vcPlayPause = document.getElementById('vc-play-pause');
    const vcPrev = document.getElementById('vc-prev');
    const vcNext = document.getElementById('vc-next');
    const vcCurrentTime = document.getElementById('vc-current-time');
    const vcTotalTime = document.getElementById('vc-total-time');
    const vcProgress = document.getElementById('vc-progress');
    const vcProgressFill = document.getElementById('vc-progress-fill');
    const vcSpeedSelect = document.getElementById('vc-speed-select');
    const vcMute = document.getElementById('vc-mute');
    const vcVolumeBar = document.getElementById('vc-volume-bar');
    const vcVolumeIcon = document.getElementById('vc-volume-icon');
    const vcCloseFs = document.getElementById('vc-close-fs');
    const vcSkipBtns = document.querySelectorAll('.vc-skip-btn');
    
    const volumeBar = document.getElementById('volume-bar');
    const speedSelect = document.getElementById('speed-select');
    const audioSpecificControls = document.getElementById('audio-specific-controls');
    
    const eqBass = document.getElementById('eq-bass');
    const eqMid = document.getElementById('eq-mid');
    const eqTreble = document.getElementById('eq-treble');
    const reverbMix = document.getElementById('reverb-mix');
    const resetAudioBtn = document.getElementById('reset-audio-btn');

    // State
    let audioFiles = [];
    let videoFiles = [];
    let currentMode = 'audio';
    let currentIndex = -1;
    let currentFilteredFiles = [];

    // Separate persistent states for Audio/Video modes
    let currentAudioIndex = -1;
    let currentVideoIndex = -1;
    let audioSearchQuery = '';
    let videoSearchQuery = '';
    let currentAudioFolderHandle = null;
    let currentVideoFolderHandle = null;
    
    // Audio Context Setup
    let audioCtx, source, analyser, bassNode, midNode, trebleNode, convolver, dryGain, wetGain;
    let audioPlayer = new Audio();
    audioPlayer.crossOrigin = "anonymous";
    let isAudioCtxInitialized = false;

    // =========================================================================
    // PERSISTENCE & FILE SYSTEM ACCESS API SERVICES
    // =========================================================================
    const DB_NAME = 'AKPlayerDB';
    const STORE_NAME = 'folderHandles';

    function openDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, 1);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME);
                }
            };
            request.onsuccess = (e) => resolve(e.target.result);
            request.onerror = (e) => reject(e.target.error);
        });
    }

    async function saveHandleToDB(key, handle) {
        try {
            const db = await openDatabase();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, 'readwrite');
                const store = tx.objectStore(STORE_NAME);
                store.put(handle, key);
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });
        } catch (err) {
            console.error('Failed to save handle to DB:', err);
        }
    }

    async function getHandleFromDB(key) {
        try {
            const db = await openDatabase();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, 'readonly');
                const store = tx.objectStore(STORE_NAME);
                const request = store.get(key);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        } catch (err) {
            console.error('Failed to get handle from DB:', err);
            return null;
        }
    }

    async function verifyPermission(fileHandle, readWrite) {
        const options = {};
        if (readWrite) {
            options.mode = 'readwrite';
        }
        if ((await fileHandle.queryPermission(options)) === 'granted') {
            return true;
        }
        if ((await fileHandle.requestPermission(options)) === 'granted') {
            return true;
        }
        return false;
    }

    async function getFilesFromDirectory(dirHandle) {
        const files = [];
        async function read(handle) {
            for await (const entry of handle.values()) {
                if (entry.kind === 'file') {
                    const file = await entry.getFile();
                    files.push(file);
                } else if (entry.kind === 'directory') {
                    await read(entry);
                }
            }
        }
        await read(dirHandle);
        return files;
    }

    async function loadFilesFromHandle(handle, mode) {
        try {
            const hasPermission = await verifyPermission(handle, false);
            if (!hasPermission) {
                console.log("Permission denied for folder handle");
                return;
            }

            const files = await getFilesFromDirectory(handle);
            const audioExt = ['mp3', 'wav', 'ogg', 'm4a'];
            const videoExt = ['mp4', 'webm', 'mkv'];
            
            const modeFiles = [];
            files.forEach(file => {
                const ext = file.name.split('.').pop().toLowerCase();
                if (mode === 'audio' && audioExt.includes(ext)) {
                    modeFiles.push(file);
                } else if (mode === 'video' && videoExt.includes(ext)) {
                    modeFiles.push(file);
                }
            });

            const collator = new Intl.Collator(undefined, {numeric: true, sensitivity: 'base'});
            modeFiles.sort((a, b) => collator.compare(a.name, b.name));

            if (mode === 'audio') {
                audioFiles = modeFiles;
                currentAudioFolderHandle = handle;
                currentAudioIndex = -1;
                await saveHandleToDB('audio', handle);
                if (currentMode === 'audio') {
                    currentIndex = -1;
                    searchInput.value = '';
                    renderPlaylist();
                }
            } else {
                videoFiles = modeFiles;
                currentVideoFolderHandle = handle;
                currentVideoIndex = -1;
                await saveHandleToDB('video', handle);
                if (currentMode === 'video') {
                    currentIndex = -1;
                    searchInput.value = '';
                    renderPlaylist();
                }
            }
        } catch (err) {
            console.error("Error loading files from handle:", err);
        }
    }

    // Intercept label click if Directory Picker is supported
    const selectFolderLabel = document.querySelector('.custom-file-upload');
    if (window.showDirectoryPicker && selectFolderLabel) {
        selectFolderLabel.addEventListener('click', async (e) => {
            e.preventDefault(); // Stop standard file selector
            try {
                const handle = await window.showDirectoryPicker();
                await loadFilesFromHandle(handle, currentMode);
            } catch (err) {
                console.error("Directory picker cancelled or failed:", err);
            }
        });
    }

    function syncPlayerUI() {
        const player = getActivePlayer();
        
        // Update Now Playing Title
        if (currentMode === 'audio') {
            if (currentIndex >= 0 && currentIndex < currentFilteredFiles.length) {
                nowPlayingTitle.innerText = currentFilteredFiles[currentIndex].name;
            } else {
                nowPlayingTitle.innerText = "Ready to Play";
            }
        } else {
            if (currentIndex >= 0 && currentIndex < currentFilteredFiles.length) {
                nowPlayingTitle.innerText = currentFilteredFiles[currentIndex].name;
            } else {
                nowPlayingTitle.innerText = "Ready to Play";
            }
        }
        
        // Update Play/Pause Button Icon
        updatePlayPauseIcon();
        
        // Update Progress UI
        currentTimeEl.innerText = formatTime(player.currentTime);
        if (!isNaN(player.duration) && isFinite(player.duration)) {
            totalTimeEl.innerText = formatTime(player.duration);
            const percent = (player.currentTime / player.duration) * 100;
            progressBar.value = percent;
            progressFill.style.width = `${percent}%`;
            
            // Video-specific controls if in video mode
            if (currentMode === 'video' && vcProgress) {
                vcProgress.value = percent;
                if (vcProgressFill) vcProgressFill.style.width = `${percent}%`;
                if (vcCurrentTime) vcCurrentTime.innerText = formatTime(player.currentTime);
                if (vcTotalTime) vcTotalTime.innerText = formatTime(player.duration);
            }
        } else {
            totalTimeEl.innerText = "0:00";
            progressBar.value = 0;
            progressFill.style.width = "0%";
            if (currentMode === 'video' && vcProgress) {
                vcProgress.value = 0;
                if (vcProgressFill) vcProgressFill.style.width = "0%";
                if (vcCurrentTime) vcCurrentTime.innerText = "0:00";
                if (vcTotalTime) vcTotalTime.innerText = "0:00";
            }
        }
        
        // Sync Volume Bar and Speed Select
        volumeBar.value = player.volume * 100;
        const volIcon = document.getElementById('volume-icon');
        if (player.volume === 0) volIcon.className = 'fas fa-volume-xmark';
        else if (player.volume < 0.5) volIcon.className = 'fas fa-volume-low';
        else volIcon.className = 'fas fa-volume-high';
        
        if (currentMode === 'video') {
            if (vcVolumeBar) vcVolumeBar.value = player.volume * 100;
            if (vcVolumeIcon) {
                if (player.volume === 0) vcVolumeIcon.className = 'fas fa-volume-xmark';
                else if (player.volume < 0.5) vcVolumeIcon.className = 'fas fa-volume-low';
                else vcVolumeIcon.className = 'fas fa-volume-high';
            }
            if (vcSpeedSelect) vcSpeedSelect.value = player.playbackRate;
        }
        
        speedSelect.value = player.playbackRate;
    }

    // Helper: Initialize Web Audio API
    function initAudioContext() {
        if (isAudioCtxInitialized) return;
        
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        
        bassNode = audioCtx.createBiquadFilter();
        bassNode.type = 'lowshelf';
        bassNode.frequency.value = 250;
        
        midNode = audioCtx.createBiquadFilter();
        midNode.type = 'peaking';
        midNode.frequency.value = 1000;
        midNode.Q.value = 1;
        
        trebleNode = audioCtx.createBiquadFilter();
        trebleNode.type = 'highshelf';
        trebleNode.frequency.value = 4000;
        
        convolver = audioCtx.createConvolver();
        dryGain = audioCtx.createGain();
        wetGain = audioCtx.createGain();
        
        dryGain.gain.value = 1;
        wetGain.gain.value = 0;
        
        source = audioCtx.createMediaElementSource(audioPlayer);
        
        source.connect(bassNode);
        bassNode.connect(midNode);
        midNode.connect(trebleNode);
        
        trebleNode.connect(dryGain);
        trebleNode.connect(convolver);
        convolver.connect(wetGain);
        
        dryGain.connect(analyser);
        wetGain.connect(analyser);
        analyser.connect(audioCtx.destination);
        
        generateImpulseResponse(); 
        
        isAudioCtxInitialized = true;
        drawVisualizer();
    }
    
    function generateImpulseResponse() {
        if(!audioCtx) return;
        const rate = audioCtx.sampleRate;
        const length = rate * 2.5; // 2.5s reverb tail
        const impulse = audioCtx.createBuffer(2, length, rate);
        const left = impulse.getChannelData(0);
        const right = impulse.getChannelData(1);
        for (let i = 0; i < length; i++) {
            const decay = Math.pow(1 - i / length, 3); // smoother decay
            left[i] = (Math.random() * 2 - 1) * decay;
            right[i] = (Math.random() * 2 - 1) * decay;
        }
        convolver.buffer = impulse;
    }

    // Canvas Visualizer
    const canvasCtx = visualizer.getContext('2d');
    function drawVisualizer() {
        requestAnimationFrame(drawVisualizer);
        if(!isAudioCtxInitialized) return;
        
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(dataArray);
        
        canvasCtx.clearRect(0, 0, visualizer.width, visualizer.height);
        
        const barWidth = (visualizer.width / bufferLength) * 2.5;
        let barHeight;
        let x = 0;
        
        for(let i = 0; i < bufferLength; i++) {
            barHeight = dataArray[i] * 1.5;
            
            const r = barHeight + (25 * (i/bufferLength));
            const g = 229 * (i/bufferLength);
            const b = 255;
            
            // Create gradient
            const grad = canvasCtx.createLinearGradient(0, visualizer.height, 0, visualizer.height - barHeight);
            grad.addColorStop(0, `rgba(${r},${g},${b},0.2)`);
            grad.addColorStop(1, `rgba(${r},${g},${b},0.8)`);
            
            canvasCtx.fillStyle = grad;
            
            // Draw with rounded top
            canvasCtx.beginPath();
            canvasCtx.roundRect(x, visualizer.height - barHeight, barWidth - 1, barHeight, [5, 5, 0, 0]);
            canvasCtx.fill();
            
            x += barWidth;
        }
    }
    
    function resizeCanvas() {
        visualizer.width = visualizer.clientWidth;
        visualizer.height = visualizer.clientHeight;
    }
    window.addEventListener('resize', resizeCanvas);
    // Initial resize after a short delay to ensure layout is complete
    setTimeout(resizeCanvas, 100);

    // Mode Switching
    audioModeBtn.addEventListener('click', () => setMode('audio'));
    videoModeBtn.addEventListener('click', () => setMode('video'));
    
    function setMode(mode) {
        if (mode === currentMode) return;
        
        // Save current mode's playlist index and search query
        if (currentMode === 'audio') {
            currentAudioIndex = currentIndex;
            audioSearchQuery = searchInput.value;
        } else {
            currentVideoIndex = currentIndex;
            videoSearchQuery = searchInput.value;
        }
        
        currentMode = mode;
        audioModeBtn.classList.toggle('active', mode === 'audio');
        videoModeBtn.classList.toggle('active', mode === 'video');
        
        if (mode === 'audio') {
            videoContainer.classList.add('hidden');
            visualizer.classList.remove('hidden');
            audioSpecificControls.classList.remove('hidden');
            if(!videoPlayer.paused) videoPlayer.pause();
            setTimeout(resizeCanvas, 10);
        } else {
            videoContainer.classList.remove('hidden');
            visualizer.classList.add('hidden');
            audioSpecificControls.classList.add('hidden');
            if(!audioPlayer.paused) audioPlayer.pause();
        }
        
        // Restore target mode's playlist index and search query
        if (mode === 'audio') {
            currentIndex = currentAudioIndex;
            searchInput.value = audioSearchQuery;
        } else {
            currentIndex = currentVideoIndex;
            searchInput.value = videoSearchQuery;
        }
        
        renderPlaylist(searchInput.value);
        syncPlayerUI();
    }

    // Fullscreen for video
    videoContainer.addEventListener('dblclick', (e) => {
        if (e.target.closest('.video-controls')) return;
        
        const rect = videoContainer.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const width = rect.width;
        const pct = clickX / width;
        if (pct < 0.35 || pct > 0.65) {
            return;
        }

        const isFS = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
        if (!isFS) {
            if (videoContainer.requestFullscreen) {
                videoContainer.requestFullscreen();
            } else if (videoContainer.webkitRequestFullscreen) { /* Safari */
                videoContainer.webkitRequestFullscreen();
            } else if (videoContainer.msRequestFullscreen) { /* IE11 */
                videoContainer.msRequestFullscreen();
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) { /* Safari */
                document.webkitExitFullscreen();
            } else if (document.msExitFullscreen) { /* IE11 */
                document.msExitFullscreen();
            }
        }
    });

    // Fullscreen for video via button
    if (fullscreenBtn) {
        fullscreenBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // prevent dblclick from interfering if clicked fast
            const isFS = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
            if (!isFS) {
                if (videoContainer.requestFullscreen) {
                    videoContainer.requestFullscreen();
                } else if (videoContainer.webkitRequestFullscreen) {
                    videoContainer.webkitRequestFullscreen();
                } else if (videoContainer.msRequestFullscreen) {
                    videoContainer.msRequestFullscreen();
                }
            } else {
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                } else if (document.webkitExitFullscreen) {
                    document.webkitExitFullscreen();
                } else if (document.msExitFullscreen) {
                    document.msExitFullscreen();
                }
            }
        });
    }

    // Fullscreen close mock button
    if(vcCloseFs) {
        vcCloseFs.addEventListener('click', () => {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            }
        });
    }

    const onFullscreenChange = () => {
        const isFS = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
        if (isFS) {
            if (vcCloseFs) vcCloseFs.classList.remove('hidden');
            videoContainer.classList.add('fullscreen-active');
        } else {
            if (vcCloseFs) vcCloseFs.classList.add('hidden');
            videoContainer.classList.remove('fullscreen-active');
        }
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
    document.addEventListener('mozfullscreenchange', onFullscreenChange);
    document.addEventListener('MSFullscreenChange', onFullscreenChange);

    // Video Controls Auto-hide logic
    let hideControlsTimeout;
    function showVideoControls() {
        if (!videoControls) return;
        videoControls.classList.remove('idle');
        clearTimeout(hideControlsTimeout);
        hideControlsTimeout = setTimeout(() => {
            videoControls.classList.add('idle');
        }, 3000);
    }
    
    if (videoContainer) {
        videoContainer.addEventListener('mousemove', showVideoControls);
        videoContainer.addEventListener('click', showVideoControls);
        videoContainer.addEventListener('touchstart', showVideoControls);
    }

    // =========================================================================
    // TOUCH & MOUSE GESTURE SEEKING SYSTEM
    // =========================================================================
    function seekGestureTime(direction) {
        const player = getActivePlayer();
        if(!player.src || !isFinite(player.duration)) return;
        let newTime = player.currentTime + direction;
        if (newTime < 0) newTime = 0;
        if (newTime > player.duration) newTime = player.duration;
        player.currentTime = newTime;
    }

    function showGestureRipple(element, side) {
        const parent = element.parentElement;
        let overlay = parent.querySelector('.gesture-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'gesture-overlay';
            parent.appendChild(overlay);
        }
        
        overlay.className = 'gesture-overlay';
        void overlay.offsetWidth; // Force CSS repaint
        
        if (side === 'left') {
            overlay.classList.add('active-left');
            overlay.innerHTML = '<div class="gesture-icon"><i class="fas fa-backward"></i><span>-10s</span></div>';
        } else if (side === 'right') {
            overlay.classList.add('active-right');
            overlay.innerHTML = '<div class="gesture-icon"><i class="fas fa-forward"></i><span>+10s</span></div>';
        } else if (side === 'center') {
            overlay.classList.add('active-center');
            const isPaused = getActivePlayer().paused;
            overlay.innerHTML = `<div class="gesture-icon"><i class="fas fa-${isPaused ? 'play' : 'pause'}"></i></div>`;
        }
        
        setTimeout(() => {
            overlay.classList.remove('active-left', 'active-right', 'active-center');
        }, 600);
    }

    function handleGestureClick(e, element) {
        // Stop if user clicks control elements
        if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select') || e.target.closest('.video-controls')) {
            return;
        }
        
        const rect = element.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const width = rect.width;
        const pct = clickX / width;
        
        if (pct < 0.35) {
            seekGestureTime(-10);
            showGestureRipple(element, 'left');
            if (currentMode === 'video') showVideoControls();
        } else if (pct > 0.65) {
            seekGestureTime(10);
            showGestureRipple(element, 'right');
            if (currentMode === 'video') showVideoControls();
        } else {
            playPauseBtn.click();
            showGestureRipple(element, 'center');
            if (currentMode === 'video') showVideoControls();
        }
    }

    if (videoPlayer) {
        videoPlayer.addEventListener('click', (e) => handleGestureClick(e, videoPlayer));
    }
    if (visualizer) {
        visualizer.addEventListener('click', (e) => handleGestureClick(e, visualizer));
    }

    // Video Controls Hooks
    if (vcPlayPause) vcPlayPause.addEventListener('click', () => playPauseBtn.click());
    if (vcPrev) vcPrev.addEventListener('click', () => prevBtn.click());
    if (vcNext) vcNext.addEventListener('click', () => nextBtn.click());
    
    if (vcProgress) {
        vcProgress.addEventListener('input', (e) => {
            const player = getActivePlayer();
            if(!player.duration) return;
            player.currentTime = (e.target.value / 100) * player.duration;
            showVideoControls();
        });
    }

    vcSkipBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const skipVal = parseInt(btn.getAttribute('data-skip'), 10);
            const player = getActivePlayer();
            if(!player.src || !isFinite(player.duration)) return;
            let newTime = player.currentTime + skipVal;
            if (newTime < 0) newTime = 0;
            if (newTime > player.duration) newTime = player.duration;
            player.currentTime = newTime;
            showVideoControls();
        });
    });

    if (vcSpeedSelect) {
        vcSpeedSelect.addEventListener('change', (e) => {
            const speed = e.target.value;
            speedSelect.value = speed;
            audioPlayer.playbackRate = speed;
            videoPlayer.playbackRate = speed;
        });
    }

    if (vcVolumeBar) {
        vcVolumeBar.addEventListener('input', (e) => {
            const vol = e.target.value / 100;
            audioPlayer.volume = vol;
            videoPlayer.volume = vol;
            volumeBar.value = e.target.value;
            if(vol === 0) vcVolumeIcon.className = 'fas fa-volume-xmark';
            else if(vol < 0.5) vcVolumeIcon.className = 'fas fa-volume-low';
            else vcVolumeIcon.className = 'fas fa-volume-high';
        });
    }

    if (vcMute) {
        vcMute.addEventListener('click', () => {
            const vol = videoPlayer.volume > 0 ? 0 : (volumeBar.value / 100) || 1;
            audioPlayer.volume = vol;
            videoPlayer.volume = vol;
            vcVolumeBar.value = vol * 100;
            volumeBar.value = vol * 100;
            if(vol === 0) vcVolumeIcon.className = 'fas fa-volume-xmark';
            else if(vol < 0.5) vcVolumeIcon.className = 'fas fa-volume-low';
            else vcVolumeIcon.className = 'fas fa-volume-high';
        });
    }

    // File Processing
    folderInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;
        
        const audioExt = ['mp3', 'wav', 'ogg', 'm4a'];
        const videoExt = ['mp4', 'webm', 'mkv'];
        
        const collator = new Intl.Collator(undefined, {numeric: true, sensitivity: 'base'});
        
        if (currentMode === 'audio') {
            const newAudio = [];
            files.forEach(file => {
                const ext = file.name.split('.').pop().toLowerCase();
                if (audioExt.includes(ext)) {
                    newAudio.push(file);
                }
            });
            
            if (newAudio.length > 0) {
                audioFiles = newAudio;
                audioFiles.sort((a,b) => collator.compare(a.name, b.name));
                currentAudioIndex = -1;
                currentIndex = -1;
                audioSearchQuery = '';
                searchInput.value = '';
                currentAudioFolderHandle = null; // standard file selector resets folder handle
                renderPlaylist();
            } else {
                alert("No audio files found in the selected folder.");
            }
        } else {
            const newVideo = [];
            files.forEach(file => {
                const ext = file.name.split('.').pop().toLowerCase();
                if (videoExt.includes(ext)) {
                    newVideo.push(file);
                }
            });
            
            if (newVideo.length > 0) {
                videoFiles = newVideo;
                videoFiles.sort((a,b) => collator.compare(a.name, b.name));
                currentVideoIndex = -1;
                currentIndex = -1;
                videoSearchQuery = '';
                searchInput.value = '';
                currentVideoFolderHandle = null; // standard file selector resets folder handle
                renderPlaylist();
            } else {
                alert("No video files found in the selected folder.");
            }
        }
    });

    // Render Playlist
    function renderPlaylist(filter = '') {
        playlistUl.innerHTML = '';
        const list = currentMode === 'audio' ? audioFiles : videoFiles;
        
        currentFilteredFiles = list.filter(f => f.name.toLowerCase().includes(filter.toLowerCase()));
        playlistCount.innerText = currentFilteredFiles.length;
        
        if (currentFilteredFiles.length === 0) {
            const hasSavedHandle = currentMode === 'audio' ? currentAudioFolderHandle : currentVideoFolderHandle;
            if (hasSavedHandle) {
                playlistUl.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-folder-open empty-icon"></i>
                        <p>Library Locked</p>
                        <span>Restore access to your previously selected ${currentMode} library.</span>
                        <button id="restore-folder-btn" class="custom-file-upload" style="margin-top: 15px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; border: none; padding: 10px 20px; border-radius: 20px; font-weight: 500;">
                            <i class="fas fa-key"></i> Restore Access
                        </button>
                    </div>
                `;
                const restoreBtn = document.getElementById('restore-folder-btn');
                if (restoreBtn) {
                    restoreBtn.addEventListener('click', async () => {
                        try {
                            await loadFilesFromHandle(hasSavedHandle, currentMode);
                        } catch (err) {
                            console.error("Failed to restore folder:", err);
                            alert("Permission denied or failed to load folder.");
                        }
                    });
                }
            } else {
                playlistUl.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-folder-open empty-icon"></i>
                        <p>No media found</p>
                        <span>Select a folder to load files</span>
                    </div>
                `;
            }
            return;
        }
        
        currentFilteredFiles.forEach((file, index) => {
            const li = document.createElement('li');
            li.innerHTML = `<i class="fas fa-${currentMode === 'audio' ? 'music' : 'video'}"></i>  ${file.name}`;
            if(index === currentIndex) li.classList.add('active');
            
            li.addEventListener('click', () => {
                playMedia(index);
                playlistPanel.classList.remove('open');
            });
            playlistUl.appendChild(li);
        });
    }

    searchInput.addEventListener('input', (e) => {
        renderPlaylist(e.target.value);
    });

    // Playback Logic
    function getActivePlayer() {
        return currentMode === 'audio' ? audioPlayer : videoPlayer;
    }

    function playMedia(index) {
        if(currentFilteredFiles.length === 0 || index < 0 || index >= currentFilteredFiles.length) return;
        currentIndex = index;
        
        if (currentMode === 'audio') {
            currentAudioIndex = index;
        } else {
            currentVideoIndex = index;
        }
        
        const file = currentFilteredFiles[index];
        
        const player = getActivePlayer();
        if(player.src) URL.revokeObjectURL(player.src);
        
        const objectUrl = URL.createObjectURL(file);
        player.src = objectUrl;
        nowPlayingTitle.innerText = file.name;
        
        if(currentMode === 'audio' && !isAudioCtxInitialized) {
            initAudioContext();
        }
        
        player.play().then(() => {
            if(audioCtx && audioCtx.state === 'suspended') {
                audioCtx.resume();
            }
            updatePlayPauseIcon();
        }).catch(err => console.error('Playback error:', err));
        
        renderPlaylist(searchInput.value); 
    }

    // Controls
    playPauseBtn.addEventListener('click', () => {
        const player = getActivePlayer();
        if(!player.src) {
            if(currentFilteredFiles.length > 0) playMedia(0);
            return;
        }
        if(player.paused) {
            if(currentMode === 'audio' && !isAudioCtxInitialized) initAudioContext();
            player.play().then(() => {
                if(audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
            }).catch(e=>console.log(e));
        } else {
            player.pause();
        }
        updatePlayPauseIcon();
    });

    function updatePlayPauseIcon() {
        const player = getActivePlayer();
        const icon = playPauseBtn.querySelector('i');
        const vcIcon = vcPlayPause ? vcPlayPause.querySelector('i') : null;
        
        if(player.paused || !player.src) {
            icon.className = 'fas fa-play';
            if(vcIcon) vcIcon.className = 'fas fa-play';
            mediaSpinIcon.classList.remove('playing');
        } else {
            icon.className = 'fas fa-pause';
            if(vcIcon) vcIcon.className = 'fas fa-pause';
            mediaSpinIcon.classList.add('playing');
        }
    }

    prevBtn.addEventListener('click', () => {
        if(currentIndex > 0) playMedia(currentIndex - 1);
        else playMedia(currentFilteredFiles.length - 1);
    });

    nextBtn.addEventListener('click', playNext);

    // Mobile Playlist Panel Toggle
    mobileMenuBtn.addEventListener('click', () => {
        playlistPanel.classList.add('open');
    });
    
    closePlaylistBtn.addEventListener('click', () => {
        playlistPanel.classList.remove('open');
    });

    // Skip functionality
    function skipTime(direction) {
        const player = getActivePlayer();
        if(!player.src || !isFinite(player.duration)) return;
        
        const duration = parseInt(skipDurationSelect.value, 10);
        let newTime = player.currentTime + (direction * duration);
        
        if (newTime < 0) newTime = 0;
        if (newTime > player.duration) newTime = player.duration;
        
        player.currentTime = newTime;
    }

    skipBackBtn.addEventListener('click', () => skipTime(-1));
    skipForwardBtn.addEventListener('click', () => skipTime(1));

    function playNext() {
        if(currentIndex < currentFilteredFiles.length - 1) playMedia(currentIndex + 1);
        else playMedia(0);
    }

    // Auto next playback
    audioPlayer.addEventListener('ended', playNext);
    videoPlayer.addEventListener('ended', playNext);

    // Sync play pause icon if paused by other means
    audioPlayer.addEventListener('pause', updatePlayPauseIcon);
    audioPlayer.addEventListener('play', updatePlayPauseIcon);
    videoPlayer.addEventListener('pause', updatePlayPauseIcon);
    videoPlayer.addEventListener('play', updatePlayPauseIcon);

    // Time Update & Progress
    function formatTime(seconds) {
        if(isNaN(seconds) || !isFinite(seconds)) return "0:00";
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    }

    function updateProgress(e) {
        if (e.target !== getActivePlayer()) return;
        
        currentTimeEl.innerText = formatTime(e.target.currentTime);
        if(!isNaN(e.target.duration) && isFinite(e.target.duration)) {
            totalTimeEl.innerText = formatTime(e.target.duration);
            const percent = (e.target.currentTime / e.target.duration) * 100;
            progressBar.value = percent;
            progressFill.style.width = `${percent}%`;
            
            // Update Video Controls
            if (currentMode === 'video' && vcProgress) {
                vcProgress.value = percent;
                if(vcProgressFill) vcProgressFill.style.width = `${percent}%`;
                if(vcCurrentTime) vcCurrentTime.innerText = formatTime(e.target.currentTime);
                if(vcTotalTime) vcTotalTime.innerText = formatTime(e.target.duration);
            }
        }
    }

    audioPlayer.addEventListener('timeupdate', updateProgress);
    videoPlayer.addEventListener('timeupdate', updateProgress);
    audioPlayer.addEventListener('loadedmetadata', updateProgress);
    videoPlayer.addEventListener('loadedmetadata', updateProgress);

    progressBar.addEventListener('input', (e) => {
        const player = getActivePlayer();
        if(player.duration) {
            player.currentTime = (e.target.value / 100) * player.duration;
            progressFill.style.width = `${e.target.value}%`;
        }
    });

    // Volume & Speed
    volumeBar.addEventListener('input', (e) => {
        const vol = e.target.value / 100;
        audioPlayer.volume = vol;
        videoPlayer.volume = vol;
        const volIcon = document.getElementById('volume-icon');
        if(vol === 0) volIcon.className = 'fas fa-volume-xmark';
        else if(vol < 0.5) volIcon.className = 'fas fa-volume-low';
        else volIcon.className = 'fas fa-volume-high';
    });

    speedSelect.addEventListener('change', (e) => {
        const speed = parseFloat(e.target.value);
        audioPlayer.playbackRate = speed;
        videoPlayer.playbackRate = speed;
    });

    // Audio EQ
    eqBass.addEventListener('input', (e) => { if(bassNode) bassNode.gain.value = e.target.value; });
    eqMid.addEventListener('input', (e) => { if(midNode) midNode.gain.value = e.target.value; });
    eqTreble.addEventListener('input', (e) => { if(trebleNode) trebleNode.gain.value = e.target.value; });
    
    reverbMix.addEventListener('input', (e) => {
        if(!wetGain || !dryGain) return;
        const wet = e.target.value / 100;
        wetGain.gain.value = wet;
        dryGain.gain.value = 1 - wet;
    });

    resetAudioBtn.addEventListener('click', () => {
        eqBass.value = 0;
        eqMid.value = 0;
        eqTreble.value = 0;
        reverbMix.value = 0;
        if(bassNode) bassNode.gain.value = 0;
        if(midNode) midNode.gain.value = 0;
        if(trebleNode) trebleNode.gain.value = 0;
        if(wetGain) wetGain.gain.value = 0;
        if(dryGain) dryGain.gain.value = 1;
    });

    // Keyboard Shortcuts
    const keys = {};
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' && e.target.type === 'text') return; // ignore typing in search box
        
        const key = e.key.toLowerCase();
        keys[key] = true;
        
        // 1. Ctrl + B = hide/show side panel
        if (e.ctrlKey && key === 'b') {
            e.preventDefault();
            playlistPanel.classList.toggle('hidden-desktop');
            playlistPanel.classList.toggle('open'); // handles mobile drawer
        }
        
        // 2. Ctrl + F = full screen mode in video
        if (e.ctrlKey && key === 'f') {
            e.preventDefault();
            if (currentMode === 'video' && fullscreenBtn) {
                fullscreenBtn.click();
            }
        }
        
        // 12. Ctrl + O = select folder
        if (e.ctrlKey && key === 'o') {
            e.preventDefault();
            folderInput.click();
        }
        
        // Alt + r = reset Audio Engine
        if (e.altKey && key === 'r') {
            e.preventDefault();
            resetAudioBtn.click();
        }
        
        // 11. Spacebar = pause/resume
        if (key === ' ' || e.code === 'Space') {
            e.preventDefault();
            playPauseBtn.click();
        }
        
        // 3. Right arrow = forward
        // 4. Left arrow = backward
        if (!e.ctrlKey && !keys['h'] && !keys['m'] && !keys['l'] && !keys['r']) {
            if (key === 'arrowright') {
                e.preventDefault();
                skipTime(1);
                if(currentMode === 'video') showVideoControls();
            }
            if (key === 'arrowleft') {
                e.preventDefault();
                skipTime(-1);
                if(currentMode === 'video') showVideoControls();
            }
        }
        
        // 5. Ctrl + Up = increase volume
        // 6. Ctrl + Down = decrease volume
        if (e.ctrlKey) {
            if (key === 'arrowup') {
                e.preventDefault();
                let vol = parseInt(volumeBar.value) + 5;
                if (vol > 100) vol = 100;
                volumeBar.value = vol;
                volumeBar.dispatchEvent(new Event('input'));
                if(currentMode === 'video' && vcVolumeBar) {
                    vcVolumeBar.value = vol;
                    showVideoControls();
                }
            }
            if (key === 'arrowdown') {
                e.preventDefault();
                let vol = parseInt(volumeBar.value) - 5;
                if (vol < 0) vol = 0;
                volumeBar.value = vol;
                volumeBar.dispatchEvent(new Event('input'));
                if(currentMode === 'video' && vcVolumeBar) {
                    vcVolumeBar.value = vol;
                    showVideoControls();
                }
            }
        }
        
        // 7,8,9,10. EQ and Reverb logic
        if (key === 'arrowup' || key === 'arrowdown') {
            const step = key === 'arrowup' ? 1 : -1;
            let changed = false;
            
            if (keys['h']) {
                let val = parseInt(eqTreble.value) + step;
                if (val > 20) val = 20;
                if (val < -20) val = -20;
                eqTreble.value = val;
                eqTreble.dispatchEvent(new Event('input'));
                changed = true;
            } else if (keys['m']) {
                let val = parseInt(eqMid.value) + step;
                if (val > 20) val = 20;
                if (val < -20) val = -20;
                eqMid.value = val;
                eqMid.dispatchEvent(new Event('input'));
                changed = true;
            } else if (keys['l']) {
                let val = parseInt(eqBass.value) + step;
                if (val > 20) val = 20;
                if (val < -20) val = -20;
                eqBass.value = val;
                eqBass.dispatchEvent(new Event('input'));
                changed = true;
            } else if (keys['r']) {
                let val = parseInt(reverbMix.value) + (step * 5); // 5% steps for reverb
                if (val > 100) val = 100;
                if (val < 0) val = 0;
                reverbMix.value = val;
                reverbMix.dispatchEvent(new Event('input'));
                changed = true;
            }
            
            if (changed) e.preventDefault();
        }
    });

    document.addEventListener('keyup', (e) => {
        keys[e.key.toLowerCase()] = false;
    });

    // Auto-restore previously saved directory handles if browser supports File System Access API
    if (window.showDirectoryPicker) {
        (async () => {
            const savedAudioHandle = await getHandleFromDB('audio');
            const savedVideoHandle = await getHandleFromDB('video');
            
            if (savedAudioHandle) {
                currentAudioFolderHandle = savedAudioHandle;
                if (await savedAudioHandle.queryPermission({ mode: 'read' }) === 'granted') {
                    await loadFilesFromHandle(savedAudioHandle, 'audio');
                }
            }
            if (savedVideoHandle) {
                currentVideoFolderHandle = savedVideoHandle;
                if (await savedVideoHandle.queryPermission({ mode: 'read' }) === 'granted') {
                    await loadFilesFromHandle(savedVideoHandle, 'video');
                }
            }
            renderPlaylist();
        })();
    }
});
