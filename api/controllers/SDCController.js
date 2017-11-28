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
        SDCData.generateSDCData()
        .then((data) => {
            res.send(data);
        })
        .catch((err) => {
            res.status(500).send(err.message || err);
        });
    },
    
    
    myInfo: function(req, res) {
        var renGUID = req.sdc.renGUID; // from sdcStaffInfo.js policy
        var authToken, sdcGUID, // SDC guid is different from ren guid
            userInfo = {}, 
            relationships = [];
        
        SDCData.findAuthTokenByGUID(renGUID)
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
                title: 'My SDC Info',
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

