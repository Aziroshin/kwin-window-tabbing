#!/bin/bash

id="$(grep -oP '(?<=X-KDE-PluginInfo-Name=).*' metadata.desktop)"

echo -n "ID: "
echo "${id}"

echo -n "Is enabled: "
echo "$(kreadconfig5 --file kwinrc --group Plugins --key "${id}Enabled")"

echo -n "Is loaded: "
echo "$(qdbus org.kde.KWin /Scripting org.kde.kwin.Scripting.isScriptLoaded "$id")"
#qdbus org.kde.KWin /Scripting org.kde.kwin.Scripting.start
