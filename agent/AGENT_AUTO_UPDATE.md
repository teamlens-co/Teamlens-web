# TeamLens Agent Auto-Update

This agent uses the Tauri v2 updater. The release flow is:

1. Generate one updater signing key pair.
2. Put the public key in `src-tauri/tauri.conf.json`.
3. Replace `YOUR_ORG/YOUR_REPO` in the updater endpoint with the real GitHub repository.
4. Store the private key in GitHub Actions secrets.
4. Run the `Agent Release` workflow.
5. The workflow publishes the signed bundle and `teamlens-agent-latest.json` to the GitHub Release.

## One-Time Setup

Generate the updater signing keys:

```powershell
npm run tauri signer generate -- -w "$env:USERPROFILE\.tauri\teamlens-agent.key"
```

The command prints a public key. Paste that public key into:

```json
"plugins": {
  "updater": {
    "pubkey": "PASTE_PUBLIC_KEY_HERE"
  }
}
```

Keep the private key safe. If it is lost, already-installed agents cannot trust future updates.

Add these GitHub repository secrets:

```text
TAURI_SIGNING_PRIVATE_KEY
TAURI_SIGNING_PRIVATE_KEY_PASSWORD
AGENT_VITE_API_URL
AGENT_VITE_WEB_URL
```

For production, `AGENT_VITE_API_URL` should point at the production API and `AGENT_VITE_WEB_URL` should point at the production dashboard.

## Releasing An Update

1. Increase `version` in `src-tauri/tauri.conf.json`.
2. Commit and push.
3. Open GitHub Actions.
4. Run `Agent Release`.
5. The app reads the latest manifest from `https://github.com/<org>/<repo>/releases/latest/download/teamlens-agent-latest.json`.

## Employee Machines

The agent checks for updates after login when the employee is not clocked in, and then every 6 hours while it remains idle/not clocked in. If an update is available, it downloads, installs, and relaunches the agent.

The app will not auto-update in the middle of a clocked-in tracking session.
