/**
 * SDCPFS
 * 
 * This is not a real Sails model. It's just a way to provide traditional
 * SQL query access to the AppBuilder PFS data.
 */

var async = require('async');
var _ = require('lodash');


module.exports = {
    
    connection: 'appBuilder',
    tableName: 'AB_SDCNew_PFS',
    
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
        
        
    },
    
    ////
    //// Model class methods
    ////
    
    
    /**
     * Finds current PFS data of the given person.
     *
     * @param {integer} renID
     * @return {Promise}
     *      {
     *          pfs: { 
     *              objectives: {
     *                  <objective id>: {
     *                      Description: "...",
     *                      results: {
     *                          <results id>: {
     *                              progress: {
     *                                  <progress id>: { ... },
     *                                  ...
     *                              },
     *                          },
     *                          ...
     *                      },
     *                      adjustments: {
     *                          <adjustments id>: { ... },
     *                          ...
     *                      }
     *                  },
     *                  ...
     *              },
     *              ...
     *          },
     *          myRen: { ... },
     *          coachRen: { ... },
     *      }
     */
    currentPFS(renID) {
        return new Promise((resolve, reject) => {
            SDCPFS.query(`

                SELECT
                    -- pfs.*,
                    pfs.id AS pfs_id,
                    pfs.uuid AS pfs_uuid,
                    pfs.Year AS pfs_Year,
                    pfs.comments AS pfs_comments,
                    
                    -- obj.*,
                    obj.id AS obj_id,
                    obj.uuid AS obj_uuid,
                    obj.\`Next Steps\` AS obj_NextSteps,
                    obj.Description AS obj_Description,
                    obj.Type AS obj_Type,
                    obj.Evaluation AS obj_Evaluation,
                    
                    -- results.*,
                    results.id AS results_id,
                    results.uuid AS reuslts_uuid,
                    results.Result AS results_Result, -- numeric
                    results.Objectives AS results_Objectives,
                    results.Description AS results_Description,
                    
                    -- progress.*
                    progress.id AS progress_id,
                    progress.uuid AS progress_uuid,
                    progress.Description AS progress_Description,
                    progress.Result AS progress_Result, -- numeric
                    progress.KeyResults392 AS progress_KeyResults392,
                    
                    me.user,
                    me.id AS person_id,
                    myRen.ren_id AS my_renID,
                    myRen.ren_surname AS my_surname,
                    myRen.ren_givenname AS my_givenname,
                    myRen.ren_preferredname AS my_preferredname,
                    
                    coach.id AS coach_person_id,
                    coachRen.ren_id AS coach_renID,
                    coachRen.ren_surname AS coach_surname,
                    coachRen.ren_givenname AS coach_givenname,
                    coachRen.ren_preferredname AS coach_preferredname
                    
                FROM
                    AB_SDCNew_People AS me
                    JOIN AB_SDCNew_hrisrendata AS myRen
                        ON me.Profile = myRen.ren_id
                    
                    JOIN AB_SDCNew_PFS AS pfs
                        ON pfs.Profile = me.id
                        AND pfs.\`Current PFS\` = 1
                        
                    LEFT JOIN AB_SDCNew_Objectives AS obj
                        ON pfs.id = obj.MinObj
                    
                    LEFT JOIN AB_SDCNew_KeyResults AS results
                        ON results.Objectives = obj.id
                        
                    LEFT JOIN AB_SDCNew_Progress AS progress
                        ON progress.KeyResults392 = results.id
                        
                    LEFT JOIN AB_SDCNew_Adjustments AS adj
                        ON adj.Objective = obj.id
                        
                    LEFT JOIN AB_SDCNew_People AS coach
                        ON pfs.Coach = coach.id
                    LEFT JOIN AB_SDCNew_hrisrendata AS coachRen
                        ON coach.Profile = coachRen.ren_id
                        
                WHERE
                    myRen.ren_id = ?
                                    
            `, [renID], (err, list) => {
                if (err) reject(err);
                else {
                    /// Parse the results into separate objects
                    /// (or should we do multiple separate SQL querues instead?)
                    
                    // Single objects
                    var pfs = {};
                    var myRen = {};
                    var coachRen = {};
                    
                    // Collection of objects
                    var objectives = {};
                    var progress = {};
                    var adjustments = {};
                    var results = {};
                    
                    list.forEach((row) => {
                        // Parse out the separate objects
                        
                        pfs.id = row.pfs_id;
                        pfs.uuid = row.pfs_uuid;
                        pfs.Year = row.pfs_Year;
                        pfs.comments = row.pfs_comments;
                        
                        myRen.person_id = row.person_id;
                        myRen.ren_id = row.my_renID;
                        myRen.ren_surname = row.my_surname;
                        myRen.ren_givenname = row.my_givenname;
                        myRen.ren_preferredname = row.my_preferredname;
                        
                        coachRen.person_id = row.coach_person_id;
                        coachRen.ren_id = row.coach_renID;
                        coachRen.ren_surname = row.coach_surname;
                        coachRen.ren_givenname = row.coach_givenname;
                        coachRen.ren_preferredname = row.coach_preferredname;
                        
                        var objID = row.obj_id;
                        if (objID) {
                            objectives[objID] = {
                                id: objID,
                                uuid: row.obj_uuid,
                                'Next Steps': row.obj_NextSteps,
                                Description: row.obj_Description,
                                Type: row.obj_Type,
                                Evaluation: row.obj_Evaluation,
                            };
                        }
                        
                        var resultsID = row.results_id;
                        if (resultsID) {
                            results[resultsID] = {
                                id: resultsID,
                                uuid: row.results_uuid,
                                Result: row.results_Result,
                                Objectives: row.results_Objectives,
                                Description: row.results_Description,
                            };
                        }
                        
                        var progressID = row.progress_id;
                        if (progressID) {
                            progress[progressID] = {
                                id: progressID,
                                uuid: row.progress_uuid,
                                Description: row.progress_Description,
                                Result: row.progress_Result,
                                KeyResults392: row.progress_KeyResults392,
                            }
                        }
                                                
                    });
                    
                    // Connect objectives to pfs
                    pfs.objectives = objectives;
                    
                    for (var objID in pfs.objectives) {
                        var obj = pfs.objectives[objID];
                        
                        // Connect results to objectives
                        for (var resID in results) {
                            if (results[resID].Objectives == objID) {
                                obj.results = results[resID];
                            }
                            
                            // Connect progress to results
                            for (var progID in progress) {
                                if (progress[progID].KeyResults392 == resID) {
                                    results[resID].progress = progress[progID];
                                }
                            }
                        }
                        
                        // Connect adjustments to objectives
                        for (var adjID in adjustments) {
                            if (adjustments[adjID].Objective == objID) {
                                obj.adjustments = adjustments[adjID];
                            }
                        }
                    }
                    
                    resolve({
                        pfs: pfs,
                        myRen: myRen,
                        coachRen: coachRen,
                    });
                    
                }
            });

        });
    },
    

    /**
     * Finds the renIDs of the given person's coachees.
     *
     * @param {integer} renID
     * @return {Promise}
     *      Resolves with an array of integers
     */
    coachees(renID) {
        return new Promise((resolve, reject) => {
            SDCPFS.query(`

                SELECT
                    coachee.Profile AS ren_id
                FROM
                    AB_SDCNew_People AS me
                    
                    JOIN AB_SDCNew_PFS AS pfs
                        ON pfs.Coach = me.id
                        AND pfs.\`Current PFS\` = 1
                    
                    JOIN AB_SDCNew_People AS coachee
                        ON pfs.Profile = coachee.id
                        
                WHERE
                    me.Profile = ?
                                    
            `, [renID], (err, list) => {
                if (err) reject(err);
                else {
                    var result = [];
                    list.forEach((row) => {
                        result.push(row.ren_id);
                    });
                    resolve(result);
                }
            });

        });
    },
    

};
