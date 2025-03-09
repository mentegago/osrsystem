document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const channelNameInput = document.getElementById('channel-name');
    const startBtn = document.getElementById('start-btn');
    const connectionStatus = document.getElementById('connection-status');
    const requestList = document.getElementById('request-list');
    const songDetails = document.getElementById('song-details');
    const songInfo = document.getElementById('song-info');
    const clearAllBtn = document.getElementById('clear-all-btn');
    const confirmModal = document.getElementById('confirm-modal');
    const confirmYesBtn = document.getElementById('confirm-yes');
    const confirmNoBtn = document.getElementById('confirm-no');
    const chatMessages = document.getElementById('chat-messages');
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');
    const chatContainer = document.querySelector('.chat-container');

    // Variables
    let client = null;
    let songs = [];
    let requests = [];
    let selectedSongId = null;
    let userScrolledUp = false;
    let channelName = '';

    // Load songs data
    fetch('songs.json')
        .then(response => response.json())
        .then(data => {
            // Handle both formats: direct array or nested under "songs" property
            songs = Array.isArray(data) ? data : (data.songs || []);
            console.log('Songs loaded:', songs.length);
        })
        .catch(error => {
            console.error('Error loading songs:', error);
        });

    // Load saved requests from localStorage
    loadRequests();

    // Event Listeners
    startBtn.addEventListener('click', toggleConnection);
    clearAllBtn.addEventListener('click', showClearConfirmation);
    confirmYesBtn.addEventListener('click', clearAllRequests);
    confirmNoBtn.addEventListener('click', hideClearConfirmation);
    
    // Track scrolling in chat to determine auto-scroll behavior
    chatContainer.addEventListener('scroll', handleChatScroll);
    
    // Tab switching
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.getAttribute('data-tab');
            switchTab(tabId);
        });
    });
    
    // Delegate event listener for the request list
    requestList.addEventListener('click', handleRequestListClick);

    // Functions
    function switchTab(tabId) {
        // Deactivate all tabs
        tabButtons.forEach(btn => btn.classList.remove('active'));
        tabPanes.forEach(pane => pane.classList.remove('active'));
        
        // Activate the selected tab
        document.querySelector(`.tab-btn[data-tab="${tabId}"]`).classList.add('active');
        const tabPane = tabId === 'chat' ? 
            document.getElementById('chat-tab') : 
            document.getElementById('song-requests-tab');
            
        tabPane.classList.add('active');
        
        // If switching to chat tab, scroll to bottom if user wasn't scrolled up
        if (tabId === 'chat' && !userScrolledUp) {
            scrollChatToBottom();
        }
    }
    
    function handleChatScroll() {
        // Determine if user has scrolled up away from the bottom
        const { scrollTop, scrollHeight, clientHeight } = chatContainer;
        const bottomThreshold = 30; // pixels from bottom to consider "at bottom"
        
        // Check if we're close to the bottom
        const isAtBottom = scrollHeight - scrollTop - clientHeight <= bottomThreshold;
        
        // Update userScrolledUp flag
        userScrolledUp = !isAtBottom;
    }
    
    function scrollChatToBottom() {
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    function toggleConnection() {
        if (client && client.readyState !== 'CLOSED') {
            // Disconnect
            client.disconnect();
            connectionStatus.textContent = 'Disconnected';
            connectionStatus.className = 'disconnected';
            startBtn.textContent = 'Start';
            chatMessages.innerHTML = '';
            channelName = '';
        } else {
            // Connect
            channelName = channelNameInput.value.trim().toLowerCase();
            if (!channelName) {
                alert('Please enter a Twitch username');
                return;
            }

            connectionStatus.textContent = 'Connecting...';
            
            // Initialize Twitch client
            client = new tmi.Client({
                connection: {
                    secure: true,
                    reconnect: true
                },
                channels: [channelName]
            });

            // Connect to Twitch
            client.connect()
                .then(() => {
                    connectionStatus.textContent = 'Connected to ' + channelName;
                    connectionStatus.className = 'connected';
                    startBtn.textContent = 'Disconnect';
                    
                    // Add a system message to indicate connection
                    addChatMessage({
                        type: 'system',
                        message: `Connected to ${channelName}'s chat.`
                    });
                })
                .catch(err => {
                    console.error('Error connecting to Twitch:', err);
                    connectionStatus.textContent = 'Connection Failed';
                    connectionStatus.className = 'disconnected';
                });

            // Listen for messages
            client.on('message', (channel, tags, message, self) => {
                if (self) return; // Ignore messages from the bot itself
                
                // Add the message to chat display
                addChatMessage({
                    type: 'chat',
                    id: tags.id,
                    username: tags.username,
                    displayName: tags['display-name'],
                    color: tags.color || getRandomColor(tags.username),
                    message: message,
                    timestamp: new Date(),
                    badges: tags.badges || {},
                    isMod: tags.mod,
                    isSubscriber: tags.subscriber,
                    isBroadcaster: tags.badges && tags.badges.broadcaster === '1'
                });
                
                // Check for song request command: !osr [code]
                if (message.startsWith('!osr ')) {
                    const code = message.substring(5).trim().toLowerCase();
                    handleSongRequest(code, tags.username);
                }
            });
        }
    }
    
    function getBadgeHTML(badges, isMod) {
        let badgeHTML = '';
        
        if (!badges && !isMod) return badgeHTML;
        
        // Map of badge types to their SVG icons/emoji representations
        const badgeMap = {
            broadcaster: {
                icon: `<span class="badge broadcaster-badge" title="Broadcaster">🎥</span>`,
                priority: 1
            },
            moderator: {
                icon: `<span class="badge moderator-badge" title="Moderator">⚔️</span>`,
                priority: 2
            },
            vip: {
                icon: `<span class="badge vip-badge" title="VIP">💎</span>`,
                priority: 3
            },
            subscriber: {
                icon: `<span class="badge subscriber-badge" title="Subscriber">★</span>`,
                priority: 4
            },
            premium: {
                icon: `<span class="badge premium-badge" title="Twitch Prime">👑</span>`,
                priority: 5
            },
            partner: {
                icon: `<span class="badge partner-badge" title="Partner">✓</span>`,
                priority: 6
            },
            turbo: {
                icon: `<span class="badge turbo-badge" title="Turbo">🔋</span>`,
                priority: 7
            }
        };
        
        // Add badges in priority order
        const badgesToShow = [];
        
        // Handle broadcaster badge
        if (badges && badges.broadcaster) {
            badgesToShow.push(badgeMap.broadcaster);
        }
        
        // Handle moderator badge (can come from badges or isMod)
        if ((badges && badges.moderator) || isMod) {
            badgesToShow.push(badgeMap.moderator);
        }
        
        // Handle other badges
        if (badges) {
            if (badges.vip) badgesToShow.push(badgeMap.vip);
            if (badges.subscriber) badgesToShow.push(badgeMap.subscriber);
            if (badges.premium) badgesToShow.push(badgeMap.premium);
            if (badges.partner) badgesToShow.push(badgeMap.partner);
            if (badges.turbo) badgesToShow.push(badgeMap.turbo);
        }
        
        // Sort by priority and generate HTML
        badgesToShow
            .sort((a, b) => a.priority - b.priority)
            .forEach(badge => {
                badgeHTML += badge.icon;
            });
            
        return badgeHTML;
    }
    
    function addChatMessage(messageData) {
        const messageElement = document.createElement('div');
        messageElement.className = 'chat-message';
        
        if (messageData.type === 'system') {
            // System message (connection, etc.)
            messageElement.innerHTML = `
                <span class="timestamp">${formatTime(new Date())}</span>
                <span class="message-text" style="color: #999;">${messageData.message}</span>
            `;
        } else {
            // User chat message
            const badgeHTML = getBadgeHTML(messageData.badges, messageData.isMod);
            
            messageElement.innerHTML = `
                <span class="timestamp">${formatTime(messageData.timestamp)}</span>
                <span class="badges">${badgeHTML}</span>
                <span class="username" style="color: ${messageData.color};">${messageData.displayName || messageData.username}:</span>
                <span class="message-text">${processMessageText(messageData.message)}</span>
            `;
        }
        
        chatMessages.appendChild(messageElement);
        
        // Auto scroll to bottom only if user hasn't scrolled up
        if (!userScrolledUp) {
            scrollChatToBottom();
        }
        
        // Limit number of messages (optional, to prevent too much memory usage)
        while (chatMessages.children.length > 500) {
            chatMessages.removeChild(chatMessages.children[0]);
        }
    }
    
    function processMessageText(text) {
        // Escape HTML
        let processed = escapeHTML(text);
        
        // Handle links - make them clickable
        processed = processed.replace(
            /(https?:\/\/[^\s]+)/g, 
            '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
        );
        
        // Handle emotes later if needed
        
        return processed;
    }
    
    function formatTime(date) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    
    function escapeHTML(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    function getRandomColor(username) {
        // Generate a consistent color based on username
        let hash = 0;
        for (let i = 0; i < username.length; i++) {
            hash = username.charCodeAt(i) + ((hash << 5) - hash);
        }
        
        // Use hue rotation to get good colors
        const h = Math.abs(hash % 360);
        const s = 70 + Math.abs((hash >> 8) % 30); // 70-100%
        const l = 40 + Math.abs((hash >> 16) % 20); // 40-60%
        
        return `hsl(${h}, ${s}%, ${l}%)`;
    }

    function handleSongRequest(code, requester) {
        const song = songs.find(s => s.osr_code && s.osr_code.toLowerCase() === code);
        
        if (song) {
            // Add a system message for the song request
            addChatMessage({
                type: 'system',
                message: `Song request received: ${song.title} by ${requester}`
            });
            
            // Check if song is already in the request list
            const existingRequest = requests.find(r => r.song.osr_code === song.osr_code);
            
            if (existingRequest) {
                // Update requester if song already exists
                existingRequest.requesters.push(requester);
                saveRequests();
                renderRequestList();
            } else {
                // Add new request
                const request = {
                    id: Date.now().toString(),
                    song: song,
                    requesters: [requester],
                    timestamp: new Date().toISOString()
                };
                
                requests.push(request);
                saveRequests();
                renderRequestList();
            }
        } else {
            // Song not found
            addChatMessage({
                type: 'system',
                message: `Failed song request: "${code}" not found (by ${requester})`
            });
        }
    }
    
    // Get proper image URL for song artwork
    function getArtworkUrl(imageUrl) {
        if (!imageUrl) return null;
        
        // If it's already a full URL, return it
        if (imageUrl.startsWith('http')) {
            return imageUrl;
        }
        
        // Use the official Ongeki URL format
        return `https://ongeki-net.com/ongeki-mobile/img/music/${imageUrl}`;
    }
    
    // Handle clicks on the request list
    function handleRequestListClick(e) {
        // Find closest list item parent
        const listItem = e.target.closest('.request-item');
        if (!listItem) return;
        
        // Check if done button was clicked
        if (e.target.classList.contains('done-btn')) {
            const requestId = listItem.dataset.requestId;
            removeRequest(requestId);
            return;
        }
        
        // Handle selection
        const requestId = listItem.dataset.requestId;
        if (requestId) {
            console.log('Song selected:', requestId);
            selectSong(requestId);
        }
    }

    function renderRequestList() {
        requestList.innerHTML = '';
        
        if (requests.length === 0) {
            requestList.innerHTML = '<li class="empty-list">No requests yet</li>';
            return;
        }
        
        requests.forEach(request => {
            const li = document.createElement('li');
            li.className = 'request-item';
            li.dataset.requestId = request.id; // Add request ID as data attribute
            
            if (request.id === selectedSongId) {
                li.classList.add('selected');
            }
            
            // Create container for better layout
            const requestContent = document.createElement('div');
            requestContent.className = 'request-content';
            
            // Add artwork if available
            const artworkContainer = document.createElement('div');
            artworkContainer.className = 'artwork-container';
            
            if (request.song.image_url) {
                const artwork = document.createElement('img');
                artwork.className = 'song-artwork';
                // Use the getArtworkUrl helper function
                artwork.src = getArtworkUrl(request.song.image_url);
                artwork.alt = request.song.title;
                artwork.onerror = function() {
                    this.src = 'placeholder.png'; // Default image if artwork not found
                    this.onerror = null;
                };
                artworkContainer.appendChild(artwork);
            } else {
                // Use a placeholder image if no artwork available
                const placeholder = document.createElement('div');
                placeholder.className = 'artwork-placeholder';
                placeholder.textContent = request.song.title.charAt(0).toUpperCase();
                artworkContainer.appendChild(placeholder);
            }
            
            const songInfo = document.createElement('div');
            songInfo.className = 'song-info';
            songInfo.innerHTML = `
                <div class="song-title">${request.song.title}</div>
                <div class="requester">Requested by: ${request.requesters.join(', ')}</div>
            `;
            
            const doneBtn = document.createElement('button');
            doneBtn.className = 'done-btn';
            doneBtn.textContent = 'Done';
            
            requestContent.appendChild(artworkContainer);
            requestContent.appendChild(songInfo);
            
            li.appendChild(requestContent);
            li.appendChild(doneBtn);
            
            requestList.appendChild(li);
        });
        
        console.log('Request list rendered with', requests.length, 'items');
    }

    function selectSong(id) {
        console.log('Selecting song with id:', id);
        selectedSongId = id;
        renderRequestList();
        displaySongDetails(id);
    }

    function displaySongDetails(id) {
        const request = requests.find(r => r.id === id);
        
        if (!request) {
            console.log('No request found with id:', id);
            songInfo.innerHTML = '<p>Click on a song to view details</p>';
            return;
        }
        
        console.log('Displaying details for song:', request.song.title);
        const song = request.song;
        
        // Create HTML for details with a cleaner layout and additional information
        let detailsHTML = `
            <div class="song-details-header">
                <h2 class="song-title">${song.title || 'N/A'}</h2>
                ${song.romaji_title ? `<div class="romaji-title">${song.romaji_title}</div>` : ''}
            </div>

            <div class="song-details-grid">
                <div class="details-column">
                    <div class="song-info-item">
                        <span class="song-info-label">Artist:</span> 
                        <span class="song-info-value">${song.artist || 'N/A'}</span>
                        ${song.romaji_artist ? `<div class="romaji-text">${song.romaji_artist}</div>` : ''}
                    </div>

                    <div class="song-info-item">
                        <span class="song-info-label">Search Name:</span> 
                        <span class="song-info-value">${song.title_sort || 'N/A'}</span>
                    </div>

                    <div class="song-info-item">
                        <span class="song-info-label">OSR Code:</span> 
                        <span class="song-info-value">${song.osr_code || 'N/A'}</span>
                    </div>

                    <div class="song-info-item">
                        <span class="song-info-label">Category:</span> 
                        <span class="song-info-value">${song.category || 'N/A'}</span>
                    </div>

                    <div class="song-info-item">
                        <span class="song-info-label">Character:</span> 
                        <span class="song-info-value">${song.character || 'N/A'}</span>
                    </div>
                </div>
                
                <div class="details-column">
                    <div class="song-info-item difficulty-section">
                        <span class="song-info-label">Difficulty:</span>
                        <div class="difficulty-levels">
                            <div class="difficulty-item">
                                <span class="difficulty-name">Basic:</span>
                                <span class="difficulty-value">${song.lev_bas || 'N/A'}</span>
                            </div>
                            <div class="difficulty-item">
                                <span class="difficulty-name">Advanced:</span>
                                <span class="difficulty-value">${song.lev_adv || 'N/A'}</span>
                            </div>
                            <div class="difficulty-item">
                                <span class="difficulty-name">Expert:</span>
                                <span class="difficulty-value">${song.lev_exc || 'N/A'}</span>
                            </div>
                            <div class="difficulty-item">
                                <span class="difficulty-name">Master:</span>
                                <span class="difficulty-value">${song.lev_mas || 'N/A'}</span>
                            </div>
                            ${song.lev_lnt ? `
                            <div class="difficulty-item">
                                <span class="difficulty-name">Lunatic:</span>
                                <span class="difficulty-value">${song.lev_lnt}</span>
                            </div>` : ''}
                        </div>
                    </div>
                </div>
            </div>

            <div class="song-info-item requester-info">
                <span class="song-info-label">Requested by:</span> 
                <span class="song-info-value">${request.requesters.join(', ')}</span>
            </div>
        `;
        
        // Add artwork if available
        if (song.image_url) {
            // Use the getArtworkUrl helper function
            const imageSrc = getArtworkUrl(song.image_url);
            
            detailsHTML = `
                <div class="song-details-container">
                    <div class="song-details-artwork">
                        <img src="${imageSrc}" alt="${song.title}" onerror="this.src='placeholder.png'; this.onerror=null;">
                    </div>
                    <div class="song-details-content">
                        ${detailsHTML}
                    </div>
                </div>
            `;
        }
        
        songInfo.innerHTML = detailsHTML;
    }

    function removeRequest(id) {
        requests = requests.filter(r => r.id !== id);
        
        if (selectedSongId === id) {
            selectedSongId = null;
            songInfo.innerHTML = '<p>Click on a song to view details</p>';
        }
        
        saveRequests();
        renderRequestList();
    }

    function showClearConfirmation() {
        confirmModal.classList.add('open');
    }

    function hideClearConfirmation() {
        confirmModal.classList.remove('open');
    }

    function clearAllRequests() {
        requests = [];
        selectedSongId = null;
        saveRequests();
        renderRequestList();
        songInfo.innerHTML = '<p>Click on a song to view details</p>';
        hideClearConfirmation();
    }

    function saveRequests() {
        localStorage.setItem('ongekiRequests', JSON.stringify(requests));
    }

    function loadRequests() {
        const savedRequests = localStorage.getItem('ongekiRequests');
        if (savedRequests) {
            try {
                requests = JSON.parse(savedRequests);
                console.log('Loaded', requests.length, 'requests from localStorage');
                renderRequestList();
            } catch (error) {
                console.error('Error parsing saved requests:', error);
                localStorage.removeItem('ongekiRequests');
                requests = [];
            }
        }
    }

    // Initial render
    renderRequestList();
});
