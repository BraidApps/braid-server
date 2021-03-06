var express = require('express');
var path = require('path');
var crypto = require('crypto')
var fs = require('fs')

var factory = require('./braid-factory');
var BraidDb = require('./braid-db');
var EventBus = require('./braid-event-bus');
var MessageSwitch = require('./braid-message-switch');
var AuthServer = require('./braid-auth').AuthServer;
var RosterManager = require('./braid-roster').RosterManager;
var ClientSessionManager = require('./braid-client-sessions').ClientSessionManager;
var FederationManager = require('./braid-federation').FederationManager;
var FileServer = require('./braid-file-server').FileServer;
var BotManager = require('./braid-bot').BotManager;

var WebSocketServer = require('ws').Server;
var http = require('http');
var https = require('https')

function BraidServer() {

}

BraidServer.prototype.initialize = function(config) {
	this.config = config;
};

BraidServer.prototype.start = function(callback) {
	var braidDb = new BraidDb();
	braidDb.initialize(this.config, function(err) {
		if (err) {
			console.log("Error opening mongo.  Are you running mongo?");
			throw "Mongo error: " + err;
		}
		var eventBus = new EventBus();
		var messageSwitch = new MessageSwitch();
		var authServer = new AuthServer();
		var rosterManager = new RosterManager();
		var clientSessionManager = new ClientSessionManager();
		var federationManager = new FederationManager();
		var fileServer = new FileServer();
		var botManager = new BotManager();
		this.services = {
			factory : factory,
			braidDb : braidDb,
			eventBus : eventBus,
			messageSwitch : messageSwitch,
			authServer : authServer,
			rosterManager : rosterManager,
			clientSessionManager : clientSessionManager,
			federationManager : federationManager,
			fileServer : fileServer,
			botManager : botManager
		};
		eventBus.initialize(this.config, this.services);
		messageSwitch.initialize(this.config, this.services);
		authServer.initialize(this.config, this.services);
		rosterManager.initialize(this.config, this.services);
		clientSessionManager.initialize(this.config, this.services);
		federationManager.initialize(this.config, this.services);
		fileServer.initialize(this.config, this.services);
		botManager.initialize(this.config, this.services);

		this.startServer(callback);
	}.bind(this));
};

BraidServer.prototype.getCertificateAuthority = function() {
	if (this.config.ssl && this.config.ssl.ca) {
		var ca = [];
		var chain = fs.readFileSync(this.config.ssl.ca, 'utf8');
		chain = chain.split("\n");
		var cert = [];
		for (var i = 0; i < chain.length; i++) {
			var line = chain[i];
			if (line.length > 0) {
				cert.push(line);
				if (line.match(/-END CERTIFICATE-/)) {
					ca.push(cert.join('\n'));
					cert = [];
				}
			}
		}
		return ca;
	}
};

BraidServer.prototype.startServer = function(callback) {
	if (this.config.client && this.config.client.enabled) {
		var clientPort = 25555;
		if (this.config.client.port) {
			clientPort = this.config.client.port;
		}
		this.clientApp = express();
		this.clientApp.use(express.static(path.join(__dirname, 'public')));

		if (this.config.client && !this.config.client.ssl) {
			console.log("Using unencrypted client connections");
			this.clientServer = http.createServer(this.clientApp);
		} else {
			console.log("Using encyrpted client connections");
			var privateKey = fs.readFileSync(this.config.ssl.key, 'utf8');
			var certificate = fs.readFileSync(this.config.ssl.cert, 'utf8');
			var credentials = {
				key : privateKey,
				cert : certificate
			};
			var ca = this.getCertificateAuthority();
			if (ca) {
				credentials.ca = ca;
			}
			this.clientServer = https.createServer(credentials, this.clientApp);
		}
		console.log("Listening for client connections on port " + clientPort);
		this.clientServer.listen(clientPort);

		var clientWss = new WebSocketServer({
			server : this.clientServer
		});
		clientWss.on('connection', function(conn) {
			this.services.clientSessionManager.acceptSession(conn);
		}.bind(this));
	}
	if (this.config.federation && this.config.federation.enabled) {
		var federationPort = 25557;
		if (this.config.federation.port) {
			federationPort = this.config.federation.port;
		}
		this.federationApp = express();
		this.federationApp.use(express.static(path.join(__dirname, 'fed_public')));

		if (this.config.federation && !this.config.federation.ssl) {
			console.log("Using unencrypted federation connections");
			this.federationServer = http.createServer(this.federationApp);
		} else {
			console.log("Using encyrpted federation connections");
			var privateKey = fs.readFileSync(this.config.ssl.key, 'utf8');
			var certificate = fs.readFileSync(this.config.ssl.cert, 'utf8');
			var credentials = {
				key : privateKey,
				cert : certificate
			};
			var ca = this.getCertificateAuthority();
			if (ca) {
				credentials.ca = ca;
			}
			this.federationServer = https.createServer(credentials, this.federationApp);
		}
		console.log("Listening for federation connections on port " + federationPort);
		this.federationServer.listen(federationPort);

		var federationWss = new WebSocketServer({
			server : this.federationServer
		});
		federationWss.on('connection', function(conn) {
			this.services.federationManager.acceptFederationSession(conn);
		}.bind(this));
	}
	callback();
}

BraidServer.prototype.shutdown = function(callback) {
	this.services.clientSessionManager.shutdown();
	this.services.federationManager.shutdown();
	this.services.fileServer.close();
	this.clientServer.close();
	this.federationServer.close();
	this.services.braidDb.close(callback);
};

module.exports = BraidServer;
