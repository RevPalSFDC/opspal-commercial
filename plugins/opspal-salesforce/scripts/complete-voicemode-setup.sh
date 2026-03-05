#!/bin/bash

# VoiceMode Setup Completion Script
# Run after system dependencies are installed

set -e

echo "VoiceMode Setup Completion"
echo "=========================="
echo ""

# Check if system dependencies are installed
check_dependency() {
    if command -v "$1" &> /dev/null; then
        echo "✅ $1 is installed"
        return 0
    else
        echo "❌ $1 is not installed"
        return 1
    fi
}

echo "Checking system dependencies..."
DEPS_OK=true

check_dependency "ffmpeg" || DEPS_OK=false
check_dependency "npm" || DEPS_OK=false
check_dependency "cmake" || DEPS_OK=false

# Check for ALSA dev files
if [ -f "/usr/include/alsa/asoundlib.h" ]; then
    echo "✅ ALSA development files are installed"
else
    echo "❌ ALSA development files are missing"
    DEPS_OK=false
fi

# Check for PortAudio
if [ -f "/usr/include/portaudio.h" ]; then
    echo "✅ PortAudio development files are installed"
else
    echo "❌ PortAudio development files are missing"
    DEPS_OK=false
fi

if [ "$DEPS_OK" = false ]; then
    echo ""
    echo "⚠️  Missing dependencies detected!"
    echo "Please run: sudo bash scripts/install-voicemode-deps.sh"
    echo ""
    exit 1
fi

echo ""
echo "All dependencies are installed! Proceeding with VoiceMode installation..."
echo ""

# Method 1: Try uvx installation first
echo "Attempting installation via uvx..."
if uvx voice-mode --version 2>/dev/null; then
    echo "✅ VoiceMode is already installed via uvx"
else
    echo "Installing VoiceMode via uvx..."
    uvx install voice-mode

    if uvx voice-mode --version 2>/dev/null; then
        echo "✅ VoiceMode installed successfully via uvx"
    else
        echo "⚠️  uvx installation didn't work, trying installer script..."

        # Method 2: Use the official installer
        if [ -f "${TEMP_DIR:-/tmp}" ]; then
            echo "Running official installer..."
            cd /tmp && bash install.sh
        else
            echo "Downloading installer..."
            curl -O https://getvoicemode.com/install.sh -o ${TEMP_DIR:-/tmp}
            cd /tmp && bash install.sh
        fi
    fi
fi

echo ""
echo "Verifying installation..."
echo ""

# Verify VoiceMode is accessible
if command -v voice-mode &> /dev/null || uvx voice-mode --version &> /dev/null; then
    echo "✅ VoiceMode CLI is accessible"
else
    echo "⚠️  VoiceMode CLI not found in PATH"
    echo "You may need to restart your shell or add it to PATH manually"
fi

# Check OpenAI API key
if [ -n "$OPENAI_API_KEY" ]; then
    echo "✅ OpenAI API key is set in environment"
elif [ -f ".env" ] && grep -q "OPENAI_API_KEY" .env; then
    echo "✅ OpenAI API key found in .env file"
else
    echo "⚠️  OpenAI API key not found"
    echo "Add OPENAI_API_KEY to your .env file or environment"
fi

# Check MCP configuration
if [ -f ".mcp.json" ] && grep -q "voicemode" .mcp.json; then
    echo "✅ VoiceMode is configured in project MCP"
else
    echo "⚠️  VoiceMode not found in .mcp.json"
fi

if [ -f "$HOME/.config/claude_desktop_config.json" ]; then
    echo "✅ Claude Desktop configuration exists"
else
    echo "ℹ️  Claude Desktop configuration not found (only needed if using Claude Desktop)"
fi

echo ""
echo "========================================="
echo "VoiceMode Setup Status"
echo "========================================="
echo ""
echo "Next steps:"
echo ""
echo "1. If not already done, install system dependencies:"
echo "   sudo bash scripts/install-voicemode-deps.sh"
echo ""
echo "2. Test VoiceMode:"
echo "   uvx voice-mode --help"
echo ""
echo "3. In Claude Code, start a voice conversation:"
echo "   claude /voicemode:converse"
echo ""
echo "4. Optional: Configure additional voice services:"
echo "   - Set up Whisper for local STT"
echo "   - Configure Kokoro for local TTS"
echo "   - Set up LiveKit for real-time audio"
echo ""
echo "Troubleshooting:"
echo "- If audio doesn't work, check microphone permissions"
echo "- For WSL users, additional audio routing may be needed"
echo "- Check logs with: VOICE_MODE_LOG_LEVEL=debug uvx voice-mode"