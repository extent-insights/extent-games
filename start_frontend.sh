#!/usr/bin/env bash
trap 'kill $(jobs -p)' EXIT

python3 -m http.server 5500 --bind 192.168.1.30
