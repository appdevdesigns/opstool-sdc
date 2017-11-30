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
        var emailAddress, authToken, sdcGUID, imageQR, tokenQR;
        
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
            
            return new Promise((resolve, reject) => {
                QRCode.toDataURL(JSON.stringify({
                    authToken, userInfo, relationships
                }), (err, image) => {
                    if (err) reject(err);
                    else resolve(image);
                });
            });
        })
        .then((image) => {
            imageQR = image;
            return SDCData.find({ ren_id: renID })
        })
        .then((list) => {
            if (list && list[0]) {
                tokenQR = list[0].token_qr;
            }
            
            EmailNotifications.trigger('sdc.appinfo', {
                to: [emailAddress],
                variables: {
                    image,
                    userInfo,
                    relationships,
                    tokenQR
                }
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
    
    }
    
};

