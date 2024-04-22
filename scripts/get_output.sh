#!/bin/bash
SINCE="${1:-now}"
_COMM="kwin_x11" journalctl -g "kwin-window-tabbing" -f --since "$SINCE"
