#!/bin/bash

# VoiceMode System Dependencies Installation Script
# Run with: sudo bash install-voicemode-deps.sh

set -e

echo "Installing VoiceMode system dependencies..."
echo "========================================"

# Update package list
echo "Updating package list..."
apt-get update

# Determine npm installation status
pkg_list=("portaudio19-dev" "ffmpeg" "cmake" "libasound2-dev" "libasound2-plugins" "libportaudio2" "build-essential")
npm_was_missing=false

if command -v npm >/dev/null 2>&1; then
    echo "npm already detected in PATH – skipping apt install."
else
    echo "npm not found – adding to install list."
    npm_was_missing=true
    pkg_list=("npm" "${pkg_list[@]}")
fi

# Install required packages
echo "Installing audio and development libraries..."
apt-get install -y "${pkg_list[@]}"

echo ""
echo "✅ System dependencies installed successfully!"
echo ""
echo "Installed packages:"
if [ "$npm_was_missing" = true ]; then
    echo "- npm (Node package manager)"
fi
echo "- portaudio19-dev (Audio I/O library)"
echo "- ffmpeg (Audio/video processing)"
echo "- cmake (Build system)"
echo "- libasound2-dev (ALSA development files)"
echo "- libasound2-plugins (ALSA plugins)"
echo "- libportaudio2 (PortAudio library)"
echo "- build-essential (Compilation tools)"
echo ""
echo "Next steps:"
echo "1. Run the VoiceMode installer again: bash ${TEMP_DIR:-/tmp}"
echo "2. Configure your OpenAI API key"
echo "3. Add VoiceMode to your MCP configuration"
