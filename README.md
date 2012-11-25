## Install

    npm install
    npm install -g forever nodemon

## To run in debug mode:
(debug output and auto-restart on code changes)

    export DEBUG_MODE=1
    nodemon

## To run in production
(Auto-restart on failure)

    forever start /srv/app/server.js



