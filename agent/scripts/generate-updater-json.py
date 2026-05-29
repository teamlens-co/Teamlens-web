#!/usr/bin/env python3
"""Generate teamlens-agent-latest.json for Tauri updater."""
import json, os, datetime, glob, re, sys

# Force UTF-8 for stdout on Windows
sys.stdout.reconfigure(encoding='utf-8')

run_number = sys.argv[1] if len(sys.argv) > 1 else '0'

# Read version from package.json
with open('package.json') as f:
    ver = re.search(r'"version":\s*"([^"]+)"', f.read()).group(1)

# Read NSIS signature
sig = ''
sig_dir = 'src-tauri/target/release/bundle/nsis'
sig_files = glob.glob(os.path.join(sig_dir, '*.exe.sig'))
if sig_files:
    with open(sig_files[0]) as f:
        sig = f.read().strip()

# Also try .msi.sig as fallback
if not sig:
    sig_files = glob.glob(os.path.join(sig_dir.replace('nsis', 'msi'), '*.msi.sig'))
    if sig_files:
        with open(sig_files[0]) as f:
            sig = f.read().strip()

data = {
    'version': ver,
    'notes': 'TeamLens Desktop Agent - Build #{}'.format(run_number),
    'pub_date': datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'),
    'platforms': {
        'windows-x86_64': {
            'signature': sig,
            'url': 'https://github.com/teamlens-co/teamlens-web-server/releases/download/agent-v{}/TeamLens_{}_x64-setup.exe'.format(run_number, ver)
        }
    }
}

with open('src-tauri/target/release/teamlens-agent-latest.json', 'w') as f:
    json.dump(data, f, indent=2)

with open('src-tauri/target/release/bundle/teamlens-agent-latest.json', 'w') as f:
    json.dump(data, f, indent=2)

print('[OK] Generated updater JSON')
print(json.dumps(data, indent=2))
