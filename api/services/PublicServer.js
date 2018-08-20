var request = require('request');

/*
setInterval(() => {
    
    PublicServer.push();
    
    setTimeout(() => {
        PublicServer.pull();
    }, 1000 * 30);
    
}, 1000 * 60 * 60 * 1 /* once every hour */);
*/

module.exports = {
    
    migrateFromHRIS: function() {
        return new Promise((resolve, reject) => {
            var hrisData = {
            /*
                <ren_id>: {
                    sdc_token: {string},
                    sdc_guid: {string},
                },
                ...
            */
            };
            
            async.series([
                (next) => {
                    LHRISWorker.query(`
                        
                        SELECT
                            ren_id, sdc_token, sdc_guid
                        FROM
                            hris_worker
                        WHERE
                            sdc_guid IS NOT NULL
                        
                    `, [], (err, list) => {
                        if (err) next(err);
                        else {
                            list.forEach((row) => {
                                hrisData[row.ren_id] = {
                                    sdc_token: row.sdc_token,
                                    sdc_guid: row.sdc_guid,
                                };
                            });
                            console.log('Migrating SDC data from HRIS worker table');
                            console.log(Object.keys(hrisData).length + ' rows');
                            next();
                        }
                    });
                },
                
                (next) => {
                    async.eachOf(hrisData, (row, renID, rowDone) => {
                        SDCData.query(`
                            
                            UPDATE sdc
                            SET
                                sdc_token = ?,
                                sdc_guid = ?
                            WHERE
                                ren_id = ?
                            
                        `, [row.sdc_token, row.sdc_guid, renID], (err) => {
                            if (err) rowDone(err);
                            else rowDone();
                        });
                    }, (err) => {
                        if (err) next(err);
                        else next();
                    });
                },
                
            ], (err) => {
                if (err) {
                    console.log('Error', err);
                    reject(err);
                }
                else {
                    console.log('Completed');
                    resolve();
                }
            });
        });
    },
    
    
    /**
     * Push SDC data to the public server.
     */
    push: function() {
        var sdc = sails.config.sdc || {};
        if (!sdc.url) {
            sails.log.warn('No SDC server url found. Aborting data push.');
            return;
        }
        
        var userData, relayData;
        
        // Get latest user data
        SDCData.generateSDCData(null, true)
        .then((data) => {
            userData = data.users;
            
            return RelayData.exportData('sdc');
        })
        .then((data) => {
            relayData = data;
            
            return RelayApplicationUser.findPublicKeys('sdc');
        })
        .then((pubkeysByUser) => {
            // Merge RSA public keys into the `userData` array
            userData.forEach((row) => {
                var userGUID = row.id;
                row.rsa_public_key = pubkeysByUser[userGUID];
            });
            
            return new Promise((resolve, reject) => {
                request.post({
                    url: sdc.url + '/data_in',
                    headers: {
                        'Authorization': sdc.secret,
                        'Content-Type': 'application/json; charset=utf-8',
                    },
                    body: JSON.stringify({
                        users: userData,
                        relay: relayData
                    }),
                    callback: (err, res, body) => {
                        if (err) reject(err);
                        else if (res.statusCode != 200) {
                            sails.log.verbose('Users sent:', data.users);
                            sails.log.verbose(body);
                            reject(new Error('SDC server push received status ' + res.statusCode));
                        }
                        else {
                            sails.log('SDC server push succeeded');
                            resolve();
                        }
                    }
                });
            });
        })
        .catch((err) => {
            sails.log.error('SDC server push error', err);
        });
    },
    
    
    pull: function() {
        var sdc = sails.config.sdc || {};
        if (!sdc.url) {
            sails.log.warn('No SDC server url found. Aborting data pull.');
            return;
        }
        
        sails.log('Fetching data from SDC server...');
        
        request.get({
            url: sdc.url + '/data_out',
            headers: {
                'Authorization': sdc.secret,
                'Content-Type': 'application/json; charset=utf-8',
            },
            callback: (err, res, body) => {
                
                var appointmentData, relayData;
                
                Promise.resolve()
                .then(() => {
                    if (err) throw err;
                    if (res.statusCode != 200) {
                        console.log(body);
                        throw new Error('SDC server pull received status ' + res.statusCode);
                    }
                    
                    sails.log.verbose('- Parsing data');
                    var data = JSON.parse(body);
                    appointmentData = data.appointments;
                    relayData = data.relay;
                    
                    if (!appointmentData.appointment || !appointmentData.user_appointment) {
                        throw new Error('Expected appointment data not found');
                    }
                    return SDCAppointment.importData(appointmentData.appointment);
                })
                .then(() => {
                    sails.log.verbose('- Imported into sdc_appointment');
                    
                    return SDCUserAppointment.importData(appointmentData.user_appointment);
                })
                .then(() => {
                    sails.log.verbose('- Imported into sdc_user_appointment');
                    
                    return RelayData.importData('sdc', relayData);
                })
                .then(() => {
                    sails.log.verbose('- Imported secure relay data');
                    sails.log('Import complete');
                })
                .catch((err) => {
                    sails.log.error('Import error', err);
                });
            }
        });
        
    }

};