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
            sails.log.warn('No SDC server url found. Aborting data push.');
            return;
        }
        
        var userData, relayData;
        
        // Get latest user data
        SDCData.generateSDCData(null, true)
        .then((data) => {
            userData = data.users;
            
            // Fetch outgoing relay data
            return RelayData.exportData('sdc');
        })
        .then((data) => {
            relayData = data;
            
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
                    
                    if (relayData && relayData.length > 0) {
                        return RelayData.retrieveAllUserData('sdc');
                    }
                    else {
                        return null;
                    }
                })
                .then((retrievedData) => {
                    if (retrievedData) return PublicServer.importPFS(retrievedData);
                    else return null;
                })
                .then(() => {
                    
                    sails.log('Import complete');
                })
                .catch((err) => {
                    sails.log.error('Import error', err);
                });
            }
        });
        
    },
    
    
    /**
     * Import PFS data sent by the mobile app and save into AppBuilder objects.
     *
     * @param {object} data
     *      The output from RelayData.retrieveAllUserData()
     *      { <ren_id>: [...], <ren_id>: [...], ... }
     * @return {Promise}
     */
    importPFS: function(data) {
        return new Promise((resolve, reject) => {
        
            var objectives = [];
            var adjustments = [];
            var keyResults = [];
            var progress = [];
            
            var pfsData = {
            /*
                <ren_id>: { 
                    pfsData: {...},
                    timestamp: <integer>
                 },
                ...
            */
            };
            
            Promise.resolve()
            .then(() => {
                if (typeof data != 'object') throw new TypeError();
                
                // Build the `pfsData` object.
                // In case of multiple copies of PFS data per person, keep only
                // the most recent one.
                
                // Iterate through the incoming relay data for each user, and
                // find each user's most recent `pfsData` packet.
                for (var renID in data) {
                    var dataArray = data[renID];
                    if (!Array.isArray(dataArray)) throw new TypeError();
                    
                    dataArray.forEach((packet) => {
                        if (!packet.pfsData) {
                            sails.log.warn('Unexpected SDC relay packet for ren: ' + renID, packet);
                        }
                        else if (!pfsData[renID] || pfsData[renID].timestamp < packet.timestamp) {
                            pfsData[renID] = packet;
                        }
                    });
                }
                                
                var tasks = [];
                
                // 1st pass of PFS data: create Objectives object entries
                for (var renID in pfsData) {
                    var renPFS = pfsData[renID].pfsData;
                    for (var sdcGUID in renPFS) {
                        var contactPFS = renPFS[sdcGUID];
                        contactPFS.categories.forEach((c) => {
                            c.objectives.forEach((o) => {
                                var objective = {
                                    Type: '',
                                    Description: o.title,
                                };
                                
                                if (c.title.match(/ministry/i)) {
                                    objective.Type = 'Ministry';
                                }
                                else if (c.title.match(/personal/i)) {
                                    objective.Type = 'Personal';
                                }
                                else {
                                    objective.Type = 'Assignment';
                                }
                                
                                tasks.push(
                                    SdcPfsInterface.createObjective(objective)
                                );
                                
                            });
                        });
                    }
                }
                
                return Promise.all(tasks);
            })
            .then((results) => {
                objectives = results;
                var currentObjective = 0;
                var tasks = [];
                
                // 2nd pass of PFS data: create Adjustments & KeyResults entries
                for (var renID in pfsData) {
                    var renPFS = pfsData[renID].pfsData;
                    for (var sdcGUID in renPFS) {
                        var contactPFS = renPFS[sdcGUID];
                        contactPFS.categories.forEach((c) => {
                            c.objectives.forEach((o) => {
                                // Get the ID from the results of the earlier
                                // createObjective() call.
                                var objectiveID = objectives[currentObjective].id;
                                var objectiveText = objectives[currentObjective].Description;
                                
                                o.changes && o.changes.forEach((changeText) => {
                                    var adjustment = {
                                        Description: changeText,
                                        "Objective[id]": objectiveID,
                                        "Objective[text]": objectiveText,
                                    };
                                    tasks.push(
                                        SdcPfsInterface.createAdjustment(adjustment)
                                    );
                                });
                                
                                o.results && o.results.forEach((r) => {
                                    var keyResult = {
                                        Description: r.text,
                                        "Objective[id]": objectiveID,
                                        "Objective[text]": objectiveText,
                                    };
                                    tasks.push(
                                        SdcPfsInterface.createKeyResult(keyResult)
                                    );
                                });
                                
                                currentObjective += 1;
                            });
                        });
                    }
                }
                
                return Promise.all(tasks);
            })
            .then((results) => {
                adjustments = results;
                var tasks = [];
            })
            .catch((err) => {
                reject(err);
            });
        });
    }

};