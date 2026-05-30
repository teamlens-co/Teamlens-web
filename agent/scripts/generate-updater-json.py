#!/usr/bin/env python3
"""Generate teamlens-agent-latest.json for Tauri updater.
Also writes version to tauri.conf.json so the MSI/EXE has the correct semver."""
import json, os, datetime, glob, re, sys

# Force UTF-8 for stdout on Windows
sys.stdout.reconfigure(encoding='utf-8')

run_number = sys.argv[1] if len(sys.argv) > 1 else '0'

# Build version from run number
build_version = '0.1.{}'.format(run_number)

# Write version into tauri.conf.json so the baked-in MSI version matches latest.json
tauri_conf = 'src-tauri/tauri.conf.json'
with open(tauri_conf) as f:
    conf = json.load(f)
if conf.get('version') != build_version:
    conf['version'] = build_version
    with open(tauri_conf, 'w') as f:
        json.dump(conf, f, indent=2)
    print('[OK] Updated {} version to {}'.format(tauri_conf, build_version))

# Write version into package.json as well
package_json = 'package.json'
with open(package_json) as f:
    pkg = json.load(f)
if pkg.get('version') != build_version:
    pkg['version'] = build_version
    with open(package_json, 'w') as f:
        json.dump(pkg, f, indent=2)
    print('[OK] Updated {} version to {}'.format(package_json, build_version))

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
    'version': build_version,
    'notes': 'TeamLens Desktop Agent - Build #{}'.format(run_number),
    'pub_date': datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'),
    'platforms': {
        'windows-x86_64': {
            'signature': sig,
            'url': 'https://github.com/teamlens-co/teamlens-web-server/releases/download/agent-v{}/TeamLens_{}_x64-setup.exe'.format(run_number, build_version)
        }
    }
}

with open('src-tauri/target/release/teamlens-agent-latest.json', 'w') as f:
    json.dump(data, f, indent=2)

with open('src-tauri/target/release/bundle/teamlens-agent-latest.json', 'w') as f:
    json.dump(data, f, indent=2)

print('[OK] Generated updater JSON')
print(json.dumps(data, indent=2))
