var request = require('request');

setInterval(() => {
    
    PublicServer.push();
    
    setTimeout(() => {
        PublicServer.pull();
    }, 1000 * 30);
    
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
        
        SDCData.generateSDCData(null, true)
        .then((data) => {            
            request.post({
                url: sdc.url + '/data_in',
                headers: {
                    'Authorization': sdc.secret,
                    'Content-Type': 'application/json; charset=utf-8',
                },
                body: JSON.stringify({
                    users: data.users
                }),
                callback: (err, res, body) => {
                    if (err) throw err;
                    else if (res.statusCode != 200) {
                        console.log(body);
                        throw new Error('SDC server push received status ' + res.statusCode);
                    }
                    else {
                        console.log('SDC server push succeeded');
                    }
                }
            });
        })
        .catch((err) => {
            console.log('SDC server push error', err);
        });
    },
    
    
    pull: function() {
        var sdc = sails.config.sdc || {};
        if (!sdc.url) {
            console.log('No SDC server url found. Aborting data push.');
            return;
        }
        
        console.log('Fetching data from SDC server...');
        
        try {
            request.get({
                url: sdc.url + '/data_out',
                headers: {
                    'Authorization': sdc.secret,
                    'Content-Type': 'application/json; charset=utf-8',
                },
                callback: (err, res, body) => {
                    if (err) throw err;
                    else if (res.statusCode != 200) {
                        console.log(body);
                        throw new Error('SDC server pull received status ' + res.statusCode);
                    }
                    else {
                        console.log('Parsing data');
                        var data;
                        data = JSON.parse(body);
                        if (!data.appointment || !data.user_appointment) {
                            throw new Error('Expected appointment data not found');
                        }
                        
                        if (data) {
                            SDCAppointment.importData(data.appointment)
                            .then(() => {
                                console.log('Imported into sdc_appointment');
                                return SDCUserAppointment.importData(data.user_appointment);
                            })
                            .then(() => {
                                console.log('Imported into sdc_user_appointment');
                                console.log('Import complete');
                            })
                            .catch((err) => {
                                console.log('Import error 1', err);
                            });
                        }
                    }
                }
            });
            
        } catch (err) {
            console.log('Import error 2', err);
        }
    }

};