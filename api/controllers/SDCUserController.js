/**
 * SDCUserController
 *
 * @description :: For SDC end users
 * @help        :: See http://links.sailsjs.org/docs/controllers
 */

var QRCode = require('qrcode');
const deepLinkBase = 'https://sdc.appdevdesigns.net/ul?settings=';

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
            relationships = [],
            deepLink;
        
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
            deepLink = deepLinkBase + encodeURIComponent(QRData);
            
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
                relationships,
                deepLink
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
        var QRData, urlQR, tokenQR, base64QR;
        var deepLink;
        
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
            deepLink = deepLinkBase + encodeURIComponent(QRData);
            
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
                    cidQR: cid,   // CID for the QR code attachment
                    deepLink,
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
        
    
};

