# dotty

Local Claude supervisor - voice control for your AI coding sessions.

dotty runs on your machine and connects to the dotty voice service, letting you manage Claude Code sessions via phone calls. Your code stays local; dotty handles the connection between your voice and your running sessions.

## Installation

### Using Bun (recommended)

```bash
# Install globally
bun install -g @dotty/dotty

# Or run directly
bunx @dotty/dotty
```

### Using npm

```bash
npm install -g @dotty/dotty
```

### Standalone binary

```bash
# Download for your platform
curl -sL https://dotty.bot/install.sh | sh
```

## Quick Start

```bash
# 1. Login with your API key (get one at dotty.bot)
dotty login dt_your_api_key_here

# 2. (Optional) Label this machine
dotty config --label "personal-vm"

# 3. Start dotty
dotty start
```

## Commands

| Command | Description |
|---------|-------------|
| `dotty start` | Start dotty and connect to voice service |
| `dotty login <key>` | Configure your API key |
| `dotty logout` | Remove saved API key |
| `dotty status` | Show dotty status and running sessions |
| `dotty sessions` | List running Claude Code sessions |
| `dotty config` | View/modify configuration |
| `dotty test` | Test connection |

## Privacy Modes

dotty offers different privacy levels depending on your needs:

### Standard Mode (Default)

Best for: Users who want zero-friction setup

```bash
dotty start
```

- Voice processing (STT/TTS) happens on dotty servers via ElevenLabs
- You don't need any additional accounts
- Transcripts are processed server-side during active calls
- No transcripts are stored after call ends

### BYOK Mode (Bring Your Own Key)

Best for: Privacy-conscious users who want their transcripts to never touch our servers

```bash
dotty config --elevenlabs-key sk_your_elevenlabs_key
dotty start --byok
```

- You provide your own ElevenLabs API key
- Voice transcription happens locally on your machine
- Audio is relayed through our server (unavoidable with phone calls) but NOT processed
- We literally cannot read your conversations - we never convert the audio to text
- Requires: Free ElevenLabs account (10k chars/mo free tier)

### What Each Mode Sees

| Data | Standard | BYOK |
|------|----------|------|
| Raw audio during call | Passes through server | Passes through server |
| Audio stored? | No | No |
| Transcription (STT) | On server | On YOUR machine |
| Claude conversation | On server | On YOUR machine |
| TTS generation | Our ElevenLabs | Your ElevenLabs |
| We can read transcripts? | During call only | **Never** |

## Configuration

Config is stored in `~/.dotty/config.json`:

```json
{
  "apiKey": "dt_...",
  "apiUrl": "wss://api.dotty.bot/ws",
  "machineId": "hostname-abc123",
  "machineLabel": "personal-vm",
  "capabilities": ["claude_sessions", "tmux"],
  "logLevel": "info",
  "elevenLabsKey": null,
  "byokMode": false
}
```

### Configuration Options

```bash
# Set machine label (shown in voice responses)
dotty config --label "personal-vm"

# Enable BYOK mode with your ElevenLabs key
dotty config --elevenlabs-key sk_your_key_here
dotty config --byok true

# View current config
dotty config --show
```

## Capabilities

Control what dotty can do on your machine:

| Capability | Description | Default |
|------------|-------------|---------|
| `claude_sessions` | List/manage Claude Code sessions | Enabled |
| `tmux` | Manage tmux sessions | Enabled |
| `terminal` | Execute arbitrary commands | Disabled |
| `file_read` | Read files | Disabled |
| `file_write` | Write files | Disabled |
| `process_manage` | Kill/start processes | Disabled |

Enable/disable capabilities:

```bash
# Enable full terminal access (be careful!)
dotty config --enable-terminal

# Disable terminal access
dotty config --disable-terminal

# Enable specific capability
dotty config --enable file_read
```

## Running as a Service

### systemd (Linux)

```bash
# Create service file
sudo cat > /etc/systemd/system/dotty.service << EOF
[Unit]
Description=dotty - local Claude supervisor
After=network.target

[Service]
Type=simple
User=$USER
ExecStart=$(which dotty) start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Enable and start
sudo systemctl enable dotty
sudo systemctl start dotty
```

### launchd (macOS)

```bash
cat > ~/Library/LaunchAgents/bot.dotty.plist << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>bot.dotty</string>
    <key>ProgramArguments</key>
    <array>
        <string>$(which dotty)</string>
        <string>start</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
EOF

launchctl load ~/Library/LaunchAgents/bot.dotty.plist
```

## Security

- **API Key**: Stored locally in `~/.dotty/config.json` with mode 600
- **Capabilities**: You control what dotty can do
- **Safe Commands**: Without `terminal` capability, only pre-approved commands run
- **Connection**: All traffic is encrypted (WSS)
- **No Inbound Ports**: dotty connects outbound only
- **Open Source**: Fully auditable code

### Blocked Commands

Even with `terminal` capability, these patterns are always blocked:

- `rm -rf /` (recursive delete from root)
- `sudo` (privilege escalation)
- `chmod 777` (insecure permissions)
- `mkfs.` (format disk)
- `dd` to devices
- Fork bombs

## Development

```bash
# Clone the repo
git clone https://github.com/dottybotdev/dotty-cli
cd dotty

# Install dependencies
bun install

# Run in dev mode
bun run dev

# Build
bun run build

# Build standalone binary
bun run build:standalone
```

## License

MIT

---

## Data & Privacy Reference

For full details on data handling, see [PRIVACY.md](./PRIVACY.md).

### Quick Summary

#### Always Local (never leaves your machine)
- Source code and file contents
- Claude conversation context
- Environment variables, secrets, credentials
- Git operations and history

#### Sent to Server

| Data | Why | Can opt out? |
|------|-----|--------------|
| Phone number | Caller ID auth (Twilio requirement) | No |
| Machine label | Identify which machine in voice ("your personal-vm") | Yes (optional field) |
| Session status | active/idle/blocked (no content) | Partially (needed for presence) |
| Heartbeats | Presence detection ("call me when AFK") | Future: optional |
| Voice audio | Phone calls route through server | No (Twilio architecture) |
| Voice transcripts | Only in Standard mode | Yes (use BYOK mode) |

#### The Server's Job

The dotty server exists primarily for:
1. **Phone routing** - Twilio requires a server endpoint
2. **User authentication** - Verify your API key
3. **Presence detection** - Know if you're at your laptop (optional feature)

In BYOK mode, the server is essentially a dumb pipe for audio - it routes bytes but never processes or understands them.
