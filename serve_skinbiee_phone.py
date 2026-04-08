#!/usr/bin/env python3
import http.server
import os
import socket
import socketserver
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


def get_lan_ip():
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("8.8.8.8", 80))
        return sock.getsockname()[0]
    except OSError:
        return "localhost"
    finally:
        sock.close()


lan_ip = get_lan_ip()

with socketserver.TCPServer(("0.0.0.0", PORT), NoCacheHTTPRequestHandler) as httpd:
    print("Skinbiee Frontend is LIVE!")
    print(f"Access on this computer: http://127.0.0.1:{PORT}/skinbiee.html")
    print(f"Access on your phone: http://{lan_ip}:{PORT}/skinbiee.html")
    print("Press CTRL+C to stop.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
        httpd.server_close()
