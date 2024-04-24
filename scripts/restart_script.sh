#!/bin/bash

npm run lint\
&& npm run compile\
&& scripts/disable.sh\
&& scripts/uninstall.sh\
&& scripts/package.sh\
&& scripts/install.sh\
&& scripts/start.sh
scripts/status.sh
