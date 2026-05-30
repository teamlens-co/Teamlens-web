#!/usr/bin/env python3
"""Generate teamlens-agent-latest.json for Tauri updater.
Detects the built MSI/exe and signature from the filesystem so URLs are always correct."""
import json, os, datetime, glob, re, sys

# Force UTF-8 for stdout on Windows
sys.stdout.reconfigure(encoding='utf-8')

run_number = sys.argv[1] if len(sys.argv) > 1 else '0'

# Build version from run number
build_version = '0.1.{}'.format(run_number)

# Update tauri.conf.json & package.json with correct version
for path in ['src-tauri/tauri.conf.json', 'package.json']:
    with open(path) as f:
        cfg = json.load(f)
    if cfg.get('version') != build_version:
        cfg['version'] = build_version
        with open(path, 'w') as f:
            json.dump(cfg, f, indent=2)
        print('[OK] Updated {} version to {}'.format(path, build_version))

# Find the built MSI/exe + sig in the bundle dirs
bundle_dir = 'src-tauri/target/release/bundle'
installer_url = ''
signature = ''

# Try NSIS installer first (.exe)
nsis_dir = os.path.join(bundle_dir, 'nsis')
if os.path.isdir(nsis_dir):
    exe_files = glob.glob(os.path.join(nsis_dir, '*.exe'))
    sig_files = glob.glob(os.path.join(nsis_dir, '*.exe.sig'))
    if exe_files and sig_files:
        installer_name = os.path.basename(exe_files[0])
        with open(sig_files[0]) as f:
            signature = f.read().strip()
        installer_url = 'https://github.com/teamlens-co/teamlens-web-server/releases/download/agent-v{}/{}'.format(run_number, installer_name)

# Fallback to MSI
if not installer_url:
    msi_dir = os.path.join(bundle_dir, 'msi')
    if os.path.isdir(msi_dir):
        msi_files = glob.glob(os.path.join(msi_dir, '*.msi'))
        sig_files = glob.glob(os.path.join(msi_dir, '*.msi.sig'))
        if msi_files and sig_files:
            installer_name = os.path.basename(msi_files[0])
            with open(sig_files[0]) as f:
                signature = f.read().strip()
            installer_url = 'https://github.com/teamlens-co/teamlens-web-server/releases/download/agent-v{}/{}'.format(run_number, installer_name)

data = {
    'version': build_version,
    'notes': 'TeamLens Desktop Agent - Build #{}'.format(run_number),
    'pub_date': datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'),
    'platforms': {
        'windows-x86_64': {
            'signature': signature,
            'url': installer_url
        }
    }
}

with open('src-tauri/target/release/teamlens-agent-latest.json', 'w') as f:
    json.dump(data, f, indent=2)

with open('src-tauri/target/release/bundle/teamlens-agent-latest.json', 'w') as f:
    json.dump(data, f, indent=2)

print('[OK] Generated updater JSON')
print(json.dumps(data, indent=2))
