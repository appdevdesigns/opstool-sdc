/**
 * SDCPFSController
 *
 */

var async = require('async');

module.exports = {

    _config: {
       actions: true,
       shortcuts: false,
       rest: false
    },
    
    
    /**
     * Fetches the current user's PFS data.
     */
    myCurrentPFS(req, res) {
        var renID = req.user.userModel.ren_id;
        if (renID) {
            SDCPFS.currentPFS(renID)
            .then((data) => {
                res.send(data);
            })
            .catch((err) => {
                res.AD.error(err);
            });
        }
        else {
            res.send({});
        }
    },
    
    
    /**
     * Fetches the PFS data from all of the current user's coachees.
     */
    myCoacheesPFS(req, res) {
        var myRenID = req.user.userModel.ren_id;
        if (myRenID) {
            var results = {
            /*
                <ren_id>: < myCurrentPFS() results >,
                ...
            */
            };
            
            
            SDCPFS.coachees(myRenID)
            .then((coacheeRenIDs) => {
                return new Promise((resolve, reject) => {
                    async.eachSeries(coachRenIDs, (renID, next) => {
                        this.myCurrentPFS(renID)
                        .then((data) => {
                            results[renID] = data;
                            next();
                        })
                        .catch((err) => {
                            next(err);
                        });
                    }, (err) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve();
                        }
                    });
                });
            })
            .then(() => {
                res.send(results);
            })
            .catch((err) => {
                res.AD.error(err);
            });
            
        }
        else {
            res.send({});
        }
    }
    
};

