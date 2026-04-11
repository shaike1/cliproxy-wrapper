#!/bin/sh
set -e

# Start cli-proxy-api in background
/app/cli-proxy-api &
PROXY_PID=$!

# Start Node.js wrapper
node /app/wrapper.js &
WRAPPER_PID=$!

# Forward signals and wait
trap "kill $PROXY_PID $WRAPPER_PID 2>/dev/null" TERM INT

wait $PROXY_PID $WRAPPER_PID
