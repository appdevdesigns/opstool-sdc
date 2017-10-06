/**
 * SDCController
 *
 * @description :: Server-side logic for SDC
 * @help        :: See http://links.sailsjs.org/docs/controllers
 */


module.exports = {

    _config: {
 //       model: "sdcdata", // all lowercase model name
 //       actions: true,
 //       shortcuts: true,
 //       rest: true
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
                                    [${item.coach.gender_label}]
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
                                <li>
                                    ${member.ren_surname},
                                    ${member.ren_givenname}
                                    (${member.ren_preferredname})
                                    [${member.gender_label}]
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
                                }
                                .team {
                                    border-top: 1px solid black;
                                    margin-top: 2em;
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

