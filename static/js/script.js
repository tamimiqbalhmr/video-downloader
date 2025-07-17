document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const urlInput = document.getElementById('urlInput');
    const fetchBtn = document.getElementById('fetchBtn');
    const videoInfoSection = document.getElementById('videoInfoSection');
    const videoThumbnail = document.getElementById('videoThumbnail');
    const videoTitle = document.getElementById('videoTitle');
    const videoDuration = document.getElementById('videoDuration');
    const uploaderBadge = document.getElementById('uploaderBadge');
    const viewsBadge = document.getElementById('viewsBadge');
    
    // Download Panel Elements
    const floatingDownloadBtn = document.getElementById('floatingDownloadBtn');
    const downloadPanel = document.getElementById('downloadPanel');
    const closePanelBtn = document.getElementById('closePanelBtn');
    const panelThumbnail = document.getElementById('panelThumbnail');
    const panelTitle = document.getElementById('panelTitle');
    const panelDuration = document.getElementById('panelDuration');
    const panelQuality = document.getElementById('panelQuality');
    const videoFormatsContainer = document.getElementById('videoFormatsContainer');
    const audioFormatsContainer = document.getElementById('audioFormatsContainer');
    const downloadProgress = document.getElementById('downloadProgress');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const speedText = document.getElementById('speedText');
    const timeLeft = document.getElementById('timeLeft');
    const serverDownloadBtn = document.getElementById('serverDownloadBtn');
    
    // State
    let selectedFormat = null;
    let currentVideoInfo = null;
    let downloadInProgress = false;

    // Fetch video info
    fetchBtn.addEventListener('click', function() {
        const url = urlInput.value.trim();
        if (!url) {
            showAlert('Please enter a YouTube URL', 'warning');
            return;
        }
        fetchBtn.disabled = true;
        fetchBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Fetching...';
        fetch('/get_info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        })
        .then(response => response.json())
        .then(data => {
            fetchBtn.disabled = false;
            fetchBtn.innerHTML = 'Fetch';
            if (data.error) {
                showAlert(data.error, 'danger');
                return;
            }
            currentVideoInfo = data;
            renderVideoInfo(data);
        })
        .catch(() => {
            fetchBtn.disabled = false;
            fetchBtn.innerHTML = 'Fetch';
            showAlert('Failed to fetch video info', 'danger');
        });
    });

    function renderVideoInfo(info) {
        videoInfoSection.style.display = 'block';
        videoThumbnail.src = info.thumbnail;
        videoTitle.textContent = info.title;
        videoDuration.textContent = formatDuration(info.duration);
        uploaderBadge.textContent = info.uploader || '';
        viewsBadge.textContent = info.view_count ? formatNumber(info.view_count) + ' views' : '';

        // Render formats
        videoFormatsContainer.innerHTML = '';
        audioFormatsContainer.innerHTML = '';
        if (info.video_formats && info.video_formats.length) {
            info.video_formats.forEach(format => {
                const card = createFormatCard(format, 'video');
                videoFormatsContainer.appendChild(card);
            });
        }
        if (info.audio_formats && info.audio_formats.length) {
            info.audio_formats.forEach(format => {
                const card = createFormatCard(format, 'audio');
                audioFormatsContainer.appendChild(card);
            });
        }
        // Reset panel and progress
        resetDownloadPanel();
    }

    function createFormatCard(format, type) {
        const card = document.createElement('div');
        card.className = 'format-card mb-2 p-2 border rounded cursor-pointer';
        card.innerHTML = `
            <div>
                <strong>${type === 'video' ? (format.height ? `${format.height}p` : '') : format.ext.toUpperCase()}</strong>
                ${format.fps ? `<span class="ms-2">${format.fps}fps</span>` : ''}
                ${type === 'audio' && format.abr ? `<span class="ms-2">${format.abr}kbps</span>` : ''}
            </div>
            <div class="text-muted small">
                ${format.ext.toUpperCase()} &middot; ${format.filesize ? formatBytes(format.filesize) : 'Unknown size'}
            </div>
        `;
        card.addEventListener('click', () => selectFormat(card, format));
        return card;
    }

    function selectFormat(card, format) {
        document.querySelectorAll('.format-card').forEach(c => {
            c.classList.remove('selected');
        });
        card.classList.add('selected');
        selectedFormat = format;

        // Reset progress and state for new selection
        downloadInProgress = false;
        downloadProgress.style.display = 'none';
        progressBar.style.width = '0%';
        progressText.textContent = '0%';
        speedText.textContent = '0 KB/s';
        timeLeft.textContent = '--:--';

        // Update info panel
        panelThumbnail.src = currentVideoInfo.thumbnail;
        panelTitle.textContent = currentVideoInfo.title;
        panelDuration.textContent = formatDuration(currentVideoInfo.duration);

        if (format.height) {
            panelQuality.textContent = `${format.height}p${format.fps ? ` ${format.fps}fps` : ''}`;
        } else {
            panelQuality.textContent = `${format.ext.toUpperCase()} ${format.abr ? format.abr + 'kbps' : ''}`;
        }

        downloadPanel.style.display = 'block';
    }

    function resetDownloadPanel() {
        downloadPanel.style.display = 'none';
        downloadProgress.style.display = 'none';
        progressBar.style.width = '0%';
        progressText.textContent = '0%';
        speedText.textContent = '0 KB/s';
        timeLeft.textContent = '--:--';
        selectedFormat = null;
        downloadInProgress = false;
        serverDownloadBtn.disabled = false;
        serverDownloadBtn.innerHTML = '<i class="bi bi-cloud-download me-1"></i> Download';
    }

    // Download panel controls
    floatingDownloadBtn.addEventListener('click', () => {
        if (currentVideoInfo) downloadPanel.style.display = 'block';
    });
    closePanelBtn.addEventListener('click', () => {
        downloadPanel.style.display = 'none';
    });

    serverDownloadBtn.addEventListener('click', startServerDownload);

    function startServerDownload() {
        if (!selectedFormat || !currentVideoInfo) {
            showAlert('Please select a format first', 'warning');
            return;
        }
        if (downloadInProgress) {
            showAlert('A download is already in progress', 'warning');
            return;
        }
        downloadInProgress = true;
        serverDownloadBtn.disabled = true;
        serverDownloadBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Downloading...';
        downloadProgress.style.display = 'block';
        progressBar.style.width = '0%';
        progressText.textContent = '0%';
        speedText.textContent = '0 KB/s';
        timeLeft.textContent = '--:--';

        fetch('/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: currentVideoInfo.url,
                format_id: selectedFormat.format_id,
                title: currentVideoInfo.title
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) throw new Error(data.error);
            pollDownloadProgress(data.client_id);
        })
        .catch(error => {
            showAlert(error.message, 'danger');
            downloadInProgress = false;
            downloadProgress.style.display = 'none';
            serverDownloadBtn.disabled = false;
            serverDownloadBtn.innerHTML = '<i class="bi bi-cloud-download me-1"></i> Download';
        });
    }

    function pollDownloadProgress(clientId) {
        fetch(`/progress/${clientId}`)
            .then(response => response.json())
            .then(data => {
                if (data.error) throw new Error(data.error);

                progressBar.style.width = data.percent;
                progressText.textContent = data.percent;
                speedText.textContent = formatSpeed(data.speed);
                timeLeft.textContent = data.eta;

                if (data.status === 'completed') {
                    downloadInProgress = false;
                    showAlert('Download completed!', 'success');
                    serverDownloadBtn.disabled = false;
                    serverDownloadBtn.innerHTML = '<i class="bi bi-cloud-download me-1"></i> Download';
                    fetchDownloadedFile(clientId);
                } else if (data.status === 'error' || data.status === 'stopped') {
                    downloadInProgress = false;
                    showAlert(`Download ${data.status}`, 'danger');
                    serverDownloadBtn.disabled = false;
                    serverDownloadBtn.innerHTML = '<i class="bi bi-cloud-download me-1"></i> Download';
                } else {
                    setTimeout(() => pollDownloadProgress(clientId), 1000);
                }
            })
            .catch(error => {
                downloadInProgress = false;
                showAlert('Error checking download progress', 'danger');
                serverDownloadBtn.disabled = false;
                serverDownloadBtn.innerHTML = '<i class="bi bi-cloud-download me-1"></i> Download';
            });
    }

    function fetchDownloadedFile(clientId) {
        window.location.href = `/get_file/${clientId}`;
    }

    // Utility functions
    function formatDuration(seconds) {
        if (!seconds) return 'N/A';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}` : `${m}:${s.toString().padStart(2, '0')}`;
    }

    function formatBytes(bytes) {
        if (!bytes || bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function formatNumber(num) {
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }

    function formatSpeed(speedStr) {
        if (!speedStr) return '0 KB/s';
        return speedStr.replace('KiB/s', 'KB/s').replace('MiB/s', 'MB/s');
    }

    function showAlert(message, type) {
        const alert = document.createElement('div');
        alert.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
        alert.style.top = '20px';
        alert.style.right = '20px';
        alert.style.zIndex = '1100';
        alert.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        document.body.appendChild(alert);
        setTimeout(() => {
            alert.classList.remove('show');
            setTimeout(() => alert.remove(), 150);
        }, 5000);
    }
});