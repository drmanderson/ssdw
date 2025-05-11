# Steam Sales Discord Webhook

This simple script will check for steam games on sale and send a message of them to a chosen discord webhook.

## Set Up
Before running the script, you will need to create a webhook in your discord server and point it to a channel of your choice. 
Then create a .env file in the root of the script folder and paste the following:
```
WEBHOOK_URL= # the url of your discord webhook
POLLING_INTERVAL= # how often the script should check for new games in hours
```
Finally, open the file path in your terminal and enter:
```
npm install
```
This will install all the necessary packages the script need to run.

## Running
Open the file path in your terminal and enter the following:
```
node index.js
```
This will then run the script and start sending messages in discord. There will be alot of messages at first as there are a lot of offers to get through at the start.
