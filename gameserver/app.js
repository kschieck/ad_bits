var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var querystring = require("querystring");
var http = require("http");
var only = require("only");
var EventSource = require("eventsource");
var storage = require('node-persist');
var url = require('url');

var app = express();

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Start the charge server:
//$ NETWORK=regtest charged --api-token super_secret_1 --ln-path /tmp/l1-regtest/regtest/ --db-path ~/charge1.db --port 9112

const CHARGE_URL = "http://localhost:9112"; // url of the lighting-charge server
const CHARGE_TOKEN = "super_secret_1";

const charge = require('lightning-charge-client')(CHARGE_URL, CHARGE_TOKEN);

// FROM https://github.com/ElementsProject/lightning-jukebox/blob/master/src/app.js
// Handle incoming payments
const stream = charge.stream();
stream.on('payment', async function handlePayment(inv) {
	var userId = 0;
	if (inv.metadata && inv.metadata.userId !== undefined && !isNaN(inv.metadata.userId)) {
		userId = inv.metadata.userId;
	}
	console.log(`Invoice ${ inv.id } of ${ inv.msatoshi } paid for user ${userId}`);

	// Update balance for user
	await storage.init();
	var balance = 0;
	var promise = storage.getItem('balance.' + userId).then(result => {
		balance = result != null? result : 0;
	}, reject => {
		balance = -1;
	});
	await promise;
	if (balance < 0) {
		return;
	}
	await storage.setItem('balance.'+userId, balance + parseInt(inv.msatoshi));
});

// Create invoice when requested
app.post('/invoice', async (req, res, next) => {

	var msat = 100;
	if (req.body.msat !== undefined) {
		msat = parseInt(req.body.msat);
	}
	var userId = 0;
	if (req.body.userId !== undefined) {
		userId = req.body.userId;
	}

	console.log(`Received a new invoice request for ${msat} msats, user id: ${userId}`);

  	var data = querystring.stringify({ 
	  	msatoshi: msat,
	  	description: `ad view`,
	  	metadata: { source: 'ad', userId: userId }, 
	  	expiry: 600
	});

	const inv = await charge.invoice({
	msatoshi: msat,
	description: `ad view`,
		metadata: { source: 'ad', userId: userId }, 
		expiry: 600
	}).then(result => {
		console.log("Created Invoice: " + JSON.stringify(result));
		res.send(only(result, 'id payreq msatoshi quoted_currency quoted_amount expires_at'));
	}, rej => {
		console.log("rej" + JSON.stringify(rej));
		res.sendStatus(500);
	}).catch(e => {
		console.error(e);
		res.sendStatus(500);
	});
});

app.get('/balance', async function(req, res, next) {

	const queryObject = url.parse(req.url,true).query;
	var userId = queryObject.userId || 0;

	// Load balance from persistent storage
	await storage.init();
	var balance = 0;
	var promise = storage.getItem('balance.' + userId).then(result => {
		balance = result != null? result : 0;
	}, reject => {
		balance = 0;
	});
	await promise;
	if (balance === undefined) {
		balance = 0;
	}

	res.status(200);
	res.send({balance: balance});
});

app.get('/', function(req, res, next) {
	express.static(path.join(__dirname, 'public', 'index.html'));
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
