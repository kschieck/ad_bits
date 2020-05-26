var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var url = require('url');
var querystring = require("querystring");
var crypto = require('crypto')
var storage = require('node-persist');

var http = require("http");

var app = express();

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

const CLightning = require('clightning-rpc');
const cl_client = new CLightning("/tmp/l2-regtest/regtest/lightning-rpc"); // test client 2

var gameServerHostIP = "192.168.1.42";

// Thanks, stackoverflow https://stackoverflow.com/questions/46069284/synchronous-http-request-in-node-js
function requestPromise(options, postData = null) {
	return new Promise((resolve, reject) => {
	  const isPostWithData = options && options.method === "POST" && postData !== null;
	  if (isPostWithData && (!options.headers || !options.headers["Content-Length"])) {
	    // Convenience: Add Content-Length header
	    options = Object.assign({}, options, {
	      headers: Object.assign({}, options.headers, {
	        "Content-Length": Buffer.byteLength(postData)
	      })
	    });
	  }
	  const body = [];
	  const req = http.request(options, res => {
	    res.on('data', chunk => {
	      body.push(chunk);
	    });
	    res.on('end', () => {
	      res.body = Buffer.concat(body);
	      resolve(res);
	    });
	  });

	  req.on('error', e => {
	  	console.log("error!!! " + JSON.stringify(e));
	    reject(e);
	  });

	  if (isPostWithData) {
	    req.write(postData);
	  }
	  req.end();
	});
}

app.get('/ad', async function(req, res, next) {
	const queryObject = url.parse(req.url,true).query;
	var userId = queryObject.custom1;
	var msat = Math.floor(Math.random() * 100);

	// Verify Ad callback
	var accountId = queryObject.account_id;
	var gameId = queryObject.game_id;
	var custom1 = queryObject.custom1;
	var custom2 = queryObject.custom2;
	var timestamp = queryObject.timestamp;
	var callbackSecret = "";
	var checksum = queryObject.checksum;
	var stringToHash = accountId + gameId + custom1 + custom2 + timestamp + callbackSecret;

	/*
		When computing your MD5 hash in your end-point code, concatenate 
		account ID, Game ID, Custom1, Custom2, callback timestamp and callback secret 
		with nothing between the values. You should also test your current timestamp 
		against the previous one to make sure the call hasn’t been copied. 
		If current timestamp <= previous then it’s a copy. 
		Never place your callback secret in the code. 
	*/
	await storage.init();
	var lastTimestamp = null;
	var lastTimestampPromise = storage.getItem('last_timestamp').then(result => {
		lastTimestamp = result;
	}, reject => {
		lastTimestamp = null;
	});
	await lastTimestampPromise;
	if (lastTimestamp != null && timestamp <= lastTimestamp) {
		res.sendStatus(400);
	}
	var hash = crypto.createHash('md5').update(stringToHash).digest("hex");
	if (checksum != hash) {
		res.sendStatus(400);
	}

	// Pay game server for showing the ad
	try {
	    const requ = await requestPromise({
	    	hostname: gameServerHostIP,
			port: 80,
			path: '/invoice',
			method: "POST",
			headers: {
				"Content-Type": "application/json"
			}
		}, JSON.stringify({userId: userId, msat: msat}));

	    var responseString = requ.body.toString("utf8");
	    var response = JSON.parse(responseString);

	    console.log("Got invoice: " + response.payreq);

	    var decodeMsat = -1;
	    var decodePayPromise = cl_client.decodePay(response.payreq)
	    .then(result => {
	    	console.log("decoded msat: " + result.msatoshi);
	    	decodeMsat = result.msatoshi;
	    }, rej => {
	    	console.log("rejected decode pay: " + JSON.stringify(rej));
	    });
	    await decodePayPromise;

	    if (decodeMsat < 0) {
	    	res.send(500);
	    	return;
	    }
	    if (msat != decodeMsat) {
	    	console.log("invalid invoice " + msat + " " + decodeMsat);
	    	res.send(500);
	    	return;
	    }

	    var p = cl_client.pay(response.payreq)
	    .then(result => {
		    console.log("Paid invoice. Hash: " + result.payment_hash);
		}, rej => {
			console.log(rej);
		})
		.catch(e => {
		    console.log(e);
		});
		await p;

	} catch (e) {
	    console.error(e);
	}

	res.sendStatus(200);
});

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? JSON.stringify(err) : "error";

  // render the error page
  res.status(err.status || 500);
  res.send(res.locals.error);
});

module.exports = app;
