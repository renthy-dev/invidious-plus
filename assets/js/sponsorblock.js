'use strict';

// SponsorBlock Integration

var sponsorblock = (function() {
    if (!window.location.pathname.includes('/watch')) return {};

    let segments = [];
    let enabledSegments = [];
    let currentTime = 0;
    let videoId = null;
    let checkTimer = null;
    let markers = [];
    let lastCheckTime = 0;
    let isInitialized = false;

    let settings = JSON.parse(localStorage.getItem('sponsorblock_settings')) || {
        sponsor: true,
        selfpromo: false,
        interaction: false,
        intro: false,
        outro: false,
        preview: false,
        music_offtopic: false,
        poi_highlight: false,
        filler: false
    };

    const categories = {
        sponsor: 'Sponsors',
        selfpromo: 'Self Promotion',
        interaction: 'Interaction Reminders',
        intro: 'Intro',
        outro: 'Outro',
        preview: 'Preview/Recap',
        music_offtopic: 'Non-Music Segments',
        poi_highlight: 'Highlight',
        filler: 'Filler Tangent'
    };

    const colors = {
        sponsor: '#ff0000',
        selfpromo: '#ffff00',
        interaction: '#cc00ff',
        intro: '#00ffff',
        outro: '#0000ff',
        preview: '#0088ff',
        music_offtopic: '#ff8800',
        poi_highlight: '#ff1493',
        filler: '#9932cc'
    };

    const names = {
        sponsor: 'Sponsor',
        selfpromo: 'Self-Promo',
        interaction: 'Subscribe',
        intro: 'Intro',
        outro: 'Outro',
        preview: 'Preview',
        music_offtopic: 'Non-Music',
        poi_highlight: 'Highlight',
        filler: 'Filler'
    };

    function init() {
        if (isInitialized) return;

        // Create dropdown immediately for better UX
        createDropdown();

        getVideoId();
        if (!videoId) {
            setTimeout(init, 2000);
            return;
        }

        // Wait for player to be ready for functionality, but dropdown is already visible
        if (!player || !player.duration || player.duration() === 0) {
            setTimeout(() => {
                if (typeof player !== 'undefined' && player && player.duration && player.duration() > 0) {
                    isInitialized = true;
                    fetchSegments();
                    startChecking();
                }
            }, 2000);
            return;
        }

        isInitialized = true;
        fetchSegments();
        startChecking();
    }

    function getVideoId() {
        if (typeof video_data !== 'undefined' && video_data.id) {
            videoId = video_data.id;
        } else {
            let match = window.location.href.match(/[?&]v=([^&]+)/);
            videoId = match ? match[1] : null;
        }
    }

    function filterEnabledSegments() {
        enabledSegments = segments.filter(seg => settings[seg.category || 'sponsor']);
    }

    function createDropdown() {
        let userField = document.querySelector('.user-field');
        if (!userField) return;

        let existing = document.getElementById('sbDropdownContainer');
        if (existing) existing.remove();

        let container = document.createElement('div');
        container.id = 'sbDropdownContainer';
        container.className = 'pure-u-1-4';

        container.innerHTML = `
        <button id="sbDropdownBtn" class="pure-menu-heading" title="SponsorBlock Settings">
        <i class="icon ion-ios-remove-circle"></i>
        </button>
        <div id="sbDropdown" style="display:none;">
        <div>SponsorBlock Auto-Skip Settings</div>
        ${Object.entries(categories).map(([key, label]) => `
            <div>
            <input type="checkbox" id="sb_${key}" ${settings[key] ? 'checked' : ''}>
            <label for="sb_${key}">
            <span style="background:${colors[key]};"></span>
            ${label}
            </label>
            </div>
            `).join('')}
            <div>
            <button id="sbSaveBtn">Save Settings</button>
            </div>
            </div>
            `;

            let themeToggle = userField.querySelector('div');
            if (themeToggle) {
                userField.insertBefore(container, themeToggle);
            } else {
                userField.insertBefore(container, userField.firstElementChild);
            }

            document.getElementById('sbDropdownBtn').onclick = () => {
                let dropdown = document.getElementById('sbDropdown');
                dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
            };

            document.getElementById('sbSaveBtn').onclick = () => {
                Object.keys(categories).forEach(key => {
                    let checkbox = document.getElementById(`sb_${key}`);
                    if (checkbox) settings[key] = checkbox.checked;
                });

                localStorage.setItem('sponsorblock_settings', JSON.stringify(settings));

                let btn = document.getElementById('sbSaveBtn');
                btn.textContent = 'Saved!';
                btn.classList.add('success');
                setTimeout(() => {
                    btn.textContent = 'Save Settings';
                    btn.classList.remove('success');
                }, 1500);

                document.getElementById('sbDropdown').style.display = 'none';
                filterEnabledSegments();
                removeMarkers();
                setTimeout(addProgressMarkers, 100);
            };

            document.onclick = e => {
                if (!container.contains(e.target)) {
                    document.getElementById('sbDropdown').style.display = 'none';
                }
            };
    }

    async function fetchSegments() {
        try {
            let categoriesParam = JSON.stringify(Object.keys(categories));
            let res = await fetch(`https://sponsor.ajay.app/api/skipSegments?videoID=${videoId}&categories=${categoriesParam}`);

            if (res.status === 404) return; // No segments found
            if (!res.ok) return;

            let data = await res.json();
            segments = Array.isArray(data) ? data : [data];
            filterEnabledSegments();

            // Add markers after segments are loaded
            setTimeout(addProgressMarkers, 1000);
        } catch (e) {
            console.warn('SponsorBlock: Failed to fetch segments:', e);
        }
    }

    function addProgressMarkers() {
        if (!enabledSegments.length || !player || !player.duration()) return;

        removeMarkers();

        let progressBar = document.querySelector('.vjs-progress-holder');
        if (!progressBar) {
            setTimeout(addProgressMarkers, 1000);
            return;
        }

        let duration = player.duration();
        let fragment = document.createDocumentFragment();

        enabledSegments.forEach(seg => {
            let [start, end] = seg.segment;
            let category = seg.category || 'sponsor';
            let startPercent = (start / duration) * 100;
            let widthPercent = ((end - start) / duration) * 100;

            let marker = document.createElement('div');
            marker.className = 'sb-marker';
            marker.style.cssText = `
            left: ${startPercent}%;
            width: ${widthPercent}%;
            background: ${colors[category] || '#ff4444'};
            `;
            marker.title = `${names[category] || category}: ${Math.floor(start/60)}:${(Math.floor(start%60)).toString().padStart(2,'0')} - ${Math.floor(end/60)}:${(Math.floor(end%60)).toString().padStart(2,'0')} (${Math.round(end-start)}s) - AUTOSKIPPED`;

            fragment.appendChild(marker);
            markers.push(marker);
        });

        progressBar.appendChild(fragment);
    }

    function removeMarkers() {
        markers.forEach(m => m.remove());
        markers.length = 0;
    }

    function startChecking() {
        if (checkTimer) clearInterval(checkTimer);
        checkTimer = setInterval(checkForSegments, 1000);
    }

    function checkForSegments() {
        if (!player || !enabledSegments.length) return;

        currentTime = player.currentTime();

        // Avoid rapid checks for the same time
        if (Math.abs(currentTime - lastCheckTime) < 0.5) return;
        lastCheckTime = currentTime;

        for (let seg of enabledSegments) {
            let [start, end] = seg.segment;
            if (currentTime >= start && currentTime < end) {
                player.currentTime(end);
                showSkipNotification(seg.category || 'sponsor', end - start);
                break;
            }
        }
    }

    function showSkipNotification(category, duration) {
        let notification = document.createElement('div');
        notification.className = 'sb-skip-notification';
        notification.innerHTML = `⚡ Skipped ${names[category] || category} (${Math.round(duration)}s)`;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 2000);
    }

    function reset() {
        segments.length = 0;
        enabledSegments.length = 0;
        removeMarkers();
        if (checkTimer) {
            clearInterval(checkTimer);
            checkTimer = null;
        }
        isInitialized = false;
    }

    return {
        init: init,
        reset: reset,
        getSettings: () => settings,
        setSettings: (newSettings) => {
            settings = Object.assign(settings, newSettings);
            localStorage.setItem('sponsorblock_settings', JSON.stringify(settings));
            filterEnabledSegments();
        }
    };
})();

addEventListener('load', function() {
    if (window.location.pathname.includes('/watch')) {
        sponsorblock.init();
    }
});

let lastUrl = window.location.href;
setInterval(() => {
    if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        sponsorblock.reset();
        if (window.location.pathname.includes('/watch')) {
            sponsorblock.init();
        }
    }
}, 2000);