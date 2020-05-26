# Ad Bits
Proof of Concept for an ad server that pays for every ad view instantly over the Bitcoin Lightning Network

## Demo

https://vimeo.com/421500938

## What it does:

![Network Flow Diagram](https://raw.githubusercontent.com/kschieck/ad_bits/master/network_diagram.png)

- The user views an ad which prompts the ad server to call the reward server to server callback request
- The proxy ad server receives this callback, requests an invoice from the gameserver and then sends payment via the lightning network
- The gameserver receives the payment instantly and rewards the player instantly
- The user refreshes their balance

## Proxy Ad Server??

The purpose of this Proof of Concept is to show that it is possible to pay every ad view instantly over the lightning network. Rather than build an ad server, I used an existing ad server and created an additional server (proxy_adserver) to receive communication from the ad server and handle the lightning-network payment to the game server.

## How to run it:

Note: I organized my git repos into the directory `~/git`. If you have them located somewhere else you may have to modify paths in the following commands to reflect that.

Required Software:
- https://github.com/bitcoin/bitcoin
- https://github.com/ElementsProject/lightning
- https://github.com/ElementsProject/lightning-charge

Required service:
- Applixir
   - Setup an account at Applixir.com
   - Configure the server callback in settings
   - Make sure they have approved you to load ads (even just test ads)
   - From Applixir settings, enter in `callbackSecret` in `proxy_adserver/app.js`
   - Fill in Applixir game settings in `gameserver/public/index.html`
 - Or: remove ad callback verification code and manually call `http://<ip>:3001/ad?custom1={userId}&msat={msatoshis}` to trigger a payment to the gameserver

Start up bitcoin and 2 lightning nodes (in regtest mode):
```
cd git/lightning
source contrib/startup_regtest.sh
start_ln
```

Connect the nodes with a channel from `l2` to `l1`
```
bt-cli generate 101
l2-cli newaddr
bt-cli sendtoaddress <address from above command> 50
bt-cli generate 10
l1-cli getinfo
l2-cli connect <l1 id>@localhost:<l1 port>
l2-cli fundchannel <1l id> 50000
bt-cli generate 10
l2-cli listchannels
```

Start up lightning-charge (connected to lightning node 1)
```
NETWORK=regtest charged --api-token super_secret_1 --ln-path /tmp/l1-regtest/regtest/ --db-path ~/charge1.db --port 9112
```

Change the IP address in `proxy_adserver/app.js` to the gameserver's host IP

Open 2 new windows and run: (sudo is required for the game server because it's hosted on port 80)
```
cd git/ad_bits/gameserver
sudo npm start
```

```
cd git/ad_bits/proxy_adserver
npm start
```

Note: I also had to make some changes to the clightning-rpc plugin. I made a PR hopefully the owner incorporates my changes into their repo. Here's that PR: https://github.com/SerafinTech/node-clightning-rpc/pull/2

Load up your webpage in a browser at `http://<ip>` and press the "Play Video Ad" button.
