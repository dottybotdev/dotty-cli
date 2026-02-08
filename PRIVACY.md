# dotty Privacy & Data Handling

This document provides complete transparency about what data dotty collects, processes, and stores.

## Core Principle

**Your code stays on your machine.** dotty exists to give you voice control over your Claude Code sessions - not to collect your data.

---

## Data Categories

### 1. Data That NEVER Leaves Your Machine

| Data | Description |
|------|-------------|
| Source code | All files in your repositories |
| File contents | Anything read by Claude Code |
| Claude context | The full conversation context with Claude |
| Environment variables | `.env`, secrets, API keys |
| Git credentials | SSH keys, tokens |
| Git history | Commits, branches, diffs |
| Command output | Results of terminal commands |

This data is processed entirely locally by Claude Code. dotty never accesses or transmits it.

### 2. Data Transmitted to dotty Server

#### Required (for service to function)

| Data | Purpose | Retention |
|------|---------|-----------|
| **API Key hash** | Authenticate your requests | Until you delete account |
| **Phone number** | Caller ID verification | Until you delete account |
| **IP address** | Standard web traffic | Not logged |

#### Optional / Configurable

| Data | Purpose | Retention | Can disable? |
|------|---------|-----------|--------------|
| **Machine label** | "Your personal-vm has 2 sessions" | Until changed | Yes - leave blank |
| **Session status** | active/idle/blocked (no content) | 24 hours | Partially |
| **Heartbeats** | Presence detection for "call when AFK" | 24 hours | Future option |

#### Mode-Dependent

| Data | Standard Mode | BYOK Mode |
|------|---------------|-----------|
| **Voice audio** | Passes through server | Passes through server |
| **Voice transcripts** | Processed on server | **Never on server** |
| **Claude responses** | Generated on server | **Generated locally** |

### 3. Third-Party Services

#### Twilio (Phone Infrastructure)

When you make/receive phone calls:
- Your phone number (required for routing)
- Call duration and timestamps
- Audio streams (during call only)

Twilio's privacy policy: https://www.twilio.com/legal/privacy

#### ElevenLabs (Voice AI)

**Standard Mode:**
- Voice audio is sent to ElevenLabs via our account
- Transcripts are processed by ElevenLabs
- Subject to our agreement with ElevenLabs

**BYOK Mode:**
- Voice audio is sent to ElevenLabs via YOUR account
- Subject to YOUR agreement with ElevenLabs
- We never see the transcripts

ElevenLabs privacy policy: https://elevenlabs.io/privacy

#### Supabase (Database)

- User accounts (email, phone hash)
- Session metadata (status, timestamps)
- Call logs (duration, not content in BYOK mode)

Supabase is SOC2 compliant. Data stored in US region.

---

## Privacy Modes Explained

### Standard Mode

```
You speak → Phone → Twilio → dotty server → ElevenLabs STT
                                    ↓
                              Claude processes
                                    ↓
                              ElevenLabs TTS → Twilio → You hear
```

**What we see:** Voice transcripts during the call
**What we store:** Call metadata only (duration, timestamp)
**What we DON'T store:** Transcript content

### BYOK Mode

```
You speak → Phone → Twilio → dotty server (relay only) → Your dotty
                                                              ↓
                                                    Your ElevenLabs STT
                                                              ↓
                                                    Claude (local)
                                                              ↓
                                                    Your ElevenLabs TTS
                                                              ↓
                                        dotty server (relay) ← audio
                                              ↓
                                        Twilio → You hear
```

**What we see:** Encrypted audio bytes passing through (we don't decode them)
**What we store:** Call metadata only
**What we CAN'T see:** Transcripts, Claude conversation (never created on our servers)

---

## Data Flow Diagrams

### When You Start dotty

```
Your machine                         dotty server
     |                                    |
     |--- WebSocket connect ------------->|
     |    (API key in header)             |
     |                                    |
     |<-- Connection acknowledged --------|
     |                                    |
     |--- Heartbeat (every 30s) --------->|
     |    {machineLabel, sessionCount}    |
     |                                    |
```

### When You Receive a Call (Standard Mode)

```
Phone        Twilio          dotty server         ElevenLabs
  |            |                  |                    |
  |-- call --->|                  |                    |
  |            |-- audio stream ->|                    |
  |            |                  |-- STT request ---->|
  |            |                  |<-- transcript -----|
  |            |                  |                    |
  |            |                  | [Claude processes] |
  |            |                  |                    |
  |            |                  |-- TTS request ---->|
  |            |<-- audio stream--|<-- audio ----------|
  |<-- audio --|                  |                    |
```

### When You Receive a Call (BYOK Mode)

```
Phone        Twilio       dotty server      Your dotty      Your ElevenLabs
  |            |               |                |                  |
  |-- call --->|               |                |                  |
  |            |-- audio ----->|-- relay ------>|                  |
  |            |               |                |-- STT request -->|
  |            |               |                |<-- transcript ---|
  |            |               |                |                  |
  |            |               |                | [Claude local]   |
  |            |               |                |                  |
  |            |               |                |-- TTS request -->|
  |            |               |<-- relay ------|<-- audio --------|
  |<-- audio --|<-- audio -----|                |                  |
```

---

## Your Rights

### Data Access
Request a copy of all data we have about you: privacy@dotty.bot

### Data Deletion
Delete your account and all associated data:
```bash
dotty account delete
```
Or email: privacy@dotty.bot

### Data Portability
Export your data in JSON format:
```bash
dotty account export
```

---

## Security Measures

### In Transit
- All connections use TLS 1.3
- WebSocket connections are encrypted (WSS)
- API keys transmitted in headers, not URLs

### At Rest
- API keys stored as salted hashes (bcrypt)
- Phone numbers stored as hashes for lookup
- Database encrypted at rest (Supabase)

### On Your Machine
- Config file (`~/.dotty/config.json`) created with mode 600
- API key stored in plaintext locally (you control your machine)
- No telemetry or analytics collected from the CLI

---

## What We Will NEVER Do

1. **Sell your data** - We don't sell data to third parties
2. **Train on your code** - We never see your code
3. **Store transcripts** - Transcripts are ephemeral (Standard) or local-only (BYOK)
4. **Share with advertisers** - No advertising, no tracking
5. **Access without consent** - We can't access your local dotty

---

## Compliance

- **GDPR**: EU users can request data deletion
- **CCPA**: California users have full data rights
- **SOC2**: Database provider (Supabase) is SOC2 compliant

---

## Questions?

- Email: privacy@dotty.bot
- GitHub: https://github.com/dottybotdev/dotty-cli/issues

Last updated: 2026-02-02
