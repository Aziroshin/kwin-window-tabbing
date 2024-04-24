#!/bin/bash

gdbus call --session --dest com.aziroshin.DBusPrinter --object-path /com/aziroshin/DBusPrinter --method com.aziroshin.DBusPrinter.Console.log "{ architecture: 'gothic' }"
