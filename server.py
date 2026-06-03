#!/usr/bin/env python3
"""
Simple HTTP server for Todo app with file-based persistence
"""

import json
import os
import tempfile
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import sys

DATA_FILE = 'tasks-data.json'

class TodoHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed_path = urlparse(self.path)

        # API endpoint to get tasks
        if parsed_path.path == '/api/tasks':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()

            # Load tasks from file
            if os.path.exists(DATA_FILE):
                with open(DATA_FILE, 'r') as f:
                    data = f.read()
            else:
                data = '{}'

            self.wfile.write(data.encode())
            return

        # Serve static files
        super().do_GET()

    def do_POST(self):
        parsed_path = urlparse(self.path)

        # API endpoint to save tasks
        if parsed_path.path == '/api/tasks':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)

            # Save tasks to file
            try:
                # Validate JSON
                json_data = json.loads(post_data.decode())

                # Atomic write: write to temp file then rename so a crash mid-write can't corrupt data
                dir_name = os.path.dirname(os.path.abspath(DATA_FILE))
                with tempfile.NamedTemporaryFile('w', dir=dir_name, delete=False, suffix='.tmp') as tmp:
                    tmp.write(json.dumps(json_data, indent=2))
                    tmp_path = tmp.name
                os.replace(tmp_path, DATA_FILE)

                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(b'{"status":"success"}')
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({'status': 'error', 'message': str(e)}).encode())

            return

        self.send_response(404)
        self.end_headers()

    def do_OPTIONS(self):
        # Handle CORS preflight
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

def run(port=8080):
    server_address = ('', port)
    httpd = HTTPServer(server_address, TodoHandler)
    print(f'📊 Work Todo Server running on http://localhost:{port}')
    print(f'📁 Data file: {os.path.abspath(DATA_FILE)}')
    print(f'Press Ctrl+C to stop')
    httpd.serve_forever()

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    run(port)
