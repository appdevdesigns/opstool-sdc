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
                var html = '';
                
                teams.forEach((team) => {
                    html += `<div class="team">`;
                    html += `<h3>${team.name}</h3>`;
                    SDCData.generateCoachingPairs(team).forEach((item) => {
                        html += `<div class="coach"><b>Coach:</b>`
                        if (item.coach) {
                            html += `
                                    ${item.coach.ren_surname},
                                    ${item.coach.ren_givenname}
                                    (${item.coach.ren_preferredname})
                                    <span class="gender">[${item.coach.gender_label}]</span>
                                    <span class="position">${item.coach.position_label}</span>
                            `;
                        } else {
                            html += ` none`;
                        }
                        html += `
                                </div>
                                <ul class="coachee">
                        `;
                        item.coachee.forEach((member) => {
                            html += `
                                <li class="${member.derived ? 'derived' : ''}">
                                    ${member.ren_surname},
                                    ${member.ren_givenname}
                                    (${member.ren_preferredname})
                                    <span class="gender">[${member.gender_label}]</span>
                                    <span class="position">${member.position_label}</span>
                                </li>
                            `;
                        });
                        html += `</ul></div>`;
                    });
                });
                
                res.send(`
                    <!DOCTYPE html>
                    <html>
                        <head>
                            <style>
                                body {
                                    font-family: sans-serif;
                                    max-width: 50em;
                                    margin: 1em auto;
                                }
                                .team {
                                    border-top: 1px solid black;
                                    margin-top: 2em;
                                }
                                .coach {
                                    position: relative;
                                }
                                li {
                                    position: relative;
                                }
                                .gender {
                                    display: inline-block;
                                    float: right;
                                    font-size: .8em;
                                    padding-left: 1em;
                                    padding-right: 1em;
                                }
                                .position {
                                    display: inline-block;
                                    position: absolute;
                                    left: 28em;
                                    font-size: .9em;
                                    padding-left: 1em;
                                    padding-right: 1em;
                                }
                                .derived {
                                    color: blue;
                                }
                            </style>
                        </head>
                        <body>
                            ${html}
                        </body>
                    </html>
                `);
            }
        })
        .catch((err) => {
            res.AD.error(err);
            console.log(err);
        });
    
    }
    
};

