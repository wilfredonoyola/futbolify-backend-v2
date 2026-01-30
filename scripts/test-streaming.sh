#!/bin/bash
set -e

BASE_URL="${BASE_URL:-http://localhost:3001}"
EMAIL="${TEST_EMAIL:-test@test.com}"
PASSWORD="${TEST_PASSWORD:-Test123!}"

echo "==========================================="
echo "  Futbolify Streaming Module Test Script"
echo "==========================================="
echo ""
echo "Base URL: $BASE_URL"
echo ""

echo "1. Obtaining authentication token..."
TOKEN_RESPONSE=$(curl -s -X POST $BASE_URL/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "mutation { signin(userInput: { email: \"'$EMAIL'\", password: \"'$PASSWORD'\" }) { access_token id } }"}')

TOKEN=$(echo $TOKEN_RESPONSE | jq -r '.data.signin.access_token')

if [ "$TOKEN" == "null" ] || [ -z "$TOKEN" ]; then
  echo "Error: Could not obtain token"
  echo "Response: $TOKEN_RESPONSE"
  echo ""
  echo "Make sure you have a test user created with email: $EMAIL"
  exit 1
fi
echo "Token obtained successfully"
echo ""

echo "2. Creating a new stream..."
STREAM_RESPONSE=$(curl -s -X POST $BASE_URL/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query": "mutation { createStream(input: { title: \"Test Stream - CLI\", description: \"Testing from CLI script\", sport: SOCCER, homeTeam: \"Team A\", awayTeam: \"Team B\" }) { id title status sport homeTeam awayTeam } }"}')

STREAM_ID=$(echo $STREAM_RESPONSE | jq -r '.data.createStream.id')
echo "Stream created: $STREAM_ID"
echo "Response:"
echo $STREAM_RESPONSE | jq '.data.createStream'
echo ""

echo "3. Getting my streams..."
curl -s -X POST $BASE_URL/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query": "query { myStreams { id title status viewerCount } }"}' | jq '.data.myStreams'
echo ""

echo "4. Starting the stream..."
curl -s -X POST $BASE_URL/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query": "mutation { startStream(id: \"'$STREAM_ID'\") { id status startedAt hlsUrl } }"}' | jq '.data.startStream'
echo ""

echo "5. Getting live streams (public)..."
curl -s -X POST $BASE_URL/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "query { liveStreams { id title viewerCount homeTeam awayTeam homeScore awayScore status } }"}' | jq '.data.liveStreams'
echo ""

echo "6. Joining the stream (viewer)..."
curl -s -X POST $BASE_URL/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query": "mutation { joinStream(streamId: \"'$STREAM_ID'\") { id viewerCount } }"}' | jq '.data.joinStream'
echo ""

echo "7. Updating the score..."
curl -s -X POST $BASE_URL/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query": "mutation { updateScore(input: { streamId: \"'$STREAM_ID'\", homeScore: 2, awayScore: 1 }) { id homeScore awayScore } }"}' | jq '.data.updateScore'
echo ""

echo "8. Sending a chat message..."
curl -s -X POST $BASE_URL/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query": "mutation { sendMessage(input: { streamId: \"'$STREAM_ID'\", content: \"Hello from CLI test! Go Team A!\" }) { id content userName type createdAt } }"}' | jq '.data.sendMessage'
echo ""

echo "9. Getting chat messages..."
curl -s -X POST $BASE_URL/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query": "query { messages(streamId: \"'$STREAM_ID'\", limit: 10) { id content userName type createdAt } }"}' | jq '.data.messages'
echo ""

echo "10. Getting stream details..."
curl -s -X POST $BASE_URL/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "query { stream(id: \"'$STREAM_ID'\") { id title status viewerCount homeTeam awayTeam homeScore awayScore startedAt } }"}' | jq '.data.stream'
echo ""

echo "11. Leaving the stream..."
curl -s -X POST $BASE_URL/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "mutation { leaveStream(streamId: \"'$STREAM_ID'\") { id viewerCount } }"}' | jq '.data.leaveStream'
echo ""

echo "12. Ending the stream..."
curl -s -X POST $BASE_URL/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query": "mutation { endStream(id: \"'$STREAM_ID'\") { id status endedAt } }"}' | jq '.data.endStream'
echo ""

echo "13. Getting stream analytics..."
curl -s -X POST $BASE_URL/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query": "query { streamAnalytics(streamId: \"'$STREAM_ID'\") { peakViewers totalViews totalMessages durationSeconds } }"}' | jq '.data.streamAnalytics'
echo ""

echo "==========================================="
echo "  All tests completed successfully!"
echo "==========================================="
echo ""
echo "Stream ID used: $STREAM_ID"
echo ""
echo "To test WebSocket subscriptions, use wscat:"
echo "  wscat -c ws://localhost:3001/graphql -s graphql-ws"
echo ""
echo "To test webhooks:"
echo "  curl -X POST $BASE_URL/api/streaming/on-publish -H 'Content-Type: application/json' -d '{\"name\": \"YOUR_STREAM_KEY\"}'"
