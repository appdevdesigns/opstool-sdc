/**
 * SDCData
 * 
 * This model's table stores basic user information for accessing the SDC mobile
 * app. However, most of the advanced information is derived from assignments
 * and relationships within the HRIS. The model class methods help to extract
 * that information and manipulate it into a useable format.
 *
 * @module      :: Model
 */

var async = require('async');
var _ = require('lodash');

module.exports = {
    
    tableName: 'sdc',
    
    autoCreatedAt: false,
    autoUpdatedAt: false,
    autoPK: false,
    migrate: 'safe',
    
    attributes: {
        id: {
            type: 'integer',
            size: 11,
            primaryKey: true,
            autoIncrement: true
        },
        
        ren_id: {
            type: 'integer',
            size: 11,
        },
        
        // token for a user to view their own QR code on the VPN
        token_qr: {
            type: 'mediumtext',
        },
        
        // primary key on the client side app
        sdc_guid: {
            type: 'mediumtext',
        },
        
        // secret authentication token between client app & public server
        sdc_token: {
            type: 'mediumtext',
        },
        
    },
    
    ////
    //// Life cycle callbacks
    ////
    
    
    
    ////
    //// Model class methods
    ////
    
    
    /**
     * Initialize SDC accounts for new users from HRIS.
     *
     * @return {Promise}
     */
    initAccounts: function() {
        return new Promise((resolve, reject) => {
            var hrisRen = [];
            var sdcUsers = [];
            
            async.series([
                (next) => {
                    // Find active & assigned workers in HRIS.
                    // See also LHRISWorker.activeAssignedWorkers()
                    LHRISWorker.query(`
                        SELECT
                            ren.ren_id
                        FROM
                            hris_assign_team_data team
                            
                            -- Assignment
                            JOIN hris_assignment assign
                                ON assign.team_id = team.team_id
                                AND assign.assignment_isprimary
                                AND (
                                    assign.assignment_enddate = '1000-01-01'
                                    OR assign.assignment_enddate > NOW()
                                )
                            
                            -- Ren
                            JOIN hris_ren_data ren
                                ON assign.ren_id = ren.ren_id
                                AND ren.statustype_id IN (3, 4, 5)
                            
                            JOIN hris_worker w
                                ON ren.ren_id = w.ren_id
                                AND w.worker_dateleftchinamin = '1000-01-01'
                                AND w.worker_terminationdate = '1000-01-01'
                            
                            -- Ensure only one result per person
                            GROUP BY
                                ren.ren_id
                    `, [], (err, list) => {
                        if (err) next(err);
                        else {
                            hrisRen = list.map(x => x.ren_id) || [];
                            next();
                        }
                    });
                },
                
                (next) => {
                    // Find existing SDC users
                    SDCData.query(`
                        SELECT ren_id
                        FROM sdc
                    `, [], (err, list) => {
                        if (err) next(err);
                        else {
                            sdcUsers = list.map(x => x.ren_id) || [];
                            next();
                        }
                    });
                },
                
                (next) => {
                    // Add new HRIS users to SDC table
                    // (we have to do this the long way because the HRIS may
                    //  be on a separate server from the local DB)
                    var diff = _.difference(hrisRen, sdcUsers);
                    if (diff.length > 0) {
                        console.log('Initializing ' + diff.length + ' SDC accounts...');
                    }
                    async.each(diff, (renID, nextRen) => {
                        SDCData.query(`
                            
                            INSERT INTO sdc
                            SET
                                ren_id = ?,
                                sdc_guid = UUID(),
                                sdc_token = SHA2(CONCAT(RAND(), UUID()), 224),
                                token_qr = SHA2(CONCAT(UUID(), RAND()), 224)
                            
                        `, [renID], (err) => {
                            if (err) nextRen(err);
                            else nextRen();
                        });
                        
                    }, (err) => {
                        if (err) next(err);
                        else next();
                    });
                },
                
                (next) => {
                    // Make sure Relay has latest HRIS users
                    RelayUser.initializeFromHRIS()
                    .then(() => {
                        next();
                    })
                    .catch(next);
                },
                
                (next) => {
                    // Add new SDC users to Relay Application Users
                    SDCData.query(`
                        
                        INSERT INTO relay_application_user
                        (ren_id, user, application)
                        (
                            -- This finds SDC users who do not have Relay Application accounts
                            SELECT
                                sdc.ren_id, sdc_guid, 'sdc'
                            FROM
                                sdc
                                LEFT JOIN relay_application_user au
                                    ON sdc.ren_id = au.ren_id
                                    AND au.application = 'sdc'
                            WHERE
                                au.id IS NULL
                        )
                        
                    `, [], (err) => {
                        if (err) nex(err);
                        else next();
                    });
                }
            
            ], (err) => {
                if (err) {
                    console.log(err);
                    reject(err);
                }
                else {
                    console.log('done.');
                    resolve();
                }
            });
        
        });
    },
    
    
    /**
     * @param {integer} renID
     * @return {Promise}
     *      Resolves with a basic {object}
     *      or rejects with an {error}.
     */
    findAuthTokenByRenID: function(renID) {
        return new Promise((resolve, reject) => {
            SDCData.query(`
                
                SELECT
                    sdc_token, sdc_guid
                FROM
                    sdc
                WHERE
                    ren_id = ?
                
            `, [renID], (err, list) => {
                if (err) reject(err);
                else if (!list || !list[0]) reject (new Error('HRIS worker info not found'));
                else resolve({
                    sdcGUID: list[0].sdc_guid,
                    authToken: list[0].sdc_token
                });
            });
        });
    },
    
    
    findEmailByRenID: function(renID) {
        return new Promise((resolve, reject) => {
            LHRISEmail.find({
                ren_id: renID,
                email_issecure: 1
            })
            .exec((err, list) => {
                if (err) reject(err);
                else if (!list || !list[0]) {
                    reject(new Error('Not found'));
                }
                else {
                    resolve(list[0].email_address);
                }
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
     *                          position_label: "Team Leader",
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
            var teams = {};
            var sdcByRenID = {};
            
            SDCData.find()
            .then((list) => {
                list.forEach((row) => {
                    var renID = row.ren_id;
                    sdcByRenID[renID] = row;
                });
                
                return LHRISWorker.activeAssignedWorkers(langCode);
            })
            .then((list) => {
                var memberFields = [
                    // Ren info
                    'ren_id', 'ren_surname', 'ren_givenname', 
                    'ren_preferredname', 'gender_id', 'gender_label',
                    
                    // Assignment info
                    'position_id', 'position_label', 'team_label',
                    
                    // SDC info
                    'sdc_token', 'sdc_guid'
                ];
                
                // 1st pass
                list.forEach((row) => {
                    var renID = row.ren_id;
                    var teamID = row.team_id;
                    teams[teamID] = teams[teamID] || {
                        id: teamID,
                        parent: row.parent_id,
                        name: row.team_label,
                        location_id: row.location_id,
                        mcc: row.mcc,
                        members: [],
                        leaders: []
                    };
                    
                    if (!sdcByRenID[renID]) {
                        sails.log.warn('Warning: SDC user list is missing renID: ' + renID);
                    }
                    
                    var member = {};
                    memberFields.forEach((fieldName) => {
                        // Merge SDC info into member data
                        if (sdcByRenID[renID] && sdcByRenID[renID][fieldName]) {
                            member[fieldName] = sdcByRenID[renID][fieldName];
                        }
                        // Merge worker & ren info into member data
                        else if (row[fieldName]) {
                            member[fieldName] = row[fieldName];
                        }
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
                
                return LHRISAssignLocation.mapToRegion();
            })
            .then((locations, regions) => {
                // add team region labels
                for (var id in teams) {
                    var team = teams[id];
                    var teamLocation = locations[team.location_id];
                    var teamRegion = locations[teamLocation.region_location_id];
                    team.region = teamRegion.location_label;
                }
                
                // Convert results into array
                var results = [];
                for (var id in teams) {
                    results.push(teams[id]);
                }
                resolve(results);
            })
            .catch((err) => {
                console.log('SDCData.fetchTeams() error', err);
                reject(err);
            });
            
        });
    },
    
    
    /**
     * Takes one result of fetchTeams() and organizes team members into coach
     * and coachee relationships according to their gender and leadership role.
     *
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
        var byGender = {};
        var coachGroup;
        
        teamData.members.forEach((member) => {
            var genderID = member.gender_id;
            byGender[genderID] = byGender[genderID] || {
                coach: null,
                coachee: []
            };
            if (member.position_id == 3 || member.position_id == 6) {
                byGender[genderID].coach = member;
                coachGroup = byGender[genderID];
            }
            else {
                byGender[genderID].coachee.push(member);
            }
        });
        
        // If any group doesn't have a coach, assign all members to the
        // one that does have a coach.
        for (var id in byGender) {
            var group = byGender[id];
            if (!group.coach && coachGroup) {
                coachGroup.coachee = coachGroup.coachee.concat(group.coachee);
                delete byGender[id];
            }
        }
        
        // Convert to array
        var results = [];
        for (var id in byGender) {
            results.push(byGender[id]);
        }
        
        return results;
    },
    
    
    /**
     * Fetches the info and relationships of a given SDC user.
     *
     * @param {string} [guidFilter]
     *      Only return results for this SDC GUID.
     *      Default is no filter.
     * @param {boolean} [includeNames]
     *      Whether or not to include contact names in the relationships list,
     *      in addition to the contact IDs.
     *      Default is false.
     * @return {Promise}
     *      {
     *          users: { ... },
     *          relationships: [ ... ]
     *      }
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
