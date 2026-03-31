#!/usr/bin/env python3
"""No-cache HTTP server for local development."""
import http.server
import os

class NoCacheHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

os.chdir("frontend")
httpd = http.server.HTTPServer(("", 8000), NoCacheHTTPRequestHandler)
print("Serving on http://localhost:8000")
httpd.serve_forever()
