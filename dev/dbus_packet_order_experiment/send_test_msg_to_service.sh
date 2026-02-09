#!/bin/bash


while [ 1 ]; do
    # gdbus version:
    #gdbus call --session --dest com.aziroshin.KWinWindowTabbingDBusPacketOrderExperiment --object-path /com/aziroshin/KWinWindowTabbingDBusPacketOrderExperiment --method com.aziroshin.KWinWindowTabbingDBusPacketOrderExperiment.Test.Test "Message from send_test_msg_to_service.sh:$(date +%s)_512"
    # qdbus version:
    qdbus com.aziroshin.KWinWindowTabbingDBusPacketOrderExperiment /com/aziroshin/KWinWindowTabbingDBusPacketOrderExperiment com.aziroshin.KWinWindowTabbingDBusPacketOrderExperiment.Test.Test "Message from send_test_msg_to_service.sh:$(date +%s)_512"
done

