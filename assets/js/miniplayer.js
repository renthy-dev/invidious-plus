
(function() {
    'use strict';
    
    let miniPlayer = null;
    let originalPlayerContainer = null;
    let originalPlayer = null;
    let isMinimized = false;
    let videoJsPlayer = null;
    let scrollThreshold = 0;
    let miniPlayerEnabled = true;
    let toggleButton = null;
    
    let isDragging = false;
    let isResizing = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let playerStartX = 0;
    let playerStartY = 0;
    let resizeStartX = 0;
    let resizeStartY = 0;
    let startWidth = 0;
    let startHeight = 0;
    
    let playerSettings = {
        enabled: true,
        width: 320,
        height: 180,
        x: 0,
        y: 0,
        minWidth: 240,
        minHeight: 135,
        maxWidth: 640,
        maxHeight: 360
    };
    
    const aspectRatio = 16 / 9;
    
    function initMiniPlayer() {
        console.log('Initializing mini-player with settings...');
        
        loadSettings();
        
        originalPlayerContainer = document.getElementById('player-container');
        originalPlayer = document.getElementById('player');
        
        if (!originalPlayerContainer || !originalPlayer) {
            console.error('Video player not found');
            return;
        }
        
        try {
            if (typeof videojs !== 'undefined' && window.player) {
                videoJsPlayer = window.player;
            } else {
                videoJsPlayer = videojs('player');
            }
        } catch (e) {
            console.warn('VideoJS not available:', e);
            return;
        }
        
        if (playerSettings.x === 0 && playerSettings.y === 0) {
            playerSettings.x = window.innerWidth - playerSettings.width - 20;
            playerSettings.y = window.innerHeight - playerSettings.height - 20;
        }
        
        const rect = originalPlayerContainer.getBoundingClientRect();
        scrollThreshold = window.pageYOffset + rect.top + (rect.height * 0.7);
        
        setTimeout(() => createToggleButton(), 1000);
        
        createMiniPlayer();
        
        window.addEventListener('scroll', handleScroll);
        window.addEventListener('resize', handleWindowResize);
        
        console.log('Mini-player initialized with settings');
    }
    
    function loadSettings() {
        try {
            const saved = localStorage.getItem('invidious_miniplayer_settings');
            if (saved) {
                const parsed = JSON.parse(saved);
                playerSettings = Object.assign(playerSettings, parsed);
                miniPlayerEnabled = playerSettings.enabled;
                console.log('Settings loaded:', playerSettings);
            }
        } catch (e) {
            console.warn('Could not load settings:', e);
        }
    }
    
    function saveSettings() {
        try {
            playerSettings.enabled = miniPlayerEnabled;
            localStorage.setItem('invidious_miniplayer_settings', JSON.stringify(playerSettings));
            console.log('Settings saved:', playerSettings);
        } catch (e) {
            console.warn('Could not save settings:', e);
        }
    }
    
    function createToggleButton() {
        if (!videoJsPlayer) return;
        
        const controlBar = videoJsPlayer.el().querySelector('.vjs-control-bar');
        if (!controlBar) return;
        
        const existing = controlBar.querySelector('.miniplayer-toggle-btn');
        if (existing) existing.remove();
        
        toggleButton = document.createElement('button');
        toggleButton.className = 'vjs-control vjs-button miniplayer-toggle-btn';
        toggleButton.title = miniPlayerEnabled ? 'Disable Mini Player' : 'Enable Mini Player';
        
        updateToggleButton();
        
        const playbackRateBtn = controlBar.querySelector('.vjs-playback-rate');
        const fullscreenBtn = controlBar.querySelector('.vjs-fullscreen-control');
        
        if (playbackRateBtn) {
            playbackRateBtn.parentNode.insertBefore(toggleButton, playbackRateBtn.nextSibling);
        } else if (fullscreenBtn) {
            controlBar.insertBefore(toggleButton, fullscreenBtn);
        } else {
            controlBar.appendChild(toggleButton);
        }
        
        toggleButton.addEventListener('click', toggleMiniPlayer);
        console.log('Toggle button created and positioned on right side');
    }
    
    function updateToggleButton() {
        if (!toggleButton) return;
        
        const isEnabled = miniPlayerEnabled;
        toggleButton.innerHTML = 
            '<span class="vjs-icon-placeholder">' +
                '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">' +
                    (isEnabled ? 
                        '<path d="M19 7h-8v6h8V7zm2-4H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z"/>' :
                        '<path d="M19 7h-8v6h8V7zm2-4H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z"/><line x1="2" y1="2" x2="22" y2="22" stroke="currentColor" stroke-width="2"/>'
                    ) +
                '</svg>' +
            '</span>' +
            '<span class="vjs-control-text">' + (isEnabled ? 'Disable' : 'Enable') + ' Mini Player</span>';
        
        toggleButton.style.color = isEnabled ? '' : '#ff6b6b';
    }
    
    function toggleMiniPlayer() {
        miniPlayerEnabled = !miniPlayerEnabled;
        updateToggleButton();
        saveSettings();
        
        if (!miniPlayerEnabled && isMinimized) {
            hideMiniPlayer();
        }
        
        console.log('Mini-player toggled:', miniPlayerEnabled ? 'enabled' : 'disabled');
    }
    
    function createMiniPlayer() {
        miniPlayer = document.createElement('div');
        miniPlayer.id = 'mini-player';
        
        Object.assign(miniPlayer.style, {
            position: 'fixed',
            left: playerSettings.x + 'px',
            top: playerSettings.y + 'px',
            width: playerSettings.width + 'px',
            height: playerSettings.height + 'px',
            background: '#000',
            borderRadius: '8px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
            zIndex: '9999',
            opacity: '0',
            transform: 'scale(0.8)',
            transition: 'all 0.3s ease',
            pointerEvents: 'none',
            overflow: 'hidden',
            border: '2px solid rgba(255, 255, 255, 0.1)'
        });
        
        const header = document.createElement('div');
        header.className = 'mini-player-header';
        Object.assign(header.style, {
            position: 'absolute',
            top: '0',
            left: '0',
            right: '0',
            height: '30px',
            background: 'linear-gradient(rgba(0,0,0,0.8), transparent)',
            cursor: 'move',
            zIndex: '10',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 10px'
        });
        
        const title = document.createElement('div');
        title.style.color = 'white';
        title.style.fontSize = '12px';
        title.style.overflow = 'hidden';
        title.style.whiteSpace = 'nowrap';
        title.style.textOverflow = 'ellipsis';
        title.style.flex = '1';
        const videoTitle = document.querySelector('h1');
        title.textContent = videoTitle ? videoTitle.textContent : 'Video';
        
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '×';
        closeBtn.title = 'Close mini player';
        Object.assign(closeBtn.style, {
            background: 'none',
            border: 'none',
            color: 'white',
            fontSize: '18px',
            cursor: 'pointer',
            padding: '2px 6px',
            borderRadius: '3px'
        });
        closeBtn.addEventListener('click', closeMiniPlayer);
        
        header.appendChild(title);
        header.appendChild(closeBtn);
        
        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'resize-handle';
        Object.assign(resizeHandle.style, {
            position: 'absolute',
            bottom: '0',
            right: '0',
            width: '16px',
            height: '16px',
            cursor: 'nw-resize',
            zIndex: '11',
            opacity: '0',
            transition: 'opacity 0.2s ease',
            background: 'linear-gradient(135deg, transparent 50%, rgba(255, 255, 255, 0.3) 50%)'
        });
        
        resizeHandle.innerHTML = 
            '<svg width="16" height="16" viewBox="0 0 16 16" style="position: absolute; bottom: 1px; right: 1px;">' +
                '<path d="M16 0v16H0L16 0z" fill="rgba(255,255,255,0.2)"/>' +
                '<path d="M6 10l4-4M8 12l4-4M10 14l4-4" stroke="rgba(255,255,255,0.5)" stroke-width="1"/>' +
            '</svg>';
        
        miniPlayer.addEventListener('mouseenter', () => {
            resizeHandle.style.opacity = '1';
        });
        
        miniPlayer.addEventListener('mouseleave', () => {
            if (!isResizing) {
                resizeHandle.style.opacity = '0';
            }
        });
        
        miniPlayer.appendChild(header);
        miniPlayer.appendChild(resizeHandle);
        
        header.addEventListener('mousedown', startDrag);
        
        resizeHandle.addEventListener('mousedown', startResize);
        
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        
        document.body.appendChild(miniPlayer);
    }
    
    function startDrag(e) {
        if (!isMinimized) return;
        
        e.preventDefault();
        isDragging = true;
        
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        playerStartX = playerSettings.x;
        playerStartY = playerSettings.y;
        
        miniPlayer.style.transition = 'none';
        document.body.style.userSelect = 'none';
        
        console.log('Start drag');
    }
    
    function startResize(e) {
        if (!isMinimized) return;
        
        e.preventDefault();
        e.stopPropagation();
        isResizing = true;
        
        resizeStartX = e.clientX;
        resizeStartY = e.clientY;
        startWidth = playerSettings.width;
        startHeight = playerSettings.height;
        
        miniPlayer.style.transition = 'none';
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'nw-resize';
        
        console.log('Start resize');
    }
    
    function handleMouseMove(e) {
        if (isDragging) {
            drag(e);
        } else if (isResizing) {
            resize(e);
        }
    }
    
    function handleMouseUp(e) {
        if (isDragging) {
            stopDrag(e);
        } else if (isResizing) {
            stopResize(e);
        }
    }
    
    function drag(e) {
        const deltaX = e.clientX - dragStartX;
        const deltaY = e.clientY - dragStartY;
        
        let newX = playerStartX + deltaX;
        let newY = playerStartY + deltaY;
        
        const padding = 10;
        newX = Math.max(padding, Math.min(newX, window.innerWidth - playerSettings.width - padding));
        newY = Math.max(padding, Math.min(newY, window.innerHeight - playerSettings.height - padding));
        
        playerSettings.x = newX;
        playerSettings.y = newY;
        
        miniPlayer.style.left = newX + 'px';
        miniPlayer.style.top = newY + 'px';
    }
    
    function resize(e) {
        const deltaX = e.clientX - resizeStartX;
        const deltaY = e.clientY - resizeStartY;
        
        let newWidth = startWidth + deltaX;
        let newHeight = Math.round(newWidth / aspectRatio);
        
        if (Math.abs(deltaY) > Math.abs(deltaX) * 0.5) {
            newHeight = startHeight + deltaY;
            newWidth = Math.round(newHeight * aspectRatio);
        }
        
        newWidth = Math.max(playerSettings.minWidth, Math.min(newWidth, playerSettings.maxWidth));
        newHeight = Math.max(playerSettings.minHeight, Math.min(newHeight, playerSettings.maxHeight));
        
        if (newWidth / aspectRatio > newHeight) {
            newWidth = Math.round(newHeight * aspectRatio);
        } else {
            newHeight = Math.round(newWidth / aspectRatio);
        }
        
        const padding = 10;
        const maxWidth = window.innerWidth - playerSettings.x - padding;
        const maxHeight = window.innerHeight - playerSettings.y - padding;
        
        if (newWidth > maxWidth) {
            newWidth = maxWidth;
            newHeight = Math.round(newWidth / aspectRatio);
        }
        if (newHeight > maxHeight) {
            newHeight = maxHeight;
            newWidth = Math.round(newHeight * aspectRatio);
        }
        
        playerSettings.width = newWidth;
        playerSettings.height = newHeight;
        
        miniPlayer.style.width = newWidth + 'px';
        miniPlayer.style.height = newHeight + 'px';
        
        updateVideoJSDimensions();
        
        setTimeout(() => {
            const controlBar = miniPlayer.querySelector('.vjs-control-bar');
            if (controlBar) {
                const progressControl = controlBar.querySelector('.vjs-progress-control');
                const volumeControl = controlBar.querySelector('.vjs-volume-panel');
                
                if (volumeControl) {
                    if (playerSettings.width < 280) {
                        volumeControl.style.display = 'none';
                    } else {
                        volumeControl.style.display = 'flex';
                    }
                }
                
                if (progressControl) {
                    const playWidth = 36;
                    const fullscreenWidth = 36;
                    const volumeWidth = (playerSettings.width >= 280) ? 36 : 0;
                    const padding = 8;
                    const gap = 6;
                    
                    const usedSpace = playWidth + fullscreenWidth + volumeWidth + padding + gap;
                    const availableSpace = Math.max(60, playerSettings.width - usedSpace);
                    
                    Object.assign(progressControl.style, {
                        width: availableSpace + 'px',
                        maxWidth: availableSpace + 'px'
                    });
                }
            }
        }, 10);
        
        console.log('Resizing to:', newWidth, 'x', newHeight);
    }
    
    function stopDrag() {
        if (!isDragging) return;
        
        isDragging = false;
        miniPlayer.style.transition = 'all 0.3s ease';
        document.body.style.userSelect = '';
        
        saveSettings();
        console.log('Stop drag');
    }
    
    function stopResize() {
        if (!isResizing) return;
        
        isResizing = false;
        miniPlayer.style.transition = 'all 0.3s ease';
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        
        saveSettings();
        console.log('Stop resize');
    }
    
    function updateVideoJSDimensions() {
        if (!videoJsPlayer || !isMinimized) return;
        
        try {
            if (typeof videoJsPlayer.dimensions === 'function') {
                videoJsPlayer.dimensions(playerSettings.width, playerSettings.height);
            }
            
            const videoEl = videoJsPlayer.el().querySelector('video');
            if (videoEl) {
                videoEl.style.width = '100%';
                videoEl.style.height = '100%';
                videoEl.style.objectFit = 'contain';
            }
            
        } catch (e) {
            console.warn('Error updating VideoJS dimensions:', e);
        }
    }
    
    function handleScroll() {
        if (!miniPlayerEnabled) return;
        
        const scrollY = window.pageYOffset;
        
        if (scrollY > scrollThreshold && !isMinimized) {
            showMiniPlayer();
        } else if (scrollY <= scrollThreshold && isMinimized) {
            hideMiniPlayer();
        }
    }
    
    function showMiniPlayer() {
        if (isMinimized || !originalPlayer || !miniPlayer) return;
        
        console.log('Showing mini-player');
        isMinimized = true;
        
        miniPlayer.appendChild(originalPlayer);
        
        miniPlayer.style.pointerEvents = 'auto';
        miniPlayer.style.opacity = '1';
        miniPlayer.style.transform = 'scale(1)';
        
        originalPlayerContainer.style.visibility = 'hidden';
        
        if (videoJsPlayer) {
            try {
                if (typeof videoJsPlayer.fluid === 'function') {
                    videoJsPlayer.fluid(false);
                }
                
                const playerEl = videoJsPlayer.el();
                if (playerEl) {
                    playerEl.style.width = '100%';
                    playerEl.style.height = '100%';
                    playerEl.style.borderRadius = '8px';
                }
                
                setTimeout(() => {
                    const controlBar = miniPlayer.querySelector('.vjs-control-bar');
                    if (controlBar) {
                        const hideControls = [
                            '.vjs-current-time',
                            '.vjs-time-divider',
                            '.vjs-duration',
                            '.vjs-remaining-time'
                        ];
                        
                        hideControls.forEach(selector => {
                            const element = controlBar.querySelector(selector);
                            if (element) {
                                element.style.display = 'none';
                            }
                        });
                        
                        controlBar.style.opacity = '0';
                        controlBar.style.transition = 'opacity 0.2s ease';
                        
                        miniPlayer.addEventListener('mouseenter', () => {
                            controlBar.style.opacity = '1';
                        });
                        
                        miniPlayer.addEventListener('mouseleave', () => {
                            controlBar.style.opacity = '0';
                        });
                    }
                }, 100);
                
            } catch (e) {
                console.warn('Error updating VideoJS:', e);
            }
        }
    }
    
    function hideMiniPlayer() {
        if (!isMinimized || !originalPlayer || !miniPlayer) return;
        
        console.log('Hiding mini-player');
        isMinimized = false;
        
        miniPlayer.style.opacity = '0';
        miniPlayer.style.transform = 'scale(0.8)';
        miniPlayer.style.pointerEvents = 'none';
        
        setTimeout(() => {
            if (!isMinimized) {
                originalPlayerContainer.appendChild(originalPlayer);
                
                if (videoJsPlayer) {
                    try {
                        if (typeof videoJsPlayer.fluid === 'function') {
                            videoJsPlayer.fluid(true);
                        }
                        
                        const playerEl = videoJsPlayer.el();
                        if (playerEl) {
                            playerEl.style.width = '';
                            playerEl.style.height = '';
                            playerEl.style.borderRadius = '';
                        }
                        
                        const controlBar = originalPlayer.querySelector('.vjs-control-bar');
                        if (controlBar) {
                            const hiddenControls = controlBar.querySelectorAll('[style*="display: none"]');
                            hiddenControls.forEach(control => {
                                control.style.display = '';
                            });
                            
                            Object.assign(controlBar.style, {
                                opacity: '',
                                transition: '',
                                display: '',
                                alignItems: '',
                                justifyContent: '',
                                padding: '',
                                gap: '',
                                height: '',
                                boxSizing: ''
                            });
                            
                            const controls = controlBar.querySelectorAll('.vjs-control');
                            controls.forEach(control => {
                                control.style.width = '';
                                control.style.minWidth = '';
                                control.style.flexShrink = '';
                                control.style.flex = '';
                                control.style.maxWidth = '';
                                control.style.margin = '';
                            });
                        }
                        
                    } catch (e) {
                        console.warn('Error restoring VideoJS:', e);
                    }
                }
                
                originalPlayerContainer.style.visibility = 'visible';
            }
        }, 300);
    }
    
    function closeMiniPlayer() {
        if (!isMinimized) return;

        try {
            if (videoJsPlayer && typeof videoJsPlayer.pause === 'function') {
                videoJsPlayer.pause();
            }
        } catch (e) {
            console.warn('Error pausing video:', e);
        }
        
        hideMiniPlayer();
    }
    
    function handleWindowResize() {
        const rect = originalPlayerContainer.getBoundingClientRect();
        scrollThreshold = window.pageYOffset + rect.top + (rect.height * 0.7);
        
        if (isMinimized) {
            const padding = 20;
            let newX = Math.max(padding, Math.min(playerSettings.x, window.innerWidth - playerSettings.width - padding));
            let newY = Math.max(padding, Math.min(playerSettings.y, window.innerHeight - playerSettings.height - padding));
            
            if (newX !== playerSettings.x || newY !== playerSettings.y) {
                playerSettings.x = newX;
                playerSettings.y = newY;
                miniPlayer.style.left = newX + 'px';
                miniPlayer.style.top = newY + 'px';
                saveSettings();
            }
        }
    }
    
    function waitForPlayer() {
        if (typeof videojs !== 'undefined' && (window.player || document.getElementById('player'))) {
            setTimeout(initMiniPlayer, 500);
        } else {
            setTimeout(waitForPlayer, 250);
        }
    }
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', waitForPlayer);
    } else {
        waitForPlayer();
    }
    
})();