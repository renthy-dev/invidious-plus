// Simple working chapters integration for Invidious VideoJS

(function() {
    'use strict';
    
    function initChapters() {
        // Get chapters data
        const playerDataElement = document.getElementById('player_data');
        if (!playerDataElement) return;
        
        let chapters = [];
        try {
            const data = JSON.parse(playerDataElement.textContent);
            chapters = data.chapters || [];
        } catch (e) {
            console.error('Failed to parse player data:', e);
            return;
        }
        
        if (chapters.length === 0) return;
        
        console.log('Found', chapters.length, 'chapters');
        
        // Wait for VideoJS to be ready
        setTimeout(() => {
            const player = videojs('player');
            if (player && player.el()) {
                addChaptersButton(player, chapters);
            }
        }, 1000);
    }
    
    function addChaptersButton(player, chapters) {
        const controlBar = player.el().querySelector('.vjs-control-bar');
        if (!controlBar) {
            console.log('No control bar found');
            return;
        }
        
        // Create chapters button
        const chaptersBtn = document.createElement('button');
        chaptersBtn.className = 'vjs-control vjs-button chapters-btn';
        chaptersBtn.setAttribute('aria-label', 'Chapters');
        chaptersBtn.title = 'Chapters';
        chaptersBtn.innerHTML = `
            <span class="vjs-icon-placeholder" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3 3h18v4H3V3zm0 6h18v4H3V9zm0 6h18v4H3v-4z"/>
                </svg>
            </span>
            <span class="vjs-control-text" aria-live="polite">Chapters</span>
        `;
        
        // Add to control bar (before fullscreen button, after captions)
        const fullscreenBtn = controlBar.querySelector('.vjs-fullscreen-control');
        const captionsBtn = controlBar.querySelector('.vjs-captions-button');
        const audioBtn = controlBar.querySelector('.vjs-audio-button');
        const qualityBtn = controlBar.querySelector('.vjs-quality-selector, .vjs-http-source-selector');
        const playbackRateBtn = controlBar.querySelector('.vjs-playback-rate');
        const shareBtn = controlBar.querySelector('.vjs-share-control');
        
        // Try to insert in the right position (right side of control bar)
        let insertBefore = fullscreenBtn;
        
        // If no fullscreen, try other right-side buttons
        if (!insertBefore) insertBefore = shareBtn;
        if (!insertBefore) insertBefore = playbackRateBtn;
        if (!insertBefore) insertBefore = qualityBtn;
        if (!insertBefore) insertBefore = audioBtn;
        
        if (insertBefore) {
            controlBar.insertBefore(chaptersBtn, insertBefore);
        } else {
            // Fallback: append to end
            controlBar.appendChild(chaptersBtn);
        }
        
        // Create dropdown
        const dropdown = createChaptersDropdown(chapters, player);
        player.el().appendChild(dropdown);
        
        // Button click handler
        chaptersBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleDropdown(dropdown);
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!dropdown.contains(e.target) && !chaptersBtn.contains(e.target)) {
                closeDropdown(dropdown);
            }
        });
        
        // Update current chapter
        player.on('timeupdate', () => {
            updateCurrentChapter(dropdown, chapters, player.currentTime());
        });
        
        console.log('Chapters button added successfully');
    }
    
    function createChaptersDropdown(chapters, player) {
        const dropdown = document.createElement('div');
        dropdown.className = 'chapters-dropdown';
        dropdown.style.cssText = `
            position: absolute;
            bottom: 60px;
            right: 10px;
            background: rgba(28, 28, 28, 0.95);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 8px;
            min-width: 280px;
            max-width: 400px;
            max-height: 300px;
            overflow-y: auto;
            opacity: 0;
            visibility: hidden;
            transform: translateY(10px);
            transition: all 0.2s ease;
            z-index: 1000;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        `;
        
        // Header
        const header = document.createElement('div');
        header.textContent = `Chapters (${chapters.length})`;
        header.style.cssText = `
            padding: 12px 16px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            color: #fff;
            font-weight: bold;
            font-size: 14px;
        `;
        dropdown.appendChild(header);
        
        // Chapter items
        chapters.forEach((chapter, index) => {
            const item = document.createElement('div');
            item.className = 'chapter-item';
            item.dataset.index = index;
            item.style.cssText = `
                display: flex;
                align-items: center;
                padding: 10px 16px;
                cursor: pointer;
                color: #e0e0e0;
                border-bottom: 1px solid rgba(255, 255, 255, 0.05);
                transition: background-color 0.2s ease;
            `;
            
            const timeStr = formatTime(chapter.startTime);
            
            item.innerHTML = `
                <div style="flex-shrink: 0; margin-right: 12px; color: #aaa; font-size: 12px; font-family: monospace;">
                    ${timeStr}
                </div>
                <div style="flex: 1; font-size: 13px; line-height: 1.3;">
                    ${escapeHtml(chapter.title)}
                </div>
            `;
            
            // Hover effects
            item.addEventListener('mouseenter', () => {
                item.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
            });
            
            item.addEventListener('mouseleave', () => {
                if (!item.classList.contains('current')) {
                    item.style.backgroundColor = 'transparent';
                }
            });
            
            // Click to seek
            item.addEventListener('click', () => {
                player.currentTime(chapter.startTime);
                closeDropdown(dropdown);
            });
            
            dropdown.appendChild(item);
        });
        
        return dropdown;
    }
    
    function toggleDropdown(dropdown) {
        const isOpen = dropdown.style.opacity === '1';
        if (isOpen) {
            closeDropdown(dropdown);
        } else {
            openDropdown(dropdown);
        }
    }
    
    function openDropdown(dropdown) {
        dropdown.style.opacity = '1';
        dropdown.style.visibility = 'visible';
        dropdown.style.transform = 'translateY(0)';
    }
    
    function closeDropdown(dropdown) {
        dropdown.style.opacity = '0';
        dropdown.style.visibility = 'hidden';
        dropdown.style.transform = 'translateY(10px)';
    }
    
    function updateCurrentChapter(dropdown, chapters, currentTime) {
        let currentChapterIndex = -1;
        
        // Find current chapter
        for (let i = chapters.length - 1; i >= 0; i--) {
            if (currentTime >= chapters[i].startTime) {
                currentChapterIndex = i;
                break;
            }
        }
        
        // Update UI
        const items = dropdown.querySelectorAll('.chapter-item');
        items.forEach((item, index) => {
            if (index === currentChapterIndex) {
                item.classList.add('current');
                item.style.backgroundColor = 'rgba(0, 182, 240, 0.3)';
                item.style.color = '#fff';
            } else {
                item.classList.remove('current');
                if (!item.matches(':hover')) {
                    item.style.backgroundColor = 'transparent';
                }
                item.style.color = '#e0e0e0';
            }
        });
    }
    
    function formatTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        
        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        } else {
            return `${minutes}:${secs.toString().padStart(2, '0')}`;
        }
    }
    
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // Initialize when page loads
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initChapters);
    } else {
        initChapters();
    }
})();