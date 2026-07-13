import http.server
import socketserver
import os
import re

os.chdir(os.path.dirname(os.path.abspath(__file__)))
PORT = 3002

class Handler(http.server.SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def send_head(self):
        path = self.translate_path(self.path)
        # Range request support for video seeking
        range_header = self.headers.get('Range')
        if range_header and os.path.isfile(path):
            return self._send_partial(path, range_header)
        return super().send_head()

    def _send_partial(self, path, range_header):
        m = re.match(r'bytes=(\d*)-(\d*)', range_header)
        if not m:
            return super().send_head()
        file_size = os.path.getsize(path)
        start = int(m.group(1)) if m.group(1) else 0
        end = int(m.group(2)) if m.group(2) else file_size - 1
        end = min(end, file_size - 1)
        length = end - start + 1
        import mimetypes
        ctype = mimetypes.guess_type(path)[0] or 'application/octet-stream'
        f = open(path, 'rb')
        f.seek(start)
        self.send_response(206)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Range', f'bytes {start}-{end}/{file_size}')
        self.send_header('Content-Length', str(length))
        self.send_header('Accept-Ranges', 'bytes')
        self.end_headers()
        return f

    def end_headers(self):
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, fmt, *a):
        print(fmt % a)

class ThreadingHTTPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True

with ThreadingHTTPServer(("127.0.0.1", PORT), Handler) as httpd:
    print(f"MCFWebs at http://127.0.0.1:{PORT}")
    httpd.serve_forever()
