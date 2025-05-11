# Steam Sales Discord Webhook

This simple docker compose build will run a script that will check for steam games on sale and send a message of them to a chosen discord webhook.

## Set Up
Before running the container, you will need to create a webhook in your discord server and point it to a channel of your choice. 
Then add the values to the docker-compose.yml:
```
WEBHOOK_URL= # the url of your discord webhook
POLLING_INTERVAL= # how often the script should check for new games in hours
```
Finally, to build and run:

```
docker compose up -d
```

This will then build a docker container and run the script. This will start sending messages into discord. There will be alot of messages at first as there are a lot of offers to get through at the start.
