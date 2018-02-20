module.exports = function(req, res, next) {
    
    // CAS eaguid
    var viewerGUID = req.user.GUID();
    
    // Fetch the staff's renGUID & renID
    LHRISRen.query(`
        
        SELECT
            ren.ren_guid, ren.ren_id
        FROM
            hris_perm_access AS access
            JOIN hris_ren_data AS ren
                ON access.ren_id = ren.ren_id
        WHERE
            access.viewer_guid = ?
        
    `, [viewerGUID], (err, list) => {
        if (err) next(err);
        else if (!list || !list[0]) {
            res.status(404).send('Could not find your HRIS info');
        }
        else {
            req.sdc = req.sdc || {};
            req.sdc.renGUID = list[0].ren_guid;
            req.sdc.renID = list[0].ren_id;
                        
            next();
        }
    });
    
};