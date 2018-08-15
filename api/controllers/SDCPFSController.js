/**
 * SDCPFSController
 *
 */


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
    
};

