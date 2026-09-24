"""Opt-in Windows collector. Python 3.10+, pip install keyring.

Tracks only foreground executable name and duration. Type pause, resume, quit.
The Supabase refresh token is saved in Windows Credential Manager via keyring.
"""
import ctypes
import ctypes.wintypes as wt
import getpass
import json
import os
import sys
import threading
import time
import urllib.request
from datetime import datetime, timezone

try:
    import keyring
except ImportError:
    sys.exit('Run: pip install keyring')

user32, kernel32 = ctypes.windll.user32, ctypes.windll.kernel32
paused, running = False, True

class LASTINPUTINFO(ctypes.Structure):
    _fields_ = [('cbSize', wt.UINT), ('dwTime', wt.DWORD)]

def api(url, method='GET', data=None, headers=None):
    payload = json.dumps(data).encode() if data is not None else None
    request = urllib.request.Request(url, payload, {'Content-Type': 'application/json', **(headers or {})}, method)
    with urllib.request.urlopen(request, timeout=12) as response:
        content = response.read()
        return json.loads(content) if content else None

def current_app():
    info = LASTINPUTINFO(ctypes.sizeof(LASTINPUTINFO), 0)
    user32.GetLastInputInfo(ctypes.byref(info))
    if ((kernel32.GetTickCount() - info.dwTime) & 0xffffffff) > 120000:
        return 'Idle'
    pid = wt.DWORD()
    user32.GetWindowThreadProcessId(user32.GetForegroundWindow(), ctypes.byref(pid))
    handle = kernel32.OpenProcess(0x1000, False, pid.value)
    if not handle:
        return 'Other'
    try:
        size = wt.DWORD(32768)
        buf = ctypes.create_unicode_buffer(size.value)
        return os.path.basename(buf.value)[:120] if kernel32.QueryFullProcessImageNameW(handle, 0, buf, ctypes.byref(size)) else 'Other'
    finally:
        kernel32.CloseHandle(handle)

def category(name):
    lower = name.lower()
    if lower == 'idle': return 'Idle'
    if any(x in lower for x in ('code.exe', 'unity', 'blender', 'devenv', 'idea64', 'pycharm')): return 'Development'
    if 'excel' in lower: return 'Business'
    return 'Other'  # Browsers are not assumed to be entertainment.

def commands():
    global paused, running
    while running:
        try: cmd = input().strip().lower()
        except EOFError: return
        if cmd == 'pause': paused = True; print('Tracking paused.')
        elif cmd == 'resume': paused = False; print('Tracking resumed.')
        elif cmd == 'quit': running = False

def main():
    app_url = os.environ.get('CONTROL_CENTER_URL', 'http://127.0.0.1:3000').rstrip('/')
    config = api(app_url + '/api/config')
    base, key = config['supabaseUrl'], config['publishableKey']
    if not base or not key: sys.exit('Supabase is not configured on the web app')
    email = input('Account email: ').strip()
    refresh = keyring.get_password('AachmanControlCenter', email)
    session = None
    if refresh:
        try: session = api(base + '/auth/v1/token?grant_type=refresh_token', 'POST', {'refresh_token': refresh}, {'apikey': key})
        except Exception: keyring.delete_password('AachmanControlCenter', email)
    if not session:
        session = api(base + '/auth/v1/token?grant_type=password', 'POST', {'email': email, 'password': getpass.getpass('Password: ')}, {'apikey': key})
    keyring.set_password('AachmanControlCenter', email, session['refresh_token'])
    expiry = time.time() + session['expires_in'] - 60
    user = api(base + '/auth/v1/user', headers={'apikey': key, 'Authorization': 'Bearer ' + session['access_token']})

    def upload(name, start, end):
        nonlocal session, expiry
        if end-start < 10: return
        if time.time() >= expiry:
            session = api(base + '/auth/v1/token?grant_type=refresh_token', 'POST', {'refresh_token': session['refresh_token']}, {'apikey': key})
            keyring.set_password('AachmanControlCenter', email, session['refresh_token'])
            expiry = time.time() + session['expires_in'] - 60
        data = {'user_id': user['id'], 'app': name, 'category': category(name),
                'started_at': datetime.fromtimestamp(start, timezone.utc).isoformat(),
                'ended_at': datetime.fromtimestamp(end, timezone.utc).isoformat()}
        api(base + '/rest/v1/cc_activity_sessions', 'POST', data, {'apikey': key, 'Authorization': 'Bearer ' + session['access_token'], 'Prefer': 'return=minimal'})

    print('Tracking app names and time. Type pause, resume, or quit.')
    threading.Thread(target=commands, daemon=True).start()
    name, started = current_app(), time.time()
    try:
        while running:
            time.sleep(5)
            next_name = current_app() if not paused else None
            if next_name != name or time.time()-started > 300:
                ended = time.time()
                if name:
                    try: upload(name, started, ended)
                    except Exception as error: print('Sync failed:', error)
                name, started = next_name, ended
    except KeyboardInterrupt: pass
    if name and not paused:
        try: upload(name, started, time.time())
        except Exception as error: print('Final sync failed:', error)
    print('Tracking stopped.')

if __name__ == '__main__': main()
