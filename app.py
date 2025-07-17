import os
import re
import time
import glob
import uuid
import threading
import atexit

from flask import Flask, request, send_file, render_template, jsonify
from flask_cors import CORS
from urllib.parse import urlparse

import yt_dlp


app = Flask(__name__, static_folder='static', static_url_path='/static')
CORS(app)

# Configuration
DOWNLOAD_FOLDER = 'downloads'
os.makedirs(DOWNLOAD_FOLDER, exist_ok=True)

# Download management
download_controllers = {}
download_status = {}

class DownloadController:
    def __init__(self, client_id):
        self.client_id = client_id
        self.paused = False
        self.stopped = False
        self.ydl = None

    def pause(self):
        self.paused = True
        if self.ydl:
            self.ydl.params['noprogress'] = True

    def resume(self):
        self.paused = False
        if self.ydl:
            self.ydl.params['noprogress'] = False

    def stop(self):
        self.stopped = True
        if self.ydl:
            self.ydl.break_download()

def sanitize_filename(filename):
    return re.sub(r'[\\/*?:"<>|]', "", filename)

def is_youtube_url(url):
    youtube_domains = ['youtube.com', 'youtu.be', 'www.youtube.com', 'm.youtube.com']
    parsed = urlparse(url)
    return any(domain in parsed.netloc for domain in youtube_domains)

def format_bytes(bytes):
    if not bytes or bytes == 0: return '0 Bytes'
    units = ['Bytes', 'KB', 'MB', 'GB']
    i = 0
    while bytes >= 1024 and i < len(units)-1:
        bytes /= 1024
        i += 1
    return f"{bytes:.2f} {units[i]}"

def format_duration(seconds):
    if not seconds: return 'N/A'
    h = int(seconds / 3600)
    m = int(seconds % 3600 / 60)
    s = int(seconds % 3600 % 60)
    parts = []
    if h > 0:
        parts.append(str(h))
    parts.append(f"{m:02d}")
    parts.append(f"{s:02d}")
    return ":".join(parts)

def cleanup_old_files():
    """Remove files older than 1 hour"""
    now = time.time()
    for filepath in glob.glob(os.path.join(DOWNLOAD_FOLDER, '*')):
        if os.path.getmtime(filepath) < now - 3600:
            try:
                os.remove(filepath)
            except Exception:
                pass

atexit.register(cleanup_old_files)

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/get_info', methods=['POST'])
def get_video_info():
    url = request.json.get('url')
    if not url or not is_youtube_url(url):
        return jsonify({"error": "Please enter a valid YouTube URL"}), 400

    try:
        with yt_dlp.YoutubeDL({'quiet': True}) as ydl:
            info = ydl.extract_info(url, download=False)
            thumbnail = info.get('thumbnail') or (info.get('thumbnails', [{}])[-1].get('url') if info.get('thumbnails') else '')
            formats = info.get('formats', [])
            video_formats = []
            audio_formats = []
            seen_heights = set()
            # ...existing code...
            for f in formats:
                # Only include formats with both video and audio (progressive)
                if f.get('vcodec') != 'none' and f.get('acodec') != 'none':
                    height = f.get('height')
                    filesize = f.get('filesize') or f.get('filesize_approx')
                    # Only show if size is known and in range
                    if (
                        height and 144 <= height <= 2160 and
                        height not in seen_heights and
                        filesize and filesize > 0 and filesize >= 1000000  # >1MB
                    ):
                        video_formats.append({
                            'format_id': f['format_id'],
                            'ext': f['ext'],
                            'height': height,
                            'fps': f.get('fps'),
                            'filesize': filesize,
                        })
                        seen_heights.add(height)
                # Only best audio, skip unknown/minimal
                elif f.get('acodec') != 'none' and f.get('vcodec') == 'none':
                    filesize = f.get('filesize') or f.get('filesize_approx')
                    if filesize and filesize > 0 and filesize >= 100000:  # >100KB
                        audio_formats.append({
                            'format_id': f['format_id'],
                            'ext': f['ext'],
                            'abr': f.get('abr'),
                            'filesize': filesize,
                        })
# ...existing code...
            
            # Sort video formats by height
            video_formats = sorted(video_formats, key=lambda x: x['height'])
            return jsonify({
                "title": info.get('title', 'Untitled Video'),
                "thumbnail": thumbnail,
                "duration": info.get('duration'),
                "uploader": info.get('uploader', 'Unknown uploader'),
                "view_count": info.get('view_count'),
                "video_formats": video_formats,
                "audio_formats": audio_formats,
                "url": url
            })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

class YoutubeDLProgressHook:
    def __init__(self, client_id):
        self.client_id = client_id
        download_status[client_id] = {
            'status': 'starting',
            'percent': '0%',
            'speed': '0 KB/s',
            'eta': '--:--',
            'downloaded_bytes': 0,
            'total_bytes': 0,
            'final_path': None
        }

    def __call__(self, d):
        if d['status'] == 'downloading':
            percent = d.get('downloaded_bytes', 0) / d.get('total_bytes', 1) * 100 if d.get('total_bytes') else 0
            download_status[self.client_id].update({
                'status': 'downloading',
                'percent': f"{percent:.2f}%",
                'speed': format_bytes(d.get('speed', 0)) + '/s' if d.get('speed') else '0 KB/s',
                'eta': format_duration(d.get('eta')) if d.get('eta') else '--:--',
                'downloaded_bytes': d.get('downloaded_bytes', 0),
                'total_bytes': d.get('total_bytes', 0)
            })
        elif d['status'] == 'finished':
            download_status[self.client_id]['status'] = 'completed'
            download_status[self.client_id]['final_path'] = d.get('filename')
        elif d['status'] == 'error':
            download_status[self.client_id]['status'] = 'error'

@app.route('/download', methods=['POST'])
def download_video():
    url = request.json.get('url')
    format_id = request.json.get('format_id')
    title = request.json.get('title', 'youtube_video')
    
    if not url or not format_id:
        return jsonify({"error": "Missing URL or format"}), 400
    
    client_id = str(uuid.uuid4())
    controller = DownloadController(client_id)
    download_controllers[client_id] = controller

    # Unique output filename per download
    safe_title = sanitize_filename(title)
    output_template = os.path.join(DOWNLOAD_FOLDER, f"{safe_title}-{client_id}-%(id)s.%(ext)s")

    def download_thread():
        try:
            ydl_opts = {
                'format': format_id,
                'outtmpl': output_template,
                'progress_hooks': [YoutubeDLProgressHook(client_id)],
                'quiet': True,
                'noprogress': False,
                'retries': 3,
                'continuedl': True,
                'noplaylist': True,
                'merge_output_format': 'mp4',
            }
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                controller.ydl = ydl
                ydl.download([url])
        except Exception as e:
            download_status[client_id]['status'] = 'error'
            download_status[client_id]['error'] = str(e)

    threading.Thread(target=download_thread).start()
    
    return jsonify({
        "client_id": client_id,
        "message": "Download started"
    })

@app.route('/progress/<client_id>', methods=['GET'])
def check_progress(client_id):
    if client_id not in download_status:
        return jsonify({"error": "Not found"}), 404
    return jsonify(download_status[client_id])

@app.route('/control/<client_id>', methods=['POST'])
def control_download(client_id):
    if client_id not in download_controllers:
        return jsonify({"error": "Not found"}), 404
    
    action = request.json.get('action')
    controller = download_controllers[client_id]
    
    if action == 'pause':
        controller.pause()
        download_status[client_id]['status'] = 'paused'
        return jsonify({"message": "Download paused"})
    elif action == 'resume':
        controller.resume()
        download_status[client_id]['status'] = 'downloading'
        return jsonify({"message": "Download resumed"})
    elif action == 'stop':
        controller.stop()
        download_status[client_id]['status'] = 'stopped'
        return jsonify({"message": "Download stopped"})
    return jsonify({"error": "Invalid action"}), 400

@app.route('/get_file/<client_id>', methods=['GET'])
def get_file(client_id):
    if client_id not in download_status:
        return jsonify({"error": "Download not found"}), 404
    
    status = download_status[client_id]
    if status['status'] != 'completed':
        return jsonify({"error": "Download not completed"}), 400
    
    final_path = status.get('final_path')
    if not final_path:
        return jsonify({"error": "File not found"}), 404

    # Wait up to 3 seconds for file to appear (handles race condition)
    for _ in range(15):
        if os.path.exists(final_path):
            break
        time.sleep(0.2)
    else:
        return jsonify({"error": "File not found"}), 404
    
    try:
        return send_file(
            final_path,
            as_attachment=True,
            download_name=os.path.basename(final_path)
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000) 