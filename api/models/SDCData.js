/**
 * SDCData
 * @module      :: Model
 */

var async = require('async');

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
                    ren.ren_surname, ren.ren_givenname, ren.ren_preferredname,
                    gen.gender_id, genT.gender_label,
                    team.team_id, teamT.team_label,
                    pos.position_id, posT.position_label
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
                        'ren_id', 'ren_surname', 'ren_givenname', 
                        'ren_preferredname', 'gender_id', 'gender_label',
                        'position_id', 'position_label',
                    ];
                    
                    list.forEach((row) => {
                        var teamID = row.team_id;
                        teams[teamID] = teams[teamID] || {
                            id: teamID,
                            name: row.team_label,
                            members: []
                        };
                        
                        var member = {};
                        memberFields.forEach((fieldName) => {
                            member[fieldName] = row[fieldName];
                        });
                        
                        teams[teamID].members.push(member);
                    });
                    
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
    }

};
