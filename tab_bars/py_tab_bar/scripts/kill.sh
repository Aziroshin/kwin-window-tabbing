#!/bin/sh

kill -9 $(ps ax | grep python3 | grep main.py | awk '{print $1}')
