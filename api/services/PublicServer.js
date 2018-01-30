var request = require('request');

setInterval(() => {
    
    PublicServer.push();
    
    setTimeout(() => {
        PublicServer.pull();
    }, 1000 * 30);
    
}, 1000 * 60 * 60 * 1 /* once every hour */);

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
                        console.log('Users sent:', data.users);
                        console.log('SDC server push received status ' + res.statusCode);
                        console.log(body);
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