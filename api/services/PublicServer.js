var request = require('request');

setInterval(() => {
    PublicServer.push();
}, 1000 * 60 * 60 * 1 /* once every hour */);

module.exports = {
    
    /**
     * Push SDC data to the public server.
     */
    push: function() {
        var sdc = sails.config.sdc || {};
        
        if (!sdc.url) {
            console.log('No SDC server url found. Aborting data push.');
            return;
        }
        
        SDCData.generateSDCData()
        .then((data) => {            
            request.post({
                url: sdc.url,
                headers: {
                    'Authorization': sdc.secret,
                    'Content-Type': 'application/json; charset=utf-8',
                },
                body: JSON.stringify({
                    users: data.users
                }),
                callback: (err, res, body) => {
                    if (err) throw err;
                    else {
                        console.log('SDC server push succeeded');
                    }
                }
            });
        })
        .catch((err) => {
            console.log('SDC server push error', err);
        });
    }

};