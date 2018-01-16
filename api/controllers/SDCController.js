/**
 * SDCController
 *
 * @description :: Server-side logic for SDC
 * @help        :: See http://links.sailsjs.org/docs/controllers
 */

var QRCode = require('qrcode');

/**
 * Takes the results of a single-result SDCData.generateSDCData() call and 
 * returns a packet for that user's QR code.
 * return {String}
 */
function packageQRInfo(results) {
    var userInfo = results.users[0];
    
    if (sails.config.sdc && sails.config.sdc.codePushKeys) {
        userInfo.updateKeys = {
            ios: sails.config.sdc.codePushKeys.ios,
            android: sails.config.sdc.codePushKeys.android,
        }
    }
    
    return JSON.stringify({
        userInfo: userInfo,
        relationships: results.relationships
    });
}


module.exports = {

    _config: {
 //       model: "sdcdata", // all lowercase model name
 //       actions: true,
 //       shortcuts: true,
 //       rest: true
    },
    
    userList: function(req, res) {
        SDCData.generateSDCData(null, true)
        .then((data) => {
            res.send(data);
        })
        .catch((err) => {
            res.status(500).send(err.message || err);
        });
    },
    
    
    // Shows the renInfo page for the current user
    myInfo: function(req, res) {
        var renID = req.sdc.renID; // from sdcStaffInfo.js policy
        req.params.ren_id = renID;
        this.renInfo(req, res);
    },
    
    
    // Shows a user's SDC information and QR code
    renInfo: function(req, res) {
        var renID = req.param('ren_id');
        var authToken, sdcGUID, // SDC guid is different from ren guid
            userInfo = {}, 
            relationships = [];
        
        SDCData.findAuthTokenByRenID(renID)
        .then((results) => {
            authToken = results.authToken;
            sdcGUID = results.sdcGUID;
            return SDCData.generateSDCData(sdcGUID, true);
        })
        .then((results) => {
            userInfo = results.users[0];
            relationships = results.relationships;
            var QRData = packageQRInfo(results);
            
            return new Promise((resolve, reject) => {
                QRCode.toDataURL(QRData, (err, image) => {
                    if (err) reject(err);
                    else resolve(image);
                });
            })
        })
        .then((image) => {
            res.view('opstool-sdc/myInfo', {
                title: 'SDC Info',
                renID,
                image,
                authToken,
                userInfo,
                relationships
            });
        })
        .catch((err) => {
            res.status(500).send(err.message || err);
        });
    },
    
    
    // Serve a user's QR code as an image file
    renQrCode: function(req, res) {
        var tokenQR = req.param('token_qr');
        var authToken, userInfo, relationships;
        
        SDCData.find({ token_qr: tokenQR })
        .then((list) => {
            if (!list || !list[0]) {
                throw new Error('Not found');
            }
            else {
                var renID = list[0].ren_id;
                return SDCData.findAuthTokenByRenID(renID);
            }
        })
        .then((results) => {
            var sdcGUID = results.sdcGUID;
            authToken = results.authToken;
            return SDCData.generateSDCData(sdcGUID, true);
        })
        .then((results) => {
            QRCode.toFileStream(res, packageQRInfo(results));
        })
        .catch((err) => {
            res.status(500).send(err.message || err);
        });
    
    },
    
    
    // Sends a user's SDC information and QR code by email
    emailInfo: function(req, res) {
        var renID = req.param('ren_id');
        var emailAddress, authToken, sdcGUID;
        var QRData, urlQR, tokenQR, stringQR, base64QR;
        
        SDCData.findEmailByRenID(renID)
        .then((result) => {
            emailAddress = result;
            return SDCData.findAuthTokenByRenID(renID);
        })
        .then((results) => {
            authToken = results.authToken;
            sdcGUID = results.sdcGUID;
            return SDCData.generateSDCData(sdcGUID, true);
        })
        .then((results) => {
            userInfo = results.users[0];
            relationships = results.relationships;
            QRData = packageQRInfo(results);
            
            return new Promise((resolve, reject) => {
                QRCode.toDataURL(QRData, (err, image) => {
                    if (err) reject(err);
                    else {
                        urlQR = image;
                        base64QR = image.substring(22);
                        resolve();
                    }
                });
            });
        })
        .then(() => {
            return new Promise((resolve, reject) => {
                QRCode.toString(QRData, (err, image) => {
                    if (err) reject(err);
                    else {
                        stringQR = image;
                        resolve();
                    }
                });
            });
        })
        .then(() => {
            return new Promise((resolve, reject) => {
                SDCData.find({ ren_id: renID })
                .exec((err, list) => {
                    if (err) reject(err);
                    else if (!list || !list[0]) {
                        tokenQR = '';
                        resolve();
                    }
                    else {
                        tokenQR = list[0].token_qr;
                        resolve();
                    }
                });
            });
        })
        .then(() => {
            var cid = 'qrcode@sdc.zteam.biz';
            var qrcodeBuffer = Buffer.from(base64QR, 'base64');
            
            EmailNotifications.trigger('sdc.appinfo', {
                to: [emailAddress],
                variables: {
                    image: urlQR, // data URL base64 encoded
                    userInfo,
                    relationships,
                    tokenQR,      // token to use in renQrCode() route
                    stringQR,     // ASCII QR code
                    cidQR: cid,   // CID for the QR code attachment
                },
                attachments: [
                    {
                        filename: 'qrcode.png',
                        content: qrcodeBuffer,
                        contents: qrcodeBuffer, // old version syntax
                        cid: cid
                    }
                ]
            })
            .done((html) => {
                res.send(html || 'OK');
            })
            .fail((err) => {
                throw err;
            });
        })
        .catch((err) => {
            res.send(err.message || err);
        });
    },
    
    
    // Displays all SDC users
    report: function(req, res) {
        
        SDCData.fetchTeams()
        .then((teams) => {
            if (!teams || !teams[0]) {
                throw new Error('No teams found');
            }
            else {
                teams.forEach((team) => {
                    team.coachingPairs = SDCData.generateCoachingPairs(team);
                });
                res.view('opstool-sdc/report', {
                    title: 'SDC teams report',
                    teams: teams,
                });
            }
        })
        .catch((err) => {
            res.AD.error(err);
            console.log(err);
        });
    
    },
    
    
    appointmentsReport: function(req, res) {
        
        var startDate = req.param('startDate');
        var endDate = req.param('endDate');
        
        var teams, appointments;
        
        var bySession = {
        /*
            <session>: {
                confirmed: <int>,
                pending: <int>,
                requested: <int>,
                completed: <int>,
            },
            ...
        */
        };
        
        var byUser = {
        /*
            <sdc_guid>: {
                confirmed: <int>,
                pending: <int>,
                requested: <int>,
                completed: <int>,
            },
            ...
        */
        };
        
        var byStatus = {
        /*
            confirmed: <int>,
            pending: <int>,
            requested: <int>,
            completed: <int>,
        */
        };
        
        SDCData.fetchTeams()
        .then((teamList) => {
            teams = teamList;
            
            return SDCUserAppointment.findByDate(startDate, endDate)
        })
        .then((appointmentList) => {
            appointments = appointmentList;
            appointments.forEach((row) => {
                // Compile status counts
                bySession[row.session] = bySession[row.session] || {};
                bySession[row.session][row.status] = bySession[row.session][row.status] || 0;
                bySession[row.session][row.status] += 1;
                
                byUser[row.user] = byUser[row.user] || {};
                byUser[row.user][row.status] = byUser[row.user][row.status] || 0;
                byUser[row.user][row.status] += 1;
                
                byStatus[row.status] = byStatus[row.status] || 0;
                byStatus[row.status] += 1;
            });
            
            
            teams.forEach((team) => {
                team.appointments = {};
                
                // embed appointment status counts for each member
                team.members.forEach((member) => {
                    member.appointments = byUser[ member.sdc_guid ];
                    
                    // sum the count totals for the team
                    for (var status in member.appointments) {
                        team.appointments[status] = team.appointments[status] || 0;
                        team.appointments[status] += member.appointments[status];
                    }
                });
            });
            
            res.view('opstool-sdc/appointments', {
                title: 'SDC appointments report',
                teams: teams,
                appointments: appointments,
                byUser: byUser,
                byStatus: byStatus,
                bySession: bySession,
            });
            
        })
        .catch((err) => {
            console.log(err);
            res.serverError(err.message || err);
        });
    
    },
    
    appointmentsReport2: function(req, res) {
        res.view('opstool-sdc/appointments2', {
            title: 'SDC appointments report',
        });
    },
    
    
    appointmentsReportData: function(req, res) {
        var startDate = req.param('startDate');
        var endDate = req.param('endDate');
        
        var teams, appointments;
        
        // Array of status types
        var statuses = ['requested', 'pending', 'confirmed', 'completed', 'rejected'];
        
        var bySession = {
        /*
            <session>: {
                confirmed: <int>,
                pending: <int>,
                requested: <int>,
                completed: <int>,
            },
            ...
        */
        };
        
        var byUser = {
        /*
            <sdc_guid>: {
                confirmed: <int>,
                pending: <int>,
                requested: <int>,
                completed: <int>,
            },
            ...
        */
        };
        
        var byUserSession = {
        /*
            <sdc_guid>: {
                1: {
                    confirmed: <int>,
                    completed: <int>,
                    ...
                },
                2: { ... },
                3: { ... }
            },
            ...
        */
        };
        
        var byStatus = {
        /*
            confirmed: <int>,
            pending: <int>,
            requested: <int>,
            completed: <int>,
        */
        };
        
        var locations = {
        /*
            <location_id>: {
                region_location_id: <int>,
                ...
            }
        */
        };
        
        SDCData.fetchTeams()
        .then((teamList) => {
            teams = teamList;
            
            return LHRISAssignLocation.mapToRegion();
        })
        .then((locationData, regionData) => {
            locations = locationData;
            
            return SDCUserAppointment.findByDate(startDate, endDate)
        })
        .then((appointmentList) => {
            appointments = appointmentList;
            appointments.forEach((row) => {
                // Compile status counts
                bySession[row.session] = bySession[row.session] || {};
                bySession[row.session][row.status] = bySession[row.session][row.status] || 0;
                bySession[row.session][row.status] += 1;
                
                byUser[row.user] = byUser[row.user] || {};
                byUser[row.user][row.status] = byUser[row.user][row.status] || 0;
                byUser[row.user][row.status] += 1;
                
                byStatus[row.status] = byStatus[row.status] || 0;
                byStatus[row.status] += 1;
                
                byUserSession[row.user] = byUserSession[row.user] || {};
                byUserSession[row.user][row.status] = {
                    1: 0,
                    2: 0,
                    3: 0,
                };
                byUserSession[row.user][row.status][row.session] += 1;
                
            });
            
            teams.forEach((team) => {
                team.appointments = {};
                
                // add team region label
                var teamLocation = locations[team.location_id];
                var teamRegion = locations[teamLocation.region_location_id];
                team.region = teamRegion.location_label;
                
                // embed appointment status counts for each member
                team.members.forEach((member) => {
                    member.appointments = byUser[ member.sdc_guid ];
                    member.appointmentsBySession = byUserSession[ member.sdc_guid ];
                    
                    // sum the count totals for the team
                    statuses.forEach((status) => {
                        team.appointments[status] = team.appointments[status] || {
                            total: 0,
                            1: 0,
                            2: 0,
                            3: 0
                        };
                        for (var session=1; session<=3; session++) {
                            if (member.appointments && member.appointmentsBySession[status]) {
                                team.appointments[status].total += member.appointmentsBySession[status][session];
                                team.appointments[status][session] += member.appointmentsBySession[status][session];
                            }
                        }
                        
                    });
                });
            });
            
            
            var results = [];
            teams.forEach((team) => {
                var row = {
                    name: team.name,
                    region: team.region,
                    members: team.members.length,
                    appointments: team.appointments,
                    
                    confirmed1: team.appointments.confirmed[1],
                    completed1: team.appointments.completed[1],
                    
                    confirmed2: team.appointments.confirmed[2],
                    completed2: team.appointments.completed[2],
                    
                    confirmed3: team.appointments.confirmed[3],
                    completed3: team.appointments.completed[3],
                    
                    /*
                    rejected: team.appointments.rejected.total || 0,
                    requested: team.appointments.requested.total || 0,
                    pending: team.appointments.pending.total || 0,
                    confirmed: team.appointments.confirmed.total || 0,
                    completed: team.appointments.completed.total || 0,
                    */
                };
                results.push(row);
            });
            
            res.send(results);
            
        })
        .catch((err) => {
            console.log(err);
            res.serverError(err.message || err);
        });
    
    }
    
};

