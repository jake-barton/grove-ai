#!/bin/bash

# TechBirmingham Sponsor Research Platform - Quick Start Script

echo "🚀 TechBirmingham AI Sponsor Research Platform"
echo "=============================================="
echo ""

# Check if Ollama is installed
echo "📋 Checking prerequisites..."
if ! command -v ollama &> /dev/null; then
    echo "❌ Ollama is not installed"
    echo "   Install it with: brew install ollama"
    echo "   Or download from: https://ollama.ai/download"
    exit 1
fi
echo "✅ Ollama is installed"

# Check if Ollama is running
if ! curl -s http://localhost:11434/api/version &> /dev/null; then
    echo "⚠️  Ollama is not running"
    echo "   Starting Ollama..."
    ollama serve > /dev/null 2>&1 &
    sleep 3
fi
echo "✅ Ollama is running"

# Check if llama3.1 model is available
if ! ollama list | grep -q "llama3.1"; then
    echo "📥 Downloading llama3.1:8b model (this may take a few minutes)..."
    ollama pull llama3.1:8b
fi
echo "✅ AI model is ready"

# Check if .env.local exists
if [ ! -f ".env.local" ]; then
    echo "❌ .env.local file not found"
    echo "   Please copy .env.local.example and fill in your credentials"
    exit 1
fi
echo "✅ Environment variables configured"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi
echo "✅ Dependencies installed"

echo ""
echo "✅ Setup complete!"
echo ""
echo "🎯 To start the development server:"
echo "   npm run dev"
echo ""
echo "📖 For detailed setup instructions, see SETUP.md"
echo "❓ For usage help, see README.md"
echo ""
