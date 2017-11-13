/**
 * SDCData
 * @module      :: Model
 */

var async = require('async');
var _ = require('lodash');

module.exports = {
    
    tableName: 'sdc',
    
    autoCreatedAt: false,
    autoUpdatedAt: false,
    autoPK: false,
    migrate: 'alter',
    
    attributes: {
        id: {
            type: 'integer',
            size: 11,
            primaryKey: true,
            autoIncrement: true
        }
    },
    
    ////
    //// Life cycle callbacks
    ////
    
    
    
    ////
    //// Model class methods
    ////
    
    
    /**
     * @param {string} renGUID
     * @return {Promise}
     *      Resolves with a {string} of the auth token
     *      or rejects with an {error}.
     */
    findAuthTokenByGUID: function(renGUID) {
        return new Promise((resolve, reject) => {
            LHRISWorker.query(`
                
                SELECT
                    w.sdc_token,
                    w.sdc_guid
                FROM
                    hris_ren_data r
                    JOIN hris_worker w
                        ON r.ren_id = w.ren_id
                WHERE
                    r.ren_guid = ?
                    
            `, [renGUID], (err, list) => {
                if (err) reject(err);
                else if (!list || !list[0]) reject (new Error('HRIS worker info not found'));
                else resolve({
                    sdcGUID: list[0].sdc_guid,
                    authToken: list[0].sdc_token
                });
            });
        });
    },
    
    /**
     * Fetch team data from HRIS
     *
     * @param {string} [langCode]
     *      Default language code is 'en'.
     * @return Promise
     *      Resolves with array:
     *          [
     *              {
     *                  id: 123,
     *                  name: "Team Name",
     *                  members: [
     *                      {
     *                          ren_id: 123,
     *                          ren_surname: "Yao",
     *                          ren_givenname: "Ming",
     *                          ren_preferredname: "Bob",
     *                          gender_id: 3,
     *                          gender_label: "Male",
     *                          position_id: 3,
     *                          position_label: "Team Leader"
     *                      },
     *                      ...
     *                  ]
     *              },
     *              { ... },
     *              ...
     *          ]
     */
    fetchTeams: function(langCode='en') {
        return new Promise((resolve, reject) => {
            
            var results = [];
            LHRISRen.query(`
                
                SELECT
                    w.sdc_token, w.sdc_guid,
                    ren.ren_id, ren.ren_guid,
                    ren.ren_surname, ren.ren_givenname, ren.ren_preferredname,
                    gen.gender_id, genT.gender_label,
                    team.team_id, teamT.team_label,
                    pos.position_id, posT.position_label,
                    team.parent_id
                FROM
                    hris_assign_team_data team
                    
                    JOIN hris_assign_team_trans teamT
                        ON team.team_id = teamT.team_id
                        AND teamT.language_code = ?
                    
                    JOIN hris_assignment assign
                        ON assign.team_id = team.team_id
                        AND assign.assignment_enddate = '1000-01-01'
                        
                    JOIN hris_assign_position_data pos
                        ON assign.position_id = pos.position_id
                    JOIN hris_assign_position_trans posT
                        ON pos.position_id = posT.position_id
                        AND posT.language_code = ?
                    
                    JOIN hris_ren_data ren
                        ON assign.ren_id = ren.ren_id
                        AND ren.statustype_id IN (3, 4, 5)
                    JOIN hris_gender_data gen
                        ON ren.gender_id = gen.gender_id
                    JOIN hris_gender_trans genT
                        ON gen.gender_id = genT.gender_id
                        AND genT.language_code = ?
                    
                    JOIN hris_worker w
                        ON ren.ren_id = w.ren_id
                        AND w.worker_dateleftchinamin = '1000-01-01'
                        AND w.worker_terminationdate = '1000-01-01'
            `, 
            [langCode, langCode, langCode], 
            (err, list) => {
                if (err) reject(err);
                else if (!list || !list[0]) {
                    reject(new Error('No HRIS data found'));
                }
                else {
                    var teams = {};
                    var memberFields = [
                        'ren_id', /*'ren_guid',*/ 'ren_surname', 'ren_givenname', 
                        'ren_preferredname', 'gender_id', 'gender_label',
                        'position_id', 'position_label', 'team_label',
                        'sdc_token', 'sdc_guid'
                    ];
                    
                    // 1st pass
                    list.forEach((row) => {
                        var teamID = row.team_id;
                        teams[teamID] = teams[teamID] || {
                            id: teamID,
                            parent: row.parent_id,
                            name: row.team_label,
                            members: [],
                            leaders: []
                        };
                        
                        var member = {};
                        memberFields.forEach((fieldName) => {
                            member[fieldName] = row[fieldName];
                        });
                        teams[teamID].members.push(member);
                        
                        if (member.position_id == 3 || member.position_id == 6) {
                            teams[teamID].leaders.push(member);
                        }
                    });
                    
                    // 2nd pass: team leaders into parent teams
                    for (var id in teams) {
                        var team = teams[id];
                        var hasLeaders = team.leaders.length > 0;
                        var parentTeam = teams[team.parent || 0];
                        
                        if (hasLeaders && parentTeam) {
                            team.leaders.forEach((leader) => {
                                var member = _.clone(leader);
                                member.position_id = 4; // member
                                member.position_label = member.team_label;
                                member.derived = true;
                                parentTeam.members.push(member);
                            });
                        }
                    }
                    
                    // Convert results into array
                    for (var id in teams) {
                        results.push(teams[id]);
                    }
                    resolve(results);
                }
            });
            
        });
    },
    
    
    /**
     * @param {Object} teamData
     *      One element from the results of fetchTeams()
     * @return {Array}
     *      Array of objects
     *      [
     *          {
     *              coach: { <ren json data> },
     *              coachee: [
     *                  { <ren json data> },
     *                  { <ren json data> },
     *                  ...
     *              ]
     *          },
     *          {
     *              coach: { <ren json data> },
     *              coachee: [
     *                  { <ren json data> },
     *                  { <ren json data> },
     *                  ...
     *              ]
     *          }
     *      ]
     */
    generateCoachingPairs: function(teamData) {
        // Group by gender
        var results = [];
        var byGender = {};
        teamData.members.forEach((member) => {
            var genderID = member.gender_id;
            byGender[genderID] = byGender[genderID] || {
                coach: null,
                coachee: []
            };
            if (member.position_id == 3 || member.position_id == 6) {
                byGender[genderID].coach = member;
            }
            else {
                byGender[genderID].coachee.push(member);
            }
        });
        
        // Convert to array
        for (var id in byGender) {
            results.push(byGender[id]);
        }
        
        return results;
    },
    
    
    /**
     * @param {string} [guidFilter]
     *      Only return results for this SDC GUID.
     *      Default is no filter.
     * @param {boolean} [includeNames]
     *      Whether or not to include contact names in the relationships list,
     *      in addition to the contact IDs.
     *      Default is false.
     * @return {Promise}
     */
    generateSDCData: function(guidFilter=null, includeNames=false) {
        return new Promise((resolve, reject) => {
            
            SDCData.fetchTeams()
            .then((teamData) => {
                // Use team data to generate coaching pairs for each team
                var gcpQueue = [];
                teamData.forEach((team) => {
                    // Each team is done separately in parallel
                    gcpQueue.push(SDCData.generateCoachingPairs(team));
                });
                
                return Promise.all(gcpQueue)
            })
            .then((gcpResults) => {
                // Flatten the previous results into a single array
                var coachingData = [];
                gcpResults.forEach((gcp) => {
                    coachingData = coachingData.concat(gcp);
                });
                
                var packet = function(user) {
                    return {
                        //id: user.ren_guid,
                        id: user.sdc_guid,
                        //name: `${user.ren_surname}, ${user.ren_givenname} (${user.ren_preferredname})`,
                        name: user.ren_preferredname,
                        auth_token: user.sdc_token
                    }
                };
                
                // Parse out a list of unique users, and a list of relationships
                var users = {};
                var relationships = [];
                coachingData.forEach((obj) => {
                    var isCoachPresent = false;
                    var coachID = null;
                    
                    // Coach is a user
                    if (obj.coach && obj.coach.sdc_guid) {
                        isCoachPresent = true;
                        coachID = obj.coach.sdc_guid;
                        users[coachID] = users[coachID] || packet(obj.coach);
                    }
                    
                    // Coachees are all users also
                    obj.coachee.forEach((o) => {
                        var coacheeID = o.sdc_guid;
                        users[coacheeID] = users[coacheeID] || packet(o);
                        
                        // Relationship exists if both coach & coachee present
                        if (isCoachPresent) {
                            if (!guidFilter || guidFilter == coachID) {
                                var rel = {
                                    user: coachID,
                                    contact: coacheeID,
                                    role: 'coachee'
                                };
                                relationships.push(rel);
                            }
                            if (!guidFilter || guidFilter == coacheeID) {
                                var rel = {
                                    user: coacheeID,
                                    contact: coachID,
                                    role: 'coach'
                                };
                                relationships.push(rel);
                            }
                        }
                    });
                    
                });
                
                if (includeNames) {
                    relationships.forEach((rel) => {
                        var id = rel.contact;
                        rel.name = users[id].name;
                    });
                }
                    
                // Convert indexed user list to array
                var userArray = [];
                if (guidFilter) {
                    userArray.push(users[guidFilter]);
                }
                else {
                    for (var id in users) {
                        userArray.push(users[id]);
                    }
                }
                
                resolve({
                    users: userArray, 
                    relationships: relationships,
                });
            })
            .catch((err) => {
                console.log(err);
                reject(err);
            });
        });
    }
    
    

};
