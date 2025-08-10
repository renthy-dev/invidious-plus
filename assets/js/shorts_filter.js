// Shorts Filter
(function() {
    'use strict';
    
    // Early exit for non-subscription pages
    if (!location.pathname.includes('/feed/subscriptions')) return;
    
    // State management - ON by default
    let enabled = localStorage.getItem('shorts_filter') !== 'false'; // Default to true
    let btn = null;
    let observer = null;
    let lastProcessTime = 0;
    let processTimeoutId = null;
    let cachedVideoGrid = null;
    let isProcessing = false;
    
    const DEBOUNCE_DELAY = 150;
    const INIT_DELAY = 50;
    
    const SELECTORS = {
        videoItem: '.pure-u-1.pure-u-md-1-4',
        videoGrid: '.pure-g',
        navHeader: '.pure-g.h-box',
        length: '.length'
    };
    
    const CSS_CLASSES = {
        hidden: 'shorts-filter-hidden',
        active: 'active',
        container: 'shorts-filter-container',
        btn: 'shorts-filter-btn'
    };
    
    const ICONS = {
        shown: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 48 48" style="vertical-align:middle;"><path fill="currentColor" d="M31.95 3c-1.11 0-2.25.3-3.27.93l-15.93 9.45C10.32 14.79 8.88 17.67 9 20.7c.15 3 1.74 5.61 4.17 6.84.06.03 2.25 1.05 2.25 1.05l-2.7 1.59c-3.42 2.04-4.74 6.81-2.94 10.65C11.07 43.47 13.5 45 16.05 45c1.11 0 2.22-.3 3.27-.93l15.93-9.45c2.4-1.44 3.87-4.29 3.72-7.35-.12-2.97-1.74-5.61-4.17-6.81-.06-.03-2.25-1.05-2.25-1.05l2.7-1.59c3.42-2.04 4.74-6.81 2.91-10.65C36.93 4.53 34.47 3 31.95 3z"/></svg>`,
        hidden: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 48 48" style="vertical-align:middle;"><g fill="currentColor"><g clip-path="url(#slashGap)"><path d="M31.97 3c-1.11 0-2.25.3-3.27.93l-15.93 9.45c-2.43 1.41-3.87 4.29-3.75 7.32.15 3 1.74 5.61 4.17 6.84.06.03 2.25 1.05 2.25 1.05l-2.7 1.59C9.32 32.22 8 36.99 9.8 40.83c1.29 2.64 3.72 4.17 6.27 4.17 1.11 0 2.22-.3 3.27-.93l15.93-9.45c2.4-1.44 3.87-4.29 3.72-7.35-.12-2.97-1.74-5.61-4.17-6.81-.06-.03-2.25-1.05-2.25-1.05l2.7-1.59c3.42-2.04 4.74-6.81 2.91-10.65C36.95 4.53 34.49 3 31.97 3z"/></g><path d="m7.501 5.55 4.066-2.42 24.26 40.78-4.065 2.418z"/></g></svg>`
    };

    // Regex for duration matching - videos under 1 minute
    const SHORT_DURATION_REGEX = /^0:[0-5][0-9]$/;
    
    function findInsertionPoint() {
        // Look for the RSS button in the header navigation
        const rssLink = document.querySelector('a[href*="/feed/private"]');
        if (rssLink) {
            // Find the parent h3 element
            let h3Parent = rssLink.closest('h3');
            if (h3Parent) {
                return h3Parent;
            }
        }
        
        // Fallback: look for the rightmost section in the nav header
        const navHeader = document.querySelector(SELECTORS.navHeader);
        if (navHeader) {
            const rightSection = navHeader.querySelector('.pure-u-1-3:last-child h3');
            if (rightSection) {
                return rightSection;
            }
        }
        
        return null;
    }
    
    function createButton() {
        const insertionPoint = findInsertionPoint();
        if (!insertionPoint || document.getElementById('shortsFilterBtn')) return;
        
        // Create button container
        const container = document.createElement('span');
        container.className = CSS_CLASSES.container;
        
        btn = document.createElement('button');
        btn.id = 'shortsFilterBtn';
        btn.className = `${CSS_CLASSES.btn}`;
        btn.onclick = toggle;
        btn.title = 'Shorts toggle';
        
        container.appendChild(btn);
        insertionPoint.appendChild(container);
        
        updateBtnText();
    }
    
    function toggle() {
        enabled = !enabled;
        localStorage.setItem('shorts_filter', enabled);
        enabled ? apply() : remove();
        updateBtnText();
    }
    
    function updateBtnText() {
        if (!btn) return;
        
        if (enabled) {
            // Shorts are HIDDEN (filter is ON) - show slashed icon
            btn.innerHTML = ICONS.hidden;
        } else {
            // Shorts are SHOWN (filter is OFF) - show solid icon
            btn.innerHTML = ICONS.shown;
        }
    }
    
    function apply() {
        if (isProcessing) return;
        
        const now = performance.now();
        if (now - lastProcessTime < DEBOUNCE_DELAY) {
            if (processTimeoutId) clearTimeout(processTimeoutId);
            processTimeoutId = setTimeout(apply, DEBOUNCE_DELAY);
            return;
        }
        
        isProcessing = true;
        lastProcessTime = now;
        
        requestAnimationFrame(() => {
            const videos = document.querySelectorAll(SELECTORS.videoItem);
            let batchChanges = [];
            
            for (const video of videos) {
                const lengthEl = video.querySelector(SELECTORS.length);
                const lengthText = lengthEl?.textContent?.trim();
                
                // Hide videos without duration OR videos under 1 minute
                const isShort = !lengthText || SHORT_DURATION_REGEX.test(lengthText);
                const isCurrentlyHidden = video.classList.contains(CSS_CLASSES.hidden);
                
                // Only modify DOM if state needs to change
                if (isShort && !isCurrentlyHidden) {
                    batchChanges.push({video, action: 'add'});
                } else if (!isShort && isCurrentlyHidden) {
                    batchChanges.push({video, action: 'remove'});
                }
            }
            
            batchChanges.forEach(({video, action}) => {
                if (action === 'add') {
                    video.classList.add(CSS_CLASSES.hidden);
                } else {
                    video.classList.remove(CSS_CLASSES.hidden);
                }
            });
            
            updateBtnText();
            isProcessing = false;
        });
    }
    
    function remove() {
        const hiddenVideos = document.querySelectorAll(`.${CSS_CLASSES.hidden}`);
        
        requestAnimationFrame(() => {
            hiddenVideos.forEach(video => video.classList.remove(CSS_CLASSES.hidden));
            updateBtnText();
        });
    }
    
    function setupObserver() {
        if (!cachedVideoGrid) {
            cachedVideoGrid = document.querySelector(SELECTORS.videoGrid);
        }
        
        if (!cachedVideoGrid || observer) return;
        
        observer = new MutationObserver(mutations => {
            if (!enabled || isProcessing) return;
            
            const hasRelevantChanges = mutations.some(mutation => 
                mutation.type === 'childList' && 
                mutation.addedNodes.length > 0 &&
                Array.from(mutation.addedNodes).some(node => 
                    node.nodeType === Node.ELEMENT_NODE &&
                    (node.matches?.(SELECTORS.videoItem) || node.querySelector?.(SELECTORS.videoItem))
                )
            );
            
            if (hasRelevantChanges) {
                apply();
            }
        });
        
        observer.observe(cachedVideoGrid, {
            childList: true,
            subtree: true
        });
    }
    
    function cleanup() {
        if (observer) {
            observer.disconnect();
            observer = null;
        }
        if (processTimeoutId) {
            clearTimeout(processTimeoutId);
            processTimeoutId = null;
        }
        cachedVideoGrid = null;
        isProcessing = false;
    }
    
    function init() {
        createButton();
        setupObserver();
        
        if (enabled) {
            setTimeout(apply, INIT_DELAY);
        }
    }
    
    function delayedInit() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => setTimeout(init, INIT_DELAY));
        } else {
            setTimeout(init, INIT_DELAY);
        }
    }
    
    let lastUrl = location.href;
    const navigationCheckInterval = setInterval(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            cleanup();
            
            if (location.pathname.includes('/feed/subscriptions')) {
                setTimeout(init, 100);
            }
        }
    }, 1000);
    addEventListener('beforeunload', cleanup);
    delayedInit();
    
})();