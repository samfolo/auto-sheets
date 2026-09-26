#!/bin/sh
# The factory's command-line tool. Run `./factory.sh --help` for its commands.
exec node "$(dirname "$0")/src/main.ts" "$@"
