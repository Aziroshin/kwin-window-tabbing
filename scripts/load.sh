#!/bin/bash

qdbus org.kde.KWin /Scripting loadScript "$(realpath contents/code/main.js)" kwin-window-tabbing
