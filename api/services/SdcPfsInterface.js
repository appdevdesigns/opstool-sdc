var request = require('request');

var baseURL = '/app_builder/model/application/';
var authKey = '';
var pfsApplicationID, pfsObjectiveID, pfsKeyResultID, pfsProgressID;

sails.on('ready', () => {
    if (!sails.config.sdc || !sails.config.sdc.pfs) {
        throw new Error(`sdc config not found. The following settings are required:
        sdc: {
            pfsApplicationID: "ID for the SDC application in AppBuilder",
            pfsObjectiveID: "GUID for the Objective object in AppBuilder",
            pfsAdjustmentID: "GUID for the Adjustment object in AppBuilder",
            pfsKeyResultID: "GUID for the KeyResult object in AppBuilder",
            pfsProgressID: "GUID for the Progress object in AppBuilder",
            authKey: "Authentication key for HTTP requests"
        }`);
    }
        
    pfsApplicationID = sails.config.sdc.pfs.applicationID;
    pfsObjectveID = sails.config.sdc.pfs.objectiveID;
    pfsAdjustmentID = sails.config.sdc.pfs.adjustmentID;
    pfsKeyResultID = sails.config.sdc.pfs.keyResultID;
    pfsProgressID = sails.config.sdc.pfs.progressID;
    authKey = sails.config.sdc.pfs.authKey;
});

module.exports = {
    
    /**
     * Wrapper function for request.
     *
     * @param {string} url
     * @param {object} data
     * @param {string} [method]
     *      HTTP request method, default is 'post'.
     * @return {Promise}
     */
    request: function(url, data, method='post') {
        return new Promise((resolve, reject) => {
            request[method]({
                url: url,
                headers: {
                    'Authorization': authKey,
                    'Content-Type': 'application/json; charset=utf-8'
                },
                body: JSON.stringify(data),
                callback: (err, res, body) => {
                    if (err) reject(err);
                    else if (res.statusCode != 200) {
                        sails.log.verbose(body);
                        reject(new Error('Received code ' + res.statusCode));
                    }
                    else {
                        var result = null;
                        if (body) {
                            try {
                                result = JSON.parse(body);
                            } catch (e) {
                                result = body;
                            }
                        }
                        resolve(result);
                    }
                }
            });
        });
    },
    
    
    /**
     * @param {object} data
     * @return {Promise}
     */
    createObjective: function(data={}) {
        return new Promise((resolve, reject) => {
            this.request(
                baseURL + pfsApplicationID + '/object/' + pfsObjectiveID,
                data,
                'post'
            )
            .then(resolve)
            .catch(reject);
        });
    },
    
    /**
     * @param {object} data
     * @return {Promise}
     */
    createAdjustment: function(data) {
        return new Promise((resolve, reject) => {
            this.request(
                baseURL + pfsApplicationID + '/object/' + pfsAdjustmentID,
                data,
                'post'
            )
            .then(resolve)
            .catch(reject);
        });
    },
    
    /**
     * @param {object} data
     * @return {Promise}
     */
    createKeyResult: function(data) {
        return new Promise((resolve, reject) => {
            this.request(
                baseURL + pfsApplicationID + '/object/' + pfsKeyResultID,
                data,
                'post'
            )
            .then(resolve)
            .catch(reject);
        });
    },
    
    /**
     * @param {object} data
     * @return {Promise}
     */
    createProgress: function(data) {
        return new Promise((resolve, reject) => {
            this.request(
                baseURL + pfsApplicationID + '/object/' + pfsProgressID,
                data,
                'post'
            )
            .then(resolve)
            .catch(reject);
        });
    },
    
    
    importCategory: function(categoryData) {
        return new Promise((resolve, reject) => {
            var typeID;
            if (categoryData.title.match(/ministry/i)) {
                typeID = pfsObjectiveMinistryID;
            }
            else if (categoryData.title.match(/personal/i)) {
                typeID = pfsObjectivePersonalID;
            }
            else {
                typeID = pfsObjectiveAssignmentID;
            }
            
            var tasks = [];
            categoryData.objectives.forEach((obj) => {
                tasks.push(importObjective(typeID, obj));
            });
            
            Promise.all(tasks)
            .then(resolve)
            .catch(reject);
        });
    },
    
    
    /**
     * Create an Objective entry as well as any attached Adjustment and 
     * KeyResult entries, based on the `objectives` data item in the JSON 
     * imported from SDC.
     *
     * @param {integer} typeID
     *      The ID number for the objective Type.
     * @param {object} objectiveData
     * @return {Promise}
     */
    importObjective: function(typeID, objectiveData) {
        return new Promise((resolve, reject) => {
            var objectiveID;
            var adjustments = objectiveData.changes || [];
            var keyResults = objectiveData.results || [];
            
            SdcPfsInterface.createObjective({
                Description: objectiveData.title,
                Type: typeID,
            })
            .then((objective) => {
                objectiveID = objective.id;
                var tasks = [];
                
                adjustments.forEach((adjText) => {
                    tasks.push(SdcPfsInterface.createAdjustment({
                        Description: adjText,
                        "Objective[id]": objectiveID,
                        "Objective[text]": objectiveData.title,
                    });
                });
                
                return Promise.all(tasks);
            })
            .then((adjList) => {
                var tasks = [];
                
                keyResults.forEach((kr) => {
                    tasks.push(SdcPfsInterface.importKeyResult(
                        objectiveID, 
                        objectiveData.title, 
                        kr
                    );
                });
                
                return Promise.all(tasks);
            })
            .then(() => {
            
            })
            .catch((err) => {
                sails.log.error('Error from importObjective():', err);
                reject(err);
            });
        });
    },
    
    
    /**
     * Create a KeyResult entry as well as any attached Progress entries,
     * based on the `results` data item in the JSON imported from SDC.
     *
     * @param {integer} objectiveID
     * @param {string} objectiveText
     * @param {object} keyResultData
     * @return {Promise}
     */
    importKeyResult: function(objectiveID, objectiveText, keyResultData) {
        return new Promise((resolve, reject) => {
            SdcPfsInterface.createKeyResult({
                Description: keyResultData.text,
                "Objective[id]": objectiveID,
                "Objective[text]": objectiveText,
                Result: 0,
            })
            .then((kr) => {
                var keyResultID = kr.id;
                var tasks = [];
                
                var progress = keyResultData.progress || [];
                progress.forEach((progressText) => {
                    taks.push(SdcPfsInterface.createProgress({
                        Description: progressText,
                        Result: 0,
                        "KeyResults[id]": keyResultID,
                        "KeyResults[text]": keyResultData.text,
                    }));
                })
                return Promise.all(tasks);
            })
            .then(() => {
                resolve();
            })
            .catch((err) => {
                sails.log.error('importKeyResult error:', err);
                reject(err);
            });
        });
    }

};