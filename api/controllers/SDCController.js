/**
 * SDCController
 *
 * @description :: Server-side logic for SDC
 * @help        :: See http://links.sailsjs.org/docs/controllers
 */

var QRCode = require('qrcode');

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
    
    
    myInfo: function(req, res) {
        var renID = req.sdc.renID; // from sdcStaffInfo.js policy
        req.params.ren_id = renID;
        this.renInfo(req, res);
    },
    
    
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
            
            return new Promise((resolve, reject) => {
                QRCode.toDataURL(JSON.stringify({
                    authToken, userInfo, relationships
                }), (err, image) => {
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
            userInfo = results.users[0];
            relationships = results.relationships;
            QRCode.toFileStream(res, JSON.stringify({
                authToken, userInfo, relationships
            }));
        })
        .catch((err) => {
            res.status(500).send(err.message || err);
        });
    
    },
    
    
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
            
            QRData = JSON.stringify({
                authToken, userInfo, relationships
            });
            
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
            res.error(err.message || err);
        });
    },
    
    
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
    
    }
    
};

