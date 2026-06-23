#!/usr/bin/env python3
"""Generate teamlens-agent-latest.json for Tauri updater.
Detects built installers and signatures from the filesystem so URLs are always correct.
Supports Windows (MSI/NSIS) and Linux (AppImage/deb)."""
import json, os, datetime, glob, re, sys

# Force UTF-8 for stdout on Windows
sys.stdout.reconfigure(encoding='utf-8')

run_number = sys.argv[1] if len(sys.argv) > 1 else '0'

# Build version from run number
build_version = '0.1.{}'.format(run_number)

# Update tauri.conf.json, package.json, and Cargo.toml with correct version
for path in ['src-tauri/tauri.conf.json', 'package.json']:
    with open(path) as f:
        cfg = json.load(f)
    if cfg.get('version') != build_version:
        cfg['version'] = build_version
        with open(path, 'w') as f:
            json.dump(cfg, f, indent=2)
        print('[OK] Updated {} version to {}'.format(path, build_version))

cargo_path = 'src-tauri/Cargo.toml'
with open(cargo_path) as f:
    cargo_toml = f.read()
updated_cargo_toml = re.sub(r'^version\s*=\s*"[^"]+"', 'version = "{}"'.format(build_version), cargo_toml, count=1, flags=re.MULTILINE)
if updated_cargo_toml != cargo_toml:
    with open(cargo_path, 'w') as f:
        f.write(updated_cargo_toml)
    print('[OK] Updated {} version to {}'.format(cargo_path, build_version))

bundle_dir = 'src-tauri/target/release/bundle'
github_release_url = 'https://github.com/teamlens-co/Teamlens-web/releases/download/agent-v{}'.format(run_number)

def read_signature(sig_path):
    with open(sig_path) as f:
        return f.read().strip()

platforms = {}

# ─── Windows: NSIS installer (.exe) or MSI ──────────────────────────────────
nsis_dir = os.path.join(bundle_dir, 'nsis')
msi_dir = os.path.join(bundle_dir, 'msi')
if os.path.isdir(nsis_dir):
    exe_files = glob.glob(os.path.join(nsis_dir, '*.exe'))
    sig_files = glob.glob(os.path.join(nsis_dir, '*.exe.sig'))
    if exe_files and sig_files:
        installer_name = os.path.basename(exe_files[0])
        platforms['windows-x86_64'] = {
            'signature': read_signature(sig_files[0]),
            'url': '{}/{}'.format(github_release_url, installer_name)
        }
if not platforms.get('windows-x86_64') and os.path.isdir(msi_dir):
    msi_files = glob.glob(os.path.join(msi_dir, '*.msi'))
    sig_files = glob.glob(os.path.join(msi_dir, '*.msi.sig'))
    if msi_files and sig_files:
        installer_name = os.path.basename(msi_files[0])
        platforms['windows-x86_64'] = {
            'signature': read_signature(sig_files[0]),
            'url': '{}/{}'.format(github_release_url, installer_name)
        }

# ─── Linux: AppImage (preferred) or deb ────────────────────────────────────
appimage_dir = os.path.join(bundle_dir, 'appimage')
deb_dir = os.path.join(bundle_dir, 'deb')
rpm_dir = os.path.join(bundle_dir, 'rpm')
if os.path.isdir(appimage_dir):
    ai_files = glob.glob(os.path.join(appimage_dir, '*.AppImage'))
    sig_files = glob.glob(os.path.join(appimage_dir, '*.AppImage.sig'))
    if ai_files and sig_files:
        installer_name = os.path.basename(ai_files[0])
        platforms['linux-x86_64'] = {
            'signature': read_signature(sig_files[0]),
            'url': '{}/{}'.format(github_release_url, installer_name)
        }
if not platforms.get('linux-x86_64') and os.path.isdir(deb_dir):
    deb_files = glob.glob(os.path.join(deb_dir, '*.deb'))
    sig_files = glob.glob(os.path.join(deb_dir, '*.deb.sig'))
    if deb_files and sig_files:
        installer_name = os.path.basename(deb_files[0])
        platforms['linux-x86_64'] = {
            'signature': read_signature(sig_files[0]),
            'url': '{}/{}'.format(github_release_url, installer_name)
        }

data = {
    'version': build_version,
    'notes': 'TeamLens Desktop Agent - Build #{}'.format(run_number),
    'pub_date': datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'),
    'platforms': platforms
}

with open('src-tauri/target/release/teamlens-agent-latest.json', 'w') as f:
    json.dump(data, f, indent=2)

# Also write to bundle dir so it gets uploaded
with open(os.path.join(bundle_dir, 'teamlens-agent-latest.json'), 'w') as f:
    json.dump(data, f, indent=2)

print('[OK] Generated updater JSON')
print(json.dumps(data, indent=2))
