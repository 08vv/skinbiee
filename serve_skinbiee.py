#!/usr/bin/env python3
import http.server
import socketserver
import os
import sys

PORT = 8001
DIRECTORY = "frontend"

if not os.path.exists(DIRECTORY):
    print(f"Error: Directory '{DIRECTORY}' not found.")
    sys.exit(1)

os.chdir(DIRECTORY)

class NoCacheHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

# Explicitly bind to 127.0.0.1 to avoid IPv6 issues on Windows
with socketserver.TCPServer(("127.0.0.1", PORT), NoCacheHTTPRequestHandler) as httpd:
    print(f"🧸 Skinbiee Frontend is LIVE!")
    print(f"👉 Access at: http://127.0.0.1:{PORT}/skinbiee.html")
    print(f"👉 Or: http://localhost:{PORT}/skinbiee.html")
    print(f"Press CTRL+C to stop.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
        httpd.server_close()
