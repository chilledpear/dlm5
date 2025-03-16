#!/bin/bash

# Kernel-Level Tuning for Linux
echo "Applying kernel-level network optimizations..."

# TCP optimizations
sudo sysctl -w net.ipv4.tcp_syn_retries=3
sudo sysctl -w net.ipv4.tcp_tw_reuse=1
sudo sysctl -w net.core.somaxconn=65535

# Additional TCP optimizations
sudo sysctl -w net.ipv4.tcp_fastopen=3
sudo sysctl -w net.ipv4.tcp_slow_start_after_idle=0
sudo sysctl -w net.ipv4.tcp_notsent_lowat=16384

# UDP optimizations (if needed)
sudo sysctl -w net.ipv4.udp_mem='65536 131072 262144'

# File descriptor limits
sudo sysctl -w fs.file-max=2097152
sudo sysctl -w fs.nr_open=2097152

echo "Network optimizations applied. Starting server..."

# Run your Node.js application
node server.js