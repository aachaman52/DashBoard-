"""Opt-in Windows application timing collector. Python 3.10+, no dependencies.

Tracks executable name only. Does not inspect window titles or typed content.
Press Ctrl+C to stop. Sessions shorter than 10 seconds are discarded.
"""
import ctypes
import ctypes.wintypes as wintypes
import json
import os
import time
import urllib.request
from datetime import datetime, timezone

user32 = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32
PROCESS_QUERY_LIMITED_INFORMATION = 0x1000

class LASTINPUTINFO(ctypes.Structure):
    _fields_ = [('cbSize', wintypes.UINT), ('dwTime', wintypes.DWORD)]

def foreground():
    info = LASTINPUTINFO(ctypes.sizeof(LASTINPUTINFO), 0)
    user32.GetLastInputInfo(ctypes.byref(info))
    idle = (kernel32.GetTickCount() - info.dwTime) & 0xffffffff
    if idle >= 120000:
        return 'Idle'
    window = user32.GetForegroundWindow()
    pid = wintypes.DWORD()
    user32.GetWindowThreadProcessId(window, ctypes.byref(pid))
    handle = kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid.value)
    if not handle:
        return 'Other'
    try:
        size = wintypes.DWORD(32768)
        buffer = ctypes.create_unicode_buffer(size.value)
        kernel32.QueryFullProcessImageNameW(handle, 0, buffer, ctypes.byref(size))
        return os.path.basename(buffer.value)[:120] or 'Other'
    finally:
        kernel32.CloseHandle(handle)

def upload(name, start, end):
    if end - start < 10:
        return
    base = os.environ.get('CONTROL_CENTER_URL', 'http://127.0.0.1:3000')
    token = os.environ.get('CONTROL_CENTER_TOKEN', '')
    if len(token) < 32:
        raise RuntimeError('Set CONTROL_CENTER_TOKEN to the same 32+ character value as the server')
    payload = json.dumps({'app': name, 'start': datetime.fromtimestamp(start, timezone.utc).isoformat(), 'end': datetime.fromtimestamp(end, timezone.utc).isoformat()}).encode()
    request = urllib.request.Request(base + '/api/activity', payload, {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'}, 'POST')
    with urllib.request.urlopen(request, timeout=8) as response:
        response.read()

if __name__ == '__main__':
    print('Collector active. Executable names and time only. Ctrl+C stops tracking.')
    current, started = foreground(), time.time()
    try:
        while True:
            time.sleep(5)
            next_app = foreground()
            if next_app != current or time.time() - started >= 300:
                ended = time.time()
                try:
                    upload(current, started, ended)
                except Exception as error:
                    print('Upload failed:', error)
                current, started = next_app, ended
    except KeyboardInterrupt:
        upload(current, started, time.time())
        print('Collector stopped.')
