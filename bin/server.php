#!/usr/bin/env php
<?php

require dirname(__DIR__) . '/vendor/autoload.php';

use Ratchet\Server\IoServer;
use Ratchet\Http\HttpServer;
use Ratchet\WebSocket\WsServer;
use Game\GameServer;

$server = IoServer::factory(
    new HttpServer(
        new WsServer(
            new GameServer()
        )
    ),
    9001 // Port - make sure this matches your Nginx proxy_pass port
);

echo "WebSocket Server starting on port 9001...\n";
echo "Game server ready to accept connections\n";

$server->run();
