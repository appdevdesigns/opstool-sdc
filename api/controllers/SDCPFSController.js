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
     * GET /opstool-sdc/SDCPFS/myCurrentPFS/
     *
     * Fetches PFS data for current user & also their coachees.
     *
     * {
     *      me: {
     *          pfs: { ... },
     *          myRen: { ... },
     *          coachRen: { ... }
     *      },
     *      coachees: {
     *          <coachee ren_id>: {
     *              pfs: { ... },
     *              myRen: { ... },
     *              coachRen: { ... }
     *          },
     *          ...
     *      }
     * }
     */
    myCurrentPFS(req, res) {
        var renID = req.user.userModel.ren_id;
        if (renID) {
            
            var myData = {};
            var coacheesData = {};
            
            // Fetch my PFS data
            SDCPFS.currentPFS(renID)
            .then((data) => {
                myData = data;
                
                // Find coachees renIDs
                return SDCPFS.coachees(renID);
            })
            
            // Fetch PFS data for each coachee
            .then((coacheeRenIDs) => {
                return new Promise((resolve, reject) => {
                    async.eachSeries(coacheeRenIDs, (renID, next) => {
                        SDCPFS.currentPFS(renID)
                        .then((data) => {
                            coacheesData[renID] = data;
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
                res.send({
                    me: myData,
                    coachees: coacheesData
                });
            })
            .catch((err) => {
                res.AD.error(err);
            });
        }
        else {
            res.send({});
        }
    },
    
        
};

