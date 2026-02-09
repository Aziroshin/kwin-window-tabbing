#!/bin/bash


while [ 1 ]; do
    gdbus call --session --dest com.aziroshin.KWinWindowTabbingDBusPacketOrderExperiment --object-path /com/aziroshin/KWinWindowTabbingDBusPacketOrderExperiment --method com.aziroshin.KWinWindowTabbingDBusPacketOrderExperiment.Test.Test "Message from send_test_msg_to_service.sh:$(date +%s)_512"
done

