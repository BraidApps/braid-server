var assert = require('assert');
var messageSwitch = require('../braid-message-switch');

var rx = [];

function handler(message) {
	rx.push(message);
}

describe('message-switch:', function() {
	it('check resource switching', function(done) {
		messageSwitch.reset();
		var address1 = {
			domain : 'test.com',
			userId : 'joe',
			resource : '12345'
		};
		var address2 = {
			domain : 'test.com',
			userId : 'bob',
			resource : '23456'
		};
		var port = messageSwitch.registerResource('12345', null, handler);
		var msg1 = {
			to : address1,
			data : 'hello'
		};
		messageSwitch.deliver(msg1, function(err) {
			if (err) {
				throw err;
			}
			assert.equal(rx.length, 1);
			assert.equal(messageSwitch.getStats().registrations.resource, 1);
			assert.equal(messageSwitch.getStats().messages.received, 1);
			assert.equal(messageSwitch.getStats().messages.delivered, 1);
			done();
		});
	});
});