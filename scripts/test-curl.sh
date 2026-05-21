#!/bin/bash
# Test the agent via HTTP using curl
# Make sure to run `npm run dev` first in another terminal

echo "🧪 Testing OnboardingAgent via curl..."
echo ""

# Test the agent endpoint
curl -X POST http://localhost:8787/agent/OnboardingAgent/test-session-123 \
  -H "Content-Type: application/json" \
  -d '{
    "method": "sendMessage",
    "args": ["Hello! I need help with a website project."]
  }' | jq .

echo ""
echo "✅ Test complete"
