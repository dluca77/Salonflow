"""Local-only real UI preview with fictional data; never connects to production.
Run: python scripts/preview-backoffice.py ; browse localhost:8901/agenda/
"""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent.parent

class Preview(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        path = self.path.split('?', 1)[0]
        if path.endswith('/'):
            path += 'index.html'
        file = (ROOT / path.lstrip('/')).resolve()
        if not file.is_relative_to(ROOT):
            self.send_error(403)
            return
        if file.suffix == '.html' and file.exists():
            page = file.read_text(encoding='utf-8')
            page = re.sub(r'<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>', '<script src="/scripts/preview-fixtures.js"></script>', page)
            page = page.replace('</head>', '<style>body{padding-bottom:34px!important}.preview-label{position:fixed;bottom:0;left:0;right:0;z-index:999999;background:#e7f29b;color:#261b30;text-align:center;padding:9px 12px;font:600 12px system-ui;pointer-events:none}</style></head>')
            page = page.replace('</body>', '<aside class="preview-label">VOORBEELDDATA · Studio Nova · Fictieve klanten en bedragen · Geen echte boekingen of betalingen</aside></body>')
            payload = page.encode()
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Security-Policy', "connect-src 'none'; form-action 'none'; object-src 'none'")
            self.send_header('Content-Length', str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
        else:
            super().do_GET()

if __name__ == '__main__':
    ThreadingHTTPServer(('127.0.0.1', 8901), Preview).serve_forever()
