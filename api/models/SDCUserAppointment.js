/**
 * SDCUserAppointment
 * @module      :: Model
 */

var async = require('async');
var _ = require('lodash');

module.exports = {
    
    tableName: 'sdc_user_appointment',
    
    autoCreatedAt: false,
    autoUpdatedAt: false,
    autoPK: false,
    migrate: 'alter',
    
    attributes: {
        id: {
            type: 'integer',
            size: 11,
            primaryKey: true,
            autoIncrement: false,
        },
        
        user: {
            type: 'text',
        },
        
        status: {
            type: 'string',
            size: 16
        },
        
        appointment: {
            model: 'sdcappointment'
        }
        
    },
    
    ////
    //// Life cycle callbacks
    ////
    
    
    
    ////
    //// Model class methods
    ////
    
    /**
     * @param {Array} list
     * @return {Promise}
     */
    importData: function(list) {
        return new Promise((resolve, reject) => {
            async.eachSeries(list, (row, next) => {
                
                SDCUserAppointment.query(`
                    REPLACE INTO sdc_user_appointment
                    SET
                        id = ?,
                        user = ?,
                        appointment = ?,
                        status = ?
                `, [row.id, row.user, row.appointment, row.status], (err) => {
                    if (err) next(err);
                    else next();
                });
                
            }, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    },
    
    
    
    findByDate: function(startDate, endDate) {
        return new Promise((resolve, reject) => {
            
            startDate = startDate || 0;
            endDate = endDate || Date.now();
            
            SDCUserAppointment.query(`
                
                SELECT
                    ua.user, ua.status,
                    a.session, a.date
                FROM
                    sdc_user_appointment ua
                    JOIN sdc_appointment a
                        ON ua.appointment = a.id
                WHERE
                    a.date >= ?
                    AND a.date <= ?
                
            `, [startDate, endDate], (err, list=[]) => {
                if (err) reject(err);
                else {
                    resolve(list);
                }
            });
        });
    }
    

};
